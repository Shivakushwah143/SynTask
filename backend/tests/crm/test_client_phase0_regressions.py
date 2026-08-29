from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.clients import _client_commercial_fields
from app.crm.client_workspace import ClientWorkspaceService
from app.crm import client_onboarding
from app.crm.client_identity import ClientCompanyResolution, load_contacts_for_client, resolve_crm_company_for_client
from app.crm import client_lifecycle
from app.crm.client_lifecycle import normalize_client_status, transition_client_status
from app.crm.deal_automation import _resolve_client, handle_won_deal_automation
from app.crm.client_services import serialize_client_service, set_client_contact_roles
from app.crm.client_deliverables import ALLOWED_DELIVERABLE_TRANSITIONS, serialize_deliverable
from app.crm.client_activity import build_client_activity, load_client_communications
from app.models.client import Client, ClientStatus, ClientType
from app.models.client_deliverable import ClientApprovalStatus, ClientDeliverableStatus
from app.models.client_service import ClientServiceStatus
from app.models.invoice import InvoiceStatus, InvoiceType
from app.models.meeting import MeetingStatus
from app.models.sales_prospect import ProspectStatus
from app.models.task import TaskPriority, TaskStatus
from app.models.user import UserRole
from scripts.backfill_client_crm_company_links import _resolve as resolve_backfill_client


