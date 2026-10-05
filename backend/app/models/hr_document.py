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


class HRSubmissionSource(str, Enum):
    """Who supplied the current document content.

    ``hr``       — uploaded/replaced by HR staff (auto-approved).
    ``employee`` — submitted by the employee through My HR self-service
                   (requires HR review).
    """

    HR = "hr"
    EMPLOYEE = "employee"


class HRReviewStatus(str, Enum):
    """Approval state — kept separate from the stored ``active/archived``
    lifecycle so the two never conflict.

    ``pending``  — employee submission awaiting HR review.
    ``approved`` — reviewed/approved (HR uploads are always approved).
    ``rejected`` — rejected by HR with ``review_note``.
    """

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


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
    # Employees may submit this type themselves from My HR (self-service).
    employee_upload_allowed: bool = False
    # Set by the idempotent seed-defaults repair the first time it enables a
    # standard code. After that moment, an explicit ``False`` (recorded via a
    # later ``updated_at``) is always treated as an HR decision and preserved.
    employee_upload_defaults_repaired_at: Optional[datetime] = None
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

    # ── Review workflow (separate from status lifecycle above) ──────────────
    # Mirrors the CURRENT version's review state so list/filter queries never
    # need a join. Each HRDocumentVersion keeps its own copy for history.
    submission_source: Optional[HRSubmissionSource] = None
    review_status: Optional[HRReviewStatus] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None

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

    # Review outcome at the time this version was current (per-version history:
    # V1 rejected → V2 pending → V2 approved stays auditable forever).
    submission_source: Optional[HRSubmissionSource] = None
    review_status: Optional[HRReviewStatus] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None

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


class HRRequestRequirementLevel(str, Enum):
    """Whether the employee must eventually provide the document."""
    MANDATORY = "mandatory"
    OPTIONAL = "optional"


class HRRequestPriority(str, Enum):
    """Operational urgency — separate from mandatory/optional."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class HRRequestStatus(str, Enum):
    """Lifecycle status of a document request."""
    PENDING = "pending"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class HRDocumentRequest(Document):
    """HR-initiated request for an employee to provide a specific document.

    A request is NOT a document — it is a distinct entity that may later be
    fulfilled by an employee upload (linked via ``fulfilled_document_id``).
    """

    company_id: Indexed(str)
    employee_id: Indexed(str)

    document_type_id: Optional[str] = None
    document_type_name: str

    requirement_level: HRRequestRequirementLevel = HRRequestRequirementLevel.MANDATORY
    priority: HRRequestPriority = HRRequestPriority.NORMAL
    instructions: Optional[str] = None
    due_date: Optional[datetime] = None

    status: HRRequestStatus = HRRequestStatus.PENDING

    requested_by: str  # User ID of the HR/Admin who made the request
    requested_at: datetime = Field(default_factory=utc_now)

    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None

    fulfilled_document_id: Optional[str] = None  # HRDocument.id once uploaded

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "hr_document_requests"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("document_type_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("due_date", ASCENDING)]),
            IndexModel([("employee_id", ASCENDING), ("status", ASCENDING)]),
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
