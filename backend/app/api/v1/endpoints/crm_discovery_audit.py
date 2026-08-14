from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.crm import discovery_audit
from app.models.user import User

router = APIRouter()


class PartialWorkspacePayload(BaseModel):
    business_information: dict[str, Any] | None = None
    current_marketing: dict[str, Any] | None = None
    problems: dict[str, Any] | None = None
    goals: dict[str, Any] | None = None
    budget: dict[str, Any] | None = None
    decision_maker: dict[str, Any] | None = None
    competitors: list[dict[str, Any]] | None = None
    timeline: dict[str, Any] | None = None
    summary: dict[str, Any] | None = None
    website: dict[str, Any] | None = None
    google_presence: dict[str, Any] | None = None
    social_media: dict[str, Any] | None = None
    seo: dict[str, Any] | None = None
    swot: dict[str, Any] | None = None
    recommendations: list[dict[str, Any]] | None = None
    findings: list[dict[str, Any]] | None = None
    audit_source: str | None = Field(default=None)


@router.get("/leads/{lead_id}/discovery")
async def get_lead_discovery(lead_id: str, current_user: User = Depends(get_current_user)):
    return await discovery_audit.get_discovery(current_user, lead_id)


@router.patch("/leads/{lead_id}/discovery")
async def patch_lead_discovery(lead_id: str, payload: PartialWorkspacePayload, current_user: User = Depends(get_current_user)):
    return await discovery_audit.patch_discovery(current_user, lead_id, payload.model_dump(exclude_unset=True, exclude_none=True))


@router.post("/leads/{lead_id}/discovery/complete")
async def complete_lead_discovery(lead_id: str, current_user: User = Depends(get_current_user)):
    return await discovery_audit.complete_discovery(current_user, lead_id)


@router.get("/leads/{lead_id}/audit")
async def get_lead_audit(lead_id: str, current_user: User = Depends(get_current_user)):
    return await discovery_audit.get_audit(current_user, lead_id)


@router.patch("/leads/{lead_id}/audit")
async def patch_lead_audit(lead_id: str, payload: PartialWorkspacePayload, current_user: User = Depends(get_current_user)):
    return await discovery_audit.patch_audit(current_user, lead_id, payload.model_dump(exclude_unset=True, exclude_none=True))


@router.post("/leads/{lead_id}/audit/complete")
async def complete_lead_audit(lead_id: str, current_user: User = Depends(get_current_user)):
    return await discovery_audit.complete_audit(current_user, lead_id)


@router.post("/leads/{lead_id}/quotation-drafts/from-discovery-audit")
async def generate_quotation_from_discovery_audit(lead_id: str, current_user: User = Depends(get_current_user)):
    return await discovery_audit.generate_quotation_draft(current_user, lead_id)
