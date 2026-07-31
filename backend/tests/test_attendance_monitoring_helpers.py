"""Unit tests for attendance live-monitoring access helpers.

Covers the role matrix for ``user_can_monitor`` with a focus on the
SUB_ADMIN role, which mirrors ADMIN for company-scoped live monitoring.
"""
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints.attendance import user_can_monitor
from app.models.user import UserRole


def _user(role: UserRole, company_id: str = "company-a") -> SimpleNamespace:
    return SimpleNamespace(id="user-1", role=role, company_id=company_id)


@pytest.mark.asyncio
async def test_sub_admin_can_monitor_employee_in_same_company():
    sub_admin = _user(UserRole.SUB_ADMIN, "company-a")
    employee = _user(UserRole.EMPLOYEE, "company-a")

    assert await user_can_monitor(sub_admin, employee) is True


@pytest.mark.asyncio
async def test_sub_admin_cannot_monitor_admin_user():
    sub_admin = _user(UserRole.SUB_ADMIN, "company-a")
    admin = _user(UserRole.ADMIN, "company-a")

    assert await user_can_monitor(sub_admin, admin) is False


@pytest.mark.asyncio
async def test_sub_admin_cannot_monitor_employee_in_other_company():
    sub_admin = _user(UserRole.SUB_ADMIN, "company-a")
    employee = _user(UserRole.EMPLOYEE, "company-b")

    assert await user_can_monitor(sub_admin, employee) is False


@pytest.mark.asyncio
async def test_admin_can_monitor_employee_in_same_company():
    admin = _user(UserRole.ADMIN, "company-a")
    employee = _user(UserRole.EMPLOYEE, "company-a")

    assert await user_can_monitor(admin, employee) is True


@pytest.mark.asyncio
async def test_employee_cannot_monitor_anyone():
    employee = _user(UserRole.EMPLOYEE, "company-a")
    target = _user(UserRole.EMPLOYEE, "company-a")

    assert await user_can_monitor(employee, target) is False
