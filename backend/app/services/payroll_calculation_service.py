"""
Phase 6 — Payroll Calculation Service.

Centralized payroll calculation integrating:
- Phase 4 Attendance Payroll Adapter
- Phase 5 Salary Structure
- Employee eligibility
- Earnings / Deductions / Gross / Net
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from app.core.clock import utc_now
from app.models.employee_profile import EmployeeProfile, EmploymentStatus
from app.models.payroll import (
    PayrollEarningItem,
    PayrollDeductionItem,
    PayrollRecord,
    PayrollRecordStatus,
)
from app.models.salary import SalaryStructure, SalaryStatus
from app.models.user import User, UserRole
from app.services.attendance_payroll_adapter import get_employee_period_summary
from app.services.salary_structure_service import get_salary_snapshot_for_payroll

logger = logging.getLogger(__name__)

# Calculation version — increment when formula changes
CALCULATION_VERSION = 1

# Proration: use payable_days / calendar_days as the ratio
# This means unpaid leave/absence reduces proportionally.


def _round_currency(value: float) -> float:
    """Round to 2 decimal places using banker's rounding."""
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


async def calculate_employee_payroll(
    company_id: str,
    employee_id: str,
    period_start: date,
    period_end: date,
    employee_profile: Optional[EmployeeProfile] = None,
) -> Dict[str, Any]:
    """Calculate payroll for one employee in a period.

    Returns a dict with all data needed to create/update a PayrollRecord.
    """
    warnings: List[str] = []
    blockers: List[str] = []

    # 1. Get employee profile
    if not employee_profile:
        employee_profile = await EmployeeProfile.find_one({
            "company_id": company_id,
            "user_id": employee_id,
        })

    employee_name = None
    employee_number = None
    department = None
    designation = None
    employee_profile_id = None

    if employee_profile:
        employee_profile_id = str(employee_profile.id)
        employee_number = employee_profile.employee_number
        department = employee_profile.department_id
        designation = employee_profile.designation

        # Get user for name
        user = await User.get(employee_id)
        if user:
            employee_name = user.full_name()

    # 2. Get the Phase 5 payroll-ready salary snapshot (normalized dict/DTO).
    # Payroll NEVER reads the SalaryStructure model directly — the snapshot
    # adapter is the single integration boundary.
    #
    # For mid-month joiners the salary structure effective_from may fall after
    # period_start.  Try period_start first (covers full-month employees),
    # then fall back to period_end so a structure effective mid-period is found.
    salary_snapshot = await get_salary_snapshot_for_payroll(company_id, employee_id, period_start)
    if not salary_snapshot:
        salary_snapshot = await get_salary_snapshot_for_payroll(company_id, employee_id, period_end)
    if not salary_snapshot:
        blockers.append("No salary structure effective for this period")
        return {
            "status": PayrollRecordStatus.BLOCKED,
            "blockers": blockers,
            "warnings": warnings,
            "employee_id": employee_id,
            "employee_profile_id": employee_profile_id,
            "employee_name": employee_name,
            "employee_number": employee_number,
            "department": department,
            "designation": designation,
            "salary_structure_id": None,
            "salary_effective_from": None,
            "currency": "INR",
            "configured_earnings": 0.0,
            "configured_deductions": 0.0,
            "working_days": 0,
            "payable_days": 0.0,
            "earnings": [],
            "deductions": [],
            "gross_salary": 0.0,
            "total_deductions": 0.0,
            "net_salary": 0.0,
            "attendance_snapshot": {},
        }

    currency = salary_snapshot.get("currency", "INR")

    # Phase 11 closure: detect mid-period salary overlap.
    # If multiple salary structures are effective during this payroll period,
    # the calculation uses the one effective at period_start. This may silently
    # apply the wrong salary for part of the period. We emit a WARNING so HR
    # is aware and can split the period or schedule the salary revision between
    # periods.
    period_start_dt = datetime.combine(period_start, time.min)
    period_end_dt = datetime.combine(period_end, time.max)
    overlapping = await SalaryStructure.find({
        "company_id": company_id,
        "employee_id": employee_id,
        "effective_from": {"$lte": period_end_dt},
        "$or": [
            {"effective_to": None},
            {"effective_to": {"$gte": period_start_dt}},
        ],
    }).to_list()
    if len(overlapping) > 1:
        effective_ids = [str(s.id) for s in overlapping]
        warnings.append(
            f"Multiple salary structures overlap this payroll period "
            f"({len(overlapping)} structures). The one effective on "
            f"period_start ({period_start}) is used for the full month. "
            f"Consider splitting the period or rescheduling the salary "
            f"revision to a period boundary."
        )

    # 3. Get attendance summary
    try:
        attendance_data = await get_employee_period_summary(
            company_id, employee_id, period_start, period_end
        )
        att_summary = attendance_data.get("summary", {})
    except Exception as e:
        logger.warning("Attendance summary failed for %s: %s", employee_id, e)
        # Do NOT silently default to zero earnings with full deductions.
        # Block the record so HR sees a clear reason and can retry after
        # fixing the attendance/leave data issue.
        blockers.append(
            f"Attendance data unavailable: {str(e)} — "
            "cannot calculate payroll without attendance summary"
        )
        return {
            "status": PayrollRecordStatus.BLOCKED,
            "blockers": blockers,
            "warnings": warnings,
            "employee_id": employee_id,
            "employee_profile_id": employee_profile_id,
            "employee_name": employee_name,
            "employee_number": employee_number,
            "department": department,
            "designation": designation,
            "salary_structure_id": salary_snapshot.get("salary_structure_id"),
            "salary_effective_from": salary_snapshot.get("effective_from"),
            "currency": salary_snapshot.get("currency", "INR"),
            "configured_earnings": salary_snapshot.get("total_earnings", 0.0),
            "configured_deductions": salary_snapshot.get("total_configured_deductions", 0.0),
            "working_days": 0,
            "payable_days": 0.0,
            "earnings": [],
            "deductions": [],
            "gross_salary": 0.0,
            "total_deductions": 0.0,
            "net_salary": 0.0,
            "attendance_snapshot": {},
        }

    working_days = att_summary.get("working_days", 0)
    payable_days = att_summary.get("payable_days", 0.0)
    # Proration denominator: always the full payroll period length, NOT the
    # employee-clamped attendance window.  For a mid-month joiner (e.g. Aug 15)
    # the attendance adapter returns calendar_days=17 (Aug 15-31).  Using that
    # as the denominator overstates the proration factor.  The correct denominator
    # is the full period (31 days for August) so that partial-month salary is
    # calculated proportionally against the month, not against the employment
    # overlap.
    calendar_days = (period_end - period_start).days + 1

    # Phase 11 closure: no employment overlap with the period (or no attendance
    # summary at all) must never silently produce a full-salary record.
    if att_summary.get("calendar_days", 0) == 0 and att_summary:
        blockers.append("Employee was not employed during this payroll period")

    # Check for attendance warnings
    if att_summary.get("unpaid_leave_days", 0) > 0:
        warnings.append(f"Unpaid leave: {att_summary['unpaid_leave_days']} days")
    if att_summary.get("unclassified_leave_days", 0) > 0:
        warnings.append(
            f"Unclassified leave: {att_summary['unclassified_leave_days']} day(s) — "
            "paid/unpaid could not be determined from the leave type configuration"
        )
    if att_summary.get("absent_days", 0) > 0:
        warnings.append(f"Absent: {att_summary['absent_days']} days")

    # 4. Calculate earnings
    earnings: List[PayrollEarningItem] = []
    total_earnings = 0.0

    for item in salary_snapshot.get("items", []):
        if item.get("component_type") != "earning":
            continue

        configured_amount = item.get("calculated_amount", 0.0)

        # Apply proration based on payable_days / calendar_days
        if calendar_days > 0:
            proration_factor = payable_days / calendar_days
        else:
            proration_factor = 1.0

        calculated_amount = _round_currency(configured_amount * proration_factor)

        earnings.append(PayrollEarningItem(
            component_code=item.get("component_code", ""),
            component_name=item.get("component_name", ""),
            component_type="earning",
            calculation_type=item.get("calculation_type", "fixed"),
            configured_amount=configured_amount,
            proration_factor=_round_currency(proration_factor),
            calculated_amount=calculated_amount,
            source="salary_structure",
        ))
        total_earnings += calculated_amount

    # 5. Calculate deductions
    deductions: List[PayrollDeductionItem] = []
    total_deductions = 0.0

    for item in salary_snapshot.get("items", []):
        if item.get("component_type") != "deduction":
            continue

        configured_amount = item.get("calculated_amount", 0.0)
        calculated_amount = _round_currency(configured_amount)  # Fixed deductions not prorated

        deductions.append(PayrollDeductionItem(
            component_code=item.get("component_code", ""),
            component_name=item.get("component_name", ""),
            component_type="deduction",
            configured_amount=configured_amount,
            calculated_amount=calculated_amount,
            source="salary_structure",
        ))
        total_deductions += calculated_amount

    gross_salary = _round_currency(total_earnings)
    net_salary = _round_currency(total_earnings - total_deductions)

    # Determine status
    status = PayrollRecordStatus.READY
    if blockers:
        status = PayrollRecordStatus.BLOCKED
    elif warnings:
        status = PayrollRecordStatus.WARNING

    return {
        "status": status,
        "blockers": blockers,
        "warnings": warnings,
        "employee_id": employee_id,
        "employee_profile_id": employee_profile_id,
        "employee_name": employee_name,
        "employee_number": employee_number,
        "department": department,
        "designation": designation,
        "salary_structure_id": salary_snapshot.get("salary_structure_id"),
        "salary_effective_from": salary_snapshot.get("effective_from"),
        "currency": currency,
        "configured_earnings": salary_snapshot.get("total_earnings", 0.0),
        "configured_deductions": salary_snapshot.get("total_configured_deductions", 0.0),
        "working_days": working_days,
        "payable_days": payable_days,
        "earnings": earnings,
        "deductions": deductions,
        "gross_salary": gross_salary,
        "total_deductions": total_deductions,
        "net_salary": net_salary,
        "attendance_snapshot": att_summary,
    }


