"""Bounded, concurrency-safe worker lifecycle for Meta webhook inbox events."""

import asyncio
from datetime import datetime, timedelta, timezone
import random
from typing import Optional
from uuid import uuid4

from beanie import PydanticObjectId
from beanie.odm.queries.update import UpdateResponse
from pymongo.errors import DuplicateKeyError

from app.core.config import settings
from app.integrations.meta.client import MetaGraphRateLimitError, MetaGraphTransientError
from app.integrations.meta.insights_service import MetaInsightsConfigurationError, MetaInsightsService
from app.integrations.meta.models import (
    MetaIntegrationSettings,
    MetaSyncRun,
    MetaSyncStatus,
    MetaWebhookEvent,
    MetaWebhookStatus,
)
from app.integrations.meta.channel_adapters import (
    ChannelType,
    NormalizedChannelEvent,
    NormalizedEventType,
)
from app.integrations.meta.lead_service import MetaLeadQuarantined, MetaLeadService
from app.integrations.meta.messaging_service import MetaMessagingService
from app.integrations.meta.instagram_adapter import InstagramAdapter
from app.integrations.meta.messenger_adapter import MessengerAdapter
from app.integrations.meta.whatsapp_adapter import WhatsAppAdapter
from app.integrations.meta.redaction import sanitize_error_message
from app.worker.celery_app import celery_app


# This is the total number of times an event can be claimed for processing,
# including its first delivery. Celery therefore receives at most two retries.
MAX_PROCESSING_RETRIES = 3
RETRY_DISPATCH_BATCH_SIZE = 100
RETRY_DISPATCH_BACKOFF_SECONDS = 60
STALE_QUEUED_RECOVERY_SECONDS = 300


class MetaWebhookTerminalFailure(Exception):
    """The event has reached a durable terminal failure state."""


class MetaWebhookRetryableFailure(Exception):
    """Generic retry cause; intentionally contains no provider data."""


class MetaInsightsActiveRunError(ValueError):
    """A tenant already has a durable insights sync in progress."""


class MetaInsightsRetryableFailure(Exception):
    """Generic retry cause that cannot carry Graph API details into Celery."""


MAX_INSIGHTS_SYNC_RETRIES = 3
INSIGHTS_DISPATCH_BACKOFF_SECONDS = 60
INSIGHTS_DISPATCH_LEASE_SECONDS = 300
INSIGHTS_DISPATCH_BATCH_SIZE = 100


async def create_and_enqueue_insights_sync_run(
    *, company_id: str, requested_by: str
) -> MetaSyncRun:
    """Persist a tenant run before queueing its opaque identifier."""
    if not settings.META_INTEGRATION_ENABLED:
        raise MetaInsightsConfigurationError("Meta integration is disabled")
    config = await MetaIntegrationSettings.find_one(
        {
            "company_id": company_id,
            "enabled": True,
            "insights_sync_enabled": True,
        }
    )
    if config is None or not config.ad_account_id:
        raise MetaInsightsConfigurationError("Meta insights sync is not configured")

    now = datetime.now(timezone.utc)
    run = MetaSyncRun(
        company_id=company_id,
        sync_type="insights",
        correlation_id=str(uuid4()),
        requested_by=requested_by,
        active_key=f"{company_id}:insights",
        dispatch_queued_at=now,
        next_dispatch_at=now + timedelta(seconds=INSIGHTS_DISPATCH_LEASE_SECONDS),
    )
    try:
        await run.insert()
    except DuplicateKeyError:
        raise MetaInsightsActiveRunError("An insights sync is already in progress") from None
    try:
        process_meta_insights_sync_run.delay(str(run.id))
    except Exception:
        await restore_initial_meta_insights_dispatch(
            str(run.id), company_id, run.active_key, run.dispatch_queued_at, now
        )
    return run


