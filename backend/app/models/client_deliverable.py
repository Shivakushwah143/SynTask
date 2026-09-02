"""Client deliverables linked to services, projects, tasks, and approval state."""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel, TEXT


class ClientDeliverableStatus(str, Enum):
    PLANNED = "planned"
    IN_PRODUCTION = "in_production"
    INTERNAL_REVIEW = "internal_review"
    CLIENT_REVIEW = "client_review"
    REVISION_REQUIRED = "revision_required"
    APPROVED = "approved"
    DELIVERED = "delivered"


class ClientApprovalStatus(str, Enum):
    NOT_SENT = "not_sent"
    SENT = "sent"
    VIEWED = "viewed"
    APPROVED = "approved"
    REVISION_REQUESTED = "revision_requested"


class ClientDeliverable(Document):
    client_id: Indexed(str)
    service_id: Indexed(str)
    project_id: Indexed(str)
    company_id: Indexed(str)

    title: str
    description: Optional[str] = None
    owner_id: Optional[str] = None
    due_date: Optional[datetime] = None
    status: ClientDeliverableStatus = ClientDeliverableStatus.PLANNED
    linked_files: List[Dict[str, Any]] = Field(default_factory=list)
    linked_task_ids: List[str] = Field(default_factory=list)

    approval_status: ClientApprovalStatus = ClientApprovalStatus.NOT_SENT
    approver_contact_id: Optional[str] = None
    sent_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    revision_note: Optional[str] = None
    revision_count: int = 0
    approval_history: List[Dict[str, Any]] = Field(default_factory=list)
    public_token_hash: Optional[str] = None
    public_token_created_at: Optional[datetime] = None

    delivered_at: Optional[datetime] = None
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "client_deliverables"
        indexes = [
            "client_id",
            "service_id",
            "project_id",
            "company_id",
            "status",
            "approval_status",
            "owner_id",
            "due_date",
            "linked_task_ids",
            IndexModel([("company_id", ASCENDING), ("client_id", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("service_id", ASCENDING), ("project_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("approval_status", ASCENDING), ("due_date", ASCENDING)]),
            IndexModel([("title", TEXT), ("description", TEXT)]),
        ]
