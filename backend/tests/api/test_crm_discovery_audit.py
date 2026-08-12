from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.crm import discovery_audit
from app.models.sales_discovery_audit import SalesWorkspaceStatus
from app.models.user import UserRole


def user(user_id="user-1", role=UserRole.ADMIN, company_id="company-1"):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id, first_name="Ada", last_name="Admin", email="ada@example.com")


class FakeLead:
    def __init__(self, **kwargs):
        self.id = kwargs.pop("id", "lead-1")
        self.company_id = kwargs.pop("company_id", "company-1")
        self.deleted = kwargs.pop("deleted", False)
        self.assigned_to = kwargs.pop("assigned_to", "user-1")
        self.assigned_by = kwargs.pop("assigned_by", "user-1")
        self.created_by = kwargs.pop("created_by", "user-1")
        self.company_name = kwargs.pop("company_name", "Acme")
        self.prospect_name = kwargs.pop("prospect_name", "Acme Lead")
        self.email = kwargs.pop("email", "buyer@example.com")
        self.phone = kwargs.pop("phone", "9999999999")
        self.requirement = kwargs.pop("requirement", None)
        self.pain_points = kwargs.pop("pain_points", None)
        self.next_action = kwargs.pop("next_action", None)
        self.product_ids = kwargs.pop("product_ids", [])
        self.budget = kwargs.pop("budget", None)
        self.decision_maker = kwargs.pop("decision_maker", None)
        self.timeline = kwargs.pop("timeline", None)
        self.discovery_outcome = kwargs.pop("discovery_outcome", None)
        self.updated_at = kwargs.pop("updated_at", datetime.utcnow())

    async def save(self):
        return self


class FakeLeadModel:
    leads = {}

    @classmethod
    async def get(cls, lead_id):
        return cls.leads.get(lead_id)


class FakeCursor:
    def __init__(self, items):
        self.items = items

    async def to_list(self):
        return self.items


class FakeProduct:
    def __init__(self, product_id="product-1", name="Local SEO Management", rate=12000, unit="month"):
        self.id = product_id
        self.name = name
        self.rate = rate
        self.unit = unit


class FakeProductModel:
    products = []

    @classmethod
    def find(cls, query):
        return FakeCursor(cls.products)


class FakeWorkspace:
    store = {}
    prefix = "workspace"

    def __init__(self, **kwargs):
        self.id = kwargs.pop("id", f"{self.prefix}-{len(self.store) + 1}")
        self.company_id = kwargs.pop("company_id", "company-1")
        self.lead_id = kwargs.pop("lead_id", "lead-1")
        self.status = kwargs.pop("status", SalesWorkspaceStatus.DRAFT)
        self.completion = kwargs.pop("completion", {})
        self.version = kwargs.pop("version", 1)
        self.completed_at = kwargs.pop("completed_at", None)
        self.completed_by = kwargs.pop("completed_by", None)
        self.created_by = kwargs.pop("created_by", None)
        self.updated_by = kwargs.pop("updated_by", None)
        self.created_at = kwargs.pop("created_at", datetime.utcnow())
        self.updated_at = kwargs.pop("updated_at", datetime.utcnow())
        for key, value in kwargs.items():
            setattr(self, key, value)

    async def insert(self):
        self.__class__.store[str(self.id)] = self
        return self

    async def save(self):
        self.__class__.store[str(self.id)] = self
        return self

    @classmethod
    async def get(cls, item_id):
        return cls.store.get(str(item_id))

    @classmethod
    async def find_one(cls, query):
        for item in cls.store.values():
            if item.company_id == query.get("company_id") and item.lead_id == query.get("lead_id"):
                return item
        return None

    def model_dump(self):
        return dict(self.__dict__)


class FakeDiscovery(FakeWorkspace):
    store = {}
    prefix = "discovery"

    def __init__(self, **kwargs):
        defaults = {
            "business_information": {},
            "current_marketing": {},
            "problems": {},
            "goals": {},
            "budget": {},
            "decision_maker": {},
            "competitors": [],
            "timeline": {},
            "summary": {},
        }
        defaults.update(kwargs)
        super().__init__(**defaults)


class FakeAudit(FakeWorkspace):
    store = {}
    prefix = "audit"

    def __init__(self, **kwargs):
        defaults = {
            "audit_source": "manual",
            "website": {},
            "google_presence": {},
            "social_media": {},
            "seo": {},
            "competitors": [],
            "swot": {},
            "recommendations": [],
            "findings": [],
        }
        defaults.update(kwargs)
        super().__init__(**defaults)


@pytest.fixture(autouse=True)
def install_fakes(monkeypatch):
    FakeLeadModel.leads = {"lead-1": FakeLead()}
    FakeDiscovery.store = {}
    FakeAudit.store = {}
    FakeProductModel.products = []
    monkeypatch.setattr(discovery_audit, "SalesProspect", FakeLeadModel)
    monkeypatch.setattr(discovery_audit, "SalesDiscovery", FakeDiscovery)
    monkeypatch.setattr(discovery_audit, "SalesAudit", FakeAudit)
    monkeypatch.setattr(discovery_audit, "SalesProduct", FakeProductModel)

    async def allow_access(*args, **kwargs):
        return None

    async def no_activity(*args, **kwargs):
        return None

    monkeypatch.setattr(discovery_audit, "require_owned_record_access", allow_access)
    monkeypatch.setattr(discovery_audit, "_activity", no_activity)


