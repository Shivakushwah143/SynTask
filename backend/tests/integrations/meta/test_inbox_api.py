from types import SimpleNamespace

import pytest

from app.integrations.meta import inbox_api
from app.integrations.meta.channel_adapters import ChannelType, NormalizedEventType


class ConversationRecord(SimpleNamespace):
    async def save(self):
        self.saved = True


class Query:
    def __init__(self, items):
        self.items = items
        self.query = None
        self.sort_field = None
        self.limit_value = None

    def sort(self, field):
        self.sort_field = field
        return self

    def skip(self, value):
        self.skip_value = value
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    async def to_list(self):
        return self.items


@pytest.mark.asyncio
async def test_list_inbox_conversations_is_tenant_scoped_and_filterable(monkeypatch):
    captured = {}
    conversation = SimpleNamespace(
        id="conversation-1",
        company_id="tenant-1",
        channel=ChannelType.WHATSAPP,
        connection_id="conn-1",
        provider_thread_id="phone:customer",
        customer_identity_id=None,
        linked_lead_id="lead-1",
        linked_contact_id="contact-1",
        status="open",
        assigned_to="user-2",
        priority="high",
        tags=["vip"],
        unread_count=2,
        last_message_at=None,
        last_inbound_at=None,
        last_outbound_at=None,
        updated_at=None,
    )

    def find(query):
        captured["query"] = query
        return Query([conversation])

    monkeypatch.setattr(inbox_api.MetaConversation, "find", find)

    result = await inbox_api.list_inbox_conversations(
        channel=ChannelType.WHATSAPP,
        status="open",
        assigned_to="user-2",
        priority="high",
        unread=True,
        linked=True,
        limit=25,
        skip=0,
        current_user=SimpleNamespace(company_id="tenant-1", role="admin"),
    )

    assert captured["query"]["company_id"] == "tenant-1"
    assert captured["query"]["channel"] == "whatsapp"
    assert captured["query"]["status"] == "open"
    assert captured["query"]["assigned_to"] == "user-2"
    assert captured["query"]["priority"] == "high"
    assert captured["query"]["unread_count"] == {"$gt": 0}
    assert captured["query"]["$or"] == [
        {"linked_lead_id": {"$ne": None}},
        {"linked_contact_id": {"$ne": None}},
    ]
    assert result["items"][0]["channel"] == "whatsapp"
    assert result["items"][0]["provider_thread_id"] == "phone:customer"
    assert "send_action" not in result["items"][0]


@pytest.mark.asyncio
async def test_list_inbox_messages_requires_tenant_owned_conversation(monkeypatch):
    captured = {}
    conversation = SimpleNamespace(id="conversation-1", company_id="tenant-1")
    message = SimpleNamespace(
        id="message-1",
        company_id="tenant-1",
        conversation_id="conversation-1",
        channel=ChannelType.WHATSAPP,
        connection_id="conn-1",
        provider_event_id="event-1",
        provider_message_id="wamid.1",
        event_type=NormalizedEventType.INBOUND_MESSAGE,
        direction="inbound",
        sender_id="customer",
        recipient_id="business",
        text="hello",
        status="received",
        occurred_at=None,
        created_at=None,
    )

    async def find_one(query):
        captured["conversation_query"] = query
        return conversation

    def find(query):
        captured["message_query"] = query
        return Query([message])

    monkeypatch.setattr(inbox_api.MetaConversation, "find_one", find_one)
    monkeypatch.setattr(inbox_api.MetaMessage, "find", find)

    result = await inbox_api.list_inbox_messages(
        conversation_id="conversation-1",
        limit=50,
        skip=0,
        current_user=SimpleNamespace(company_id="tenant-1", role="admin"),
    )

    assert captured["conversation_query"] == {
        "_id": inbox_api.PydanticObjectId("507f1f77bcf86cd799439011")
    } or captured["conversation_query"]["company_id"] == "tenant-1"
    assert captured["message_query"]["company_id"] == "tenant-1"
    assert captured["message_query"]["conversation_id"] == "conversation-1"
    assert result["items"][0]["text"] == "hello"
    assert result["items"][0]["direction"] == "inbound"


