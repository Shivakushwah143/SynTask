from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import logging

from app.events.contracts import DomainEvent
from app.events.registry import event_registry

logger = logging.getLogger(__name__)


class EventDispatcher:
    def __init__(self) -> None:
        self._stats = defaultdict(lambda: {"attempts": 0, "successes": 0, "failures": 0, "last_duration_ms": 0.0})

    @property
    def stats(self):
        return {key: dict(value) for key, value in self._stats.items()}

    async def dispatch(self, event: DomainEvent) -> None:
        handlers = event_registry.get_handlers(event.event_name)
        for handler in handlers:
            started = datetime.now()
            handler_name = getattr(handler, "__name__", handler.__class__.__name__)
            stats = self._stats[handler_name]
            stats["attempts"] += 1
            try:
                await handler(event)
                stats["successes"] += 1
            except Exception as exc:
                stats["failures"] += 1
                logger.exception(
                    "event_handler_failed",
                    extra={
                        "event_id": event.event_id,
                        "event_name": event.event_name,
                        "event_version": event.event_version,
                        "company_id": event.company_id,
                        "handler_name": handler_name,
                        "aggregate_type": event.aggregate_type,
                        "aggregate_id": event.aggregate_id,
                        "timestamp": event.timestamp.isoformat(),
                        "correlation_id": event.correlation_id,
                        "causation_id": event.causation_id,
                        "error": str(exc),
                    },
                )
            finally:
                elapsed_ms = (datetime.now() - started).total_seconds() * 1000
                stats["last_duration_ms"] = round(elapsed_ms, 3)


event_dispatcher = EventDispatcher()


