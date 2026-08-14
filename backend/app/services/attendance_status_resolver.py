"""
Phase 4 — Attendance Status Resolver.

Centralized service that determines the HR/payroll-ready status for any
employee on any given date, using attendance records + leave + holiday + week-off.

Status precedence (highest to lowest):
  1. HOLIDAY (if the date is a company holiday)
  2. WEEK_OFF (if the date falls on a non-working day per policy)
  3. PAID_LEAVE / UNPAID_LEAVE (if approved leave covers the day)
  4. HALF_DAY (if half-day leave + partial work, or policy half-day threshold)
  5. PRESENT (if attendance record with sufficient work)
  6. IN_PROGRESS (if currently checked in)
  7. ABSENT (if expected workday with no record/leave)
  8. NO_RECORD (if no policy applies or day not yet evaluated)
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Tuple

import pytz

from app.core.clock import utc_now
from app.models.attendance import (
    Attendance,
    AttendanceStatus,
    AttendancePolicy,
    HRAttendanceStatus,
)
from app.models.leave import LeaveDuration, LeaveRequest, LeaveStatus, LeaveType, LeaveTypeConfig
from app.models.user import User

logger = logging.getLogger(__name__)

# Day abbreviation mapping (policy uses Mon/Tue/...; Python weekday() returns 0=Mon)
DAY_ABBREV_MAP = {
    0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun",
}


def is_working_day(policy: AttendancePolicy, check_date: date) -> bool:
    """Check if a date is a working day according to the policy's work_week."""
    day_abbr = DAY_ABBREV_MAP.get(check_date.weekday(), "")
    return day_abbr in (policy.work_week or [])


def get_policy_date_key(policy: AttendancePolicy, utc_dt: datetime) -> str:
    """Convert a UTC datetime to the attendance date key in the company timezone."""
    tz = pytz.timezone(policy.timezone) if policy.timezone else pytz.UTC
    return utc_dt.astimezone(tz).strftime("%Y-%m-%d")


def policy_today_str(policy: AttendancePolicy) -> str:
    """Return today's date string in the company timezone."""
    tz = pytz.timezone(policy.timezone) if policy.timezone else pytz.UTC
    return datetime.now(tz).strftime("%Y-%m-%d")


def parse_policy_time(time_str: str) -> time:
    """Parse HH:MM time string from policy."""
    parts = time_str.split(":")
    return time(int(parts[0]), int(parts[1]))


def compute_late_minutes(
    policy: AttendancePolicy,
    login_time_utc: datetime,
) -> Tuple[bool, float]:
    """Compute whether login is late and by how many minutes.
    
    Uses policy expected_start_time + late_grace_minutes in company timezone.
    Returns (is_late, late_minutes).
    """
    tz = pytz.timezone(policy.timezone) if policy.timezone else pytz.UTC
    local_login = login_time_utc.astimezone(tz)
    
    expected_start = parse_policy_time(policy.expected_start_time)
    grace = policy.late_grace_minutes or 0.0
    
    # Deadline = expected_start + grace
    start_dt = datetime.combine(local_login.date(), expected_start)
    grace_dt = start_dt + timedelta(minutes=grace)
    
    if local_login > grace_dt:
        late_minutes = (local_login - grace_dt).total_seconds() / 60.0
        return True, round(late_minutes, 2)
    
    return False, 0.0


def compute_early_departure(
    policy: AttendancePolicy,
    logout_time_utc: datetime,
) -> Tuple[bool, float]:
    """Compute whether checkout is early and by how many minutes.
    
    Uses policy expected_end_time - early_departure_grace_minutes in company timezone.
    Returns (is_early, early_minutes).
    """
    tz = pytz.timezone(policy.timezone) if policy.timezone else pytz.UTC
    local_logout = logout_time_utc.astimezone(tz)
    
    expected_end = parse_policy_time(policy.expected_end_time)
    grace = policy.early_departure_grace_minutes or 0.0
    
    # Threshold = expected_end - grace
    end_dt = datetime.combine(local_logout.date(), expected_end)
    threshold_dt = end_dt - timedelta(minutes=grace)
    
    if local_logout < threshold_dt:
        early_minutes = (threshold_dt - local_logout).total_seconds() / 60.0
        return True, round(early_minutes, 2)
    
    return False, 0.0


