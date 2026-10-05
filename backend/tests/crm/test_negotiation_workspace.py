from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.crm.negotiation import get_negotiation, patch_negotiation
from app.crm.pipeline import CRMPipelineService
from app.models.sales_prospect import ProspectStatus
from app.models.user import UserRole


def _user(role=UserRole.ADMIN, user_id="user-1", company_id="company-1"):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id, first_name="Ada", last_name="Admin")


def _lead(**overrides):
    now = datetime.utcnow()
    defaults = dict(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        company_name="Alpha",
        current_stage="Negotiation",
        status=ProspectStatus.ACTIVE,
        assigned_to="user-1",
        assigned_by="manager-1",
        created_by="user-1",
        proposal_status="accepted",
        negotiation_status="negotiation_started",
        negotiation_notes=None,
        customer_counter_offer=None,
        discount=None,
        final_scope=None,
        payment_terms=None,
        client_conditions=None,
        accepted_quotation_reference=None,
        won_amount=None,
        timeline=None,
        next_follow_up_at=None,
        current_stage_status="negotiation_started",
        stage_status_history=[],
        created_at=now - timedelta(days=2),
        updated_at=now - timedelta(days=1),
        stage_entered_at=now - timedelta(days=1),
        stage_last_changed_at=now - timedelta(days=1),
        days_in_stage=1,
        closed_date=None,
        closed_by=None,
        reason_for_lost=None,
        saved=False,
    )
    defaults.update(overrides)
    lead = SimpleNamespace(**defaults)

    async def fake_save():
        lead.saved = True

    lead.save = fake_save
    return lead


def _patch_lead(monkeypatch, lead):
    async def fake_get(lead_id):
        assert lead_id == "lead-1"
        return lead

    monkeypatch.setattr("app.crm.negotiation.SalesProspect.get", fake_get)


def _patch_activity(monkeypatch, events):
    async def fake_activity(**kwargs):
        events.append(kwargs)
        return SimpleNamespace(id="activity-1", **kwargs)

    monkeypatch.setattr("app.crm.negotiation.notification_service.update_crm_activity", fake_activity)


@pytest.mark.asyncio
async def test_save_update_negotiation_persists_supported_fields(monkeypatch):
    lead = _lead()
    events = []
    _patch_lead(monkeypatch, lead)
    _patch_activity(monkeypatch, events)

    result = await patch_negotiation(
        _user(),
        "lead-1",
        {
            "accepted_quotation_reference": "QTN-001",
            "customer_counter_offer": 9000,
            "final_agreed_amount": 8500,
            "discount": 500,
            "final_scope": "SEO plus reporting",
            "payment_terms": "50% advance",
            "delivery_timeline": "30 days",
            "client_conditions": "Monthly review",
            "negotiation_notes": "Client accepted scope",
            "next_follow_up": "2026-08-20",
        },
    )

    data = result["negotiation"]
    assert data["accepted_quotation_reference"] == "QTN-001"
    assert data["customer_counter_offer"] == 9000
    assert data["final_agreed_amount"] == 8500
    assert data["discount"] == 500
    assert data["delivery_timeline"] == "30 days"
    assert lead.won_amount == 8500
    assert lead.timeline == "30 days"
    assert lead.saved is True
    assert events and events[0]["title"] == "Final offer recorded"
    assert "final_agreed_amount" in events[0]["metadata"]["changed_fields"]


@pytest.mark.asyncio
async def test_manual_status_change_remains_allowed_and_audited(monkeypatch):
    lead = _lead()
    events = []
    _patch_lead(monkeypatch, lead)
    _patch_activity(monkeypatch, events)

    result = await patch_negotiation(_user(), "lead-1", {"negotiation_status": "Accepted"})

    assert result["manual_status"] is True
    assert lead.negotiation_status == "accepted"
    assert lead.current_stage_status == "accepted"
    assert lead.stage_status_history[-1]["to_status"] == "accepted"
    assert events[0]["metadata"]["manual_status"] is True
    assert events[0]["metadata"]["new_status"] == "accepted"
    assert events[0]["title"] == "Negotiation accepted"


@pytest.mark.asyncio
async def test_activity_creation_for_note_only_change(monkeypatch):
    lead = _lead(negotiation_notes="Old")
    events = []
    _patch_lead(monkeypatch, lead)
    _patch_activity(monkeypatch, events)

    await patch_negotiation(_user(), "lead-1", {"negotiation_notes": "New note"})

    assert lead.negotiation_notes == "New note"
    assert events
    assert events[0]["entity_type"] == "lead"
    assert events[0]["entity_id"] == "lead-1"
    assert events[0]["metadata"]["changed_fields"] == ["negotiation_notes"]


