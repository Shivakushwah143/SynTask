"""
Sales Master Data Models - Stages, Reasons, Channels, Tags, etc.
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field


class SalesStage(Document):
    """Sales Pipeline Stages"""
    name: Indexed(str)  # e.g., "New", "Follow Up Call", "Schedule a Meeting", "Send Proposal"
    order: int = 0  # For ordering stages
    key: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_terminal: bool = False
    company_id: Optional[str] = None
    is_default: bool = False
    deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_stages"
        indexes = ["company_id", "deleted", "order"]


class ReasonForLost(Document):
    """Reasons for losing a prospect"""
    name: Indexed(str)  # e.g., "Not Interested", "Budget Issue", "Competitor Selected"
    company_id: Optional[str] = None
    deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_reasons_for_lost"
        indexes = ["company_id", "deleted"]


class SalesChannel(Document):
    """Sales Channels"""
    name: Indexed(str)  # e.g., "Online", "Offline", "Partner"
    company_id: Optional[str] = None
    deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_channels"
        indexes = ["company_id", "deleted"]


class SalesTag(Document):
    """Sales Tags for filtering"""
    name: Indexed(str)
    company_id: Optional[str] = None
    deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_tags"
        indexes = ["company_id", "deleted"]


class Nationality(Document):
    """Nationality Master"""
    name: Indexed(str)  # e.g., "India", "UAE", "USA"
    company_id: Optional[str] = None
    deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_nationalities"
        indexes = ["company_id", "deleted"]


class BusinessCategory(Document):
    """Business Category Master"""
    name: Indexed(str)  # e.g., "IT Services", "Manufacturing", "Real Estate"
    company_id: Optional[str] = None
    deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_business_categories"
        indexes = ["company_id", "deleted"]


class GreetingTemplate(Document):
    """Greeting Templates for Birthday/Anniversary"""
    greeting_type: str  # "birthday" or "anniversary"
    message: str  # Max 20 words
    company_id: Optional[str] = None
    deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_greeting_templates"
        indexes = ["company_id", "greeting_type", "deleted"]
