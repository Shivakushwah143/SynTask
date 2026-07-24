from datetime import datetime, timezone

import pytest

from app.integrations.meta.models import MetaWebhookStatus
from app.integrations.meta import tasks


class RetryCalled(Exception):
    pass


class FakeTask:
    def __init__(self, retries=0):
        self.request = type("Request", (), {"retries": retries})()
        self.calls = []

    def retry(self, **kwargs):
        self.calls.append(kwargs)
        raise RetryCalled()


class FakeEvent:
    def __init__(self, attempt_count=0):
        self.status = MetaWebhookStatus.QUEUED
        self.attempt_count = attempt_count
        self.processing_started_at = None
        self.processed_at = None
        self.queued_at = None
        self.next_retry_at = None
        self.error_code = None
        self.error_message = None
        self.updated_at = None
        self.saved = 0
        self.id = "507f1f77bcf86cd799439011"
        self.company_id = "tenant-1"
        self.event_type = "message"
        self.object_type = "page"
        self.object_id = "mid-1"
        self.provider_event_id = "mid-1"
        self.payload = {
            "object": "page",
            "entry": {"id": "page-1", "time": 1700000000},
            "messaging": {
                "sender": {"id": "sender-1"},
                "recipient": {"id": "page-1"},
                "timestamp": 1700000001,
                "message": {"mid": "mid-1", "text": "hello"},
            },
            "connection": {"id": "connection-1", "channel": "messenger"},
        }
        self.correlation_id = "corr-1"

    async def save(self):
        self.saved += 1


async def _return_event(event):
    return event


@pytest.mark.asyncio
async def test_execute_event_routes_non_lead_message_to_messaging_service(monkeypatch):
    processed = []
    event = FakeEvent()

    class Service:
        async def process_normalized_event(self, normalized, *, correlation_id):
            processed.append((normalized, correlation_id))
            return "message_created"

    monkeypatch.setattr(tasks, "MetaMessagingService", Service)

    await tasks._execute_event(event)

    assert len(processed) == 1
    normalized, correlation_id = processed[0]
    assert normalized.company_id == "tenant-1"
    assert normalized.channel.value == "messenger"
    assert normalized.connection_id == "connection-1"
    assert normalized.event_type.value == "inbound_message"
    assert normalized.provider_message_id == "mid-1"
    assert normalized.provider_thread_id == "page-1:sender-1"
    assert normalized.text == "hello"
    assert correlation_id == "corr-1"


@pytest.mark.asyncio
async def test_execute_event_routes_instagram_message_through_adapter(monkeypatch):
    processed = []
    event = FakeEvent()
    event.object_type = "instagram"
    event.payload = {
        "object": "instagram",
        "entry": {"id": "ig-business-1", "time": 1700000000},
        "messaging": {
            "sender": {"id": "ig-user-1"},
            "recipient": {"id": "ig-business-1"},
            "timestamp": 1700000001000,
            "message": {"mid": "ig-mid-1", "text": "hello ig"},
        },
        "connection": {"id": "connection-ig", "channel": "instagram"},
    }

    class Service:
        async def process_normalized_event(self, normalized, *, correlation_id):
            processed.append((normalized, correlation_id))
            return "message_created"

    monkeypatch.setattr(tasks, "MetaMessagingService", Service)

    await tasks._execute_event(event)

    assert len(processed) == 1
    normalized, _correlation_id = processed[0]
    assert normalized.channel.value == "instagram"
    assert normalized.connection_id == "connection-ig"
    assert normalized.provider_message_id == "ig-mid-1"
    assert normalized.provider_thread_id == "ig-business-1:ig-user-1"
    assert normalized.text == "hello ig"


