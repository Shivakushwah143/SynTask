"""
Ticketing System Models
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum
from pymongo import ASCENDING, DESCENDING, TEXT, IndexModel


class TicketType(str, Enum):
    SUPPORT = "support"
    BUG = "bug"
    FEATURE_REQUEST = "feature_request"
    QUERY = "query"
    COMPLAINT = "complaint"


class TicketPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TicketStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING_FOR_CUSTOMER = "waiting_for_customer"
    RESOLVED = "resolved"
    CLOSED = "closed"
    REOPENED = "reopened"


class Ticket(Document):
    """Ticket Model"""
    ticket_number: Indexed(str, unique=True)  # e.g., TKT-2025-0001
    title: str
    description: str
    company_id: Indexed(str)
    
    # User details
    created_by: str  # User ID
    created_by_name: str
    created_by_email: str
    
    # Assignment
    assigned_to: Optional[str] = None  # User ID
    assigned_by: Optional[str] = None  # User ID
    assigned_at: Optional[datetime] = None
    
    # Ticket Details
    type: TicketType = TicketType.SUPPORT
    status: TicketStatus = TicketStatus.OPEN
    priority: TicketPriority = TicketPriority.MEDIUM
    
    # Attachments
    attachments: List[str] = []
    
    # Tags
    tags: List[str] = []
    
    # Resolution
    resolution: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    closed_at: Optional[datetime] = None
    
    # SLA
    due_date: Optional[datetime] = None
    first_response_at: Optional[datetime] = None
    
    # Escalation
    escalated: bool = False
    escalated_to: Optional[str] = None
    escalated_at: Optional[datetime] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "tickets"
        indexes = [
            "ticket_number",
            "company_id",
            "created_by",
            "assigned_to",
            "status",
            "priority",
            "type",
            "created_at",
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("created_by", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("priority", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("priority", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("type", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("created_by", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("status", ASCENDING), ("priority", ASCENDING), ("escalated", ASCENDING), ("created_at", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("ticket_number", ASCENDING)]),
            IndexModel([("title", TEXT), ("description", TEXT)]),
        ]


class TicketComment(Document):
    """Ticket Comment Model"""
    ticket_id: Indexed(str)
    company_id: str
    user_id: str
    user_name: str
    user_role: str
    content: str
    attachments: List[str] = []
    is_internal: bool = False  # Internal notes visible only to staff
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_edited: bool = False
    
    class Settings:
        name = "ticket_comments"
        indexes = [
            "ticket_id",
            "user_id",
            "company_id",
            IndexModel([("ticket_id", ASCENDING), ("company_id", ASCENDING), ("created_at", ASCENDING)]),
        ]
