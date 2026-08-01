"""Tenant-scoped Meta customer identity documents."""

from datetime import datetime

from app.core.clock import aware_utc_now
from typing import Any, Dict, List, Optional

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.integrations.meta.channel_adapters import ChannelType


class CustomerIdentity(Document):
    company_id: str
    channel: ChannelType
    provider_user_id: str
    display_name: Optional[str] = None
    normalized_phone: Optional[str] = None
    linked_lead_id: Optional[str] = None
    linked_contact_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=aware_utc_now)
    updated_at: datetime = Field(default_factory=aware_utc_now)

    class Settings:
        name = "meta_customer_identities"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel(
                [("company_id", ASCENDING), ("channel", ASCENDING), ("provider_user_id", ASCENDING)],
                unique=True,
            ),
            IndexModel([("company_id", ASCENDING), ("normalized_phone", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("linked_lead_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("linked_contact_id", ASCENDING)]),
        ]


class CrossChannelIdentityLink(Document):
    company_id: str
    identity_ids: List[str]
    link_key: str
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    linked_lead_id: Optional[str] = None
    linked_contact_id: Optional[str] = None
    status: str = "confirmed"
    confirmed_by: str
    confirmed_at: datetime = Field(default_factory=aware_utc_now)
    created_at: datetime = Field(default_factory=aware_utc_now)
    updated_at: datetime = Field(default_factory=aware_utc_now)

    class Settings:
        name = "meta_cross_channel_identity_links"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("link_key", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("confirmed_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("identity_ids", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("linked_lead_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("linked_contact_id", ASCENDING)]),
        ]
