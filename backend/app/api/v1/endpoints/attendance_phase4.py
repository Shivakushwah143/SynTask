"""
Phase 4 — Attendance HR / Payroll-Ready Endpoints.

Adds policy management, holiday management, correction workflow,
payroll adapter, and enhanced today/history endpoints with normalized
HR status resolution.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status

from app.api.dependencies import get_current_user, require_capability
from app.models.user import User, UserRole
from app.services.attendance_policy_service import (
    create_policy,
    deactivate_policy,
    ensure_default_policy,
    get_active_policy,
    list_policies,
    serialize_policy,
    update_policy,
)
from app.services.attendance_holiday_service import (
    create_holiday,
    deactivate_holiday,
    list_holidays,
    serialize_holiday,
    update_holiday,
)
from app.services.attendance_correction_service import (
    approve_correction,
    cancel_correction,
    list_corrections,
    list_my_corrections,
    reject_correction,
    serialize_correction,
    submit_correction,
)
from app.services.attendance_payroll_adapter import (
    get_company_period_summary,
    get_employee_period_summary,
)
from app.services.attendance_status_resolver import (
    resolve_attendance_status,
    get_payable_factor,
    HRAttendanceStatus,
    is_working_day,
)
from app.services.attendance_policy_service import get_active_policy
from app.models.attendance import (
    Attendance,
    AttendanceCorrectionRequest,
    AttendancePolicy,
    CorrectionStatus,
)
from app.services.attendance_holiday_service import is_holiday
from app.services.leave_service import build_leave_type_map, LeaveRequest, LeaveStatus
from app.core.clock import utc_now, ClockService

router = APIRouter()


# =============================================================================
# Attendance Policy
# =============================================================================

@router.get("/policy")
async def get_my_company_policy(current_user: User = Depends(get_current_user)):
    """Get the active attendance policy for the current user's company."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    policy = await ensure_default_policy(current_user.company_id, actor_id=str(current_user.id))
    return {"success": True, "data": serialize_policy(policy)}


@router.get("/policies")
async def list_company_policies(
    include_inactive: bool = Query(False),
    current_user: User = Depends(require_capability("attendance_policy.view")),
):
    """List all attendance policies for the company."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    policies = await list_policies(current_user.company_id, include_inactive=include_inactive)
    return {"success": True, "data": [serialize_policy(p) for p in policies]}


@router.post("/policy", status_code=http_status.HTTP_201_CREATED)
async def create_company_policy(
    payload: dict,
    current_user: User = Depends(require_capability("attendance_policy.manage")),
):
    """Create a new attendance policy for the company."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    policy = await create_policy(current_user.company_id, current_user, payload)
    return {"success": True, "data": serialize_policy(policy)}


@router.patch("/policy/{policy_id}")
async def update_company_policy(
    policy_id: str,
    payload: dict,
    current_user: User = Depends(require_capability("attendance_policy.manage")),
):
    """Update an existing attendance policy."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    policy = await update_policy(current_user.company_id, policy_id, payload)
    return {"success": True, "data": serialize_policy(policy)}


@router.delete("/policy/{policy_id}")
async def deactivate_company_policy(
    policy_id: str,
    current_user: User = Depends(require_capability("attendance_policy.manage")),
):
    """Soft-deactivate an attendance policy."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    policy = await deactivate_policy(current_user.company_id, policy_id)
    return {"success": True, "data": serialize_policy(policy)}


# =============================================================================
# Holidays
# =============================================================================

@router.get("/holidays")
async def list_company_holidays(
    year: Optional[int] = Query(None),
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
):
    """List holidays for the company."""
    if not current_user.company_id:
        return {"success": True, "data": []}
    holidays = await list_holidays(current_user.company_id, year=year, include_inactive=include_inactive)
    return {"success": True, "data": [serialize_holiday(h) for h in holidays]}


@router.post("/holidays", status_code=http_status.HTTP_201_CREATED)
async def create_company_holiday(
    payload: dict,
    current_user: User = Depends(require_capability("attendance_policy.manage")),
):
    """Create a new holiday."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    holiday = await create_holiday(current_user.company_id, current_user, payload)
    return {"success": True, "data": serialize_holiday(holiday)}


@router.patch("/holidays/{holiday_id}")
async def update_company_holiday(
    holiday_id: str,
    payload: dict,
    current_user: User = Depends(require_capability("attendance_policy.manage")),
):
    """Update a holiday."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    holiday = await update_holiday(current_user.company_id, holiday_id, payload)
    return {"success": True, "data": serialize_holiday(holiday)}


