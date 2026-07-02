from __future__ import annotations

import logging

from app.events.contracts import DomainEvent
from app.events.registry import event_registry

logger = logging.getLogger(__name__)


class EventDispatcher:
    async def dispatch(self, event: DomainEvent) -> None:
        handlers = event_registry.get_handlers(event.event_name)
        for handler in handlers:
            try:
                await handler(event)
            except Exception:
                logger.exception(
                    "event_handler_failed",
                    extra={
                        "event_id": event.event_id,
                        "event_name": event.event_name,
                        "event_version": event.event_version,
                        "company_id": event.company_id,
                    },
                )
                raise


event_dispatcher = EventDispatcher()

