from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.crm.pipeline import CRMPipelineService, _is_allowed_transition, _serialize_lead, resolved_stage_status
from app.models.sales_prospect import ProspectStatus, SalesProspect
from app.models.user import UserRole


def test_pipeline_allows_adjacent_previous_stage_but_not_backward_skip():
    assert _is_allowed_transition("Discovery", "Qualify") is True
    assert _is_allowed_transition("Proposal", "Discovery") is True
    assert _is_allowed_transition("Proposal", "Qualify") is False


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


class FakeBeanieQuery(FakeQuery):
    def sort(self, *args, **kwargs):
        return self


class FakeActivity:
    last_created = None

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = kwargs.get("id", "activity-1")

    async def insert(self):
        FakeActivity.last_created = self
        return self


class FakeNotification:
    last_created = None

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = kwargs.get("id", "notification-1")

    async def insert(self):
        FakeNotification.last_created = self
        return self


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
            created_at=datetime.now() - timedelta(days=4),
            updated_at=datetime.now(),
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
            created_at=datetime.now() - timedelta(days=2),
            updated_at=datetime.now(),
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
    monkeypatch.setattr(
        "app.crm.pipeline.User.find",
        lambda query: FakeBeanieQuery([SimpleNamespace(id="user-1", first_name="Ada", last_name="Admin")]),
    )
    monkeypatch.setattr(
        "app.crm.pipeline.CRMCompany.find",
        lambda query: FakeBeanieQuery([SimpleNamespace(id="company-1", name="Alpha")]),
    )

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


def _stub_beanie_settings(monkeypatch, find_fn=None):
    """Stub beanie's document settings so SalesProspect can be constructed and
    model-validated without a live Mongo connection (beanie's Document.__init__
    calls get_pymongo_collection() -> get_settings()).

    find_fn: optional raw-collection find() callable for the resilient fetch.
    """
    from types import SimpleNamespace as _SimpleNamespace

    collection = _SimpleNamespace()
    if find_fn is not None:
        collection.find = find_fn
    monkeypatch.setattr(
        "app.crm.pipeline.SalesProspect.get_settings",
        classmethod(lambda cls: _SimpleNamespace(pymongo_collection=collection)),
    )
    return collection


def test_model_tolerates_dirty_email_values(monkeypatch):
    # A legacy document carrying a non-email string must parse fine — the model
    # stores email as a plain string so one dirty record can never 500 reads.
    _stub_beanie_settings(monkeypatch)
    lead = SalesProspect.model_validate(
        {
            "_id": str(ObjectId()),
            "assigned_to": "user-1",
            "company_id": "company-1",
            "email": "vghygcvghgv",
            "current_stage": "new",
        }
    )
    assert lead.email == "vghygcvghgv"


def test_sanitize_email_clears_invalid_and_normalizes_valid():
    from app.crm.lead_engine import _sanitize_email

    assert _sanitize_email("vghygcvghgv") is None
    assert _sanitize_email("") is None
    assert _sanitize_email(None) is None
    assert _sanitize_email("  Foo@Bar.COM ") == "foo@bar.com"


@pytest.mark.asyncio
async def test_load_pipeline_skips_invalid_legacy_documents(monkeypatch):
    now = datetime.utcnow()

    ok_id = str(ObjectId())

    def make_raw(lead_id, status="active"):
        return {
            "_id": lead_id,
            "assigned_to": "user-1",
            "assigned_by": "user-2",
            "company_id": "company-1",
            "deleted": False,
            "prospect_name": f"Lead {lead_id}",
            "company_name": f"Company {lead_id}",
            "current_stage": "new",
            "status": status,
            "interest_level": "warm",
            "email": f"{lead_id}@example.com",
            "phone": "111",
            "country_code": "+91",
            "tag": [],
            "product_ids": [],
            "created_at": now,
            "updated_at": now,
            "stage_entered_at": None,
            "stage_last_changed_at": None,
            "days_in_stage": 0,
        }

    # One valid document + one legacy document with an unknown status enum
    # value that fails model validation and must be skipped, not crash the board.
    raw_docs = [make_raw(ok_id), make_raw(str(ObjectId()), status="bogus_status")]

    class FakeCursor:
        def sort(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        async def to_list(self, **kwargs):
            return raw_docs

    class FakeCollection:
        def find(self, query):
            return FakeCursor()

    async def fake_stage_documents(current_user):
        return [{"id": None, "name": "Acquire", "order": 0, "is_default": True, "aliases": ["new"]}]

    def fake_find(query):
        return FakeQuery(raw_docs)  # count = total incl. dirty docs

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.find", fake_find)
    _stub_beanie_settings(monkeypatch, find_fn=FakeCollection().find)
    monkeypatch.setattr(
        "app.crm.pipeline.User.find",
        lambda query: FakeBeanieQuery([SimpleNamespace(id="user-1", first_name="Ada", last_name="Admin")]),
    )
    monkeypatch.setattr(
        "app.crm.pipeline.CRMCompany.find",
        lambda query: FakeBeanieQuery([]),
    )

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN)
    pipeline = await CRMPipelineService.load_pipeline(user)

    # The dirty document is skipped; only the valid lead reaches the board.
    assert pipeline["summary"]["total_leads"] == 1
    assert pipeline["leads_by_stage"]["Acquire"][0]["id"] == ok_id
    # meta.total_leads is the raw count (incl. dirty docs) while the summary
    # reflects validated leads only — the documented divergence.
    assert pipeline["meta"]["total_leads"] == 2
    assert pipeline["meta"]["has_more"] is True


