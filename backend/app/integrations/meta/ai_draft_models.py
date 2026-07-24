"""Governed Meta AI draft records."""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.integrations.meta.channel_adapters import ChannelType


class MetaAIDraft(Document):
    company_id: str
    conversation_id: str
    channel: ChannelType
    requested_by: str
    draft_text: str
    status: str = "drafted"
    prompt_metadata: Dict[str, Any] = Field(default_factory=dict)
    policy_snapshot: Dict[str, Any] = Field(default_factory=dict)
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "meta_ai_drafts"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("conversation_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("requested_by", ASCENDING)]),
        ]
