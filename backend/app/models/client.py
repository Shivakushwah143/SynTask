"""
Client Management Models
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field, EmailStr
from enum import Enum


class ClientStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


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
    status: ClientStatus = ClientStatus.ACTIVE
    company_name: Optional[str] = None  # Client's company name
    industry: Optional[str] = None
    
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
        ]

