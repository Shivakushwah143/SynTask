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
    TASK_DUE_3_DAYS = "task_due_3_days"
    TASK_DUE_2_DAYS = "task_due_2_days"
    TASK_DUE_TOMORROW = "task_due_tomorrow"
    TASK_DUE_TODAY = "task_due_today"
    TASK_OVERDUE = "task_overdue"
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
    MEETING_INVITED = "meeting_invited"
    CONTENT_DUE_3_DAYS = "content_due_3_days"
    CONTENT_DUE_2_DAYS = "content_due_2_days"
    CONTENT_DUE_TOMORROW = "content_due_tomorrow"
    CONTENT_DUE_TODAY = "content_due_today"
    CONTENT_OVERDUE = "content_overdue"
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
    LIFECYCLE_CONFIRMED = "lifecycle_confirmed"
    LIFECYCLE_PROMOTED = "lifecycle_promoted"
    LIFECYCLE_TRANSFERRED = "lifecycle_transferred"
    LIFECYCLE_MANAGER_CHANGED = "lifecycle_manager_changed"
    LIFECYCLE_RESIGNATION_SUBMITTED = "lifecycle_resignation_submitted"
    LIFECYCLE_RESIGNATION_ACCEPTED = "lifecycle_resignation_accepted"
    LIFECYCLE_RESIGNATION_REJECTED = "lifecycle_resignation_rejected"
    LIFECYCLE_TERMINATED = "lifecycle_terminated"
    LIFECYCLE_EXITED = "lifecycle_exited"
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
    priority: str = "info"
    scheduled_for: Optional[datetime] = None
    toast_shown_at: Optional[datetime] = None
    
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
            "priority",
            "scheduled_for",
            "created_at",
            IndexModel([("user_id", ASCENDING), ("is_read", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("is_read", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("related_id", ASCENDING), ("related_type", ASCENDING), ("type", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel(
                [("company_id", ASCENDING), ("user_id", ASCENDING), ("metadata.reminder_key", ASCENDING)],
                unique=True,
                partialFilterExpression={"metadata.reminder_key": {"$type": "string"}},
            ),
        ]