@router.delete("/holidays/{holiday_id}")
async def deactivate_company_holiday(
    holiday_id: str,
    current_user: User = Depends(require_capability("attendance_policy.manage")),
):
    """Soft-deactivate a holiday."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    holiday = await deactivate_holiday(current_user.company_id, holiday_id)
    return {"success": True, "data": serialize_holiday(holiday)}


# =============================================================================
# Corrections
# =============================================================================

@router.post("/corrections", status_code=http_status.HTTP_201_CREATED)
async def request_correction(
    payload: dict,
    current_user: User = Depends(get_current_user),
):
    """Submit an attendance correction request."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    correction = await submit_correction(current_user.company_id, current_user, payload)
    return {"success": True, "data": serialize_correction(correction, current_user)}


@router.get("/corrections/me")
async def get_my_corrections(
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    """List current user's correction requests."""
    if not current_user.company_id:
        return {"success": True, "data": {"items": [], "total": 0}}
    items, total = await list_my_corrections(
        current_user.company_id, str(current_user.id),
        status_filter=status_filter, skip=skip, limit=limit,
    )
    return {
        "success": True,
        "data": {
            "items": [serialize_correction(c, current_user) for c in items],
            "total": total,
            "skip": skip,
            "limit": limit,
        },
    }


@router.get("/corrections")
async def list_all_corrections(
    status_filter: Optional[str] = Query(None, alias="status"),
    employee_id: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_capability("attendance_corrections.view")),
):
    """List all correction requests (HR/manager view)."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    items, total = await list_corrections(
        current_user.company_id,
        status_filter=status_filter,
        employee_id=employee_id,
        start_date=start_date,
        end_date=end_date,
        skip=skip, limit=limit,
    )
    return {
        "success": True,
        "data": {
            "items": [serialize_correction(c) for c in items],
            "total": total,
            "skip": skip,
            "limit": limit,
        },
    }


@router.post("/corrections/{correction_id}/approve")
async def approve_correction_endpoint(
    correction_id: str,
    payload: Optional[dict] = None,
    current_user: User = Depends(require_capability("attendance_corrections.manage")),
):
    """Approve a correction request."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    comment = (payload or {}).get("comment")
    correction = await approve_correction(
        current_user.company_id, correction_id, current_user, comment=comment,
    )
    return {"success": True, "data": serialize_correction(correction)}


@router.post("/corrections/{correction_id}/reject")
async def reject_correction_endpoint(
    correction_id: str,
    payload: Optional[dict] = None,
    current_user: User = Depends(require_capability("attendance_corrections.manage")),
):
    """Reject a correction request."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    comment = (payload or {}).get("comment", "Rejection reason required")
    if not comment or not comment.strip():
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Rejection reason is required")
    correction = await reject_correction(
        current_user.company_id, correction_id, current_user, comment=comment,
    )
    return {"success": True, "data": serialize_correction(correction)}


@router.post("/corrections/{correction_id}/cancel")
async def cancel_correction_endpoint(
    correction_id: str,
    current_user: User = Depends(get_current_user),
):
    """Cancel own pending correction request."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    correction = await cancel_correction(
        current_user.company_id, correction_id, str(current_user.id),
    )
    return {"success": True, "data": serialize_correction(correction)}


# =============================================================================
# Payroll Attendance Summary
# =============================================================================

@router.get("/payroll-summary")
async def get_payroll_summary(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    employee_id: Optional[str] = Query(None),
    current_user: User = Depends(require_capability("attendance_policy.view")),
):
    """Get payroll-ready attendance summary for a period.
    
    If employee_id is provided, returns summary for that employee.
    Otherwise returns summary for all company employees.
    """
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    
    try:
        period_start = datetime.strptime(start_date, "%Y-%m-%d").date()
        period_end = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Expected YYYY-MM-DD.")
    
    if period_end < period_start:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="End date must be after start date")
    
    if employee_id:
        summary = await get_employee_period_summary(
            current_user.company_id, employee_id, period_start, period_end,
        )
    else:
        summary = await get_company_period_summary(
            current_user.company_id, period_start, period_end,
        )
    
    return {"success": True, "data": summary}


# =============================================================================
# Enhanced Today (policy-aware)
# =============================================================================

