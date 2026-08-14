"""Instagram adapter tests.

The original file was corrupted by a bad merge (two versions of the tests were
concatenated mid-function, producing ``SyntaxError: '(' was never closed``).
This reconstruction keeps both adapter styles that exist in the module:

- ``InstagramAdapter`` (``SocialMessagingAdapter`` subclass) — async
  ``normalize_webhook`` / ``send_message`` / capabilities.
- ``InstagramMessagingAdapter`` — sync ``normalize_webhook_entry`` /
  ``connection_health`` / ``composer_policy``.

No Meta integration functionality was modified.
"""
from datetime import datetime, timezone

import pytest

from app.integrations.meta.channel_adapters import (
    ChannelHealth,
    ChannelType,
    ComposerPolicy,
    NormalizedEventType,
)
from app.integrations.meta.instagram_adapter import InstagramAdapter, InstagramMessagingAdapter
from app.integrations.meta.messaging_models import MetaChannel


# =============================================================================
# InstagramAdapter (SocialMessagingAdapter protocol)
# =============================================================================


@pytest.mark.asyncio
async def test_instagram_adapter_normalizes_inbound_message():
    events = await InstagramAdapter().normalize_webhook(
        {
            "object": "instagram",
            "entry": {"id": "ig-business-1"},
            "messaging": {
                "sender": {"id": "ig-user-1"},
                "recipient": {"id": "ig-business-1"},
                "timestamp": 1784700000000,
                "message": {"mid": "ig-mid-1", "text": "Need demo"},
            },
        },
        company_id="tenant-1",
        connection_id="conn-ig",
    )

    assert len(events) == 1
    event = events[0]
    assert event.channel == ChannelType.INSTAGRAM
    assert event.event_type == NormalizedEventType.INBOUND_MESSAGE
    assert event.provider_event_id == "ig-mid-1"
    assert event.provider_message_id == "ig-mid-1"
    assert event.provider_thread_id == "ig-business-1:ig-user-1"
    assert event.sender_id == "ig-user-1"
    assert event.recipient_id == "ig-business-1"
    assert event.text == "Need demo"


@pytest.mark.asyncio
async def test_instagram_adapter_normalizes_postback_and_blocks_send(monkeypatch):
    adapter = InstagramAdapter()
    events = await adapter.normalize_webhook(
        {
            "object": "instagram",
            "entry": {"id": "ig-business-1"},
            "messaging": {
                "sender": {"id": "ig-user-1"},
                "recipient": {"id": "ig-business-1"},
                "postback": {"mid": "postback-1", "payload": "START"},
            },
        },
        company_id="tenant-1",
        connection_id="conn-ig",
    )

    assert events[0].event_type == NormalizedEventType.POSTBACK
    assert events[0].provider_event_id == "postback-1"

    # Mock httpx response to test send_message
    class MockResponse:
        status_code = 400
        text = "Mocked bad request"

    async def mock_post(*args, **kwargs):
        return MockResponse()

    monkeypatch.setattr("httpx.AsyncClient.post", mock_post)

    result = await adapter.send_message(
        recipient_id="ig-user-1",
        text="Hello",
        sender_asset_id="ig-business-1",
        access_token="fake-token",
    )
    assert result["sent"] is False
    assert "Meta error" in result["reason"]


@pytest.mark.asyncio
async def test_instagram_capabilities_are_human_approved_inbound_only():
    capabilities = await InstagramAdapter().get_templates_or_capabilities("conn-ig")

    assert capabilities.channel == ChannelType.INSTAGRAM
    assert capabilities.supports_inbound is True
    assert capabilities.supports_outbound is True
    assert capabilities.requires_human_approval is True


# =============================================================================
# InstagramMessagingAdapter (entry-based adapter)
# =============================================================================


def test_instagram_messaging_adapter_normalizes_inbound_entry():
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
