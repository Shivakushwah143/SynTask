"""
Per-tenant feature flag model.
"""
from datetime import datetime
from typing import Optional

from beanie import Document
from pydantic import Field


class FeatureFlag(Document):
    company_id: str
    feature_key: str
    is_enabled: bool = False
    enabled_by: Optional[str] = None
    enabled_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "feature_flags"
        indexes = [
            [("company_id", 1), ("feature_key", 1)],
            "company_id",
            "feature_key",
        ]
