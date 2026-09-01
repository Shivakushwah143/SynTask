from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.crm.lead_engine import AssignmentEngine, LeadEngine
from app.models.sales_prospect import ProspectStatus
from app.models.user import UserRole, UserStatus


async def _raise_user_get(user_id):
    """Simulate a DB lookup that cannot find anything (no DB in unit tests)."""
    raise RuntimeError("no database in unit test")


class FakeProspect:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = kwargs.get("id", "lead-1")

    async def insert(self):
        return self

    async def save(self):
        self.saved = True
        return self

    def __getattr__(self, name):
        return None


class FakeOwnershipTransfer:
    last_inserted = None

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    async def insert(self):
        FakeOwnershipTransfer.last_inserted = self
        return self


@pytest.mark.asyncio
async def test_create_lead_preserves_selected_stage(monkeypatch):
    async def fake_find_duplicate(current_user, payload):
        return None

    async def fake_resolve_company(current_user, payload):
        return None, payload.get("company_name")

    async def fake_resolve_contact(current_user, payload):
        return None

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1", first_name="Ada", last_name="Admin")]

    def fake_choose_assignee(strategy, assignable_users, **kwargs):
        return assignable_users[0].id

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.find_duplicate", fake_find_duplicate)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_company", fake_resolve_company)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_contact", fake_resolve_contact)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.choose_assignee", fake_choose_assignee)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeProspect)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.create_lead(
        current_user,
        {
            "first_name": "Ada",
            "last_name": "Admin",
            "country_code": "+91",
            "phone": "9999999999",
            "current_stage": "Proposal",
            "company_name": "Alpha",
        },
    )

    assert result["lead"]["current_stage"] == "Proposal"


@pytest.mark.asyncio
async def test_create_lead_allows_missing_phone(monkeypatch):
    """Phone is optional on manual lead creation: an empty/whitespace phone is
    stored as None instead of failing the request with a 400 (the reported UI
    feedback: a lead with no mobile number must still be created)."""
    async def fake_find_duplicate(current_user, payload):
        return None

    async def fake_resolve_company(current_user, payload):
        return None, payload.get("company_name")

    async def fake_resolve_contact(current_user, payload):
        return None

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1", first_name="Ada", last_name="Admin")]

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.find_duplicate", fake_find_duplicate)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_company", fake_resolve_company)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_contact", fake_resolve_contact)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeProspect)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.create_lead(
        current_user,
        {
            "first_name": "Ada",
            "last_name": "Admin",
            "country_code": "+91",
            "phone": "   ",
            "company_name": "Alpha",
        },
    )

    assert result["message"] == "Prospect created successfully"
    assert result["lead"]["phone"] is None


@pytest.mark.asyncio
async def test_create_lead_uses_manual_assignment_when_target_is_provided(monkeypatch):
    async def fake_find_duplicate(current_user, payload):
        return None

    async def fake_resolve_company(current_user, payload):
        return None, payload.get("company_name")

    async def fake_resolve_contact(current_user, payload):
        return None

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [
            SimpleNamespace(id="user-1", first_name="Ada", last_name="Admin"),
            SimpleNamespace(id="user-2", first_name="Lee", last_name="Lead"),
        ]

    def fake_choose_assignee(strategy, assignable_users, **kwargs):
        assert strategy == "manual"
        assert kwargs["target_user_id"] == "user-2"
        return kwargs["target_user_id"]

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.find_duplicate", fake_find_duplicate)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_company", fake_resolve_company)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_contact", fake_resolve_contact)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.choose_assignee", fake_choose_assignee)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeProspect)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.create_lead(
        current_user,
        {
            "first_name": "Ada",
            "last_name": "Admin",
            "country_code": "+91",
            "phone": "9999999999",
            "current_stage": "New",
            "company_name": "Alpha",
            "assigned_to": "user-2",
        },
    )

    assert result["lead"]["assigned_to"] == "user-2"


