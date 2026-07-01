from __future__ import annotations

from collections import defaultdict
from typing import Awaitable, Callable, DefaultDict, List

from app.events.contracts import DomainEvent

EventHandler = Callable[[DomainEvent], Awaitable[None]]


class EventRegistry:
    def __init__(self) -> None:
        self._handlers: DefaultDict[str, List[EventHandler]] = defaultdict(list)

    def register(self, event_name: str, handler: EventHandler) -> None:
        if handler not in self._handlers[event_name]:
            self._handlers[event_name].append(handler)

    def get_handlers(self, event_name: str) -> list[EventHandler]:
        return list(self._handlers.get(event_name, []))


event_registry = EventRegistry()

