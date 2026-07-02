"""
Sales Pipeline History - Tracks prospect stage transitions.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class SalesPipelineHistory(Document):
    lead_id: Indexed(str)
    company_id: Indexed(str)
    previous_stage: Optional[str] = None
    new_stage: str
    user_id: str
    user_name: str
    reason: Optional[str] = None
    days_in_previous_stage: Optional[int] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    transitioned_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_pipeline_history"
        indexes = [
            "company_id",
            "lead_id",
            "user_id",
            "transitioned_at",
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING), ("transitioned_at", DESCENDING)]),
        ]