@pytest.mark.asyncio
async def test_move_lead_updates_stage_history_and_timeline(monkeypatch):
    now = datetime.now()
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
        # First contact recorded so the Acquire -> Qualify gate passes.
        first_contact_at=now - timedelta(days=2),
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
        created_at=datetime.now(),
        updated_at=datetime.now(),
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
async def test_move_lead_to_won_updates_closed_fields_and_triggers_automation(monkeypatch):
    now = datetime.utcnow()
    lead = SimpleNamespace(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        current_stage="Agreement",
        status=ProspectStatus.ACTIVE,
        assigned_to="user-1",
        assigned_by="user-2",
        created_at=now - timedelta(days=7),
        updated_at=now - timedelta(days=1),
        stage_entered_at=now - timedelta(days=4),
        stage_last_changed_at=now - timedelta(days=4),
        days_in_stage=4,
        closed_date=None,
        closed_by=None,
        reason_for_lost=None,
        won_amount=None,
        # Agreement signed so the Agreement -> Won gate passes.
        agreement_status="signed",
        saved=False,
    )

    deal = SimpleNamespace(
        id="deal-1",
        company_id="company-1",
        lead_id="lead-1",
        stage="proposal",
        updated_by=None,
        updated_by_name=None,
        updated_at=None,
        saved=False,
    )

    async def fake_save():
        lead.saved = True

    async def fake_deal_save():
        deal.saved = True

    async def fake_stage_documents(current_user):
        return [
            SimpleNamespace(id="stage-1", name="Agreement", order=5, is_default=False),
            SimpleNamespace(id="stage-2", name="Won", order=6, is_default=False),
        ]

    async def fake_get(lead_id):
        assert lead_id == "lead-1"
        return lead

    async def fake_find_one(query):
        assert query["company_id"] == "company-1"
        assert query["lead_id"] == "lead-1"
        return deal

    history_capture = {}
    timeline_events = []
    automation_capture = {}

    async def fake_insert(self):
        history_capture["item"] = self
        return self

    async def fake_publish(**kwargs):
        timeline_events.append(kwargs)
        return SimpleNamespace(event_name=kwargs["event_name"])

    async def fake_handle_won_deal_automation(current_user, lead_arg, deal_arg):
        automation_capture["lead_id"] = lead_arg.id
        automation_capture["deal_id"] = deal_arg.id
        return {"status": "completed", "client": SimpleNamespace(id="client-1")}

    lead.save = fake_save
    deal.save = fake_deal_save

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)
    monkeypatch.setattr("app.crm.pipeline.CRMDeal.find_one", fake_find_one)
    monkeypatch.setattr("app.crm.pipeline.handle_won_deal_automation", fake_handle_won_deal_automation)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN, first_name="Ada", last_name="Admin")
    result = await CRMPipelineService.move_lead(user, "lead-1", "Won", "closed successfully")

    assert lead.saved is True
    assert lead.current_stage == "Won"
    assert lead.status == ProspectStatus.WON
    assert lead.closed_by == "user-1"
    assert lead.closed_date is not None
    assert lead.won_status == "transferred"
    assert lead.current_stage_status == "transferred"
    assert lead.transferred_at is not None
    assert lead.transferred_by == "user-1"
    assert deal.saved is True
    assert deal.stage == "won"
    assert automation_capture == {"lead_id": "lead-1", "deal_id": "deal-1"}
    assert history_capture["item"].new_stage == "Won"
    assert history_capture["item"].reason == "closed successfully"
    assert [event["event_name"] for event in timeline_events] == ["LeadStageChanged"]
    assert result["automation"]["status"] == "completed"