async def restore_initial_meta_insights_dispatch(
    run_id: str,
    company_id: str,
    active_key: Optional[str],
    observed_dispatch_queued_at: Optional[datetime],
    now: datetime,
) -> Optional[MetaSyncRun]:
    """Restore only the exact dispatch lease created before the initial delay call."""
    if not active_key or observed_dispatch_queued_at is None:
        return None
    return await MetaSyncRun.find_one(
        {
            "_id": PydanticObjectId(run_id),
            "company_id": company_id,
            "sync_type": "insights",
            "status": MetaSyncStatus.PENDING.value,
            "active_key": active_key,
            "dispatch_queued_at": observed_dispatch_queued_at,
        }
    ).update(
        {
            "$set": {
                "dispatch_queued_at": None,
                "next_dispatch_at": now + timedelta(seconds=INSIGHTS_DISPATCH_BACKOFF_SECONDS),
                "updated_at": now,
                "error_code": "queue_dispatch_failed",
                "error_message": "Broker dispatch failed",
            }
        },
        response_type=UpdateResponse.NEW_DOCUMENT,
    )


@celery_app.task(name="meta.schedule_insights_sync_runs")
def schedule_meta_insights_sync_runs_task():
    """Periodically create one opaque work item per enabled tenant configuration."""
    return asyncio.run(schedule_meta_insights_sync_runs())


async def schedule_meta_insights_sync_runs() -> int:
    if not settings.META_INTEGRATION_ENABLED:
        return 0
    configs = await MetaIntegrationSettings.find(
        {"enabled": True, "insights_sync_enabled": True}
    ).to_list()
    scheduled = 0
    for config in configs:
        try:
            await create_and_enqueue_insights_sync_run(
                company_id=config.company_id, requested_by="scheduler"
            )
            scheduled += 1
        except MetaInsightsActiveRunError:
            continue
        except MetaInsightsConfigurationError:
            continue
    return scheduled


@celery_app.task(name="meta.dispatch_due_insights_sync_runs")
def dispatch_due_meta_insights_sync_runs_task():
    return asyncio.run(dispatch_due_meta_insights_sync_runs())


async def dispatch_due_meta_insights_sync_runs() -> int:
    """Recover durable pending dispatches without sending credentials to Celery."""
    if not settings.META_INTEGRATION_ENABLED:
        return 0
    now = datetime.now(timezone.utc)
    runs = await (
        MetaSyncRun.find(
            {
                "sync_type": "insights",
                "status": MetaSyncStatus.PENDING.value,
                "next_dispatch_at": {"$lte": now},
            }
        )
        .limit(INSIGHTS_DISPATCH_BATCH_SIZE)
        .to_list()
    )
    dispatched = 0
    for run in runs:
        reserved = await reserve_due_meta_insights_dispatch(
            str(run.id), run.company_id, run.next_dispatch_at, now
        )
        if reserved is None:
            continue
        try:
            process_meta_insights_sync_run.delay(str(reserved.id))
            dispatched += 1
        except Exception:
            await restore_failed_meta_insights_dispatch(
                str(reserved.id), reserved.company_id, reserved.dispatch_queued_at, now
            )
    return dispatched


async def reserve_due_meta_insights_dispatch(
    run_id: str, company_id: str, observed_next_dispatch_at: Optional[datetime], now: datetime
) -> Optional[MetaSyncRun]:
    if observed_next_dispatch_at is None:
        return None
    return await MetaSyncRun.find_one(
        {
            "_id": PydanticObjectId(run_id),
            "company_id": company_id,
            "sync_type": "insights",
            "status": MetaSyncStatus.PENDING.value,
            "next_dispatch_at": observed_next_dispatch_at,
        }
    ).update(
        {"$set": {"dispatch_queued_at": now, "next_dispatch_at": now + timedelta(seconds=INSIGHTS_DISPATCH_LEASE_SECONDS), "updated_at": now}},
        response_type=UpdateResponse.NEW_DOCUMENT,
    )


