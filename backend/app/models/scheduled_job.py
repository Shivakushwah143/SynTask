"""
Scheduled Job Model for Scheduling System
"""
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum
from pymongo import IndexModel, ASCENDING, DESCENDING


class ScheduledJobActionType(str, Enum):
    CREATE_PROJECT = "CREATE_PROJECT"
    CREATE_TASK = "CREATE_TASK"


class ScheduledJobStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class ScheduledJob(Document):
    """Generic Scheduled Job Model"""
    action_type: ScheduledJobActionType
    payload: Dict[str, Any]
    run_at: datetime
    status: ScheduledJobStatus = ScheduledJobStatus.PENDING
    created_by: str  # User ID
    company_id: Optional[str] = None
    retry_count: int = 0
    error: Optional[str] = None
    notes: Optional[str] = None  # User-supplied scheduling notes
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

    class Settings:
        name = "scheduled_jobs"
        indexes = [
            "created_by",
            "company_id",
            "status",
            "run_at",
            IndexModel([("status", ASCENDING), ("run_at", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
        ]
