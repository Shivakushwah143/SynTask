from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


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
    DRAFT = "draft"
    PLANNED = "planned"
    SHOOT_SCHEDULED = "shoot_scheduled"
    SHOT = "shot"
    EDITING = "editing"
    INTERNAL_REVIEW = "internal_review"
    CLIENT_REVIEW = "client_review"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"


class ContentItemPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ContentCalendarItem(Document):
    company_id: Indexed(str)
    project_id: Indexed(str)
    client_id: Optional[str] = None
    campaign: Optional[str] = None
    platform: Optional[str] = None
    title: str
    content_type: ContentItemType = ContentItemType.CUSTOM
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    due_date: Optional[datetime] = None
    publish_date: Optional[datetime] = None
    priority: ContentItemPriority = ContentItemPriority.MEDIUM
    status: ContentItemStatus = ContentItemStatus.DRAFT
    notes: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    file_ids: List[str] = Field(default_factory=list)
    file_urls: List[str] = Field(default_factory=list)
    deliverable_target: Optional[int] = None
    completed: bool = False
    shoot_date: Optional[datetime] = None
    location: Optional[str] = None
    photographer: Optional[str] = None
    team: List[str] = Field(default_factory=list)
    assets_required: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    draft_at: datetime = Field(default_factory=datetime.utcnow)
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
            "content_type",
            "status",
            "assignee_id",
            "publish_date",
            "due_date",
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("publish_date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("publish_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("content_type", ASCENDING), ("updated_at", DESCENDING)]),
        ]