async def restore_failed_meta_insights_dispatch(
    run_id: str, company_id: str, observed_dispatch_queued_at: Optional[datetime], now: datetime
) -> Optional[MetaSyncRun]:
    if observed_dispatch_queued_at is None:
        return None
    return await MetaSyncRun.find_one(
        {"_id": PydanticObjectId(run_id), "company_id": company_id, "sync_type": "insights", "status": MetaSyncStatus.PENDING.value, "dispatch_queued_at": observed_dispatch_queued_at}
    ).update(
        {"$set": {"dispatch_queued_at": None, "next_dispatch_at": now + timedelta(seconds=INSIGHTS_DISPATCH_BACKOFF_SECONDS), "updated_at": now, "error_code": "queue_dispatch_failed", "error_message": "Broker dispatch failed"}},
        response_type=UpdateResponse.NEW_DOCUMENT,
    )


@celery_app.task(
    bind=True,
    max_retries=MAX_INSIGHTS_SYNC_RETRIES - 1,
    name="meta.process_insights_sync_run",
)
def process_meta_insights_sync_run(task, run_id: str):
    """Run a persisted sync without placing tenant credentials in task arguments."""
    try:
        return asyncio.run(
            _process_insights_sync_run(
                run_id, terminal_attempt=task.request.retries >= MAX_INSIGHTS_SYNC_RETRIES - 1
            )
        )
    except (MetaGraphRateLimitError, MetaGraphTransientError):
        attempt = task.request.retries + 1
        raise task.retry(
            exc=MetaInsightsRetryableFailure("Meta insights sync retry scheduled"),
            countdown=min(300, 2**attempt * 30) + random.randint(0, 5),
            max_retries=MAX_INSIGHTS_SYNC_RETRIES - 1,
        ) from None


async def claim_meta_insights_sync_run(run_id: str, company_id: str) -> Optional[MetaSyncRun]:
    now = datetime.now(timezone.utc)
    return await MetaSyncRun.find_one(
        {
            "_id": PydanticObjectId(run_id),
            "company_id": company_id,
            "sync_type": "insights",
            "status": MetaSyncStatus.PENDING.value,
            "$or": [
                {"dispatch_queued_at": {"$ne": None}},
                {"dispatch_queued_at": None, "next_dispatch_at": {"$lte": now}},
            ],
        }
    ).update(
        {"$set": {"status": MetaSyncStatus.RUNNING.value, "started_at": now, "next_dispatch_at": None, "updated_at": now}, "$inc": {"attempt_count": 1}},
        response_type=UpdateResponse.NEW_DOCUMENT,
    )


async def _process_insights_sync_run(run_id: str, terminal_attempt: bool = False) -> str:
    """Transition one durable run and keep provider failures sanitized."""
    run = await MetaSyncRun.find_one(
        {"_id": PydanticObjectId(run_id), "sync_type": "insights"}
    )
    if run is None:
        return "not_found"
    if run.status == MetaSyncStatus.COMPLETED:
        return "completed"
    if not settings.META_INTEGRATION_ENABLED:
        return "paused"

    run = await claim_meta_insights_sync_run(run_id, run.company_id)
    if run is None:
        return "not_claimed"
    try:
        await MetaInsightsService().sync(run)
    except (MetaGraphRateLimitError, MetaGraphTransientError) as exc:
        now = datetime.now(timezone.utc)
        if terminal_attempt:
            run.status = MetaSyncStatus.FAILED
            run.active_key = None
            run.completed_at = now
            run.error_code = "rate_limited" if isinstance(exc, MetaGraphRateLimitError) else "transient_provider"
            run.error_message = "Meta insights sync retry limit reached"
        else:
            run.status = MetaSyncStatus.PENDING
            run.error_code = "rate_limited" if isinstance(exc, MetaGraphRateLimitError) else "transient_provider"
            run.error_message = "Meta insights sync will retry"
            run.dispatch_queued_at = None
            run.next_dispatch_at = now + timedelta(seconds=INSIGHTS_DISPATCH_BACKOFF_SECONDS)
        run.updated_at = now
        await run.save()
        if terminal_attempt:
            return "failed"
        raise
    except MetaInsightsConfigurationError:
        run.status = MetaSyncStatus.FAILED
        run.active_key = None
        run.error_code = "configuration"
        run.error_message = "Meta insights sync is not configured"
        run.completed_at = datetime.now(timezone.utc)
        run.updated_at = run.completed_at
        await run.save()
        return "failed"
    except Exception:
        run.status = MetaSyncStatus.FAILED
        run.active_key = None
        run.error_code = "provider_error"
        run.error_message = "Meta insights sync failed"
        run.completed_at = datetime.now(timezone.utc)
        run.updated_at = run.completed_at
        await run.save()
        return "failed"

    run.status = MetaSyncStatus.COMPLETED
    run.active_key = None
    run.cursor = None
    run.completed_at = datetime.now(timezone.utc)
    run.error_code = None
    run.error_message = None
    run.updated_at = run.completed_at
    await run.save()
    return "completed"


