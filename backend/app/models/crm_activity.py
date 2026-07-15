"""
CRM Activity Model - Lead, Company, and Contact activity records.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class CRMActivityType(str, Enum):
    CALL = "call"
    MEETING = "meeting"
    TASK = "task"
    EMAIL = "email"
    REMINDER = "reminder"
    FOLLOW_UP = "follow_up"
    NOTE = "note"
    FILE = "file"
    PIPELINE_CHANGE = "pipeline_change"


class CRMActivityStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CRMActivityPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class CRMActivity(Document):
    company_id: Indexed(str)
    entity_type: Indexed(str)
    entity_id: Indexed(str)
    activity_type: Indexed(str)

    title: str
    description: Optional[str] = None
    status: CRMActivityStatus = CRMActivityStatus.DRAFT
    priority: CRMActivityPriority = CRMActivityPriority.MEDIUM

    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    due_date: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    completed_by_name: Optional[str] = None

    metadata: Dict[str, Any] = Field(default_factory=dict)

    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None
    deleted_by: Optional[str] = None
    deleted_by_name: Optional[str] = None

    deleted: bool = False
    deleted_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "crm_activities"
        indexes = [
            "company_id",
            "entity_type",
            "entity_id",
            "activity_type",
            "status",
            "owner_id",
            "deleted",
            "due_date",
            IndexModel([("company_id", ASCENDING), ("entity_type", ASCENDING), ("entity_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("activity_type", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("owner_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("status", ASCENDING), ("due_date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("owner_id", ASCENDING), ("due_date", ASCENDING)]),
        ]
