from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class ClientOnboardingStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    READY = "ready"
    COMPLETED = "completed"


class ClientOnboardingItemStatus(str, Enum):
    MISSING = "missing"
    NOT_STARTED = "not_started"
    REQUESTED = "requested"
    PARTIALLY_RECEIVED = "partially_received"
    DRAFT = "draft"
    SENT = "sent"
    VIEWED_RECEIVED = "viewed_received"
    SIGNED_CONFIRMED = "signed_confirmed"
    ADDED = "added"
    CONFIRMED = "confirmed"
    CREATED = "created"
    TEAM_ASSIGNED = "team_assigned"
    READY = "ready"
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    OPTIONAL = "optional"


class ClientOnboarding(Document):
    client_id: Indexed(str)
    company_id: Indexed(str)
    status: ClientOnboardingStatus = ClientOnboardingStatus.IN_PROGRESS
    progress_percent: int = 0
    required_total: int = 0
    required_completed: int = 0
    blocking_item_keys: List[str] = Field(default_factory=list)
    next_action: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "client_onboardings"
        indexes = [
            "client_id",
            "company_id",
            IndexModel([("company_id", ASCENDING), ("client_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)]),
        ]


class ClientOnboardingItem(Document):
    onboarding_id: Indexed(str)
    client_id: Indexed(str)
    company_id: Indexed(str)
    key: Indexed(str)
    label: str
    layer: str
    required: bool = True
    status: ClientOnboardingItemStatus = ClientOnboardingItemStatus.MISSING
    completion_percent: int = 0
    assigned_owner_id: Optional[str] = None
    linked_entity_type: Optional[str] = None
    linked_entity_id: Optional[str] = None
    tab: str = "onboarding"
    action_label: Optional[str] = None
    notes: Optional[str] = None
    validation: Dict[str, Any] = Field(default_factory=dict)
    audit_history: List[Dict[str, Any]] = Field(default_factory=list)
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "client_onboarding_items"
        indexes = [
            "onboarding_id",
            "client_id",
            "company_id",
            "key",
            IndexModel([("company_id", ASCENDING), ("client_id", ASCENDING), ("key", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("required", ASCENDING), ("status", ASCENDING)]),
        ]
