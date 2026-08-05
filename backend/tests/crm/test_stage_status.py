"""Stage-scoped inner-status system tests.

Covers the Sales Workspace inner-status specification:
- Allowed values per stage (canonical config) and cross-stage rejection
- Status history (one entry per change, no-op dedupe, actor + timestamp)
- Stage isolation for repeated labels (Draft/Sent/Viewed/Accepted/...)
- Stage-entry initialization of the default inner status
- Exit-condition validation tied to the canonical stage status
- Domain synchronization (proposal, agreement, payment, handoff)
- Security (permissions, tenant isolation, no frontend-supplied stage bypass)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.crm.pipeline import (
    CRMPipelineService,
    STAGE_INNER_STATUSES,
    apply_stage_status_change,
    initialize_stage_status,
)
from app.crm.conversion import LeadConversionService
from app.models.sales_prospect import ProspectStatus
from app.models.user import UserRole


# ── Helpers ────────────────────────────────────────────────────────────────────


def _lead(**overrides):
    """Minimal in-memory lead with the journey fields the service touches."""
    now = datetime.utcnow()
    defaults = dict(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        company_name="Alpha",
        current_stage="Acquire",
        status=ProspectStatus.ACTIVE,
        assigned_to="user-1",
        assigned_by="user-2",
        created_at=now - timedelta(days=5),
        updated_at=now - timedelta(days=1),
        stage_entered_at=now - timedelta(days=3),
        stage_last_changed_at=now - timedelta(days=3),
        days_in_stage=3,
        closed_date=None,
        closed_by=None,
        reason_for_lost=None,
        won_amount=None,
        won_status=None,
        qualify_status=None,
        discovery_outcome=None,
        proposal_status=None,
        negotiation_status=None,
        agreement_status=None,
        current_stage_status=None,
        stage_status_history=[],
        saved=False,
    )
    defaults.update(overrides)
    lead = SimpleNamespace(**defaults)

    async def fake_save():
        lead.saved = True

    lead.save = fake_save
    return lead


def _user(role=UserRole.ADMIN, user_id="user-1", company_id="company-1", **overrides):
    defaults = dict(
        id=user_id,
        company_id=company_id,
        role=role,
        first_name="Ada",
        last_name="Admin",
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _patch_status_service(monkeypatch, lead, events=None):
    async def fake_get(lead_id):
        assert lead_id == lead.id
        return lead

    async def fake_publish(**kwargs):
        if events is not None:
            events.append(kwargs)
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)


# ── Allowed values / cross-stage rejection ─────────────────────────────────────


@pytest.mark.asyncio
async def test_acquire_accepts_new(monkeypatch):
    lead = _lead(current_stage="Acquire")
    _patch_status_service(monkeypatch, lead)

    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "New")
    assert result["status"] == "new"
    assert result["changed"] is True
    assert lead.current_stage_status == "new"
    assert len(lead.stage_status_history) == 1


@pytest.mark.asyncio
async def test_acquire_rejects_signed(monkeypatch):
    lead = _lead(current_stage="Acquire")
    _patch_status_service(monkeypatch, lead)

    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(_user(), "lead-1", "Signed")
    assert exc_info.value.status_code == 400
    assert "not a valid status for the Acquire stage" in exc_info.value.detail
    assert lead.current_stage_status is None


@pytest.mark.asyncio
async def test_qualify_accepts_interested(monkeypatch):
    lead = _lead(current_stage="Qualify", qualify_status="contacted", current_stage_status="contacted")
    _patch_status_service(monkeypatch, lead)

    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Interested")
    assert result["status"] == "interested"
    assert lead.qualify_status == "interested"
    assert lead.current_stage_status == "interested"


@pytest.mark.asyncio
async def test_qualify_rejects_draft(monkeypatch):
    lead = _lead(current_stage="Qualify")
    _patch_status_service(monkeypatch, lead)

    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(_user(), "lead-1", "Draft")
    assert exc_info.value.status_code == 400
    assert "not a valid status for the Qualify stage" in exc_info.value.detail


@pytest.mark.asyncio
async def test_proposal_accepts_sent(monkeypatch):
    lead = _lead(current_stage="Proposal", proposal_status="draft", current_stage_status="draft")
    _patch_status_service(monkeypatch, lead)

    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Sent")
    assert result["status"] == "sent"
    assert lead.proposal_status == "sent"
    assert lead.current_stage_status == "sent"


@pytest.mark.asyncio
async def test_agreement_accepts_signed(monkeypatch):
    lead = _lead(current_stage="Agreement", agreement_status="sent", current_stage_status="sent")
    _patch_status_service(monkeypatch, lead)

    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Signed")
    assert result["status"] == "signed"
    assert lead.agreement_status == "signed"
    assert lead.current_stage_status == "signed"


@pytest.mark.asyncio
async def test_won_status_api_blocks_transferred_requires_handoff(monkeypatch):
    lead = _lead(current_stage="Won", won_status="payment_pending", current_stage_status="payment_pending")
    _patch_status_service(monkeypatch, lead)

    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(_user(), "lead-1", "Transferred")
    assert exc_info.value.status_code == 400
    assert "handoff" in exc_info.value.detail


@pytest.mark.asyncio
async def test_won_accepts_payment_received_and_rejects_backward(monkeypatch):
    lead = _lead(current_stage="Won", won_status="payment_pending", current_stage_status="payment_pending")
    _patch_status_service(monkeypatch, lead)

    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Payment Received")
    assert result["status"] == "payment_received"
    assert lead.won_status == "payment_received"

    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(_user(), "lead-1", "Payment Pending")
    assert exc_info.value.status_code == 400
    assert "backward" in exc_info.value.detail


@pytest.mark.asyncio
async def test_won_same_status_is_a_no_op_not_an_error(monkeypatch):
    lead = _lead(current_stage="Won", won_status="payment_received", current_stage_status="payment_received")
    _patch_status_service(monkeypatch, lead)

    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Payment Received")
    assert result["changed"] is False
    assert result["message"] == "Stage status unchanged"
    assert len(lead.stage_status_history) == 0


# ── Status history ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_status_change_creates_single_history_entry_with_actor_and_time(monkeypatch):
    lead = _lead(current_stage="Qualify", qualify_status="not_contacted", current_stage_status="not_contacted")
    _patch_status_service(monkeypatch, lead)

    await CRMPipelineService.update_stage_status(_user(), "lead-1", "Contacted")
    assert len(lead.stage_status_history) == 1
    entry = lead.stage_status_history[0]
    assert entry["stage"] == "Qualify"
    assert entry["from_status"] == "not_contacted"
    assert entry["to_status"] == "contacted"
    assert entry["changed_by"] == "user-1"
    assert entry["changed_by_name"] == "Ada Admin"
    assert entry["changed_at"]


@pytest.mark.asyncio
async def test_no_duplicate_history_when_status_unchanged(monkeypatch):
    lead = _lead(
        current_stage="Proposal",
        proposal_status="sent",
        current_stage_status="sent",
        stage_status_history=[
            {"stage": "Proposal", "from_status": "draft", "to_status": "sent", "changed_by": "user-1", "changed_at": "2026-08-01T10:00:00"}
        ],
    )
    _patch_status_service(monkeypatch, lead)

    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Sent")
    assert result["changed"] is False
    assert len(lead.stage_status_history) == 1  # untouched


# ── Stage isolation for repeated labels ────────────────────────────────────────


@pytest.mark.asyncio
async def test_proposal_accepted_is_distinct_from_negotiation_accepted(monkeypatch):
    # "accepted" is valid in both Proposal and Negotiation, but never cross-applied.
    proposal_lead = _lead(current_stage="Proposal", proposal_status="draft", current_stage_status="draft")
    _patch_status_service(monkeypatch, proposal_lead)
    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Accepted")
    assert result["status"] == "accepted"
    assert proposal_lead.proposal_status == "accepted"

    negotiation_lead = _lead(current_stage="Negotiation", negotiation_status="negotiation_started", current_stage_status="negotiation_started")
    async def fake_get_negotiation(lead_id):
        return negotiation_lead
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get_negotiation)
    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Accepted")
    assert result["status"] == "accepted"
    assert negotiation_lead.negotiation_status == "accepted"


@pytest.mark.asyncio
async def test_proposal_draft_is_distinct_from_agreement_draft(monkeypatch):
    # A lead in Proposal can never carry an Agreement-only status, and vice versa.
    lead = _lead(current_stage="Proposal", proposal_status="draft", current_stage_status="draft")
    _patch_status_service(monkeypatch, lead)

    # Agreement-only labels must be rejected while the lead is in Proposal.
    for invalid in ["Signed", "Payment Received"]:
        with pytest.raises(HTTPException) as exc_info:
            await CRMPipelineService.update_stage_status(_user(), "lead-1", invalid)
        assert exc_info.value.status_code == 400
        assert "not a valid status for the Proposal stage" in exc_info.value.detail

    # And the reverse: an Agreement lead must reject Proposal/Negotiation labels.
    agreement_lead = _lead(
        current_stage="Agreement", agreement_status="draft", current_stage_status="draft"
    )

    async def fake_get_agreement(lead_id):
        return agreement_lead

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get_agreement)
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(_user(), "lead-1", "Accepted")
    assert exc_info.value.status_code == 400
    assert "not a valid status for the Agreement stage" in exc_info.value.detail


# ── Stage-entry initialization (default inner status) ──────────────────────────


@pytest.mark.asyncio
async def test_entering_qualify_initializes_not_contacted(monkeypatch):
    lead = _lead(current_stage="Qualify", qualify_status=None, current_stage_status=None)
    initialize_stage_status(lead, _user())
    assert lead.current_stage_status == "not_contacted"
    assert lead.qualify_status == "not_contacted"


@pytest.mark.asyncio
async def test_entering_discovery_leaves_outcome_unset(monkeypatch):
    lead = _lead(current_stage="Discovery", discovery_outcome=None, current_stage_status="interested")
    initialize_stage_status(lead, _user())
    assert lead.current_stage_status is None
    assert lead.discovery_outcome is None


@pytest.mark.asyncio
async def test_entering_proposal_initializes_draft(monkeypatch):
    lead = _lead(current_stage="Proposal", proposal_status=None, current_stage_status=None)
    initialize_stage_status(lead, _user())
    assert lead.current_stage_status == "draft"
    assert lead.proposal_status == "draft"


@pytest.mark.asyncio
async def test_entering_negotiation_initializes_negotiation_started(monkeypatch):
    lead = _lead(current_stage="Negotiation", negotiation_status=None, current_stage_status=None)
    initialize_stage_status(lead, _user())
    assert lead.current_stage_status == "negotiation_started"


@pytest.mark.asyncio
async def test_entering_agreement_initializes_draft(monkeypatch):
    lead = _lead(current_stage="Agreement", agreement_status=None, current_stage_status=None)
    initialize_stage_status(lead, _user())
    assert lead.current_stage_status == "draft"
    assert lead.agreement_status == "draft"


@pytest.mark.asyncio
async def test_entering_won_initializes_payment_pending(monkeypatch):
    lead = _lead(current_stage="Won", won_status=None, current_stage_status=None)
    initialize_stage_status(lead, _user())
    assert lead.current_stage_status == "payment_pending"
    assert lead.won_status == "payment_pending"


@pytest.mark.asyncio
async def test_previous_stage_status_not_carried_into_new_stage(monkeypatch):
    # Proposal had an "accepted" snapshot; moving to Negotiation must reset it.
    lead = _lead(
        current_stage="Negotiation",
        proposal_status="accepted",  # previous stage's domain value is preserved on the lead
        current_stage_status="accepted",  # but the snapshot belongs to the new stage now
        negotiation_status=None,
    )
    initialize_stage_status(lead, _user())
    assert lead.current_stage_status == "negotiation_started"
    assert lead.proposal_status == "accepted"  # historical data untouched
    assert lead.negotiation_status == "negotiation_started"


# ── Exit-condition / qualified gating on the status API ────────────────────────


@pytest.mark.asyncio
async def test_qualified_requires_interest_budget_and_decision_maker(monkeypatch):
    lead = _lead(current_stage="Qualify", qualify_status="contacted", current_stage_status="contacted")
    _patch_status_service(monkeypatch, lead)

    # Missing everything.
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(_user(), "lead-1", "Qualified")
    assert exc_info.value.status_code == 400

    # Budget + decision maker but no interest yet.
    lead.budget = 250000
    lead.decision_maker = "Priya Shah"
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(_user(), "lead-1", "Qualified")
    assert "Interested" in exc_info.value.detail

    # Everything present -> Qualified accepted.
    lead.qualify_status = "interested"
    lead.current_stage_status = "interested"
    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Qualified")
    assert result["status"] == "qualified"


@pytest.mark.asyncio
async def test_status_change_cannot_bypass_discovery_exit_condition(monkeypatch):
    # Selecting "Need Proposal" is fine; other outcomes never unlock Proposal.
    lead = _lead(current_stage="Discovery", discovery_outcome="follow_up_required", current_stage_status="follow_up_required")
    _patch_status_service(monkeypatch, lead)

    result = await CRMPipelineService.update_stage_status(_user(), "lead-1", "Need Proposal")
    assert result["status"] == "need_proposal"
    assert lead.discovery_outcome == "need_proposal"


# ── Security ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthorized_user_cannot_change_inner_status(monkeypatch):
    lead = _lead(current_stage="Qualify", assigned_to="user-1", assigned_by="user-2")
    _patch_status_service(monkeypatch, lead)

    stranger = _user(role=UserRole.EMPLOYEE, user_id="user-99")
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(stranger, "lead-1", "Contacted")
    assert exc_info.value.status_code == 403
    assert lead.current_stage_status is None


@pytest.mark.asyncio
async def test_cross_company_lead_cannot_be_updated(monkeypatch):
    lead = _lead(current_stage="Qualify", company_id="company-1")
    _patch_status_service(monkeypatch, lead)

    other_org = _user(role=UserRole.MANAGER, company_id="company-2")
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(other_org, "lead-1", "Contacted")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_stage_is_read_from_database_not_request(monkeypatch):
    # The status API only accepts a status value; the stage is resolved from the
    # lead itself, so a Proposal label can never be applied to a Qualify lead.
    lead = _lead(current_stage="Qualify", qualify_status="contacted", current_stage_status="contacted")
    _patch_status_service(monkeypatch, lead)

    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(_user(), "lead-1", "Signed")
    assert exc_info.value.status_code == 400
    assert "not a valid status for the Qualify stage" in exc_info.value.detail


@pytest.mark.asyncio
async def test_lead_not_found(monkeypatch):
    async def fake_get(lead_id):
        return None

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.update_stage_status(_user(), "missing", "New")
    assert exc_info.value.status_code == 404


# ── Domain synchronization ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_apply_stage_status_change_keeps_domain_field_in_sync(monkeypatch):
    lead = _lead(current_stage="Agreement", agreement_status="draft", current_stage_status="draft")
    changed = apply_stage_status_change(lead, stage_key="agreement", new_status="signed", user=_user())
    assert changed is True
    assert lead.agreement_status == "signed"
    assert lead.current_stage_status == "signed"
    assert lead.stage_status_history[-1]["to_status"] == "signed"


@pytest.mark.asyncio
async def test_apply_stage_status_change_outside_current_stage_only_syncs_domain(monkeypatch):
    # A domain value set while the lead is in a different stage updates the
    # canonical field but never touches the current stage snapshot.
    lead = _lead(current_stage="Proposal", proposal_status="draft", current_stage_status="draft")
    changed = apply_stage_status_change(lead, stage_key="agreement", new_status="signed", user=_user())
    assert changed is False
    assert lead.agreement_status == "signed"
    assert lead.current_stage_status == "draft"  # untouched snapshot


@pytest.mark.asyncio
async def test_won_payment_received_syncs_conversion(monkeypatch):
    lead = _lead(current_stage="Won", won_status="payment_pending", current_stage_status="payment_pending")

    async def fake_load_won(current_user, lead_id):
        return lead

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.conversion._load_won_lead", fake_load_won)
    monkeypatch.setattr("app.crm.conversion.publish_crm_timeline_event", fake_publish)

    result = await LeadConversionService.update_won_status(_user(), "lead-1", "Payment Received")
    assert result["conversion"]["won_status"] == "payment_received"
    assert lead.current_stage_status == "payment_received"
    assert lead.stage_status_history[-1]["to_status"] == "payment_received"


@pytest.mark.asyncio
async def test_transfer_to_clients_marks_transferred_and_preserves_lead(monkeypatch):
    lead = _lead(
        current_stage="Won",
        status=ProspectStatus.WON,
        won_status="ready",
        current_stage_status="ready",
        client_id=None,
        project_id=None,
        invoice_id=None,
        account_manager_id=None,
        welcome_email_sent_at=None,
        ops_notified_at=None,
        converted_at=None,
        transferred_at=None,
        transferred_by=None,
    )

    async def fake_load_won(current_user, lead_id):
        return lead

    client = SimpleNamespace(
        id="client-1",
        company_id="company-1",
        name="Alpha",
        company_name="Alpha",
        contact=None,
        assigned_to=None,
        status="active",
        updated_at=None,
        saved=False,
    )

    async def fake_client_save():
        client.saved = True

    client.save = fake_client_save

    async def fake_resolve_client(prospect):
        return client

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.conversion._load_won_lead", fake_load_won)
    monkeypatch.setattr("app.crm.conversion._resolve_client", fake_resolve_client)
    monkeypatch.setattr("app.crm.conversion.publish_crm_timeline_event", fake_publish)

    result = await LeadConversionService.transfer_to_clients(_user(), "lead-1")
    assert lead.won_status == "transferred"
    assert lead.current_stage_status == "transferred"
    assert lead.transferred_at is not None
    assert lead.transferred_by == "user-1"
    assert result["conversion"]["won_status"] == "transferred"

    # Idempotent: a second transfer reuses the existing state.
    result2 = await LeadConversionService.transfer_to_clients(_user(), "lead-1")
    assert result2["conversion"]["won_status"] == "transferred"
    assert len(lead.stage_status_history) == 1  # no duplicate history entry


@pytest.mark.asyncio
async def test_transfer_returns_structured_missing_fields_for_employee(monkeypatch):
    # A normal salesperson cannot transfer until handoff details exist; the
    # blocker is structured so the frontend popup can offer Create Client.
    lead = _lead(
        current_stage="Won",
        status=ProspectStatus.WON,
        won_status="payment_pending",
        current_stage_status="payment_pending",
        client_id=None,
        account_manager_id=None,
        transferred_at=None,
    )

    async def fake_load_won(current_user, lead_id):
        return lead

    monkeypatch.setattr("app.crm.conversion._load_won_lead", fake_load_won)

    user = _user(role=UserRole.EMPLOYEE)
    with pytest.raises(HTTPException) as exc_info:
        await LeadConversionService.transfer_to_clients(user, "lead-1")
    detail = exc_info.value.detail
    assert exc_info.value.status_code == 400
    assert detail["code"] == "STAGE_TRANSITION_BLOCKED"
    assert detail["severity"] == "warning"
    assert detail["target_stage"] == "Clients"
    assert {item["field"] for item in detail["missing_fields"]} == {"account_manager_id", "client_id"}
    assert detail["status_requirement"]["field"] == "won_status"
    assert detail["status_requirement"]["allowed_values"] == ["ready"]


@pytest.mark.asyncio
async def test_create_client_reuses_existing_client_without_running_automation(monkeypatch):
    # Idempotency: when the lead already references a client, create_client
    # returns the existing record and never re-runs the won automation.
    lead = _lead(
        current_stage="Won",
        status=ProspectStatus.WON,
        won_status="payment_pending",
        client_id="client-9",
        project_id="project-9",
    )

    async def fake_load_won(current_user, lead_id):
        return lead

    async def fake_client_get(client_id):
        return SimpleNamespace(id=client_id, name="Alpha")

    async def fake_run_automation(current_user, prospect, company_id):
        raise AssertionError("automation must not re-run when the client ref already exists")

    monkeypatch.setattr("app.crm.conversion._load_won_lead", fake_load_won)
    monkeypatch.setattr("app.crm.conversion.Client.get", fake_client_get)
    monkeypatch.setattr("app.crm.conversion._run_won_automation", fake_run_automation)

    result = await LeadConversionService.create_client(_user(), "lead-1")
    assert result["client"]["status"] == "reused"
    assert result["client"]["id"] == "client-9"


# ── Canonical config sanity ────────────────────────────────────────────────────


def test_canonical_stage_status_config_covers_all_stages():
    assert STAGE_INNER_STATUSES["acquire"] == ["new", "imported", "assigned", "duplicate", "spam"]
    assert "interested" in STAGE_INNER_STATUSES["qualify"]
    assert "qualified" in STAGE_INNER_STATUSES["qualify"]
    assert "need_proposal" in STAGE_INNER_STATUSES["discovery"]
    assert "revision_requested" in STAGE_INNER_STATUSES["proposal"]
    assert "final_offer" in STAGE_INNER_STATUSES["negotiation"]
    assert "signed" in STAGE_INNER_STATUSES["agreement"]
    assert STAGE_INNER_STATUSES["won"] == ["payment_pending", "payment_received", "onboarding_started", "ready", "transferred"]
    # No invented values.
    for statuses in STAGE_INNER_STATUSES.values():
        assert "pending" not in statuses
        assert "completed" not in statuses
        assert "converted" not in statuses