async def calculate_period_payroll(
    company_id: str,
    period_start: date,
    period_end: date,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Calculate payroll for all eligible employees in a period.

    Returns (employee_results, period_summary).
    """
    # Eligibility is based on EMPLOYMENT OVERLAP with the period, never on the
    # current employment_status alone. An employee who exited mid-period (e.g.
    # last_working_day = Aug 20, payroll run Sep 1, current status EXITED) must
    # still appear in the August run:
    #     joining_date <= period_end  AND  (last_working_day IS NULL OR last_working_day >= period_start)
    # Employees without a joining_date (legacy data) are treated as eligible
    # while they have no exit boundary.
    period_start_dt = datetime.combine(period_start, time.min)
    period_end_dt = datetime.combine(period_end, time.max)

    profiles = await EmployeeProfile.find({
        "company_id": company_id,
        "$and": [
            {"$or": [
                {"joining_date": None},
                {"joining_date": {"$lte": period_end_dt}},
            ]},
            {"$or": [
                {"exit_info.last_working_day": None},
                {"exit_info.last_working_day": {"$gte": period_start_dt}},
            ]},
        ],
    }).to_list()

    # Deduplicate by user_id
    seen_ids = set()
    eligible_profiles = []
    for p in profiles:
        if p.user_id not in seen_ids:
            seen_ids.add(p.user_id)
            eligible_profiles.append(p)

    results = []
    ready_count = 0
    warning_count = 0
    blocked_count = 0
    total_earnings = 0.0
    total_deductions = 0.0
    total_net = 0.0

    for profile in eligible_profiles:
        try:
            result = await calculate_employee_payroll(
                company_id=company_id,
                employee_id=profile.user_id,
                period_start=period_start,
                period_end=period_end,
                employee_profile=profile,
            )
            results.append(result)

            if result["status"] == PayrollRecordStatus.READY:
                ready_count += 1
            elif result["status"] == PayrollRecordStatus.WARNING:
                warning_count += 1
            elif result["status"] == PayrollRecordStatus.BLOCKED:
                blocked_count += 1

            total_earnings += result.get("gross_salary", 0.0)
            total_deductions += result.get("total_deductions", 0.0)
            total_net += result.get("net_salary", 0.0)
        except Exception as e:
            logger.error("Payroll calculation failed for employee %s: %s", profile.user_id, e)
            blocked_count += 1
            results.append({
                "employee_id": profile.user_id,
                "status": PayrollRecordStatus.BLOCKED,
                "blockers": [f"Calculation error: {str(e)}"],
                "warnings": [],
                "gross_salary": 0.0,
                "total_deductions": 0.0,
                "net_salary": 0.0,
            })

    summary = {
        "employee_count": len(results),
        "ready_count": ready_count,
        "warning_count": warning_count,
        "blocked_count": blocked_count,
        "total_earnings": _round_currency(total_earnings),
        "total_deductions": _round_currency(total_deductions),
        "total_net": _round_currency(total_net),
    }

    return results, summary
