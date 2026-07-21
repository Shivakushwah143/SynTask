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
