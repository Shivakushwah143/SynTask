import pytest
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from app.integrations.meta.send_service import MetaSendService
from app.integrations.meta.channel_adapters import ChannelType, NormalizedEventType

class FakeConnection:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = ObjectId()
        self.status = kwargs.get("status", "active")
        self.provider_asset_id = "asset-123"
        self.page_id = "page-123"
        self.credential_ref_encrypted = "enc-token"
        self.company_id = "company-1"
        self.channel = kwargs.get("channel", ChannelType.INSTAGRAM)

    @classmethod
    async def get(cls, doc_id):
        return cls._inst

class FakeConversation:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = ObjectId()
        self.company_id = "company-1"
        self.connection_id = str(ObjectId())
        self.channel = kwargs.get("channel", ChannelType.INSTAGRAM)
        self.provider_thread_id = "sender-123:recipient-456"
        self.last_inbound_at = kwargs.get("last_inbound_at", datetime.now(timezone.utc))
        self.linked_lead_id = "lead-1"
        self.linked_contact_id = "contact-1"
        self.unread_count = 2

    async def save(self):
        return self

    @classmethod
    async def get(cls, doc_id):
        return cls._inst

class FakeMessage:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = ObjectId()
    async def insert(self):
        return self

@pytest.fixture
def send_service_mocks(monkeypatch):
    monkeypatch.setattr("app.integrations.meta.send_service.MetaChannelConnection", FakeConnection)
    monkeypatch.setattr("app.integrations.meta.send_service.MetaConversation", FakeConversation)
    monkeypatch.setattr("app.integrations.meta.send_service.MetaMessage", FakeMessage)
    monkeypatch.setattr("app.integrations.meta.send_service.MetaIntegrationConfigService.reveal_secret", lambda x: "decrypted-token")
    
    # Mock timeline publisher
    published_events = []
    async def mock_publish(*args, **kwargs):
        published_events.append(kwargs)
    monkeypatch.setattr("app.integrations.meta.send_service.publish_crm_timeline_event", mock_publish)
    return published_events

@pytest.mark.asyncio
async def test_send_message_success(send_service_mocks, monkeypatch):
    # Setup instances
    conn = FakeConnection(channel=ChannelType.INSTAGRAM)
    conv = FakeConversation(channel=ChannelType.INSTAGRAM, last_inbound_at=datetime.now(timezone.utc))
    FakeConnection._inst = conn
    FakeConversation._inst = conv

    # Mock adapter send
    send_called = []
    async def mock_send(recipient_id, text, sender_asset_id, access_token):
        send_called.append({
            "recipient_id": recipient_id,
            "text": text,
            "sender_asset_id": sender_asset_id,
            "access_token": access_token
        })
        return {"sent": True, "provider_message_id": "prov-msg-789"}

    service = MetaSendService()
    monkeypatch.setattr(service._instagram_adapter, "send_message", mock_send)

    res = await service.send_outbound_message(
        company_id="company-1",
        conversation_id=str(conv.id),
        text="Hello customer",
        user_id="user-123",
        correlation_id="corr-1"
    )

    assert res["status"] == "sent"
    assert res["provider_message_id"] == "prov-msg-789"
    assert len(send_called) == 1
    assert send_called[0]["recipient_id"] == "recipient-456"
    assert send_called[0]["text"] == "Hello customer"
    assert send_called[0]["sender_asset_id"] == "page-123"
    assert send_called[0]["access_token"] == "decrypted-token"
    
    # Check timeline publishing
    assert len(send_service_mocks) == 1
    assert send_service_mocks[0]["event_name"] == "InstagramMessageSent"
    assert send_service_mocks[0]["aggregate_id"] == "lead-1"


@pytest.mark.asyncio
async def test_send_message_24h_window_blocked(send_service_mocks, monkeypatch):
    conn = FakeConnection(channel=ChannelType.INSTAGRAM)
    # last_inbound_at is 25 hours ago
    conv = FakeConversation(channel=ChannelType.INSTAGRAM, last_inbound_at=datetime.now(timezone.utc) - timedelta(hours=25))
    FakeConnection._inst = conn
    FakeConversation._inst = conv

    service = MetaSendService()
    with pytest.raises(ValueError, match="24-hour"):
        await service.send_outbound_message(
            company_id="company-1",
            conversation_id=str(conv.id),
            text="Hello customer",
            user_id="user-123",
            correlation_id="corr-1"
        )


@pytest.mark.asyncio
async def test_send_message_connection_inactive(send_service_mocks, monkeypatch):
    conn = FakeConnection(channel=ChannelType.INSTAGRAM, status="reauth_required")
    conv = FakeConversation(channel=ChannelType.INSTAGRAM)
    FakeConnection._inst = conn
    FakeConversation._inst = conv

    service = MetaSendService()
    with pytest.raises(ValueError, match="active"):
        await service.send_outbound_message(
            company_id="company-1",
            conversation_id=str(conv.id),
            text="Hello customer",
            user_id="user-123",
            correlation_id="corr-1"
        )
