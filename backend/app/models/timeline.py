"""
Employee Timeline models.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class TimelineEventType(str, Enum):
    TASK_ASSIGNED = "task_assigned"
    TASK_STARTED = "task_started"
    TASK_SUBMITTED_FOR_REVIEW = "task_submitted_for_review"
    TASK_REVISION_REQUESTED = "task_revision_requested"
    TASK_APPROVED = "task_approved"
    TASK_COMPLETED = "task_completed"
    TASK_UPDATED = "task_updated"
    TASK_REOPENED = "task_reopened"
    TASK_CANCELLED = "task_cancelled"
    TASK_DELETED = "task_deleted"
    TASK_DUE_TODAY = "task_due_today"
    TASK_OVERDUE = "task_overdue"
    TASK_EXTENSION_REQUESTED = "task_extension_requested"
    TASK_EXTENSION_APPROVED = "task_extension_approved"
    TASK_EXTENSION_REJECTED = "task_extension_rejected"
    ATTENDANCE_CHECK_IN = "attendance_check_in"
    ATTENDANCE_CHECK_OUT = "attendance_check_out"
    MEETING_CREATED = "meeting_created"
    MEETING_JOINED = "meeting_joined"
    MEETING_COMPLETED = "meeting_completed"
    LEAVE_REQUESTED = "leave_requested"
    LEAVE_APPROVED = "leave_approved"
    LEAVE_REJECTED = "leave_rejected"
    LEAVE_CANCELLED = "leave_cancelled"
    LEAVE_STARTED = "leave_started"
    LEAVE_ENDED = "leave_ended"
    WFH_APPROVED = "wfh_approved"
    WFH_STARTED = "wfh_started"
    WFH_ENDED = "wfh_ended"
    EOD_SUBMITTED = "eod_submitted"
    EOD_UPDATED = "eod_updated"


class TimelineModule(str, Enum):
    TASK = "task"
    MEETING = "meeting"
    ATTENDANCE = "attendance"
    LEAVE = "leave"
    EOD = "eod"


class TimelineEvent(Document):
    """Chronological employee activity event."""

    user_id: Indexed(str)
    company_id: Optional[str] = None
    event_type: TimelineEventType
    title: str
    description: Optional[str] = None
    related_module: TimelineModule
    related_record_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    idempotency_key: Optional[str] = None
    actor_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "timeline_events"
        indexes = [
            "user_id",
            "company_id",
            "event_type",
            "related_module",
            "related_record_id",
            "timestamp",
            "idempotency_key",
            IndexModel([("user_id", ASCENDING), ("timestamp", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING), ("timestamp", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("event_type", ASCENDING), ("timestamp", DESCENDING)]),
            IndexModel([("idempotency_key", ASCENDING)], unique=True, sparse=True),
        ]
