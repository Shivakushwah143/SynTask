"""Compatibility adapter for Timeline-owned publishing.

New callers should import from ``app.timeline.publisher``.
"""

from typing import Any

from app.events import publish_event
from app.events.contracts import DomainEvent
from app.timeline.publisher import build_crm_timeline_event


async def publish_crm_timeline_event(**kwargs: Any) -> DomainEvent:
    """Compatibility wrapper retaining legacy monkeypatch/import behavior."""
    event = build_crm_timeline_event(**kwargs)
    await publish_event(event)
    return event

__all__ = ["build_crm_timeline_event", "publish_crm_timeline_event"]
