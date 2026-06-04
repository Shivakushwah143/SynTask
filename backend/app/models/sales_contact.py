"""
Sales Contact Model - Manages all sales contacts/clients/prospects
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import EmailStr, Field
from enum import Enum


class ContactSharingAccess(str, Enum):
    """Access levels for shared contacts"""
    VIEW = "view"
    EDIT = "edit"


class SalesContact(Document):
    """Sales Contact - Reusable across prospects, deals, pipeline"""

    # Basic Fields (Mandatory)
    first_name: str
    last_name: str
    country_code: str  # e.g., "+91", "+971"
    phone: Indexed(str)  # Phone number without country code
    email: Optional[EmailStr] = None

    # Company Information (Expandable)
    company_name: Optional[str] = None
    gst_no: Optional[str] = None
    brand_name: Optional[List[str]] = Field(default_factory=list)  # Multi-select
    business_category: Optional[List[str]] = Field(default_factory=list)  # Multi-select
    area: Optional[str] = None
    address: Optional[str] = None
    landmark: Optional[str] = None
    google_map_link: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zipcode: Optional[str] = None

    # Additional Information (Expandable)
    designation: Optional[str] = None
    channel: Optional[str] = None  # Online / Offline / Partner etc.
    relationship_type: Optional[str] = None
    nationality: Optional[List[str]] = Field(default_factory=list)  # Multi-select
    language: Optional[List[str]] = Field(default_factory=list)  # Multi-select
    owner_name: Optional[str] = None
    owner_contact_no: Optional[str] = None
    tag: Optional[List[str]] = Field(default_factory=list)  # Multi-select

    # Greeting Preferences
    greeting_preference: Optional[str] = None  # Both / Birthday / Anniversary / N/A
    birthday: Optional[datetime] = None  # DD-MM-YYYY format stored as datetime
    anniversary: Optional[datetime] = None  # DD-MM-YYYY format stored as datetime

    # Metadata
    company_id: Optional[str] = None
    created_by: Optional[str] = None
    deleted: bool = False

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_contacts"
        indexes = [
            "company_id",
            "created_by",
            ("country_code", "phone"),  # Composite index for uniqueness check
            "deleted",
            "email",
            "company_name",
        ]

    def unique_key(self) -> str:
        """Unique identifier: country_code + phone"""
        return f"{self.country_code}:{self.phone}"

    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class ContactSharing(Document):
    """Contact Sharing - Controls who can view/edit shared contacts"""

    contact_id: str  # SalesContact ID
    shared_with_user_id: str  # User ID who receives access
    shared_by_user_id: str  # User ID who shared
    access_level: str = ContactSharingAccess.VIEW  # view / edit
    company_id: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "contact_sharing"
        indexes = [
            "contact_id",
            "shared_with_user_id",
            "company_id",
        ]