class FakeQuery:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, *_args, **_kwargs):
        return self

    def skip(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    async def to_list(self, *args, **kwargs):
        return self.items

    async def count(self):
        return len(self.items)


class FakeCollection:
    def __init__(self, items):
        self.items = list(items)

    async def find_one(self, query):
        matches = await self.find(query).to_list()
        return matches[0] if matches else None

    def find(self, query):
        def matches(item):
            for key, expected in query.items():
                if key == "$or":
                    if not any(matches({**item, "__query__": branch}) for branch in expected):
                        return False
                    continue
                if key == "__query__":
                    return matches(expected)
                if isinstance(expected, dict) and "$type" in expected:
                    if expected["$type"] == "string" and not isinstance(item.get(key), str):
                        return False
                    continue
                if isinstance(expected, dict) and "$regex" in expected:
                    if not re.search(expected["$regex"], str(item.get(key) or ""), re.I if expected.get("$options") == "i" else 0):
                        return False
                    continue
                if item.get(key) != expected:
                    return False
            return True

        import re

        return FakeQuery([item for item in self.items if matches(item)])


def _user(company_id="tenant-1", role=UserRole.ADMIN):
    return SimpleNamespace(
        id="0000000000000000000000a1",
        company_id=company_id,
        role=role,
        first_name="Ada",
        last_name="Admin",
    )


def _client(**overrides):
    now = datetime.utcnow()
    data = dict(
        id="0000000000000000000000c1",
        name="Acme",
        company_id="tenant-1",
        email="ops@acme.test",
        contact="123",
        alternate_contact=None,
        address=None,
        city=None,
        state=None,
        country=None,
        zip_code=None,
        company_name="Acme Inc",
        industry=None,
        status=ClientStatus.ACTIVE,
        crm_company_id=None,
        source_lead_id=None,
        account_owner_id=None,
        sales_owner_id=None,
        assigned_to="0000000000000000000000a1",
        notes=None,
        lifecycle_metadata={},
        tags=[],
        project_ids=[],
        projects_budget={},
        projects_start_date={},
        projects_delivery_date={},
        documents=[],
        client_type=None,
        budget=None,
        start_date=None,
        delivery_date=None,
        created_at=now,
        updated_at=now,
        created_by="0000000000000000000000a1",
    )
    data.update(overrides)
    client = SimpleNamespace(**data)

    async def save():
        client.saved = True

    client.save = save
    return client


def _project(**overrides):
    now = datetime.utcnow()
    data = dict(
        id="0000000000000000000000b1",
        project_id="PROJ-1",
        name="Acme Delivery",
        key="ACME",
        description=None,
        status=SimpleNamespace(value="active"),
        client_id="0000000000000000000000c1",
        lead_id="0000000000000000000000d1",
        assigned_to="0000000000000000000000a1",
        category="Custom",
        budget=None,
        folders=[],
        milestones=[],
        board_columns=[],
        team_member_ids=[],
        start_date=now,
        delivery_date=now + timedelta(days=30),
        company_id="tenant-1",
        updated_at=now,
        created_at=now,
    )
    data.update(overrides)
    project = SimpleNamespace(**data)

    async def save():
        project.saved = True

    project.save = save
    return project


def _task(**overrides):
    now = datetime.utcnow()
    data = dict(
        id="0000000000000000000000e1",
        title="Kickoff task",
        status=TaskStatus.TODO,
        priority=TaskPriority.HIGH,
        assigned_to="0000000000000000000000a1",
        project_id="PROJ-1",
        project_object_id="0000000000000000000000b1",
        due_date=now + timedelta(days=7),
        created_at=now,
        updated_at=now,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _meeting(**overrides):
    now = datetime.utcnow()
    data = dict(
        id="0000000000000000000000f1",
        title="Kickoff - Acme",
        description="Kickoff meeting for Acme Delivery",
        status=MeetingStatus.SCHEDULED,
        meeting_date=now + timedelta(days=2),
        meeting_time="10:00",
        duration=60,
        host_id="0000000000000000000000a1",
        participant_ids=["0000000000000000000000a1"],
        created_at=now,
        updated_at=now,
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def _lead(**overrides):
    now = datetime.utcnow()
    data = dict(
        id="0000000000000000000000d1",
        prospect_name="Acme buyer",
        company_id="tenant-1",
        company_name="Acme Inc",
        crm_company_id="0000000000000000000000aa",
        client_id="0000000000000000000000c1",
        current_stage="Won",
        status=ProspectStatus.WON,
        assigned_to="0000000000000000000000a1",
        assigned_by="0000000000000000000000a1",
        closed_by="0000000000000000000000a1",
        reason_for_lost=None,
        won_amount=5000,
        phone="123",
        email="buyer@acme.test",
        contact_id=None,
        remark=None,
        tag=[],
        source="custom",
        relationship_type=None,
        category_id=None,
        created_at=now,
        updated_at=now,
    )
    data.update(overrides)
    lead = SimpleNamespace(**data)

    async def save():
        lead.saved = True

    lead.save = save
    return lead


def _empty_items(*_args, **_kwargs):
    return FakeQuery([])


async def _no_contacts(_client):
    return []


async def _no_lead(_client):
    return None


async def _no_projects(_client):
    return []


async def _no_kickoff(_client):
    return None


async def _no_contract(*_args):
    return None


def _item_status(item):
    return item["status"].value if hasattr(item["status"], "value") else item["status"]


@pytest.mark.asyncio
async def test_onboarding_commercial_requires_payment_terms_not_budget_only(monkeypatch):
    client = _client(status=ClientStatus.ONBOARDING, budget=5000, lifecycle_metadata={"onboarding": {"commercial": {"deal_value": 5000, "billing_frequency": "monthly", "engagement_start_date": "2026-09-01"}}})
    async def source_lead(_client):
        return _lead(payment_terms=None)
    monkeypatch.setattr(client_onboarding, "load_contacts_for_client", _no_contacts)
    monkeypatch.setattr(client_onboarding, "_source_lead_for_client", source_lead)
    monkeypatch.setattr(client_onboarding, "_projects_for_client", _no_projects)
    monkeypatch.setattr(client_onboarding, "_kickoff_for_client", _no_kickoff)
    monkeypatch.setattr(client_onboarding, "_contract_for_client", _no_contract)
    monkeypatch.setattr(client_onboarding.ClientOnboardingItem, "find", _empty_items)

    items = await client_onboarding.calculate_onboarding_items(client)
    payment = next(item for item in items if item["key"] == "payment_terms")

    assert _item_status(payment) != "confirmed"
    assert payment["completion_percent"] < 100


@pytest.mark.asyncio
async def test_onboarding_primary_contact_requires_crm_contact(monkeypatch):
    client = _client(status=ClientStatus.ONBOARDING, email="person@acme.test", contact="123")
    monkeypatch.setattr(client_onboarding, "load_contacts_for_client", _no_contacts)
    monkeypatch.setattr(client_onboarding, "_source_lead_for_client", _no_lead)
    monkeypatch.setattr(client_onboarding, "_projects_for_client", _no_projects)
    monkeypatch.setattr(client_onboarding, "_kickoff_for_client", _no_kickoff)
    monkeypatch.setattr(client_onboarding, "_contract_for_client", _no_contract)
    monkeypatch.setattr(client_onboarding.ClientOnboardingItem, "find", _empty_items)

    items = await client_onboarding.calculate_onboarding_items(client)
    primary = next(item for item in items if item["key"] == "primary_contact")

    assert _item_status(primary) == "missing"
    assert primary["linked_entity_id"] is None


@pytest.mark.asyncio
async def test_onboarding_requirements_ignore_legacy_notes_and_calculate_partial(monkeypatch):
    client = _client(status=ClientStatus.ONBOARDING, notes="legacy", lifecycle_metadata={"onboarding": {"requirements": {"business_objective": "Grow", "scope": "Launch"}}})
    monkeypatch.setattr(client_onboarding, "load_contacts_for_client", _no_contacts)
    monkeypatch.setattr(client_onboarding, "_source_lead_for_client", _no_lead)
    monkeypatch.setattr(client_onboarding, "_projects_for_client", _no_projects)
    monkeypatch.setattr(client_onboarding, "_kickoff_for_client", _no_kickoff)
    monkeypatch.setattr(client_onboarding, "_contract_for_client", _no_contract)
    monkeypatch.setattr(client_onboarding.ClientOnboardingItem, "find", _empty_items)

    items = await client_onboarding.calculate_onboarding_items(client)
    requirements = next(item for item in items if item["key"] == "requirements")

    assert _item_status(requirements) == "partially_received"
    assert requirements["completion_percent"] == 40


@pytest.mark.asyncio
async def test_onboarding_assets_and_access_ignore_documents_and_notes(monkeypatch):
    client = _client(status=ClientStatus.ONBOARDING, documents=[{"type": "agreement"}], notes="has access")
    monkeypatch.setattr(client_onboarding, "load_contacts_for_client", _no_contacts)
    monkeypatch.setattr(client_onboarding, "_source_lead_for_client", _no_lead)
    monkeypatch.setattr(client_onboarding, "_projects_for_client", _no_projects)
    monkeypatch.setattr(client_onboarding, "_kickoff_for_client", _no_kickoff)
    monkeypatch.setattr(client_onboarding, "_contract_for_client", _no_contract)
    monkeypatch.setattr(client_onboarding.ClientOnboardingItem, "find", _empty_items)

    items = await client_onboarding.calculate_onboarding_items(client)
    assets = next(item for item in items if item["key"] == "brand_assets")
    access = next(item for item in items if item["key"] == "required_access")

    assert _item_status(assets) == "missing"
    assert _item_status(access) == "missing"


@pytest.mark.asyncio
async def test_onboarding_start_date_alone_does_not_make_readiness_ready(monkeypatch):
    client = _client(status=ClientStatus.ONBOARDING, start_date=datetime.utcnow())
    monkeypatch.setattr(client_onboarding, "load_contacts_for_client", _no_contacts)
    monkeypatch.setattr(client_onboarding, "_source_lead_for_client", _no_lead)
    monkeypatch.setattr(client_onboarding, "_projects_for_client", _no_projects)
    monkeypatch.setattr(client_onboarding, "_kickoff_for_client", _no_kickoff)
    monkeypatch.setattr(client_onboarding, "_contract_for_client", _no_contract)
    monkeypatch.setattr(client_onboarding.ClientOnboardingItem, "find", _empty_items)

    items = await client_onboarding.calculate_onboarding_items(client)
    readiness = next(item for item in items if item["key"] == "start_readiness")

    assert _item_status(readiness) == "not_started"
    assert readiness["completion_percent"] == 0


@pytest.mark.asyncio
async def test_client_workspace_enforces_tenant_isolation(monkeypatch):
    client = _client(company_id="tenant-2")

    async def client_get(_id):
        return client

    monkeypatch.setattr("app.crm.client_workspace.Client.get", client_get)

    with pytest.raises(HTTPException) as exc:
        await ClientWorkspaceService.load_workspace(_user(company_id="tenant-1"), str(client.id))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_won_deal_client_creation_uses_lead_tenant_and_company(monkeypatch):
    created = []
    lead = _lead(client_id=None)

    class FakeClientModel:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "0000000000000000000000c2"

        @staticmethod
        async def find_one(query):
            assert query["company_id"] == lead.company_id
            assert query["deleted"] == {"$ne": True}
            return None

        async def insert(self):
            created.append(self)
            return None

    monkeypatch.setattr("app.crm.deal_automation.Client", FakeClientModel)
    async def resolve_lead_company(_lead):
        return ClientCompanyResolution(
            SimpleNamespace(id="0000000000000000000000aa", company_id="tenant-1", name="Acme Inc"),
            "resolved",
            "test",
        )

    monkeypatch.setattr("app.crm.deal_automation.resolve_crm_company_for_lead", resolve_lead_company)

    client = await _resolve_client(_user(), lead, deal=None)

    assert client in created
    assert client.company_id == lead.company_id
    assert client.company_name == lead.company_name
    assert client.email == lead.email
    assert client.status == ClientStatus.NEW
    assert client.crm_company_id == "0000000000000000000000aa"
    assert client.source_lead_id == str(lead.id)
    assert client.account_owner_id == lead.assigned_to
    assert client.sales_owner_id == lead.assigned_to
    assert client.client_type == ClientType.ONE_TIME
    assert client.budget == lead.won_amount
    assert client.start_date is not None


@pytest.mark.asyncio
async def test_client_resolves_canonical_crm_company_and_contacts(monkeypatch):
    client = _client(crm_company_id="0000000000000000000000aa")
    crm_company = SimpleNamespace(id="0000000000000000000000aa", company_id="tenant-1", deleted=False, name="Acme Inc")
    contact = SimpleNamespace(id="0000000000000000000000a5", crm_company_id=str(crm_company.id), company_id="tenant-1", deleted=False)
    captured = {}

    async def company_get(company_id):
        assert company_id == str(crm_company.id)
        return crm_company

    def contact_find(query):
        captured["contact_query"] = query
        return FakeQuery([contact])

    monkeypatch.setattr("app.crm.client_identity.CRMCompany.get", company_get)
    monkeypatch.setattr("app.crm.client_identity.SalesContact.find", contact_find)

    resolution = await resolve_crm_company_for_client(client)
    contacts = await load_contacts_for_client(client)

    assert resolution.crm_company is crm_company
    assert resolution.reason == "client.crm_company_id"
    assert contacts == [contact]
    assert captured["contact_query"] == {
        "company_id": client.company_id,
        "crm_company_id": str(crm_company.id),
        "deleted": False,
    }


@pytest.mark.asyncio
async def test_client_company_resolution_rejects_cross_tenant_canonical_id(monkeypatch):
    client = _client(crm_company_id="0000000000000000000000aa")
    crm_company = SimpleNamespace(id="0000000000000000000000aa", company_id="tenant-2", deleted=False, name="Acme Inc")

    async def company_get(_company_id):
        return crm_company

    monkeypatch.setattr("app.crm.client_identity.CRMCompany.get", company_get)

    resolution = await resolve_crm_company_for_client(client)

    assert resolution.crm_company is None
    assert resolution.status == "unresolved"


@pytest.mark.asyncio
async def test_client_company_resolution_does_not_link_ambiguous_name(monkeypatch):
    client = _client(crm_company_id=None, source_lead_id=None)
    companies = [
        SimpleNamespace(id="0000000000000000000000a1", company_id="tenant-1", deleted=False, name="Acme Inc"),
        SimpleNamespace(id="0000000000000000000000a2", company_id="tenant-1", deleted=False, name="Acme Inc"),
    ]

    monkeypatch.setattr("app.crm.client_identity.SalesProspect.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_identity.CRMCompany.find", lambda query: FakeQuery(companies))

    resolution = await resolve_crm_company_for_client(client)

    assert resolution.crm_company is None
    assert resolution.status == "ambiguous"


@pytest.mark.asyncio
async def test_backfill_resolution_is_idempotent_for_existing_link():
    client = {"_id": "client-1", "company_id": "tenant-1", "crm_company_id": "company-1"}
    database = {
        "crm_companies": FakeCollection([{"_id": "company-1", "company_id": "tenant-1", "deleted": False, "name": "Acme Inc"}]),
        "sales_prospects": FakeCollection([]),
        "sales_contacts": FakeCollection([]),
    }

    status, company_id, reason = await resolve_backfill_client(database, client)

    assert status == "already_linked"
    assert company_id == "company-1"
    assert reason == "client.crm_company_id"


@pytest.mark.asyncio
async def test_backfill_resolution_never_cross_links_tenants():
    client = {"_id": "client-1", "company_id": "tenant-1", "crm_company_id": "company-1"}
    database = {
        "crm_companies": FakeCollection([{"_id": "company-1", "company_id": "tenant-2", "deleted": False, "name": "Acme Inc"}]),
        "sales_prospects": FakeCollection([]),
        "sales_contacts": FakeCollection([]),
    }

    status, company_id, reason = await resolve_backfill_client(database, client)

    assert status == "unresolved"
    assert company_id is None
    assert reason == "existing_crm_company_id_invalid_or_cross_tenant"


@pytest.mark.asyncio
async def test_backfill_resolution_does_not_link_ambiguous_name():
    client = {"_id": "client-1", "company_id": "tenant-1", "name": "Acme Inc", "company_name": "Acme Inc"}
    database = {
        "crm_companies": FakeCollection([
            {"_id": "company-1", "company_id": "tenant-1", "deleted": False, "name": "Acme Inc"},
            {"_id": "company-2", "company_id": "tenant-1", "deleted": False, "name": "Acme Inc"},
        ]),
        "sales_prospects": FakeCollection([]),
        "sales_contacts": FakeCollection([]),
    }

    status, company_id, reason = await resolve_backfill_client(database, client)

    assert status == "ambiguous"
    assert company_id is None
    assert reason == "client.company_name_exact_multiple"


@pytest.mark.asyncio
async def test_client_workspace_scopes_projects_tasks_meetings_timeline_and_invoices(monkeypatch):
    client = _client(project_ids=["0000000000000000000000b1"])
    project = _project()
    task = _task()
    meeting = _meeting()
    lead = _lead()
    invoice = SimpleNamespace(
        id="000000000000000000000011",
        invoice_number="INV-1",
        invoice_type=InvoiceType.PROFORMA,
        status=InvoiceStatus.SENT,
        invoice_date=datetime.utcnow(),
        due_date=datetime.utcnow() + timedelta(days=15),
        total_amount=5000,
        outstanding_amount=5000,
        currency="INR",
        project_id="PROJ-1",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    crm_company = SimpleNamespace(id="0000000000000000000000aa", company_id="tenant-1", name="Acme Inc")
    contact = SimpleNamespace(
        id="0000000000000000000000a5",
        first_name="Cara",
        last_name="Contact",
        email="cara@acme.test",
        phone="999",
        country_code="+91",
        designation="Buyer",
        crm_company_id=str(crm_company.id),
        is_primary_contact=True,
        full_name=lambda: "Cara Contact",
    )

    captured = {}

    async def client_get(client_id):
        assert client_id == str(client.id)
        return client

    def project_find(query):
        captured["project_query"] = query
        return FakeQuery([project])

    def meeting_find(query):
        captured["meeting_query"] = query
        return FakeQuery([meeting])

    def task_find(query):
        captured["task_query"] = query
        return FakeQuery([task])

    def lead_find(query):
        captured["lead_query"] = query
        return FakeQuery([lead])

    def invoice_find(query):
        captured["invoice_query"] = query
        return FakeQuery([invoice])

    async def timeline_load(current_user, company):
        captured["timeline_company"] = company
        return {"items": [{"id": "event-1"}], "grouped_by_day": [], "summary": {"total": 1}}

    async def user_get(_user_id):
        return _user()

    monkeypatch.setattr("app.crm.client_workspace.Client.get", client_get)
    monkeypatch.setattr("app.crm.client_workspace.Project.find", project_find)
    monkeypatch.setattr("app.crm.client_workspace.Meeting.find", meeting_find)
    monkeypatch.setattr("app.crm.client_workspace.Task.find", task_find)
    monkeypatch.setattr("app.crm.client_workspace.SalesProspect.find", lead_find)
    monkeypatch.setattr("app.crm.client_workspace.Invoice.find", invoice_find)
    async def resolve_client_company(_client):
        return ClientCompanyResolution(crm_company, "resolved", "test")

    async def load_contacts(_client):
        return [contact]

    monkeypatch.setattr("app.crm.client_workspace.resolve_crm_company_for_client", resolve_client_company)
    monkeypatch.setattr("app.crm.client_workspace.load_contacts_for_client", load_contacts)
    monkeypatch.setattr("app.crm.client_workspace.CRMCompanyTimelineService.load_timeline", timeline_load)
    monkeypatch.setattr("app.crm.client_workspace.User.get", user_get)

    workspace = await ClientWorkspaceService.load_workspace(_user(), str(client.id))

    assert workspace["client"]["id"] == str(client.id)
    assert [item["id"] for item in workspace["projects"]] == [str(project.id)]
    assert [item["id"] for item in workspace["tasks"]] == [str(task.id)]
    assert [item["id"] for item in workspace["meetings"]] == [str(meeting.id)]
    assert [item["id"] for item in workspace["invoices"]] == [str(invoice.id)]
    assert [item["id"] for item in workspace["contacts"]] == [str(contact.id)]
    assert workspace["timeline"]["summary"]["total"] == 1
    assert captured["timeline_company"] is crm_company
    assert {"host_id": str(client.assigned_to)} not in captured["meeting_query"]["$or"]
    assert workspace["leads"][0]["id"] == str(lead.id)
    assert captured["invoice_query"] == {"company_id": client.company_id, "client_id": str(client.id)}


@pytest.mark.asyncio
async def test_client_workspace_zero_project_client_returns_zero_tasks(monkeypatch):
    client = _client(project_ids=[])
    captured = {}

    async def client_get(_id):
        return client

    async def no_user(_id):
        return None

    monkeypatch.setattr("app.crm.client_workspace.Client.get", client_get)
    monkeypatch.setattr("app.crm.client_workspace.Project.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.Meeting.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.Invoice.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.SalesProspect.find", lambda query: FakeQuery([]))
    async def no_company(_client):
        return ClientCompanyResolution(None, "unresolved", "test")

    async def no_contacts(_client):
        return []

    monkeypatch.setattr("app.crm.client_workspace.resolve_crm_company_for_client", no_company)
    monkeypatch.setattr("app.crm.client_workspace.load_contacts_for_client", no_contacts)
    monkeypatch.setattr("app.crm.client_workspace.User.get", no_user)

    def task_find(query):
        captured["task_query"] = query
        return FakeQuery([])

    monkeypatch.setattr("app.crm.client_workspace.Task.find", task_find)

    workspace = await ClientWorkspaceService.load_workspace(_user(), str(client.id))

    assert workspace["projects"] == []
    assert workspace["tasks"] == []
    assert captured["task_query"] == {"company_id": client.company_id, "_id": {"$in": []}}


@pytest.mark.asyncio
async def test_won_deal_conversion_reuses_existing_client_and_links_project(monkeypatch):
    lead = _lead()
    client = _client(project_ids=[], status=ClientStatus.NEW)
    project = _project(client_id=None)
    meeting = _meeting()
    saved = {"client": 0, "project": 0}

    async def client_save():
        saved["client"] += 1

    async def project_save():
        saved["project"] += 1

    client.save = client_save
    project.save = project_save

    async def no_account_managers(_company_id):
        return []

    async def no_existing_task(_query):
        return None

    async def task_insert(self):
        return None

    monkeypatch.setattr("app.crm.deal_automation._eligible_account_manager_ids", no_account_managers)
    async def resolve_lead_company(_lead):
        return ClientCompanyResolution(
            SimpleNamespace(id="0000000000000000000000aa", company_id="tenant-1", name="Acme Inc"),
            "resolved",
            "test",
        )

    monkeypatch.setattr("app.crm.deal_automation.resolve_crm_company_for_lead", resolve_lead_company)
    async def client_find_one(query):
        assert query["deleted"] == {"$ne": True}
        return client

    async def project_find_one(query):
        return project if query.get("lead_id") == str(lead.id) else None

    async def activity_find_one(_query):
        return None

    async def meeting_find_one(_query):
        return meeting

    async def fake_structure(*_args, **_kwargs):
        return {"template_name": "Custom", "task_ids": ["0000000000000000000000e1"], "milestones": [], "phases": []}

    async def noop_publish(**_kwargs):
        return None

    monkeypatch.setattr("app.crm.deal_automation.Client.find_one", client_find_one)
    monkeypatch.setattr("app.crm.deal_automation.Project.find_one", project_find_one)
    monkeypatch.setattr("app.crm.deal_automation.Task.find_one", no_existing_task)
    monkeypatch.setattr("app.crm.deal_automation.Task.insert", task_insert)
    class FakeActivityModel:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

        @staticmethod
        async def find_one(query):
            return await activity_find_one(query)

        async def insert(self):
            return None

    monkeypatch.setattr("app.crm.deal_automation.CRMActivity", FakeActivityModel)
    monkeypatch.setattr("app.crm.deal_automation.Meeting.find_one", meeting_find_one)
    monkeypatch.setattr("app.crm.deal_automation._generate_project_structure", fake_structure)
    monkeypatch.setattr("app.crm.deal_automation.publish_crm_timeline_event", noop_publish)

    result = await handle_won_deal_automation(_user(), lead, deal=None)

    assert result["client"] is client
    assert result["project"] is project
    assert client.status == ClientStatus.NEW
    assert client.project_ids == [str(project.id)]
    assert project.client_id == str(client.id)
    assert project.lead_id == str(lead.id)
    assert client.crm_company_id == "0000000000000000000000aa"
    assert client.client_type == ClientType.ONE_TIME
    assert client.budget == lead.won_amount
    assert saved["project"] >= 1


@pytest.mark.parametrize(
    "status",
    [
        ClientStatus.NEW,
        ClientStatus.ONBOARDING,
        ClientStatus.ACTIVE,
        ClientStatus.AT_RISK,
        ClientStatus.ON_HOLD,
        ClientStatus.RENEWAL_DUE,
        ClientStatus.CHURNED,
        ClientStatus.ARCHIVED,
        ClientStatus.INACTIVE,
    ],
)
def test_current_client_statuses_are_supported(status):
    assert ClientStatus(status.value) is status


def test_legacy_inactive_client_status_normalizes_to_on_hold():
    assert normalize_client_status("inactive") == ClientStatus.ON_HOLD


@pytest.mark.asyncio
async def test_valid_client_lifecycle_transition_succeeds(monkeypatch):
    async def fake_activation_blockers(_client):
        return []
    async def fake_sync_client_onboarding(_client, _user=None):
        return {}

    monkeypatch.setattr(client_lifecycle, "activation_blockers", fake_activation_blockers)
    monkeypatch.setattr(client_lifecycle, "sync_client_onboarding", fake_sync_client_onboarding)
    client = _client(status=ClientStatus.ONBOARDING, notes="Requirements captured")

    await transition_client_status(client, ClientStatus.ACTIVE, _user())

    assert client.status == ClientStatus.ACTIVE
    assert client.saved is True


@pytest.mark.asyncio
async def test_client_activation_reports_missing_prerequisites(monkeypatch):
    async def fake_activation_blockers(_client):
        return [
            {"field": "primary_contact", "label": "Primary Contact", "tab": "contacts"},
            {"field": "requirements", "label": "Requirements", "tab": "requirements"},
            {"field": "kickoff_meeting", "label": "Kickoff Meeting", "tab": "kickoff"},
        ]
    async def fake_sync_client_onboarding(_client, _user=None):
        return {}

    monkeypatch.setattr(client_lifecycle, "activation_blockers", fake_activation_blockers)
    monkeypatch.setattr(client_lifecycle, "sync_client_onboarding", fake_sync_client_onboarding)
    client = _client(status=ClientStatus.ONBOARDING, contact="", email="", assigned_to="", account_owner_id=None, notes="")

    with pytest.raises(HTTPException) as exc:
        await transition_client_status(client, ClientStatus.ACTIVE, _user())

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "CLIENT_TRANSITION_BLOCKED"
    assert [item["field"] for item in exc.value.detail["missing_fields"]] == [
        "primary_contact",
        "requirements",
        "kickoff_meeting",
    ]


@pytest.mark.asyncio
async def test_invalid_client_lifecycle_transition_fails_clearly():
    client = _client(status=ClientStatus.NEW)

    with pytest.raises(HTTPException) as exc:
        await transition_client_status(client, ClientStatus.CHURNED, _user())

    assert exc.value.status_code == 400
    assert "Invalid client status transition" in exc.value.detail


@pytest.mark.asyncio
async def test_cross_tenant_client_lifecycle_transition_is_blocked():
    client = _client(company_id="tenant-2", status=ClientStatus.ACTIVE)

    with pytest.raises(HTTPException) as exc:
        await transition_client_status(client, ClientStatus.ON_HOLD, _user(company_id="tenant-1"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_active_on_hold_active_lifecycle_path(monkeypatch):
    async def fake_activation_blockers(_client):
        return []
    async def fake_sync_client_onboarding(_client, _user=None):
        return {}

    monkeypatch.setattr(client_lifecycle, "activation_blockers", fake_activation_blockers)
    monkeypatch.setattr(client_lifecycle, "sync_client_onboarding", fake_sync_client_onboarding)
    client = _client(status=ClientStatus.ACTIVE, notes="Requirements captured")

    await transition_client_status(client, ClientStatus.ON_HOLD, _user(), reason="Temporary service pause")
    assert client.status == ClientStatus.ON_HOLD
    await transition_client_status(client, ClientStatus.ACTIVE, _user())
    assert client.status == ClientStatus.ACTIVE


@pytest.mark.asyncio
async def test_active_client_cannot_return_to_onboarding():
    client = _client(status=ClientStatus.ACTIVE)

    with pytest.raises(HTTPException) as exc:
        await transition_client_status(client, ClientStatus.ONBOARDING, _user())

    assert exc.value.status_code == 400
    assert "Invalid client status transition" in exc.value.detail


@pytest.mark.asyncio
async def test_active_client_can_directly_enter_conditional_stage_with_reason():
    client = _client(status=ClientStatus.ACTIVE)

    await transition_client_status(client, ClientStatus.CHURNED, _user(), reason="Contract ended")

    assert client.status == ClientStatus.CHURNED
    assert client.lifecycle_reason == "Contract ended"


def test_client_api_uses_source_lead_budget_when_client_budget_empty():
    client = _client(budget=None, client_type=None, start_date=None)
    lead = _lead(won_amount=650000, budget=700000)

    commercial = _client_commercial_fields(client, lead)

    assert commercial["budget"] == 650000
    assert commercial["client_type"] == ClientType.ONE_TIME.value
    assert commercial["source_budget"] == "sales_lead"


def test_client_api_keeps_existing_client_budget_over_source_lead_budget():
    client = _client(budget=500000, client_type=ClientType.MONTHLY)
    lead = _lead(won_amount=650000, budget=700000)

    commercial = _client_commercial_fields(client, lead)

    assert commercial["budget"] == 500000
    assert commercial["client_type"] == ClientType.MONTHLY.value
    assert commercial["source_budget"] == "client"


def test_client_source_lead_index_matches_existing_partial_unique_index():
    matching_indexes = [
        index
        for index in Client.Settings.indexes
        if hasattr(index, "document")
        and index.document.get("key") == {"company_id": 1, "source_lead_id": 1}
    ]

    assert len(matching_indexes) == 1
    source_lead_index = matching_indexes[0].document
    assert source_lead_index["name"] == "company_id_1_source_lead_id_1"
    assert source_lead_index["unique"] is True
    assert source_lead_index["partialFilterExpression"] == {"source_lead_id": {"$type": "string"}}


@pytest.mark.asyncio
async def test_client_workspace_budget_fallback_from_projects_and_leads(monkeypatch):
    client = _client(budget=None, project_ids=[])

    async def client_get(_id):
        return client

    async def no_user(_id):
        return None

    project_a = _project(client_id=str(client.id))
    project_a.budget = 150000

    monkeypatch.setattr("app.crm.client_workspace.Client.get", client_get)
    monkeypatch.setattr("app.crm.client_workspace.Project.find", lambda query: FakeQuery([project_a]))
    monkeypatch.setattr("app.crm.client_workspace.Meeting.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.Invoice.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.SalesProspect.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.Task.find", lambda query: FakeQuery([]))

    async def no_company(_client):
        return ClientCompanyResolution(None, "unresolved", "test")

    async def no_contacts(_client):
        return []

    monkeypatch.setattr("app.crm.client_workspace.resolve_crm_company_for_client", no_company)
    monkeypatch.setattr("app.crm.client_workspace.load_contacts_for_client", no_contacts)
    monkeypatch.setattr("app.crm.client_workspace.User.get", no_user)

    workspace = await ClientWorkspaceService.load_workspace(_user(), str(client.id))

    assert workspace["client"]["budget"] == 150000
    assert workspace["client"]["source_budget"] == "projects"


def test_client_service_serializer_keeps_project_links_and_status():
    service = SimpleNamespace(
        id="service-1",
        client_id="client-1",
        company_id="tenant-1",
        name="SEO Retainer",
        status=ClientServiceStatus.ACTIVE,
        pricing_value=75000,
        billing_cycle="monthly",
        linked_project_ids=["project-1"],
        team_member_ids=[],
        created_by="user-1",
        start_date=None,
        end_date=None,
        service_type="SEO",
        service_owner_id=None,
        source_lead_id=None,
        source_category_id=None,
        notes=None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    payload = serialize_client_service(service)

    assert payload["client_id"] == "client-1"
    assert payload["company_id"] == "tenant-1"
    assert payload["status"] == "active"
    assert payload["linked_project_ids"] == ["project-1"]
    assert payload["pricing_value"] == 75000


@pytest.mark.asyncio
async def test_client_contact_roles_are_lightweight_relationship_metadata():
    client = _client()
    saved = {"client": 0}

    async def save():
        saved["client"] += 1

    client.save = save

    result = await set_client_contact_roles(client, "contact-1", ["Finance Contact", "Approver"], _user())

    assert result == {"contact_id": "contact-1", "roles": ["Finance Contact", "Approver"]}
    assert client.lifecycle_metadata["contact_roles"]["contact-1"] == ["Finance Contact", "Approver"]
    assert saved["client"] == 1


@pytest.mark.asyncio
async def test_client_contact_roles_reject_unknown_role():
    client = _client()

    with pytest.raises(HTTPException):
        await set_client_contact_roles(client, "contact-1", ["Unknown"], _user())


def test_client_deliverable_serializer_keeps_task_links_and_approval_state():
    deliverable = SimpleNamespace(
        id="deliverable-1",
        client_id="client-1",
        service_id="service-1",
        project_id="project-1",
        company_id="tenant-1",
        title="Instagram Reel #04",
        description="Final client-facing reel",
        owner_id="user-1",
        due_date=datetime.utcnow(),
        status=ClientDeliverableStatus.CLIENT_REVIEW,
        linked_files=[{"name": "reel.mp4", "url": "/files/reel.mp4"}],
        linked_task_ids=["task-1", "task-2"],
        approval_status=ClientApprovalStatus.SENT,
        approver_contact_id="contact-1",
        sent_at=datetime.utcnow(),
        viewed_at=None,
        approved_at=None,
        rejected_at=None,
        revision_note=None,
        revision_count=0,
        approval_history=[],
        delivered_at=None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    payload = serialize_deliverable(deliverable)

    assert payload["title"] == "Instagram Reel #04"
    assert payload["status"] == "client_review"
    assert payload["approval_status"] == "sent"
    assert payload["linked_task_ids"] == ["task-1", "task-2"]
    assert payload["linked_files"][0]["name"] == "reel.mp4"


def test_client_deliverable_lifecycle_allows_approval_then_delivery():
    assert ClientDeliverableStatus.APPROVED in ALLOWED_DELIVERABLE_TRANSITIONS[ClientDeliverableStatus.CLIENT_REVIEW]
    assert ClientDeliverableStatus.REVISION_REQUIRED in ALLOWED_DELIVERABLE_TRANSITIONS[ClientDeliverableStatus.CLIENT_REVIEW]
    assert ClientDeliverableStatus.DELIVERED in ALLOWED_DELIVERABLE_TRANSITIONS[ClientDeliverableStatus.APPROVED]
    assert ClientDeliverableStatus.DELIVERED not in ALLOWED_DELIVERABLE_TRANSITIONS[ClientDeliverableStatus.CLIENT_REVIEW]


@pytest.mark.asyncio
async def test_client_communication_separates_internal_notes_and_uses_client_scope(monkeypatch):
    client = _client(crm_company_id="company-1")
    captured = {}
    now = datetime.utcnow()

    async def contacts(_client):
        return [SimpleNamespace(id="contact-1")]

    async def company(_client):
        return ClientCompanyResolution(SimpleNamespace(id="company-1"), "crm_company_id", "test")

    activities = [
        SimpleNamespace(
            id="activity-1",
            activity_type="email",
            metadata={"contact_name": "Priya", "recipient": "client@acme.test", "project_id": "PROJ-1"},
            created_by_name="Ada",
            owner_name=None,
            created_by="user-1",
            completed_at=None,
            scheduled_at=None,
            created_at=now,
            description="Sent kickoff agenda",
            title="Kickoff agenda",
        ),
        SimpleNamespace(
            id="activity-2",
            activity_type="note",
            metadata={"contact_name": "Priya"},
            created_by_name="Ada",
            owner_name=None,
            created_by="user-1",
            completed_at=None,
            scheduled_at=None,
            created_at=now - timedelta(minutes=5),
            description="Internal pricing concern",
            title="Note",
        ),
    ]

    def activity_find(query):
        captured["query"] = query
        return FakeQuery(activities)

    monkeypatch.setattr("app.crm.client_activity.load_contacts_for_client", contacts)
    monkeypatch.setattr("app.crm.client_activity.resolve_crm_company_for_client", company)
    monkeypatch.setattr("app.crm.client_activity.CRMActivity.find", activity_find)

    result = await load_client_communications(client, [{"id": "0000000000000000000000b1", "project_id": "PROJ-1"}])

    assert result["communication"][0]["type"] == "email"
    assert result["internal_notes"][0]["type"] == "note"
    assert captured["query"]["company_id"] == "tenant-1"
    assert {"entity_type": "company", "entity_id": "company-1"} in captured["query"]["$or"]
    assert {"entity_type": "contact", "entity_id": {"$in": ["contact-1"]}} in captured["query"]["$or"]
    project_match = next(item for item in captured["query"]["$or"] if "metadata.project_id" in item)
    assert set(project_match["metadata.project_id"]["$in"]) == {"0000000000000000000000b1", "PROJ-1"}


@pytest.mark.asyncio
async def test_client_activity_is_chronological_filterable_and_paginated():
    client = _client(created_at=datetime.utcnow() - timedelta(days=5), updated_at=datetime.utcnow() - timedelta(days=1))
    service = SimpleNamespace(
        id="service-1",
        name="Retainer",
        status=ClientServiceStatus.ACTIVE,
        updated_at=datetime.utcnow() - timedelta(hours=5),
        service_owner_id="owner-1",
    )
    meeting = {
        "id": "meeting-1",
        "title": "Kickoff",
        "status": "completed",
        "updated_at": datetime.utcnow(),
        "meeting_date": datetime.utcnow() - timedelta(days=2),
        "host_id": "user-1",
    }
    communication = [{"id": "comm-1", "timestamp": datetime.utcnow() - timedelta(hours=1), "channel": "email", "preview": "Reply received", "sender": "client"}]
    file_item = [{"id": "file-1", "name": "agreement.pdf", "category": "Agreements", "uploaded_at": datetime.utcnow() - timedelta(hours=2)}]

    all_activity = await build_client_activity(
        client,
        projects=[],
        tasks=[_task(status="completed", completed_at=datetime.utcnow() - timedelta(hours=3))],
        meetings=[meeting],
        services=[service],
        deliverables=[],
        invoices=[],
        communication=communication,
        files=file_item,
        limit=3,
    )
    communication_activity = await build_client_activity(
        client,
        projects=[],
        tasks=[],
        meetings=[meeting],
        services=[],
        deliverables=[],
        invoices=[],
        communication=communication,
        files=[],
        category="communication",
    )

    assert all_activity["has_more"] is True
    assert all_activity["total"] > 3
    assert [item["timestamp"] for item in all_activity["items"]] == sorted([item["timestamp"] for item in all_activity["items"]], reverse=True)
    assert {item["kind"] for item in communication_activity["items"]} == {"communication"}


@pytest.mark.asyncio
async def test_client_workspace_meetings_are_not_scoped_by_account_owner(monkeypatch):
    client = _client(project_ids=["0000000000000000000000b1"])
    captured = {}

    async def client_get(_id):
        return client

    async def no_company(_client):
        return ClientCompanyResolution(None, "unresolved", "test")

    async def no_contacts(_client):
        return []

    def meeting_find(query):
        captured["query"] = query
        return FakeQuery([])

    async def no_communication(*_args, **_kwargs):
        return {"communication": [], "internal_notes": []}

    async def no_activity(*_args, **_kwargs):
        return {"items": [], "total": 0, "has_more": False}

    async def user_get(_id):
        return _user()

    monkeypatch.setattr("app.crm.client_workspace.Client.get", client_get)
    monkeypatch.setattr("app.crm.client_workspace.Project.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.Meeting.find", meeting_find)
    monkeypatch.setattr("app.crm.client_workspace.Invoice.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.SalesProspect.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.Task.find", lambda query: FakeQuery([]))
    monkeypatch.setattr("app.crm.client_workspace.resolve_crm_company_for_client", no_company)
    monkeypatch.setattr("app.crm.client_workspace.load_contacts_for_client", no_contacts)
    monkeypatch.setattr("app.crm.client_workspace.load_client_communications", no_communication)
    monkeypatch.setattr("app.crm.client_workspace.build_client_activity", no_activity)
    monkeypatch.setattr("app.crm.client_workspace.User.get", user_get)

    await ClientWorkspaceService.load_workspace(_user(), str(client.id))

    assert "host_id" not in str(captured["query"])
    assert "participant_ids" not in str(captured["query"])
    assert {"client_id": str(client.id)} in captured["query"]["$or"]