@pytest.mark.asyncio
async def test_move_lead_to_lost_updates_reason_reminder_and_notification(monkeypatch):
    now = datetime.utcnow()
    lead = SimpleNamespace(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        current_stage="Negotiation",
        status=ProspectStatus.ACTIVE,
        assigned_to="user-1",
        assigned_by="user-2",
        created_at=now - timedelta(days=9),
        updated_at=now - timedelta(days=1),
        stage_entered_at=now - timedelta(days=5),
        stage_last_changed_at=now - timedelta(days=5),
        days_in_stage=5,
        closed_date=None,
        closed_by=None,
        reason_for_lost=None,
        saved=False,
    )

    async def fake_save():
        lead.saved = True

    async def fake_stage_documents(current_user):
        return [
            SimpleNamespace(id="stage-1", name="Negotiation", order=5, is_default=False),
            SimpleNamespace(id="stage-2", name="Lost", order=7, is_default=False),
        ]

    async def fake_get(lead_id):
        assert lead_id == "lead-1"
        return lead

    history_capture = {}
    timeline_events = []
    FakeActivity.last_created = None
    FakeNotification.last_created = None

    async def fake_insert_history(self):
        history_capture["item"] = self
        return self

    async def fake_publish(**kwargs):
        timeline_events.append(kwargs)
        return SimpleNamespace(event_name=kwargs["event_name"])

    lead.save = fake_save

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert_history)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)
    monkeypatch.setattr("app.crm.lost_workflow.publish_crm_timeline_event", fake_publish)
    monkeypatch.setattr("app.crm.lost_workflow.CRMActivity", FakeActivity)
    monkeypatch.setattr("app.crm.lost_workflow.Notification", FakeNotification)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN, first_name="Ada", last_name="Admin")
    result = await CRMPipelineService.move_lead(user, "lead-1", "Lost", "budget cut")

    assert lead.saved is True
    assert lead.current_stage == "Lost"
    assert lead.status == ProspectStatus.LOST
    assert lead.reason_for_lost == "budget cut"
    assert lead.closed_by == "user-1"
    assert lead.closed_date is not None
    assert history_capture["item"].new_stage == "Lost"
    assert history_capture["item"].reason == "budget cut"
    assert FakeActivity.last_created.title == "Nurture lost lead - Alpha Co"
    assert FakeNotification.last_created.message == "Alpha Co was moved to Lost and added to nurture."
    assert [event["event_name"] for event in timeline_events] == ["LeadLost", "LeadStageChanged"]
    assert result["automation"]["message"] == "Lost lead moved to nurture"


@pytest.mark.asyncio
async def test_reopen_lost_lead_resets_closed_state(monkeypatch):
    now = datetime.utcnow()
    lead = SimpleNamespace(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        current_stage="Lost",
        status=ProspectStatus.LOST,
        assigned_to="user-1",
        assigned_by="user-2",
        created_at=now - timedelta(days=12),
        updated_at=now - timedelta(days=1),
        stage_entered_at=now - timedelta(days=3),
        stage_last_changed_at=now - timedelta(days=3),
        days_in_stage=2,
        closed_date=now - timedelta(days=1),
        closed_by="user-9",
        reason_for_lost="budget cut",
        saved=False,
    )

    async def fake_get(lead_id):
        assert lead_id == "lead-1"
        return lead

    async def fake_stage_documents(current_user):
        return [{"name": "New", "order": 0, "is_default": True}]

    history_capture = {}
    timeline_events = []

    async def fake_insert(self):
        history_capture["item"] = self
        return self

    async def fake_publish(**kwargs):
        timeline_events.append(kwargs)
        return SimpleNamespace(event_name=kwargs["event_name"])

    async def fake_save():
        lead.saved = True

    lead.save = fake_save

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN, first_name="Ada", last_name="Admin")
    result = await CRMPipelineService.reopen_lost_lead(user, "lead-1", "re-engage")

    assert lead.saved is True
    assert lead.current_stage == "New"
    assert lead.status == ProspectStatus.ACTIVE
    assert lead.closed_date is None
    assert lead.closed_by is None
    assert lead.reason_for_lost is None
    assert history_capture["item"].new_stage == "New"
    assert history_capture["item"].payload["reopened_from"] == "lost"
    assert [event["event_name"] for event in timeline_events] == ["LeadReopened"]
    assert result["message"] == "Lost lead reopened successfully"


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


