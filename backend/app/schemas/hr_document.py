"""
HR Document API Schemas — Phase 2 HRMS.

DTOs only; file content never crosses these. Upload/replace are multipart
requests handled by the endpoint (FormData), matching existing SynTask upload
routes (``recruitment/candidates/{id}/attachment``, ``files/upload``).
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.models.hr_document import (
    HROwnerScope,
    HRDocumentStatus,
    HRDocumentVisibility,
    HRReviewStatus,
    HRSubmissionSource,
)


# =============================================================================
# Document Types
# =============================================================================


class HRDocumentTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=60)
    description: Optional[str] = Field(default=None, max_length=500)
    owner_scope: HROwnerScope = HROwnerScope.BOTH
    required: bool = False
    expiry_supported: bool = True
    default_visibility: HRDocumentVisibility = HRDocumentVisibility.EMPLOYEE_VISIBLE
    employee_upload_allowed: bool = False

    @model_validator(mode="after")
    def _normalize_code(self):
        self.code = self.code.strip().lower().replace(" ", "_")
        if not self.code:
            raise ValueError("code is required")
        return self


class HRDocumentTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    owner_scope: Optional[HROwnerScope] = None
    required: Optional[bool] = None
    expiry_supported: Optional[bool] = None
    default_visibility: Optional[HRDocumentVisibility] = None
    employee_upload_allowed: Optional[bool] = None
    active: Optional[bool] = None


class HRDocumentTypeResponse(BaseModel):
    id: str
    company_id: str
    name: str
    code: str
    description: Optional[str] = None
    owner_scope: str
    required: bool
    expiry_supported: bool
    default_visibility: str
    employee_upload_allowed: bool = False
    active: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Documents
# =============================================================================


class HRDocumentUpdate(BaseModel):
    """Metadata-only update — never creates a new file version.

    Review state is never accepted here — it is changed exclusively through
    the dedicated approve/reject/review flow (backend authoritative).
    """

    document_type_id: Optional[str] = None
    expiry_date: Optional[datetime] = None
    description: Optional[str] = None
    visibility: Optional[HRDocumentVisibility] = None


class HRDocumentReviewRequest(BaseModel):
    """HR review of a pending employee submission."""

    action: str = Field(pattern="^(approve|reject)$")
    note: Optional[str] = Field(default=None, max_length=2000)


class HRDocumentVersionResponse(BaseModel):
    id: str
    document_id: str
    version_number: int
    original_filename: str
    mime_type: str
    file_size: int
    uploaded_by: Optional[str] = None
    uploaded_by_name: Optional[str] = None
    uploaded_at: datetime
    change_note: Optional[str] = None
    # Per-version review outcome (history is preserved across resubmissions).
    submission_source: Optional[str] = None
    review_status: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    can_download: bool = True


class HRDocumentResponse(BaseModel):
    """Normalized, frontend-ready document DTO.

    Expiry state is always computed on the backend (one source of truth).
    Permission capability flags let the UI render actions without re-deriving
    authorization rules client-side.
    """

    id: str
    company_id: str
    owner_type: Optional[str] = None
    employee_id: Optional[str] = None
    candidate_id: Optional[str] = None
    employee_name: Optional[str] = None
    candidate_name: Optional[str] = None
    document_type_id: Optional[str] = None
    document_type: Optional[str] = None
    document_type_code: Optional[str] = None
    document_type_required: bool = False

    status: str
    # Review workflow state (separate from ``status`` lifecycle).
    review_status: str = "approved"
    submission_source: str = "hr"
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None

    expiry_date: Optional[datetime] = None
    expiry_state: str
    description: Optional[str] = None
    visibility: str

    current_version: int = 0
    version_count: int = 0
    filename: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None

    uploaded_by: Optional[str] = None
    uploaded_by_name: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    can_view: bool = True
    can_manage: bool = False
    can_preview: bool = True
    can_download: bool = True
    can_replace: bool = False
    can_edit: bool = False
    can_archive: bool = False
    can_review: bool = False
    can_resubmit: bool = False


class HRDocumentListResponse(BaseModel):
    items: list[HRDocumentResponse]
    total: int
    page: int
    page_size: int
    has_next: bool


class HRMissingRequiredResponse(BaseModel):
    """Required document types without an approved document.

    ``status`` is ``missing`` (never submitted) or ``rejected`` (needs a
    resubmission) — pending submissions are intentionally excluded because
    they are not "missing", they are awaiting review.
    """

    missing: list[dict]
    count: int


class HRDocumentTypeStatusItem(BaseModel):
    """One document type with the employee's per-type status.

    ``status`` ∈ missing | pending | approved | rejected (never ``approved``
    counts as completed; pending/rejected do not).
    """

    document_type_id: str
    name: str
    code: str
    required: bool
    employee_upload_allowed: bool
    default_visibility: str
    status: str
    can_upload: bool = False
    document_id: Optional[str] = None
    current_version: int = 0
    filename: Optional[str] = None
    review_note: Optional[str] = None


class HRMyDocumentStatusResponse(BaseModel):
    """Employee My Documents overview — required statuses + uploadable types."""

    required: list[HRDocumentTypeStatusItem]
    uploadable: list[HRDocumentTypeStatusItem]


# =============================================================================
# Multipart upload payloads (FormData — not used directly by FastAPI bodies)
# =============================================================================


class HRDocumentUploadMetadata(BaseModel):
    """Parsed from multipart form fields by the endpoint."""

    document_type_id: str = Field(min_length=1)
    expiry_date: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None


class HRDocumentReplaceMetadata(BaseModel):
    change_note: Optional[str] = None
    expiry_date: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None


# =============================================================================
# Document Requests (HR-initiated requests for employee to provide documents)
# =============================================================================


class HRDocumentRequestCreate(BaseModel):
    """HR creates a request for an employee to provide a document."""

    employee_id: str = Field(min_length=1)
    document_type_id: Optional[str] = None
    document_type_name: str = Field(min_length=1, max_length=200)
    requirement_level: str = Field(default="mandatory", pattern="^(mandatory|optional)$")
    priority: str = Field(default="normal", pattern="^(low|normal|high|urgent)$")
    instructions: Optional[str] = Field(default=None, max_length=2000)
    due_date: Optional[str] = None  # YYYY-MM-DD


class HRDocumentRequestUpdate(BaseModel):
    """HR updates a pending request (status, instructions, due date, priority)."""

    status: Optional[str] = Field(default=None, pattern="^(cancelled)$")
    instructions: Optional[str] = Field(default=None, max_length=2000)
    due_date: Optional[str] = None
    priority: Optional[str] = Field(default=None, pattern="^(low|normal|high|urgent)$")


class HRDocumentRequestResponse(BaseModel):
    """Frontend-ready document request DTO."""

    id: str
    company_id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None

    document_type_id: Optional[str] = None
    document_type_name: str

    requirement_level: str  # mandatory | optional
    priority: str  # low | normal | high | urgent
    instructions: Optional[str] = None
    due_date: Optional[datetime] = None

    status: str  # pending | submitted | approved | rejected | cancelled

    requested_by: str
    requested_by_name: Optional[str] = None
    requested_at: datetime

    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None

    fulfilled_document_id: Optional[str] = None

    # Overdue status is derived, not stored
    is_overdue: bool = False

    created_at: datetime
    updated_at: datetime

    can_cancel: bool = False
    can_upload: bool = False  # Employee can upload against this request


class HRDocumentRequestListResponse(BaseModel):
    items: list[HRDocumentRequestResponse]
    total: int
    page: int
    page_size: int
    has_next: bool
