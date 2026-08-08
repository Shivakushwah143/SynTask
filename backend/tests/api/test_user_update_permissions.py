"""
User update permission tests.

Covers the relaxed edit rule: any company-scoped role (Admin/Sub Admin/Manager/
Lead) may edit any user in their company - no creator/department/team
restriction. Company isolation and the employee-can't-edit-others guard stay.
Also covers the Reporting Manager (reports_to) persistence on create/update.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.dependencies import get_current_company_admin_or_lead
from app.api.v1 import endpoints as endpoints_module
from app.models.user import UserRole

users_module = endpoints_module.users
update_user = users_module.update_user
create_employee = users_module.create_employee


async def _async_value(value):
    return value


def user(user_id, role, company_id="company-1", department_id=None):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        department_id=department_id,
        email=f"{user_id}@demo.com",
        first_name="Actor",
        last_name="User",
    )


def target_employee(**overrides):
    data = {
        "id": "emp-1",
        "role": UserRole.EMPLOYEE,
        "company_id": "company-1",
        "department_id": "dept-2",
        "lead_id": "lead-other",
        "reports_to": None,
        "first_name": "Old",
        "last_name": "Name",
        "email": "emp1@demo.com",
        "phone": None,
        "updated_at": None,
        "save": lambda *a, **k: _async_value(None),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _patch_user_model(monkeypatch, user_lookup, existing_by_email=None):
    """Patch the module-level User.get and UserService ancestor updates."""
    monkeypatch.setattr(
        users_module,
        "User",
        SimpleNamespace(
            get=user_lookup,
            find_one=(
                (lambda query: _async_value(existing_by_email))
                if existing_by_email is not None
                else (lambda query: _async_value(None))
            ),
        ),
    )
    monkeypatch.setattr(
        users_module.UserService,
        "update_hierarchy_ancestors",
        lambda u: _async_value(None),
    )


def _patch_employee_model(monkeypatch, employee):
    """Patch the module-level Employee so create_employee never touches the DB."""
    inserted = []

    class FakeEmployee:
        def __init__(self, **kwargs):
            self.id = "emp-new-1"
            self.company_id = kwargs.get("company_id")
            self.reports_to = kwargs.get("reports_to")
            self.lead_id = kwargs.get("lead_id")
            self.email = kwargs.get("email")

        async def insert(self):
            inserted.append(self)
            employee.id = self.id
            employee.company_id = self.company_id
            employee.reports_to = self.reports_to
            employee.lead_id = self.lead_id
            employee.email = self.email

    monkeypatch.setattr(users_module, "Employee", FakeEmployee)
    return inserted


@pytest.mark.asyncio
async def test_manager_can_update_employee_from_another_department(monkeypatch):
    employee = target_employee()
    _patch_user_model(monkeypatch, lambda _uid: _async_value(employee))

    manager = user("manager-1", UserRole.MANAGER, department_id="dept-1")

    response = await update_user(
        user_id="emp-1",
        first_name="Renamed",
        last_name=None,
        email=None,
        phone=None,
        department_id=None,
        designation=None,
        reports_to=None,
        current_user=manager,
    )

    assert response["message"] == "User updated successfully"
    assert employee.first_name == "Renamed"


@pytest.mark.asyncio
async def test_lead_can_update_any_employee_in_company(monkeypatch):
    # Employee was created by/assigned to a different lead - editing is allowed.
    employee = target_employee()
    _patch_user_model(monkeypatch, lambda _uid: _async_value(employee))

    lead = user("lead-1", UserRole.LEAD)

    response = await update_user(
        user_id="emp-1",
        first_name="Renamed By Lead",
        last_name=None,
        email=None,
        phone=None,
        department_id=None,
        designation=None,
        reports_to=None,
        current_user=lead,
    )

    assert response["message"] == "User updated successfully"
    assert employee.first_name == "Renamed By Lead"


@pytest.mark.asyncio
async def test_employee_cannot_update_other_users(monkeypatch):
    with pytest.raises(HTTPException) as exc_info:
        await get_current_company_admin_or_lead(current_user=user("emp-2", UserRole.EMPLOYEE))

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_cross_company_update_still_blocked(monkeypatch):
    employee = target_employee(company_id="company-2")
    _patch_user_model(monkeypatch, lambda _uid: _async_value(employee))

    manager = user("manager-1", UserRole.MANAGER, company_id="company-1")

    with pytest.raises(HTTPException) as exc_info:
        await update_user(
            user_id="emp-1",
            first_name="Nope",
            last_name=None,
            email=None,
            phone=None,
            department_id=None,
            designation=None,
            reports_to=None,
            current_user=manager,
        )

    assert exc_info.value.status_code == 403
    assert employee.first_name == "Old"


@pytest.mark.asyncio
async def test_update_missing_user_returns_404(monkeypatch):
    _patch_user_model(monkeypatch, lambda _uid: _async_value(None))

    with pytest.raises(HTTPException) as exc_info:
        await update_user(
            user_id="missing",
            first_name="X",
            last_name=None,
            email=None,
            phone=None,
            department_id=None,
            designation=None,
            reports_to=None,
            current_user=user("manager-1", UserRole.MANAGER),
        )

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_persists_reporting_manager(monkeypatch):
    employee = target_employee()
    _patch_user_model(monkeypatch, lambda _uid: _async_value(employee))

    manager = user("manager-1", UserRole.MANAGER)

    response = await update_user(
        user_id="emp-1",
        first_name=None,
        last_name=None,
        email=None,
        phone=None,
        department_id=None,
        designation=None,
        reports_to="manager-9",
        current_user=manager,
    )

    assert response["message"] == "User updated successfully"
    assert employee.reports_to == "manager-9"
    # The reporting manager is not a Lead, so the legacy lead_id is cleared.
    assert employee.lead_id is None


@pytest.mark.asyncio
async def test_update_reporting_manager_lead_syncs_legacy_lead_id(monkeypatch):
    employee = target_employee()

    def lookup(uid):
        if uid == "lead-7":
            return _async_value(SimpleNamespace(id="lead-7", role=UserRole.LEAD, company_id="company-1"))
        return _async_value(employee)

    _patch_user_model(monkeypatch, lookup)

    manager = user("manager-1", UserRole.MANAGER)

    await update_user(
        user_id="emp-1",
        first_name=None,
        last_name=None,
        email=None,
        phone=None,
        department_id=None,
        designation=None,
        reports_to="lead-7",
        current_user=manager,
    )

    assert employee.reports_to == "lead-7"
    assert employee.lead_id == "lead-7"


@pytest.mark.asyncio
async def test_update_clears_reporting_manager(monkeypatch):
    employee = target_employee(reports_to="manager-9", lead_id=None)
    _patch_user_model(monkeypatch, lambda _uid: _async_value(employee))

    manager = user("manager-1", UserRole.MANAGER)

    await update_user(
        user_id="emp-1",
        first_name=None,
        last_name=None,
        email=None,
        phone=None,
        department_id=None,
        designation=None,
        reports_to="",
        current_user=manager,
    )

    assert employee.reports_to is None
    assert employee.lead_id is None


@pytest.mark.asyncio
async def test_update_reporting_manager_cross_company_blocked(monkeypatch):
    employee = target_employee()

    def lookup(uid):
        if uid == "other-company-user":
            return _async_value(SimpleNamespace(id="other-company-user", role=UserRole.MANAGER, company_id="company-2"))
        return _async_value(employee)

    _patch_user_model(monkeypatch, lookup)

    manager = user("manager-1", UserRole.MANAGER)

    with pytest.raises(HTTPException) as exc_info:
        await update_user(
            user_id="emp-1",
            first_name=None,
            last_name=None,
            email=None,
            phone=None,
            department_id=None,
            designation=None,
            reports_to="other-company-user",
            current_user=manager,
        )

    assert exc_info.value.status_code == 400
    assert employee.reports_to is None


@pytest.mark.asyncio
async def test_create_employee_persists_reporting_manager(monkeypatch):
    employee = target_employee(reports_to=None, lead_id=None)
    _patch_user_model(monkeypatch, lambda _uid: _async_value(employee))
    inserted = _patch_employee_model(monkeypatch, employee)
    monkeypatch.setattr(users_module, "Department", SimpleNamespace(get=lambda _id: _async_value(None)))

    admin = user("admin-1", UserRole.ADMIN)

    response = await create_employee(
        email="new-emp@demo.com",
        password="StrongPass1",
        first_name="New",
        last_name="Emp",
        lead_id=None,
        reports_to="manager-5",
        department_id=None,
        designation="Developer",
        phone=None,
        current_user=admin,
    )

    assert response["message"] == "Employee created successfully"
    assert len(inserted) == 1
    assert inserted[0].reports_to == "manager-5"
    assert inserted[0].company_id == "company-1"


@pytest.mark.asyncio
async def test_create_employee_defaults_reporting_manager_to_creator_for_manager(monkeypatch):
    employee = target_employee(reports_to=None, lead_id=None)
    _patch_user_model(monkeypatch, lambda _uid: _async_value(employee))
    inserted = _patch_employee_model(monkeypatch, employee)
    monkeypatch.setattr(users_module, "Department", SimpleNamespace(get=lambda _id: _async_value(None)))

    manager = user("manager-1", UserRole.MANAGER)

    response = await create_employee(
        email="emp2@demo.com",
        password="StrongPass1",
        first_name="New",
        last_name="Emp",
        lead_id=None,
        reports_to=None,
        department_id=None,
        designation=None,
        phone=None,
        current_user=manager,
    )

    assert response["message"] == "Employee created successfully"
    assert inserted[0].reports_to == "manager-1"
