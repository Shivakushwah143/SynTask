"""
Leave management models.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class LeaveType(str, Enum):
    FULL_DAY = "full_day"
    HALF_DAY = "half_day"
    SICK_LEAVE = "sick_leave"
    CASUAL_LEAVE = "casual_leave"
    EMERGENCY_LEAVE = "emergency_leave"
    WORK_FROM_HOME = "work_from_home"


class LeaveStatus(str, Enum):
    PENDING = "pending"
    FORWARDED = "forwarded"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class LeaveRequest(Document):
    employee_id: Indexed(str)
    employee_role: Optional[str] = None
    company_id: Indexed(str)
    leave_type: LeaveType
    start_date: datetime
    end_date: datetime
    reason: str
    attachment_url: Optional[str] = None
    attachment_public_id: Optional[str] = None
    status: LeaveStatus = LeaveStatus.PENDING
    requested_by: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_comment: Optional[str] = None
    pending_with_user_ids: List[str] = Field(default_factory=list)
    forwarded_to_user_id: Optional[str] = None
    forwarded_by: Optional[str] = None
    forwarded_at: Optional[datetime] = None
    forwarded_to_admin: bool = False
    approval_history: List[Dict[str, Any]] = Field(default_factory=list)
    forward_comment: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "leave_requests"
        indexes = [
            "employee_id",
            "company_id",
            "employee_role",
            "status",
            "leave_type",
            "start_date",
            "end_date",
            "pending_with_user_ids",
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("start_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("start_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("pending_with_user_ids", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("start_date", ASCENDING), ("end_date", ASCENDING)]),
        ]
