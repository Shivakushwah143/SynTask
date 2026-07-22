import pytest

from app.events.contracts import DomainEvent
from app.events.dispatcher import EventDispatcher
from app.events.registry import event_registry


@pytest.mark.asyncio
async def test_dispatcher_keeps_running_when_one_handler_fails():
    dispatcher = EventDispatcher()
    calls = []

    async def failing_handler(event):
        calls.append(("fail", event.event_name))
        raise RuntimeError("boom")

    async def succeeding_handler(event):
        calls.append(("ok", event.event_name))

    event_registry.register("ProjectCreated", failing_handler)
    event_registry.register("ProjectCreated", succeeding_handler)

    event = DomainEvent(
        event_name="ProjectCreated",
        aggregate_type="project",
        aggregate_id="project-1",
        company_id="company-1",
        actor_id="user-1",
        payload={"title": "Project"},
        idempotency_key="company-1:project:project-1:ProjectCreated:1",
    )

    await dispatcher.dispatch(event)

    assert calls == [("fail", "ProjectCreated"), ("ok", "ProjectCreated")]
    assert dispatcher.stats["failing_handler"]["failures"] == 1
    assert dispatcher.stats["succeeding_handler"]["successes"] == 1

    event_registry._handlers["ProjectCreated"].remove(failing_handler)
    event_registry._handlers["ProjectCreated"].remove(succeeding_handler)
