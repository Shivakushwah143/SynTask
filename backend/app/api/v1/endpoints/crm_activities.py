from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.crm.activities import CRMActivitiesService
from app.models.user import User
from app.api.deps import Pagination100, PaginationParams

router = APIRouter()


class CRMActivityCreatePayload(BaseModel):
    entity_type: str
    entity_id: str
    activity_type: str
    title: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None
    due_date: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CRMActivityUpdatePayload(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None
    due_date: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    snooze_until: Optional[datetime] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    complete: Optional[bool] = None


@router.get("")
async def list_activities(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    activity_type: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    owner_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    pagination: PaginationParams = Pagination100,
    current_user: User = Depends(get_current_user),
):
    skip, limit = pagination.skip, pagination.limit
    return await CRMActivitiesService.list_activities(
        current_user,
        entity_type=entity_type,
        entity_id=entity_id,
        activity_type=activity_type,
        status_value=status,
        priority=priority,
        owner_id=owner_id,
        search=search,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )


@router.post("")
async def create_activity(payload: CRMActivityCreatePayload, current_user: User = Depends(get_current_user)):
    return await CRMActivitiesService.create_activity(current_user, payload.model_dump())


@router.patch("/{activity_id}")
async def update_activity(activity_id: str, payload: CRMActivityUpdatePayload, current_user: User = Depends(get_current_user)):
    return await CRMActivitiesService.update_activity(current_user, activity_id, payload.model_dump(exclude_unset=True))


@router.delete("/{activity_id}")
async def delete_activity(activity_id: str, current_user: User = Depends(get_current_user)):
    return await CRMActivitiesService.delete_activity(current_user, activity_id)
