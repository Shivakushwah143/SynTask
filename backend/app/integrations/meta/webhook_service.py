"""Tenant-safe durable inbox handling for verified Meta webhook payloads."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
from typing import Any, Callable, Dict, Iterable, Optional

from beanie import PydanticObjectId
from beanie.odm.queries.update import UpdateResponse
from pymongo.errors import DuplicateKeyError

from app.integrations.meta.models import (
    MetaIntegrationSettings,
    MetaWebhookEvent,
    MetaWebhookStatus,
)


INITIAL_QUEUE_DISPATCH_BACKOFF_SECONDS = 60


@dataclass(frozen=True)
class WebhookIngestResult:
    inserted: int = 0
    duplicates: int = 0
    rejected: int = 0


@dataclass(frozen=True)
class ExtractedMetaEvent:
    page_id: Optional[str]
    form_id: Optional[str]
    event_type: str
    object_type: Optional[str]
    object_id: Optional[str]
    provider_event_id: str
    payload: Dict[str, Any]


class MetaWebhookService:
    """Persist verified events before asking Celery to process them."""

    # A fixed non-tenant marker retains rejected audit records without attributing
    # untrusted provider fields to an actual customer tenant.
    UNRESOLVED_COMPANY_ID = "__meta_unresolved__"

    def __init__(
        self,
        enqueue: Optional[Callable[[str], Any]] = None,
        event_factory: Callable[..., MetaWebhookEvent] = MetaWebhookEvent,
    ):
        self._enqueue = enqueue or self._enqueue_with_celery
        self._event_factory = event_factory

    async def ingest(
        self,
        payload: Dict[str, Any],
        *,
        raw_body: bytes,
        correlation_id: str,
    ) -> WebhookIngestResult:
        payload_sha256 = hashlib.sha256(raw_body).hexdigest()
        result = WebhookIngestResult()
        for extracted in self.extract_events(payload, payload_sha256):
            settings = await self._resolve_settings(extracted.page_id, extracted.form_id)
            company_id = (
                str(settings.company_id)
                if settings is not None
                else self.UNRESOLVED_COMPANY_ID
            )
            event = self._event_factory(
                company_id=company_id,
                provider="meta",
                provider_event_id=extracted.provider_event_id,
                event_type=extracted.event_type,
                object_type=extracted.object_type,
                object_id=extracted.object_id,
                payload=extracted.payload,
                payload_sha256=payload_sha256,
                status=(
                    MetaWebhookStatus.QUEUED
                    if settings is not None
                    else MetaWebhookStatus.REJECTED
                ),
                correlation_id=correlation_id,
                error_code=None if settings is not None else "tenant_mapping_unknown",
                error_message=None if settings is not None else "No enabled tenant mapping",
                queued_at=datetime.now(timezone.utc) if settings is not None else None,
            )
            try:
                await event.insert()
            except DuplicateKeyError:
                result = WebhookIngestResult(
                    inserted=result.inserted,
                    duplicates=result.duplicates + 1,
                    rejected=result.rejected,
                )
                continue

            if settings is None:
                result = WebhookIngestResult(
                    inserted=result.inserted,
                    duplicates=result.duplicates,
                    rejected=result.rejected + 1,
                )
                continue

            # The event exists durably before any broker operation is attempted.
            try:
                self._enqueue(str(event.id))
            except Exception:
                # A broker may have accepted the task before reporting failure.
                # Conditional state replacement avoids overwriting a worker's
                # later claim and never persists broker exception text.
                await mark_initial_webhook_dispatch_failure(
                    str(event.id), datetime.now(timezone.utc)
                )

            result = WebhookIngestResult(
                inserted=result.inserted + 1,
                duplicates=result.duplicates,
                rejected=result.rejected,
            )
        return result

    @staticmethod
    async def _resolve_settings(
        page_id: Optional[str], form_id: Optional[str]
    ) -> Optional[MetaIntegrationSettings]:
        if not page_id or not form_id:
            return None
        return await MetaIntegrationSettings.find_one(
            {"page_id": page_id, "lead_form_id": form_id, "enabled": True}
        )

    @staticmethod
    def extract_events(
        payload: Dict[str, Any], payload_sha256: str
    ) -> Iterable[ExtractedMetaEvent]:
        object_type = str(payload.get("object") or "page")
        entries = payload.get("entry")
        if not isinstance(entries, list):
            return []

        extracted = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            page_id = _as_string(entry.get("id"))
            event_time = entry.get("time")
            changes = entry.get("changes")
            if not isinstance(changes, list):
                continue
            for change in changes:
                if not isinstance(change, dict):
                    continue
                value = change.get("value")
                value = value if isinstance(value, dict) else {}
                event_type = _as_string(change.get("field")) or "unknown"
                form_id = _as_string(value.get("form_id"))
                object_id = _as_string(value.get("leadgen_id") or value.get("id"))
                provider_event_id = _as_string(value.get("leadgen_id") or value.get("event_id"))
                event_payload = {
                    "object": object_type,
                    "entry": {"id": page_id, "time": event_time},
                    "change": {"field": event_type, "value": value},
                }
                if provider_event_id is None:
                    provider_event_id = _derive_event_id(
                        object_type=object_type,
                        page_id=page_id,
                        form_id=form_id,
                        object_id=object_id,
                        event_time=event_time,
                        payload_sha256=payload_sha256,
                    )
                extracted.append(
                    ExtractedMetaEvent(
                        page_id=page_id,
                        form_id=form_id,
                        event_type=event_type,
                        object_type=object_type,
                        object_id=object_id,
                        provider_event_id=provider_event_id,
                        payload=event_payload,
                    )
                )
        return extracted

    @staticmethod
    def _enqueue_with_celery(event_id: str) -> None:
        from app.integrations.meta.tasks import process_meta_webhook_event

        process_meta_webhook_event.delay(event_id)


async def mark_initial_webhook_dispatch_failure(
    event_id: str, now: datetime
) -> Optional[MetaWebhookEvent]:
    """Conditionally make an initial broker failure visible to the dispatcher."""
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
                    seconds=INITIAL_QUEUE_DISPATCH_BACKOFF_SECONDS
                ),
                "error_code": "queue_dispatch_failed",
                "error_message": "Queue dispatch failed",
                "updated_at": now,
            }
        },
        response_type=UpdateResponse.NEW_DOCUMENT,
    )

def _as_string(value: Any) -> Optional[str]:
    return str(value) if value is not None and str(value) else None


def _derive_event_id(
    *,
    object_type: str,
    page_id: Optional[str],
    form_id: Optional[str],
    object_id: Optional[str],
    event_time: Any,
    payload_sha256: str,
) -> str:
    stable_fields = json.dumps(
        [object_type, page_id, form_id, object_id, event_time, payload_sha256],
        separators=(",", ":"),
        sort_keys=False,
    )
    return hashlib.sha256(stable_fields.encode("utf-8")).hexdigest()
