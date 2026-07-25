"""Tenant-scoped Meta identity API."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.integrations.meta.identity_service import MetaIdentityService
from app.models.user import UserRole


router = APIRouter()


class ConfirmIdentityLinkRequest(BaseModel):
    identity_id: str
    target_identity_id: str


def _company_id_for_user(current_user: Any, company_id: str | None = None) -> str:
    role = getattr(getattr(current_user, "role", None), "value", getattr(current_user, "role", None))
    if role == UserRole.SUPER_ADMIN.value:
        if not company_id:
            raise HTTPException(status_code=400, detail="company_id is required")
        return company_id
    return str(current_user.company_id)


@router.get("/identity/suggestions/{identity_id}")
async def list_identity_suggestions(
    identity_id: str,
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    target_company = _company_id_for_user(current_user, company_id)
    suggestions = await MetaIdentityService().suggest_links(
        company_id=target_company,
        identity_id=identity_id,
    )
    return {"items": [item.model_dump() for item in suggestions]}


@router.post("/identity/links")
async def confirm_identity_link(
    payload: ConfirmIdentityLinkRequest,
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    target_company = _company_id_for_user(current_user, company_id)
    try:
        link = await MetaIdentityService().confirm_link(
            company_id=target_company,
            identity_id=payload.identity_id,
            target_identity_id=payload.target_identity_id,
            confirmed_by=str(getattr(current_user, "id", "")),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {
        "id": str(link.id),
        "company_id": link.company_id,
        "identity_ids": link.identity_ids,
        "linked_lead_id": link.linked_lead_id,
        "linked_contact_id": link.linked_contact_id,
        "status": link.status,
        "confirmed_by": link.confirmed_by,
        "confirmed_at": link.confirmed_at,
        "evidence": link.evidence,
    }
