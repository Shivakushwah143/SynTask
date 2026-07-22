from datetime import datetime, timedelta, timezone

from app.integrations.meta.channel_adapters import ChannelHealth, ComposerPolicy
from app.integrations.meta.messaging_models import MetaChannel, NormalizedEventType
from app.integrations.meta.messenger_adapter import MessengerAdapter


def test_messenger_adapter_normalizes_inbound_message():
    adapter = MessengerAdapter()

    events = adapter.normalize_webhook_entry(
        {
            "id": "page-1",
            "time": 1784700000,
            "messaging": [
                {
                    "sender": {"id": "psid-1"},
                    "recipient": {"id": "page-1"},
                    "timestamp": 1784700000456,
                    "message": {"mid": "m-mid-1", "text": "Can you help?"},
                }
            ],
        }
    )

    assert len(events) == 1
    event = events[0]
    assert event.channel == MetaChannel.MESSENGER
    assert event.event_type == NormalizedEventType.INBOUND_MESSAGE
    assert event.provider_event_id == "m-mid-1"
    assert event.provider_asset_id == "page-1"
    assert event.sender_id == "psid-1"
    assert event.recipient_id == "page-1"
    assert event.text == "Can you help?"


def test_messenger_adapter_reports_connection_health_from_fields():
    adapter = MessengerAdapter()

    health = adapter.connection_health(
        {
            "messenger_page_id": "page-1",
            "scoped_sender_ids": ["psid-1"],
            "scopes": ["pages_messaging"],
        }
    )

    assert health == ChannelHealth(status="healthy", reason=None)


def test_messenger_composer_enforces_send_window():
    adapter = MessengerAdapter()
    now = datetime(2026, 7, 22, tzinfo=timezone.utc)

    policy = adapter.composer_policy(
        last_customer_message_at=now - timedelta(hours=25),
        now=now,
        recipient_opted_out=False,
    )

    assert policy == ComposerPolicy(
        can_compose=False,
        reason="Messenger replies are outside the standard customer messaging window.",
    )
