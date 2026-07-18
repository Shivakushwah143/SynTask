from __future__ import annotations

from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user, require_module
from app.models.user import User
from app.services.content_calendar_service import ContentCalendarService

router = APIRouter(dependencies=[Depends(require_module("task"))])


class ContentCalendarItemPayload(BaseModel):
    project_id: str = Field(...)
    client_id: Optional[str] = None
    campaign: Optional[str] = None
    platform: Optional[str] = None
    title: str = Field(...)
    content_type: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    due_date: Optional[datetime] = None
    publish_date: Optional[datetime] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    file_ids: list[str] = Field(default_factory=list)
    file_urls: list[str] = Field(default_factory=list)
    deliverable_target: Optional[int] = None
    shoot_date: Optional[datetime] = None
    location: Optional[str] = None
    photographer: Optional[str] = None
    team: list[str] = Field(default_factory=list)
    assets_required: list[str] = Field(default_factory=list)
    category: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    time: Optional[str] = None
    assigned_person: Optional[str] = None
    reminder: Optional[str] = None
    color: Optional[str] = None
    attachment: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class ContentCalendarItemUpdatePayload(BaseModel):
    title: Optional[str] = None
    content_type: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    due_date: Optional[datetime] = None
    publish_date: Optional[datetime] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    file_ids: list[str] = Field(default_factory=list)
    file_urls: list[str] = Field(default_factory=list)
    deliverable_target: Optional[int] = None
    shoot_date: Optional[datetime] = None
    location: Optional[str] = None
    photographer: Optional[str] = None
    team: list[str] = Field(default_factory=list)
    assets_required: list[str] = Field(default_factory=list)
    category: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    time: Optional[str] = None
    assigned_person: Optional[str] = None
    reminder: Optional[str] = None
    color: Optional[str] = None
    attachment: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


@router.get("")
async def get_calendar(project_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    return await ContentCalendarService.aggregate(current_user, project_id)


@router.get("/items")
async def list_items(project_id: Optional[str] = None, current_user: User = Depends(get_current_user)):
    return await ContentCalendarService.list_items(current_user, project_id)


@router.post("/items")
async def create_item(payload: ContentCalendarItemPayload, current_user: User = Depends(get_current_user)):
    return await ContentCalendarService.create_item(current_user, payload.model_dump())


@router.patch("/items/{item_id}")
async def update_item(item_id: str, payload: ContentCalendarItemUpdatePayload, current_user: User = Depends(get_current_user)):
    return await ContentCalendarService.update_item(current_user, item_id, payload.model_dump(exclude_unset=True))


@router.delete("/items/{item_id}")
async def delete_item(item_id: str, current_user: User = Depends(get_current_user)):
    return await ContentCalendarService.delete_item(current_user, item_id)
