"""Instagram Messaging adapter.

Inbound only. No provider send.
"""

from datetime import datetime
from typing import Any

from app.integrations.meta.channel_adapters import (
    ChannelHealth,
    ComposerPolicy,
    _has_scope,
    _milliseconds_to_datetime,
    _text_message_event_id,
)
from app.integrations.meta.messaging_models import (
    MetaChannel,
    NormalizedEventType,
    NormalizedMessagingEvent,
)


class InstagramMessagingAdapter:
    channel = MetaChannel.INSTAGRAM

    def normalize_webhook_entry(self, entry: dict[str, Any]) -> list[NormalizedMessagingEvent]:
        asset_id = str(entry.get("id") or "")
        events: list[NormalizedMessagingEvent] = []
        for item in entry.get("messaging") or []:
            if not isinstance(item, dict):
                continue
            message = item.get("message") if isinstance(item.get("message"), dict) else {}
            sender = item.get("sender") if isinstance(item.get("sender"), dict) else {}
            recipient = item.get("recipient") if isinstance(item.get("recipient"), dict) else {}
            metadata: dict[str, Any] = {}
            reply_to = message.get("reply_to") if isinstance(message.get("reply_to"), dict) else {}
            if reply_to.get("mid"):
                metadata["reply_to_mid"] = str(reply_to["mid"])
            events.append(
                NormalizedMessagingEvent(
                    channel=self.channel,
                    event_type=NormalizedEventType.INBOUND_MESSAGE if message.get("text") else NormalizedEventType.UNKNOWN,
                    provider_event_id=_text_message_event_id("instagram", item),
                    provider_asset_id=asset_id,
                    sender_id=str(sender.get("id")) if sender.get("id") else None,
                    recipient_id=str(recipient.get("id")) if recipient.get("id") else None,
                    text=str(message.get("text")) if message.get("text") is not None else None,
                    occurred_at=_milliseconds_to_datetime(item.get("timestamp") or entry.get("time")),
                    metadata=metadata,
                )
            )
        return events

    def connection_health(self, connection_fields: dict[str, Any]) -> ChannelHealth:
        if not connection_fields.get("instagram_business_account_id"):
            return ChannelHealth(status="degraded", reason="Missing Instagram professional account ID.")
        if not _has_scope(connection_fields, "instagram_manage_messages"):
            return ChannelHealth(status="degraded", reason="Missing instagram_manage_messages scope.")
        return ChannelHealth(status="healthy")

    def composer_policy(
        self,
        *,
        last_customer_message_at: datetime | None,
        now: datetime,
        recipient_opted_out: bool,
    ) -> ComposerPolicy:
        if recipient_opted_out:
            return ComposerPolicy(can_compose=False, reason="Recipient opted out.")
        if last_customer_message_at is None:
            return ComposerPolicy(
                can_compose=False,
                reason="Instagram replies require an existing customer-initiated conversation.",
            )
        return ComposerPolicy(can_compose=True)

