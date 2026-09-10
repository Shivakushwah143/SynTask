"""
Content Production API — lifecycle tabs, transitions, versions, reviews, publishing, library.
"""
from __future__ import annotations

from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from app.api.dependencies import get_current_user, require_module, require_capability
from app.models.content_calendar import ContentCalendarItem
from app.models.user import User
from app.services.content_production_service import ContentProductionService, require_content_capability

router = APIRouter(dependencies=[Depends(require_module("content_calendar"))])

# Action-level capability gates (same RBAC engine as attendance/payroll etc.).
# The service layer re-checks these, so manual API calls without the UI cannot
# bypass authorization.
CAP_EDIT = "content.edit"
CAP_DELETE = "content.delete"
CAP_TRANSITION = "content.transition"
CAP_INTERNAL_REVIEW = "content.internal_review"
CAP_CLIENT_REVIEW = "content.client_review"
CAP_VIEW_PUBLISHING = "content.view_publishing"
CAP_UPDATE_PUBLISHING = "content.update_publishing"
CAP_COMMENTS = "content.comment"


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
    notes: Optional[str] = None
    assigned_person: Optional[str] = None
    reminder: Optional[str] = None
    color: Optional[str] = None
    deliverable_target: Optional[int] = None
    completed: Optional[bool] = None
    metadata: dict = Field(default_factory=dict)

    @model_validator(mode='before')
    @classmethod
    def normalize_dates(cls, values):
        return _normalize_datetime_fields(values)


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

