import pytest
from datetime import datetime, timezone

from app.integrations.meta.channel_adapters import (
    ChannelType,
    NormalizedChannelEvent,
    NormalizedEventType,
)
from app.integrations.meta.messaging_service import MetaMessagingService


class FakeConversation:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = "conversation-1"

    async def insert(self):
        return self


class FakeMessage:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = "message-1"

    async def insert(self):
        return self


class FakeIdentity:
    rows = []

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = kwargs.get("id", "identity-1")

    @classmethod
    async def find_one(cls, query):
        for row in cls.rows:
            if all(getattr(row, key, None) == value for key, value in query.items()):
                return row
        return None

    async def insert(self):
        self.__class__.rows.append(self)
        return self

    async def save(self):
        return self


class FakeActivity:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = "activity-1"

    async def insert(self):
        return self


@pytest.mark.asyncio
async def test_inbound_message_creates_conversation_and_message(monkeypatch):
    created_conversations = []
    created_messages = []

    class ConversationFactory(FakeConversation):
        async def insert(self):
            created_conversations.append(self)
            return self

    class MessageFactory(FakeMessage):
        async def insert(self):
            created_messages.append(self)
            return self

    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.MetaConversation.find_one",
        lambda _query: None,
    )
    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.SalesContact.find_one",
        lambda _query: None,
    )
    service = MetaMessagingService(
        conversation_factory=ConversationFactory,
        message_factory=MessageFactory,
    )
    event = NormalizedChannelEvent(
        company_id="tenant-1",
        channel=ChannelType.WHATSAPP,
        connection_id="conn-1",
        provider_event_id="event-1",
        provider_message_id="message-1",
        event_type=NormalizedEventType.INBOUND_MESSAGE,
        sender_id="customer-phone",
        recipient_id="business-phone",
        text="need pricing",
        raw_payload={"safe": "copy"},
    )

    result = await service.process_normalized_event(event, correlation_id="corr-1")

    assert result == "message_created"
    assert created_conversations[0].company_id == "tenant-1"
    assert created_conversations[0].channel == ChannelType.WHATSAPP
    assert created_messages[0].direction == "inbound"


@pytest.mark.asyncio
async def test_inbound_message_upserts_customer_identity_and_sets_conversation(monkeypatch):
    created_conversations = []
    FakeIdentity.rows = []

    class ConversationFactory(FakeConversation):
        async def insert(self):
            created_conversations.append(self)
            return self

    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.MetaConversation.find_one",
        lambda _query: None,
    )
    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.SalesContact.find_one",
        lambda _query: None,
    )
    event = NormalizedChannelEvent(
        company_id="tenant-1",
        channel=ChannelType.WHATSAPP,
        connection_id="conn-1",
        provider_event_id="event-1",
        event_type=NormalizedEventType.INBOUND_MESSAGE,
        sender_id="15551234567",
        recipient_id="business-phone",
    )

    await MetaMessagingService(
        conversation_factory=ConversationFactory,
        message_factory=FakeMessage,
        identity_model=FakeIdentity,
    ).process_normalized_event(event, correlation_id="corr-1")

    assert FakeIdentity.rows[0].company_id == "tenant-1"
    assert FakeIdentity.rows[0].channel == ChannelType.WHATSAPP
    assert FakeIdentity.rows[0].provider_user_id == "15551234567"
    assert FakeIdentity.rows[0].normalized_phone == "5551234567"
    assert created_conversations[0].customer_identity_id == "identity-1"


@pytest.mark.asyncio
async def test_whatsapp_inbound_links_matching_contact_and_lead_and_creates_timeline(monkeypatch):
    created_conversations = []
    created_messages = []
    published_events = []

    class ConversationFactory(FakeConversation):
        async def insert(self):
            created_conversations.append(self)
            return self

    class MessageFactory(FakeMessage):
        async def insert(self):
            created_messages.append(self)
            return self

    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.MetaConversation.find_one",
        lambda _query: None,
    )
    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.SalesContact.find_one",
        lambda _query: type("Contact", (), {"id": "contact-1"})(),
    )
    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.SalesProspect.find_one",
        lambda _query: type("Lead", (), {"id": "lead-1"})(),
    )

    async def fake_publish(**kwargs):
        published_events.append(kwargs)

    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.publish_crm_timeline_event",
        fake_publish,
    )
    service = MetaMessagingService(
        conversation_factory=ConversationFactory,
        message_factory=MessageFactory,
    )
    event = NormalizedChannelEvent(
        company_id="tenant-1",
        channel=ChannelType.WHATSAPP,
        connection_id="conn-1",
        provider_event_id="wamid-1",
        provider_message_id="wamid-1",
        event_type=NormalizedEventType.INBOUND_MESSAGE,
        sender_id="919876543210",
        recipient_id="business-phone",
        text="need pricing",
        raw_payload={"safe": "copy"},
    )

    result = await service.process_normalized_event(event, correlation_id="corr-1")

    assert result == "message_created"
    assert created_conversations[0].linked_contact_id == "contact-1"
    assert created_conversations[0].linked_lead_id == "lead-1"
    assert published_events[0]["aggregate_type"] == "lead"
    assert published_events[0]["aggregate_id"] == "lead-1"
    assert published_events[0]["payload"]["title"] == "WhatsApp message received"
    assert published_events[0]["metadata"]["provider_message_id"] == "wamid-1"