@pytest.mark.asyncio
async def test_execute_event_routes_whatsapp_change_payload_to_messaging_service(monkeypatch):
    processed = []
    event = FakeEvent()
    event.event_type = "messages"
    event.object_type = "whatsapp_business_account"
    event.provider_event_id = "wamid.1"
    event.object_id = "wamid.1"
    event.payload = {
        "object": "whatsapp_business_account",
        "change": {
            "field": "messages",
            "value": {
                "metadata": {"phone_number_id": "phone-number-1"},
                "messages": [{
                    "id": "wamid.1",
                    "from": "15551234567",
                    "timestamp": "1784688000",
                    "type": "text",
                    "text": {"body": "Need pricing"},
                }],
            },
        },
        "connection": {"id": "connection-1", "channel": "whatsapp"},
    }

    class Service:
        async def process_normalized_event(self, normalized, *, correlation_id):
            processed.append((normalized, correlation_id))
            return "message_created"

    monkeypatch.setattr(tasks, "MetaMessagingService", Service)

    await tasks._execute_event(event)

    assert len(processed) == 1
    normalized, _correlation_id = processed[0]
    assert normalized.channel.value == "whatsapp"
    assert normalized.provider_message_id == "wamid.1"
    assert normalized.provider_thread_id == "phone-number-1:15551234567"
    assert normalized.text == "Need pricing"


@pytest.mark.asyncio
async def test_execute_event_processes_every_whatsapp_normalized_event(monkeypatch):
    processed = []
    event = FakeEvent()
    event.event_type = "messages"
    event.object_type = "whatsapp_business_account"
    event.payload = {
        "object": "whatsapp_business_account",
        "change": {
            "field": "messages",
            "value": {
                "metadata": {"phone_number_id": "phone-number-1"},
                "messages": [
                    {"id": "wamid.1", "from": "15551234567", "type": "text", "text": {"body": "One"}},
                    {"id": "wamid.2", "from": "15557654321", "type": "text", "text": {"body": "Two"}},
                ],
                "statuses": [
                    {"id": "wamid.3", "recipient_id": "15559876543", "status": "delivered"}
                ],
            },
        },
        "connection": {"id": "connection-1", "channel": "whatsapp"},
    }

    class Service:
        async def process_normalized_event(self, normalized, *, correlation_id):
            processed.append(normalized.provider_event_id)
            return "message_created"

    monkeypatch.setattr(tasks, "MetaMessagingService", Service)

    await tasks._execute_event(event)

    assert processed == ["wamid.1", "wamid.2", "wamid.3:delivered"]


@pytest.mark.asyncio
async def test_execute_event_quarantines_unknown_messaging_event_without_processing(monkeypatch):
    processed = []
    event = FakeEvent()
    event.event_type = "unknown"
    event.payload["messaging"] = {
        "sender": {"id": "sender-1"},
        "recipient": {"id": "page-1"},
        "timestamp": 1700000001,
        "unsupported": {"value": "ignored"},
    }

    class Service:
        async def process_normalized_event(self, normalized, *, correlation_id):
            processed.append((normalized, correlation_id))

    monkeypatch.setattr(tasks, "MetaMessagingService", Service)

    await tasks._execute_event(event)

    assert processed == []
    assert event.status == MetaWebhookStatus.REJECTED
    assert event.error_code == "unsupported_messaging_event"
    assert event.error_message == "Unsupported Meta messaging event"


@pytest.mark.asyncio
async def test_claim_uses_one_conditional_update_for_pending_statuses(monkeypatch):
    captured = {}
    claimed_event = FakeEvent(attempt_count=1)

    class Query:
        async def update(self, *updates, **kwargs):
            captured["updates"] = updates
            captured["kwargs"] = kwargs
            return claimed_event

    def find_one(*filters):
        captured["filters"] = filters
        return Query()

    monkeypatch.setattr(tasks.MetaWebhookEvent, "find_one", find_one)

    claimed = await tasks.claim_meta_webhook_event("507f1f77bcf86cd799439011")

    assert claimed is claimed_event
    claim_filter = captured["filters"][0]
    assert claim_filter["_id"] == tasks.PydanticObjectId("507f1f77bcf86cd799439011")
    assert claim_filter["attempt_count"] == {"$lt": tasks.MAX_PROCESSING_RETRIES}
    assert claim_filter["$or"][0] == {"status": "queued"}
    assert claim_filter["$or"][1]["status"] == "retry_pending"
    assert claim_filter["$or"][1]["next_retry_at"]["$lte"] <= datetime.now(timezone.utc)
    assert captured["updates"][0]["$set"]["status"] == "processing"
    assert captured["updates"][0]["$inc"] == {"attempt_count": 1}
    assert captured["kwargs"]["response_type"] == tasks.UpdateResponse.NEW_DOCUMENT


