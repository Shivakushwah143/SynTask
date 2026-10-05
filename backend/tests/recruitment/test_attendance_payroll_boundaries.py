"""
Phase 4/11 — Attendance payroll boundary + leave classification regression tests.

- Pre-joining / post-exit days are never classified ABSENT: the period summary
  is constrained to the employment overlap (joining_date .. last_working_day).
- Approved paid leave → PAID_LEAVE, approved unpaid leave → UNPAID_LEAVE,
  half-day → HALF_DAY, unresolvable classification → never silently paid.
"""
from contextlib import ExitStack

import pytest
from datetime import date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.attendance import HRAttendanceStatus
from app.models.leave import LeaveDuration, LeaveType
from app.services.attendance_payroll_adapter import get_employee_period_summary
from app.services.attendance_status_resolver import resolve_attendance_status

pytestmark = pytest.mark.asyncio

# Canned resolver result — keeps the boundary tests focused on the adapter.
_BASE_RESOLUTION = {
    "hr_status": HRAttendanceStatus.ABSENT.value,
    "actual_work_minutes": 0.0,
    "overtime_minutes": 0.0,
    "expected_work_minutes": 480.0,
    "is_late": False,
    "late_minutes": 0.0,
    "is_early_departure": False,
    "early_departure_minutes": 0.0,
    "is_holiday": False,
    "holiday_name": None,
    "is_week_off": False,
    "leave_paid": None,
    "status_source": "absent_no_record",
}


def _profile(joining_date=None, last_working_day=None):
    p = MagicMock()
    p.joining_date = joining_date
    p.last_working_day = last_working_day
    return p


def _find_to_list(items):
    """Model .find({...}).sort(...).to_list() chaining with a fixed result."""
    query = MagicMock()
    query.sort.return_value = query
    query.to_list = AsyncMock(return_value=items)
    return query


def _adapter_patches(profile):
    return [
        patch("app.services.attendance_payroll_adapter.get_active_policy", AsyncMock(return_value=MagicMock())),
        patch("app.services.attendance_payroll_adapter.EmployeeProfile.find_one", AsyncMock(return_value=profile)),
        patch("app.services.attendance_payroll_adapter.Attendance.find", MagicMock(return_value=_find_to_list([]))),
        patch("app.services.attendance_payroll_adapter.LeaveRequest.find", MagicMock(return_value=_find_to_list([]))),
        patch("app.services.attendance_payroll_adapter.get_holidays_in_range", AsyncMock(return_value=[])),
        patch("app.services.attendance_payroll_adapter.build_leave_type_map", AsyncMock(return_value={})),
        patch(
            "app.services.attendance_payroll_adapter.resolve_attendance_status",
            AsyncMock(return_value=dict(_BASE_RESOLUTION)),
        ),
    ]





# =============================================================================
# Employment boundaries
# =============================================================================

class TestEmploymentBoundaries:
    async def test_joining_boundary_excludes_pre_joining_days(self):
        """Joins Aug 15 → Aug 1–14 must be excluded (not ABSENT)."""
        profile = _profile(joining_date=datetime(2026, 8, 15), last_working_day=None)

        with ExitStack() as stack:
            for p in _adapter_patches(profile):
                stack.enter_context(p)
            result = await get_employee_period_summary(
                "company-1", "user-1", date(2026, 8, 1), date(2026, 8, 31),
            )

        assert result["employment_start"] == "2026-08-15"
        assert result["employment_overlap"] is True
        assert len(result["day_records"]) == 17  # Aug 15–31 inclusive
        assert result["summary"]["calendar_days"] == 17

    async def test_exit_boundary_excludes_post_exit_days(self):
        """Exits Aug 20 → Aug 21–31 must be excluded (not ABSENT)."""
        profile = _profile(joining_date=datetime(2026, 1, 1), last_working_day=datetime(2026, 8, 20))

        with ExitStack() as stack:
            for p in _adapter_patches(profile):
                stack.enter_context(p)
            result = await get_employee_period_summary(
                "company-1", "user-1", date(2026, 8, 1), date(2026, 8, 31),
            )

        assert result["employment_end"] == "2026-08-20"
        assert len(result["day_records"]) == 20  # Aug 1–20 inclusive
        assert result["summary"]["calendar_days"] == 20

    async def test_no_overlap_returns_empty(self):
        """Joins after the period → no employment overlap → empty summary."""
        profile = _profile(joining_date=datetime(2026, 9, 1), last_working_day=None)

        with ExitStack() as stack:
            for p in _adapter_patches(profile):
                stack.enter_context(p)
            result = await get_employee_period_summary(
                "company-1", "user-1", date(2026, 8, 1), date(2026, 8, 31),
            )

        assert result["employment_overlap"] is False
        assert result["day_records"] == []
        assert result["summary"]["calendar_days"] == 0

    async def test_full_period_employment_unclamped(self):
        """Employed for the whole period → every day evaluated."""
        profile = _profile(joining_date=datetime(2026, 1, 1), last_working_day=None)

        with ExitStack() as stack:
            for p in _adapter_patches(profile):
                stack.enter_context(p)
            result = await get_employee_period_summary(
                "company-1", "user-1", date(2026, 8, 1), date(2026, 8, 31),
            )

        assert result["employment_start"] is None or result["employment_start"] == "2026-01-01"
        assert len(result["day_records"]) == 31
        assert result["summary"]["calendar_days"] == 31


