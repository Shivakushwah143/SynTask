"""Saved Client filter views."""
from datetime import datetime
from typing import Any, Dict, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class ClientSavedView(Document):
    name: str
    company_id: Indexed(str)
    owner_id: Indexed(str)
    filters: Dict[str, Any] = Field(default_factory=dict)
    is_default: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "client_saved_views"
        indexes = [
            "company_id",
            "owner_id",
            IndexModel([("company_id", ASCENDING), ("owner_id", ASCENDING), ("updated_at", DESCENDING)]),
        ]