@pytest.mark.asyncio
async def test_create_lead_allows_duplicate_phone_for_manual_entry(monkeypatch):
    async def fake_find_duplicate(current_user, payload):
        return SimpleNamespace(id="existing-lead-1")

    async def fake_resolve_company(current_user, payload):
        return None, payload.get("company_name")

    async def fake_resolve_contact(current_user, payload):
        return None

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1", first_name="Ada", last_name="Admin")]

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.find_duplicate", fake_find_duplicate)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_company", fake_resolve_company)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_contact", fake_resolve_contact)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeProspect)

    current_user = SimpleNamespace(id="subadmin-1", company_id="company-1", role=UserRole.SUB_ADMIN)
    result = await LeadEngine.create_lead(
        current_user,
        {
            "first_name": "Ada",
            "last_name": "Admin",
            "country_code": "+91",
            "phone": "9999999999",
            "company_name": "Alpha",
        },
    )

    assert result["message"] == "Prospect created successfully"
    assert result["lead"]["phone"] == "9999999999"


@pytest.mark.asyncio
async def test_create_lead_sub_admin_manual_owner_is_not_limited_to_actor_department(monkeypatch):
    captured_departments = []

    async def fake_find_duplicate(current_user, payload):
        return None

    async def fake_resolve_company(current_user, payload):
        return None, payload.get("company_name")

    async def fake_resolve_contact(current_user, payload):
        return None

    async def fake_load_assignable_users(current_user, *, department_id=None):
        captured_departments.append(department_id)
        return [
            SimpleNamespace(id="user-1", first_name="Ada", last_name="Admin", department_id="sales"),
            SimpleNamespace(id="user-2", first_name="Lee", last_name="Lead", department_id="delivery"),
        ]

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.find_duplicate", fake_find_duplicate)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_company", fake_resolve_company)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_contact", fake_resolve_contact)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeProspect)

    current_user = SimpleNamespace(
        id="subadmin-1",
        company_id="company-1",
        role=UserRole.SUB_ADMIN,
        department_id="sales",
    )
    result = await LeadEngine.create_lead(
        current_user,
        {
            "first_name": "Ada",
            "last_name": "Admin",
            "country_code": "+91",
            "phone": "9999999999",
            "company_name": "Alpha",
            "assigned_to": "user-2",
        },
    )

    assert result["lead"]["assigned_to"] == "user-2"
    assert captured_departments == [None]


@pytest.mark.asyncio
async def test_create_lead_employee_with_no_assignable_users_gets_creator_ownership(monkeypatch):
    """An employee whose department has no assignable users must still be able
    to create a lead (reported: POST /api/v1/sales/prospects/ returns 400
    'No assignable users found in your company' for employees). The lead falls
    back to the creator instead of failing the request."""
    async def fake_find_duplicate(current_user, payload):
        return None

    async def fake_resolve_company(current_user, payload):
        return None, payload.get("company_name")

    async def fake_resolve_contact(current_user, payload):
        return None

    async def fake_load_assignable_users(current_user, *, department_id=None):
        raise HTTPException(status_code=400, detail="No assignable users found in your company")

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.find_duplicate", fake_find_duplicate)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_company", fake_resolve_company)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_contact", fake_resolve_contact)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeProspect)

    # Employee scoped to a department that has no other assignable members.
    current_user = SimpleNamespace(
        id="employee-1",
        company_id="company-1",
        role=UserRole.EMPLOYEE,
        department_id="dept-engineering",
    )
    result = await LeadEngine.create_lead(
        current_user,
        {
            "first_name": "Ada",
            "last_name": "Admin",
            "country_code": "+91",
            "phone": "9999999999",
            "company_name": "Alpha",
        },
    )

    assert result["message"] == "Prospect created successfully"
    # The lead is owned by its creator so it stays visible on their dashboard.
    assert result["lead"]["assigned_to"] == "employee-1"
    assert result["lead"]["assigned_by"] == "employee-1"


