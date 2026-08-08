"""
Timesheet team-view permission tests.

Covers the team timesheet gates in the timesheet endpoints. SUB_ADMIN must
mirror ADMIN (see repo memory: "Role gates: SUB_ADMIN must mirror ADMIN") and
be able to view team timesheets / timesheet lists, while EMPLOYEE stays denied.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.user import UserRole
from app.api.v1.endpoints import timesheet as timesheet_endpoints


def user(user_id, role, *, company_id="company-1"):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        first_name="Test",
        last_name="User",
        email=f"{user_id}@test.com",
    )


class FakeQuery:
    def __init__(self, items):
        self.items = items

    async def to_list(self):
        return self.items

    def sort(self, *args, **kwargs):
        return self


def _install_team_timesheet_mocks(monkeypatch, users):
    async def fake_get(uid):
        return users[0] if users else None

    monkeypatch.setattr(timesheet_endpoints.User, "find", staticmethod(lambda *a, **k: FakeQuery(users)))
    monkeypatch.setattr(timesheet_endpoints.TimesheetEntry, "find", staticmethod(lambda *a, **k: FakeQuery([])))
    monkeypatch.setattr(timesheet_endpoints.User, "get", staticmethod(fake_get))


@pytest.mark.asyncio
async def test_sub_admin_can_view_team_timesheet(monkeypatch):
    sub_admin = user("subadmin-1", UserRole.SUB_ADMIN)
    employee = user("employee-1", UserRole.EMPLOYEE)
    _install_team_timesheet_mocks(monkeypatch, [employee])

    result = await timesheet_endpoints.get_team_timesheet(current_user=sub_admin, start_date=None, end_date=None, employee_id=None)
    assert result["timesheet_data"] == {}
    assert result["user_data"]["employee-1"]["name"] == "Test User"


@pytest.mark.asyncio
async def test_admin_can_view_team_timesheet(monkeypatch):
    admin = user("admin-1", UserRole.ADMIN)
    employee = user("employee-1", UserRole.EMPLOYEE)
    _install_team_timesheet_mocks(monkeypatch, [employee])

    result = await timesheet_endpoints.get_team_timesheet(current_user=admin, start_date=None, end_date=None, employee_id=None)
    assert result["timesheet_data"] == {}


@pytest.mark.asyncio
async def test_employee_cannot_view_team_timesheet():
    with pytest.raises(HTTPException) as exc:
        await timesheet_endpoints.get_team_timesheet(current_user=user("employee-1", UserRole.EMPLOYEE), start_date=None, end_date=None, employee_id=None)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_sub_admin_can_view_timesheet_list(monkeypatch):
    sub_admin = user("subadmin-1", UserRole.SUB_ADMIN)
    employee = user("employee-1", UserRole.EMPLOYEE)

    monkeypatch.setattr(timesheet_endpoints.User, "find", staticmethod(lambda *a, **k: FakeQuery([employee])))
    monkeypatch.setattr(timesheet_endpoints.TimesheetSummary, "find", staticmethod(lambda *a, **k: FakeQuery([])))

    async def fake_find_one(*a, **k):
        return None

    monkeypatch.setattr(timesheet_endpoints.TimesheetEntry, "find_one", staticmethod(fake_find_one))

    async def fake_get(uid):
        return employee

    monkeypatch.setattr(timesheet_endpoints.User, "get", staticmethod(fake_get))

    result = await timesheet_endpoints.get_timesheet_list(current_user=sub_admin)
    assert len(result["timesheet_list"]) == 1
    assert result["timesheet_list"][0]["user_id"] == "employee-1"
    assert result["timesheet_list"][0]["name"] == "Test User"


@pytest.mark.asyncio
async def test_employee_cannot_view_timesheet_list():
    with pytest.raises(HTTPException) as exc:
        await timesheet_endpoints.get_timesheet_list(current_user=user("employee-1", UserRole.EMPLOYEE))
    assert exc.value.status_code == 403