@pytest.mark.asyncio
async def test_counter_offer_auto_suggests_waiting_internal_and_records_activity(monkeypatch):
    lead = _lead(negotiation_status="negotiation_started", current_stage_status="negotiation_started")
    events = []
    _patch_lead(monkeypatch, lead)
    _patch_activity(monkeypatch, events)

    result = await patch_negotiation(_user(), "lead-1", {"customer_counter_offer": 9200})

    assert result["manual_status"] is False
    assert lead.negotiation_status == "waiting_internal"
    assert events[0]["title"] == "Counter offer recorded"
    assert events[0]["metadata"]["new_status"] == "waiting_internal"


@pytest.mark.asyncio
async def test_final_offer_auto_suggests_final_offer_without_blocking_later_manual_status(monkeypatch):
    lead = _lead(negotiation_status="waiting_internal", current_stage_status="waiting_internal")
    events = []
    _patch_lead(monkeypatch, lead)
    _patch_activity(monkeypatch, events)

    result = await patch_negotiation(_user(), "lead-1", {"final_agreed_amount": 8400, "payment_terms": "Net 15"})

    assert result["manual_status"] is False
    assert lead.negotiation_status == "final_offer"
    assert events[0]["title"] == "Final offer recorded"

    await patch_negotiation(_user(), "lead-1", {"negotiation_status": "Waiting Client"})
    assert lead.negotiation_status == "waiting_client"


@pytest.mark.asyncio
async def test_agreement_gate_requires_accepted_negotiation(monkeypatch):
    lead = _lead(current_stage="Negotiation", negotiation_status="final_offer", current_stage_status="final_offer")

    async def fake_stage_documents(current_user):
        return [
            {"name": "Negotiation", "order": 4, "is_default": False},
            {"name": "Agreement", "order": 5, "is_default": False},
        ]

    async def fake_get(lead_id):
        return lead

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)

    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(_user(role=UserRole.EMPLOYEE), "lead-1", "Agreement")

    assert exc_info.value.status_code == 400
    detail = exc_info.value.detail
    assert detail["code"] == "STAGE_TRANSITION_BLOCKED"
    assert detail["status_requirement"]["field"] == "negotiation_status"
    assert detail["status_requirement"]["allowed_values"] == ["accepted"]


@pytest.mark.asyncio
async def test_pipeline_records_negotiation_started_activity(monkeypatch):
    lead = _lead(current_stage="Proposal", proposal_status="accepted", current_stage_status="accepted")
    inserted_activities = []

    async def fake_stage_documents(current_user):
        return [
            {"name": "Proposal", "order": 3, "is_default": False},
            {"name": "Negotiation", "order": 4, "is_default": False},
        ]

    async def fake_get(lead_id):
        return lead

    async def fake_history_insert(self):
        return self

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    async def fake_activity_insert(self):
        inserted_activities.append(self)
        return self

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_history_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)
    monkeypatch.setattr("app.crm.pipeline.CRMActivity.insert", fake_activity_insert)

    result = await CRMPipelineService.move_lead(_user(role=UserRole.EMPLOYEE), "lead-1", "Negotiation")

    assert result["lead"]["current_stage"] == "Negotiation"
    assert lead.negotiation_status == "negotiation_started"
    assert inserted_activities
    assert inserted_activities[0].title == "Negotiation started"
    assert inserted_activities[0].metadata["stage_key"] == "negotiation"


@pytest.mark.asyncio
async def test_permissions_require_owned_lead(monkeypatch):
    lead = _lead(assigned_to="owner-2", assigned_by="manager-2", created_by="owner-2")
    _patch_lead(monkeypatch, lead)

    with pytest.raises(HTTPException) as exc_info:
        await patch_negotiation(_user(role=UserRole.EMPLOYEE, user_id="user-1"), "lead-1", {"negotiation_notes": "Nope"})

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_company_isolation_blocks_cross_company_access(monkeypatch):
    lead = _lead(company_id="company-2")
    _patch_lead(monkeypatch, lead)

    with pytest.raises(HTTPException) as exc_info:
        await get_negotiation(_user(role=UserRole.ADMIN, company_id="company-1"), "lead-1")

    assert exc_info.value.status_code == 403