@pytest.mark.asyncio
async def test_create_lead_falls_back_to_creator_when_explicit_owner_invalid(monkeypatch):
    """An explicitly requested owner that cannot be validated (e.g. deactivated
    or outside the creator's department scope) must not block lead creation —
    the lead falls back to the creator."""
    async def fake_find_duplicate(current_user, payload):
        return None

    async def fake_resolve_company(current_user, payload):
        return None, payload.get("company_name")

    async def fake_resolve_contact(current_user, payload):
        return None

    async def fake_validate_target_user(*args, **kwargs):
        raise HTTPException(status_code=400, detail="Target user must be an active user in your company")

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.find_duplicate", fake_find_duplicate)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_company", fake_resolve_company)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_contact", fake_resolve_contact)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.validate_target_user", fake_validate_target_user)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeProspect)

    current_user = SimpleNamespace(
        id="manager-1",
        company_id="company-1",
        role=UserRole.MANAGER,
        department_id="dept-sales",
    )
    result = await LeadEngine.create_lead(
        current_user,
        {
            "first_name": "Ada",
            "last_name": "Admin",
            "country_code": "+91",
            "phone": "9999999999",
            "company_name": "Alpha",
            "assigned_to": "user-9",
        },
    )

    assert result["message"] == "Prospect created successfully"
    assert result["lead"]["assigned_to"] == "manager-1"


class FakeImportFile:
    """Minimal UploadFile-like object for import_leads tests."""
    filename = "leads.csv"

    async def read(self):
        return b"phone\n9999999999\n"


def _build_import_file():
    return FakeImportFile()


@pytest.mark.asyncio
async def test_import_leads_imports_rows_whose_phone_already_exists(monkeypatch):
    """Bulk import applies no validation: a row whose phone already exists in the
    company is imported anyway (phone has no unique DB index), nothing is skipped."""
    def fake_parse(file_name, content):
        return ["phone"], [{"phone": "9999999999"}]

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1")]

    class FakeQuery:
        async def to_list(self):
            return [SimpleNamespace(country_code="+91", phone="9999999999")]

    class FakeSalesProspect:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

        @staticmethod
        def find(query):
            return FakeQuery()

        @staticmethod
        async def insert_many(prospects):
            FakeSalesProspect.inserted = prospects
            return None

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine._parse_tabular_upload", fake_parse)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeSalesProspect)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)

    current_user = SimpleNamespace(id="admin-1", company_id="company-1", role=UserRole.ADMIN)
    result = await LeadEngine.import_leads(
        current_user,
        _build_import_file(),
        strategy="round-robin",
    )

    assert result["total_uploaded"] == 1
    assert result["skipped_rows"] == 0
    assert len(FakeSalesProspect.inserted) == 1


@pytest.mark.asyncio
async def test_import_leads_maps_sales_journey_columns_to_real_fields(monkeypatch):
    """Budget/decision-maker/timeline columns in a CSV land on the real lead
    fields, not custom_fields — otherwise the pipeline Value column shows Rs 0
    and the move popup re-asks for already-imported details (the reported sync
    bug)."""
    def fake_parse(file_name, content):
        return ["phone", "budget", "timeline", "decision_maker", "industry", "deal value"], [
            {
                "phone": "9999999999",
                "budget": "250000",
                "timeline": "This quarter",
                "decision_maker": "Priya Shah",
                "industry": "IT Services",
                "deal value": "450000",
            }
        ]

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1")]

    class FakeQuery:
        async def to_list(self):
            return []

    class FakeSalesProspect:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

        @staticmethod
        def find(query):
            return FakeQuery()

        @staticmethod
        async def insert_many(prospects):
            FakeSalesProspect.inserted = prospects
            return None

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine._parse_tabular_upload", fake_parse)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeSalesProspect)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)

    current_user = SimpleNamespace(id="admin-1", company_id="company-1", role=UserRole.ADMIN)
    result = await LeadEngine.import_leads(
        current_user,
        _build_import_file(),
        strategy="round-robin",
    )

    assert result["total_uploaded"] == 1
    prospect = FakeSalesProspect.inserted[0]
    assert prospect.budget == 250000
    assert prospect.won_amount == 450000
    assert prospect.timeline == "This quarter"
    assert prospect.decision_maker == "Priya Shah"
    assert prospect.industry == "IT Services"
    # None of the journey columns leaked into custom_fields.
    assert "budget" not in prospect.custom_fields
    assert "decision_maker" not in prospect.custom_fields
    assert "won_amount" not in prospect.custom_fields
    # The auto-assigned Acquire lead persists as Assigned.
    assert prospect.current_stage_status == "assigned"