@pytest.mark.asyncio
async def test_claim_returns_none_when_another_worker_already_claimed_event(monkeypatch):
    class Query:
        async def update(self, *args, **kwargs):
            return None

    monkeypatch.setattr(tasks.MetaWebhookEvent, "find_one", lambda *args: Query())

    assert await tasks.claim_meta_webhook_event("507f1f77bcf86cd799439011") is None


@pytest.mark.asyncio
async def test_claim_keeps_future_retry_pending_events_out_of_the_atomic_query(monkeypatch):
    captured = {}

    class Query:
        async def update(self, *args, **kwargs):
            return None

    def find_one(*filters):
        captured["filters"] = filters
        return Query()

    monkeypatch.setattr(tasks.MetaWebhookEvent, "find_one", find_one)

    await tasks.claim_meta_webhook_event("507f1f77bcf86cd799439011")

    claim_filter = captured["filters"][0]
    assert claim_filter["$or"][0] == {"status": "queued"}
    assert claim_filter["$or"][1]["status"] == "retry_pending"
    assert claim_filter["$or"][1]["next_retry_at"]["$lte"] <= datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_claim_allows_retry_pending_only_when_next_retry_is_due(monkeypatch):
    claimed_event = FakeEvent(attempt_count=2)
    captured = {}

    class Query:
        async def update(self, *args, **kwargs):
            return claimed_event

    def find_one(*filters):
        captured["filters"] = filters
        return Query()

    monkeypatch.setattr(tasks.MetaWebhookEvent, "find_one", find_one)

    assert await tasks.claim_meta_webhook_event("507f1f77bcf86cd799439011") is claimed_event
    retry_branch = captured["filters"][0]["$or"][1]
    assert retry_branch["next_retry_at"]["$lte"] <= datetime.now(timezone.utc)


def test_retry_uses_a_generic_sanitized_exception(monkeypatch):
    async def fail(_event_id):
        raise ValueError("access_token=secret-value email=person@example.com")

    monkeypatch.setattr(tasks, "_process_event", fail)
    task = FakeTask()

    with pytest.raises(RetryCalled):
        tasks.run_meta_webhook_event(task, "event-1")

    retry_exception = task.calls[0]["exc"]
    assert str(retry_exception) == "Meta webhook processing failed"
    assert "secret-value" not in str(retry_exception)
    assert "person@example.com" not in str(retry_exception)


@pytest.mark.asyncio
async def test_third_processing_attempt_transitions_to_failed_without_retry(monkeypatch):
    event = FakeEvent(attempt_count=tasks.MAX_PROCESSING_RETRIES)

    async def claim(_event_id):
        return event

    async def fail(_event):
        raise ValueError("provider failure")

    monkeypatch.setattr(tasks, "claim_meta_webhook_event", claim)
    monkeypatch.setattr(tasks, "_execute_event", fail)
    monkeypatch.setattr(tasks.settings, "META_INTEGRATION_ENABLED", True)

    with pytest.raises(tasks.MetaWebhookTerminalFailure):
        await tasks._process_event("event-1")

    assert event.status == MetaWebhookStatus.FAILED
    assert event.next_retry_at is None
    assert event.error_code == "processing_failed"


def test_terminal_failure_does_not_call_celery_retry(monkeypatch):
    async def terminal(_event_id):
        raise tasks.MetaWebhookTerminalFailure()

    monkeypatch.setattr(tasks, "_process_event", terminal)
    task = FakeTask(retries=2)

    assert tasks.run_meta_webhook_event(task, "event-1") == "failed"
    assert task.calls == []


