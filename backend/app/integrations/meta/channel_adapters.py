"""Channel-neutral contracts for Meta messaging adapters."""

from datetime import datetime

from app.core.clock import aware_utc_now, from_timestamp_utc
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
    checked_at: datetime = Field(default_factory=aware_utc_now)


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
"""Shared adapter contracts for Meta messaging channels."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol, TYPE_CHECKING

if TYPE_CHECKING:
    from app.integrations.meta.messaging_models import NormalizedMessagingEvent


@dataclass(frozen=True)
class ChannelHealth:
    status: str
    reason: str | None = None


@dataclass(frozen=True)
class ComposerPolicy:
    can_compose: bool
    reason: str | None = None


class MetaMessagingAdapter(Protocol):
    def normalize_webhook_entry(self, entry: dict[str, Any]) -> list["NormalizedMessagingEvent"]:
        ...

    def connection_health(self, connection_fields: dict[str, Any]) -> ChannelHealth:
        ...

    def composer_policy(
        self,
        *,
        last_customer_message_at: datetime | None,
        now: datetime,
        recipient_opted_out: bool,
    ) -> ComposerPolicy:
        ...


def _milliseconds_to_datetime(value: Any) -> datetime:
    timestamp = int(value or 0)
    if timestamp > 10_000_000_000:
        timestamp = timestamp // 1000
    return from_timestamp_utc(timestamp)


def _text_message_event_id(channel_prefix: str, item: dict[str, Any]) -> str:
    message = item.get("message") if isinstance(item.get("message"), dict) else {}
    mid = message.get("mid")
    if mid:
        return str(mid)
    return f"{channel_prefix}:{item.get('timestamp')}:{item.get('sender', {}).get('id')}"


def _has_scope(fields: dict[str, Any], required: str) -> bool:
    scopes = fields.get("scopes") or []
    return required in scopes