def _journey_lead(**overrides):
    now = datetime.utcnow()
    defaults = dict(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
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
        saved=False,
    )
    defaults.update(overrides)
    lead = SimpleNamespace(**defaults)

    async def fake_save():
        lead.saved = True

    lead.save = fake_save
    return lead


@pytest.mark.asyncio
async def test_acquire_cannot_move_to_qualify_before_first_contact(monkeypatch):
    lead = _journey_lead(first_contact_at=None)

    async def fake_stage_documents(current_user):
        return [
            {"name": "Acquire", "order": 0, "is_default": True, "aliases": ["new"]},
            {"name": "Qualify", "order": 1, "is_default": False, "aliases": ["contacted"]},
        ]

    async def fake_get(lead_id):
        return lead

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(user, "lead-1", "Qualify")
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "STAGE_TRANSITION_BLOCKED"
    assert exc_info.value.detail["severity"] == "warning"
    assert "first contact" in exc_info.value.detail["message"]
    assert exc_info.value.detail["action_requirement"]["field"] == "first_contact"
    assert exc_info.value.detail["target_stage"] == "Qualify"
    # The same lead, once a contact is recorded, may move to Qualify.
    lead.first_contact_at = datetime.utcnow()

    history_capture = {}

    async def fake_insert(self):
        history_capture["item"] = self
        return self

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)
    result = await CRMPipelineService.move_lead(user, "lead-1", "Qualify")
    assert result["lead"]["current_stage"] == "Qualify"
    assert history_capture["item"].new_stage == "Qualify"


async def _acquire_gate_mocks(monkeypatch, lead):
    """Shared fakes for Acquire -> Qualify move tests."""

    async def fake_stage_documents(current_user):
        return [
            {"name": "Acquire", "order": 0, "is_default": True, "aliases": ["new"]},
            {"name": "Qualify", "order": 1, "is_default": False, "aliases": ["contacted"]},
        ]

    async def fake_get(lead_id):
        return lead

    async def fake_insert(self):
        return self

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)


@pytest.mark.asyncio
async def test_acquire_moves_to_qualify_with_last_contacted_evidence(monkeypatch):
    # A lead that already has contact history (last_contacted_at set) but no
    # explicit first_contact_at must NOT be blocked by the first-contact gate.
    lead = _journey_lead(first_contact_at=None, last_contacted_at=datetime.utcnow())
    await _acquire_gate_mocks(monkeypatch, lead)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    result = await CRMPipelineService.move_lead(user, "lead-1", "Qualify")
    assert result["lead"]["current_stage"] == "Qualify"


@pytest.mark.asyncio
async def test_acquire_moves_to_qualify_with_phone_number_only(monkeypatch):
    # The reported bug: a lead that already carries a mobile number (e.g. a CSV
    # import) but has no contact timestamps/activity was still blocked by the
    # first-contact gate. A recorded phone is contact evidence — the gate passes.
    lead = _journey_lead(first_contact_at=None, last_contacted_at=None, phone="9999999999")
    await _acquire_gate_mocks(monkeypatch, lead)

    async def fake_find_one(query=None):
        return None  # no recorded activity

    monkeypatch.setattr("app.crm.pipeline.CRMActivity.find_one", fake_find_one)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    result = await CRMPipelineService.move_lead(user, "lead-1", "Qualify")
    assert result["lead"]["current_stage"] == "Qualify"


@pytest.mark.asyncio
async def test_acquire_blocked_without_phone_returns_phone_missing_field(monkeypatch):
    # No phone, no timestamps, no activity: the blocker must list the phone as a
    # missing editable field so the frontend opens the popup asking for the
    # mobile number (alongside the first-contact action requirement).
    lead = _journey_lead(first_contact_at=None, last_contacted_at=None)
    await _acquire_gate_mocks(monkeypatch, lead)

    async def fake_find_one(query=None):
        return None

    monkeypatch.setattr("app.crm.pipeline.CRMActivity.find_one", fake_find_one)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(user, "lead-1", "Qualify")
    assert exc_info.value.status_code == 400
    detail = exc_info.value.detail
    assert detail["code"] == "STAGE_TRANSITION_BLOCKED"
    assert {item["field"] for item in detail["missing_fields"]} == {"phone"}
    assert detail["action_requirement"]["field"] == "first_contact"


