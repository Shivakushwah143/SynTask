"""
HR Document API Endpoints — Phase 2 HRMS.

Routes (mounted at ``/api/v1/hr``):

    Document types:
        GET    /hr/document-types                  list (company-scoped)
        POST   /hr/document-types                  create
        PATCH  /hr/document-types/{id}             update
        DELETE /hr/document-types/{id}             deactivate (soft)

    Documents:
        GET    /hr/documents                       company-wide list (optional)
        GET    /hr/employees/{id}/documents        employee documents
        POST   /hr/employees/{id}/documents        upload (multipart)
        GET    /hr/employees/{id}/documents/missing-required
        GET    /hr/candidates/{id}/documents       candidate documents
        POST   /hr/candidates/{id}/documents       upload (multipart)
        GET    /hr/documents/{id}                  detail
        PATCH  /hr/documents/{id}                  metadata update
        POST   /hr/documents/{id}/replace          new version (multipart)
        POST   /hr/documents/{id}/review           HR approve/reject (JSON)
        POST   /hr/documents/{id}/archive          soft delete
        GET    /hr/documents/{id}/versions         version history
        GET    /hr/documents/{id}/preview          authorized inline file
        GET    /hr/documents/{id}/download         authorized download
        GET    /hr/documents/{id}/versions/{version_id}/download

    Employee self-service (authenticated employee identity — never a
    client-supplied employee id; no HR permission required):
        GET    /hr/me/documents                    own documents + review state
        GET    /hr/me/documents/status             required statuses + uploadable types
        POST   /hr/me/documents                    submit / resubmit (multipart)

Authorization: coarse dependencies gate directory access; the service re-checks
every per-document permission (ownership, visibility, company scope) so manual
URL manipulation can never bypass access controls.
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.api.dependencies import get_current_user
from app.models.user import User
from app.schemas.hr_document import (
    HRDocumentListResponse,
    HRDocumentResponse,
    HRDocumentReviewRequest,
    HRDocumentTypeCreate,
    HRDocumentTypeResponse,
    HRDocumentTypeUpdate,
    HRDocumentUpdate,
    HRDocumentVersionResponse,
    HRMissingRequiredResponse,
    HRMyDocumentStatusResponse,
)
from app.services.hr_document_service import (
    archive_document,
    build_file_response,
    create_document_type,
    deactivate_document_type,
    ensure_default_document_types,
    get_current_version,
    get_document,
    get_version_for_download,
    has_hr_directory_view,
    has_hr_manage,
    list_document_types,
    list_documents,
    list_my_documents,
    list_versions,
    missing_required_documents,
    my_document_status,
    replace_document,
    review_document,
    serialize_document_type,
    submit_employee_document,
    update_document,
    update_document_type,
    upload_document,
)

router = APIRouter()


def _company_id(user: User) -> str:
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    return user.company_id


async def require_hr_document_view(current_user: User = Depends(get_current_user)) -> User:
    if not await has_hr_directory_view(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR document access required")
    return current_user


async def require_hr_document_manage(current_user: User = Depends(get_current_user)) -> User:
    if not await has_hr_manage(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="HR document management access required")
    return current_user


# =============================================================================
# Employee self-service (My HR → My Documents)
#
# Identity is resolved from the authenticated user on the backend — these
# endpoints never accept an employee_id, so a normal employee can only ever
# reach their own documents and can never act as HR.
# =============================================================================


@router.get("/me/documents", response_model=HRDocumentListResponse)
async def list_my_documents_endpoint(
    document_type_id: Optional[str] = None,
    expiry_state: Optional[str] = Query(None, description="no_expiry | valid | expiring_soon | expired"),
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    items, total = await list_my_documents(
        company_id,
        current_user,
        document_type_id=document_type_id,
        expiry_state=expiry_state,
        page=page,
        page_size=page_size,
    )
    return HRDocumentListResponse(
        items=[HRDocumentResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/me/documents/status", response_model=HRMyDocumentStatusResponse)
async def my_document_status_endpoint(
    current_user: User = Depends(get_current_user),
):
    """Required statuses (Missing/Pending/Approved/Rejected) + uploadable types."""
    data = await my_document_status(_company_id(current_user), current_user)
    return HRMyDocumentStatusResponse.model_validate(data)


@router.post("/me/documents", status_code=status.HTTP_201_CREATED, response_model=HRDocumentResponse)
async def submit_employee_document_endpoint(
    document_type_id: str = Form(...),
    file: UploadFile = File(...),
    expiry_date: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Submit a new document or resubmit a rejected one (self only)."""
    return await submit_employee_document(
        _company_id(current_user),
        current_user,
        document_type_id=document_type_id,
        file=file,
        expiry_date=expiry_date,
        description=description,
    )