@pytest.mark.asyncio
async def test_import_leads_allows_duplicates_when_enabled(monkeypatch):
    """Rows whose phone repeats within the file are all imported (in-file
    duplicates are no longer skipped). allow_duplicates remains accepted for
    backward compatibility."""
    def fake_parse(file_name, content):
        # Second row repeats the same phone as the first -> in-file duplicate
        return ["phone"], [{"phone": "9999999999"}, {"phone": "9999999999"}]

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1")]

    class FakeQuery:
        async def to_list(self):
            return [SimpleNamespace(country_code="+91", phone="9999999999")]

    class FakeSalesProspect:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

        @staticmethod
        def find(query):
            return FakeQuery()

        @staticmethod
        async def insert_many(prospects):
            FakeSalesProspect.inserted = prospects
            return None

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine._parse_tabular_upload", fake_parse)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeSalesProspect)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)

    current_user = SimpleNamespace(id="admin-1", company_id="company-1", role=UserRole.ADMIN)
    result = await LeadEngine.import_leads(
        current_user,
        _build_import_file(),
        strategy="round-robin",
        allow_duplicates=True,
    )

    assert result["total_uploaded"] == 2
    assert result["skipped_rows"] == 0
    assert len(FakeSalesProspect.inserted) == 2


@pytest.mark.asyncio
async def test_import_leads_imports_duplicate_email_rows_with_email_dropped(monkeypatch):
    """Rows whose email already exists in the company (unique index
    company_id_1_email_1) now import anyway - the colliding email is dropped so
    the row still imports (no 500, no validation)."""
    def fake_parse(file_name, content):
        return ["phone", "email"], [
            {"phone": "9999999999", "email": "exists@example.com"},
            {"phone": "8888888888", "email": "fresh@example.com"},
        ]

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1")]

    class FakeQuery:
        def __init__(self, leads):
            self.leads = leads

        async def to_list(self):
            return self.leads

    class FakeSalesProspect:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

        @staticmethod
        def find(query):
            if "email" in query:
                return FakeQuery([SimpleNamespace(country_code="+91", phone="7777777777", email="exists@example.com")])
            return FakeQuery([])

        @staticmethod
        async def insert_many(prospects):
            FakeSalesProspect.inserted = prospects
            return None

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine._parse_tabular_upload", fake_parse)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeSalesProspect)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)

    current_user = SimpleNamespace(id="admin-1", company_id="company-1", role=UserRole.ADMIN)
    result = await LeadEngine.import_leads(
        current_user,
        _build_import_file(),
        strategy="round-robin",
    )

    # Both rows import; the row with the existing email keeps the row but loses the email.
    assert result["total_uploaded"] == 2
    assert result["skipped_rows"] == 0
    assert len(FakeSalesProspect.inserted) == 2
    inserted_emails = [getattr(p, "email", None) for p in FakeSalesProspect.inserted]
    assert "exists@example.com" not in inserted_emails
    assert "fresh@example.com" in inserted_emails


@pytest.mark.asyncio
async def test_import_leads_imports_rows_without_phone(monkeypatch):
    """A row with no mobile number now imports - bulk import applies no
    validation and phone is optional on the lead document."""
    def fake_parse(file_name, content):
        return ["first_name", "email"], [
            {"first_name": "Ada", "email": "ada@example.com"},
            {"first_name": "Bob", "email": "bob@example.com"},
        ]

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1")]

    class FakeQuery:
        async def to_list(self):
            return []

    class FakeSalesProspect:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

        @staticmethod
        def find(query):
            return FakeQuery()

        @staticmethod
        async def insert_many(prospects):
            FakeSalesProspect.inserted = prospects
            return None

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine._parse_tabular_upload", fake_parse)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeSalesProspect)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)

    current_user = SimpleNamespace(id="admin-1", company_id="company-1", role=UserRole.ADMIN)
    result = await LeadEngine.import_leads(
        current_user,
        _build_import_file(),
        strategy="round-robin",
    )

    assert result["total_uploaded"] == 2
    assert result["skipped_rows"] == 0
    assert len(FakeSalesProspect.inserted) == 2
    assert all(getattr(p, "phone", None) is None for p in FakeSalesProspect.inserted)