@celery_app.task(name="meta.dispatch_due_webhook_events")
def dispatch_due_meta_webhook_events_task():
    """Periodically redeliver durable events whose broker dispatch previously failed."""
    return asyncio.run(dispatch_due_meta_webhook_events())


async def dispatch_due_meta_webhook_events() -> int:
    """Dispatch a bounded batch of due events without changing tenant ownership."""
    if not settings.META_INTEGRATION_ENABLED:
        return 0

    now = datetime.now(timezone.utc)
    stale_queued_before = now - timedelta(seconds=STALE_QUEUED_RECOVERY_SECONDS)
    events = await (
        MetaWebhookEvent.find(
            {
                "$or": [
                    {
                        "status": MetaWebhookStatus.RETRY_PENDING.value,
                        "next_retry_at": {"$lte": now},
                    },
                    {
                        "status": MetaWebhookStatus.QUEUED.value,
                        "queued_at": {"$lte": stale_queued_before},
                    },
                ]
            }
        )
        .sort("next_retry_at")
        .limit(RETRY_DISPATCH_BATCH_SIZE)
        .to_list()
    )

    dispatched = 0
    for event in events:
        event_status = _status_value(event.status)
        observed_timestamp = (
            event.next_retry_at
            if event_status == MetaWebhookStatus.RETRY_PENDING.value
            else event.queued_at
        )
        reserved = await reserve_due_meta_webhook_event(
            str(event.id), event_status, observed_timestamp, now
        )
        if reserved is None:
            continue
        try:
            process_meta_webhook_event.delay(str(reserved.id))
            dispatched += 1
        except Exception:
            # Broker exceptions may include provider data in their repr. Persist
            # only a fixed, operational message and leave the event retryable.
            await restore_failed_meta_webhook_dispatch(str(reserved.id), now)
    return dispatched


async def reserve_due_meta_webhook_event(
    event_id: str,
    observed_status: MetaWebhookStatus | str,
    observed_timestamp: Optional[datetime],
    now: datetime,
) -> Optional[MetaWebhookEvent]:
    """Reserve a due retry or stale queued row using its observed timestamp."""
    status = _status_value(observed_status)
    if observed_timestamp is None:
        return None
    if status == MetaWebhookStatus.RETRY_PENDING.value:
        filters = {
            "_id": PydanticObjectId(event_id),
            "status": MetaWebhookStatus.RETRY_PENDING.value,
            "next_retry_at": observed_timestamp,
        }
        update = {
            "status": MetaWebhookStatus.QUEUED.value,
            "next_retry_at": None,
            "queued_at": now,
            "updated_at": now,
        }
    elif status == MetaWebhookStatus.QUEUED.value:
        filters = {
            "_id": PydanticObjectId(event_id),
            "status": MetaWebhookStatus.QUEUED.value,
            "queued_at": observed_timestamp,
        }
        update = {"queued_at": now, "updated_at": now}
    else:
        return None
    return await MetaWebhookEvent.find_one(
        filters
    ).update(
        {"$set": update},
        response_type=UpdateResponse.NEW_DOCUMENT,
    )


