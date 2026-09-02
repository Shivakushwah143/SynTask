"""
Time Tracking Models - Track time spent on tasks
"""
from datetime import datetime
from typing import Optional
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum
from pymongo import ASCENDING, IndexModel


class TimeLogSource(str, Enum):
    TIMER = "timer"
    MANUAL = "manual"
    SYSTEM = "system"


class ActiveTimeSessionStatus(str, Enum):
    RUNNING = "running"
    PAUSED = "paused"


class TimeLog(Document):
    """Time Log Model - Individual time entries"""
    task_id: Indexed(str)
    company_id: str
    user_id: str
    user_name: str
    
    # Time Details
    hours: float  # Hours worked
    minutes: Optional[int] = None  # Additional minutes
    
    # Date/Time
    date: datetime  # Date when work was done
    started_at: Optional[datetime] = None  # When timer started
    ended_at: Optional[datetime] = None  # When timer ended
    source: TimeLogSource = TimeLogSource.MANUAL
    project_id: Optional[str] = None
    client_id: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    voided: bool = False
    voided_at: Optional[datetime] = None
    voided_by: Optional[str] = None
    void_reason: Optional[str] = None
    
    # Description
    description: Optional[str] = None
    
    # Billable
    is_billable: bool = False
    billing_rate: Optional[float] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "time_logs"
        indexes = [
            "task_id",
            "user_id",
            "company_id",
            "date",
            "project_id",
            "client_id",
            "source",
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING), ("date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("task_id", ASCENDING), ("date", ASCENDING)]),
        ]


class ActiveTimeSession(Document):
    """Backend-authoritative live timer session."""
    company_id: Indexed(str)
    user_id: Indexed(str)
    task_id: Indexed(str)
    project_id: Optional[str] = None
    client_id: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    last_resumed_at: datetime = Field(default_factory=datetime.utcnow)
    paused_at: Optional[datetime] = None
    accumulated_seconds: int = 0
    status: ActiveTimeSessionStatus = ActiveTimeSessionStatus.RUNNING
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "active_time_sessions"
        indexes = [
            "company_id",
            "user_id",
            "task_id",
            "project_id",
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("task_id", ASCENDING)]),
        ]


class TimeTrackingSummary(Document):
    """Time Tracking Summary - Aggregated time per task/user"""
    task_id: Indexed(str)
    company_id: str
    
    # Totals
    total_hours: float = 0.0
    total_billable_hours: float = 0.0
    total_entries: int = 0
    
    # Last update
    last_logged_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "time_tracking_summaries"
        indexes = [
            "task_id",
            "company_id",
        ]