@pytest.mark.asyncio
async def test_acquire_moves_to_qualify_with_recorded_call_activity(monkeypatch):
    # A lead with a recorded call activity (no timestamps on the lead itself)
    # also satisfies the first-contact requirement.
    lead = _journey_lead(first_contact_at=None, last_contacted_at=None)
    await _acquire_gate_mocks(monkeypatch, lead)

    async def fake_find_one(query=None):
        if query and query.get("entity_type") == "lead":
            return SimpleNamespace(id="activity-1")
        return None

    monkeypatch.setattr("app.crm.pipeline.CRMActivity.find_one", fake_find_one)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    result = await CRMPipelineService.move_lead(user, "lead-1", "Qualify")
    assert result["lead"]["current_stage"] == "Qualify"


@pytest.mark.asyncio
async def test_acquire_still_blocked_without_any_contact_evidence(monkeypatch):
    lead = _journey_lead(first_contact_at=None, last_contacted_at=None)
    await _acquire_gate_mocks(monkeypatch, lead)

    async def fake_find_one(query=None):
        return None

    monkeypatch.setattr("app.crm.pipeline.CRMActivity.find_one", fake_find_one)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(user, "lead-1", "Qualify")
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "STAGE_TRANSITION_BLOCKED"
    assert exc_info.value.detail["action_requirement"]["field"] == "first_contact"
    # The popup-triggering contract: a phone-less lead is told exactly what to
    # add (the mobile number), not just that a contact attempt is missing.
    assert {item["field"] for item in exc_info.value.detail["missing_fields"]} == {"phone"}
    assert exc_info.value.detail["missing_fields"][0]["label"] == "Mobile Number"


@pytest.mark.asyncio
async def test_qualify_cannot_move_to_discovery_without_interest_budget_decision_maker(monkeypatch):
    lead = _journey_lead(current_stage="Qualify", qualify_status="contacted", budget=None, decision_maker=None)

    async def fake_stage_documents(current_user):
        return [
            {"name": "Qualify", "order": 1, "is_default": False, "aliases": ["contacted"]},
            {"name": "Discovery", "order": 2, "is_default": False},
        ]

    async def fake_get(lead_id):
        return lead

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(user, "lead-1", "Discovery")
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "STAGE_TRANSITION_BLOCKED"
    assert "missing" in exc_info.value.detail["message"]
    # Budget and decision maker are editable details; interest is a status requirement.
    assert {item["field"] for item in exc_info.value.detail["missing_fields"]} == {"budget", "decision_maker"}
    assert exc_info.value.detail["status_requirement"]["field"] == "qualify_status"

    lead.qualify_status = "interested"
    lead.budget = 250000
    lead.decision_maker = "Priya Shah"
    lead.saved = False

    async def fake_insert(self):
        return self

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)
    result = await CRMPipelineService.move_lead(user, "lead-1", "Discovery")
    assert result["lead"]["current_stage"] == "Discovery"


@pytest.mark.asyncio
async def test_qualify_moves_to_discovery_when_budget_only_missing_but_has_deal_value(monkeypatch):
    # The lead-detail header edit writes won_amount ("Deal value"), the overview
    # writes budget. A lead carrying a recorded deal value must never be asked to
    # fill a separate Budget field — the gate accepts both as budget evidence.
    lead = _journey_lead(
        current_stage="Qualify",
        qualify_status="interested",
        budget=None,
        decision_maker="Priya Shah",
        won_amount=450000,
    )

    async def fake_stage_documents(current_user):
        return [
            {"name": "Qualify", "order": 1, "is_default": False, "aliases": ["contacted"]},
            {"name": "Discovery", "order": 2, "is_default": False},
        ]

    async def fake_get(lead_id):
        return lead

    async def fake_insert(self):
        return self

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    result = await CRMPipelineService.move_lead(user, "lead-1", "Discovery")
    assert result["lead"]["current_stage"] == "Discovery"


@pytest.mark.asyncio
async def test_discovery_moves_to_proposal_with_need_proposal_outcome(monkeypatch):
    # Canonical path: a "need_proposal" Discovery outcome still passes the gate.
    lead = _journey_lead(current_stage="Discovery", discovery_outcome="need_proposal")

    async def fake_stage_documents(current_user):
        return [
            {"name": "Discovery", "order": 2, "is_default": False},
            {"name": "Proposal", "order": 3, "is_default": False},
        ]

    async def fake_get(lead_id):
        return lead

    async def fake_insert(self):
        return self

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    result = await CRMPipelineService.move_lead(user, "lead-1", "Proposal")
    assert result["lead"]["current_stage"] == "Proposal"


