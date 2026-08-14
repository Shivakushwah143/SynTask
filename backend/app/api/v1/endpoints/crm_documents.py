from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.crm import documents
from app.models.user import User

router = APIRouter()
public_router = APIRouter()


class CRMDocumentPayload(BaseModel):
    document_type: str = "quotation"
    title: Optional[str] = None
    currency: str = "INR"
    valid_until: Optional[datetime] = None
    items: list[dict[str, Any]] = []
    overall_discount: str | int | float = 0
    terms: Optional[str] = None
    notes: Optional[str] = None
    parties: Optional[str] = None
    scope: Optional[str] = None
    deliverables: Optional[str] = None
    price: Optional[str] = None
    payment_schedule: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    confidentiality: Optional[str] = None
    termination: Optional[str] = None
    clauses: list[str] = []


class SendPayload(BaseModel):
    recipient_email: Optional[str] = None


class ShareLinkPayload(BaseModel):
    regenerate: bool = False


class PublicActionPayload(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    accepted: bool = False
    comment: Optional[str] = None


@router.get("/leads/{lead_id}/documents")
async def list_lead_documents(lead_id: str, current_user: User = Depends(get_current_user)):
    return await documents.list_documents(current_user, lead_id)


@router.post("/leads/{lead_id}/documents")
async def create_lead_document(lead_id: str, payload: CRMDocumentPayload, current_user: User = Depends(get_current_user)):
    return await documents.create_document(current_user, lead_id, payload.model_dump(exclude_unset=True))


@router.get("/leads/{lead_id}/documents/{document_id}")
async def get_lead_document(lead_id: str, document_id: str, current_user: User = Depends(get_current_user)):
    _, document = await documents._document_for_user(current_user, lead_id, document_id)
    return {"document": documents.public_serialize(document)}


@router.patch("/leads/{lead_id}/documents/{document_id}")
async def update_lead_document(lead_id: str, document_id: str, payload: CRMDocumentPayload, current_user: User = Depends(get_current_user)):
    return await documents.update_document(current_user, lead_id, document_id, payload.model_dump(exclude_unset=True))


@router.post("/leads/{lead_id}/documents/{document_id}/generate-pdf")
async def generate_lead_document_pdf(lead_id: str, document_id: str, current_user: User = Depends(get_current_user)):
    return await documents.generate_pdf(current_user, lead_id, document_id)


@router.get("/leads/{lead_id}/documents/{document_id}/pdf")
async def get_lead_document_pdf(lead_id: str, document_id: str, current_user: User = Depends(get_current_user)):
    return await documents.pdf_response(current_user, lead_id, document_id)


@router.post("/leads/{lead_id}/documents/{document_id}/send")
async def send_lead_document(lead_id: str, document_id: str, payload: SendPayload, current_user: User = Depends(get_current_user)):
    return await documents.send_document(current_user, lead_id, document_id, payload.recipient_email)


@router.post("/leads/{lead_id}/documents/{document_id}/share-link")
async def create_lead_document_share_link(lead_id: str, document_id: str, payload: ShareLinkPayload, current_user: User = Depends(get_current_user)):
    return await documents.create_share_link(current_user, lead_id, document_id, payload.regenerate)


@router.post("/leads/{lead_id}/documents/{document_id}/revoke-link")
async def revoke_lead_document_share_link(lead_id: str, document_id: str, current_user: User = Depends(get_current_user)):
    return await documents.revoke_share_link(current_user, lead_id, document_id)


@router.post("/leads/{lead_id}/documents/{document_id}/cancel")
async def cancel_lead_document(lead_id: str, document_id: str, current_user: User = Depends(get_current_user)):
    return await documents.cancel_document(current_user, lead_id, document_id)


@router.post("/leads/{lead_id}/documents/{document_id}/create-contract")
async def create_contract_from_document(lead_id: str, document_id: str, current_user: User = Depends(get_current_user)):
    return await documents.create_contract_from_document(current_user, lead_id, document_id)


@router.post("/leads/{lead_id}/documents/upload")
async def upload_lead_document_pdf(
    lead_id: str,
    document_type: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    return await documents.upload_pdf(current_user, lead_id, file, document_type, title)


@public_router.get("/crm-documents/{token}")
async def public_crm_document(token: str, request: Request):
    document = await documents.public_document(token, ip_address=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"))
    return {"document": documents.public_serialize(document)}


@public_router.get("/crm-documents/{token}/pdf")
async def public_crm_document_pdf(token: str, request: Request):
    document = await documents.public_document(token, ip_address=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"))
    await documents._event(document, "downloaded", None, ip_address=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"))
    return documents.FileResponse(documents._safe_pdf_file(document), media_type="application/pdf", filename=f"{document.document_number}.pdf")


@public_router.post("/crm-documents/{token}/accept")
async def public_accept_document(token: str, payload: PublicActionPayload, request: Request):
    result = await documents.public_action(token, "accept", payload.model_dump(), request.client.host if request.client else None, request.headers.get("user-agent"))
    return {"document": documents.public_serialize(result["document"]), "idempotent": result["idempotent"]}


@public_router.post("/crm-documents/{token}/reject")
async def public_reject_document(token: str, payload: PublicActionPayload, request: Request):
    result = await documents.public_action(token, "reject", payload.model_dump(), request.client.host if request.client else None, request.headers.get("user-agent"))
    return {"document": documents.public_serialize(result["document"]), "idempotent": result["idempotent"]}


@public_router.post("/crm-documents/{token}/request-changes")
async def public_request_changes_document(token: str, payload: PublicActionPayload, request: Request):
    result = await documents.public_action(token, "changes", payload.model_dump(), request.client.host if request.client else None, request.headers.get("user-agent"))
    return {"document": documents.public_serialize(result["document"]), "idempotent": result["idempotent"]}
