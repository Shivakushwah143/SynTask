"""
User update permission tests.

Covers the relaxed edit rule: any company-scoped role (Admin/Sub Admin/Manager/
Lead) may edit any user in their company - no creator/department/team
restriction. Company isolation and the employee-can't-edit-others guard stay.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.dependencies import get_current_company_admin_or_lead
from app.api.v1 import endpoints as endpoints_module
from app.models.user import UserRole

users_module = endpoints_module.users
update_user = users_module.update_user


async def _async_value(value):
    return value


def user(user_id, role, company_id="company-1", department_id=None):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id, department_id=department_id)


def target_employee(**overrides):
    data = {
        "id": "emp-1",
        "role": UserRole.EMPLOYEE,
        "company_id": "company-1",
        "department_id": "dept-2",
        "lead_id": "lead-other",
        "first_name": "Old",
        "last_name": "Name",
        "email": "emp1@demo.com",
        "phone": None,
        "updated_at": None,
        "save": lambda *a, **k: _async_value(None),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.mark.asyncio
async def test_manager_can_update_employee_from_another_department(monkeypatch):
    employee = target_employee()
    monkeypatch.setattr(users_module, "User", SimpleNamespace(get=lambda _uid: _async_value(employee)))

    manager = user("manager-1", UserRole.MANAGER, department_id="dept-1")

    response = await update_user(
        user_id="emp-1",
        first_name="Renamed",
        last_name=None,
        email=None,
        phone=None,
        department_id=None,
        designation=None,
        current_user=manager,
    )

    assert response["message"] == "User updated successfully"
    assert employee.first_name == "Renamed"


@pytest.mark.asyncio
async def test_lead_can_update_any_employee_in_company(monkeypatch):
    # Employee was created by/assigned to a different lead - editing is allowed.
    employee = target_employee()
    monkeypatch.setattr(users_module, "User", SimpleNamespace(get=lambda _uid: _async_value(employee)))

    lead = user("lead-1", UserRole.LEAD)

    response = await update_user(
        user_id="emp-1",
        first_name="Renamed By Lead",
        last_name=None,
        email=None,
        phone=None,
        department_id=None,
        designation=None,
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
    monkeypatch.setattr(users_module, "User", SimpleNamespace(get=lambda _uid: _async_value(employee)))

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
            current_user=manager,
        )

    assert exc_info.value.status_code == 403
    assert employee.first_name == "Old"


@pytest.mark.asyncio
async def test_update_missing_user_returns_404(monkeypatch):
    monkeypatch.setattr(users_module, "User", SimpleNamespace(get=lambda _uid: _async_value(None)))

    with pytest.raises(HTTPException) as exc_info:
        await update_user(
            user_id="missing",
            first_name="X",
            last_name=None,
            email=None,
            phone=None,
            department_id=None,
            designation=None,
            current_user=user("manager-1", UserRole.MANAGER),
        )

    assert exc_info.value.status_code == 404