@pytest.mark.asyncio
async def test_non_message_event_is_recorded_without_provider_send(monkeypatch):
    created_messages = []

    class MessageFactory(FakeMessage):
        async def insert(self):
            created_messages.append(self)
            return self

    existing = FakeConversation(
        company_id="tenant-1",
        channel=ChannelType.MESSENGER,
        connection_id="conn-1",
        provider_thread_id="sender-1",
    )
    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.MetaConversation.find_one",
        lambda _query: existing,
    )
    service = MetaMessagingService(message_factory=MessageFactory)
    event = NormalizedChannelEvent(
        company_id="tenant-1",
        channel=ChannelType.MESSENGER,
        connection_id="conn-1",
        provider_event_id="event-read",
        event_type=NormalizedEventType.READ,
        sender_id="sender-1",
        recipient_id="page-1",
        raw_payload={"read": {"watermark": 1}},
    )

    result = await service.process_normalized_event(event, correlation_id="corr-2")

    assert result == "event_recorded"
    assert created_messages[0].direction == "system"
    assert created_messages[0].event_type == NormalizedEventType.READ
    assert created_messages[0].provider_message_id == "event-read"


@pytest.mark.asyncio
async def test_existing_whatsapp_conversation_updates_inbox_state(monkeypatch):
    saved = []
    existing = FakeConversation(
        company_id="tenant-1",
        channel=ChannelType.WHATSAPP,
        connection_id="conn-1",
        provider_thread_id="phone-number-1:15551234567",
        linked_lead_id=None,
        unread_count=2,
        last_message_at=None,
        last_inbound_at=None,
    )

    async def save_existing():
        saved.append(existing)

    existing.save = save_existing
    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.MetaConversation.find_one",
        lambda _query: existing,
    )
    event = NormalizedChannelEvent(
        company_id="tenant-1",
        channel=ChannelType.WHATSAPP,
        connection_id="conn-1",
        provider_event_id="wamid.2",
        provider_message_id="wamid.2",
        provider_thread_id="phone-number-1:15551234567",
        event_type=NormalizedEventType.INBOUND_MESSAGE,
        sender_id="15551234567",
        recipient_id="phone-number-1",
        text="Second message",
        occurred_at=datetime.fromtimestamp(1784688120, tz=timezone.utc),
    )

    await MetaMessagingService(message_factory=FakeMessage).process_normalized_event(
        event, correlation_id="corr-2"
    )

    assert saved == [existing]
    assert existing.unread_count == 3
    assert existing.last_message_at == event.occurred_at
    assert existing.last_inbound_at == event.occurred_at


@pytest.mark.asyncio
async def test_whatsapp_inbound_links_existing_contact_and_publishes_timeline(monkeypatch):
    created_conversations = []
    published_events = []

    class ConversationFactory(FakeConversation):
        async def insert(self):
            created_conversations.append(self)
            return self

    class ExistingContact:
        id = "contact-1"

    class ExistingLead:
        id = "lead-1"
        contact_id = "contact-1"

    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.MetaConversation.find_one",
        lambda _query: None,
    )
    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.SalesContact.find_one",
        lambda query: ExistingContact()
        if query["company_id"] == "tenant-1" and query["phone"] == "5551234567"
        else None,
    )
    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.SalesProspect.find_one",
        lambda query: ExistingLead()
        if query["company_id"] == "tenant-1" and query["contact_id"] == "contact-1"
        else None,
    )

    async def fake_publish(**kwargs):
        published_events.append(kwargs)

    monkeypatch.setattr(
        "app.integrations.meta.messaging_service.publish_crm_timeline_event",
        fake_publish,
    )
    service = MetaMessagingService(
        conversation_factory=ConversationFactory,
        message_factory=FakeMessage,
    )
    event = NormalizedChannelEvent(
        company_id="tenant-1",
        channel=ChannelType.WHATSAPP,
        connection_id="conn-1",
        provider_event_id="wamid.1",
        provider_message_id="wamid.1",
        provider_thread_id="phone-number-1:15551234567",
        event_type=NormalizedEventType.INBOUND_MESSAGE,
        sender_id="15551234567",
        recipient_id="phone-number-1",
        text="Need pricing",
    )

    await service.process_normalized_event(event, correlation_id="corr-1")

    assert created_conversations[0].linked_contact_id == "contact-1"
    assert created_conversations[0].linked_lead_id == "lead-1"
    assert published_events[0]["event_name"] == "WhatsAppMessageReceived"
    assert published_events[0]["aggregate_type"] == "lead"
    assert published_events[0]["aggregate_id"] == "lead-1"
    assert published_events[0]["payload"]["title"] == "WhatsApp message received"
    assert "Need pricing" not in published_events[0]["payload"].values()
