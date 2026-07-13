"""
CRM pipeline backend endpoints.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.crm.pipeline import CRMPipelineService
from app.models.user import User

router = APIRouter()


class PipelineStageUpdateRequest(BaseModel):
    stage: str = Field(..., min_length=1)
    reason: Optional[str] = None


class PipelineReopenRequest(BaseModel):
    reason: Optional[str] = None


class LostReminderRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    due_date: Optional[str] = None


class LostNurtureRequest(BaseModel):
    note: Optional[str] = None


@router.get("")
async def get_pipeline(
    limit: int = Query(500, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
):
    return await CRMPipelineService.load_pipeline(current_user, limit=limit)


@router.patch("/{lead_id}/stage")
async def update_stage(lead_id: str, payload: PipelineStageUpdateRequest, current_user: User = Depends(get_current_user)):
    return await CRMPipelineService.move_lead(current_user, lead_id, payload.stage, payload.reason)


@router.post("/{lead_id}/reopen")
async def reopen_lost_lead(lead_id: str, payload: PipelineReopenRequest, current_user: User = Depends(get_current_user)):
    return await CRMPipelineService.reopen_lost_lead(current_user, lead_id, payload.reason)


@router.post("/{lead_id}/reminder")
async def create_lost_reminder(lead_id: str, payload: LostReminderRequest, current_user: User = Depends(get_current_user)):
    from datetime import datetime

    due_date = datetime.fromisoformat(payload.due_date) if payload.due_date else None
    return await CRMPipelineService.create_lost_reminder(
        current_user,
        lead_id,
        title=payload.title,
        description=payload.description,
        due_date=due_date,
    )


@router.post("/{lead_id}/nurture")
async def nurture_lost_lead(lead_id: str, payload: LostNurtureRequest, current_user: User = Depends(get_current_user)):
    return await CRMPipelineService.nurture_lost_lead(current_user, lead_id, note=payload.note)


@router.get("/lost/analytics")
async def lost_analytics(current_user: User = Depends(get_current_user)):
    return await CRMPipelineService.lost_analytics(current_user)


@router.get("/history/{lead_id}")
async def get_history(lead_id: str, current_user: User = Depends(get_current_user)):
    return await CRMPipelineService.get_history(current_user, lead_id)
