"""
Sales Lead Note Model - Lead-scoped CRM notes stored in the Sales domain.
"""
from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class SalesLeadNote(Document):
    lead_id: Indexed(str)
    company_id: Indexed(str)
    content: str

    created_by: str
    created_by_name: str
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None
    deleted_by: Optional[str] = None
    deleted_by_name: Optional[str] = None

    is_edited: bool = False
    deleted: bool = False
    edited_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_lead_notes"
        indexes = [
            "lead_id",
            "company_id",
            "created_by",
            "updated_by",
            "deleted",
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING), ("deleted", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING), ("deleted", ASCENDING), ("updated_at", DESCENDING)]),
        ]
