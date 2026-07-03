from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class CRMDeal(Document):
    company_id: Indexed(str)
    lead_id: Indexed(str)
    contact_id: Optional[str] = None

    value: float = 0.0
    stage: str = "qualified"
    probability: int = 0
    expected_close_date: Optional[datetime] = None
    decision_maker: Optional[str] = None
    competitors: List[str] = Field(default_factory=list)
    negotiation_notes: Optional[str] = None
    archived: bool = False
    archived_at: Optional[datetime] = None
    archived_by: Optional[str] = None

    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "crm_deals"
        indexes = [
            "company_id",
            "lead_id",
            "contact_id",
            "stage",
            "archived",
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("stage", ASCENDING), ("updated_at", DESCENDING)]),
        ]