@pytest.mark.asyncio
async def test_discovery_moves_to_proposal_with_qualified_outcome(monkeypatch):
    # The reported bug: a lead whose Discovery outcome is "qualified" (a valid
    # Discovery inner status) was still blocked from moving to Proposal, which
    # only accepted "need_proposal". A qualified discovery also earns a proposal.
    lead = _journey_lead(current_stage="Discovery", discovery_outcome="qualified")

    async def fake_stage_documents(current_user):
        return [
            {"name": "Discovery", "order": 2, "is_default": False},
            {"name": "Proposal", "order": 3, "is_default": False},
        ]

    async def fake_get(lead_id):
        return lead

    async def fake_insert(self):
        return self

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    result = await CRMPipelineService.move_lead(user, "lead-1", "Proposal")
    assert result["lead"]["current_stage"] == "Proposal"


@pytest.mark.asyncio
async def test_discovery_blocked_to_proposal_without_ready_outcome(monkeypatch):
    # A non-ready Discovery outcome blocks the move and the status requirement
    # advertises BOTH accepted outcomes so the frontend warning lists them.
    lead = _journey_lead(current_stage="Discovery", discovery_outcome="need_audit")

    async def fake_stage_documents(current_user):
        return [
            {"name": "Discovery", "order": 2, "is_default": False},
            {"name": "Proposal", "order": 3, "is_default": False},
        ]

    async def fake_get(lead_id):
        return lead

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(user, "lead-1", "Proposal")
    assert exc_info.value.status_code == 400
    detail = exc_info.value.detail
    assert detail["code"] == "STAGE_TRANSITION_BLOCKED"
    assert detail["status_requirement"]["field"] == "discovery_outcome"
    assert detail["status_requirement"]["allowed_values"] == ["need_proposal", "qualified"]
    assert detail["status_requirement"]["current_value"] == "need_audit"


@pytest.mark.asyncio
async def test_agreement_cannot_move_to_won_before_signature(monkeypatch):
    lead = _journey_lead(current_stage="Agreement", agreement_status="sent")

    async def fake_stage_documents(current_user):
        return [
            {"name": "Agreement", "order": 5, "is_default": False},
            {"name": "Won", "order": 6, "is_default": False},
        ]

    async def fake_get(lead_id):
        return lead

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.EMPLOYEE)
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(user, "lead-1", "Won")
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "STAGE_TRANSITION_BLOCKED"
    assert "agreement must be signed" in exc_info.value.detail["message"]
    assert exc_info.value.detail["status_requirement"]["field"] == "agreement_status"
    assert exc_info.value.detail["status_requirement"]["allowed_values"] == ["signed"]

    lead.agreement_status = "signed"
    lead.saved = False

    async def fake_insert(self):
        return self

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    async def fake_run_won_automation(current_user, prospect, company_id):
        return {"status": "completed", "client_id": None, "project_id": None}

    async def fake_find_one(query):
        return None

    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)
    monkeypatch.setattr("app.crm.pipeline._run_won_automation", fake_run_won_automation)
    monkeypatch.setattr("app.crm.pipeline.CRMDeal.find_one", fake_find_one)
    with pytest.raises(HTTPException) as conversion_exc:
        await CRMPipelineService.move_lead(user, "lead-1", "Won")
    assert conversion_exc.value.status_code == 400
    assert "Won lead conversion failed" in conversion_exc.value.detail


