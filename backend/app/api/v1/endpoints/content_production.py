"""
Content Production API — lifecycle tabs, transitions, versions, reviews, publishing, library.
"""
from __future__ import annotations

from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, model_validator

from app.api.dependencies import get_current_user, require_module
from app.models.user import User
from app.services.content_production_service import ContentProductionService

router = APIRouter(dependencies=[Depends(require_module("content_calendar"))])


# ── Request schemas ────────────────────────────────────────────────────────

_DATETIME_FIELDS = {
    'due_date', 'publish_date', 'start_date', 'end_date',
    'deadline', 'shoot_date',
}


def _normalize_datetime_fields(values: dict) -> dict:
    """Convert empty strings → None and date-only strings → datetime for all datetime fields."""
    for field in _DATETIME_FIELDS:
        v = values.get(field)
        if v is None or (isinstance(v, str) and v.strip() == ''):
            values[field] = None
        elif isinstance(v, str):
            # Accept "YYYY-MM-DD" from <input type="date"> — append midnight
            if len(v) == 10 and v.count('-') == 2:
                values[field] = v + 'T00:00:00'
    return values


class ContentCreatePayload(BaseModel):
    project_id: str = Field(...)
    client_id: Optional[str] = None
    service_id: Optional[str] = None
    deliverable_id: Optional[str] = None
    campaign: Optional[str] = None
    platform: Optional[str] = None
    title: str = Field(...)
    content_type: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    # Briefing
    objective: Optional[str] = None
    target_audience: Optional[str] = None
    key_message: Optional[str] = None
    hook: Optional[str] = None
    cta: Optional[str] = None
    tone: Optional[str] = None
    # Content body
    caption: Optional[str] = None
    script: Optional[str] = None
    creative_brief: Optional[str] = None
    # Assignment
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    owner_id: Optional[str] = None
    team: List[str] = Field(default_factory=list)
    due_date: Optional[datetime] = None
    publish_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    time: Optional[str] = None
    deadline: Optional[datetime] = None
    # Priority & status
    priority: Optional[str] = None
    status: Optional[str] = None
    # Production
    shoot_date: Optional[datetime] = None
    location: Optional[str] = None
    photographer: Optional[str] = None
    assets_required: List[str] = Field(default_factory=list)
    references: List[str] = Field(default_factory=list)
    # Files
    file_ids: List[str] = Field(default_factory=list)
    file_urls: List[str] = Field(default_factory=list)
    attachment: Optional[str] = None
    # Tags & metadata
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    assigned_person: Optional[str] = None
    reminder: Optional[str] = None
    color: Optional[str] = None
    deliverable_target: Optional[int] = None
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode='before')
    @classmethod
    def normalize_dates(cls, values):
        return _normalize_datetime_fields(values)


class ContentUpdatePayload(BaseModel):
    title: Optional[str] = None
    content_type: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    client_id: Optional[str] = None
    service_id: Optional[str] = None
    deliverable_id: Optional[str] = None
    campaign: Optional[str] = None
    platform: Optional[str] = None
    priority: Optional[str] = None
    objective: Optional[str] = None
    target_audience: Optional[str] = None
    key_message: Optional[str] = None
    hook: Optional[str] = None
    cta: Optional[str] = None
    tone: Optional[str] = None
    caption: Optional[str] = None
    script: Optional[str] = None
    creative_brief: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    owner_id: Optional[str] = None
    team: List[str] = Field(default_factory=list)
    due_date: Optional[datetime] = None
    publish_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    time: Optional[str] = None
    deadline: Optional[datetime] = None
    shoot_date: Optional[datetime] = None
    location: Optional[str] = None
    photographer: Optional[str] = None
    assets_required: List[str] = Field(default_factory=list)
    references: List[str] = Field(default_factory=list)
    file_ids: List[str] = Field(default_factory=list)
    file_urls: List[str] = Field(default_factory=list)
    attachment: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    @model_validator(mode='before')
    @classmethod
    def normalize_dates(cls, values):
        return _normalize_datetime_fields(values)
    notes: Optional[str] = None
    assigned_person: Optional[str] = None
    reminder: Optional[str] = None
    color: Optional[str] = None
    deliverable_target: Optional[int] = None
    completed: Optional[bool] = None
    metadata: dict = Field(default_factory=dict)


