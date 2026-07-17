"""
Notification Model
"""
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum
from pymongo import ASCENDING, DESCENDING, IndexModel


class NotificationType(str, Enum):
    TASK_ASSIGNED = "task_assigned"
    TASK_UPDATE = "task_update"
    TASK_UPDATED = "task_updated"
    TASK_COMPLETED = "task_completed"
    TASK_COMMENT = "task_comment"
    TICKET_ASSIGNED = "ticket_assigned"
    TICKET_UPDATED = "ticket_updated"
    TICKET_RESOLVED = "ticket_resolved"
    TICKET_COMMENT = "ticket_comment"
    TICKET_ESCALATED = "ticket_escalated"
    PROJECT_ASSIGNED = "project_assigned"
    DEADLINE_APPROACHING = "deadline_approaching"
    MENTION = "mention"
    MESSAGE = "message"
    COMPANY_APPROVED = "company_approved"
    SUBSCRIPTION_EXPIRING = "subscription_expiring"
    SUBSCRIPTION_EXPIRED = "subscription_expired"
    LEAVE_REQUESTED = "leave_requested"
    LEAVE_FORWARDED = "leave_forwarded"
    LEAVE_APPROVED = "leave_approved"
    LEAVE_REJECTED = "leave_rejected"
    SYSTEM = "system"


class Notification(Document):
    """Notification Model"""
    user_id: Indexed(str)
    company_id: Optional[str] = None
    
    type: NotificationType
    title: str
    message: str
    
    # Related entities
    related_id: Optional[str] = None  # Task ID, Ticket ID, etc.
    related_type: Optional[str] = None  # task, ticket, etc.
    
    # Action URL
    action_url: Optional[str] = None
    
    # Metadata
    metadata: Optional[Dict[str, Any]] = None
    
    # Status
    is_read: bool = False
    read_at: Optional[datetime] = None
    
    # Email notification
    email_sent: bool = False
    email_sent_at: Optional[datetime] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "notifications"
        indexes = [
            "user_id",
            "company_id",
            "is_read",
            "type",
            "created_at",
            IndexModel([("user_id", ASCENDING), ("is_read", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("is_read", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("related_id", ASCENDING), ("related_type", ASCENDING), ("type", ASCENDING), ("created_at", DESCENDING)]),
        ]