@router.get("/published")
async def get_published_items(
    client_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """Published content items — driven by Publishing truth."""
    return await ContentProductionService.get_published_items(
        current_user,
        client_id=client_id,
        limit=limit,
        offset=offset,
    )


@router.get("/{item_id}/publishing")
async def get_publishing_record(
    item_id: str,
    current_user: User = Depends(require_capability(CAP_VIEW_PUBLISHING)),
):
    """Get the canonical publishing record for a content item."""
    return await ContentProductionService.get_publishing_record(current_user, item_id)


class PublishingUpdatePayload(BaseModel):
    status: str = Field(...)
    scheduled_date: Optional[str] = None
    external_post_id: Optional[str] = None
    external_url: Optional[str] = None
    error_message: Optional[str] = None


@router.patch("/{item_id}/publishing")
async def update_publishing_status(
    item_id: str,
    payload: PublishingUpdatePayload,
    current_user: User = Depends(require_capability(CAP_UPDATE_PUBLISHING)),
):
    """Update publishing record status (called by Publishing Centre)."""
    return await ContentProductionService.update_publishing_status(
        current_user, item_id, payload.status,
        scheduled_date=payload.scheduled_date,
        external_post_id=payload.external_post_id,
        external_url=payload.external_url,
        error_message=payload.error_message,
    )


@router.get("/{item_id}/comments")
async def list_comments(
    item_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """List comments for a content item (company-isolated in the service layer)."""
    return await ContentProductionService.list_comments(current_user, item_id, limit=limit, offset=offset)


class CommentCreatePayload(BaseModel):
    text: str = Field(...)
    attachments: List[str] = Field(default_factory=list)


@router.post("/{item_id}/comments")
async def add_comment(
    item_id: str,
    payload: CommentCreatePayload,
    current_user: User = Depends(require_capability(CAP_COMMENTS)),
):
    """Add a comment to a content item (comments are separate from review decisions)."""
    return await ContentProductionService.add_comment(current_user, item_id, payload.text, attachments=payload.attachments)


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a comment (author or admin only)."""
    return await ContentProductionService.delete_comment(current_user, comment_id)


@router.post("/validate-relationships")
async def validate_relationships(
    client_id: Optional[str] = Query(None),
    service_id: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    deliverable_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Validate that supplied relationships are consistent within company context."""
    return await ContentProductionService.validate_relationships(
        current_user,
        client_id=client_id,
        service_id=service_id,
        project_id=project_id,
        deliverable_id=deliverable_id,
    )


# ── Content Overview (operational command center) ─────────────────────────
# Registered BEFORE the dynamic /{item_id} route (same reason as /templates).

@router.get("/overview")
async def get_content_overview(
    limit_per_queue: int = Query(8, ge=0, le=50),
    current_user: User = Depends(get_current_user),
):
    """Operational overview aggregate — all metrics/queues/workload/shoots from
    canonical Content Items. One endpoint; the frontend computes nothing."""
    return await ContentProductionService.content_overview(current_user, limit_per_queue=limit_per_queue)


@router.get("/overview/recommendations")
async def get_content_recommendations(
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """Deterministic Content recommendations (no LLM calls)."""
    return await ContentProductionService.ai_suggestions_for_overview(current_user, limit=limit)


class ContentAIActionPayload(BaseModel):
    action: str = Field(...)


@router.post("/{item_id}/ai")
async def run_content_ai_action(
    item_id: str,
    payload: ContentAIActionPayload,
    current_user: User = Depends(get_current_user),
):
    """Run a contextual AI action on a Content Item.

    Returns a suggestion bound to a target field. AI never mutates the item —
    the user must explicitly accept the suggestion through the normal update
    endpoint, so lifecycle/review/publishing state can only change by humans.
    """
    return await ContentProductionService.ai_action(current_user, item_id, payload.action)


@router.get("/{item_id}/ai-actions")
async def list_content_ai_actions(
    item_id: str,
    current_user: User = Depends(get_current_user),
):
    """List the contextual AI actions available at the item's current stage.

    Derived from the backend's stage map — the frontend renders only what the
    backend says is relevant for this lifecycle stage.
    """
    from app.services.content_production_service import AI_ACTIONS, AI_ACTION_STAGES

    item = await ContentCalendarItem.get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Content item not found")
    await require_content_capability(current_user, CAP_EDIT, "content.view")
    # Company isolation: resolving the item's project enforces tenant access.
    from app.services.content_production_service import _load_project
    await _load_project(current_user, str(item.project_id))

    stage = item.status.value if item.status else "idea"
    actions = [
        {
            "action": name,
            "target_field": spec.get("target_field"),
            "label": name.replace("_", " ").title(),
        }
        for name, spec in AI_ACTIONS.items()
        if AI_ACTION_STAGES.get(name) is None or stage in AI_ACTION_STAGES[name]
    ]
    return {"stage": stage, "actions": actions}


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
    current_user: User = Depends(require_capability(CAP_EDIT)),
):
    """Update content item fields."""
    return await ContentProductionService.update_item(current_user, item_id, payload.model_dump(exclude_unset=True))


@router.post("/{item_id}/transition")
async def transition_status(
    item_id: str,
    payload: StatusTransitionPayload,
    current_user: User = Depends(require_capability(CAP_TRANSITION)),
):
    """Transition content item to a new status."""
    return await ContentProductionService.transition_status(
        current_user, item_id, payload.status, notes=payload.notes, feedback=payload.feedback,
    )


@router.post("/{item_id}/internal-review")
async def internal_review(
    item_id: str,
    payload: ReviewActionPayload,
    current_user: User = Depends(require_capability(CAP_INTERNAL_REVIEW)),
):
    """Process an internal review action."""
    return await ContentProductionService.internal_review_action(
        current_user, item_id, payload.decision, feedback=payload.feedback, issues=payload.issues,
    )


@router.post("/{item_id}/client-review")
async def client_review(
    item_id: str,
    payload: ReviewActionPayload,
    current_user: User = Depends(require_capability(CAP_CLIENT_REVIEW)),
):
    """Process a client review action."""
    return await ContentProductionService.client_review_action(
        current_user, item_id, payload.decision, feedback=payload.feedback,
    )


@router.post("/{item_id}/versions")
async def create_version(
    item_id: str,
    payload: VersionCreatePayload,
    current_user: User = Depends(require_capability(CAP_EDIT)),
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
    current_user: User = Depends(require_capability(CAP_DELETE)),
):
    """Delete a content item."""
    return await ContentProductionService.delete_item(current_user, item_id)
