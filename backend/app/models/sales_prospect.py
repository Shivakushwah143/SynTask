"""Lead model.

Legacy storage and import names remain for API and database compatibility.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import EmailStr, Field
from enum import Enum
from pymongo import ASCENDING, IndexModel


class InterestLevel(str, Enum):
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"


class ProspectStatus(str, Enum):
    ACTIVE = "active"
    WON = "won"
    LOST = "lost"
    CLOSED = "closed"


class SalesProspect(Document):
    """Lead linked to contacts, products, and pipeline stages."""

    # Basic Fields (from Contact or new)
    first_name: str
    last_name: str
    prospect_name: str  # Auto-generated: First + Last
    country_code: str
    phone: Indexed(str)
    email: Optional[EmailStr] = None
    contact_id: Optional[str] = None  # If converted from existing contact

    # Sales-Specific Fields
    category_id: Optional[str] = None  # SalesCategory FK
    product_ids: List[str] = Field(default_factory=list)  # Multiple products
    interest_level: InterestLevel = InterestLevel.WARM
    estimated_close_date: Optional[datetime] = None
    assigned_to: str  # User ID
    assigned_by: Optional[str] = None  # User ID who assigned
    current_stage: str = "new"  # Stage name (from master)
    due_date: Optional[datetime] = None
    due_time: Optional[str] = None  # HH:MM AM/PM format
    remark: Optional[str] = None

    # Company Information (from Contact or new)
    company_name: Optional[str] = None
    crm_company_id: Optional[str] = None
    relationship_type: Optional[str] = None
    channel: Optional[str] = None
    source: str = "bulk_upload"

    # Additional Information (from Contact or new)
    designation: Optional[str] = None
    nationality: Optional[List[str]] = Field(default_factory=list)
    language: Optional[List[str]] = Field(default_factory=list)
    owner_name: Optional[str] = None
    owner_contact_no: Optional[str] = None
    tag: Optional[List[str]] = Field(default_factory=list)
    greeting_preference: Optional[str] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)

    # Status & Closure
    status: ProspectStatus = ProspectStatus.ACTIVE
    closed_date: Optional[datetime] = None
    closed_by: Optional[str] = None
    reason_for_lost: Optional[str] = None  # From master
    won_amount: Optional[float] = None
    stage_entered_at: Optional[datetime] = None
    stage_last_changed_at: Optional[datetime] = None
    days_in_stage: int = 0

    # Metadata
    company_id: Optional[str] = None
    created_by: Optional[str] = None
    deleted: bool = False

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_prospects"
        indexes = [
            "company_id",
            "assigned_to",
            "assigned_by",
            "current_stage",
            "status",
            "category_id",
            "contact_id",
            "deleted",
            ("country_code", "phone"),  # For duplicate check
            IndexModel([
                ("company_id", ASCENDING),
                ("email", ASCENDING),
            ], unique=True, partialFilterExpression={"email": {"$type": "string"}}),
            "crm_company_id",
        ]

    def unique_key(self) -> str:
        """Unique identifier: country_code + phone"""
        return f"{self.country_code}:{self.phone}"


# Compatibility aliases: old names remain until persisted and API contracts
# can migrate without breaking existing clients.
Lead = SalesProspect
LeadStatus = ProspectStatus