# =============================================================================
# Document Types
# =============================================================================


@router.get("/document-types", response_model=list[HRDocumentTypeResponse])
async def list_document_types_endpoint(
    include_inactive: bool = Query(False, description="Include deactivated document types"),
    current_user: User = Depends(require_hr_document_view),
):
    """List company document types (idempotently seeded with defaults)."""
    company_id = _company_id(current_user)
    await ensure_default_document_types(company_id, actor_id=str(current_user.id))
    items = await list_document_types(company_id, active_only=not include_inactive, include_inactive=include_inactive)
    return [await serialize_document_type(item) for item in items]


@router.post("/document-types", status_code=status.HTTP_201_CREATED, response_model=HRDocumentTypeResponse)
async def create_document_type_endpoint(
    payload: HRDocumentTypeCreate,
    current_user: User = Depends(require_hr_document_manage),
):
    doc_type = await create_document_type(_company_id(current_user), current_user, payload.model_dump())
    return await serialize_document_type(doc_type)


@router.patch("/document-types/{document_type_id}", response_model=HRDocumentTypeResponse)
async def update_document_type_endpoint(
    document_type_id: str,
    payload: HRDocumentTypeUpdate,
    current_user: User = Depends(require_hr_document_manage),
):
    doc_type = await update_document_type(
        _company_id(current_user), document_type_id, current_user, payload.model_dump(exclude_unset=True)
    )
    return await serialize_document_type(doc_type)


@router.delete("/document-types/{document_type_id}", response_model=HRDocumentTypeResponse)
async def deactivate_document_type_endpoint(
    document_type_id: str,
    current_user: User = Depends(require_hr_document_manage),
):
    """Soft-deactivate a document type; historical documents keep their reference."""
    doc_type = await deactivate_document_type(_company_id(current_user), document_type_id, current_user)
    return await serialize_document_type(doc_type)


# =============================================================================
# Documents
# =============================================================================


