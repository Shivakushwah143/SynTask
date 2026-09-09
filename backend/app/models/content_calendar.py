from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


# ── Enums ──────────────────────────────────────────────────────────────────

class ContentItemType(str, Enum):
    REEL = "reel"
    STATIC_POST = "static_post"
    CAROUSEL = "carousel"
    STORY = "story"
    BLOG = "blog"
    YOUTUBE = "youtube"
    EMAIL_CAMPAIGN = "email_campaign"
    SHOOT_DAY = "shoot_day"
    CUSTOM = "custom"


class ContentItemStatus(str, Enum):
    # New production lifecycle (canonical)
    IDEA = "idea"
    BRIEFING = "briefing"
    SCRIPT = "script"
    PRODUCTION = "production"
    INTERNAL_REVIEW = "internal_review"
    CLIENT_REVIEW = "client_review"
    REVISION_REQUIRED = "revision_required"
    APPROVED = "approved"
    READY_TO_PUBLISH = "ready_to_publish"
    PUBLISHED = "published"
    # Legacy statuses (mapped for backward compatibility)
    DRAFT = "draft"
    PLANNED = "planned"
    SHOOT_SCHEDULED = "shoot_scheduled"
    SHOT = "shot"
    EDITING = "editing"
    SCHEDULED = "scheduled"


class ContentItemPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ContentReviewDecision(str, Enum):
    APPROVE = "approve"
    REQUEST_REVISION = "request_revision"
    REJECT = "reject"


class ContentPublishingStatus(str, Enum):
    NOT_STARTED = "not_started"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    FAILED = "failed"


# ── Embedded sub-documents ─────────────────────────────────────────────────

class ContentVersion(BaseModel):
    """A immutable snapshot of content at a point in time."""
    version_number: int
    caption: Optional[str] = None
    script: Optional[str] = None
    creative_brief: Optional[str] = None
    files: List[str] = Field(default_factory=list)
    file_urls: List[str] = Field(default_factory=list)
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    review_result: Optional[str] = None
    feedback: Optional[str] = None


class ContentReviewRecord(BaseModel):
    """Audit trail of a single review action."""
    reviewer_id: str
    reviewer_name: Optional[str] = None
    version_number: int
    decision: ContentReviewDecision
    feedback: Optional[str] = None
    issues: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ContentPublishingRecord(BaseModel):
    """Link to publishing execution — Publishing is source of truth for publish state."""
    platform: Optional[str] = None
    status: ContentPublishingStatus = ContentPublishingStatus.NOT_STARTED
    scheduled_date: Optional[datetime] = None
    published_date: Optional[datetime] = None
    external_post_id: Optional[str] = None
    external_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ContentHistoryEntry(BaseModel):
    """Generic audit trail entry for any meaningful workflow action."""
    action: str
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    version_number: Optional[int] = None
    details: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ── Main Document ──────────────────────────────────────────────────────────

class ContentCalendarItem(Document):
    # ── Identity & relationships ───────────────────────────────────────────
    company_id: Indexed(str)
    project_id: Indexed(str)
    client_id: Optional[str] = None
    service_id: Optional[str] = None          # ClientService reference
    deliverable_id: Optional[str] = None      # ClientDeliverable reference
    content_id: Optional[str] = None          # Human-readable ID e.g. CNT-001

    # ── Content details ────────────────────────────────────────────────────
    campaign: Optional[str] = None
    platform: Optional[str] = None
    title: str
    content_type: ContentItemType = ContentItemType.CUSTOM
    category: Optional[str] = None
    description: Optional[str] = None

    # ── Briefing fields ────────────────────────────────────────────────────
    objective: Optional[str] = None
    target_audience: Optional[str] = None
    key_message: Optional[str] = None
    hook: Optional[str] = None
    cta: Optional[str] = None                 # Call to action
    tone: Optional[str] = None

    # ── Content body ───────────────────────────────────────────────────────
    caption: Optional[str] = None
    script: Optional[str] = None
    creative_brief: Optional[str] = None

    # ── Assignment & scheduling ────────────────────────────────────────────
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

    # ── Priority & status ──────────────────────────────────────────────────
    priority: ContentItemPriority = ContentItemPriority.MEDIUM
    status: ContentItemStatus = ContentItemStatus.IDEA
    completed: bool = False

    # ── Production details ─────────────────────────────────────────────────
    shoot_date: Optional[datetime] = None
    location: Optional[str] = None
    photographer: Optional[str] = None
    assets_required: List[str] = Field(default_factory=list)
    references: List[str] = Field(default_factory=list)

    # ── Files & assets ─────────────────────────────────────────────────────
    file_ids: List[str] = Field(default_factory=list)
    file_urls: List[str] = Field(default_factory=list)
    attachment: Optional[str] = None

    # ── Tags & metadata ────────────────────────────────────────────────────
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    assigned_person: Optional[str] = None
    reminder: Optional[str] = None
    color: Optional[str] = None
    deliverable_target: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    # ── Versioning ─────────────────────────────────────────────────────────
    current_version: int = 1
    versions: List[ContentVersion] = Field(default_factory=list)

    # ── Review & approval history ──────────────────────────────────────────
    internal_reviews: List[ContentReviewRecord] = Field(default_factory=list)
    client_approvals: List[ContentReviewRecord] = Field(default_factory=list)

    # ── Publishing ─────────────────────────────────────────────────────────
    publishing: Optional[ContentPublishingRecord] = None

    # ── Workflow history (audit trail) ─────────────────────────────────────
    history: List[ContentHistoryEntry] = Field(default_factory=list)

    # ── Legacy timestamps (preserved for backward compat) ──────────────────
    draft_at: Optional[datetime] = None
    planned_at: Optional[datetime] = None
    shoot_scheduled_at: Optional[datetime] = None
    shot_at: Optional[datetime] = None
    editing_started_at: Optional[datetime] = None
    internal_review_at: Optional[datetime] = None
    client_review_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    deadline_missed_at: Optional[datetime] = None

    # ── Lifecycle timestamps (new canonical) ───────────────────────────────
    idea_at: Optional[datetime] = None
    briefing_at: Optional[datetime] = None
    script_at: Optional[datetime] = None
    production_at: Optional[datetime] = None
    revision_required_at: Optional[datetime] = None
    ready_to_publish_at: Optional[datetime] = None

    # ── Audit ──────────────────────────────────────────────────────────────
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "content_calendar_items"
        indexes = [
            "company_id",
            "project_id",
            "client_id",
            "service_id",
            "deliverable_id",
            "content_id",
            "content_type",
            "status",
            "assignee_id",
            "owner_id",
            "publish_date",
            "due_date",
            "deadline",
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("publish_date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("publish_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("content_type", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("due_date", ASCENDING)]),
        ]


# ── Content Template ───────────────────────────────────────────────────────

class ContentTemplate(Document):
    """Reusable content template for quick content creation."""
    company_id: Indexed(str)
    name: str
    description: Optional[str] = None
    content_type: ContentItemType = ContentItemType.CUSTOM
    platform: Optional[str] = None
    default_objective: Optional[str] = None
    default_target_audience: Optional[str] = None
    default_key_message: Optional[str] = None
    default_tone: Optional[str] = None
    default_cta: Optional[str] = None
    default_tags: List[str] = Field(default_factory=list)
    default_assets_required: List[str] = Field(default_factory=list)
    is_active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "content_templates"
        indexes = [
            "company_id",
            "is_active",
        ]
