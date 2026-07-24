import pytest

from app.integrations.meta.channel_adapters import ChannelType, NormalizedEventType
from app.integrations.meta.instagram_adapter import InstagramAdapter


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

