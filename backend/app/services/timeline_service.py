"""
Reusable employee timeline service.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional

from app.models.timeline import TimelineEvent, TimelineEventType, TimelineModule

logger = logging.getLogger(__name__)


async def create_timeline_event(
    *,
    user_id: str,
    company_id: Optional[str],
    event_type: TimelineEventType | str,
    title: str,
    related_module: TimelineModule | str,
    related_record_id: Optional[str] = None,
    description: Optional[str] = None,
    timestamp: Optional[datetime] = None,
    metadata: Optional[Dict[str, Any]] = None,
    actor_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> Optional[TimelineEvent]:
    """
    Create a timeline event if it does not already exist.

    This service is intentionally small and module-agnostic so future features
    can publish timeline entries without knowing storage details.
    """
    if not user_id:
        logger.debug("Timeline event skipped without user_id: %s", title)
        return None

    try:
        normalized_type = event_type if isinstance(event_type, TimelineEventType) else TimelineEventType(event_type)
        normalized_module = related_module if isinstance(related_module, TimelineModule) else TimelineModule(related_module)
        key = idempotency_key or _build_idempotency_key(
            user_id=user_id,
            event_type=normalized_type,
            related_module=normalized_module,
            related_record_id=related_record_id,
            timestamp=timestamp,
        )

        existing = await TimelineEvent.find_one(TimelineEvent.idempotency_key == key)
        if existing:
            return existing

        event = TimelineEvent(
            user_id=str(user_id),
            company_id=str(company_id) if company_id else None,
            event_type=normalized_type,
            title=title,
            description=description,
            related_module=normalized_module,
            related_record_id=str(related_record_id) if related_record_id else None,
            timestamp=timestamp or datetime.now(),
            metadata=metadata or {},
            actor_id=str(actor_id) if actor_id else None,
            idempotency_key=key,
        )
        await event.insert()
        return event
    except Exception as exc:
        logger.error("Failed to create timeline event %s for user %s: %s", event_type, user_id, exc)
        return None


def serialize_timeline_event(event: TimelineEvent) -> Dict[str, Any]:
    return {
        "id": str(event.id),
        "user_id": event.user_id,
        "company_id": event.company_id,
        "event_type": event.event_type.value,
        "title": event.title,
        "description": event.description,
        "related_module": event.related_module.value,
        "related_record_id": event.related_record_id,
        "timestamp": event.timestamp,
        "metadata": event.metadata or {},
        "actor_id": event.actor_id,
        "created_at": event.created_at,
    }


def _build_idempotency_key(
    *,
    user_id: str,
    event_type: TimelineEventType,
    related_module: TimelineModule,
    related_record_id: Optional[str],
    timestamp: Optional[datetime],
) -> str:
    if timestamp:
        time_key = timestamp.replace(microsecond=0).isoformat()
    else:
        time_key = "instant"
    return f"{user_id}:{event_type.value}:{related_module.value}:{related_record_id or 'none'}:{time_key}"