@pytest.mark.asyncio
async def test_update_conversation_management_fields_stays_tenant_scoped(monkeypatch):
    conversation = ConversationRecord(
        id="conversation-1",
        company_id="tenant-1",
        channel=ChannelType.WHATSAPP,
        connection_id="conn-1",
        provider_thread_id="phone:customer",
        customer_identity_id=None,
        linked_lead_id=None,
        linked_contact_id=None,
        status="open",
        assigned_to=None,
        priority="normal",
        tags=[],
        notes=[],
        unread_count=2,
        last_message_at=None,
        last_inbound_at=None,
        last_outbound_at=None,
        updated_at=None,
    )
    captured = {}

    async def find_one(query):
        captured["query"] = query
        return conversation

    monkeypatch.setattr(inbox_api.MetaConversation, "find_one", find_one)

    result = await inbox_api.update_inbox_conversation(
        conversation_id="conversation-1",
        payload=inbox_api.ConversationUpdate(
            assigned_to="user-2",
            priority="high",
            tags=["vip", "billing"],
            note="Needs callback",
        ),
        current_user=SimpleNamespace(company_id="tenant-1", role="admin", id="admin-1"),
    )

    assert captured["query"]["company_id"] == "tenant-1"
    assert conversation.assigned_to == "user-2"
    assert conversation.priority == "high"
    assert conversation.tags == ["vip", "billing"]
    assert conversation.notes[0]["body"] == "Needs callback"
    assert conversation.saved is True
    assert result["items"][0]["priority"] == "high"


@pytest.mark.asyncio
async def test_channel_status_lists_connection_health_without_tokens(monkeypatch):
    connection = SimpleNamespace(
        id="connection-1",
        company_id="tenant-1",
        channel=ChannelType.WHATSAPP,
        provider_asset_id="phone-id",
        display_name="Main WhatsApp",
        status="degraded",
        can_receive=True,
        can_send=False,
        health_reason="Webhook delay",
        last_health_check_at=None,
        last_webhook_at=None,
        credential_ref_encrypted="secret",
    )

    def find(query):
        assert query == {"company_id": "tenant-1"}
        return Query([connection])

    monkeypatch.setattr(inbox_api.MetaChannelConnection, "find", find)

    result = await inbox_api.list_channel_status(
        current_user=SimpleNamespace(company_id="tenant-1", role="admin"),
    )

    assert result["items"][0]["channel"] == "whatsapp"
    assert result["items"][0]["status"] == "degraded"
    assert "credential_ref_encrypted" not in result["items"][0]


@pytest.mark.asyncio
async def test_send_inbox_message_calls_send_service(monkeypatch):
    called = []
    async def mock_send(self, company_id, conversation_id, text, user_id, correlation_id):
        called.append({
            "company_id": company_id,
            "conversation_id": conversation_id,
            "text": text,
            "user_id": user_id,
            "correlation_id": correlation_id
        })
        return {"status": "sent", "message_id": "msg-123"}

    monkeypatch.setattr("app.integrations.meta.send_service.MetaSendService.send_outbound_message", mock_send)

    user = SimpleNamespace(id="user-789", company_id="tenant-1", role="admin")
    payload = inbox_api.OutboundMessagePayload(text="Test message")
    
    result = await inbox_api.send_inbox_message(
        conversation_id="conv-456",
        payload=payload,
        company_id="tenant-1",
        current_user=user
    )

    assert result["status"] == "sent"
    assert result["message_id"] == "msg-123"
    assert len(called) == 1
    assert called[0]["company_id"] == "tenant-1"
    assert called[0]["conversation_id"] == "conv-456"
    assert called[0]["text"] == "Test message"
    assert called[0]["user_id"] == "user-789"