@router.get("/documents", response_model=HRDocumentListResponse)
async def list_all_documents_endpoint(
    owner_type: Optional[str] = Query(None, description="employee | candidate"),
    document_type_id: Optional[str] = None,
    expiry_state: Optional[str] = Query(None, description="no_expiry | valid | expiring_soon | expired"),
    status: Optional[str] = Query(None, alias="status", description="active | archived"),
    visibility: Optional[str] = None,
    review_status: Optional[str] = Query(None, description="pending | approved | rejected"),
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(require_hr_document_view),
):
    """Company-wide HR document list (metadata only) with backend filters."""
    company_id = _company_id(current_user)
    items, total = await list_documents(
        company_id,
        current_user,
        owner_type=owner_type,
        document_type_id=document_type_id,
        expiry_state=expiry_state,
        status_filter=status,
        visibility=visibility,
        review_status=review_status,
        search=search,
        page=page,
        page_size=page_size,
    )
    return HRDocumentListResponse(
        items=[HRDocumentResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/employees/{employee_id}/documents", response_model=HRDocumentListResponse)
async def list_employee_documents_endpoint(
    employee_id: str,
    document_type_id: Optional[str] = None,
    expiry_state: Optional[str] = Query(None, description="no_expiry | valid | expiring_soon | expired"),
    status: Optional[str] = Query(None, alias="status", description="active | archived"),
    visibility: Optional[str] = None,
    review_status: Optional[str] = Query(None, description="pending | approved | rejected"),
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    items, total = await list_documents(
        company_id,
        current_user,
        employee_id=employee_id,
        document_type_id=document_type_id,
        expiry_state=expiry_state,
        status_filter=status,
        visibility=visibility,
        review_status=review_status,
        page=page,
        page_size=page_size,
    )
    return HRDocumentListResponse(
        items=[HRDocumentResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.post("/employees/{employee_id}/documents", status_code=status.HTTP_201_CREATED, response_model=HRDocumentResponse)
async def upload_employee_document_endpoint(
    employee_id: str,
    document_type_id: str = Form(...),
    file: UploadFile = File(...),
    expiry_date: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    visibility: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    return await upload_document(
        company_id,
        current_user,
        employee_id=employee_id,
        document_type_id=document_type_id,
        file=file,
        expiry_date=expiry_date,
        description=description,
        visibility=visibility,
    )


@router.get("/employees/{employee_id}/documents/missing-required", response_model=HRMissingRequiredResponse)
async def missing_required_endpoint(
    employee_id: str,
    current_user: User = Depends(get_current_user),
):
    return await missing_required_documents(_company_id(current_user), employee_id, current_user)


@router.get("/candidates/{candidate_id}/documents", response_model=HRDocumentListResponse)
async def list_candidate_documents_endpoint(
    candidate_id: str,
    document_type_id: Optional[str] = None,
    expiry_state: Optional[str] = Query(None, description="no_expiry | valid | expiring_soon | expired"),
    status: Optional[str] = Query(None, alias="status", description="active | archived"),
    visibility: Optional[str] = None,
    review_status: Optional[str] = Query(None, description="pending | approved | rejected"),
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(require_hr_document_view),
):
    company_id = _company_id(current_user)
    items, total = await list_documents(
        company_id,
        current_user,
        candidate_id=candidate_id,
        document_type_id=document_type_id,
        expiry_state=expiry_state,
        status_filter=status,
        visibility=visibility,
        review_status=review_status,
        page=page,
        page_size=page_size,
    )
    return HRDocumentListResponse(
        items=[HRDocumentResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.post("/candidates/{candidate_id}/documents", status_code=status.HTTP_201_CREATED, response_model=HRDocumentResponse)
async def upload_candidate_document_endpoint(
    candidate_id: str,
    document_type_id: str = Form(...),
    file: UploadFile = File(...),
    expiry_date: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    visibility: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    return await upload_document(
        company_id,
        current_user,
        candidate_id=candidate_id,
        document_type_id=document_type_id,
        file=file,
        expiry_date=expiry_date,
        description=description,
        visibility=visibility,
    )


@router.get("/documents/{document_id}", response_model=HRDocumentResponse)
async def get_document_endpoint(
    document_id: str,
    current_user: User = Depends(get_current_user),
):
    return await get_document(_company_id(current_user), document_id, current_user)


@router.patch("/documents/{document_id}", response_model=HRDocumentResponse)
async def update_document_endpoint(
    document_id: str,
    payload: HRDocumentUpdate,
    current_user: User = Depends(get_current_user),
):
    return await update_document(
        _company_id(current_user), document_id, current_user, payload.model_dump(exclude_unset=True)
    )


@router.post("/documents/{document_id}/replace", response_model=HRDocumentResponse)
async def replace_document_endpoint(
    document_id: str,
    file: UploadFile = File(...),
    change_note: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    visibility: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    return await replace_document(
        company_id,
        document_id,
        current_user,
        file,
        change_note=change_note,
        expiry_date=expiry_date,
        description=description,
        visibility=visibility,
    )


@router.post("/documents/{document_id}/review", response_model=HRDocumentResponse)
async def review_document_endpoint(
    document_id: str,
    payload: HRDocumentReviewRequest,
    current_user: User = Depends(require_hr_document_manage),
):
    """HR reviews a pending employee submission (approve | reject + reason).

    Gated by the manage dependency — normal employees (including the document
    owner) can never approve or reject, even their own submissions.
    """
    return await review_document(
        _company_id(current_user),
        current_user,
        document_id,
        action=payload.action,
        note=payload.note,
    )


@router.post("/documents/{document_id}/archive", response_model=HRDocumentResponse)
async def archive_document_endpoint(
    document_id: str,
    current_user: User = Depends(get_current_user),
):
    return await archive_document(_company_id(current_user), document_id, current_user)


@router.get("/documents/{document_id}/versions", response_model=list[HRDocumentVersionResponse])
async def list_document_versions_endpoint(
    document_id: str,
    current_user: User = Depends(get_current_user),
):
    items = await list_versions(_company_id(current_user), document_id, current_user)
    return [HRDocumentVersionResponse.model_validate(item) for item in items]


@router.get("/documents/{document_id}/preview")
async def preview_document_endpoint(
    document_id: str,
    current_user: User = Depends(get_current_user),
):
    """Authorized inline file access for browser-native preview."""
    version = await get_current_version(_company_id(current_user), document_id, current_user)
    return build_file_response(version, download=False)


@router.get("/documents/{document_id}/download")
async def download_document_endpoint(
    document_id: str,
    current_user: User = Depends(get_current_user),
):
    """Authorized current-version download with a safe filename header."""
    version = await get_current_version(_company_id(current_user), document_id, current_user)
    return build_file_response(version, download=True)


@router.get("/documents/{document_id}/versions/{version_id}/download")
async def download_document_version_endpoint(
    document_id: str,
    version_id: str,
    current_user: User = Depends(get_current_user),
):
    """Authorized download of a specific historical version."""
    version = await get_version_for_download(_company_id(current_user), document_id, version_id, current_user)
    return build_file_response(version, download=True)
