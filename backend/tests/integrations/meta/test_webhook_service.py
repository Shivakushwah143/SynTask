from types import SimpleNamespace

import pytest

from app.integrations.meta.models import MetaWebhookStatus
from app.integrations.meta.webhook_service import MetaWebhookService
from app.integrations.meta import webhook_service


class FakeEvent:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = None


def _service(enqueue, insert):
    class Event(FakeEvent):
        async def insert(self):
            await insert(self)

        async def save(self):
            return None

    return MetaWebhookService(enqueue=enqueue, event_factory=Event)


def test_extract_events_supports_messenger_message_payloads():
    events = list(MetaWebhookService.extract_events(
        {
            "object": "page",
            "entry": [{
                "id": "page-1",
                "time": 1700000000,
                "messaging": [{
                    "sender": {"id": "sender-1"},
                    "recipient": {"id": "page-1"},
                    "timestamp": 1700000001,
                    "message": {"mid": "mid-1", "text": "hello"},
                }],
            }],
        },
        "sha",
    ))

    assert len(events) == 1
    assert events[0].event_type == "message"
    assert events[0].object_type == "page"
    assert events[0].page_id == "page-1"
    assert events[0].object_id == "mid-1"
    assert events[0].provider_event_id == "mid-1"
    assert events[0].payload["messaging"]["message"]["text"] == "hello"


def test_extract_events_supports_instagram_message_payloads():
    events = list(MetaWebhookService.extract_events(
        {
            "object": "instagram",
            "entry": [{
                "id": "ig-professional-1",
                "time": 1700000000,
                "messaging": [{
                    "sender": {"id": "ig-scoped-sender"},
                    "recipient": {"id": "ig-professional-1"},
                    "timestamp": 1700000001,
                    "message": {"mid": "ig-mid-1", "text": "hello ig"},
                }],
            }],
        },
        "sha",
    ))

    assert len(events) == 1
    assert events[0].event_type == "message"
    assert events[0].object_type == "instagram"
    assert events[0].page_id == "ig-professional-1"
    assert events[0].object_id == "ig-mid-1"
    assert events[0].provider_event_id == "ig-mid-1"


def test_extract_events_supports_whatsapp_business_messages_payloads():
    events = list(MetaWebhookService.extract_events(
        {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "waba-1",
                "time": 1700000000,
                "changes": [{
                    "field": "messages",
                    "value": {
                        "metadata": {"phone_number_id": "phone-number-1"},
                        "messages": [{"id": "wamid.1", "from": "15551234567"}],
                    },
                }],
            }],
        },
        "sha",
    ))

    assert len(events) == 1
    assert events[0].event_type == "messages"
    assert events[0].object_type == "whatsapp_business_account"
    assert events[0].page_id == "phone-number-1"
    assert events[0].channel == "whatsapp"
    assert events[0].provider_event_id == "wamid.1"


def test_extract_events_keeps_whatsapp_status_provider_event_id():
    events = list(MetaWebhookService.extract_events(
        {
            "object": "whatsapp_business_account",
            "entry": [{
                "id": "waba-1",
                "time": 1700000000,
                "changes": [{
                    "field": "messages",
                    "value": {
                        "metadata": {"phone_number_id": "phone-number-1"},
                        "statuses": [{"id": "wamid.status.1", "status": "delivered"}],
                    },
                }],
            }],
        },
        "sha",
    ))

    assert len(events) == 1
    assert events[0].object_id == "wamid.status.1"
    assert events[0].provider_event_id == "wamid.status.1"


@pytest.mark.asyncio
async def test_ingest_persists_mapped_event_before_dispatch(monkeypatch):
    persisted = []
    dispatched = []

    async def find_one(query):
        assert query == {"page_id": "page-1", "lead_form_id": "form-1", "enabled": True}
        return SimpleNamespace(company_id="tenant-1")

    async def insert(event):
        persisted.append(event)
        event.id = "event-1"

    monkeypatch.setattr(
        "app.integrations.meta.webhook_service.MetaIntegrationSettings.find_one", find_one
    )
    service = _service(lambda event_id: dispatched.append(event_id), insert)
    result = await service.ingest(
        {
            "object": "page",
            "entry": [{
                "id": "page-1",
                "time": 1700000000,
                "changes": [{"field": "leadgen", "value": {"form_id": "form-1", "leadgen_id": "lead-1"}}],
            }],
        },
        raw_body=b'{"signed":true}',
        correlation_id="corr-1",
    )

    assert result.inserted == 1
    assert result.duplicates == 0
    assert dispatched == ["event-1"]
    assert persisted[0].company_id == "tenant-1"
    assert persisted[0].status == MetaWebhookStatus.QUEUED
    assert persisted[0].correlation_id == "corr-1"


