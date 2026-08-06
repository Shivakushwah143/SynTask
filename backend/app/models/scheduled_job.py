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
    # Optional result linkage, set only after the job executes successfully.
    # The Calendar uses it to avoid rendering the scheduled placeholder next to
    # the generated Task during the brief RUNNING -> COMPLETED transition.
    # Nullable; existing documents are unaffected (no destructive migration).
    result_type: Optional[str] = None  # e.g. "task" | "project"
    result_id: Optional[str] = None    # generated document id
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
            # Calendar lookups: active CREATE_TASK jobs within a run_at window.
            # Explicit stable name avoids IndexOptionsConflict on re-creation.
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("action_type", ASCENDING),
                    ("status", ASCENDING),
                    ("run_at", ASCENDING),
                ],
                name="scheduled_jobs_calendar_company_action_status_run_at",
            ),
        ]
