from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.crm.lead_engine import AssignmentEngine, LeadEngine
from app.models.user import UserRole


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
async def test_create_lead_rejects_whitespace_required_fields(monkeypatch):
    current_user = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)

    with pytest.raises(HTTPException) as exc_info:
        await LeadEngine.create_lead(
            current_user,
            {
                "first_name": "   ",
                "last_name": "Admin",
                "country_code": "+91",
                "phone": "9999999999",
            },
        )

    assert exc_info.value.status_code == 400
    assert "First name is required" in str(exc_info.value.detail)


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
    captured_query = {}

    class FakeUserQuery:
        async def to_list(self):
            return [SimpleNamespace(id="manager-1", role=UserRole.MANAGER)]

    class FakeUserModel:
        @staticmethod
        def find(query):
            captured_query.update(query)
            return FakeUserQuery()

    async def fake_visible_user_ids(current_user):
        return None

    monkeypatch.setattr("app.crm.lead_engine.User", FakeUserModel)
    monkeypatch.setattr("app.crm.lead_engine.visible_user_ids", fake_visible_user_ids)

    users = await AssignmentEngine.load_assignable_users(
        SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)
    )

    assert users[0].id == "manager-1"
    assert UserRole.MANAGER.value in captured_query["role"]["$in"]
    and_conditions = captured_query["$and"]
    assert {"status": "active"} in and_conditions
    assert {"$or": [{"isActive": {"$exists": False}}, {"isActive": True}]} in and_conditions
    assert {"$or": [{"deleted": {"$exists": False}}, {"deleted": False}]} in and_conditions
    assert {"$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]} in and_conditions


@pytest.mark.asyncio
async def test_validate_target_user_rejects_non_assignable_owner(monkeypatch):
    async def fake_load_assignable_users(current_user, *, department_id=None):
        return [SimpleNamespace(id="user-1"), SimpleNamespace(id="user-2")]

    monkeypatch.setattr("app.crm.lead_engine.AssignmentEngine.load_assignable_users", fake_load_assignable_users)

    with pytest.raises(HTTPException) as exc_info:
        await AssignmentEngine.validate_target_user(
            SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER),
            "user-9",
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Target user must be an active user in your company"