@pytest.mark.asyncio
async def test_manager_can_force_past_stage_gate_but_not_skip_stages(monkeypatch):
    # Manager force bypasses the first-contact gate.
    lead = _journey_lead(first_contact_at=None)

    async def fake_stage_documents(current_user):
        return [
            {"name": "Acquire", "order": 0, "is_default": True, "aliases": ["new"]},
            {"name": "Qualify", "order": 1, "is_default": False, "aliases": ["contacted"]},
        ]

    async def fake_get(lead_id):
        return lead

    async def fake_insert(self):
        return self

    async def fake_publish(**kwargs):
        return SimpleNamespace(event_name=kwargs["event_name"])

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.pipeline.SalesPipelineHistory.insert", fake_insert)
    monkeypatch.setattr("app.crm.pipeline.publish_crm_timeline_event", fake_publish)

    manager = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.MANAGER)
    result = await CRMPipelineService.move_lead(manager, "lead-1", "Qualify", force=True)
    assert result["lead"]["current_stage"] == "Qualify"

    # Even a manager cannot skip a stage: Acquire -> Proposal is illegal.
    lead2 = _journey_lead(id="lead-2")

    async def fake_get2(lead_id):
        return lead2

    async def fake_stage_documents_with_proposal(current_user):
        return [
            {"name": "Acquire", "order": 0, "is_default": True, "aliases": ["new"]},
            {"name": "Qualify", "order": 1, "is_default": False, "aliases": ["contacted"]},
            {"name": "Proposal", "order": 3, "is_default": False},
        ]

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get2)
    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents_with_proposal)
    with pytest.raises(HTTPException) as exc_info:
        await CRMPipelineService.move_lead(manager, "lead-2", "Proposal", force=True)
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "STAGE_TRANSITION_BLOCKED"
    assert "skip stages" in exc_info.value.detail["message"]
    assert exc_info.value.detail["action_requirement"]["field"] == "stage_sequence"


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
            transitioned_at=datetime.now(),
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



# ── Acquire inner status: an owned lead is Assigned ───────────────────────────


def test_resolved_stage_status_marks_owned_acquire_lead_assigned():
    # Reported bug: leads in the Acquire stage list showed "New" (the intake
    # default) even though they were assigned to someone. Any owned Acquire lead
    # must resolve to "assigned" so every surface (stage list, board, lead
    # detail, status API) reads the same value.
    owned = _journey_lead(current_stage="Acquire", assigned_to="user-1", current_stage_status="new")
    assert resolved_stage_status(owned) == "assigned"
    owned.current_stage_status = "imported"
    assert resolved_stage_status(owned) == "assigned"
    owned.current_stage_status = None
    assert resolved_stage_status(owned) == "assigned"
    # Explicit non-default statuses are preserved.
    owned.current_stage_status = "duplicate"
    assert resolved_stage_status(owned) == "duplicate"
    owned.current_stage_status = "spam"
    assert resolved_stage_status(owned) == "spam"
    # Un-owned leads keep their intake default.
    unowned = _journey_lead(current_stage="Acquire", assigned_to=None, current_stage_status="new")
    assert resolved_stage_status(unowned) == "new"


def test_serialize_lead_surfaces_assigned_status_for_owned_acquire_lead():
    lead = _journey_lead(current_stage="Acquire", assigned_to="user-1", current_stage_status="new")
    serialized = _serialize_lead(lead, "Acquire")
    assert serialized["current_stage_status"] == "assigned"


@pytest.mark.asyncio
async def test_load_pipeline_serializes_owned_acquire_leads_as_assigned(monkeypatch):
    # End-to-end: the stage list Status column reads the serialized
    # current_stage_status, so the pipeline response itself must say "assigned"
    # for an owned Acquire lead that still carries the old "new" snapshot.
    stages = [
        SimpleNamespace(id="stage-1", name="Acquire", order=0, is_default=True),
        SimpleNamespace(id="stage-2", name="Qualify", order=1, is_default=False),
    ]
    prospects = [
        SimpleNamespace(
            id="lead-1",
            prospect_name="Alpha Co",
            company_name="Alpha",
            contact_id=None,
            assigned_to="user-1",
            assigned_by="user-2",
            current_stage="Acquire",
            status=ProspectStatus.ACTIVE,
            phone=None,
            country_code=None,
            email=None,
            tag=[],
            remark=None,
            won_amount=None,
            reason_for_lost=None,
            created_at=datetime.utcnow() - timedelta(days=5),
            updated_at=datetime.utcnow() - timedelta(days=1),
            stage_entered_at=datetime.utcnow() - timedelta(days=3),
            stage_last_changed_at=datetime.utcnow() - timedelta(days=3),
            days_in_stage=3,
            current_stage_status="new",
            stage_status_history=[],
        ),
    ]

    class FakePipelineQuery(FakeQuery):
        pass

    def fake_find(query):
        return FakePipelineQuery(prospects)

    async def fake_stage_documents(current_user):
        return stages

    monkeypatch.setattr("app.crm.pipeline._load_stage_documents", fake_stage_documents)
    monkeypatch.setattr("app.crm.pipeline.SalesProspect.find", fake_find)
    monkeypatch.setattr("app.crm.pipeline.User.find", lambda query: FakeBeanieQuery([]))
    monkeypatch.setattr("app.crm.pipeline.CRMCompany.find", lambda query: FakeBeanieQuery([]))

    user = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN)
    result = await CRMPipelineService.load_pipeline(user)
    acquire_leads = result["leads_by_stage"]["Acquire"]
    assert acquire_leads[0]["current_stage_status"] == "assigned"


