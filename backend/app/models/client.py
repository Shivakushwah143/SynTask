"""
Client Management Models
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field, EmailStr
from enum import Enum
from pymongo import ASCENDING, DESCENDING, TEXT, IndexModel


class ClientStatus(str, Enum):
    NEW = "new"
    ONBOARDING = "onboarding"
    ACTIVE = "active"
    AT_RISK = "at_risk"
    ON_HOLD = "on_hold"
    RENEWAL_DUE = "renewal_due"
    CHURNED = "churned"
    ARCHIVED = "archived"
    INACTIVE = "inactive"  # Legacy; accepted for existing records.


class ClientType(str, Enum):
    MONTHLY = "monthly"
    ONE_TIME = "one_time"


class Client(Document):
    """Client Model - For managing external clients"""
    name: str
    company_id: Indexed(str)
    
    # Contact Information
    email: Optional[EmailStr] = None
    contact: Optional[str] = None  # Phone number
    alternate_contact: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None
    
    # Client Details
    status: ClientStatus = ClientStatus.NEW
    company_name: Optional[str] = None  # Client's company name
    industry: Optional[str] = None

    # Canonical CRM relationship fields. Legacy display/contact fields stay for
    # API compatibility; CRMCompany remains the source of truth when linked.
    crm_company_id: Optional[str] = None
    source_lead_id: Optional[str] = None
    account_owner_id: Optional[str] = None
    sales_owner_id: Optional[str] = None
    
    # Client-level financial & scheduling info
    client_type: Optional[ClientType] = None  # monthly or one_time billing
    budget: Optional[float] = None  # Total client budget
    start_date: Optional[datetime] = None  # Client engagement start
    delivery_date: Optional[datetime] = None  # Client engagement delivery
    
    # Projects associated with this client
    project_ids: List[str] = []  # List of project IDs
    
    # Financial Information (per project)
    projects_budget: Dict[str, float] = Field(default_factory=dict)  # {project_id: budget_amount}
    
    # Dates (per project)
    projects_start_date: Dict[str, datetime] = Field(default_factory=dict)  # {project_id: start_date}
    projects_delivery_date: Dict[str, datetime] = Field(default_factory=dict)  # {project_id: delivery_date}
    
    # Documents
    documents: List[Dict[str, Any]] = Field(default_factory=list)  # [{name, url, type, uploaded_at}]
    
    # Notes and Additional Info
    notes: Optional[str] = None
    tags: List[str] = []
    lifecycle_reason: Optional[str] = None
    lifecycle_metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Assigned Admin/Lead
    assigned_to: Optional[str] = None  # User ID (Admin/Lead managing this client)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str  # User ID who created the client
    
    class Settings:
        name = "clients"
        indexes = [
            "company_id",
            "email",
            "status",
            "assigned_to",
            "created_by",
            "crm_company_id",
            "source_lead_id",
            "account_owner_id",
            "sales_owner_id",
            IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("crm_company_id", ASCENDING)]),
            IndexModel(
                [("company_id", ASCENDING), ("source_lead_id", ASCENDING)],
                name="company_id_1_source_lead_id_1",
                unique=True,
                partialFilterExpression={"source_lead_id": {"$type": "string"}},
            ),
            IndexModel([("name", TEXT), ("company_name", TEXT), ("email", TEXT)]),
        ]

