from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, TEXT, IndexModel


class WorkRequestType(str, Enum):
    NEW_WORK = "new_work"
    CHANGE_REQUEST = "change_request"
    APPROVAL_REQUEST = "approval_request"
    DEADLINE_EXTENSION = "deadline_extension"
    RESOURCE_REQUEST = "resource_request"
    BLOCKER = "blocker"
    LEAVE_AVAILABILITY = "leave_availability"
    CLIENT_REQUEST = "client_request"
    OTHER = "other"


class WorkRequestStatus(str, Enum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    CONVERTED = "converted"
    CANCELLED = "cancelled"


class WorkRequest(Document):
    request_id: Indexed(str, unique=True)
    company_id: Indexed(str)
    type: WorkRequestType
    title: str
    description: str
    status: WorkRequestStatus = WorkRequestStatus.SUBMITTED
    priority: str = "medium"

    requested_by: Indexed(str)
    assigned_reviewer_id: Optional[str] = None
    resolver_id: Optional[str] = None

    project_id: Optional[str] = None
    task_id: Optional[str] = None
    client_id: Optional[str] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None

    reason: Optional[str] = None
    requested_changes: Dict[str, Any] = Field(default_factory=dict)
    action_result: Dict[str, Any] = Field(default_factory=dict)

    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    review_started_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None
    decided_by: Optional[str] = None
    decision_reason: Optional[str] = None
    converted_task_id: Optional[str] = None
    converted_project_id: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "work_requests"
        indexes = [
            "request_id",
            "company_id",
            "requested_by",
            "assigned_reviewer_id",
            "status",
            "type",
            "project_id",
            "task_id",
            "client_id",
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("requested_by", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_reviewer_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("title", TEXT), ("description", TEXT), ("request_id", TEXT)]),
        ]
