import pytest

from app.events.bus import publish_event
from app.events.factories import build_domain_event
from app.events.registry import event_registry


@pytest.mark.asyncio
async def test_event_bus_publishes_to_registered_handler():
    calls = []

    async def handler(event):
        calls.append(event.event_name)

    event_registry.register("ProjectCreated", handler)
    event = build_domain_event(
        event_name="ProjectCreated",
        aggregate_type="project",
        aggregate_id="project-1",
        company_id="company-1",
        actor_id="user-1",
        payload={"title": "Project", "updated_at": "2026-06-30T00:00:00"},
    )

    await publish_event(event)

    assert calls == ["ProjectCreated"]