@pytest.mark.asyncio
async def test_update_lead_keeps_owner_when_unchanged_even_if_actor_in_other_department(monkeypatch):
    """Updating a lead must not fail when the existing owner belongs to a
    different department than the current user and the owner is not being changed.
    Regression for: PUT /api/v1/sales/prospects/<id> ->
    'Target user must be an active user in your company'"""
    lead = FakeProspect(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        source="manual",
        assigned_to="user-1",
        assigned_by="user-9",
        department_id=None,
    )
    lead.saved = False

    validation_calls = []

    async def fake_get(lead_id):
        assert lead_id == "lead-1"
        return lead

    async def fake_require_owned_record_access(*args, **kwargs):
        return None

    async def fake_validate_target_user(*args, **kwargs):
        validation_calls.append(kwargs)
        raise AssertionError("validate_target_user should not be called when owner is unchanged")

    monkeypatch.setattr("app.crm.lead_engine.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.validate_target_user", fake_validate_target_user)
    monkeypatch.setattr("app.crm.lead_engine.require_owned_record_access", fake_require_owned_record_access)

    # Actor belongs to a different department (dept-other) than the lead owner (user-1 in dept-1)
    current_user = SimpleNamespace(
        id="manager-1", company_id="company-1", role=UserRole.MANAGER, department_id="dept-other"
    )
    result = await LeadEngine.update_lead(
        current_user,
        "lead-1",
        {
            "prospect_name": "Alpha Co Renamed",
            # Frontend echoes back the existing owner even when it is not changed
            "assigned_to": "user-1",
        },
    )

    assert result["message"] == "Prospect updated successfully"
    assert lead.prospect_name == "Alpha Co Renamed"
    assert lead.assigned_to == "user-1"
    assert lead.saved is True
    assert validation_calls == []


