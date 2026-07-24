from datetime import datetime, timezone

import pytest

from app.integrations.meta.channel_adapters import ChannelType, NormalizedEventType
from app.integrations.meta.whatsapp_adapter import WhatsAppAdapter


@pytest.mark.asyncio
async def test_whatsapp_adapter_normalizes_inbound_text_message():
    adapter = WhatsAppAdapter()
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "waba-1",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "metadata": {"phone_number_id": "phone-number-1"},
                            "contacts": [{"wa_id": "15551234567"}],
                            "messages": [
                                {
                                    "id": "wamid.1",
                                    "from": "15551234567",
                                    "timestamp": "1784688000",
                                    "type": "text",
                                    "text": {"body": "Need pricing"},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }

    events = await adapter.normalize_webhook(
        payload, company_id="tenant-1", connection_id="conn-1"
    )

    assert len(events) == 1
    event = events[0]
    assert event.company_id == "tenant-1"
    assert event.channel == ChannelType.WHATSAPP
    assert event.event_type == NormalizedEventType.INBOUND_MESSAGE
    assert event.provider_event_id == "wamid.1"
    assert event.provider_message_id == "wamid.1"
    assert event.provider_thread_id == "phone-number-1:15551234567"
    assert event.sender_id == "15551234567"
    assert event.recipient_id == "phone-number-1"
    assert event.text == "Need pricing"
    assert event.occurred_at == datetime.fromtimestamp(1784688000, tz=timezone.utc)


@pytest.mark.asyncio
async def test_whatsapp_adapter_normalizes_status_delivery_event():
    adapter = WhatsAppAdapter()
    payload = {
        "entry": [
            {
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "metadata": {"phone_number_id": "phone-number-1"},
                            "statuses": [
                                {
                                    "id": "wamid.1",
                                    "recipient_id": "15551234567",
                                    "status": "delivered",
                                    "timestamp": "1784688060",
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }

    events = await adapter.normalize_webhook(
        payload, company_id="tenant-1", connection_id="conn-1"
    )

    assert len(events) == 1
    event = events[0]
    assert event.event_type == NormalizedEventType.DELIVERY
    assert event.provider_event_id == "wamid.1:delivered"
    assert event.sender_id == "phone-number-1"
    assert event.recipient_id == "15551234567"
