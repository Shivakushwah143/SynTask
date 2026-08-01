from datetime import datetime

from app.core.clock import aware_utc_now
from typing import Any, Dict, List, Optional
from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel

class MetaReadinessRecord(Document):
    checklist_id: str  # e.g., "PII_REDACTION", "OAUTH_FLOW", "TWENTY_FOUR_HOUR_GATE", "WEBHOOK_VERIFICATION"
    checklist_name: str
    status: str = "pending"  # pending, passed, failed
    evidence_url: Optional[str] = None
    verified_at: Optional[datetime] = None
    verified_by: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=aware_utc_now)
    updated_at: datetime = Field(default_factory=aware_utc_now)

    class Settings:
        name = "meta_readiness_records"
        indexes = [
            IndexModel([("checklist_id", ASCENDING)], unique=True),
            IndexModel([("status", ASCENDING)]),
        ]