class StatusTransitionPayload(BaseModel):
    status: str = Field(...)
    notes: Optional[str] = None
    feedback: Optional[str] = None


class ReviewActionPayload(BaseModel):
    decision: str = Field(...)  # approve, request_revision, reject
    feedback: Optional[str] = None
    issues: List[str] = Field(default_factory=list)


class VersionCreatePayload(BaseModel):
    caption: Optional[str] = None
    script: Optional[str] = None
    creative_brief: Optional[str] = None
    file_ids: List[str] = Field(default_factory=list)
    file_urls: List[str] = Field(default_factory=list)
    feedback: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("")
async def get_content_workspace(
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, alias="status"),
    client_id: Optional[str] = Query(None),
    service_id: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    content_type: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    owner_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Main content workspace — lifecycle tabs, overview, and filtered items."""
    return await ContentProductionService.aggregate(
        current_user,
        project_id=project_id,
        status_filter=status,
        client_id=client_id,
        service_id=service_id,
        platform=platform,
        content_type=content_type,
        priority=priority,
        owner_id=owner_id,
        search=search,
    )


@router.get("/calendar")
async def get_content_calendar(
    project_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Calendar view — backward-compatible with existing frontend."""
    return await ContentProductionService.calendar_view(current_user, project_id)


@router.get("/library")
async def get_content_library(
    client_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """Content Library — historical/completed content items."""
    return await ContentProductionService.content_library(
        current_user,
        client_id=client_id,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.get("/{item_id}")
async def get_content_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a single content item with all details."""
    return await ContentProductionService.get_item(current_user, item_id)


@router.get("/{item_id}/allowed-transitions")
async def get_allowed_transitions(
    item_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get allowed next statuses for a content item."""
    return await ContentProductionService.get_allowed_transitions(current_user, item_id)


@router.post("")
async def create_content_item(
    payload: ContentCreatePayload,
    current_user: User = Depends(get_current_user),
):
    """Create a new content item."""
    return await ContentProductionService.create_item(current_user, payload.model_dump())


@router.patch("/{item_id}")
async def update_content_item(
    item_id: str,
    payload: ContentUpdatePayload,
    current_user: User = Depends(get_current_user),
):
    """Update content item fields."""
    return await ContentProductionService.update_item(current_user, item_id, payload.model_dump(exclude_unset=True))


@router.post("/{item_id}/transition")
async def transition_status(
    item_id: str,
    payload: StatusTransitionPayload,
    current_user: User = Depends(get_current_user),
):
    """Transition content item to a new status."""
    return await ContentProductionService.transition_status(
        current_user, item_id, payload.status, notes=payload.notes, feedback=payload.feedback,
    )


@router.post("/{item_id}/internal-review")
async def internal_review(
    item_id: str,
    payload: ReviewActionPayload,
    current_user: User = Depends(get_current_user),
):
    """Process an internal review action."""
    return await ContentProductionService.internal_review_action(
        current_user, item_id, payload.decision, feedback=payload.feedback, issues=payload.issues,
    )


@router.post("/{item_id}/client-review")
async def client_review(
    item_id: str,
    payload: ReviewActionPayload,
    current_user: User = Depends(get_current_user),
):
    """Process a client review action."""
    return await ContentProductionService.client_review_action(
        current_user, item_id, payload.decision, feedback=payload.feedback,
    )


@router.post("/{item_id}/versions")
async def create_version(
    item_id: str,
    payload: VersionCreatePayload,
    current_user: User = Depends(get_current_user),
):
    """Create a new version of the content item."""
    return await ContentProductionService.create_version(
        current_user, item_id,
        caption=payload.caption,
        script=payload.script,
        creative_brief=payload.creative_brief,
        file_ids=payload.file_ids,
        file_urls=payload.file_urls,
        feedback=payload.feedback,
    )


@router.delete("/{item_id}")
async def delete_content_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a content item."""
    return await ContentProductionService.delete_item(current_user, item_id)
