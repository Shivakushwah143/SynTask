"""Bounded, concurrency-safe worker lifecycle for Meta webhook inbox events."""

import asyncio
from datetime import datetime, timedelta, timezone
import random
from typing import Optional

from beanie import PydanticObjectId
from beanie.odm.queries.update import UpdateResponse

from app.core.config import settings
from app.integrations.meta.models import MetaWebhookEvent, MetaWebhookStatus
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
    """Phase 2 ends after inbox processing; Phase 3 adds lead handling here."""
    return None


def _status_value(status: MetaWebhookStatus | str) -> str:
    return status.value if isinstance(status, MetaWebhookStatus) else str(status)