def compute_overtime(
    policy: AttendancePolicy,
    actual_work_minutes: float,
) -> float:
    """Compute overtime minutes if enabled and threshold exceeded."""
    if not policy.overtime_enabled:
        return 0.0
    threshold = policy.overtime_after_minutes or policy.expected_work_minutes
    if actual_work_minutes > threshold:
        return round(actual_work_minutes - threshold, 2)
    return 0.0


async def _resolve_leave_paid(
    company_id: str,
    leave: LeaveRequest,
    type_map: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[bool], bool]:
    """Determine whether an approved leave is paid from the LeaveTypeConfig.

    Returns (is_paid, resolved). ``resolved`` is False when the leave type could
    not be found/classified — callers must never silently grant pay in that case.
    """
    leave_type_id = getattr(leave, "leave_type_id", None)
    if leave_type_id:
        if type_map and str(leave_type_id) in type_map:
            config = type_map[str(leave_type_id)]
            if config is not None:
                return bool(config.is_paid), True
        from app.services.leave_service import get_leave_type_config

        config = await get_leave_type_config(company_id, str(leave_type_id))
        if config:
            return bool(config.is_paid), True
    legacy_value = leave.leave_type.value if isinstance(leave.leave_type, LeaveType) else None
    from app.services.leave_service import _legacy_is_paid

    return _legacy_is_paid(legacy_value), False