@pytest.mark.asyncio
async def test_due_dispatcher_queries_due_retries_and_stale_queued_events_with_a_bounded_batch(monkeypatch):
    captured = {}
    events = [FakeEvent(), FakeEvent()]
    events[1].id = "507f1f77bcf86cd799439012"

    class Query:
        def sort(self, *fields):
            captured["sort"] = fields
            return self

        def limit(self, size):
            captured["limit"] = size
            return self

        async def to_list(self):
            return events

    def find(query):
        captured["query"] = query
        return Query()

    dispatched = []
    monkeypatch.setattr(tasks.MetaWebhookEvent, "find", find)
    monkeypatch.setattr(
        tasks,
        "reserve_due_meta_webhook_event",
        lambda event_id, observed_status, observed_timestamp, now: _return_event(
            next(event for event in events if str(event.id) == event_id)
        ),
    )
    monkeypatch.setattr(tasks.process_meta_webhook_event, "delay", dispatched.append)
    monkeypatch.setattr(tasks.settings, "META_INTEGRATION_ENABLED", True)

    assert await tasks.dispatch_due_meta_webhook_events() == 2
    retry_branch, queued_branch = captured["query"]["$or"]
    assert retry_branch["status"] == "retry_pending"
    assert retry_branch["next_retry_at"]["$lte"] <= datetime.now(timezone.utc)
    assert queued_branch["status"] == "queued"
    assert queued_branch["queued_at"]["$lte"] <= datetime.now(timezone.utc)
    assert captured["sort"] == ("next_retry_at",)
    assert captured["limit"] == tasks.RETRY_DISPATCH_BATCH_SIZE
    assert dispatched == [str(event.id) for event in events]


@pytest.mark.asyncio
async def test_due_dispatcher_keeps_failed_redispatch_retry_pending_without_raw_error_leakage(monkeypatch):
    event = FakeEvent()

    class Query:
        def sort(self, *fields):
            return self

        def limit(self, size):
            return self

        async def to_list(self):
            return [event]

    async def reserve(event_id, observed_status, observed_timestamp, now):
        return event

    async def restore(event_id, now):
        event.status = MetaWebhookStatus.RETRY_PENDING
        event.error_code = "queue_redispatch_failed"
        event.error_message = "Broker redispatch failed"
        event.next_retry_at = now.replace(year=now.year + 1)
        return event

    monkeypatch.setattr(tasks.MetaWebhookEvent, "find", lambda query: Query())
    monkeypatch.setattr(tasks, "reserve_due_meta_webhook_event", reserve)
    monkeypatch.setattr(tasks, "restore_failed_meta_webhook_dispatch", restore)
    monkeypatch.setattr(
        tasks.process_meta_webhook_event,
        "delay",
        lambda _event_id: (_ for _ in ()).throw(
            ValueError("access_token=secret-value email=person@example.com")
        ),
    )
    monkeypatch.setattr(tasks.settings, "META_INTEGRATION_ENABLED", True)

    assert await tasks.dispatch_due_meta_webhook_events() == 0
    assert event.status == MetaWebhookStatus.RETRY_PENDING
    assert event.error_code == "queue_redispatch_failed"
    assert "secret-value" not in event.error_message
    assert "person@example.com" not in event.error_message
    assert event.next_retry_at > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_due_dispatcher_enqueues_only_events_with_an_atomic_reservation(monkeypatch):
    events = [FakeEvent(), FakeEvent()]
    events[1].id = "507f1f77bcf86cd799439012"

    class Query:
        def sort(self, *fields):
            return self

        def limit(self, size):
            return self

        async def to_list(self):
            return events

    async def reserve(event_id, observed_status, observed_timestamp, now):
        return events[0] if event_id == str(events[0].id) else None

    dispatched = []
    monkeypatch.setattr(tasks.MetaWebhookEvent, "find", lambda query: Query())
    monkeypatch.setattr(tasks, "reserve_due_meta_webhook_event", reserve)
    monkeypatch.setattr(tasks.process_meta_webhook_event, "delay", dispatched.append)
    monkeypatch.setattr(tasks.settings, "META_INTEGRATION_ENABLED", True)

    assert await tasks.dispatch_due_meta_webhook_events() == 1
    assert dispatched == [str(events[0].id)]


@pytest.mark.asyncio
async def test_due_dispatcher_skips_a_row_when_its_reservation_is_lost(monkeypatch):
    event = FakeEvent()

    class Query:
        def sort(self, *fields):
            return self

        def limit(self, size):
            return self

        async def to_list(self):
            return [event]

    async def lost_reservation(*args):
        return None

    dispatched = []
    monkeypatch.setattr(tasks.MetaWebhookEvent, "find", lambda query: Query())
    monkeypatch.setattr(tasks, "reserve_due_meta_webhook_event", lost_reservation)
    monkeypatch.setattr(tasks.process_meta_webhook_event, "delay", dispatched.append)
    monkeypatch.setattr(tasks.settings, "META_INTEGRATION_ENABLED", True)

    assert await tasks.dispatch_due_meta_webhook_events() == 0
    assert dispatched == []


