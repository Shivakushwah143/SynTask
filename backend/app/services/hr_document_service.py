"""
HR Document Service — Phase 2 HRMS.

The metadata/business layer over the existing SynTask file storage:

    Employee / Candidate
            ↓
        HRDocument  (metadata: owner, type, visibility, expiry, status)
            ↓
    HRDocumentVersion  (stored file reference + history)
            ↓
    Existing FileService / Cloudinary storage

Security invariants are enforced HERE (backend authoritative — the frontend can
never bypass them by constructing storage URLs):
- company scoping on every operation (``document.company_id == actor company``);
- exactly one logical owner (employee XOR candidate);
- employee self-service only for their own, employee-visible, active documents;
- every preview/download/version-history/delete/replace path re-authorizes.
"""
import hashlib
import logging
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, UploadFile, status
from pymongo import ReturnDocument
from urllib.parse import quote

from app.api.v1.endpoints.files import resolve_upload_path
from app.core.clock import utc_now
from app.models.department import Department, DepartmentType
from app.models.employee_profile import EmployeeProfile
from app.models.hr_document import (
    HRDocument,
    HRDocumentRequest,
    HRDocumentType,
    HRDocumentVersion,
    HRDocumentStatus,
    HRDocumentVisibility,
    HRRequestPriority,
    HRRequestRequirementLevel,
    HRRequestStatus,
    HRReviewStatus,
    HRSubmissionSource,
    HROwnerScope,
    build_owner_key,
)
from app.models.user import User, UserRole
from app.recruitment.models import Candidate
from app.services.cloudinary_storage import CloudinaryStorage
from app.services.file_service import FileService

logger = logging.getLogger(__name__)

# Centralized expiry threshold — one magic number for frontend + backend.
EXPIRING_SOON_DAYS = 30

# HR document file types: PDF, JPEG, PNG (+ DOC/DOCX — already handled by the
# app for resumes/offers). No arbitrary executables.
HR_ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"}
HR_ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

STORAGE_SCOPE = "hr/documents"
STORAGE_URL_PREFIX = "/uploads/hr_documents"

# Default document type codes employees may submit through My HR self-service.
# HR can toggle ``employee_upload_allowed`` per type from HR Settings; these
# codes only seed the default on-boarding (identity/self-declared documents).
EMPLOYEE_UPLOADABLE_DEFAULT_CODES = {
    "resume",
    "aadhaar",
    "pan",
    "passport",
    "driving_license",
    "educational_certificate",
    "experience_letter",
}


# =============================================================================
# Review-state normalization (legacy rows predate the review workflow)
# =============================================================================


def review_status_value(value: Optional[HRReviewStatus]) -> str:
    """Normalize a stored review status for serialization.

    Legacy documents (pre-review workflow) carry no review fields — they were
    uploaded by HR, so they read back as ``approved``/``hr``.
    """
    if isinstance(value, HRReviewStatus):
        return value.value
    return value or HRReviewStatus.APPROVED.value


def submission_source_value(value: Optional[HRSubmissionSource]) -> str:
    """Normalize a stored submission source (legacy rows default to HR)."""
    if isinstance(value, HRSubmissionSource):
        return value.value
    return value or HRSubmissionSource.HR.value


# =============================================================================
# Expiry calculation (one source of truth)
# =============================================================================


def compute_expiry_state(
    expiry_date: Optional[datetime],
    *,
    today: Optional[object] = None,
    expiring_soon_days: int = EXPIRING_SOON_DAYS,
) -> str:
    """Derive the expiry state for a document.

    ``expiry_date`` is date-based (stored at midnight UTC). Returns one of
    ``no_expiry``, ``valid``, ``expiring_soon``, ``expired``.
    """
    if expiry_date is None:
        return "no_expiry"
    today = today or utc_now().date()
    expiry = expiry_date.date() if isinstance(expiry_date, datetime) else expiry_date
    if expiry < today:
        return "expired"
    if expiry <= today + timedelta(days=expiring_soon_days):
        return "expiring_soon"
    return "valid"


def parse_expiry_date(value: Optional[str]) -> Optional[datetime]:
    """Parse a ``YYYY-MM-DD`` expiry into a midnight-UTC datetime.

    Uses date semantics so an "expires Aug 31" document stays valid through
    Aug 31 regardless of the exact UTC instant compared.
    """
    if value is None or value == "":
        return None
    try:
        parsed = datetime.strptime(str(value).strip(), "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiry date must be in YYYY-MM-DD format",
        ) from exc
    return parsed.replace(hour=0, minute=0, second=0, microsecond=0)


# =============================================================================
# Permission helpers (shared with the endpoint dependencies)
# =============================================================================


def _role(user: User) -> UserRole:
    return user.role if isinstance(user.role, UserRole) else UserRole.from_legacy(str(user.role))


async def _is_company_admin(user: User) -> bool:
    return _role(user) in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN)


async def _is_hr_department(user: User) -> bool:
    if not user.company_id or not user.department_id:
        return False
    department = await Department.get(user.department_id)
    return bool(
        department
        and department.company_id == user.company_id
        and department.deleted_at is None
        and department.department_type == DepartmentType.HR
    )


async def _has_capability(user: User, capability: str) -> bool:
    from app.models.capability import get_capabilities_for_role

    if not user.company_id or not user.department_id:
        return False
    department = await Department.get(user.department_id)
    if not department or department.company_id != user.company_id or department.deleted_at is not None:
        return False
    allowed = await get_capabilities_for_role(
        department.department_type, user.role, user.company_id
    )
    return capability in allowed


async def has_hr_directory_view(user: User) -> bool:
    """View access to company HR data: company admins + managers + HR dept staff."""
    if await _is_company_admin(user):
        return True
    if _role(user) == UserRole.MANAGER:
        return True
    if await _is_hr_department(user):
        return await _has_capability(user, "employee_management.view")
    return False


async def has_hr_manage(user: User) -> bool:
    """Manage access: company admins + HR dept staff with the manage capability."""
    if await _is_company_admin(user):
        return True
    if await _is_hr_department(user):
        return await _has_capability(user, "employee_management.manage")
    return False


async def _actor_employee_profile(company_id: str, user: User) -> Optional[EmployeeProfile]:
    return await EmployeeProfile.find_one({"company_id": company_id, "user_id": str(user.id)})


async def _require_company_document_view(company_id: str, actor: User) -> None:
    """Coarse gate: caller must be able to view company HR documents."""
    if await has_hr_directory_view(actor):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to view HR documents",
    )


async def _require_document_access(
    company_id: str,
    document: HRDocument,
    actor: User,
    *,
    manage: bool = False,
) -> None:
    """Fine-grained per-document authorization (backend authoritative)."""
    if document.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # HR / admin path — full company document access.
    if await has_hr_directory_view(actor):
        if manage and not await has_hr_manage(actor):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to manage this document",
            )
        return

    # Employee self-service: only their own employee-visible, active document,
    # and only view/preview/download (never manage).
    if manage:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage this document",
        )
    if not document.employee_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this document",
        )
    if document.status != HRDocumentStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this document",
        )
    if document.visibility != HRDocumentVisibility.EMPLOYEE_VISIBLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this document",
        )
    profile = await _actor_employee_profile(company_id, actor)
    if not profile or str(profile.id) != document.employee_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this document",
        )


# =============================================================================
# Owner resolution
# =============================================================================


async def _resolve_owner(
    company_id: str,
    *,
    employee_id: Optional[str] = None,
    candidate_id: Optional[str] = None,
) -> tuple[dict, str]:
    """Validate exactly-one-owner and return (owner_meta, owner_key)."""
    if bool(employee_id) == bool(candidate_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exactly one owner (employee or candidate) is required",
        )
    if employee_id:
        profile = await EmployeeProfile.get(employee_id)
        if not profile or profile.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
        return {"owner_type": "employee", "profile": profile}, build_owner_key(employee_id=employee_id)
    candidate = await Candidate.get(candidate_id)
    if not candidate or candidate.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return {"owner_type": "candidate", "candidate": candidate}, build_owner_key(candidate_id=candidate_id)


async def _require_employee_profile(company_id: str, actor: User) -> EmployeeProfile:
    """Self-service identity resolution — never trusts a client-supplied id."""
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile is not available for this account.",
        )
    profile = await _actor_employee_profile(company_id, actor)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile is not available for this account.",
        )
    return profile


def _apply_expiry_filter(query: dict, expiry_state: Optional[str]) -> None:
    """In-place expiry-state filter shared by every document list path."""
    if not expiry_state:
        return
    today = utc_now().date()
    day_start = datetime(today.year, today.month, today.day)
    if expiry_state == "no_expiry":
        query["expiry_date"] = None
    elif expiry_state == "expired":
        query["expiry_date"] = {"$lte": day_start}
    elif expiry_state == "expiring_soon":
        end = day_start + timedelta(days=EXPIRING_SOON_DAYS, seconds=86399)
        query["expiry_date"] = {"$gte": day_start, "$lte": end}
    elif expiry_state == "valid":
        start = day_start + timedelta(days=EXPIRING_SOON_DAYS + 1)
        query["expiry_date"] = {"$gt": start}


async def _resolve_document_type(company_id: str, document_type_id: str, *, owner_type: str) -> HRDocumentType:
    doc_type = await HRDocumentType.get(document_type_id)
    if not doc_type:
        doc_type = await HRDocumentType.find_one({"company_id": company_id, "code": document_type_id})
    if not doc_type or doc_type.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document type not found")
    if not doc_type.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This document type is inactive")
    scope = doc_type.owner_scope
    if scope == HROwnerScope.EMPLOYEE and owner_type != "employee":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This document type is for employees only")
    if scope == HROwnerScope.CANDIDATE and owner_type != "candidate":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This document type is for candidates only")
    return doc_type


# =============================================================================
# File validation + storage (reuses existing FileService — no new storage system)
# =============================================================================


