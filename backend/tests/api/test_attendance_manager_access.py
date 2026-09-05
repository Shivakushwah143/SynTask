"""Regression coverage for Manager biometric mapping and attendance visibility."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.dependencies import get_current_company_admin_or_manager
from app.api.v1 import endpoints as endpoints_module
from app.models.user import UserRole

attendance_module = endpoints_module.attendance


def user(user_id: str, role: UserRole, company_id: str = "company-1"):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id)


class EmptyAttendanceQuery:
    def sort(self, *_args):
        return self

    async def to_list(self):
        return []


@pytest.mark.asyncio
async def test_manager_is_allowed_to_manage_biometric_mappings():
    manager = user("manager-1", UserRole.MANAGER)

    assert await get_current_company_admin_or_manager(current_user=manager) is manager


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.LEAD, UserRole.EMPLOYEE])
async def test_lead_and_employee_cannot_manage_biometric_mappings(role):
    with pytest.raises(HTTPException) as exc_info:
        await get_current_company_admin_or_manager(current_user=user("user-1", role))

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_manager_history_is_limited_to_their_company(monkeypatch):
    captured_query = {}

    def find(query):
        captured_query.update(query)
        return EmptyAttendanceQuery()

    monkeypatch.setattr(attendance_module, "Attendance", SimpleNamespace(find=find))

    await attendance_module._attendance_history_records(
        user("manager-1", UserRole.MANAGER),
        start_date=None,
        end_date=None,
        employee_id=None,
        status=None,
        self_only=False,
    )

    assert captured_query == {"company_id": "company-1"}


@pytest.mark.asyncio
async def test_manager_cannot_request_another_companys_employee_history(monkeypatch):
    async def get_user(_employee_id):
        return user("employee-2", UserRole.EMPLOYEE, company_id="company-2")

    monkeypatch.setattr(attendance_module.User, "get", get_user)

    with pytest.raises(HTTPException) as exc_info:
        await attendance_module._attendance_history_records(
            user("manager-1", UserRole.MANAGER),
            start_date=None,
            end_date=None,
            employee_id="employee-2",
            status=None,
            self_only=False,
        )

    assert exc_info.value.status_code == 404
