import pytest

from app.integrations.meta.channel_adapters import ChannelType, NormalizedEventType
from app.integrations.meta.messenger_adapter import MessengerAdapter


@pytest.mark.asyncio
async def test_messenger_adapter_normalizes_inbound_message():
    events = await MessengerAdapter().normalize_webhook(
        {
            "object": "page",
            "entry": {"id": "page-1"},
            "messaging": {
                "sender": {"id": "psid-1"},
                "recipient": {"id": "page-1"},
                "timestamp": 1784700000000,
                "message": {"mid": "mid-1", "text": "Need quote"},
            },
        },
        company_id="tenant-1",
        connection_id="conn-page",
    )

    assert len(events) == 1
    event = events[0]
    assert event.channel == ChannelType.MESSENGER
    assert event.event_type == NormalizedEventType.INBOUND_MESSAGE
    assert event.provider_event_id == "mid-1"
    assert event.provider_message_id == "mid-1"
    assert event.provider_thread_id == "page-1:psid-1"
    assert event.sender_id == "psid-1"
    assert event.recipient_id == "page-1"
    assert event.text == "Need quote"


@pytest.mark.asyncio
async def test_messenger_adapter_normalizes_delivery_and_blocks_send(monkeypatch):
    adapter = MessengerAdapter()
    events = await adapter.normalize_webhook(
        {
            "object": "page",
            "entry": {"id": "page-1"},
            "messaging": {
                "sender": {"id": "page-1"},
                "recipient": {"id": "psid-1"},
                "delivery": {"mids": ["mid-1"], "watermark": 1784700000000},
            },
        },
        company_id="tenant-1",
        connection_id="conn-page",
    )

    assert events[0].event_type == NormalizedEventType.DELIVERY
    assert events[0].provider_message_id == "mid-1"

    # Mock httpx response to test send_message
    class MockResponse:
        status_code = 400
        text = "Mocked bad request"
    
    async def mock_post(*args, **kwargs):
        return MockResponse()
        
    monkeypatch.setattr("httpx.AsyncClient.post", mock_post)

    result = await adapter.send_message(
        recipient_id="psid-1",
        text="Hello",
        sender_asset_id="page-1",
        access_token="fake-token",
    )
    assert result["sent"] is False
    assert "Meta error" in result["reason"]


@pytest.mark.asyncio
async def test_messenger_capabilities_are_human_approved_inbound_only():
    capabilities = await MessengerAdapter().get_templates_or_capabilities("conn-page")

    assert capabilities.channel == ChannelType.MESSENGER
    assert capabilities.supports_inbound is True
    assert capabilities.supports_outbound is True
    assert capabilities.requires_human_approval is True