@pytest.mark.asyncio
async def test_update_lead_reassigns_owner_and_records_transfer(monkeypatch):
    lead = FakeProspect(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        source="manual",
        assigned_to="user-1",
        assigned_by="user-9",
    )
    lead.saved = False

    FakeOwnershipTransfer.last_inserted = None

    async def fake_get(lead_id):
        assert lead_id == "lead-1"
        return lead

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [
            SimpleNamespace(id="user-1", first_name="Ada", last_name="Admin"),
            SimpleNamespace(id="user-2", first_name="Lee", last_name="Lead"),
        ]

    async def fake_require_owned_record_access(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.OwnershipTransfer", FakeOwnershipTransfer)
    monkeypatch.setattr("app.crm.lead_engine.require_owned_record_access", fake_require_owned_record_access)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.update_lead(current_user, "lead-1", {"assigned_to": "user-2"})

    assert result["lead"]["assigned_to"] == "user-2"
    assert lead.saved is True
    assert FakeOwnershipTransfer.last_inserted is not None
    assert FakeOwnershipTransfer.last_inserted.entity_type == "lead"
    assert FakeOwnershipTransfer.last_inserted.entity_id == "lead-1"
    assert FakeOwnershipTransfer.last_inserted.from_user_id == "user-1"
    assert FakeOwnershipTransfer.last_inserted.to_user_id == "user-2"
    assert FakeOwnershipTransfer.last_inserted.reason == "manual_reassignment"
    assert FakeOwnershipTransfer.last_inserted.transferred_by == "manager-1"
    assert FakeOwnershipTransfer.last_inserted.notes == "Manual reassignment from lead update"
    assert lead.assigned_to == "user-2"
    assert lead.updated_at is not None


@pytest.mark.asyncio
async def test_update_lead_status_won_runs_client_conversion(monkeypatch):
    lead = FakeProspect(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        company_name="Alpha Co",
        source="manual",
        current_stage="Agreement",
        status=ProspectStatus.ACTIVE,
        assigned_to="user-1",
        assigned_by="user-9",
        budget=25000,
        client_id=None,
        project_id=None,
        won_status=None,
        current_stage_status=None,
        stage_status_history=[],
    )

    async def fake_get(lead_id):
        assert lead_id == "lead-1"
        return lead

    async def fake_require_owned_record_access(*args, **kwargs):
        return None

    async def fake_run_won_automation(current_user, prospect, company_id):
        assert company_id == "company-1"
        assert prospect.status == ProspectStatus.WON
        assert prospect.current_stage == "Won"
        return {"status": "completed", "client_id": "client-1", "project_id": "project-1"}

    monkeypatch.setattr("app.crm.lead_engine.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.require_owned_record_access", fake_require_owned_record_access)
    monkeypatch.setattr("app.crm.pipeline._run_won_automation", fake_run_won_automation)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.update_lead(current_user, "lead-1", {"status": "won"})

    assert result["message"] == "Prospect updated successfully"
    assert lead.status == ProspectStatus.WON
    assert lead.current_stage == "Won"
    assert lead.client_id == "client-1"
    assert lead.project_id == "project-1"
    assert lead.won_status == "transferred"
    assert lead.current_stage_status == "transferred"
    assert lead.transferred_at is not None
    assert lead.transferred_by == "manager-1"
    assert lead.saved is True


@pytest.mark.asyncio
async def test_update_lead_status_won_reruns_conversion_for_stale_client_id(monkeypatch):
    lead = FakeProspect(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        company_name="Alpha Co",
        source="manual",
        current_stage="Agreement",
        status=ProspectStatus.ACTIVE,
        assigned_to="user-1",
        assigned_by="user-9",
        budget=25000,
        client_id="missing-client",
        project_id=None,
        won_status=None,
        current_stage_status=None,
        stage_status_history=[],
    )

    async def fake_get(lead_id):
        assert lead_id == "lead-1"
        return lead

    async def no_client(_client_id):
        return None

    async def fake_require_owned_record_access(*args, **kwargs):
        return None

    async def fake_run_won_automation(current_user, prospect, company_id):
        assert company_id == "company-1"
        assert prospect.status == ProspectStatus.WON
        return {"status": "completed", "client_id": "client-2", "project_id": "project-2"}

    monkeypatch.setattr("app.crm.lead_engine.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.Client.get", no_client)
    monkeypatch.setattr("app.crm.lead_engine.require_owned_record_access", fake_require_owned_record_access)
    monkeypatch.setattr("app.crm.pipeline._run_won_automation", fake_run_won_automation)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.update_lead(current_user, "lead-1", {"status": "won"})

    assert result["message"] == "Prospect updated successfully"
    assert lead.status == ProspectStatus.WON
    assert lead.current_stage == "Won"
    assert lead.client_id == "client-2"
    assert lead.project_id == "project-2"
    assert lead.current_stage_status == "transferred"
    assert lead.transferred_at is not None
    assert lead.saved is True


@pytest.mark.asyncio
async def test_update_lead_persists_custom_fields(monkeypatch):
    """Adding a custom field from the lead overview must persist custom_fields.

    Regression: update_lead never applied custom_fields, so the overview
    Add-field flow (and the sidebar Advanced-fields JSON editor) silently saved
    nothing. The stored set is replaced by the payload's complete set.
    """
    lead = FakeProspect(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        source="manual",
        assigned_to="user-1",
        assigned_by="user-9",
        custom_fields={"existing": "yes"},
    )
    lead.saved = False

    async def fake_get(lead_id):
        return lead

    async def fake_require_owned_record_access(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.require_owned_record_access", fake_require_owned_record_access)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.update_lead(
        current_user,
        "lead-1",
        {"custom_fields": {"existing": "yes", "linkedin_url": "https://linkedin.com/in/jane"}},
    )

    assert result["message"] == "Prospect updated successfully"
    assert lead.custom_fields == {"existing": "yes", "linkedin_url": "https://linkedin.com/in/jane"}
    assert lead.saved is True


@pytest.mark.asyncio
async def test_update_lead_persists_referred_by(monkeypatch):
    """The optional referred_by field set at creation can be updated later."""
    lead = FakeProspect(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        source="manual",
        assigned_to="user-1",
        assigned_by="user-9",
        referred_by=None,
    )
    lead.saved = False

    async def fake_get(lead_id):
        return lead

    async def fake_require_owned_record_access(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.require_owned_record_access", fake_require_owned_record_access)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.update_lead(current_user, "lead-1", {"referred_by": "user-2"})

    assert result["message"] == "Prospect updated successfully"
    assert lead.referred_by == "user-2"
    assert lead.saved is True


@pytest.mark.asyncio
async def test_update_lead_preserves_budget_when_not_in_payload(monkeypatch):
    """A partial update must leave absent fields (budget, phone, ...) untouched.

    Regression for the pipeline sync bug: the stage dialog saves only the missing
    field (e.g. decision_maker); update_lead must not clear budget (which then
    showed as Rs 0 on the pipeline Value column and re-opened the Qualify ->
    Discovery gate for an already-defined budget).
    """
    lead = FakeProspect(
        id="lead-1",
        company_id="company-1",
        deleted=False,
        prospect_name="Alpha Co",
        source="manual",
        assigned_to="user-1",
        assigned_by="user-9",
        budget=250000,
        decision_maker=None,
    )
    lead.saved = False

    async def fake_get(lead_id):
        return lead

    async def fake_require_owned_record_access(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.SalesProspect.get", fake_get)
    monkeypatch.setattr("app.crm.lead_engine.require_owned_record_access", fake_require_owned_record_access)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.update_lead(current_user, "lead-1", {"decision_maker": "Rahul Sharma"})

    assert result["message"] == "Prospect updated successfully"
    assert lead.decision_maker == "Rahul Sharma"
    # Absent fields are preserved — never cleared by a partial update.
    assert lead.budget == 250000
    assert lead.saved is True


def test_choose_assignee_honors_manual_round_robin_and_least_loaded():
    users = [
        SimpleNamespace(id="user-1"),
        SimpleNamespace(id="user-2"),
        SimpleNamespace(id="user-3"),
    ]

    assert AssignmentEngine.choose_assignee("manual", users, target_user_id="user-2") == "user-2"
    assert AssignmentEngine.choose_assignee("round-robin", users, index=4) == "user-2"
    assert AssignmentEngine.choose_assignee("least-loaded", users, assignment_counts={"user-1": 3, "user-2": 1, "user-3": 1}) == "user-2"


@pytest.mark.asyncio
async def test_create_lead_allows_manager_owner_assignment(monkeypatch):
    async def fake_find_duplicate(current_user, payload):
        return None

    async def fake_resolve_company(current_user, payload):
        return None, payload.get("company_name")

    async def fake_resolve_contact(current_user, payload):
        return None

    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [
            SimpleNamespace(id="manager-1", first_name="Mina", last_name="Manager", role=UserRole.MANAGER),
            SimpleNamespace(id="lead-1", first_name="Lee", last_name="Lead", role=UserRole.LEAD),
        ]

    async def fake_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.find_duplicate", fake_find_duplicate)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_company", fake_resolve_company)
    monkeypatch.setattr("app.crm.lead_engine.DuplicateResolver.resolve_contact", fake_resolve_contact)
    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.LeadEventPublisher.lead_created", fake_publish)
    monkeypatch.setattr("app.crm.lead_engine.SalesProspect", FakeProspect)

    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    result = await LeadEngine.create_lead(
        current_user,
        {
            "first_name": "Ada",
            "last_name": "Admin",
            "country_code": "+91",
            "phone": "9999999999",
            "company_name": "Alpha",
            "assigned_to": "manager-1",
        },
    )

    assert result["lead"]["assigned_to"] == "manager-1"


@pytest.mark.asyncio
async def test_load_assignable_users_rejects_missing_company_context():
    with pytest.raises(HTTPException) as exc_info:
        await AssignmentEngine.load_assignable_users(SimpleNamespace(company_id=None))

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_load_assignable_users_includes_managers(monkeypatch):
    captured_department_id = object()

    async def fake_load_assignable_users_for_company(company_id, *, department_id=None):
        nonlocal captured_department_id
        assert company_id == "company-1"
        captured_department_id = department_id
        return [SimpleNamespace(id="manager-1", role=UserRole.MANAGER)]

    monkeypatch.setattr("app.crm.lead_engine.load_assignable_users_for_company", fake_load_assignable_users_for_company)

    users = await AssignmentEngine.load_assignable_users(
        SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER),
        department_id="sales",
    )

    assert users[0].id == "manager-1"
    assert captured_department_id == "sales"


@pytest.mark.asyncio
async def test_validate_target_user_rejects_non_assignable_owner(monkeypatch):
    """A target that cannot be found at all is reported as inactive/gone, never
    with the old generic message."""
    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1"), SimpleNamespace(id="user-2")]

    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.User.get", _raise_user_get)

    with pytest.raises(HTTPException) as exc_info:
        await AssignmentEngine.validate_target_user(
            SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER),
            "user-9",
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Selected owner is inactive or no longer exists."


@pytest.mark.asyncio
async def test_validate_target_user_reports_outside_department(monkeypatch):
    """An active, assignable same-company user outside the permitted department
    gets a precise department message (not the generic one)."""
    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1")]

    async def fake_user_get(user_id):
        return SimpleNamespace(
            id="user-2",
            company_id="company-1",
            status=UserStatus.ACTIVE,
            role=UserRole.EMPLOYEE,
        )

    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.User.get", fake_user_get)

    with pytest.raises(HTTPException) as exc_info:
        await AssignmentEngine.validate_target_user(
            SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER),
            "user-2",
            department_id="dept-1",
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Selected owner is outside your permitted department."


@pytest.mark.asyncio
async def test_validate_target_user_hides_cross_company_user(monkeypatch):
    """A user from another company is reported with generic wording so no
    cross-company user information leaks."""
    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1")]

    async def fake_user_get(user_id):
        return SimpleNamespace(
            id="user-9",
            company_id="company-2",
            status=UserStatus.ACTIVE,
            role=UserRole.EMPLOYEE,
        )

    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.User.get", fake_user_get)

    with pytest.raises(HTTPException) as exc_info:
        await AssignmentEngine.validate_target_user(
            SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER),
            "user-9",
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Selected owner is no longer available. Please choose another owner."


@pytest.mark.asyncio
async def test_validate_target_user_reports_inactive_user(monkeypatch):
    """An inactive same-company user is reported as inactive/gone."""
    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1")]

    async def fake_user_get(user_id):
        return SimpleNamespace(
            id="user-9",
            company_id="company-1",
            status=UserStatus.INACTIVE,
            role=UserRole.EMPLOYEE,
        )

    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)
    monkeypatch.setattr("app.crm.lead_engine.User.get", fake_user_get)

    with pytest.raises(HTTPException) as exc_info:
        await AssignmentEngine.validate_target_user(
            SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER),
            "user-9",
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Selected owner is inactive or no longer exists."


