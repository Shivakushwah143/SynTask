"""
Sales Lead File Model - Lead-scoped file associations in the Sales domain.
"""
from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class SalesLeadFile(Document):
    lead_id: Indexed(str)
    company_id: Indexed(str)

    file_url: str
    file_public_id: Optional[str] = None
    file_resource_type: Optional[str] = None
    file_delivery_type: Optional[str] = None
    file_name: str
    original_name: Optional[str] = None
    file_type: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None

    uploaded_by: str
    uploaded_by_name: str
    deleted_by: Optional[str] = None
    deleted_by_name: Optional[str] = None

    deleted: bool = False
    deleted_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_lead_files"
        indexes = [
            "lead_id",
            "company_id",
            "uploaded_by",
            "deleted",
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING), ("deleted", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING), ("deleted", ASCENDING), ("updated_at", DESCENDING)]),
        ]
