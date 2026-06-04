"""
Timesheet Models - Daily timesheet entries
"""
from datetime import datetime, date
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class TimesheetStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    MISSING = "missing"
    ABSENT = "absent"


class TimesheetEntry(Document):
    """Timesheet Entry Model - Individual timesheet entries"""
    company_id: Indexed(str)
    user_id: Indexed(str)
    date: date  # Date of the timesheet entry
    
    # Project/Task Details
    project_id: Optional[str] = None  # Bucket/Project
    project_name: Optional[str] = None
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    
    # Assignment Dates
    assigned_on: Optional[date] = None
    closed_on: Optional[date] = None
    
    # Time Details
    hours_spent: float = 0.0  # Total hours spent on this task
    hours_spent_today: float = 0.0  # Hours spent on this specific date
    
    # Meeting/Miscellaneous
    is_meeting: bool = False
    is_miscellaneous: bool = False
    meeting_title: Optional[str] = None
    miscellaneous_description: Optional[str] = None
    
    # Status
    status: TimesheetStatus = TimesheetStatus.PENDING
    
    # Notification
    notification_manager_id: Optional[str] = None  # Manager to notify
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "timesheet_entries"
        indexes = [
            "company_id",
            "user_id",
            "date",
            "project_id",
            "task_id",
            "status",
        ]


class TimesheetSummary(Document):
    """Timesheet Summary - Daily summary per user"""
    company_id: Indexed(str)
    user_id: Indexed(str)
    date: date
    
    # Totals
    total_hours: float = 0.0
    total_entries: int = 0
    
    # Status
    status: TimesheetStatus = TimesheetStatus.PENDING
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "timesheet_summaries"
        indexes = [
            [("company_id", 1), ("user_id", 1), ("date", 1)],  # Compound index
            "company_id",
            "user_id",
            "date",
            "status",
        ]

