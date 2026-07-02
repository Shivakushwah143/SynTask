from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.crm.pipeline import CRMPipelineService
from app.models.sales_prospect import ProspectStatus
from app.models.user import UserRole


class FakeQuery:
    def __init__(self, items, on_find=None):
        self._items = items
        self._on_find = on_find
        self.query = None

    def sort(self, *args, **kwargs):
        return self

    def skip(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    async def to_list(self):
        return self._items

    async def count(self):
        return len(self._items)


@pytest.mark.asyncio
async def test_load_pipeline_groups_leads_and_uses_existing_stage_catalog(monkeypatch):
    stages = [
        SimpleNamespace(id="stage-1", name="Lead", order=0, is_default=True),
        SimpleNamespace(id="stage-2", name="Qualified", order=1, is_default=False),
    ]
    prospects = [
        SimpleNamespace(
            id="lead-1",
            prospect_name="Alpha Co",
            company_name="Alpha",
            contact_id=None,
            assigned_to="user-1",
            assigned_by="user-2",
            current_stage="new",
            status=ProspectStatus.ACTIVE,
            phone="111",
            country_code="+91",
            email=None,
            tag=[],
            remark=None,
            won_amount=None,
            reason_for_lost=None,
            created_at=datetime.utcnow() - timedelta(days=4),
            updated_at=datetime.utcnow(),
            stage_entered_at=None,
            stage_last_changed_at=None,
            days_in_stage=0,
        ),
        SimpleNamespace(
            id="lead-2",
            prospect_name="Beta Co",
            company_name="Beta",
            contact_id=None,
            assigned_to="user-3",
            assigned_by="user-4",
            current_stage="Qualified",
            status=ProspectStatus.ACTIVE,
            phone="222",
            country_code="+91",
            email=None,
            tag=[],
            remark=None,
            won_amount=None,
            reason_for_lost=None,
            created_at=datetime.utcnow() - timedelta(days=2),
            updated_at=datetime.utcnow(),
            stage_entered_at=None,
            stage_last_changed_at=None,
            days_in_stage=0,
        ),
    ]

    async def fake_stage_documents(current_user):
        return stages

    def fake_find(query):
        assert query["company_id"] == "company-1"
        return FakeQuery(prospects)

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.find", fake_find)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN)
    pipeline = await CRMPipelineService.load_pipeline(user)

    assert [stage["name"] for stage in pipeline["stages"]] == ["Lead", "Qualified"]
    assert pipeline["stage_counts"][0]["count"] == 1
    assert pipeline["leads_by_stage"]["Lead"][0]["id"] == "lead-1"
    assert pipeline["summary"]["total_leads"] == 2


@pytest.mark.asyncio
async def test_load_pipeline_enforces_tenant_scope_for_writes(monkeypatch):
    captured = {}

    async def fake_stage_documents(current_user):
        return []

    def fake_find(query):
        captured["query"] = query
        return FakeQuery([])

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.find", fake_find)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    await CRMPipelineService.load_pipeline(user)

    assert captured["query"]["company_id"] == "company-1"
    assert captured["query"]["$or"] == [
        {"assigned_to": "user-1"},
        {"assigned_by": "user-1"},
    ]


@pytest.mark.asyncio
async def test_move_lead_updates_stage_history_and_timeline(monkeypatch):
    now = datetime.utcnow()
    lead = SimpleNamespace(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        current_stage="Lead",
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
        saved=False,
    )

    async def fake_save():
        lead.saved = True

    lead.save = fake_save

    async def fake_stage_documents(current_user):
        return [
            SimpleNamespace(id="stage-1", name="Lead", order=0, is_default=True),
            SimpleNamespace(id="stage-2", name="Qualified", order=1, is_default=False),
        ]

    async def fake_get(lead_id):
        assert lead_id == "lead-1"
        return lead

    history_capture = {}
    timeline_capture = {}

    async def fake_insert(self):
        history_capture["item"] = self
        return self

    async def fake_publish(**kwargs):
        timeline_capture["kwargs"] = kwargs
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN, first_name="Ada", last_name="Admin")
    result = await CRMPipelineService.move_lead(user, "lead-1", "Qualified", "ready")

    assert lead.saved is True
    assert lead.current_stage == "Qualified"
    assert lead.days_in_stage == 0
    assert lead.stage_entered_at is not None
    assert lead.stage_last_changed_at is not None
    assert history_capture["item"].previous_stage == "Lead"
    assert history_capture["item"].new_stage == "Qualified"
    assert history_capture["item"].reason == "ready"
    assert timeline_capture["kwargs"]["event_name"] == "LeadStageChanged"
    assert timeline_capture["kwargs"]["payload"]["new_stage"] == "Qualified"
    assert result["lead"]["current_stage"] == "Qualified"


@pytest.mark.asyncio
async def test_move_lead_rejects_unknown_or_invalid_stage(monkeypatch):
    lead = SimpleNamespace(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        current_stage="Qualified",
        status=ProspectStatus.ACTIVE,
        assigned_to="user-1",
        assigned_by="user-2",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        stage_entered_at=None,
        stage_last_changed_at=None,
        days_in_stage=0,
        save=lambda: None,
    )

    async def fake_stage_documents(current_user):
        return [SimpleNamespace(id="stage-1", name="Qualified", order=0, is_default=True)]

    async def fake_get(lead_id):
        return lead

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN)

    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(user, "lead-1", "Qualified")
    assert exc_info.value.status_code == 400

    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(user, "lead-1", "Unknown Stage")
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_get_history_enforces_tenant_isolation(monkeypatch):
    lead = SimpleNamespace(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        assigned_to="user-1",
        assigned_by="user-2",
    )

    async def fake_get(lead_id):
        return lead

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)

    user = SimpleNamespace(id="user-1", company_id="company-2", role=UserRole.ADMIN)

    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.get_history(user, "lead-1")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_get_history_returns_transition_records(monkeypatch):
    lead = SimpleNamespace(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        assigned_to="user-1",
        assigned_by="user-2",
    )
    records = [
        SimpleNamespace(
            id="hist-1",
            lead_id="lead-1",
            company_id="company-1",
            previous_stage="Lead",
            new_stage="Qualified",
            user_id="user-1",
            user_name="Ada Admin",
            reason="ready",
            days_in_previous_stage=3,
            transitioned_at=datetime.utcnow(),
            payload={"new_stage": "Qualified"},
        )
    ]

    class FakeHistoryQuery(FakeQuery):
        def sort(self, *args, **kwargs):
            return self

    async def fake_get(lead_id):
        return lead

    def fake_find(query):
        assert query["company_id"] == "company-1"
        assert query["lead_id"] == "lead-1"
        return FakeHistoryQuery(records)

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.find", fake_find)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN)
    result = await CRMPipelineService.get_history(user, "lead-1")

    assert result["lead_id"] == "lead-1"
    assert result["history"][0]["new_stage"] == "Qualified"