# ── Bulk assign (Acquire multi-select) ────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_assign_assigns_selected_leads_and_promotes_acquire_status(monkeypatch):
    lead_1 = _journey_lead(id="lead-1", current_stage="Acquire", assigned_to="user-1", current_stage_status="new")
    lead_2 = _journey_lead(id="lead-2", current_stage="Acquire", assigned_to=None, current_stage_status=None)
    by_id = {"lead-1": lead_1, "lead-2": lead_2}

    async def fake_get(lead_id):
        return by_id.get(lead_id)

    transfers = []

    class FakeOwnershipTransfer:
        def __init__(self, **kwargs):
            transfers.append(kwargs)

        async def insert(self):
            return self

    async def fake_validate(current_user, target_user_id, **kwargs):
        return SimpleNamespace(id=target_user_id), []

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.validate_target_user", fake_validate)
    monkeypatch.setattr("app.models.ownership_transfer.OwnershipTransfer", FakeOwnershipTransfer)

    user = SimpleNamespace(id="user-9", company_id="company-1", role=UserRole.ADMIN)
    result = await CRMPipelineService.bulk_assign(user, ["lead-1", "lead-2"], "user-2")

    assert result["assigned_count"] == 2
    assert result["skipped_count"] == 0
    assert result["target_user_id"] == "user-2"
    assert lead_1.assigned_to == "user-2"
    assert lead_2.assigned_to == "user-2"
    # Owned Acquire leads are promoted to the Assigned inner status.
    assert lead_1.current_stage_status == "assigned"
    assert lead_2.current_stage_status == "assigned"
    # An ownership-transfer record is created for the changed assignee.
    assert len(transfers) == 2
    assert transfers[0]["entity_id"] == "lead-1"
    assert transfers[0]["to_user_id"] == "user-2"
    assert transfers[1]["entity_id"] == "lead-2"
    assert transfers[1]["from_user_id"] is None


@pytest.mark.asyncio
async def test_bulk_assign_skips_transferred_leads(monkeypatch):
    transferred = _journey_lead(
        id="lead-2", current_stage="Acquire", assigned_to="user-1", transferred_at=datetime.utcnow()
    )
    by_id = {"lead-2": transferred}

    async def fake_get(lead_id):
        return by_id.get(lead_id)

    class FakeOwnershipTransfer:
        def __init__(self, **kwargs):
            pass

        async def insert(self):
            return self

    async def fake_validate(current_user, target_user_id, **kwargs):
        return SimpleNamespace(id=target_user_id), []

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.validate_target_user", fake_validate)
    monkeypatch.setattr("app.models.ownership_transfer.OwnershipTransfer", FakeOwnershipTransfer)

    user = SimpleNamespace(id="user-9", company_id="company-1", role=UserRole.ADMIN)
    result = await CRMPipelineService.bulk_assign(user, ["lead-2"], "user-2")

    assert result["assigned_count"] == 0
    assert result["skipped_count"] == 1
    assert result["skipped"][0]["reason"] == "Lead transferred to Clients"


@pytest.mark.asyncio
async def test_bulk_assign_skips_leads_the_employee_cannot_write(monkeypatch):
    # An EMPLOYEE may only reassign leads they own; lead-3 belongs to someone else.
    not_mine = _journey_lead(id="lead-3", current_stage="Acquire", assigned_to="other-user", current_stage_status="new")
    by_id = {"lead-3": not_mine}

    async def fake_get(lead_id):
        return by_id.get(lead_id)

    class FakeOwnershipTransfer:
        def __init__(self, **kwargs):
            pass

        async def insert(self):
            return self

    async def fake_validate(current_user, target_user_id, **kwargs):
        return SimpleNamespace(id=target_user_id), []

    monkeypatch.setattr("app.crm.pipeline.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.validate_target_user", fake_validate)
    monkeypatch.setattr("app.models.ownership_transfer.OwnershipTransfer", FakeOwnershipTransfer)

    user = SimpleNamespace(id="user-9", company_id="company-1", role=UserRole.EMPLOYEE)
    result = await CRMPipelineService.bulk_assign(user, ["lead-3"], "user-2")

    assert result["assigned_count"] == 0
    assert result["skipped_count"] == 1
    assert result["skipped"][0]["reason"] == "No permission to update this lead"
