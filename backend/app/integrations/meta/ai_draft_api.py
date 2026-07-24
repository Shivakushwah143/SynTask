"""Governed Meta AI draft API."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.integrations.meta.ai_draft_service import MetaAIDraftService
from app.models.user import UserRole


router = APIRouter()
service = MetaAIDraftService()


class DraftRequest(BaseModel):
    instruction: str | None = Field(default=None, max_length=1000)


class RejectRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


def _company_id_for_user(current_user: Any, company_id: str | None = None) -> str:
    role = getattr(getattr(current_user, "role", None), "value", getattr(current_user, "role", None))
    if role == UserRole.SUPER_ADMIN.value:
        if not company_id:
            raise HTTPException(status_code=400, detail="company_id is required")
        return company_id
    return str(current_user.company_id)


def _draft_payload(draft: Any) -> dict[str, Any]:
    return {
        "id": str(draft.id),
        "company_id": draft.company_id,
        "conversation_id": draft.conversation_id,
        "channel": draft.channel.value if hasattr(draft.channel, "value") else draft.channel,
        "draft_text": draft.draft_text,
        "status": draft.status,
        "policy_snapshot": draft.policy_snapshot,
        "prompt_metadata": draft.prompt_metadata,
        "approved_by": draft.approved_by,
        "approved_at": draft.approved_at,
        "rejected_by": draft.rejected_by,
        "rejected_at": draft.rejected_at,
        "rejection_reason": draft.rejection_reason,
        "created_at": draft.created_at,
        "updated_at": draft.updated_at,
    }


@router.post("/ai-drafts/conversations/{conversation_id}")
async def create_ai_draft(
    conversation_id: str,
    payload: DraftRequest,
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    target_company = _company_id_for_user(current_user, company_id)
    try:
        draft = await service.generate_draft(
            company_id=target_company,
            conversation_id=conversation_id,
            requested_by=str(current_user.id),
            instruction=payload.instruction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"item": _draft_payload(draft)}


@router.post("/ai-drafts/{draft_id}/approve")
async def approve_ai_draft(
    draft_id: str,
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    target_company = _company_id_for_user(current_user, company_id)
    try:
        draft = await service.approve_draft(
            company_id=target_company,
            draft_id=draft_id,
            approved_by=str(current_user.id),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"item": _draft_payload(draft)}


@router.post("/ai-drafts/{draft_id}/reject")
async def reject_ai_draft(
    draft_id: str,
    payload: RejectRequest,
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    target_company = _company_id_for_user(current_user, company_id)
    try:
        draft = await service.reject_draft(
            company_id=target_company,
            draft_id=draft_id,
            rejected_by=str(current_user.id),
            reason=payload.reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"item": _draft_payload(draft)}
