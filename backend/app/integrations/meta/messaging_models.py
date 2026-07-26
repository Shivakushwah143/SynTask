"""Tenant-scoped Meta messaging documents."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from beanie import Document
from pydantic import Field, field_validator
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.integrations.meta.channel_adapters import ChannelType, NormalizedEventType
from app.integrations.meta.redaction import sanitize_error_message


class MetaChannelConnection(Document):
    company_id: str
    channel: ChannelType
    provider_asset_id: str
    display_name: Optional[str] = None
    instagram_professional_account_id: Optional[str] = None
    page_id: Optional[str] = None
    scoped_sender_ids: List[str] = Field(default_factory=list)
    credential_ref_encrypted: Optional[str] = None
    scopes: List[str] = Field(default_factory=list)
    status: str = "disabled"
    can_receive: bool = False
    can_send: bool = False
    health_reason: Optional[str] = None
    last_health_check_at: Optional[datetime] = None
    last_webhook_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    _sanitize_health_reason = field_validator("health_reason", mode="before")(
        sanitize_error_message
    )

    class Settings:
        name = "meta_channel_connections"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel(
                [("company_id", ASCENDING), ("channel", ASCENDING), ("provider_asset_id", ASCENDING)],
                unique=True,
            ),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("channel", ASCENDING), ("provider_asset_id", ASCENDING)]),
        ]


class MetaConversation(Document):
    company_id: str
    channel: ChannelType
    connection_id: str
    provider_thread_id: str
    customer_identity_id: Optional[str] = None
    linked_lead_id: Optional[str] = None
    linked_contact_id: Optional[str] = None
    status: str = "open"
    assigned_to: Optional[str] = None
    priority: str = "normal"
    tags: List[str] = Field(default_factory=list)
    notes: List[Dict[str, Any]] = Field(default_factory=list)
    last_message_at: Optional[datetime] = None
    last_inbound_at: Optional[datetime] = None
    last_outbound_at: Optional[datetime] = None
    unread_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "meta_conversations"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel(
                [("company_id", ASCENDING), ("channel", ASCENDING), ("connection_id", ASCENDING), ("provider_thread_id", ASCENDING)],
                unique=True,
            ),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("last_message_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING)]),
        ]


class MetaMessage(Document):
    company_id: str
    conversation_id: str
    channel: ChannelType
    connection_id: str
    provider_event_id: str
    provider_message_id: Optional[str] = None
    event_type: NormalizedEventType
    direction: str
    sender_id: Optional[str] = None
    recipient_id: Optional[str] = None
    text: Optional[str] = None
    raw_payload: Dict[str, Any] = Field(default_factory=dict)
    status: str = "received"
    correlation_id: str
    occurred_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "meta_messages"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel(
                [("company_id", ASCENDING), ("channel", ASCENDING), ("provider_event_id", ASCENDING)],
                unique=True,
            ),
            IndexModel([("company_id", ASCENDING), ("conversation_id", ASCENDING), ("created_at", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
        ]


class MetaOnboardingSession(Document):
    company_id: str
    channel: ChannelType
    state: str
    status: str = "pending"  # pending, completed, expired
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime

    class Settings:
        name = "meta_onboarding_sessions"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel([("state", ASCENDING)], unique=True),
        ]
"""Channel-neutral Meta messaging contracts."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional


class MetaChannel(str, Enum):
    WHATSAPP = "whatsapp"
    INSTAGRAM = "instagram"
    MESSENGER = "messenger"


class NormalizedEventType(str, Enum):
    INBOUND_MESSAGE = "inbound_message"
    DELIVERY = "delivery"
    READ = "read"
    REACTION = "reaction"
    REFERRAL = "referral"
    OPT_IN = "opt_in"
    OPT_OUT = "opt_out"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class NormalizedMessagingEvent:
    channel: MetaChannel
    event_type: NormalizedEventType
    provider_event_id: str
    provider_asset_id: str
    sender_id: Optional[str] = None
    recipient_id: Optional[str] = None
    text: Optional[str] = None
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)

