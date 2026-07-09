"""
Ownership transfer audit trail.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class OwnershipTransfer(Document):
    company_id: Indexed(str)
    entity_type: str
    entity_id: Indexed(str)
    from_user_id: Optional[str] = None
    to_user_id: str
    reason: str
    transferred_by: str
    transferred_at: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None

    class Settings:
        name = "ownership_transfers"
        indexes = [
            "company_id",
            "entity_type",
            "entity_id",
            "from_user_id",
            "to_user_id",
            "transferred_by",
            IndexModel([("company_id", ASCENDING), ("entity_type", ASCENDING), ("entity_id", ASCENDING), ("transferred_at", ASCENDING)]),
        ]