async def resolve_attendance_status(
    company_id: str,
    employee_id: str,
    attendance_date: date,
    policy: Optional[AttendancePolicy] = None,
    attendance: Optional[Attendance] = None,
    approved_leaves: Optional[List[LeaveRequest]] = None,
    holiday: Optional[Any] = None,
    type_map: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Resolve the full HR status for an employee on a specific date.
    
    Returns a dict with:
      - hr_status: HRAttendanceStatus value
      - is_late, late_minutes
      - is_early_departure, early_departure_minutes
      - overtime_minutes
      - expected_work_minutes
      - actual_work_minutes
      - is_holiday, holiday_name
      - is_week_off
      - leave_type_id, leave_paid
      - status_source: what determined the status

    ``type_map`` (optional) maps leave_type_id -> LeaveTypeConfig for the
    caller's batch. When absent, the resolver resolves the config itself.
    """
    result = {
        "hr_status": HRAttendanceStatus.NO_RECORD.value,
        "is_late": False,
        "late_minutes": 0.0,
        "is_early_departure": False,
        "early_departure_minutes": 0.0,
        "overtime_minutes": 0.0,
        "expected_work_minutes": policy.expected_work_minutes if policy else 480.0,
        "actual_work_minutes": 0.0,
        "is_holiday": False,
        "holiday_name": None,
        "is_week_off": False,
        "leave_type_id": None,
        "leave_paid": None,
        "status_source": "no_record",
    }

    # 1. Check HOLIDAY
    if holiday:
        result["is_holiday"] = True
        result["holiday_name"] = holiday.name if hasattr(holiday, "name") else str(holiday)
        result["hr_status"] = HRAttendanceStatus.HOLIDAY.value
        result["status_source"] = "holiday"
        return result

    # 2. Check WEEK_OFF
    if policy and not is_working_day(policy, attendance_date):
        result["is_week_off"] = True
        result["hr_status"] = HRAttendanceStatus.WEEK_OFF.value
        result["status_source"] = "week_off"
        return result

    # 3. Check APPROVED LEAVE
    if approved_leaves:
        for leave in approved_leaves:
            leave_start = leave.start_date.date() if isinstance(leave.start_date, datetime) else leave.start_date
            leave_end = leave.end_date.date() if isinstance(leave.end_date, datetime) else leave.end_date
            if leave_start <= attendance_date <= leave_end:
                leave_type_id = getattr(leave, "leave_type_id", None)
                # Half-day leave consumes 0.5 of the day regardless of payability.
                is_half_day = (
                    leave.duration == LeaveDuration.HALF_DAY
                    or (leave.leave_type == LeaveType.HALF_DAY)
                )
                is_paid, _resolved = await _resolve_leave_paid(company_id, leave, type_map)

                if is_half_day:
                    result["hr_status"] = HRAttendanceStatus.HALF_DAY.value
                    result["status_source"] = "half_day_leave"
                elif is_paid is True:
                    result["hr_status"] = HRAttendanceStatus.PAID_LEAVE.value
                    result["status_source"] = "paid_leave"
                elif is_paid is False:
                    result["hr_status"] = HRAttendanceStatus.UNPAID_LEAVE.value
                    result["status_source"] = "unpaid_leave"
                else:
                    # Unresolvable classification: NEVER silently grant pay.
                    # Classify as unpaid (no salary credit) and surface a clear
                    # data warning through the status_source so callers can flag it.
                    result["hr_status"] = HRAttendanceStatus.UNPAID_LEAVE.value
                    result["status_source"] = "leave_unclassified"

                result["leave_type_id"] = leave_type_id
                result["leave_paid"] = is_paid
                return result

    # 4. Check ATTENDANCE RECORD
    if attendance:
        work_minutes = (attendance.total_working_hours or 0) / 60.0
        result["actual_work_minutes"] = round(work_minutes, 2)

        # Compute late / early / overtime using policy
        if policy:
            if attendance.login_time:
                is_late, late_min = compute_late_minutes(policy, attendance.login_time)
                result["is_late"] = is_late
                result["late_minutes"] = late_min

            if attendance.logout_time:
                is_early, early_min = compute_early_departure(policy, attendance.logout_time)
                result["is_early_departure"] = is_early
                result["early_departure_minutes"] = early_min

            result["overtime_minutes"] = compute_overtime(policy, work_minutes)

        # Determine status based on work duration
        status_val = attendance.status
        if status_val in (AttendanceStatus.WORKING, AttendanceStatus.ON_BREAK):
            result["hr_status"] = HRAttendanceStatus.IN_PROGRESS.value
            result["status_source"] = "in_progress"
        elif status_val in (AttendanceStatus.CHECKED_OUT, AttendanceStatus.OFFLINE):
            # Has attendance data — check if it meets minimum thresholds
            min_half = (policy.minimum_half_day_minutes if policy else 240.0)
            min_full = (policy.minimum_full_day_minutes if policy else 360.0)
            
            if work_minutes >= min_full:
                result["hr_status"] = HRAttendanceStatus.PRESENT.value
                result["status_source"] = "present_full"
            elif work_minutes >= min_half:
                # Half-day from attendance alone (no leave)
                result["hr_status"] = HRAttendanceStatus.HALF_DAY.value
                result["status_source"] = "present_half"
            elif work_minutes > 0:
                # Some work but below half-day threshold
                result["hr_status"] = HRAttendanceStatus.PRESENT.value
                result["status_source"] = "present_partial"
            else:
                # Checked in and out but no work time
                result["hr_status"] = HRAttendanceStatus.PRESENT.value
                result["status_source"] = "present_zero_work"
        else:
            # OFFLINE / other status with no login
            result["hr_status"] = HRAttendanceStatus.ABSENT.value
            result["status_source"] = "absent_no_work"

        return result

    # 5. No attendance record, no leave, no holiday, not week-off → ABSENT
    result["hr_status"] = HRAttendanceStatus.ABSENT.value
    result["status_source"] = "absent_no_record"
    return result


def get_payable_factor(hr_status: str) -> float:
    """Map HR attendance status to a payable factor for payroll.
    
    Returns a value between 0.0 and 1.0 indicating the fraction of the day
    that should be considered payable.
    """
    factors = {
        HRAttendanceStatus.PRESENT.value: 1.0,
        HRAttendanceStatus.IN_PROGRESS.value: 1.0,
        HRAttendanceStatus.PAID_LEAVE.value: 1.0,
        HRAttendanceStatus.HOLIDAY.value: 1.0,
        HRAttendanceStatus.WEEK_OFF.value: 1.0,
        HRAttendanceStatus.HALF_DAY.value: 0.5,
        HRAttendanceStatus.UNPAID_LEAVE.value: 0.0,
        HRAttendanceStatus.ABSENT.value: 0.0,
        HRAttendanceStatus.NO_RECORD.value: 0.0,
    }
    return factors.get(hr_status, 0.0)
