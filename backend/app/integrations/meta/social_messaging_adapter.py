"""Shared Instagram/Messenger webhook normalization helpers."""

from datetime import datetime

from app.core.clock import from_timestamp_utc
from typing import Any, Dict, List, Optional

from app.integrations.meta.channel_adapters import (
    ChannelCapabilities,
    ChannelConnectionHealth,
    ChannelType,
    NormalizedChannelEvent,
    NormalizedEventType,
)


class SocialMessagingAdapter:
    channel: ChannelType
    channel_label: str

    async def validate_connection(self, connection_id: str) -> ChannelConnectionHealth:
        return ChannelConnectionHealth(
            channel=self.channel,
            status="not_checked",
            can_receive=False,
            can_send=False,
            reason=f"{self.channel_label} connection {connection_id} health check not configured",
        )

    async def subscribe_webhooks(self, connection_id: str) -> Dict[str, Any]:
        return {"connection_id": connection_id, "subscribed": False}

    async def normalize_webhook(
        self, payload: Dict[str, Any], *, company_id: str, connection_id: str
    ) -> List[NormalizedChannelEvent]:
        events: List[NormalizedChannelEvent] = []
        for item, asset_id in _messaging_items(payload):
            event = self._event(item, asset_id=asset_id, company_id=company_id, connection_id=connection_id)
            if event is not None:
                events.append(event)
        return events

    async def send_message(
        self,
        *,
        recipient_id: str,
        text: str,
        sender_asset_id: str,
        access_token: str,
    ) -> Dict[str, Any]:
        import httpx
        url = "https://graph.facebook.com/v20.0/me/messages"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "recipient": {"id": recipient_id},
            "message": {"text": text},
        }
        async with httpx.AsyncClient() as client:
            try:
                res = await client.post(url, headers=headers, json=payload, timeout=10.0)
            except Exception as e:
                return {"sent": False, "reason": f"Transport failure: {str(e)}"}
            if res.status_code >= 400:
                return {"sent": False, "reason": f"Meta error: {res.text}"}
            data = res.json()
            message_id = data.get("message_id")
            return {"sent": True, "provider_message_id": message_id}

    async def fetch_media(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        return {"fetched": False, "reason": f"{self.channel_label} media fetch not enabled in Phase 4"}

    async def get_templates_or_capabilities(self, connection_id: str) -> ChannelCapabilities:
        return ChannelCapabilities(
            channel=self.channel,
            supports_inbound=True,
            supports_outbound=True,
            requires_human_approval=True,
            supported_event_types=[
                NormalizedEventType.INBOUND_MESSAGE,
                NormalizedEventType.POSTBACK,
                NormalizedEventType.DELIVERY,
                NormalizedEventType.READ,
                NormalizedEventType.REACTION,
                NormalizedEventType.REFERRAL,
                NormalizedEventType.UNKNOWN,
            ],
            raw_capabilities={"connection_id": connection_id},
        )

    async def revoke_or_disconnect(self, connection_id: str) -> Dict[str, Any]:
        return {"connection_id": connection_id, "disconnected": False}

    def _event(self, item: Dict[str, Any], *, asset_id: Optional[str], company_id: str, connection_id: str) -> Optional[NormalizedChannelEvent]:
        sender = item.get("sender") if isinstance(item.get("sender"), dict) else {}
        recipient = item.get("recipient") if isinstance(item.get("recipient"), dict) else {}
        sender_id = _as_string(sender.get("id"))
        recipient_id = _as_string(recipient.get("id")) or asset_id
        event_type, provider_message_id, text = _classify(item)
        provider_event_id = provider_message_id or _as_string(item.get("timestamp"))
        if not provider_event_id:
            return None
        return NormalizedChannelEvent(
            company_id=company_id,
            channel=self.channel,
            connection_id=connection_id,
            provider_event_id=provider_event_id,
            event_type=event_type,
            sender_id=sender_id,
            recipient_id=recipient_id,
            provider_message_id=provider_message_id,
            provider_thread_id=_thread_id(recipient_id or asset_id, sender_id),
            text=text,
            occurred_at=_timestamp(item.get("timestamp")),
            raw_payload={"messaging": item, "object": _as_string(item.get("object"))},
        )


def _messaging_items(payload: Dict[str, Any]) -> list[tuple[Dict[str, Any], Optional[str]]]:
    messaging = payload.get("messaging")
    if isinstance(messaging, dict):
        entry = payload.get("entry") if isinstance(payload.get("entry"), dict) else {}
        return [(messaging, _as_string(entry.get("id")))]
    items: list[tuple[Dict[str, Any], Optional[str]]] = []
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        asset_id = _as_string(entry.get("id"))
        for item in entry.get("messaging") or []:
            if isinstance(item, dict):
                items.append((item, asset_id))
    return items


def _classify(item: Dict[str, Any]) -> tuple[NormalizedEventType, Optional[str], Optional[str]]:
    message = item.get("message") if isinstance(item.get("message"), dict) else {}
    postback = item.get("postback") if isinstance(item.get("postback"), dict) else {}
    delivery = item.get("delivery") if isinstance(item.get("delivery"), dict) else {}
    read = item.get("read") if isinstance(item.get("read"), dict) else {}
    reaction = item.get("reaction") if isinstance(item.get("reaction"), dict) else {}
    referral = item.get("referral") if isinstance(item.get("referral"), dict) else {}
    if message:
        return NormalizedEventType.INBOUND_MESSAGE, _as_string(message.get("mid")), _as_string(message.get("text"))
    if postback:
        return NormalizedEventType.POSTBACK, _as_string(postback.get("mid") or postback.get("payload")), None
    if delivery:
        mids = delivery.get("mids") if isinstance(delivery.get("mids"), list) else []
        return NormalizedEventType.DELIVERY, _as_string(mids[0] if mids else delivery.get("mid")), None
    if read:
        return NormalizedEventType.READ, _as_string(read.get("mid") or read.get("watermark")), None
    if reaction:
        return NormalizedEventType.REACTION, _as_string(reaction.get("mid")), None
    if referral:
        return NormalizedEventType.REFERRAL, _as_string(referral.get("ref")), None
    return NormalizedEventType.UNKNOWN, _as_string(item.get("mid")), None


def _timestamp(raw: Any) -> Optional[datetime]:
    try:
        value = int(raw)
        if value > 9_999_999_999:
            value = value // 1000
        return from_timestamp_utc(value)
    except (TypeError, ValueError, OSError):
        return None


def _thread_id(asset_id: Optional[str], customer_id: Optional[str]) -> Optional[str]:
    if asset_id and customer_id:
        return f"{asset_id}:{customer_id}"
    return customer_id or asset_id


def _as_string(value: Any) -> Optional[str]:
    return str(value) if value is not None and str(value) else None
