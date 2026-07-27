from types import SimpleNamespace
from datetime import datetime, timedelta
import pytest
from fastapi import HTTPException

from app.models.leave import LeaveStatus, LeaveType
from app.models.user import UserRole
from app.services import leave_service


def mock_user(user_id, role, company_id="company-1", reports_to=None, ancestors=None):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        reports_to=reports_to,
        ancestors=ancestors or [],
    )


def test_parse_leave_date_valid_and_invalid():
    # Valid date string YYYY-MM-DD
    parsed_start = leave_service.parse_leave_date("2026-08-10")
    assert isinstance(parsed_start, datetime)
    assert parsed_start.year == 2026
    assert parsed_start.month == 8
    assert parsed_start.day == 10

    # Valid end of day
    parsed_end = leave_service.parse_leave_date("2026-08-10", end_of_day=True)
    assert parsed_end.hour == 23
    assert parsed_end.minute == 59

    # Invalid empty date
    with pytest.raises(HTTPException) as exc_1:
        leave_service.parse_leave_date("")
    assert exc_1.value.status_code == 400

    # Invalid string format
    with pytest.raises(HTTPException) as exc_2:
        leave_service.parse_leave_date("invalid-date-string")
    assert exc_2.value.status_code == 400
    assert "Invalid date format" in exc_2.value.detail


@pytest.mark.asyncio
async def test_initial_pending_reviewers_fallbacks(monkeypatch):
    emp = mock_user("emp-1", UserRole.EMPLOYEE)
    mgr = mock_user("mgr-1", UserRole.MANAGER)
    admin = mock_user("admin-1", UserRole.ADMIN)

    # If employee has manager
    async def fake_nearest(employee):
        return mgr
    monkeypatch.setattr(leave_service, "nearest_manager", fake_nearest)
    reviewers = await leave_service.initial_pending_reviewers(emp)
    assert reviewers == ["mgr-1"]

    # If manager has company admin
    async def fake_admins(company_id):
        return ["admin-1"]
    monkeypatch.setattr(leave_service, "company_admin_ids", fake_admins)
    reviewers_mgr = await leave_service.initial_pending_reviewers(mgr)
    assert reviewers_mgr == ["admin-1"]

    # If admin submits, review goes to other admins or self
    reviewers_admin = await leave_service.initial_pending_reviewers(admin)
    assert reviewers_admin == ["admin-1"]
