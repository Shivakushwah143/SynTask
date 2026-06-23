"""
Department Model
"""
from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class Department(Document):
    """Company-scoped department used for user organization and reporting."""

    name: str
    company_id: Indexed(str)
    manager_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "departments"
        indexes = [
            "company_id",
            "manager_id",
            "deleted_at",
            IndexModel([("company_id", ASCENDING), ("deleted_at", ASCENDING), ("created_at", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("name", ASCENDING)]),
        ]

