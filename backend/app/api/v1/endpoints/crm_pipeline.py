"""
CRM pipeline backend endpoints.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user, require_module
from app.crm.pipeline import CRMPipelineService
from app.models.user import User

router = APIRouter(dependencies=[Depends(require_module("sales"))])


class PipelineStageUpdateRequest(BaseModel):
    stage: str = Field(..., min_length=1)
    reason: Optional[str] = None


@router.get("")
async def get_pipeline(current_user: User = Depends(get_current_user)):
    return await CRMPipelineService.load_pipeline(current_user)


@router.patch("/{lead_id}/stage")
async def update_stage(lead_id: str, payload: PipelineStageUpdateRequest, current_user: User = Depends(get_current_user)):
    return await CRMPipelineService.move_lead(current_user, lead_id, payload.stage, payload.reason)


@router.get("/history/{lead_id}")
async def get_history(lead_id: str, current_user: User = Depends(get_current_user)):
    return await CRMPipelineService.get_history(current_user, lead_id)