async def restore_failed_meta_webhook_dispatch(
    event_id: str, now: datetime
) -> Optional[MetaWebhookEvent]:
    """Atomically return a broker-reserved event to retry-pending state."""
    return await MetaWebhookEvent.find_one(
        {
            "_id": PydanticObjectId(event_id),
            "status": MetaWebhookStatus.QUEUED.value,
        }
    ).update(
        {
            "$set": {
                "status": MetaWebhookStatus.RETRY_PENDING.value,
                "next_retry_at": now + timedelta(
                    seconds=RETRY_DISPATCH_BACKOFF_SECONDS
                ),
                "error_code": "queue_redispatch_failed",
                "error_message": "Broker redispatch failed",
                "updated_at": now,
            }
        },
        response_type=UpdateResponse.NEW_DOCUMENT,
    )


@celery_app.task(
    bind=True,
    max_retries=MAX_PROCESSING_RETRIES - 1,
    name="meta.process_webhook_event",
)
def process_meta_webhook_event(task, event_id: str):
    """Celery entry point; its retry payload must not contain webhook data."""
    return run_meta_webhook_event(task, event_id)


def run_meta_webhook_event(task, event_id: str):
    """Testable synchronous wrapper around the async event lifecycle."""
    try:
        return asyncio.run(_process_event(event_id))
    except MetaWebhookTerminalFailure:
        return "failed"
    except Exception:
        attempt = task.request.retries + 1
        countdown = min(60, 2**attempt) + random.randint(0, 5)
        # Do not hand provider exceptions to Celery: task backends and workers
        # may serialize and log the exception representation.
        raise task.retry(
            exc=MetaWebhookRetryableFailure("Meta webhook processing failed"),
            countdown=countdown,
            max_retries=MAX_PROCESSING_RETRIES - 1,
        ) from None


async def claim_meta_webhook_event(event_id: str) -> Optional[MetaWebhookEvent]:
    """Atomically claim exactly one pending event for one worker."""
    now = datetime.now(timezone.utc)
    return await MetaWebhookEvent.find_one(
        {
            "_id": PydanticObjectId(event_id),
            "$or": [
                {"status": MetaWebhookStatus.QUEUED.value},
                {
                    "status": MetaWebhookStatus.RETRY_PENDING.value,
                    "next_retry_at": {"$lte": now},
                },
            ],
            "attempt_count": {"$lt": MAX_PROCESSING_RETRIES},
        }
    ).update(
        {
            "$set": {
                "status": MetaWebhookStatus.PROCESSING.value,
                "processing_started_at": now,
                "updated_at": now,
                "next_retry_at": None,
            },
            "$inc": {"attempt_count": 1},
        },
        response_type=UpdateResponse.NEW_DOCUMENT,
    )


async def _process_event(event_id: str) -> str:
    if not settings.META_INTEGRATION_ENABLED:
        return "paused"

    event = await claim_meta_webhook_event(event_id)
    if event is None:
        return "not_claimed"

    try:
        await _execute_event(event)
    except Exception as exc:
        now = datetime.now(timezone.utc)
        if isinstance(exc, MetaLeadQuarantined):
            event.status = MetaWebhookStatus.FAILED
            event.next_retry_at = None
            event.error_code = exc.code
            event.error_message = "Meta lead requires manual review"
            event.updated_at = now
            await event.save()
            raise MetaWebhookTerminalFailure() from None
        event.error_code = "processing_failed"
        event.error_message = sanitize_error_message(exc)
        event.updated_at = now
        if event.attempt_count >= MAX_PROCESSING_RETRIES:
            event.status = MetaWebhookStatus.FAILED
            event.next_retry_at = None
            await event.save()
            raise MetaWebhookTerminalFailure() from None

        event.status = MetaWebhookStatus.RETRY_PENDING
        event.next_retry_at = now + timedelta(
            seconds=min(60, 2**event.attempt_count) + random.randint(0, 5)
        )
        await event.save()
        raise

    event.status = MetaWebhookStatus.PROCESSED
    event.processed_at = datetime.now(timezone.utc)
    event.error_code = None
    event.error_message = None
    event.updated_at = datetime.now(timezone.utc)
    await event.save()
    return "processed"


