from __future__ import annotations

from app.events.contracts import DomainEvent
from app.events.dispatcher import event_dispatcher


class EventBus:
    async def publish(self, event: DomainEvent) -> None:
        await event_dispatcher.dispatch(event)


event_bus = EventBus()


def get_event_bus() -> EventBus:
    return event_bus


async def publish_event(event: DomainEvent) -> None:
    await event_bus.publish(event)