@pytest.mark.asyncio
async def test_due_reservation_atomically_queues_the_event_for_worker_claim(monkeypatch):
    captured = {}
    event = FakeEvent()
    observed_retry_at = datetime.now(timezone.utc)

    class Query:
        async def update(self, *updates, **kwargs):
            captured["updates"] = updates
            captured["kwargs"] = kwargs
            return event

    def find_one(*filters):
        captured["filters"] = filters
        return Query()

    monkeypatch.setattr(tasks.MetaWebhookEvent, "find_one", find_one)

    assert await tasks.reserve_due_meta_webhook_event(
        "507f1f77bcf86cd799439011",
        MetaWebhookStatus.RETRY_PENDING,
        observed_retry_at,
        observed_retry_at,
    ) is event
    assert captured["filters"] == ({
        "_id": tasks.PydanticObjectId("507f1f77bcf86cd799439011"),
        "status": "retry_pending",
        "next_retry_at": observed_retry_at,
    },)
    assert captured["updates"][0]["$set"]["status"] == "queued"
    assert captured["updates"][0]["$set"]["next_retry_at"] is None
    assert captured["updates"][0]["$set"]["queued_at"] == observed_retry_at
    assert captured["kwargs"]["response_type"] == tasks.UpdateResponse.NEW_DOCUMENT


@pytest.mark.asyncio
async def test_stale_queued_reservation_matches_observed_queue_time_and_bumps_it(monkeypatch):
    captured = {}
    event = FakeEvent()
    observed_queued_at = datetime.now(timezone.utc)
    reservation_time = observed_queued_at.replace(microsecond=0)

    class Query:
        async def update(self, *updates, **kwargs):
            captured["updates"] = updates
            captured["kwargs"] = kwargs
            return event

    def find_one(*filters):
        captured["filters"] = filters
        return Query()

    monkeypatch.setattr(tasks.MetaWebhookEvent, "find_one", find_one)

    assert await tasks.reserve_due_meta_webhook_event(
        "507f1f77bcf86cd799439011",
        MetaWebhookStatus.QUEUED,
        observed_queued_at,
        reservation_time,
    ) is event
    assert captured["filters"] == ({
        "_id": tasks.PydanticObjectId("507f1f77bcf86cd799439011"),
        "status": "queued",
        "queued_at": observed_queued_at,
    },)
    update = captured["updates"][0]["$set"]
    assert update == {"queued_at": reservation_time, "updated_at": reservation_time}


@pytest.mark.asyncio
async def test_dispatcher_query_skips_fresh_queued_rows_until_the_lease_expires(monkeypatch):
    captured = {}

    class Query:
        def sort(self, *fields):
            return self

        def limit(self, size):
            return self

        async def to_list(self):
            return []

    def find(query):
        captured["query"] = query
        return Query()

    monkeypatch.setattr(tasks.MetaWebhookEvent, "find", find)
    monkeypatch.setattr(tasks.settings, "META_INTEGRATION_ENABLED", True)

    assert await tasks.dispatch_due_meta_webhook_events() == 0
    stale_threshold = captured["query"]["$or"][1]["queued_at"]["$lte"]
    assert stale_threshold < datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_broker_failure_restores_only_reserved_queued_event_to_retry_pending(monkeypatch):
    captured = {}

    class Query:
        async def update(self, *updates, **kwargs):
            captured["updates"] = updates
            captured["kwargs"] = kwargs
            return FakeEvent()

    def find_one(*filters):
        captured["filters"] = filters
        return Query()

    monkeypatch.setattr(tasks.MetaWebhookEvent, "find_one", find_one)
    now = datetime.now(timezone.utc)

    assert await tasks.restore_failed_meta_webhook_dispatch(
        "507f1f77bcf86cd799439011", now
    ) is not None
    assert captured["filters"] == ({
        "_id": tasks.PydanticObjectId("507f1f77bcf86cd799439011"),
        "status": "queued",
    },)
    update = captured["updates"][0]["$set"]
    assert update["status"] == "retry_pending"
    assert update["error_code"] == "queue_redispatch_failed"
    assert update["error_message"] == "Broker redispatch failed"
    assert update["next_retry_at"] > now
