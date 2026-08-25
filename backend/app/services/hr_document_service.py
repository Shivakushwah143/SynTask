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

from app.api.v1.endpoints.files import resolve_upload_path
from app.core.clock import utc_now
from app.models.department import Department, DepartmentType
from app.models.employee_profile import EmployeeProfile
from app.models.hr_document import (
    HRDocument,
    HRDocumentType,
    HRDocumentVersion,
    HRDocumentStatus,
    HRDocumentVisibility,
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


def _build_version_from_stored(stored: dict, document_id: str, version_number: int, uploaded_by: Optional[str], change_note: Optional[str]) -> HRDocumentVersion:
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


async def ensure_default_document_types(company_id: str, *, actor_id: Optional[str] = None) -> int:
    """Idempotently seed the default document types for a company.

    Safe to run on every startup/list call: missing codes are inserted, existing
    codes are never duplicated or overwritten.
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
            created_by=actor_id,
        )
        await doc_type.insert()
        created += 1
    return created


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
        created_by=str(actor.id),
    )
    await doc_type.insert()
    await _record_document_event(company_id, "HRDocumentTypeCreated", actor, doc_type, {"document_type_id": str(doc_type.id), "code": doc_type.code})
    return doc_type


async def update_document_type(company_id: str, document_type_id: str, actor: User, data: dict) -> HRDocumentType:
    doc_type = await HRDocumentType.get(document_type_id)
    if not doc_type or doc_type.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document type not found")
    for field in ("name", "description", "owner_scope", "required", "expiry_supported", "default_visibility", "active"):
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
    employee = context.get("employee_by_id", {}).get(document.employee_id or "")
    candidate = context.get("candidate_by_id", {}).get(document.candidate_id or "")

    version_count = context.get("version_counts", {}).get(str(document.id), document.current_version_number)
    uploader_name = uploader.full_name() if uploader else None
    employee_name = employee.full_name() if employee else None
    candidate_name = candidate.full_name if candidate else None

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
        "can_preview": bool(version),
        "can_download": bool(version),
        "can_replace": can_manage and document.status == HRDocumentStatus.ACTIVE,
        "can_edit": can_manage,
        "can_archive": can_manage and document.status == HRDocumentStatus.ACTIVE,
    }


async def _build_list_context(company_id: str, documents: list[HRDocument]) -> dict:
    version_ids = {doc.current_version_id for doc in documents if doc.current_version_id}
    type_ids = {doc.document_type_id for doc in documents if doc.document_type_id}
    uploader_ids = {doc.uploaded_by for doc in documents if doc.uploaded_by}
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
    version_counts: dict = {}
    if documents:
        doc_ids = [ObjectId(str(doc.id)) for doc in documents if ObjectId.is_valid(str(doc.id))]
        if doc_ids:
            pipeline = [
                {"$match": {"document_id": {"$in": doc_ids}}},
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
            # Resolve matching employees + candidates for the search term.
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
            profiles = await EmployeeProfile.find({"company_id": company_id, "user_id": {"$in": list(user_ids)}}).to_list()
            employee_ids = {str(p.id) for p in profiles}
            candidate_filter = {"company_id": company_id, "full_name": {"$regex": term, "$options": "i"}}
            candidates = await Candidate.find(candidate_filter).to_list()
            candidate_ids = {str(c.id) for c in candidates}
            query["$or"] = [
                {"employee_id": {"$in": list(employee_ids)}},
                {"candidate_id": {"$in": list(candidate_ids)}},
            ]

    if document_type_id:
        query["document_type_id"] = document_type_id
    if status_filter:
        if status_filter in {HRDocumentStatus.ACTIVE.value, HRDocumentStatus.ARCHIVED.value}:
            query["status"] = status_filter
    if visibility:
        query["visibility"] = visibility
    if expiry_state:
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
    """Upload a new HR document (V1) for an employee or candidate."""
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
    version = _build_version_from_stored(stored, document_id="", version_number=version_number, uploaded_by=str(actor.id), change_note=None)
    document = HRDocument(
        company_id=company_id,
        employee_id=employee_id,
        candidate_id=candidate_id,
        owner_key=owner_key,
        document_type_id=str(doc_type.id),
        status=HRDocumentStatus.ACTIVE,
        expiry_date=parsed_expiry,
        description=description,
        visibility=resolved_visibility_enum,
        uploaded_by=str(actor.id),
        current_version_number=version_number,
    )
    try:
        await document.insert()
        version.document_id = str(document.id)
        version.company_id = company_id
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

    stored = await _store_hr_file(file)

    # Atomic increment keeps version numbers safe under concurrent replacements.
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
        document_id=str(document.id),
        version_number=new_version_number,
        uploaded_by=str(actor.id),
        change_note=change_note,
    )
    version.company_id = company_id
    try:
        await version.insert()
    except Exception:
        await _delete_stored_file(version)
        raise

    document.current_version_id = str(version.id)
    document.current_version_number = new_version_number
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
        {"document_id": str(document.id), "version": new_version_number, "change_note": change_note},
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
    uploader_ids = {v.uploaded_by for v in versions if v.uploaded_by}
    users = await _resolve_names_batch(company_id, uploader_ids)

    items = []
    for version in versions:
        uploader = users.get(version.uploaded_by or "")
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


def build_file_response(version: HRDocumentVersion, *, download: bool = False):
    """Return a secure file response (stream/redirect) for a stored version.

    - Local storage: FileResponse (inline for preview, attachment for download).
    - Cloudinary authenticated: redirect to a short-lived signed URL.
    - Cloudinary public: redirect to the stored secure URL.
    Authorization is enforced BEFORE this function is reached.
    """
    from fastapi.responses import FileResponse, RedirectResponse

    if version.storage_provider == "cloudinary" and version.storage_reference:
        if CloudinaryStorage.enabled():
            if version.storage_delivery_type == "authenticated":
                url = CloudinaryStorage.signed_url(
                    version.storage_reference,
                    resource_type=version.storage_resource_type or "image",
                    delivery_type=version.storage_delivery_type or "authenticated",
                    attachment=download,
                    storage_url=version.storage_url,
                )
                if url:
                    return RedirectResponse(url)
            if version.storage_url:
                separator = "&" if "?" in version.storage_url else "?"
                suffix = "fl_attachment" if download else None
                return RedirectResponse(version.storage_url + (f"{separator}{suffix}" if suffix else ""))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file is not available")

    if not version.storage_reference:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file is not available")
    try:
        path = resolve_upload_path(FileService.resolve_upload_dir(), version.storage_reference)
    except HTTPException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file is not available") from exc
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file is not available")
    return FileResponse(
        path=path,
        media_type=version.mime_type or "application/octet-stream",
        filename=version.original_filename or Path(path).name,
        content_disposition_type="attachment" if download else "inline",
    )


# =============================================================================
# Missing required documents
# =============================================================================


async def missing_required_documents(company_id: str, employee_id: str, actor: User) -> dict:
    """Backend-computed list of required document types the employee is missing."""
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
    present = await HRDocument.find(
        {"company_id": company_id, "employee_id": employee_id, "status": HRDocumentStatus.ACTIVE.value, "document_type_id": {"$in": type_ids}}
    ).to_list()
    present_type_ids = {doc.document_type_id for doc in present}

    missing = [
        {"document_type_id": str(t.id), "name": t.name, "code": t.code}
        for t in types
        if str(t.id) not in present_type_ids
    ]
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
