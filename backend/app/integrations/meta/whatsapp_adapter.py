"""WhatsApp Cloud API adapter for inbound webhook normalization."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.integrations.meta.channel_adapters import (
    ChannelCapabilities,
    ChannelConnectionHealth,
    ChannelType,
    NormalizedChannelEvent,
    NormalizedEventType,
)


class WhatsAppAdapter:
    channel = ChannelType.WHATSAPP

    async def validate_connection(self, connection_id: str) -> ChannelConnectionHealth:
        return ChannelConnectionHealth(
            channel=self.channel,
            status="not_checked",
            reason=f"WhatsApp connection {connection_id} health check not configured",
        )

    async def subscribe_webhooks(self, connection_id: str) -> Dict[str, Any]:
        return {"connection_id": connection_id, "subscribed": False}

    async def normalize_webhook(
        self, payload: Dict[str, Any], *, company_id: str, connection_id: str
    ) -> List[NormalizedChannelEvent]:
        events: List[NormalizedChannelEvent] = []
        for change in _changes(payload):
            if change.get("field") != "messages":
                continue
            value = change.get("value") or {}
            phone_number_id = (value.get("metadata") or {}).get("phone_number_id")
            for message in value.get("messages") or []:
                events.append(
                    self._message_event(
                        message,
                        value=value,
                        phone_number_id=phone_number_id,
                        company_id=company_id,
                        connection_id=connection_id,
                    )
                )
            for status in value.get("statuses") or []:
                events.append(
                    self._status_event(
                        status,
                        phone_number_id=phone_number_id,
                        company_id=company_id,
                        connection_id=connection_id,
                    )
                )
        return [event for event in events if event is not None]

    async def send_message(
        self,
        *,
        recipient_id: str,
        text: str,
        sender_asset_id: str,
        access_token: str,
    ) -> Dict[str, Any]:
        import httpx
        url = f"https://graph.facebook.com/v20.0/{sender_asset_id}/messages"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient_id,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }
        async with httpx.AsyncClient() as client:
            try:
                res = await client.post(url, headers=headers, json=payload, timeout=10.0)
            except Exception as e:
                return {"sent": False, "reason": f"Transport failure: {str(e)}"}
            if res.status_code >= 400:
                return {"sent": False, "reason": f"Meta error: {res.text}"}
            data = res.json()
            messages = data.get("messages", [])
            message_id = messages[0].get("id") if messages else None
            return {"sent": True, "provider_message_id": message_id}

    async def fetch_media(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        return {"fetched": False, "reason": "media fetch not enabled in Phase 2C"}

    async def get_templates_or_capabilities(self, connection_id: str) -> ChannelCapabilities:
        return ChannelCapabilities(
            channel=self.channel,
            supports_inbound=True,
            supports_outbound=True,
            requires_human_approval=True,
            supported_event_types=[
                NormalizedEventType.INBOUND_MESSAGE,
                NormalizedEventType.DELIVERY,
                NormalizedEventType.READ,
                NormalizedEventType.UNKNOWN,
            ],
            raw_capabilities={"connection_id": connection_id},
        )

    async def revoke_or_disconnect(self, connection_id: str) -> Dict[str, Any]:
        return {"connection_id": connection_id, "disconnected": False}

    def _message_event(self, message, *, value, phone_number_id, company_id, connection_id):
        message_id = message.get("id")
        sender = message.get("from")
        if not message_id or not sender:
            return None
        return NormalizedChannelEvent(
            company_id=company_id,
            channel=self.channel,
            connection_id=connection_id,
            provider_event_id=message_id,
            event_type=NormalizedEventType.INBOUND_MESSAGE,
            sender_id=sender,
            recipient_id=phone_number_id,
            provider_message_id=message_id,
            provider_thread_id=_thread_id(phone_number_id, sender),
            text=(message.get("text") or {}).get("body") if message.get("type") == "text" else None,
            occurred_at=_timestamp(message.get("timestamp")),
            raw_payload={"message": message, "metadata": value.get("metadata") or {}},
        )

    def _status_event(self, status, *, phone_number_id, company_id, connection_id):
        message_id = status.get("id")
        if not message_id:
            return None
        recipient = status.get("recipient_id")
        status_name = status.get("status") or "unknown"
        event_type = (
            NormalizedEventType.READ
            if status_name == "read"
            else NormalizedEventType.DELIVERY
            if status_name in {"sent", "delivered"}
            else NormalizedEventType.UNKNOWN
        )
        return NormalizedChannelEvent(
            company_id=company_id,
            channel=self.channel,
            connection_id=connection_id,
            provider_event_id=f"{message_id}:{status_name}",
            event_type=event_type,
            sender_id=phone_number_id,
            recipient_id=recipient,
            provider_message_id=message_id,
            provider_thread_id=_thread_id(phone_number_id, recipient),
            occurred_at=_timestamp(status.get("timestamp")),
            raw_payload={"status": status},
        )


def _timestamp(raw: Any) -> Optional[datetime]:
    try:
        return datetime.fromtimestamp(int(raw), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _thread_id(phone_number_id: Optional[str], customer_id: Optional[str]) -> Optional[str]:
    if phone_number_id and customer_id:
        return f"{phone_number_id}:{customer_id}"
    return customer_id or phone_number_id


def _changes(payload: Dict[str, Any]) -> list[Dict[str, Any]]:
    change = payload.get("change")
    if isinstance(change, dict):
        return [change]
    changes: list[Dict[str, Any]] = []
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        for item in entry.get("changes") or []:
            if isinstance(item, dict):
                changes.append(item)
    return changes
