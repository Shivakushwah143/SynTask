from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.crm.deals import CRMDealService
from app.models.user import User

router = APIRouter()


class CRMDealPayload(BaseModel):
    contact_id: Optional[str] = None
    value: Optional[float] = None
    stage: Optional[str] = None
    probability: Optional[int] = None
    expected_close_date: Optional[datetime] = None
    decision_maker: Optional[str] = None
    competitors: Optional[list[str]] = None
    negotiation_notes: Optional[str] = None


class CRMProposalPayload(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    status: Optional[str] = None
    deal_value: Optional[float] = None
    expected_close_date: Optional[datetime] = None
    probability: Optional[int] = None
    negotiation_notes: Optional[str] = None
    competitors: Optional[list[str]] = None
    decision_maker: Optional[str] = None


@router.get("/leads/{lead_id}/deal")
async def get_lead_deal(lead_id: str, current_user: User = Depends(get_current_user)):
    return await CRMDealService.get_deal(current_user, lead_id)


@router.patch("/leads/{lead_id}/deal")
async def update_lead_deal(lead_id: str, payload: CRMDealPayload, current_user: User = Depends(get_current_user)):
    return await CRMDealService.upsert_deal(current_user, lead_id, payload.model_dump(exclude_unset=True))


@router.get("/leads/{lead_id}/proposals")
async def list_lead_proposals(lead_id: str, current_user: User = Depends(get_current_user)):
    return await CRMDealService.list_proposals(current_user, lead_id)


@router.post("/leads/{lead_id}/proposals")
async def create_lead_proposal(lead_id: str, payload: CRMProposalPayload, current_user: User = Depends(get_current_user)):
    return await CRMDealService.create_proposal(current_user, lead_id, payload.model_dump(exclude_unset=True))


@router.patch("/leads/{lead_id}/proposals/{proposal_id}")
async def update_lead_proposal(
    lead_id: str,
    proposal_id: str,
    payload: CRMProposalPayload,
    current_user: User = Depends(get_current_user),
):
    return await CRMDealService.update_proposal(current_user, lead_id, proposal_id, payload.model_dump(exclude_unset=True))


@router.post("/leads/{lead_id}/proposals/{proposal_id}/archive")
async def archive_lead_proposal(lead_id: str, proposal_id: str, current_user: User = Depends(get_current_user)):
    return await CRMDealService.archive_proposal(current_user, lead_id, proposal_id)
