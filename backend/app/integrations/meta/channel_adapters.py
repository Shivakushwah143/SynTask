"""Shared adapter contracts for Meta messaging channels."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

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
    def normalize_webhook_entry(self, entry: dict[str, Any]) -> list[NormalizedMessagingEvent]:
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
    return datetime.fromtimestamp(timestamp, tz=datetime.now().astimezone().tzinfo)


def _text_message_event_id(channel_prefix: str, item: dict[str, Any]) -> str:
    message = item.get("message") if isinstance(item.get("message"), dict) else {}
    mid = message.get("mid")
    if mid:
        return str(mid)
    return f"{channel_prefix}:{item.get('timestamp')}:{item.get('sender', {}).get('id')}"


def _has_scope(fields: dict[str, Any], required: str) -> bool:
    scopes = fields.get("scopes") or []
    return required in scopes

