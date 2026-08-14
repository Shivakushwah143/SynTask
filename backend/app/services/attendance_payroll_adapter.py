"""
Phase 4 — Payroll Attendance Adapter.

Provides deterministic, serializable attendance summaries for a payroll period.
Does NOT calculate salary, deductions, or net pay — only attendance input.

Future Phase 6 Payroll will consume this service to get attendance data
without directly querying raw attendance records.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional

from app.core.clock import utc_now
from app.models.attendance import (
    Attendance,
    AttendancePolicy,
    HRAttendanceStatus,
)
from app.models.leave import LeaveRequest, LeaveStatus, LeaveTypeConfig
from app.models.user import User
from app.services.attendance_holiday_service import get_holidays_in_range, is_holiday
from app.services.attendance_policy_service import get_active_policy
from app.services.attendance_status_resolver import (
    resolve_attendance_status,
    get_payable_factor,
    policy_today_str,
)
from app.services.leave_service import build_leave_type_map

logger = logging.getLogger(__name__)


async def get_employee_period_summary(
    company_id: str,
    employee_id: str,
    period_start: date,
    period_end: date,
    policy: Optional[AttendancePolicy] = None,
) -> Dict[str, Any]:
    """Generate a complete attendance summary for one employee in a date range.
    
    Returns:
      - employee_id
      - period_start, period_end
      - day_records: list of day-level records
      - summary: aggregated counts
    """
    if not policy:
        policy = await get_active_policy(company_id)
    
    # Batch-fetch all attendance records in range
    start_str = period_start.strftime("%Y-%m-%d")
    end_str = period_end.strftime("%Y-%m-%d")
    
    attendance_records = await Attendance.find({
        "company_id": company_id,
        "employee_id": employee_id,
        "date": {"$gte": start_str, "$lte": end_str},
    }).to_list()
    attendance_by_date = {r.date: r for r in attendance_records}
    
    # Batch-fetch approved leaves overlapping the range
    approved_leaves = await LeaveRequest.find({
        "company_id": company_id,
        "employee_id": employee_id,
        "status": LeaveStatus.APPROVED.value,
        "start_date": {"$lte": datetime.combine(period_end, time.max)},
        "end_date": {"$gte": datetime.combine(period_start, time.min)},
    }).to_list()
    
    # Fetch holidays
    holidays = await get_holidays_in_range(company_id, period_start, period_end)
    holiday_dates = {h.date.date() if isinstance(h.date, datetime) else h.date: h for h in holidays}
    
    # Build leave type map
    leave_type_ids = [l.leave_type_id for l in approved_leaves if l.leave_type_id]
    type_map = await build_leave_type_map(company_id, leave_type_ids) if leave_type_ids else {}
    
    # Resolve day-by-day status
    day_records = []
    current_date = period_start
    while current_date <= period_end:
        attendance = attendance_by_date.get(current_date.strftime("%Y-%m-%d"))
        holiday = holiday_dates.get(current_date)
        
        # Filter leaves applicable to this day
        day_leaves = [
            l for l in approved_leaves
            if _leave_covers_date(l, current_date)
        ]
        
        resolution = await resolve_attendance_status(
            company_id=company_id,
            employee_id=employee_id,
            attendance_date=current_date,
            policy=policy,
            attendance=attendance,
            approved_leaves=day_leaves,
            holiday=holiday,
        )
        
        hr_status = resolution["hr_status"]
        actual_work = resolution["actual_work_minutes"]
        overtime = resolution["overtime_minutes"]
        break_minutes = (attendance.break_duration or 0) / 60.0 if attendance else 0.0
        
        # Leave info
        leave_info = None
        if day_leaves:
            leave = day_leaves[0]  # Primary leave for the day
            type_config = type_map.get(leave.leave_type_id) if leave.leave_type_id else None
            leave_info = {
                "leave_type_id": leave.leave_type_id,
                "leave_type_name": type_config.name if type_config else None,
                "leave_paid": resolution.get("leave_paid"),
                "duration": leave.duration.value if leave.duration else None,
            }
        
        day_record = {
            "date": current_date.strftime("%Y-%m-%d"),
            "status": hr_status,
            "expected_work_minutes": resolution["expected_work_minutes"],
            "actual_work_minutes": round(actual_work, 2),
            "break_minutes": round(break_minutes, 2),
            "overtime_minutes": round(overtime, 2),
            "is_late": resolution["is_late"],
            "late_minutes": resolution["late_minutes"],
            "is_early_departure": resolution["is_early_departure"],
            "early_departure_minutes": resolution["early_departure_minutes"],
            "is_holiday": resolution["is_holiday"],
            "holiday_name": resolution["holiday_name"],
            "is_week_off": resolution["is_week_off"],
            "leave": leave_info,
            "payable_factor": get_payable_factor(hr_status),
            "status_source": resolution["status_source"],
        }
        day_records.append(day_record)
        current_date += timedelta(days=1)
    
    # Aggregate summary
    summary = _aggregate_summary(day_records)
    
    return {
        "employee_id": employee_id,
        "period_start": start_str,
        "period_end": end_str,
        "day_records": day_records,
        "summary": summary,
    }


async def get_company_period_summary(
    company_id: str,
    period_start: date,
    period_end: date,
) -> Dict[str, Any]:
    """Generate attendance summaries for all employees in a company for a period.
    
    Batch-friendly: fetches all records once and groups by employee.
    """
    start_str = period_start.strftime("%Y-%m-%d")
    end_str = period_end.strftime("%Y-%m-%d")
    
    # Batch-fetch all attendance records for the company in range
    all_attendance = await Attendance.find({
        "company_id": company_id,
        "date": {"$gte": start_str, "$lte": end_str},
    }).to_list()
    
    # Group by employee
    by_employee: Dict[str, list] = {}
    for record in all_attendance:
        by_employee.setdefault(record.employee_id, []).append(record)
    
    # Fetch all approved leaves in range
    all_leaves = await LeaveRequest.find({
        "company_id": company_id,
        "status": LeaveStatus.APPROVED.value,
        "start_date": {"$lte": datetime.combine(period_end, time.max)},
        "end_date": {"$gte": datetime.combine(period_start, time.min)},
    }).to_list()
    leaves_by_employee: Dict[str, list] = {}
    for leave in all_leaves:
        leaves_by_employee.setdefault(leave.employee_id, []).append(leave)
    
    # Fetch holidays once
    holidays = await get_holidays_in_range(company_id, period_start, period_end)
    
    policy = await get_active_policy(company_id)
    
    # Build summaries per employee
    employee_summaries = []
    for emp_id in set(list(by_employee.keys()) + list(leaves_by_employee.keys())):
        emp_summary = await get_employee_period_summary(
            company_id=company_id,
            employee_id=emp_id,
            period_start=period_start,
            period_end=period_end,
            policy=policy,
        )
        employee_summaries.append(emp_summary)
    
    return {
        "company_id": company_id,
        "period_start": start_str,
        "period_end": end_str,
        "employee_count": len(employee_summaries),
        "employee_summaries": employee_summaries,
    }


def _leave_covers_date(leave: LeaveRequest, check_date: date) -> bool:
    """Check if a leave request covers a specific date."""
    leave_start = leave.start_date.date() if isinstance(leave.start_date, datetime) else leave.start_date
    leave_end = leave.end_date.date() if isinstance(leave.end_date, datetime) else leave.end_date
    return leave_start <= check_date <= leave_end


def _aggregate_summary(day_records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate day-level records into a period summary."""
    calendar_days = len(day_records)
    working_days = 0
    present_days = 0
    paid_leave_days = 0
    unpaid_leave_days = 0
    absent_days = 0
    half_days = 0
    holiday_days = 0
    week_off_days = 0
    payable_days = 0.0
    total_work_minutes = 0.0
    total_overtime_minutes = 0.0
    late_count = 0
    early_departure_count = 0
    
    for day in day_records:
        status = day["status"]
        factor = day["payable_factor"]
        is_working = not day["is_holiday"] and not day["is_week_off"]
        
        if is_working:
            working_days += 1
        
        if status == HRAttendanceStatus.PRESENT.value:
            present_days += 1
        elif status == HRAttendanceStatus.IN_PROGRESS.value:
            present_days += 1
        elif status == HRAttendanceStatus.PAID_LEAVE.value:
            paid_leave_days += 1
        elif status == HRAttendanceStatus.UNPAID_LEAVE.value:
            unpaid_leave_days += 1
        elif status == HRAttendanceStatus.HALF_DAY.value:
            half_days += 1
        elif status == HRAttendanceStatus.HOLIDAY.value:
            holiday_days += 1
        elif status == HRAttendanceStatus.WEEK_OFF.value:
            week_off_days += 1
        elif status == HRAttendanceStatus.ABSENT.value:
            absent_days += 1
        
        payable_days += factor
        total_work_minutes += day.get("actual_work_minutes", 0)
        total_overtime_minutes += day.get("overtime_minutes", 0)
        if day.get("is_late"):
            late_count += 1
        if day.get("is_early_departure"):
            early_departure_count += 1
    
    return {
        "calendar_days": calendar_days,
        "working_days": working_days,
        "present_days": present_days,
        "paid_leave_days": paid_leave_days,
        "unpaid_leave_days": unpaid_leave_days,
        "absent_days": absent_days,
        "half_days": half_days,
        "holiday_days": holiday_days,
        "week_off_days": week_off_days,
        "payable_days": round(payable_days, 2),
        "total_work_minutes": round(total_work_minutes, 2),
        "total_overtime_minutes": round(total_overtime_minutes, 2),
        "late_count": late_count,
        "early_departure_count": early_departure_count,
    }