@router.get("/me/today-enhanced")
async def get_my_today_enhanced(current_user: User = Depends(get_current_user)):
    """Get today's attendance with policy-aware HR status, expected hours, and flags."""
    if not current_user.company_id:
        return {"success": True, "data": _empty_today_response(current_user)}
    
    from app.models.attendance import Attendance, AttendanceStatus
    
    policy = await get_active_policy(current_user.company_id)
    today_str = ClockService.user_today_str(current_user)
    
    attendance = await Attendance.find_one(
        Attendance.company_id == current_user.company_id,
        Attendance.employee_id == str(current_user.id),
        Attendance.date == today_str,
    )
    
    # Check holiday/week-off
    from app.services.attendance_status_resolver import is_working_day
    from datetime import datetime as dt, time as tm
    
    today_date = dt.strptime(today_str, "%Y-%m-%d").date()
    holiday = await is_holiday(current_user.company_id, today_date)
    is_week_off = not is_working_day(policy, today_date) if policy else False
    
    # Check approved leaves
    approved_leaves = await LeaveRequest.find({
        "company_id": current_user.company_id,
        "employee_id": str(current_user.id),
        "status": LeaveStatus.APPROVED.value,
        "start_date": {"$lte": dt.combine(today_date, tm.max)},
        "end_date": {"$gte": dt.combine(today_date, tm.min)},
    }).to_list()
    
    resolution = await resolve_attendance_status(
        company_id=current_user.company_id,
        employee_id=str(current_user.id),
        attendance_date=today_date,
        policy=policy,
        attendance=attendance,
        approved_leaves=approved_leaves,
        holiday=holiday,
    )
    
    # Build response
    now_utc = utc_now()
    total_break = int(max(0, (attendance.break_duration or 0))) if attendance else 0
    total_work = int(max(0, (attendance.total_working_hours or 0))) if attendance else 0
    
    # Live timer calculation
    if attendance and attendance.status == AttendanceStatus.WORKING:
        total_work = int(max(0, (now_utc - attendance.login_time).total_seconds() - total_break)) if attendance.login_time else 0
    elif attendance and attendance.status == AttendanceStatus.ON_BREAK and attendance.current_break_started_at:
        total_work = int(max(0, (attendance.current_break_started_at - attendance.login_time).total_seconds() - total_break)) if attendance.login_time else 0
    
    return {
        "success": True,
        "data": {
            "attendance_date": today_str,
            "date": today_str,
            "hr_status": resolution["hr_status"],
            "status_source": resolution["status_source"],
            "check_in_at": attendance.login_time.isoformat() if attendance and attendance.login_time else None,
            "check_out_at": attendance.logout_time.isoformat() if attendance and attendance.logout_time else None,
            "total_work_seconds": total_work,
            "total_break_seconds": total_break,
            "overtime_seconds": int(resolution["overtime_minutes"] * 60),
            "is_late": resolution["is_late"],
            "late_minutes": resolution["late_minutes"],
            "is_early_departure": resolution["is_early_departure"],
            "early_departure_minutes": resolution["early_departure_minutes"],
            "expected_work_minutes": resolution["expected_work_minutes"],
            "expected_start_time": policy.expected_start_time if policy else "09:00",
            "expected_end_time": policy.expected_end_time if policy else "18:00",
            "is_holiday": resolution["is_holiday"],
            "holiday_name": resolution["holiday_name"],
            "is_week_off": resolution["is_week_off"],
            "leave": {
                "leave_type_id": resolution.get("leave_type_id"),
                "leave_paid": resolution.get("leave_paid"),
            } if resolution.get("leave_type_id") else None,
            "payable_factor": get_payable_factor(resolution["hr_status"]),
            "policy": {
                "timezone": policy.timezone if policy else "UTC",
                "expected_start_time": policy.expected_start_time if policy else "09:00",
                "expected_end_time": policy.expected_end_time if policy else "18:00",
                "expected_work_minutes": policy.expected_work_minutes if policy else 480.0,
                "late_grace_minutes": policy.late_grace_minutes if policy else 0.0,
                "overtime_enabled": policy.overtime_enabled if policy else False,
            },
            "server_time": now_utc.isoformat(),
        },
    }


def _empty_today_response(user: User) -> dict:
    now_utc = utc_now()
    return {
        "attendance_date": ClockService.user_today_str(user),
        "date": ClockService.user_today_str(user),
        "hr_status": HRAttendanceStatus.NO_RECORD.value,
        "status_source": "no_company",
        "check_in_at": None,
        "check_out_at": None,
        "total_work_seconds": 0,
        "total_break_seconds": 0,
        "overtime_seconds": 0,
        "is_late": False,
        "late_minutes": 0.0,
        "is_early_departure": False,
        "early_departure_minutes": 0.0,
        "expected_work_minutes": 480.0,
        "expected_start_time": "09:00",
        "expected_end_time": "18:00",
        "is_holiday": False,
        "holiday_name": None,
        "is_week_off": False,
        "leave": None,
        "payable_factor": 0.0,
        "policy": None,
        "server_time": now_utc.isoformat(),
    }