@pytest.mark.asyncio
async def test_patch_discovery_saves_partial_data_and_syncs_authoritative_lead_fields():
    result = await discovery_audit.patch_discovery(user(), "lead-1", {
        "business_information": {"business_model": "Clinic"},
        "budget": {"expected_budget": "25000", "budget_confirmed": "yes"},
        "decision_maker": {"name": "Dr Rao"},
        "timeline": {"expected_duration": "3 months"},
    })

    assert result["discovery"]["business_information"]["business_model"] == "Clinic"
    assert FakeLeadModel.leads["lead-1"].budget == 25000
    assert FakeLeadModel.leads["lead-1"].decision_maker == "Dr Rao"
    assert FakeLeadModel.leads["lead-1"].timeline == "3 months"


@pytest.mark.asyncio
async def test_complete_discovery_returns_structured_business_validation():
    await discovery_audit.get_discovery(user(), "lead-1")

    with pytest.raises(HTTPException) as exc:
        await discovery_audit.complete_discovery(user(), "lead-1")

    assert exc.value.status_code == 422
    assert exc.value.detail["code"] == "DISCOVERY_COMPLETION_BLOCKED"
    assert "Primary business goal" in exc.value.detail["missing_items"]


@pytest.mark.asyncio
async def test_complete_audit_requires_proposal_recommendation():
    await discovery_audit.get_audit(user(), "lead-1")

    with pytest.raises(HTTPException) as exc:
        await discovery_audit.complete_audit(user(), "lead-1")

    assert exc.value.status_code == 422
    assert exc.value.detail["code"] == "AUDIT_COMPLETION_BLOCKED"


@pytest.mark.asyncio
async def test_generate_quotation_draft_uses_existing_document_service_and_product_mapping(monkeypatch):
    FakeProductModel.products = [FakeProduct()]
    await discovery_audit.patch_discovery(user(), "lead-1", {
        "business_information": {"business_name": "Acme"},
        "problems": {"selected": ["poor Google visibility"]},
        "goals": {"primary_goal": "rank on Google"},
    })
    await discovery_audit.patch_audit(user(), "lead-1", {
        "recommendations": [{"title": "Improve GBP", "suggested_service": "Local SEO", "include_in_proposal": True}],
        "swot": {"weaknesses": ["low visibility"], "opportunities": ["local search demand"]},
    })
    captured = {}

    async def fake_create_document(current_user, lead_id, payload):
        captured.update(payload)
        return {"document": {"id": "doc-1", "status": "draft", "content_snapshot": {"source_snapshot": payload["source_snapshot"]}}}

    monkeypatch.setattr(discovery_audit.documents, "create_document", fake_create_document)

    result = await discovery_audit.generate_quotation_draft(user(), "lead-1")

    assert result["document"]["status"] == "draft"
    assert captured["document_type"] == "quotation"
    assert captured["items"][0]["sales_product_id"] == "product-1"
    assert captured["items"][0]["unit_price"] == "12000"
    assert captured["source_snapshot"]["generated_from"]["discovery"]["id"] == "discovery-1"


@pytest.mark.asyncio
async def test_generate_quotation_draft_falls_back_to_lead_fields_and_products(monkeypatch):
    FakeLeadModel.leads["lead-1"] = FakeLead(
        company_name="Acme Clinic",
        pain_points="Low local visibility",
        requirement="Rank higher in maps and increase qualified calls",
        product_ids=["product-1"],
    )
    FakeProductModel.products = [FakeProduct()]
    captured = {}

    async def fake_create_document(current_user, lead_id, payload):
        captured.update(payload)
        return {"document": {"id": "doc-1", "status": "draft", "content_snapshot": {"source_snapshot": payload["source_snapshot"]}}}

    monkeypatch.setattr(discovery_audit.documents, "create_document", fake_create_document)

    result = await discovery_audit.generate_quotation_draft(user(), "lead-1")

    assert result["document"]["status"] == "draft"
    assert captured["items"][0]["sales_product_id"] == "product-1"
    assert captured["items"][0]["description"] == "Local SEO Management"
    assert captured["source_snapshot"]["generated_from"]["discovery"] is None


@pytest.mark.asyncio
async def test_employee_and_super_admin_follow_existing_sales_role_access():
    employee_result = await discovery_audit.patch_discovery(user(user_id="emp-1", role=UserRole.EMPLOYEE), "lead-1", {"summary": {"salesperson_summary": "Needs audit"}})
    assert employee_result["discovery"]["summary"]["salesperson_summary"] == "Needs audit"

    super_result = await discovery_audit.patch_discovery(user(role=UserRole.SUPER_ADMIN), "lead-1", {"summary": {"next_recommended_action": "Review"}})
    assert super_result["discovery"]["summary"]["next_recommended_action"] == "Review"
