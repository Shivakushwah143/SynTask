"""Channel-neutral contracts for Meta messaging adapters."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Protocol

from pydantic import BaseModel, Field


class ChannelType(str, Enum):
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
    POSTBACK = "postback"
    UNKNOWN = "unknown"


class ChannelConnectionHealth(BaseModel):
    channel: ChannelType
    status: str
    can_receive: bool = False
    can_send: bool = False
    reason: Optional[str] = None
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChannelCapabilities(BaseModel):
    channel: ChannelType
    supports_inbound: bool = True
    supports_outbound: bool = False
    requires_human_approval: bool = True
    supported_event_types: List[NormalizedEventType] = Field(default_factory=list)
    raw_capabilities: Dict[str, Any] = Field(default_factory=dict)


class NormalizedChannelEvent(BaseModel):
    company_id: str
    channel: ChannelType
    connection_id: str
    provider_event_id: str
    event_type: NormalizedEventType
    sender_id: Optional[str] = None
    recipient_id: Optional[str] = None
    provider_message_id: Optional[str] = None
    provider_thread_id: Optional[str] = None
    text: Optional[str] = None
    occurred_at: Optional[datetime] = None
    raw_payload: Dict[str, Any] = Field(default_factory=dict)


class MessagingChannelAdapter(Protocol):
    channel: ChannelType

    async def validate_connection(self, connection_id: str) -> ChannelConnectionHealth:
        ...

    async def subscribe_webhooks(self, connection_id: str) -> Dict[str, Any]:
        ...

    async def normalize_webhook(
        self, payload: Dict[str, Any], *, company_id: str, connection_id: str
    ) -> List[NormalizedChannelEvent]:
        ...

    async def send_message(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        ...

    async def fetch_media(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        ...

    async def get_templates_or_capabilities(self, connection_id: str) -> ChannelCapabilities:
        ...

    async def revoke_or_disconnect(self, connection_id: str) -> Dict[str, Any]:
        ...
