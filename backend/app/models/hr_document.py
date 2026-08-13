"""
HR Document Management Models — Phase 2 HRMS.

The HR Document domain is a metadata/business layer over the existing SynTask
file storage (``app.services.file_service`` / Cloudinary). No second storage
system is introduced — each ``HRDocumentVersion`` references the exact stored
file through the repository conventions used by Recruitment (``storage_*``
fields mirror the ``Resume`` model).

Ownership model: a document has EXACTLY ONE logical owner, expressed as either
``employee_id`` or ``candidate_id`` (never both, never neither for ordinary
documents). The backend service enforces this invariant; the unique index on
``owner_key`` is the database backstop.

Conventions follow the rest of the repository:
- ``company_id`` is always scoped; every query filters by it.
- Naive-UTC datetimes via ``app.core.clock.utc_now``.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel

from app.core.clock import utc_now


class HROwnerType(str, Enum):
    EMPLOYEE = "employee"
    CANDIDATE = "candidate"


class HRDocumentVisibility(str, Enum):
    """Controlled visibility — employees see only ``EMPLOYEE_VISIBLE`` docs.

    ``HR_ONLY`` documents (confidential HR notes, salary/tax attachments, ...)
    are never exposed through the employee self-service surface.
    """

    EMPLOYEE_VISIBLE = "employee_visible"
    HR_ONLY = "hr_only"


class HRDocumentStatus(str, Enum):
    """Stored lifecycle status. Expiry state is DERIVED from ``expiry_date``.

    Keeping only ``active``/``archived`` as stored state avoids two conflicting
    sources of truth for the same document.
    """

    ACTIVE = "active"
    ARCHIVED = "archived"


class HROwnerScope(str, Enum):
    """Which owner kinds a document type applies to."""

    EMPLOYEE = "employee"
    CANDIDATE = "candidate"
    BOTH = "both"


class HRDocumentType(Document):
    """Company-scoped configurable HR document type.

    Default types are seeded idempotently per company (never a hard-coded enum
    on the document). Deactivation uses ``active=False`` so historical
    documents keep their type reference intact.
    """

    company_id: Indexed(str)
    name: str
    code: Indexed(str)
    description: Optional[str] = None
    owner_scope: HROwnerScope = HROwnerScope.BOTH
    required: bool = False
    expiry_supported: bool = True
    default_visibility: HRDocumentVisibility = HRDocumentVisibility.EMPLOYEE_VISIBLE
    active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "hr_document_types"
        indexes = [
            # One code per company; seeding is idempotent against this index.
            IndexModel([("company_id", ASCENDING), ("code", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("active", ASCENDING)]),
        ]


class HRDocument(Document):
    """One HR document owned by exactly one employee or candidate."""

    company_id: Indexed(str)
    # Exactly one logical owner: employee_id XOR candidate_id.
    employee_id: Optional[str] = None
    candidate_id: Optional[str] = None
    # Canonical owner key for indexed lookups (employee:<id> | candidate:<id>).
    owner_key: Optional[str] = None

    document_type_id: Optional[str] = None
    # The active version (metadata never duplicated on the document itself).
    current_version_id: Optional[str] = None
    current_version_number: int = 0

    status: HRDocumentStatus = HRDocumentStatus.ACTIVE
    # Date-based expiry (stored at midnight UTC so an "expires Aug 31" document
    # does not expire early from a naive UTC timestamp comparison).
    expiry_date: Optional[datetime] = None
    description: Optional[str] = None
    visibility: HRDocumentVisibility = HRDocumentVisibility.EMPLOYEE_VISIBLE

    uploaded_by: Optional[str] = None
    archived_at: Optional[datetime] = None
    archived_by: Optional[str] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "hr_documents"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("owner_key", ASCENDING), ("status", ASCENDING), ("created_at", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("document_type_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("expiry_date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", ASCENDING)]),
        ]


class HRDocumentVersion(Document):
    """A single stored file revision of an ``HRDocument``.

    ``version_number`` is unique per document (concurrent replacements cannot
    produce duplicate version numbers). Historical versions are never deleted:
    replacing a document only adds a version.
    """

    company_id: Indexed(str)
    document_id: Indexed(str)
    version_number: int

    original_filename: str
    mime_type: str
    file_size: int

    # Storage references — same conventions as ``Resume``/``RecruitmentAttachment``.
    storage_provider: str = "local"  # "local" | "cloudinary"
    storage_reference: Optional[str] = None  # relative path under UPLOAD_DIR, or Cloudinary public_id
    storage_url: Optional[str] = None
    storage_resource_type: Optional[str] = None
    storage_delivery_type: Optional[str] = None
    checksum: Optional[str] = None

    uploaded_by: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=utc_now)
    change_note: Optional[str] = None

    class Settings:
        name = "hr_document_versions"
        indexes = [
            IndexModel(
                [("document_id", ASCENDING), ("version_number", ASCENDING)],
                unique=True,
            ),
            IndexModel([("company_id", ASCENDING), ("document_id", ASCENDING), ("uploaded_at", ASCENDING)]),
        ]


def build_owner_key(employee_id: Optional[str] = None, candidate_id: Optional[str] = None) -> Optional[str]:
    """Build the canonical owner key for exactly-one-owner documents."""
    if employee_id and candidate_id:
        raise ValueError("A document cannot have both an employee and a candidate owner")
    if employee_id:
        return f"employee:{employee_id}"
    if candidate_id:
        return f"candidate:{candidate_id}"
    return None
