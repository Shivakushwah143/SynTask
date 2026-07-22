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

