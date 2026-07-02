from types import SimpleNamespace

import pytest

from app.crm.timeline import build_crm_timeline_event, publish_crm_timeline_event


def test_build_crm_timeline_event_wraps_crm_metadata():
    event = build_crm_timeline_event(
        event_name="LeadAssigned",
        aggregate_type="crm_lead",
        aggregate_id="lead-1",
        company_id="company-1",
        actor_id="user-1",
        payload={"lead_name": "Acme"},
    )

    assert event.event_name == "LeadAssigned"
    assert event.aggregate_type == "crm_lead"
    assert event.payload["surface"] == "crm"
    assert event.payload["lead_name"] == "Acme"
    assert event.metadata["surface"] == "crm"


@pytest.mark.asyncio
async def test_publish_crm_timeline_event_emits_domain_event(monkeypatch):
    captured = {}

    async def fake_publish(event):
        captured["event"] = event

    monkeypatch.setattr("app.crm.timeline.publish_event", fake_publish)

    event = await publish_crm_timeline_event(
        event_name="StageChanged",
        aggregate_type="crm_prospect",
        aggregate_id="prospect-1",
        company_id="company-1",
        actor_id="user-1",
        payload={"from_stage": "Discovery", "to_stage": "Proposal"},
    )

    assert captured["event"].event_name == "StageChanged"
    assert event.idempotency_key == captured["event"].idempotency_key
    assert captured["event"].payload["surface"] == "crm"
