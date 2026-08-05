"""
CRM pipeline backend endpoints.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.crm.pipeline import CRMPipelineService
from app.models.user import User

router = APIRouter()


class PipelineStageUpdateRequest(BaseModel):
    stage: str = Field(..., min_length=1)
    reason: Optional[str] = None
    # Managers/admins may bypass stage-gate conditions (never skip stages).
    force: bool = False


class ConversionUpdateRequest(BaseModel):
    """Idempotent Won-stage conversion actions."""
    action: str = Field(..., min_length=1)  # won_status | create_invoice | assign_account_manager | send_welcome_email | notify_operations
    won_status: Optional[str] = None
    user_id: Optional[str] = None


class PipelineStatusUpdateRequest(BaseModel):
    """Stage-scoped inner-status update (stage is read from the database)."""
    stage_status: str = Field(..., min_length=1)


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
    return await CRMPipelineService.move_lead(current_user, lead_id, payload.stage, payload.reason, force=payload.force)


@router.patch("/{lead_id}/status")
async def update_stage_status(lead_id: str, payload: PipelineStatusUpdateRequest, current_user: User = Depends(get_current_user)):
    return await CRMPipelineService.update_stage_status(current_user, lead_id, payload.stage_status)


@router.patch("/{lead_id}/conversion")
async def update_conversion(lead_id: str, payload: ConversionUpdateRequest, current_user: User = Depends(get_current_user)):
    from app.crm.conversion import LeadConversionService

    if payload.action == "won_status":
        if not payload.won_status:
            raise HTTPException(status_code=422, detail="won_status is required for the won_status action")
        return await LeadConversionService.update_won_status(current_user, lead_id, payload.won_status)
    if payload.action == "create_invoice":
        return await LeadConversionService.create_invoice(current_user, lead_id)
    if payload.action == "assign_account_manager":
        if not payload.user_id:
            raise HTTPException(status_code=422, detail="user_id is required for assign_account_manager")
        return await LeadConversionService.assign_account_manager(current_user, lead_id, payload.user_id)
    if payload.action == "send_welcome_email":
        return await LeadConversionService.send_welcome_email(current_user, lead_id)
    if payload.action == "notify_operations":
        return await LeadConversionService.notify_operations(current_user, lead_id)
    raise HTTPException(status_code=422, detail="Unknown conversion action")


@router.post("/{lead_id}/transfer")
async def transfer_to_clients(lead_id: str, current_user: User = Depends(get_current_user)):
    from app.crm.conversion import LeadConversionService

    return await LeadConversionService.transfer_to_clients(current_user, lead_id)


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