@pytest.mark.asyncio
async def test_resolve_sales_assignment_department_scopes_by_role():
    from app.core.assignable_users import resolve_sales_assignment_department

    # Company-wide roles are never department-scoped.
    assert resolve_sales_assignment_department(SimpleNamespace(role=UserRole.ADMIN, department_id="sales")) is None
    assert resolve_sales_assignment_department(SimpleNamespace(role=UserRole.SUB_ADMIN, department_id="sales")) is None
    assert resolve_sales_assignment_department(SimpleNamespace(role=UserRole.SUPER_ADMIN, department_id="sales")) is None

    # Other roles are scoped to their own department.
    assert resolve_sales_assignment_department(SimpleNamespace(role=UserRole.MANAGER, department_id="sales")) == "sales"
    assert resolve_sales_assignment_department(SimpleNamespace(role=UserRole.LEAD, department_id="ops")) == "ops"
    assert resolve_sales_assignment_department(SimpleNamespace(role=UserRole.EMPLOYEE, department_id="delivery")) == "delivery"
    assert resolve_sales_assignment_department(SimpleNamespace(role=UserRole.MANAGER, department_id=None)) is None

    # An explicit department_id always wins.
    assert resolve_sales_assignment_department(
        SimpleNamespace(role=UserRole.MANAGER, department_id="sales"),
        department_id="delivery",
    ) == "delivery"