# =============================================================================
# Leave paid/unpaid classification
# =============================================================================

def _leave(leave_type_id, duration=LeaveDuration.FULL_DAY, legacy=None):
    leave = MagicMock()
    leave.leave_type_id = leave_type_id
    leave.duration = duration
    leave.leave_type = LeaveType(legacy) if legacy else None
    leave.start_date = datetime(2026, 8, 10)
    leave.end_date = datetime(2026, 8, 10, 23, 59, 59)
    return leave


def _policy():
    policy = MagicMock()
    policy.work_week = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    return policy


class TestLeaveClassification:
    async def test_paid_leave_classified_paid(self):
        """Approved paid leave → PAID_LEAVE via LeaveTypeConfig.is_paid."""
        leave = _leave("lt-paid")
        type_map = {"lt-paid": MagicMock(is_paid=True)}

        result = await resolve_attendance_status(
            company_id="company-1",
            employee_id="user-1",
            attendance_date=date(2026, 8, 10),
            policy=_policy(),
            approved_leaves=[leave],
            type_map=type_map,
        )

        assert result["hr_status"] == HRAttendanceStatus.PAID_LEAVE.value
        assert result["leave_paid"] is True
        assert result["status_source"] == "paid_leave"

    async def test_unpaid_leave_classified_unpaid(self):
        """Approved unpaid leave → UNPAID_LEAVE via LeaveTypeConfig.is_paid."""
        leave = _leave("lt-unpaid")
        type_map = {"lt-unpaid": MagicMock(is_paid=False)}

        result = await resolve_attendance_status(
            company_id="company-1",
            employee_id="user-1",
            attendance_date=date(2026, 8, 10),
            policy=_policy(),
            approved_leaves=[leave],
            type_map=type_map,
        )

        assert result["hr_status"] == HRAttendanceStatus.UNPAID_LEAVE.value
        assert result["leave_paid"] is False
        assert result["status_source"] == "unpaid_leave"

    async def test_unresolvable_leave_never_paid(self):
        """Unknown leave type (no config, no legacy signal) → never silently paid."""
        leave = _leave("lt-unknown")
        with patch(
            "app.services.leave_service.get_leave_type_config", AsyncMock(return_value=None)
        ):
            result = await resolve_attendance_status(
                company_id="company-1",
                employee_id="user-1",
                attendance_date=date(2026, 8, 10),
                policy=_policy(),
                approved_leaves=[leave],
                type_map={},
            )

        assert result["hr_status"] == HRAttendanceStatus.UNPAID_LEAVE.value
        assert result["leave_paid"] is None
        assert result["status_source"] == "leave_unclassified"

    async def test_half_day_paid_leave(self):
        """Half-day paid leave → HALF_DAY (0.5 payable factor), not full paid."""
        leave = _leave("lt-paid", duration=LeaveDuration.HALF_DAY)
        type_map = {"lt-paid": MagicMock(is_paid=True)}

        result = await resolve_attendance_status(
            company_id="company-1",
            employee_id="user-1",
            attendance_date=date(2026, 8, 10),
            policy=_policy(),
            approved_leaves=[leave],
            type_map=type_map,
        )

        assert result["hr_status"] == HRAttendanceStatus.HALF_DAY.value
        assert result["status_source"] == "half_day_leave"

    async def test_half_day_unpaid_leave(self):
        """Half-day unpaid leave → HALF_DAY too (duration governs the fraction)."""
        leave = _leave("lt-unpaid", duration=LeaveDuration.HALF_DAY)
        type_map = {"lt-unpaid": MagicMock(is_paid=False)}

        result = await resolve_attendance_status(
            company_id="company-1",
            employee_id="user-1",
            attendance_date=date(2026, 8, 10),
            policy=_policy(),
            approved_leaves=[leave],
            type_map=type_map,
        )

        assert result["hr_status"] == HRAttendanceStatus.HALF_DAY.value
        assert result["leave_paid"] is False

    async def test_legacy_paid_leave_falls_back(self):
        """Legacy sick_leave request (no leave_type_id) → paid via legacy mapping."""
        leave = _leave(None, legacy="sick_leave")

        result = await resolve_attendance_status(
            company_id="company-1",
            employee_id="user-1",
            attendance_date=date(2026, 8, 10),
            policy=_policy(),
            approved_leaves=[leave],
            type_map={},
        )

        assert result["hr_status"] == HRAttendanceStatus.PAID_LEAVE.value
        assert result["leave_paid"] is True
