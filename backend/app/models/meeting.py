"""
Meeting Model - For Zoom Meeting Scheduling
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum
from pymongo import ASCENDING, DESCENDING, IndexModel


class MeetingStatus(str, Enum):
    SCHEDULED = "scheduled"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Meeting(Document):
    """Meeting Model with Zoom Integration"""
    title: str
    description: Optional[str] = None
    company_id: Indexed(str)
    
    # Organizer
    created_by: str  # User ID of the meeting organizer
    host_id: str  # User ID of the meeting host
    
    # Participants
    participant_ids: List[str] = []  # User IDs of participants
    
    # Meeting Details
    meeting_date: datetime
    meeting_time: str  # Time in HH:MM format
    duration: int = 30  # Duration in minutes
    
    # Zoom Integration
    zoom_meeting_id: Optional[str] = None  # Zoom meeting ID
    zoom_meeting_url: Optional[str] = None  # Zoom join URL
    zoom_start_url: Optional[str] = None  # Zoom start URL (for host)
    zoom_password: Optional[str] = None  # Meeting password
    
    # Video Settings
    host_video_enabled: bool = True
    participant_video_enabled: bool = True
    
    # Status
    status: MeetingStatus = MeetingStatus.SCHEDULED
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    
    class Settings:
        name = "meetings"
        indexes = [
            "company_id",
            "created_by",
            "meeting_date",
            "status",
            "host_id",
            "participant_ids",
            IndexModel([("company_id", ASCENDING), ("meeting_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("meeting_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("created_by", ASCENDING), ("meeting_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("host_id", ASCENDING), ("meeting_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("participant_ids", ASCENDING), ("meeting_date", DESCENDING)]),
        ]
