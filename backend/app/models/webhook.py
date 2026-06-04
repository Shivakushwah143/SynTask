"""
Webhook Models - For integrations like Jira
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class WebhookEvent(str, Enum):
    TASK_CREATED = "task.created"
    TASK_UPDATED = "task.updated"
    TASK_DELETED = "task.deleted"
    TASK_STATUS_CHANGED = "task.status_changed"
    TASK_ASSIGNED = "task.assigned"
    COMMENT_ADDED = "comment.added"
    PROJECT_CREATED = "project.created"
    PROJECT_UPDATED = "project.updated"
    SPRINT_STARTED = "sprint.started"
    SPRINT_CLOSED = "sprint.closed"


class Webhook(Document):
    """Webhook Model - For external integrations"""
    name: str
    url: str
    company_id: Optional[str] = None
    project_id: Optional[str] = None
    
    # Events to listen to
    events: List[WebhookEvent] = []
    
    # Authentication
    secret: Optional[str] = None  # Secret for HMAC signature
    headers: Dict[str, str] = {}  # Custom headers
    
    # Settings
    is_active: bool = True
    verify_ssl: bool = True
    
    # Statistics
    success_count: int = 0
    failure_count: int = 0
    last_triggered_at: Optional[datetime] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    
    class Settings:
        name = "webhooks"
        indexes = [
            "company_id",
            "project_id",
            "is_active",
        ]


class WebhookDelivery(Document):
    """Webhook Delivery Log - Track webhook calls"""
    webhook_id: Indexed(str)
    company_id: str
    
    # Delivery Details
    event: str
    payload: Dict[str, Any]
    url: str
    
    # Response
    status_code: Optional[int] = None
    response_body: Optional[str] = None
    success: bool = False
    error_message: Optional[str] = None
    
    # Timestamps
    delivered_at: datetime = Field(default_factory=datetime.utcnow)
    response_time_ms: Optional[float] = None
    
    class Settings:
        name = "webhook_deliveries"
        indexes = [
            "webhook_id",
            "company_id",
            "delivered_at",
            "success",
        ]


