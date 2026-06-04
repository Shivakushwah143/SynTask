"""
Time Tracking Models - Track time spent on tasks
"""
from datetime import datetime
from typing import Optional
from beanie import Document, Indexed
from pydantic import Field


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