def _validate_hr_file(content: bytes, filename: str) -> str:
    file_ext = Path(filename or "").suffix.lower()
    if file_ext not in HR_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type is not supported. Allowed types: PDF, JPG, PNG, DOC, DOCX",
        )
    detected_mime = FileService.detect_mime_type(content, filename)
    if detected_mime not in HR_ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type is not supported. Allowed types: PDF, JPG, PNG, DOC, DOCX",
        )
    return detected_mime


async def _store_hr_file(file: UploadFile) -> dict:
    """Store an uploaded HR file through the existing storage service."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    detected_mime = _validate_hr_file(content, file.filename or "")

    upload = UploadFile(filename=Path(file.filename or "document").name, file=BytesIO(content))
    stored = await FileService.store_uploaded_file(
        upload,
        upload_dir=FileService.resolve_upload_dir() / "hr_documents",
        url_prefix=STORAGE_URL_PREFIX,
        scope=STORAGE_SCOPE,
        sensitive=True,
    )
    stored["mime_type"] = detected_mime
    stored["file_size"] = len(content)
    stored["checksum"] = hashlib.sha256(content).hexdigest()
    return stored


def _build_version_from_stored(stored: dict, *, company_id: str, document_id: str, version_number: int, uploaded_by: Optional[str], change_note: Optional[str]) -> HRDocumentVersion:
    if stored.get("cloudinary_public_id"):
        provider = "cloudinary"
        reference = stored["cloudinary_public_id"]
        resource_type = stored.get("cloudinary_resource_type")
        delivery_type = stored.get("cloudinary_delivery_type")
    else:
        provider = "local"
        upload_dir = FileService.resolve_upload_dir()
        try:
            reference = str(Path(stored["file_path"]).resolve().relative_to(upload_dir.resolve()))
        except ValueError:
            reference = Path(stored["file_path"]).name
        resource_type = None
        delivery_type = None
    return HRDocumentVersion(
        company_id=company_id,
        document_id=document_id,
        version_number=version_number,
        original_filename=stored["filename"] or "document",
        mime_type=stored["mime_type"],
        file_size=stored["file_size"],
        storage_provider=provider,
        storage_reference=reference,
        storage_url=stored.get("file_url"),
        storage_resource_type=resource_type,
        storage_delivery_type=delivery_type,
        checksum=stored.get("checksum"),
        uploaded_by=uploaded_by,
        uploaded_at=utc_now(),
        change_note=change_note,
    )


async def _delete_stored_file(version: HRDocumentVersion) -> None:
    """Best-effort storage cleanup for failed metadata writes."""
    try:
        if version.storage_provider == "cloudinary" and version.storage_reference:
            CloudinaryStorage.delete(
                version.storage_reference,
                version.storage_resource_type or "image",
                version.storage_delivery_type or "authenticated",
            )
        elif version.storage_reference:
            path = resolve_upload_path(FileService.resolve_upload_dir(), version.storage_reference)
            if path.exists() and path.is_file():
                path.unlink()
    except Exception:
        logger.exception("Failed to clean up stored HR document file")


# =============================================================================
# Document types
# =============================================================================

DEFAULT_DOCUMENT_TYPES: list[dict] = [
    {"name": "Resume", "code": "resume", "required": True, "expiry_supported": False, "owner_scope": "both", "default_visibility": "employee_visible"},
    {"name": "Aadhaar Card", "code": "aadhaar", "required": True, "expiry_supported": True, "owner_scope": "employee", "default_visibility": "employee_visible"},
    {"name": "PAN Card", "code": "pan", "required": True, "expiry_supported": False, "owner_scope": "employee", "default_visibility": "employee_visible"},
    {"name": "Passport", "code": "passport", "required": False, "expiry_supported": True, "owner_scope": "employee", "default_visibility": "employee_visible"},
    {"name": "Driving License", "code": "driving_license", "required": False, "expiry_supported": True, "owner_scope": "employee", "default_visibility": "employee_visible"},
    {"name": "Educational Certificate", "code": "educational_certificate", "required": False, "expiry_supported": False, "owner_scope": "employee", "default_visibility": "employee_visible"},
    {"name": "Experience Letter", "code": "experience_letter", "required": False, "expiry_supported": False, "owner_scope": "employee", "default_visibility": "employee_visible"},
    {"name": "Offer Letter", "code": "offer_letter", "required": False, "expiry_supported": False, "owner_scope": "both", "default_visibility": "employee_visible"},
    {"name": "Appointment Letter", "code": "appointment_letter", "required": False, "expiry_supported": False, "owner_scope": "employee", "default_visibility": "employee_visible"},
    {"name": "Joining Document", "code": "joining_document", "required": True, "expiry_supported": False, "owner_scope": "employee", "default_visibility": "employee_visible"},
    {"name": "Bank Document", "code": "bank_document", "required": True, "expiry_supported": False, "owner_scope": "employee", "default_visibility": "hr_only"},
    {"name": "Salary Document", "code": "salary_document", "required": False, "expiry_supported": False, "owner_scope": "employee", "default_visibility": "hr_only"},
    {"name": "Tax Document", "code": "tax_document", "required": False, "expiry_supported": False, "owner_scope": "employee", "default_visibility": "hr_only"},
    {"name": "Other", "code": "other", "required": False, "expiry_supported": True, "owner_scope": "both", "default_visibility": "employee_visible"},
]

for _spec in DEFAULT_DOCUMENT_TYPES:
    _spec["employee_upload_allowed"] = _spec["code"] in EMPLOYEE_UPLOADABLE_DEFAULT_CODES


async def ensure_default_document_types(company_id: str, *, actor_id: Optional[str] = None) -> int:
    """Idempotently seed the default document types for a company.

    Safe to run on every startup/list call: missing codes are inserted, existing
    codes are never duplicated or overwritten. After seeding, a repair pass
    backfills ``employee_upload_allowed`` on legacy rows (created before the
    self-service field existed, or seeded with an explicit False before the
    employee-uploadable default codes were defined).
    """
    created = 0
    existing = {
        doc_type.code
        for doc_type in await HRDocumentType.find({"company_id": company_id}).to_list()
    }
    for spec in DEFAULT_DOCUMENT_TYPES:
        if spec["code"] in existing:
            continue
        doc_type = HRDocumentType(
            company_id=company_id,
            name=spec["name"],
            code=spec["code"],
            owner_scope=HROwnerScope(spec["owner_scope"]),
            required=spec["required"],
            expiry_supported=spec["expiry_supported"],
            default_visibility=HRDocumentVisibility(spec["default_visibility"]),
            employee_upload_allowed=bool(spec.get("employee_upload_allowed", False)),
            created_by=actor_id,
        )
        await doc_type.insert()
        created += 1
    await backfill_employee_upload_defaults(company_id)
    return created


def _row_needs_upload_repair(row: HRDocumentType, uploadable_codes: set[str]) -> bool:
    """Dry-run predicate mirroring the per-row repair in
    ``backfill_employee_upload_defaults`` (no writes)."""
    current = row.employee_upload_allowed
    repaired_at = row.employee_upload_defaults_repaired_at
    is_uploadable_code = row.code in uploadable_codes
    has_value = bool(row.model_fields_set) and "employee_upload_allowed" in row.model_fields_set and current is not None
    if is_uploadable_code:
        edited_after_repair = repaired_at is not None and (row.updated_at or utc_now()) > repaired_at
        return (not has_value or current is False) and not edited_after_repair
    return not has_value


async def backfill_employee_upload_defaults(
    company_id: Optional[str] = None,
    *,
    dry_run: bool = False,
) -> int:
    """Repair ``employee_upload_allowed`` on seeded document types (idempotent).

    Why this exists: rows created before the employee self-service feature carry
    no ``employee_upload_allowed`` value (Beanie reads them as ``False``), and
    rows seeded while the feature shipped carried an explicit ``False`` before
    the employee-uploadable default codes were defined. Both states disable
    “Upload Document” in My HR until HR manually edits every type.

    Repair rule — standard codes are enabled EXACTLY ONCE, then HR decisions
    are permanent:

    - Standard identity/self-declared codes (see
      ``EMPLOYEE_UPLOADABLE_DEFAULT_CODES``) that are missing/null/False are set
      to ``True`` unless the row was already repaired (``updated_at`` recorded
      after ``employee_upload_defaults_repaired_at``). The first repair stamps
      ``employee_upload_defaults_repaired_at``; a later explicit HR toggle
      writes a newer ``updated_at`` and is never overridden again. Explicit
      ``True`` is never touched.
    - All other codes only get the field defaulted to ``False`` when it is
      missing/null (an explicit value is preserved).

    Returns the number of rows repaired (or that would be repaired with
    ``dry_run=True``). Failures are logged, never raised — this runs on the
    document-type list / My HR status paths and must not break reads.
    """
    uploadable_codes = set(EMPLOYEE_UPLOADABLE_DEFAULT_CODES)
    scope = {"company_id": company_id} if company_id else {}
    try:
        # Row-by-row repair instead of update_many: MongoDB Atlas free tier
        # (M0) rejects update space estimation when the filter uses $expr or
        # $exists, so bulk updates with those operators fail in production.
        # A company has ~14 seeded types, so per-row reads/writes are cheap and
        # portable to every MongoDB deployment.
        rows = await HRDocumentType.find(scope).to_list()
        if dry_run:
            return sum(1 for row in rows if _row_needs_upload_repair(row, uploadable_codes))
        now = utc_now()
        repaired = 0
        for row in rows:
            current = row.employee_upload_allowed
            repaired_at = row.employee_upload_defaults_repaired_at
            is_uploadable_code = row.code in uploadable_codes
            # Value missing/null reads back as the model default False.
            has_value = row.model_fields_set and "employee_upload_allowed" in row.model_fields_set and current is not None
            if is_uploadable_code:
                # Standard codes are enabled exactly once (missing/null/False)
                # unless HR already toggled after the system repair stamp.
                edited_after_repair = repaired_at is not None and (
                    row.updated_at or utc_now()
                ) > repaired_at
                if (not has_value or current is False) and not edited_after_repair:
                    row.employee_upload_allowed = True
                    row.employee_upload_defaults_repaired_at = now
                    row.updated_at = now
                    await row.save()
                    repaired += 1
            elif not has_value:
                # Other codes: explicit default False only when missing/null.
                row.employee_upload_allowed = False
                row.updated_at = now
                await row.save()
                repaired += 1
        return repaired
    except Exception:
        logger.exception("Failed to backfill employee_upload_allowed defaults")
        return 0


async def list_document_types(company_id: str, *, active_only: bool = True, include_inactive: bool = False) -> list[HRDocumentType]:
    query: dict = {"company_id": company_id}
    if active_only and not include_inactive:
        query["active"] = True
    return await HRDocumentType.find(query).sort("name").to_list()


async def create_document_type(company_id: str, actor: User, data: dict) -> HRDocumentType:
    existing = await HRDocumentType.find_one({"company_id": company_id, "code": data["code"]})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A document type with this code already exists")
    doc_type = HRDocumentType(
        company_id=company_id,
        name=data["name"],
        code=data["code"],
        description=data.get("description"),
        owner_scope=data.get("owner_scope", HROwnerScope.BOTH),
        required=bool(data.get("required", False)),
        expiry_supported=bool(data.get("expiry_supported", True)),
        default_visibility=data.get("default_visibility", HRDocumentVisibility.EMPLOYEE_VISIBLE),
        employee_upload_allowed=bool(data.get("employee_upload_allowed", False)),
        created_by=str(actor.id),
    )
    await doc_type.insert()
    await _record_document_event(company_id, "HRDocumentTypeCreated", actor, doc_type, {"document_type_id": str(doc_type.id), "code": doc_type.code})
    return doc_type


async def update_document_type(company_id: str, document_type_id: str, actor: User, data: dict) -> HRDocumentType:
    doc_type = await HRDocumentType.get(document_type_id)
    if not doc_type or doc_type.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document type not found")
    for field in ("name", "description", "owner_scope", "required", "expiry_supported", "default_visibility", "employee_upload_allowed", "active"):
        if data.get(field) is not None:
            setattr(doc_type, field, data[field])
    doc_type.updated_at = utc_now()
    await doc_type.save()
    await _record_document_event(company_id, "HRDocumentTypeUpdated", actor, doc_type, {"document_type_id": str(doc_type.id)})
    return doc_type


async def deactivate_document_type(company_id: str, document_type_id: str, actor: User) -> HRDocumentType:
    """Soft-delete: never physically delete a referenced type (breaks history)."""
    doc_type = await HRDocumentType.get(document_type_id)
    if not doc_type or doc_type.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document type not found")
    doc_type.active = False
    doc_type.updated_at = utc_now()
    await doc_type.save()
    await _record_document_event(company_id, "HRDocumentTypeDeactivated", actor, doc_type, {"document_type_id": str(doc_type.id)})
    return doc_type


# =============================================================================
# Serialization
# =============================================================================


async def _resolve_names_batch(company_id: str, user_ids: set[str]) -> dict[str, User]:
    ids = [ObjectId(uid) for uid in user_ids if ObjectId.is_valid(uid)]
    if not ids:
        return {}
    fetched = await User.find({"company_id": company_id, "_id": {"$in": ids}}).to_list()
    return {str(user.id): user for user in fetched}


async def serialize_document_type(doc_type: HRDocumentType) -> dict:
    return {
        "id": str(doc_type.id),
        "company_id": doc_type.company_id,
        "name": doc_type.name,
        "code": doc_type.code,
        "description": doc_type.description,
        "owner_scope": doc_type.owner_scope.value if isinstance(doc_type.owner_scope, HROwnerScope) else doc_type.owner_scope,
        "required": doc_type.required,
        "expiry_supported": doc_type.expiry_supported,
        "default_visibility": doc_type.default_visibility.value if isinstance(doc_type.default_visibility, HRDocumentVisibility) else doc_type.default_visibility,
        "employee_upload_allowed": bool(doc_type.employee_upload_allowed),
        "active": doc_type.active,
        "created_by": doc_type.created_by,
        "created_at": doc_type.created_at,
        "updated_at": doc_type.updated_at,
    }


async def serialize_document(
    document: HRDocument,
    *,
    context: dict,
    can_manage: bool,
) -> dict:
    version = context.get("version_by_id", {}).get(document.current_version_id or "")
    doc_type = context.get("type_by_id", {}).get(document.document_type_id or "")
    uploader = context.get("user_by_id", {}).get(document.uploaded_by or "")
    reviewer = context.get("user_by_id", {}).get(document.reviewed_by or "")
    employee = context.get("employee_by_id", {}).get(document.employee_id or "")
    candidate = context.get("candidate_by_id", {}).get(document.candidate_id or "")

    version_count = context.get("version_counts", {}).get(str(document.id), document.current_version_number)
    uploader_name = uploader.full_name() if uploader else None
    reviewer_name = reviewer.full_name() if reviewer else None
    employee_name = employee.full_name() if employee else None
    candidate_name = candidate.full_name if candidate else None

    review_status = review_status_value(document.review_status)
    submission_source = submission_source_value(document.submission_source)
    # A document type must be active + employee-uploadable + employee-visible
    # for the OWNER to resubmit a rejected document from self-service.
    type_allows_employee_upload = bool(
        doc_type
        and doc_type.active
        and doc_type.employee_upload_allowed
        and doc_type.default_visibility == HRDocumentVisibility.EMPLOYEE_VISIBLE
    )
    can_resubmit = bool(
        not can_manage
        and document.employee_id
        and document.status == HRDocumentStatus.ACTIVE
        and review_status == HRReviewStatus.REJECTED.value
        and type_allows_employee_upload
    )

    return {
        "id": str(document.id),
        "company_id": document.company_id,
        "owner_type": "employee" if document.employee_id else ("candidate" if document.candidate_id else None),
        "employee_id": document.employee_id,
        "candidate_id": document.candidate_id,
        "employee_name": employee_name,
        "candidate_name": candidate_name,
        "document_type_id": document.document_type_id,
        "document_type": doc_type.name if doc_type else None,
        "document_type_code": doc_type.code if doc_type else None,
        "document_type_required": bool(doc_type.required if doc_type else False),
        "status": document.status.value if isinstance(document.status, HRDocumentStatus) else document.status,
        "review_status": review_status,
        "submission_source": submission_source,
        "reviewed_by": document.reviewed_by,
        "reviewed_by_name": reviewer_name,
        "reviewed_at": document.reviewed_at,
        "review_note": document.review_note,
        "expiry_date": document.expiry_date,
        "expiry_state": compute_expiry_state(document.expiry_date),
        "description": document.description,
        "visibility": document.visibility.value if isinstance(document.visibility, HRDocumentVisibility) else document.visibility,
        "current_version": document.current_version_number,
        "version_count": max(version_count, document.current_version_number),
        "filename": version.original_filename if version else None,
        "mime_type": version.mime_type if version else None,
        "file_size": version.file_size if version else None,
        "uploaded_by": document.uploaded_by,
        "uploaded_by_name": uploader_name,
        "uploaded_at": version.uploaded_at if version else document.created_at,
        "archived_at": document.archived_at,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
        "can_view": True,
        "can_manage": can_manage,
        "can_preview": bool(version) and (version.mime_type or "").startswith(("image/", "application/pdf")),
        "can_download": bool(version),
        "can_replace": can_manage and document.status == HRDocumentStatus.ACTIVE,
        "can_edit": can_manage,
        "can_archive": can_manage and document.status == HRDocumentStatus.ACTIVE,
        "can_review": can_manage and review_status == HRReviewStatus.PENDING.value and document.status == HRDocumentStatus.ACTIVE,
        "can_resubmit": can_resubmit,
    }


async def _build_list_context(company_id: str, documents: list[HRDocument]) -> dict:
    version_ids = {doc.current_version_id for doc in documents if doc.current_version_id}
    type_ids = {doc.document_type_id for doc in documents if doc.document_type_id}
    uploader_ids = {doc.uploaded_by for doc in documents if doc.uploaded_by}
    uploader_ids.update({doc.reviewed_by for doc in documents if doc.reviewed_by})
    employee_ids = {doc.employee_id for doc in documents if doc.employee_id}
    candidate_ids = {doc.candidate_id for doc in documents if doc.candidate_id}

    version_by_id: dict = {}
    if version_ids:
        ids = [ObjectId(vid) for vid in version_ids if ObjectId.is_valid(vid)]
        if ids:
            fetched = await HRDocumentVersion.find({"company_id": company_id, "_id": {"$in": ids}}).to_list()
            version_by_id = {str(v.id): v for v in fetched}

    type_by_id: dict = {}
    if type_ids:
        ids = [ObjectId(tid) for tid in type_ids if ObjectId.is_valid(tid)]
        if ids:
            fetched = await HRDocumentType.find({"company_id": company_id, "_id": {"$in": ids}}).to_list()
            type_by_id = {str(t.id): t for t in fetched}

    user_by_id: dict = {}
    if uploader_ids:
        user_by_id = await _resolve_names_batch(company_id, uploader_ids)

    employee_by_id: dict = {}
    if employee_ids:
        ids = [ObjectId(eid) for eid in employee_ids if ObjectId.is_valid(eid)]
        if ids:
            fetched = await EmployeeProfile.find({"company_id": company_id, "_id": {"$in": ids}}).to_list()
            user_ids = {profile.user_id for profile in fetched}
            users = await _resolve_names_batch(company_id, user_ids)
            employee_by_id = {
                str(profile.id): users.get(profile.user_id)
                for profile in fetched
                if users.get(profile.user_id)
            }

    candidate_by_id: dict = {}
    if candidate_ids:
        ids = [ObjectId(cid) for cid in candidate_ids if ObjectId.is_valid(cid)]
        if ids:
            fetched = await Candidate.find({"company_id": company_id, "_id": {"$in": ids}}).to_list()
            candidate_by_id = {str(c.id): c for c in fetched}

    # Version counts (batch) for accurate history indicators.
    # HRDocumentVersion.document_id is stored as str — query with strings, not ObjectId.
    version_counts: dict = {}
    if documents:
        doc_id_strs = [str(doc.id) for doc in documents if doc.id]
        if doc_id_strs:
            pipeline = [
                {"$match": {"document_id": {"$in": doc_id_strs}}},
                {"$group": {"_id": "$document_id", "count": {"$sum": 1}}},
            ]
            for row in await HRDocumentVersion.get_pymongo_collection().aggregate(pipeline).to_list(length=None):
                version_counts[str(row["_id"])] = row["count"]

    return {
        "version_by_id": version_by_id,
        "type_by_id": type_by_id,
        "user_by_id": user_by_id,
        "employee_by_id": employee_by_id,
        "candidate_by_id": candidate_by_id,
        "version_counts": version_counts,
    }


# =============================================================================
# Documents — list / detail / upload
# =============================================================================


async def list_documents(
    company_id: str,
    actor: User,
    *,
    employee_id: Optional[str] = None,
    candidate_id: Optional[str] = None,
    owner_type: Optional[str] = None,
    document_type_id: Optional[str] = None,
    expiry_state: Optional[str] = None,
    status_filter: Optional[str] = None,
    visibility: Optional[str] = None,
    review_status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    """Company-scoped document list with backend filters + pagination.

    Metadata only — file contents are never loaded while listing.
    """
    if page < 1:
        page = 1
    page_size = max(1, min(page_size, 100))

    can_manage = await has_hr_manage(actor)

    # Owner scoping
    if employee_id:
        profile = await EmployeeProfile.get(employee_id)
        if not profile or profile.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
        query: dict = {"company_id": company_id, "employee_id": employee_id}
        if not await has_hr_directory_view(actor):
            # Employee self-service list: own documents only, employee-visible, active.
            own = await _actor_employee_profile(company_id, actor)
            if not own or str(own.id) != employee_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to view these documents")
            query["status"] = HRDocumentStatus.ACTIVE.value
            query["visibility"] = HRDocumentVisibility.EMPLOYEE_VISIBLE.value
            can_manage = False
            review_status = None
    elif candidate_id:
        candidate = await Candidate.get(candidate_id)
        if not candidate or candidate.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
        await _require_company_document_view(company_id, actor)
        query = {"company_id": company_id, "candidate_id": candidate_id}
    else:
        await _require_company_document_view(company_id, actor)
        query = {"company_id": company_id}
        if owner_type == "employee":
            query["employee_id"] = {"$ne": None}
        elif owner_type == "candidate":
            query["candidate_id"] = {"$ne": None}
        if search:
            # Resolve matching employees + candidates + document types for the search term.
            term = search.strip()
            employee_filter = {
                "company_id": company_id,
                "$or": [
                    {"first_name": {"$regex": term, "$options": "i"}},
                    {"last_name": {"$regex": term, "$options": "i"}},
                    {"email": {"$regex": term, "$options": "i"}},
                ],
            }
            matched_users = await User.find(employee_filter).to_list()
            user_ids = {str(u.id) for u in matched_users}
            # Also match by employee_number (employee code)
            code_profiles = await EmployeeProfile.find({
                "company_id": company_id,
                "employee_number": {"$regex": term, "$options": "i"},
            }).to_list()
            code_user_ids = {p.user_id for p in code_profiles}
            user_ids.update(code_user_ids)
            profiles = await EmployeeProfile.find({"company_id": company_id, "user_id": {"$in": list(user_ids)}}).to_list()
            employee_ids = {str(p.id) for p in profiles}
            candidate_filter = {"company_id": company_id, "full_name": {"$regex": term, "$options": "i"}}
            candidates = await Candidate.find(candidate_filter).to_list()
            candidate_ids_set = {str(c.id) for c in candidates}
            # Also find document types matching the search term
            matching_types = await HRDocumentType.find({
                "company_id": company_id,
                "name": {"$regex": term, "$options": "i"},
            }).to_list()
            matching_type_ids = [str(t.id) for t in matching_types]
            or_conditions = []
            if employee_ids:
                or_conditions.append({"employee_id": {"$in": list(employee_ids)}})
            if candidate_ids_set:
                or_conditions.append({"candidate_id": {"$in": list(candidate_ids_set)}})
            if matching_type_ids:
                or_conditions.append({"document_type_id": {"$in": matching_type_ids}})
            # Also search description field directly
            or_conditions.append({"description": {"$regex": term, "$options": "i"}})
            if or_conditions:
                query["$or"] = or_conditions

    if document_type_id:
        query["document_type_id"] = document_type_id
    if status_filter:
        if status_filter in {HRDocumentStatus.ACTIVE.value, HRDocumentStatus.ARCHIVED.value}:
            query["status"] = status_filter
    if visibility:
        query["visibility"] = visibility
    if review_status and review_status in {HRReviewStatus.PENDING.value, HRReviewStatus.APPROVED.value, HRReviewStatus.REJECTED.value}:
        query["review_status"] = review_status
    _apply_expiry_filter(query, expiry_state)

    total = await HRDocument.find(query).count()
    documents = (
        await HRDocument.find(query)
        .sort("-created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    context = await _build_list_context(company_id, documents)
    items = [await serialize_document(doc, context=context, can_manage=can_manage) for doc in documents]
    return items, total


async def get_document(company_id: str, document_id: str, actor: User) -> dict:
    document = await HRDocument.get(document_id)
    if not document or document.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _require_document_access(company_id, document, actor)
    can_manage = await has_hr_manage(actor)
    context = await _build_list_context(company_id, [document])
    return await serialize_document(document, context=context, can_manage=can_manage)


async def upload_document(
    company_id: str,
    actor: User,
    *,
    employee_id: Optional[str] = None,
    candidate_id: Optional[str] = None,
    document_type_id: str,
    file: UploadFile,
    expiry_date: Optional[str] = None,
    description: Optional[str] = None,
    visibility: Optional[str] = None,
) -> dict:
    """Upload a new HR document (V1) for an employee or candidate.

    HR uploads are always considered approved (``review_status=approved``,
    ``submission_source=hr``) — existing HR behavior is unchanged.
    """
    await _require_company_document_view(company_id, actor)
    if not await has_hr_manage(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to upload documents")

    await ensure_default_document_types(company_id, actor_id=str(actor.id))
    owner, owner_key = await _resolve_owner(company_id, employee_id=employee_id, candidate_id=candidate_id)
    doc_type = await _resolve_document_type(company_id, document_type_id, owner_type=owner["owner_type"])

    parsed_expiry = parse_expiry_date(expiry_date)
    if parsed_expiry and not doc_type.expiry_supported:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This document type does not support expiry dates")

    resolved_visibility = visibility or doc_type.default_visibility.value
    try:
        resolved_visibility_enum = HRDocumentVisibility(resolved_visibility)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document visibility")

    stored = await _store_hr_file(file)

    version_number = 1
    version = _build_version_from_stored(stored, company_id=company_id, document_id="", version_number=version_number, uploaded_by=str(actor.id), change_note=None)
    version.submission_source = HRSubmissionSource.HR
    version.review_status = HRReviewStatus.APPROVED
    document = HRDocument(
        company_id=company_id,
        employee_id=employee_id,
        candidate_id=candidate_id,
        owner_key=owner_key,
        document_type_id=str(doc_type.id),
        status=HRDocumentStatus.ACTIVE,
        submission_source=HRSubmissionSource.HR,
        review_status=HRReviewStatus.APPROVED,
        expiry_date=parsed_expiry,
        description=description,
        visibility=resolved_visibility_enum,
        uploaded_by=str(actor.id),
        current_version_number=version_number,
    )
    try:
        await document.insert()
        version.document_id = str(document.id)
        await version.insert()
        document.current_version_id = str(version.id)
        document.updated_at = utc_now()
        await document.save()
    except Exception:
        # Storage already succeeded — clean up so we never leave an orphan file
        # with no metadata, then re-raise.
        if version.id:
            await _delete_stored_file(version)
        try:
            await document.delete()
        except Exception:
            pass
        raise

    await _record_document_event(
        company_id, "HRDocumentUploaded", actor, document,
        {"document_id": str(document.id), "version": version_number, "document_type_id": str(doc_type.id), "owner_key": owner_key},
    )
    context = await _build_list_context(company_id, [document])
    return await serialize_document(document, context=context, can_manage=True)


# =============================================================================
# Employee self-service (My HR → My Documents)
#
# Identity is ALWAYS resolved from the authenticated user — no employee_id is
# ever accepted from the request. Normal employees hold no HR permission, so
# these functions are the only backend surface they may use.
# =============================================================================


def _set_review_state(
    document_or_version,
    *,
    submission_source: HRSubmissionSource,
    review_status: HRReviewStatus,
    reviewed_by: Optional[str] = None,
    reviewed_at=None,
    review_note: Optional[str] = None,
) -> None:
    """Apply the current review outcome to a document or a version row."""
    document_or_version.submission_source = submission_source
    document_or_version.review_status = review_status
    document_or_version.reviewed_by = reviewed_by
    document_or_version.reviewed_at = reviewed_at
    document_or_version.review_note = review_note


async def _store_and_increment_version(
    company_id: str,
    document: HRDocument,
    actor: User,
    file: UploadFile,
    *,
    change_note: Optional[str] = None,
) -> HRDocumentVersion:
    """Store a file, atomically bump the version counter, insert the version.

    Shared by HR replace and employee resubmission so the versioning
    architecture stays identical for both paths. Returns the new version.
    """
    stored = await _store_hr_file(file)

    updated = await HRDocument.get_pymongo_collection().find_one_and_update(
        {"_id": ObjectId(str(document.id)), "company_id": company_id},
        {"$inc": {"current_version_number": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    new_version_number = updated["current_version_number"]

    version = _build_version_from_stored(
        stored,
        company_id=company_id,
        document_id=str(document.id),
        version_number=new_version_number,
        uploaded_by=str(actor.id),
        change_note=change_note,
    )
    try:
        await version.insert()
    except Exception:
        await _delete_stored_file(version)
        raise

    document.current_version_id = str(version.id)
    document.current_version_number = new_version_number
    return version


async def list_my_documents(
    company_id: str,
    actor: User,
    *,
    document_type_id: Optional[str] = None,
    expiry_state: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    """The authenticated employee's own active, employee-visible documents.

    Includes their submissions at every review state (pending/approved/
    rejected) so a new submission is immediately visible.
    """
    if page < 1:
        page = 1
    page_size = max(1, min(page_size, 100))
    profile = await _require_employee_profile(company_id, actor)

    query: dict = {
        "company_id": company_id,
        "employee_id": str(profile.id),
        "status": HRDocumentStatus.ACTIVE.value,
        "visibility": HRDocumentVisibility.EMPLOYEE_VISIBLE.value,
    }
    if document_type_id:
        query["document_type_id"] = document_type_id
    _apply_expiry_filter(query, expiry_state)

    total = await HRDocument.find(query).count()
    documents = (
        await HRDocument.find(query)
        .sort("-created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    context = await _build_list_context(company_id, documents)
    items = [await serialize_document(doc, context=context, can_manage=False) for doc in documents]
    return items, total


async def _my_document_type_rows(
    company_id: str,
    profile: EmployeeProfile,
    doc_types: list[HRDocumentType],
    docs_by_type: dict,
) -> list[dict]:
    """Compute per-type status (missing/pending/approved/rejected) rows."""
    rows = []
    for doc_type in doc_types:
        docs = docs_by_type.get(str(doc_type.id), [])
        status = "missing"
        latest: Optional[HRDocument] = None
        for doc in docs:
            latest = latest or doc
            doc_status = review_status_value(doc.review_status)
            # approved > pending > rejected (an approved doc completes the type).
            if doc_status == HRReviewStatus.APPROVED.value:
                status = HRReviewStatus.APPROVED.value
            elif doc_status == HRReviewStatus.PENDING.value and status != HRReviewStatus.APPROVED.value:
                status = HRReviewStatus.PENDING.value
            elif doc_status == HRReviewStatus.REJECTED.value and status == "missing":
                status = HRReviewStatus.REJECTED.value

        if status == "missing":
            document_id, current_version, filename, review_note, version = None, 0, None, None, None
        else:
            document_id = str(latest.id)
            current_version = latest.current_version_number or 0
            review_note = latest.review_note
            version = None
            if latest.current_version_id:
                version = await HRDocumentVersion.get(latest.current_version_id)
            filename = version.original_filename if version else None

        employee_upload_allowed = bool(doc_type.employee_upload_allowed)
        can_upload = bool(
            employee_upload_allowed
            and doc_type.active
            and doc_type.default_visibility == HRDocumentVisibility.EMPLOYEE_VISIBLE
            and status in ("missing", HRReviewStatus.REJECTED.value)
        )
        # Preview/download mirror the file endpoints' authorization: employees
        # can only open their own employee-visible documents.
        employee_visible = (
            doc_type.default_visibility == HRDocumentVisibility.EMPLOYEE_VISIBLE
            if isinstance(doc_type.default_visibility, HRDocumentVisibility)
            else doc_type.default_visibility == HRDocumentVisibility.EMPLOYEE_VISIBLE.value
        )
        can_open = bool(version and employee_visible)
        rows.append({
            "document_type_id": str(doc_type.id),
            "name": doc_type.name,
            "code": doc_type.code,
            "required": bool(doc_type.required),
            "employee_upload_allowed": employee_upload_allowed,
            "default_visibility": doc_type.default_visibility.value
            if isinstance(doc_type.default_visibility, HRDocumentVisibility)
            else doc_type.default_visibility,
            "status": status,
            "can_upload": can_upload,
            "can_preview": can_open,
            "can_download": can_open,
            "document_id": document_id,
            "current_version": current_version,
            "filename": filename,
            "review_note": review_note,
        })
    return rows


async def my_document_status(company_id: str, actor: User) -> dict:
    """My Documents overview: required statuses + employee-uploadable types."""
    profile = await _require_employee_profile(company_id, actor)
    # Self-heal: ensure the standard types exist AND their seed defaults for
    # employee upload are in place (legacy companies were seeded before the
    # self-service field existed), so the upload UI is enabled without waiting
    # for an HR visit to Document Type settings.
    await ensure_default_document_types(company_id, actor_id=str(actor.id))

    types = await HRDocumentType.find({"company_id": company_id, "active": True}).to_list()
    employee_scoped = {HROwnerScope.EMPLOYEE, HROwnerScope.BOTH}
    required_types = [
        t for t in types
        if t.required and t.owner_scope in employee_scoped
    ]
    uploadable_types = [
        t for t in types
        if t.employee_upload_allowed
        and t.owner_scope in employee_scoped
        and t.default_visibility == HRDocumentVisibility.EMPLOYEE_VISIBLE
    ]
    type_ids = [str(t.id) for t in types]
    docs = await HRDocument.find({
        "company_id": company_id,
        "employee_id": str(profile.id),
        "status": HRDocumentStatus.ACTIVE.value,
        "document_type_id": {"$in": type_ids},
    }).to_list()
    docs_by_type: dict = {}
    for doc in docs:
        docs_by_type.setdefault(doc.document_type_id or "", []).append(doc)

    required = await _my_document_type_rows(company_id, profile, required_types, docs_by_type)
    uploadable = await _my_document_type_rows(company_id, profile, uploadable_types, docs_by_type)
    return {"required": required, "uploadable": uploadable}


async def submit_employee_document(
    company_id: str,
    actor: User,
    *,
    document_type_id: str,
    file: UploadFile,
    expiry_date: Optional[str] = None,
    description: Optional[str] = None,
    document_request_id: Optional[str] = None,
) -> dict:
    """Employee submits a new document OR resubmits a rejected one.

    Self-only: the owner is the authenticated employee's profile, never a
    request-supplied id. Resubmission reuses the version architecture — a
    rejected document gets V(n+1) set to ``pending``; it is never duplicated
    and previous versions stay in history.

    If ``document_request_id`` is provided, the document is linked to that
    request and the request status advances to ``submitted``.

    ``expiry_date`` is an optional field: it declares the expiry of the
    particular document being submitted and is accepted for any
    employee-visible type (not gated by the type's ``expiry_supported`` flag).
    """
    profile = await _require_employee_profile(company_id, actor)
    await ensure_default_document_types(company_id, actor_id=str(actor.id))

    doc_type = await _resolve_document_type(company_id, document_type_id, owner_type="employee")
    if not doc_type.employee_upload_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employee upload is not enabled for this document type",
        )
    if doc_type.default_visibility != HRDocumentVisibility.EMPLOYEE_VISIBLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This document type is not available for employee submission",
        )

    # ``expiry_date`` is optional metadata on employee self-service documents:
    # the employee declares the expiry of the particular document they are
    # submitting, and it is accepted for any employee-visible type regardless
    # of the type-level ``expiry_supported`` flag (which remains a UI hint for
    # the HR-side upload flow).
    parsed_expiry = parse_expiry_date(expiry_date)

    existing = (
        await HRDocument.find({
            "company_id": company_id,
            "employee_id": str(profile.id),
            "document_type_id": str(doc_type.id),
            "status": HRDocumentStatus.ACTIVE.value,
        })
        .sort("-updated_at")
        .to_list()
    )
    if existing and review_status_value(existing[0].review_status) != HRReviewStatus.REJECTED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You already have a submission for this document type that is "
                "approved or pending review. Wait for the review or contact HR."
            ),
        )

    if existing:
        # Resubmission: next version, reset review to pending. Previous versions
        # (including the rejected one with its reason) stay in history. The file
        # is stored exactly once here (inside _store_and_increment_version) — a
        # second read of the same UploadFile would see an empty stream.
        document = existing[0]
        version = await _store_and_increment_version(company_id, document, actor, file)
        _set_review_state(version, submission_source=HRSubmissionSource.EMPLOYEE, review_status=HRReviewStatus.PENDING)
        await version.save()
        _set_review_state(document, submission_source=HRSubmissionSource.EMPLOYEE, review_status=HRReviewStatus.PENDING)
        # Refresh the declared expiry with the resubmitted form value (optional:
        # an empty date clears it for this document).
        document.expiry_date = parsed_expiry
        document.updated_at = utc_now()
        await document.save()
        await _record_document_event(
            company_id, "HRDocumentResubmitted", actor, document,
            {"document_id": str(document.id), "version": version.version_number, "document_type_id": str(doc_type.id)},
        )
        context = await _build_list_context(company_id, [document])
        return await serialize_document(document, context=context, can_manage=False)

    # Brand-new submission → V1 document created pending review.
    stored = await _store_hr_file(file)
    version = _build_version_from_stored(
        stored,
        company_id=company_id,
        document_id="",
        version_number=1,
        uploaded_by=str(actor.id),
        change_note=None,
    )
    _set_review_state(version, submission_source=HRSubmissionSource.EMPLOYEE, review_status=HRReviewStatus.PENDING)
    document = HRDocument(
        company_id=company_id,
        employee_id=str(profile.id),
        owner_key=build_owner_key(employee_id=str(profile.id)),
        document_type_id=str(doc_type.id),
        status=HRDocumentStatus.ACTIVE,
        submission_source=HRSubmissionSource.EMPLOYEE,
        review_status=HRReviewStatus.PENDING,
        expiry_date=parsed_expiry,
        description=description,
        visibility=doc_type.default_visibility,
        uploaded_by=str(actor.id),
        current_version_number=1,
    )
    try:
        await document.insert()
        version.document_id = str(document.id)
        await version.insert()
        document.current_version_id = str(version.id)
        document.updated_at = utc_now()
        await document.save()
    except Exception:
        # Storage already succeeded — never leave an orphan file with no
        # metadata record.
        if version.id:
            await _delete_stored_file(version)
        try:
            await document.delete()
        except Exception:
            pass
        raise

    await _record_document_event(
        company_id, "HRDocumentSubmitted", actor, document,
        {"document_id": str(document.id), "version": 1, "document_type_id": str(doc_type.id)},
    )

    # Link to a document request if provided
    if document_request_id:
        req = await HRDocumentRequest.get(document_request_id)
        if req and req.company_id == company_id and str(profile.id) == req.employee_id:
            if req.status in (HRRequestStatus.PENDING, HRRequestStatus.REJECTED):
                req.fulfilled_document_id = str(document.id)
                req.status = HRRequestStatus.SUBMITTED
                req.submitted_at = utc_now()
                req.updated_at = utc_now()
                await req.save()
                # Notify the requester
                requester_user = await User.get(req.requested_by)
                if requester_user:
                    await _create_notification(
                        company_id,
                        str(requester_user.id),
                        f"Document Submitted: {req.document_type_name}",
                        f"{actor.full_name()} submitted {req.document_type_name} for your review.",
                        related_id=str(document.id),
                        related_type="hr_document",
                        action_url=f"/hr/employees/{req.employee_id}",
                    )

    context = await _build_list_context(company_id, [document])
    return await serialize_document(document, context=context, can_manage=False)


# =============================================================================
# HR review (approve / reject) — backend authoritative
# =============================================================================


async def review_document(
    company_id: str,
    actor: User,
    document_id: str,
    *,
    action: str,
    note: Optional[str] = None,
) -> dict:
    """HR approves or rejects a pending employee submission.

    - Only pending documents can be reviewed (approve/reject are idempotent-
      safe: repeating a decision on a non-pending document returns 400).
    - Rejection requires a reason (``review_note``) surfaced to the employee.
    - The outcome is written to BOTH the document (current state) and the
      current version (per-version history), keeping them in sync.
    """
    document = await HRDocument.get(document_id)
    if not document or document.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _require_document_access(company_id, document, actor, manage=True)

    if document.status != HRDocumentStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived documents cannot be reviewed")
    if review_status_value(document.review_status) != HRReviewStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only documents pending review can be approved or rejected",
        )
    if submission_source_value(document.submission_source) != HRSubmissionSource.EMPLOYEE.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HR-uploaded documents are already approved",
        )

    if action == "reject":
        reason = (note or "").strip()
        if not reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A rejection reason is required",
            )
        new_status = HRReviewStatus.REJECTED
        event_name = "HRDocumentRejected"
        change = {"reason": reason}
    elif action == "approve":
        new_status = HRReviewStatus.APPROVED
        reason = None
        event_name = "HRDocumentApproved"
        change = {}
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid review action")

    version = None
    if document.current_version_id:
        version = await HRDocumentVersion.get(document.current_version_id)
    if not version or version.document_id != str(document.id) or version.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored version not found")

    now = utc_now()
    _set_review_state(
        version,
        submission_source=HRSubmissionSource.EMPLOYEE,
        review_status=new_status,
        reviewed_by=str(actor.id),
        reviewed_at=now,
        review_note=reason,
    )
    await version.save()
    _set_review_state(
        document,
        submission_source=HRSubmissionSource.EMPLOYEE,
        review_status=new_status,
        reviewed_by=str(actor.id),
        reviewed_at=now,
        review_note=reason,
    )
    document.updated_at = now
    await document.save()

    await _record_document_event(
        company_id, event_name, actor, document,
        {"document_id": str(document.id), "version": document.current_version_number, **change},
    )

    # Update linked document request if one exists
    linked_request = await HRDocumentRequest.find_one({
        "company_id": company_id,
        "fulfilled_document_id": str(document.id),
    })
    if linked_request:
        linked_request.status = HRRequestStatus.APPROVED if new_status == HRReviewStatus.APPROVED else HRRequestStatus.REJECTED
        linked_request.reviewed_at = now
        linked_request.updated_at = now
        await linked_request.save()

        # Notify the employee
        profile = await EmployeeProfile.get(linked_request.employee_id)
        if profile:
            emp_user = await User.get(profile.user_id)
            if emp_user:
                if new_status == HRReviewStatus.APPROVED:
                    await _create_notification(
                        company_id,
                        str(emp_user.id),
                        f"Document Approved: {linked_request.document_type_name}",
                        f"Your {linked_request.document_type_name} has been approved by HR.",
                        related_id=str(document.id),
                        related_type="hr_document",
                        action_url="/hr/me/documents",
                    )
                else:
                    await _create_notification(
                        company_id,
                        str(emp_user.id),
                        f"Document Rejected: {linked_request.document_type_name}",
                        f"Your {linked_request.document_type_name} was rejected: {reason}",
                        related_id=str(document.id),
                        related_type="hr_document",
                        action_url="/hr/me/documents",
                    )

    context = await _build_list_context(company_id, [document])
    return await serialize_document(document, context=context, can_manage=True)


# =============================================================================
# Update / replace / archive / versions
# =============================================================================


async def update_document(company_id: str, document_id: str, actor: User, data: dict) -> dict:
    """Metadata-only update — never creates a new file version."""
    document = await HRDocument.get(document_id)
    if not document or document.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _require_document_access(company_id, document, actor, manage=True)

    changes: dict = {}
    if data.get("description") is not None:
        changes["description"] = data["description"]
        document.description = data["description"]
    if data.get("visibility") is not None:
        changes["visibility"] = data["visibility"]
        document.visibility = HRDocumentVisibility(data["visibility"])
    if "expiry_date" in data:
        new_expiry = parse_expiry_date(data.get("expiry_date"))
        changes["expiry_date"] = new_expiry
        document.expiry_date = new_expiry
    if data.get("document_type_id"):
        doc_type = await _resolve_document_type(
            company_id, data["document_type_id"], owner_type="employee" if document.employee_id else "candidate"
        )
        changes["document_type_id"] = str(doc_type.id)
        document.document_type_id = str(doc_type.id)

    if changes:
        document.updated_at = utc_now()
        await document.save()
        await _record_document_event(
            company_id, "HRDocumentUpdated", actor, document,
            {"document_id": str(document.id), "changes": {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in changes.items()}},
        )
    context = await _build_list_context(company_id, [document])
    return await serialize_document(document, context=context, can_manage=True)


async def replace_document(
    company_id: str,
    document_id: str,
    actor: User,
    file: UploadFile,
    *,
    change_note: Optional[str] = None,
    expiry_date: Optional[str] = None,
    description: Optional[str] = None,
    visibility: Optional[str] = None,
) -> dict:
    """Replace the current file with a new version (V(n+1)); history preserved."""
    document = await HRDocument.get(document_id)
    if not document or document.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _require_document_access(company_id, document, actor, manage=True)
    if document.status != HRDocumentStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived documents cannot be replaced")

    # Shared store + atomic version bump + version insert.
    version = await _store_and_increment_version(
        company_id, document, actor, file, change_note=change_note
    )
    # HR replace keeps the current review outcome; mirror it on the new version
    # so per-version history stays consistent with the document state.
    version.submission_source = document.submission_source or HRSubmissionSource.HR
    version.review_status = document.review_status or HRReviewStatus.APPROVED
    await version.save()

    if expiry_date is not None:
        document.expiry_date = parse_expiry_date(expiry_date)
    if description is not None:
        document.description = description
    if visibility is not None:
        try:
            document.visibility = HRDocumentVisibility(visibility)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document visibility")
    document.updated_at = utc_now()
    await document.save()

    await _record_document_event(
        company_id, "HRDocumentReplaced", actor, document,
        {"document_id": str(document.id), "version": version.version_number, "change_note": change_note},
    )
    context = await _build_list_context(company_id, [document])
    return await serialize_document(document, context=context, can_manage=True)


async def archive_document(company_id: str, document_id: str, actor: User) -> dict:
    """Soft-delete: mark archived, keep metadata + version history intact."""
    document = await HRDocument.get(document_id)
    if not document or document.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _require_document_access(company_id, document, actor, manage=True)
    if document.status == HRDocumentStatus.ARCHIVED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document is already archived")

    document.status = HRDocumentStatus.ARCHIVED
    document.archived_at = utc_now()
    document.archived_by = str(actor.id)
    document.updated_at = utc_now()
    await document.save()

    await _record_document_event(
        company_id, "HRDocumentArchived", actor, document,
        {"document_id": str(document.id)},
    )
    context = await _build_list_context(company_id, [document])
    return await serialize_document(document, context=context, can_manage=True)


async def list_versions(company_id: str, document_id: str, actor: User) -> list[dict]:
    """Version history (newest first). Only authorized users see versions."""
    document = await HRDocument.get(document_id)
    if not document or document.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _require_document_access(company_id, document, actor)

    versions = await HRDocumentVersion.find({"company_id": company_id, "document_id": document_id}).sort("-version_number").to_list()
    person_ids = {v.uploaded_by for v in versions if v.uploaded_by}
    person_ids.update({v.reviewed_by for v in versions if v.reviewed_by})
    users = await _resolve_names_batch(company_id, person_ids)

    items = []
    for version in versions:
        uploader = users.get(version.uploaded_by or "")
        reviewer = users.get(version.reviewed_by or "")
        items.append({
            "id": str(version.id),
            "document_id": str(version.document_id),
            "version_number": version.version_number,
            "original_filename": version.original_filename,
            "mime_type": version.mime_type,
            "file_size": version.file_size,
            "uploaded_by": version.uploaded_by,
            "uploaded_by_name": uploader.full_name() if uploader else None,
            "uploaded_at": version.uploaded_at,
            "change_note": version.change_note,
            "submission_source": submission_source_value(version.submission_source),
            "review_status": review_status_value(version.review_status),
            "reviewed_by": version.reviewed_by,
            "reviewed_by_name": reviewer.full_name() if reviewer else None,
            "reviewed_at": version.reviewed_at,
            "review_note": version.review_note,
            "can_download": True,
        })
    return items


async def get_current_version(company_id: str, document_id: str, actor: User) -> HRDocumentVersion:
    """Authorize + resolve the current stored version (preview/download)."""
    document = await HRDocument.get(document_id)
    if not document or document.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _require_document_access(company_id, document, actor)
    if not document.current_version_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document has no file")
    version = await HRDocumentVersion.get(document.current_version_id)
    if not version or version.document_id != str(document.id) or version.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored version not found")
    return version


async def get_version_for_download(company_id: str, document_id: str, version_id: str, actor: User) -> HRDocumentVersion:
    """Authorize + resolve one stored version for preview/download."""
    document = await HRDocument.get(document_id)
    if not document or document.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    await _require_document_access(company_id, document, actor)
    if not ObjectId.is_valid(version_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    version = await HRDocumentVersion.get(version_id)
    if not version or version.document_id != str(document.id) or version.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    return version


def _file_content_disposition(filename: str, *, download: bool) -> str:
    """Build a Content-Disposition header (same encoding rules as Starlette's
    ``FileResponse``): ASCII filenames are quoted; anything else (spaces, non-
    ASCII, ...) is percent-encoded behind ``filename*=utf-8''...``."""
    quoted = quote(filename or "document")
    disposition = "attachment" if download else "inline"
    if quoted != (filename or "document"):
        return f"{disposition}; filename*=utf-8''{quoted}"
    return f'{disposition}; filename="{filename or "document"}"'


async def build_file_response(version: HRDocumentVersion, *, download: bool = False):
    """Return a secure file response for a stored version (backend-controlled).

    - Local storage: ``FileResponse`` (inline for preview, attachment for
      download).
    - Cloudinary: the file bytes are fetched SERVER-SIDE and streamed back to
      the client. The browser never follows a cross-origin redirect to
      Cloudinary (that broke preview/download when the blob request was
      redirected to a signed delivery URL), and signed URLs / credentials are
      never exposed to the client.

    Authorization is enforced BEFORE this function is reached.
    """
    from fastapi.responses import FileResponse, StreamingResponse

    filename = version.original_filename or "document"
    media_type = version.mime_type or "application/octet-stream"

    if version.storage_provider == "cloudinary" and version.storage_reference:
        resource_type = version.storage_resource_type or "image"
        delivery_type = version.storage_delivery_type or "authenticated"
        if not CloudinaryStorage.enabled():
            logger.error(
                "HR document storage provider is not configured | document_id=%s "
                "version_id=%s provider=cloudinary resource_type=%s delivery_type=%s",
                version.document_id,
                version.id,
                resource_type,
                delivery_type,
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The stored file could not be found. Please contact your HR administrator.",
            )

        resp = CloudinaryStorage.download_response(
            version.storage_reference,
            resource_type=resource_type,
            delivery_type=delivery_type,
            storage_url=version.storage_url,
        )
        if resp is None:
            logger.error(
                "HR document cloudinary delivery unavailable | document_id=%s "
                "version_id=%s provider=cloudinary resource_type=%s delivery_type=%s",
                version.document_id,
                version.id,
                resource_type,
                delivery_type,
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The stored file could not be found. Please contact your HR administrator.",
            )

        def _iter_cloudinary_chunks():
            try:
                for chunk in resp.iter_content(chunk_size=64 * 1024):
                    if chunk:
                        yield chunk
            finally:
                resp.close()

        return StreamingResponse(
            _iter_cloudinary_chunks(),
            media_type=media_type,
            headers={"Content-Disposition": _file_content_disposition(filename, download=download)},
        )

    if not version.storage_reference:
        logger.warning(
            "HR document version has no stored file reference | document_id=%s version_id=%s provider=%s",
            version.document_id,
            version.id,
            version.storage_provider,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The stored file could not be found. Please contact your HR administrator.",
        )
    try:
        path = resolve_upload_path(FileService.resolve_upload_dir(), version.storage_reference)
    except HTTPException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid stored file path") from exc
    if not path.exists() or not path.is_file():
        logger.error(
            "HR document stored file missing on disk | document_id=%s version_id=%s provider=local path=%s",
            version.document_id,
            version.id,
            path,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The stored file could not be found. Please contact your HR administrator.",
        )
    return FileResponse(
        path=path,
        media_type=media_type,
        filename=filename,
        content_disposition_type="attachment" if download else "inline",
    )


# =============================================================================
# Missing required documents
# =============================================================================


async def missing_required_documents(company_id: str, employee_id: str, actor: User) -> dict:
    """Required document types the employee has NOT completed.

    Only ``approved`` documents count as completed (requirement 8): pending and
    rejected submissions never satisfy a required type. Items carry a status:
    ``missing`` (never submitted) or ``rejected`` (needs a resubmission).
    Types with a pending submission are intentionally excluded — they are
    awaiting HR review, not missing.
    """
    profile = await EmployeeProfile.get(employee_id)
    if not profile or profile.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    await _require_company_document_view(company_id, actor)

    types = await HRDocumentType.find(
        {"company_id": company_id, "active": True, "required": True, "owner_scope": {"$in": ["employee", "both"]}}
    ).to_list()
    if not types:
        return {"missing": [], "count": 0}

    type_ids = [str(t.id) for t in types]
    docs = await HRDocument.find(
        {
            "company_id": company_id,
            "employee_id": employee_id,
            "status": HRDocumentStatus.ACTIVE.value,
            "document_type_id": {"$in": type_ids},
            "$or": [
                {"review_status": HRReviewStatus.APPROVED.value},
                {"review_status": HRReviewStatus.PENDING.value},
                {"review_status": HRReviewStatus.REJECTED.value},
                {"review_status": {"$exists": False}},
            ],
        }
    ).to_list()

    by_type: dict = {}
    for doc in docs:
        by_type.setdefault(doc.document_type_id or "", []).append(doc)

    missing = []
    for doc_type in types:
        type_docs = by_type.get(str(doc_type.id), [])
        statuses = {review_status_value(doc.review_status) for doc in type_docs}
        if HRReviewStatus.APPROVED.value in statuses or HRReviewStatus.PENDING.value in statuses:
            # Approved = completed; pending = waiting on HR review, not missing.
            continue
        if statuses:
            rejected = next((doc for doc in type_docs if review_status_value(doc.review_status) == HRReviewStatus.REJECTED.value), None)
            if rejected:
                missing.append({
                    "document_type_id": str(doc_type.id),
                    "name": doc_type.name,
                    "code": doc_type.code,
                    "status": HRReviewStatus.REJECTED.value,
                    "document_id": str(rejected.id),
                })
                continue
        missing.append({
            "document_type_id": str(doc_type.id),
            "name": doc_type.name,
            "code": doc_type.code,
            "status": "missing",
        })
    return {"missing": missing, "count": len(missing)}


# =============================================================================
# Timeline / audit (reuses the existing recruitment event bus)
# =============================================================================


async def _record_document_event(
    company_id: str,
    event_name: str,
    actor: User,
    document,
    payload: dict,
) -> None:
    from app.recruitment.events import publish_recruitment_event

    try:
        await publish_recruitment_event(
            event_name=event_name,
            aggregate_type="hr_document",
            aggregate_id=str(document.id) if getattr(document, "id", None) else "",
            company_id=company_id,
            actor_id=str(actor.id),
            payload=payload,
        )
    except Exception:
        # Event publishing must never break the core operation.
        logger.exception("Failed to publish HR document event")


# =============================================================================
# Document Request Lifecycle (HR requests documents from employees)
# =============================================================================


async def _create_notification(
    company_id: str,
    user_id: str,
    title: str,
    message: str,
    *,
    related_id: Optional[str] = None,
    related_type: Optional[str] = None,
    action_url: Optional[str] = None,
) -> None:
    """Best-effort in-app notification — must never break the core flow."""
    try:
        from app.models.notification import Notification, NotificationType

        notification = Notification(
            user_id=user_id,
            company_id=company_id,
            type=NotificationType.SYSTEM,
            title=title,
            message=message,
            related_id=related_id,
            related_type=related_type,
            action_url=action_url,
        )
        await notification.insert()
    except Exception:
        logger.exception("Failed to create notification for HR document request")


async def create_document_request(
    company_id: str,
    actor: User,
    data: dict,
) -> dict:
    """HR creates a request for an employee to provide a document.

    Duplicate-prevention: if the same employee already has an active (pending/
    submitted) request for the same document type, a 409 is raised. If an
    approved document already exists for that type, a warning note is returned
    but the request is still created (HR may explicitly request a replacement).
    """
    employee_id = data["employee_id"]
    profile = await EmployeeProfile.get(employee_id)
    if not profile or profile.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    # Resolve document type (optional — may be a free-form name)
    doc_type_id = data.get("document_type_id")
    doc_type_name = data["document_type_name"]
    if doc_type_id:
        doc_type = await HRDocumentType.get(doc_type_id)
        if not doc_type or doc_type.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document type not found")
        doc_type_name = doc_type.name
    else:
        doc_type = None

    # Duplicate prevention: same employee + same type + active request
    duplicate_query = {
        "company_id": company_id,
        "employee_id": employee_id,
        "status": {"$in": [HRRequestStatus.PENDING.value, HRRequestStatus.SUBMITTED.value]},
    }
    if doc_type_id:
        duplicate_query["document_type_id"] = doc_type_id
    else:
        duplicate_query["document_type_name"] = {"$regex": f"^{doc_type_name}$", "$options": "i"}
    existing_active = await HRDocumentRequest.find_one(duplicate_query)
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active request for this document type already exists for this employee",
        )

    # Parse due date
    parsed_due = parse_expiry_date(data.get("due_date")) if data.get("due_date") else None

    requirement_level = HRRequestRequirementLevel(data.get("requirement_level", "mandatory"))
    priority = HRRequestPriority(data.get("priority", "normal"))

    request = HRDocumentRequest(
        company_id=company_id,
        employee_id=employee_id,
        document_type_id=doc_type_id,
        document_type_name=doc_type_name,
        requirement_level=requirement_level,
        priority=priority,
        instructions=data.get("instructions"),
        due_date=parsed_due,
        status=HRRequestStatus.PENDING,
        requested_by=str(actor.id),
    )
    await request.insert()

    # Notify the employee
    user = await User.get(profile.user_id)
    if user:
        await _create_notification(
            company_id,
            str(user.id),
            f"Document Requested: {doc_type_name}",
            f"{actor.full_name()} requested your {requirement_level.value} document: {doc_type_name}"
            + (f". Due: {parsed_due.strftime('%d %b %Y')}" if parsed_due else "")
            + (f"\n{request.instructions}" if request.instructions else ""),
            related_id=str(request.id),
            related_type="hr_document_request",
            action_url="/hr/me/document-requests",
        )

    await _record_document_event(
        company_id, "HRDocumentRequestCreated", actor, request,
        {"request_id": str(request.id), "employee_id": employee_id, "document_type_name": doc_type_name},
    )

    return await _serialize_document_request(company_id, request)


async def list_document_requests(
    company_id: str,
    actor: User,
    *,
    employee_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    """List document requests — HR sees all company requests; employee sees only their own."""
    if page < 1:
        page = 1
    page_size = max(1, min(page_size, 100))

    is_hr = await has_hr_directory_view(actor)

    if is_hr:
        query: dict = {"company_id": company_id}
        if employee_id:
            query["employee_id"] = employee_id
    else:
        # Employee self-service: only their own requests
        profile = await _actor_employee_profile(company_id, actor)
        if not profile:
            return [], 0
        query = {"company_id": company_id, "employee_id": str(profile.id)}

    if status_filter and status_filter in {s.value for s in HRRequestStatus}:
        query["status"] = status_filter

    total = await HRDocumentRequest.find(query).count()
    requests = (
        await HRDocumentRequest.find(query)
        .sort("-created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    items = []
    for req in requests:
        items.append(await _serialize_document_request(company_id, req))

    return items, total


async def get_document_request(
    company_id: str,
    request_id: str,
    actor: User,
) -> dict:
    """Get a single document request with authorization check."""
    request = await HRDocumentRequest.get(request_id)
    if not request or request.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document request not found")

    is_hr = await has_hr_directory_view(actor)
    if not is_hr:
        profile = await _actor_employee_profile(company_id, actor)
        if not profile or str(profile.id) != request.employee_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return await _serialize_document_request(company_id, request)


async def cancel_document_request(
    company_id: str,
    request_id: str,
    actor: User,
) -> dict:
    """HR cancels a pending document request."""
    request = await HRDocumentRequest.get(request_id)
    if not request or request.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document request not found")

    if not await has_hr_manage(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")

    if request.status not in (HRRequestStatus.PENDING, HRRequestStatus.SUBMITTED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a request in '{request.status.value}' status",
        )

    request.status = HRRequestStatus.CANCELLED
    request.updated_at = utc_now()
    await request.save()

    await _record_document_event(
        company_id, "HRDocumentRequestCancelled", actor, request,
        {"request_id": str(request.id), "employee_id": request.employee_id},
    )

    # Notify employee
    profile = await EmployeeProfile.get(request.employee_id)
    if profile:
        user = await User.get(profile.user_id)
        if user:
            await _create_notification(
                company_id,
                str(user.id),
                f"Document Request Cancelled: {request.document_type_name}",
                f"The request for {request.document_type_name} has been cancelled by HR.",
                related_id=str(request.id),
                related_type="hr_document_request",
            )

    return await _serialize_document_request(company_id, request)


async def employee_upload_for_request(
    company_id: str,
    actor: User,
    *,
    document_request_id: str,
    file: UploadFile,
    expiry_date: Optional[str] = None,
    description: Optional[str] = None,
) -> dict:
    """Employee uploads a document against a specific request.

    Flow:
    1. Validate the request exists, belongs to the employee, and is in a state
       that accepts uploads (pending or rejected).
    2. Upload/create the HRDocument using existing employee self-service logic.
    3. Link the document to the request and advance the request status.
    """
    profile = await _require_employee_profile(company_id, actor)

    request = await HRDocumentRequest.get(document_request_id)
    if not request or request.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document request not found")
    if str(profile.id) != request.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This request is not for you")
    if request.status not in (HRRequestStatus.PENDING, HRRequestStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot upload for a request in '{request.status.value}' status",
        )

    # Resolve document type
    if request.document_type_id:
        doc_type = await _resolve_document_type(company_id, request.document_type_id, owner_type="employee")
    else:
        # Free-form request — find or create a matching document type
        doc_type = await HRDocumentType.find_one({
            "company_id": company_id,
            "name": {"$regex": f"^{request.document_type_name}$", "$options": "i"},
            "active": True,
        })
        if not doc_type:
            # Create a basic employee-uploadable type on the fly
            code = request.document_type_name.lower().strip().replace(" ", "_")[:60]
            doc_type = HRDocumentType(
                company_id=company_id,
                name=request.document_type_name,
                code=code,
                owner_scope=HROwnerScope.EMPLOYEE,
                required=request.requirement_level == HRRequestRequirementLevel.MANDATORY,
                default_visibility=HRDocumentVisibility.EMPLOYEE_VISIBLE,
                employee_upload_allowed=True,
                created_by=str(actor.id),
            )
            await doc_type.insert()

    if not doc_type.employee_upload_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee upload is not enabled for this document type",
        )

    # If the request already has a fulfilled document (resubmission after rejection),
    # reuse/update that document. Otherwise create a new one.
    existing_doc = None
    if request.fulfilled_document_id:
        existing_doc = await HRDocument.get(request.fulfilled_document_id)
        if existing_doc and existing_doc.company_id == company_id and existing_doc.status == HRDocumentStatus.ACTIVE:
            # Resubmission: create a new version
            version = await _store_and_increment_version(company_id, existing_doc, actor, file)
            _set_review_state(version, submission_source=HRSubmissionSource.EMPLOYEE, review_status=HRReviewStatus.PENDING)
            await version.save()
            _set_review_state(existing_doc, submission_source=HRSubmissionSource.EMPLOYEE, review_status=HRReviewStatus.PENDING)
            existing_doc.current_version_id = str(version.id)
            existing_doc.updated_at = utc_now()
            await existing_doc.save()
        else:
            existing_doc = None

    if not existing_doc:
        # Brand-new document
        parsed_expiry = parse_expiry_date(expiry_date)
        stored = await _store_hr_file(file)
        version_number = 1
        version = _build_version_from_stored(
            stored, company_id=company_id, document_id="", version_number=version_number,
            uploaded_by=str(actor.id), change_note=None,
        )
        _set_review_state(version, submission_source=HRSubmissionSource.EMPLOYEE, review_status=HRReviewStatus.PENDING)

        employee_doc = HRDocument(
            company_id=company_id,
            employee_id=str(profile.id),
            owner_key=build_owner_key(employee_id=str(profile.id)),
            document_type_id=str(doc_type.id),
            status=HRDocumentStatus.ACTIVE,
            submission_source=HRSubmissionSource.EMPLOYEE,
            review_status=HRReviewStatus.PENDING,
            expiry_date=parsed_expiry,
            description=description,
            visibility=doc_type.default_visibility,
            uploaded_by=str(actor.id),
            current_version_number=version_number,
        )
        try:
            await employee_doc.insert()
            version.document_id = str(employee_doc.id)
            await version.insert()
            employee_doc.current_version_id = str(version.id)
            employee_doc.updated_at = utc_now()
            await employee_doc.save()
        except Exception:
            if version.id:
                await _delete_stored_file(version)
            try:
                await employee_doc.delete()
            except Exception:
                pass
            raise
        existing_doc = employee_doc

    # Update request status
    request.fulfilled_document_id = str(existing_doc.id)
    request.status = HRRequestStatus.SUBMITTED
    request.submitted_at = utc_now()
    request.updated_at = utc_now()
    await request.save()

    # Notify HR
    await _record_document_event(
        company_id, "HRDocumentRequestFulfilled", actor, existing_doc,
        {"request_id": str(request.id), "document_id": str(existing_doc.id)},
    )

    # Notify the HR person who made the request
    requester_user = await User.get(request.requested_by)
    if requester_user:
        await _create_notification(
            company_id,
            str(requester_user.id),
            f"Document Submitted: {request.document_type_name}",
            f"{actor.full_name()} submitted {request.document_type_name} for your review.",
            related_id=str(existing_doc.id),
            related_type="hr_document",
            action_url=f"/hr/employees/{request.employee_id}",
        )

    context = await _build_list_context(company_id, [existing_doc])
    return await serialize_document(existing_doc, context=context, can_manage=False)


async def _serialize_document_request(company_id: str, request: HRDocumentRequest) -> dict:
    """Serialize a document request for the frontend."""
    employee_name = None
    employee_code = None
    requested_by_name = None

    if request.employee_id:
        profile = await EmployeeProfile.get(request.employee_id)
        if profile:
            user = await User.get(profile.user_id)
            if user:
                employee_name = user.full_name()
            employee_code = profile.employee_number

    if request.requested_by:
        user = await User.get(request.requested_by)
        if user:
            requested_by_name = user.full_name()

    # Derive overdue status
    is_overdue = False
    if (
        request.status in (HRRequestStatus.PENDING, HRRequestStatus.SUBMITTED)
        and request.due_date
        and request.due_date.date() < utc_now().date()
    ):
        is_overdue = True

    # Permission flags — resolve whether the requesting user is HR
    is_hr = False
    if request.requested_by:
        requester = await User.get(request.requested_by)
        if requester:
            is_hr = await has_hr_directory_view(requester)

    can_cancel = (
        is_hr
        and request.status in (HRRequestStatus.PENDING, HRRequestStatus.SUBMITTED)
    )

    can_upload = request.status in (HRRequestStatus.PENDING, HRRequestStatus.REJECTED)

    return {
        "id": str(request.id),
        "company_id": request.company_id,
        "employee_id": request.employee_id,
        "employee_name": employee_name,
        "employee_code": employee_code,
        "document_type_id": request.document_type_id,
        "document_type_name": request.document_type_name,
        "requirement_level": request.requirement_level.value if isinstance(request.requirement_level, HRRequestRequirementLevel) else request.requirement_level,
        "priority": request.priority.value if isinstance(request.priority, HRRequestPriority) else request.priority,
        "instructions": request.instructions,
        "due_date": request.due_date,
        "status": request.status.value if isinstance(request.status, HRRequestStatus) else request.status,
        "requested_by": request.requested_by,
        "requested_by_name": requested_by_name,
        "requested_at": request.requested_at,
        "submitted_at": request.submitted_at,
        "reviewed_at": request.reviewed_at,
        "fulfilled_document_id": request.fulfilled_document_id,
        "is_overdue": is_overdue,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
        "can_cancel": can_cancel,
        "can_upload": can_upload,
    }