async def _execute_event(event: MetaWebhookEvent) -> None:
    """Route supported Meta webhook events without mixing Meta logic into CRM."""
    if event.event_type != "leadgen":
        normalized_events = await _normalize_messaging_events(event)
        for normalized in normalized_events:
            if normalized.event_type == NormalizedEventType.UNKNOWN:
                event.status = MetaWebhookStatus.REJECTED
                event.error_code = "unsupported_messaging_event"
                event.error_message = "Unsupported Meta messaging event"
                continue
            await MetaMessagingService().process_normalized_event(
                normalized, correlation_id=event.correlation_id
            )
        return None
    await MetaLeadService().process_event(event)


def _status_value(status: MetaWebhookStatus | str) -> str:
    return status.value if isinstance(status, MetaWebhookStatus) else str(status)


async def _normalize_messaging_events(event: MetaWebhookEvent) -> list[NormalizedChannelEvent]:
    payload = event.payload or {}
    connection = payload.get("connection") if isinstance(payload.get("connection"), dict) else {}
    channel_value = connection.get("channel")
    connection_id = connection.get("id")
    if not channel_value or not connection_id:
        return []
    try:
        channel = ChannelType(channel_value)
    except ValueError:
        return []
    if channel == ChannelType.WHATSAPP and isinstance(payload.get("change"), dict):
        return await _normalize_whatsapp_event(payload, event.company_id, str(connection_id))
    if channel == ChannelType.INSTAGRAM:
        return await InstagramAdapter().normalize_webhook(
            payload, company_id=event.company_id, connection_id=str(connection_id)
        )
    if channel == ChannelType.MESSENGER:
        return await MessengerAdapter().normalize_webhook(
            payload, company_id=event.company_id, connection_id=str(connection_id)
        )

    messaging = payload.get("messaging") if isinstance(payload.get("messaging"), dict) else {}
    sender = messaging.get("sender") if isinstance(messaging.get("sender"), dict) else {}
    recipient = messaging.get("recipient") if isinstance(messaging.get("recipient"), dict) else {}
    message = messaging.get("message") if isinstance(messaging.get("message"), dict) else {}
    event_type = _normalized_event_type(str(event.event_type or "unknown"))
    provider_message_id = (
        message.get("mid")
        or messaging.get("mid")
        or event.object_id
        or event.provider_event_id
    )
    return [NormalizedChannelEvent(
        company_id=event.company_id,
        channel=channel,
        connection_id=str(connection_id),
        provider_event_id=event.provider_event_id,
        provider_message_id=str(provider_message_id) if provider_message_id else None,
        event_type=event_type,
        sender_id=str(sender.get("id")) if sender.get("id") else None,
        recipient_id=str(recipient.get("id")) if recipient.get("id") else None,
        text=str(message.get("text")) if message.get("text") else None,
        raw_payload=payload,
    )]


def _normalized_event_type(event_type: str) -> NormalizedEventType:
    mapping = {
        "message": NormalizedEventType.INBOUND_MESSAGE,
        "postback": NormalizedEventType.POSTBACK,
        "delivery": NormalizedEventType.DELIVERY,
        "read": NormalizedEventType.READ,
        "reaction": NormalizedEventType.REACTION,
        "referral": NormalizedEventType.REFERRAL,
    }
    return mapping.get(event_type, NormalizedEventType.UNKNOWN)


async def _normalize_whatsapp_event(
    payload: dict, company_id: str, connection_id: str
) -> list[NormalizedChannelEvent]:
    return await WhatsAppAdapter().normalize_webhook(
        payload, company_id=company_id, connection_id=connection_id
    )