@pytest.mark.asyncio
async def test_duplicate_event_is_acknowledged_without_a_second_dispatch(monkeypatch):
    async def find_one(query):
        return SimpleNamespace(company_id="tenant-1")

    async def insert(event):
        from pymongo.errors import DuplicateKeyError
        raise DuplicateKeyError("duplicate")

    monkeypatch.setattr(
        "app.integrations.meta.webhook_service.MetaIntegrationSettings.find_one", find_one
    )
    dispatched = []
    service = _service(lambda event_id: dispatched.append(event_id), insert)

    result = await service.ingest(
        {"entry": [{"id": "page-1", "time": 1, "changes": [{"field": "leadgen", "value": {"form_id": "form-1", "leadgen_id": "lead-1"}}]}]},
        raw_body=b"{}",
        correlation_id="corr-1",
    )

    assert result.duplicates == 1
    assert result.inserted == 0
    assert dispatched == []


@pytest.mark.asyncio
async def test_unknown_mapping_is_persisted_rejected_and_never_dispatched(monkeypatch):
    persisted = []

    async def find_one(query):
        return None

    async def insert(event):
        persisted.append(event)
        event.id = "event-rejected"

    monkeypatch.setattr(
        "app.integrations.meta.webhook_service.MetaIntegrationSettings.find_one", find_one
    )
    dispatched = []
    service = _service(lambda event_id: dispatched.append(event_id), insert)

    result = await service.ingest(
        {"entry": [{"id": "unknown-page", "time": 1, "changes": [{"field": "leadgen", "value": {"form_id": "unknown-form", "leadgen_id": "lead-1"}}]}]},
        raw_body=b"{}",
        correlation_id="corr-1",
    )

    assert result.rejected == 1
    assert dispatched == []
    assert persisted[0].company_id == MetaWebhookService.UNRESOLVED_COMPANY_ID
    assert persisted[0].status == MetaWebhookStatus.REJECTED


@pytest.mark.asyncio
async def test_initial_enqueue_failure_uses_conditional_status_update_not_stale_save(monkeypatch):
    captured = {}

    class Query:
        async def update(self, *updates, **kwargs):
            captured["updates"] = updates
            captured["kwargs"] = kwargs
            return None

    def find_one(*filters):
        captured["filters"] = filters
        return Query()

    monkeypatch.setattr(webhook_service.MetaWebhookEvent, "find_one", find_one)
    now = webhook_service.datetime.now(webhook_service.timezone.utc)

    await webhook_service.mark_initial_webhook_dispatch_failure(
        "507f1f77bcf86cd799439011", now
    )

    assert captured["filters"] == ({
        "_id": webhook_service.PydanticObjectId("507f1f77bcf86cd799439011"),
        "status": "queued",
    },)
    update = captured["updates"][0]["$set"]
    assert update["status"] == "retry_pending"
    assert update["error_code"] == "queue_dispatch_failed"
    assert update["error_message"] == "Queue dispatch failed"
    assert update["next_retry_at"] > now


@pytest.mark.asyncio
async def test_initial_enqueue_failure_does_not_save_the_stale_event_instance(monkeypatch):
    persisted = []
    updates = []

    async def find_one(query):
        return SimpleNamespace(company_id="tenant-1")

    async def insert(event):
        event.id = "507f1f77bcf86cd799439011"
        persisted.append(event)

    async def conditional_update(event_id, now):
        updates.append((event_id, now))

    monkeypatch.setattr(webhook_service.MetaIntegrationSettings, "find_one", find_one)
    monkeypatch.setattr(webhook_service, "mark_initial_webhook_dispatch_failure", conditional_update)

    class Event(FakeEvent):
        async def insert(self):
            await insert(self)

        async def save(self):
            raise AssertionError("stale event instances must not be saved after enqueue failure")

    service = MetaWebhookService(
        enqueue=lambda _event_id: (_ for _ in ()).throw(ValueError("token=secret")),
        event_factory=Event,
    )
    await service.ingest(
        {"entry": [{"id": "page-1", "time": 1, "changes": [{"field": "leadgen", "value": {"form_id": "form-1", "leadgen_id": "lead-1"}}]}]},
        raw_body=b"{}",
        correlation_id="corr-1",
    )

    assert persisted
    assert updates[0][0] == "507f1f77bcf86cd799439011"


