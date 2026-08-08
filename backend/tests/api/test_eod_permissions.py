"""
EOD report visibility permission tests.

Covers `_visible_employees` in the EOD endpoints. SUB_ADMIN must mirror ADMIN
(see repo memory: "Role gates: SUB_ADMIN must mirror ADMIN") and see all active
employees in the company. Regression test for the /eod page feedback where a
sub-admin could not see anyone else's EOD reports.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.user import UserRole, UserStatus
from app.api.v1.endpoints import eod as eod_endpoints


def user(user_id, role, *, company_id="company-1", reports_to=None, ancestors=None, status=UserStatus.ACTIVE):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        reports_to=reports_to,
        ancestors=ancestors or [],
        status=status,
    )


def _expr(tag):
    """Sentinel for a Beanie class-level field expression (e.g. User.company_id)."""
    return SimpleNamespace(
        __eq__=lambda self, other: f"{tag}=={other}",
        __ne__=lambda self, other: f"{tag}!={other}",
    )


def _install_user_find(monkeypatch, users):
    class FakeQuery:
        def __init__(self, users):
            self.users = users

        async def to_list(self):
            return self.users

    def fake_find(*args, **kwargs):
        return FakeQuery(users)

    monkeypatch.setattr(eod_endpoints.User, "find", staticmethod(fake_find))
    monkeypatch.setattr(eod_endpoints.User, "role", _expr("role"), raising=False)
    monkeypatch.setattr(eod_endpoints.User, "status", _expr("status"), raising=False)
    monkeypatch.setattr(eod_endpoints.User, "company_id", _expr("company_id"), raising=False)


@pytest.mark.asyncio
async def test_sub_admin_sees_all_company_employees_like_admin(monkeypatch):
    company_users = [
        user("admin-1", UserRole.ADMIN),
        user("subadmin-1", UserRole.SUB_ADMIN),
        user("manager-1", UserRole.MANAGER),
        user("lead-1", UserRole.LEAD),
        user("employee-1", UserRole.EMPLOYEE),
    ]
    _install_user_find(monkeypatch, company_users)

    sub_admin_visible = await eod_endpoints._visible_employees(user("subadmin-1", UserRole.SUB_ADMIN))
    admin_visible = await eod_endpoints._visible_employees(user("admin-1", UserRole.ADMIN))

    assert {str(u.id) for u in sub_admin_visible} == {u.id for u in company_users}
    assert {str(u.id) for u in admin_visible} == {str(u.id) for u in sub_admin_visible}


@pytest.mark.asyncio
async def test_sub_admin_visible_employees_respect_company_scope(monkeypatch):
    _install_user_find(monkeypatch, [user("employee-1", UserRole.EMPLOYEE)])

    visible = await eod_endpoints._visible_employees(user("subadmin-1", UserRole.SUB_ADMIN))
    assert [str(u.id) for u in visible] == ["employee-1"]


@pytest.mark.asyncio
async def test_employee_sees_only_self():
    employee = user("employee-1", UserRole.EMPLOYEE)
    visible = await eod_endpoints._visible_employees(employee)
    assert [str(u.id) for u in visible] == ["employee-1"]


@pytest.mark.asyncio
async def test_manager_sees_self_and_subordinates():
    manager = user("manager-1", UserRole.MANAGER)
    subordinate = user("employee-1", UserRole.EMPLOYEE, reports_to="manager-1", ancestors=["manager-1"])
    manager.get_all_subordinates = lambda: _awaitable([subordinate])

    visible = await eod_endpoints._visible_employees(manager)
    assert {str(u.id) for u in visible} == {"manager-1", "employee-1"}


@pytest.mark.asyncio
async def test_lead_sees_self_and_subordinates():
    lead = user("lead-1", UserRole.LEAD)
    subordinate = user("employee-1", UserRole.EMPLOYEE, reports_to="lead-1", ancestors=["lead-1"])
    lead.get_all_subordinates = lambda: _awaitable([subordinate])

    visible = await eod_endpoints._visible_employees(lead)
    assert {str(u.id) for u in visible} == {"lead-1", "employee-1"}


@pytest.mark.asyncio
async def test_super_admin_sees_all_non_super_admin_active_users(monkeypatch):
    _install_user_find(monkeypatch, [user("admin-1", UserRole.ADMIN), user("employee-1", UserRole.EMPLOYEE)])

    visible = await eod_endpoints._visible_employees(user("super-1", UserRole.SUPER_ADMIN))
    assert {str(u.id) for u in visible} == {"admin-1", "employee-1"}


@pytest.mark.asyncio
async def test_user_without_company_gets_400():
    with pytest.raises(HTTPException) as exc:
        await eod_endpoints._visible_employees(user("admin-1", UserRole.ADMIN, company_id=None))
    assert exc.value.status_code == 400
    assert "company" in exc.value.detail


async def _awaitable(value):
    return value
