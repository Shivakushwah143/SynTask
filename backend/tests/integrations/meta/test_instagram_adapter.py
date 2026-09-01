from datetime import datetime, timezone

from app.integrations.meta.channel_adapters import ChannelHealth, ComposerPolicy
from app.integrations.meta.instagram_adapter import InstagramMessagingAdapter
from app.integrations.meta.messaging_models import MetaChannel, NormalizedEventType


def test_instagram_adapter_normalizes_inbound_message():
    adapter = InstagramMessagingAdapter()

    events = adapter.normalize_webhook_entry(
        {
            "id": "ig-professional-1",
            "time": 1784700000,
            "messaging": [
                {
                    "sender": {"id": "ig-user-1"},
                    "recipient": {"id": "ig-professional-1"},
                    "timestamp": 1784700000123,
                    "message": {
                        "mid": "ig-mid-1",
                        "text": "Need pricing",
                        "reply_to": {"mid": "ig-mid-0"},
                    },
                }
            ],
        }
    )

    assert len(events) == 1
    event = events[0]
    assert event.channel == MetaChannel.INSTAGRAM
    assert event.event_type == NormalizedEventType.INBOUND_MESSAGE
    assert event.provider_event_id == "ig-mid-1"
    assert event.provider_asset_id == "ig-professional-1"
    assert event.sender_id == "ig-user-1"
    assert event.recipient_id == "ig-professional-1"
    assert event.text == "Need pricing"
    assert event.metadata["reply_to_mid"] == "ig-mid-0"


def test_instagram_adapter_reports_connection_health_from_fields():
    adapter = InstagramMessagingAdapter()

    health = adapter.connection_health(
        {
            "instagram_business_account_id": "ig-professional-1",
            "scoped_sender_ids": ["ig-user-1"],
            "scopes": ["instagram_manage_messages", "pages_messaging"],
        }
    )

    assert health == ChannelHealth(status="healthy", reason=None)


def test_instagram_composer_requires_existing_customer_thread():
    adapter = InstagramMessagingAdapter()

    policy = adapter.composer_policy(
        last_customer_message_at=None,
        now=datetime(2026, 7, 22, tzinfo=timezone.utc),
        recipient_opted_out=False,
    )

    assert policy == ComposerPolicy(
        can_compose=False,
        reason="Instagram replies require an existing customer-initiated conversation.",
    )