@pytest.mark.asyncio
async def test_ingest_persists_page_messaging_event_without_lead_form(monkeypatch):
    persisted = []
    queries = []

    async def find_one(query):
        queries.append(query)
        return SimpleNamespace(company_id="tenant-1")

    async def insert(event):
        persisted.append(event)
        event.id = "event-1"

    monkeypatch.setattr(
        "app.integrations.meta.webhook_service.MetaIntegrationSettings.find_one", find_one
    )
    dispatched = []
    service = _service(lambda event_id: dispatched.append(event_id), insert)

    result = await service.ingest(
        {
            "object": "instagram",
            "entry": [{
                "id": "ig-professional-1",
                "time": 1784700000,
                "messaging": [{
                    "sender": {"id": "ig-user-1"},
                    "recipient": {"id": "ig-professional-1"},
                    "timestamp": 1784700000123,
                    "message": {"mid": "ig-mid-1", "text": "Need pricing"},
                }],
            }],
        },
        raw_body=b'{"object":"instagram"}',
        correlation_id="corr-ig",
    )

    assert result.inserted == 1
    assert dispatched == ["event-1"]
    assert queries[0] == {
        "instagram_business_account_id": "ig-professional-1",
        "enabled": True,
    }
    assert persisted[0].event_type == "messages"
    assert persisted[0].object_type == "instagram"
    assert persisted[0].object_id == "ig-professional-1"
    assert persisted[0].provider_event_id == "ig-mid-1"


@pytest.mark.asyncio
async def test_ingest_resolves_messenger_events_by_messenger_page_id(monkeypatch):
    queries = []

    async def find_one(query):
        queries.append(query)
        return SimpleNamespace(company_id="tenant-1")

    async def insert(event):
        event.id = "event-1"

    monkeypatch.setattr(
        "app.integrations.meta.webhook_service.MetaIntegrationSettings.find_one", find_one
    )
    service = _service(lambda _event_id: None, insert)

    result = await service.ingest(
        {
            "object": "page",
            "entry": [{
                "id": "messenger-page-1",
                "time": 1784700000,
                "messaging": [{
                    "sender": {"id": "psid-1"},
                    "recipient": {"id": "messenger-page-1"},
                    "timestamp": 1784700000456,
                    "message": {"mid": "m-mid-1", "text": "Can you help?"},
                }],
            }],
        },
        raw_body=b'{"object":"page"}',
        correlation_id="corr-msgr",
    )

    assert result.inserted == 1
    assert queries[0] == {
        "$or": [
            {"page_id": "messenger-page-1", "enabled": True},
            {"messenger_page_id": "messenger-page-1", "enabled": True},
        ]
    }


def test_extract_message_event_id_fallback_includes_sender_and_payload_hash():
    events = list(
        MetaWebhookService.extract_events(
            {
                "object": "page",
                "entry": [{
                    "id": "page-1",
                    "time": 1784700000,
                    "messaging": [
                        {
                            "sender": {"id": "psid-1"},
                            "recipient": {"id": "page-1"},
                            "timestamp": 1784700000456,
                            "message": {"text": "First"},
                        },
                        {
                            "sender": {"id": "psid-2"},
                            "recipient": {"id": "page-1"},
                            "timestamp": 1784700000456,
                            "message": {"text": "Second"},
                        },
                    ],
                }],
            },
            "payload-hash",
        )
    )

    assert len(events) == 2
    assert events[0].provider_event_id != events[1].provider_event_id
    assert events[0].provider_event_id.startswith("page:page-1:psid-1:1784700000456:")
