"""
CRM Company Model - tenant-scoped CRM account source of truth.
"""
from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class CRMCompany(Document):
    name: Indexed(str)
    company_id: Indexed(str)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    notes: Optional[str] = None
    primary_contact_id: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    deleted: bool = False
    deleted_by: Optional[str] = None
    deleted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "crm_companies"
        indexes = [
            "company_id",
            "name",
            "primary_contact_id",
            "deleted",
            IndexModel([("company_id", ASCENDING), ("name", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("updated_at", DESCENDING)]),
        ]
