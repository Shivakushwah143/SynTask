"""
Phase 4 — Attendance Correction / Regularization service.

Employees request corrections for missing/incorrect attendance data.
Managers/HR approve or reject. Original values are preserved.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from pymongo import ReturnDocument

from app.core.clock import utc_now
from app.models.attendance import (
    Attendance,
    AttendanceStatus,
    AttendanceCorrectionRequest,
    CorrectionStatus,
    CorrectionType,
)
from app.models.user import User, UserRole
from app.services.attendance_policy_service import get_active_policy
from app.services.attendance_status_resolver import (
    resolve_attendance_status,
)
from app.services.leave_service import serialize_leave

logger = logging.getLogger(__name__)


async def submit_correction(
    company_id: str,
    employee: User,
    payload: Dict[str, Any],
) -> AttendanceCorrectionRequest:
    """Submit a new attendance correction request."""
    employee_id = str(employee.id)
    
    # Validate required fields
    correction_type_str = payload.get("correction_type")
    if not correction_type_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="correction_type is required")
    
    try:
        correction_type = CorrectionType(correction_type_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid correction_type. Must be one of: {[ct.value for ct in CorrectionType]}",
        )
    
    attendance_date_str = payload.get("attendance_date")
    if not attendance_date_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="attendance_date is required")
    
    try:
        att_date = datetime.strptime(attendance_date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attendance_date format. Expected YYYY-MM-DD.")
    
    # Cannot correct future dates
    if att_date > utc_now().date():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot correct future attendance dates")
    
    reason = (payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reason is required")
    
    # Check for existing pending correction on same date/type
    existing = await AttendanceCorrectionRequest.find_one({
        "company_id": company_id,
        "employee_id": employee_id,
        "attendance_date": attendance_date_str,
        "status": CorrectionStatus.PENDING,
        "correction_type": correction_type,
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A pending correction of this type already exists for this date",
        )
    
    # Find existing attendance record
    attendance = await Attendance.find_one({
        "company_id": company_id,
        "employee_id": employee_id,
        "date": attendance_date_str,
    })
    
    # Snapshot current values
    current_check_in = attendance.login_time if attendance else None
    current_check_out = attendance.logout_time if attendance else None
    current_work = (attendance.total_working_hours or 0) / 60.0 if attendance else 0.0
    current_status = attendance.status.value if attendance else None
    
    # Parse requested values
    requested_check_in = _parse_datetime(payload.get("requested_check_in"))
    requested_check_out = _parse_datetime(payload.get("requested_check_out"))
    requested_work = payload.get("requested_work_minutes")
    requested_status = payload.get("requested_status")
    
    # Validate based on correction type
    if correction_type == CorrectionType.MISSING_CHECK_IN:
        if not requested_check_in:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="requested_check_in is required for missing check-in correction")
    elif correction_type == CorrectionType.MISSING_CHECK_OUT:
        if not requested_check_out:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="requested_check_out is required for missing check-out correction")
    elif correction_type == CorrectionType.CHANGE_CHECK_IN:
        if not requested_check_in:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="requested_check_in is required for check-in change")
    elif correction_type == CorrectionType.CHANGE_CHECK_OUT:
        if not requested_check_out:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="requested_check_out is required for check-out change")
    
    # Validate check-in < check-out if both provided
    check_in = requested_check_in or current_check_in
    check_out = requested_check_out or current_check_out
    if check_in and check_out and check_out <= check_in:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Check-out must be after check-in")
    
    correction = AttendanceCorrectionRequest(
        company_id=company_id,
        employee_id=employee_id,
        attendance_date=attendance_date_str,
        attendance_id=str(attendance.id) if attendance else None,
        correction_type=correction_type,
        current_check_in=current_check_in,
        current_check_out=current_check_out,
        current_work_minutes=round(current_work, 2),
        current_status=current_status,
        requested_check_in=requested_check_in,
        requested_check_out=requested_check_out,
        requested_work_minutes=float(requested_work) if requested_work else None,
        requested_status=requested_status,
        reason=reason,
        attachment_url=payload.get("attachment_url"),
        original_values={
            "login_time": current_check_in.isoformat() if current_check_in else None,
            "logout_time": current_check_out.isoformat() if current_check_out else None,
            "total_working_hours": attendance.total_working_hours if attendance else 0.0,
            "break_duration": attendance.break_duration if attendance else 0.0,
            "status": current_status,
        },
    )
    await correction.insert()
    return correction


async def list_my_corrections(
    company_id: str,
    employee_id: str,
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[AttendanceCorrectionRequest], int]:
    """List correction requests for a specific employee."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "employee_id": employee_id,
    }
    if status_filter:
        query["status"] = status_filter
    
    total = await AttendanceCorrectionRequest.find(query).count()
    items = await AttendanceCorrectionRequest.find(query).sort("-created_at").skip(skip).limit(limit).to_list()
    return items, total


async def list_corrections(
    company_id: str,
    status_filter: Optional[str] = None,
    employee_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[AttendanceCorrectionRequest], int]:
    """List correction requests for HR/manager review."""
    query: Dict[str, Any] = {"company_id": company_id}
    if status_filter:
        query["status"] = status_filter
    if employee_id:
        query["employee_id"] = employee_id
    if start_date:
        query["attendance_date"] = {"$gte": start_date}
    if end_date:
        if "attendance_date" in query:
            query["attendance_date"]["$lte"] = end_date
        else:
            query["attendance_date"] = {"$lte": end_date}
    
    total = await AttendanceCorrectionRequest.find(query).count()
    items = await AttendanceCorrectionRequest.find(query).sort("-created_at").skip(skip).limit(limit).to_list()
    return items, total


async def approve_correction(
    company_id: str,
    correction_id: str,
    reviewer: User,
    comment: Optional[str] = None,
) -> AttendanceCorrectionRequest:
    """Approve a correction request and apply changes to the attendance record."""
    correction = await AttendanceCorrectionRequest.get(correction_id)
    if not correction or correction.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Correction request not found")
    
    if correction.status != CorrectionStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This correction has already been processed")
    
    # Find or create attendance record
    attendance = None
    if correction.attendance_id:
        attendance = await Attendance.get(correction.attendance_id)
    
    if not attendance:
        attendance = await Attendance.find_one({
            "company_id": company_id,
            "employee_id": correction.employee_id,
            "date": correction.attendance_date,
        })
    
    if not attendance:
        # Create a new attendance record for the correction
        attendance = Attendance(
            employee_id=correction.employee_id,
            company_id=company_id,
            date=correction.attendance_date,
            status=AttendanceStatus.OFFLINE,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        await attendance.insert()
    
    # Preserve original values in correction history
    original_snapshot = {
        "login_time": attendance.login_time.isoformat() if attendance.login_time else None,
        "logout_time": attendance.logout_time.isoformat() if attendance.logout_time else None,
        "total_working_hours": attendance.total_working_hours,
        "break_duration": attendance.break_duration,
        "status": attendance.status.value,
        "corrected_by": str(reviewer.id),
        "corrected_at": utc_now().isoformat(),
        "reason": correction.reason,
    }
    
    # Apply corrections
    now_utc = utc_now()
    if correction.requested_check_in and correction.correction_type in (
        CorrectionType.MISSING_CHECK_IN, CorrectionType.CHANGE_CHECK_IN
    ):
        attendance.login_time = correction.requested_check_in
    
    if correction.requested_check_out and correction.correction_type in (
        CorrectionType.MISSING_CHECK_OUT, CorrectionType.CHANGE_CHECK_OUT
    ):
        attendance.logout_time = correction.requested_check_out
    
    # Recalculate work duration if check-in and check-out exist
    if attendance.login_time and attendance.logout_time:
        total_seconds = (attendance.logout_time - attendance.login_time).total_seconds()
        total_break = attendance.break_duration or 0
        work_minutes = max(0, (total_seconds - total_break) / 60.0)
        attendance.total_working_hours = max(0, total_seconds - total_break)
        
        # Recompute overtime
        policy = await get_active_policy(company_id)
        if policy and policy.overtime_enabled:
            threshold = policy.overtime_after_minutes or policy.expected_work_minutes
            attendance.overtime_seconds = max(0, (work_minutes - threshold) * 60)
    
    # Recompute late/early
    policy = await get_active_policy(company_id)
    if policy and attendance.login_time:
        from app.services.attendance_status_resolver import compute_late_minutes, compute_early_departure
        is_late, late_min = compute_late_minutes(policy, attendance.login_time)
        attendance.is_late = is_late
        attendance.late_minutes = late_min
        
        if attendance.logout_time:
            is_early, early_min = compute_early_departure(policy, attendance.logout_time)
            attendance.is_early_departure = is_early
            attendance.early_departure_minutes = early_min
    
    # Set status based on work done
    if attendance.login_time and attendance.logout_time:
        attendance.status = AttendanceStatus.CHECKED_OUT
    elif attendance.login_time:
        attendance.status = AttendanceStatus.WORKING
    
    attendance.updated_at = now_utc
    attendance.correction_history = (attendance.correction_history or []) + [original_snapshot]
    await attendance.save()
    
    # Update correction status
    correction.status = CorrectionStatus.APPROVED
    correction.reviewed_by = str(reviewer.id)
    correction.reviewed_at = now_utc
    correction.review_comment = comment
    correction.updated_at = now_utc
    await correction.save()
    
    return correction


async def reject_correction(
    company_id: str,
    correction_id: str,
    reviewer: User,
    comment: Optional[str] = None,
) -> AttendanceCorrectionRequest:
    """Reject a correction request."""
    correction = await AttendanceCorrectionRequest.get(correction_id)
    if not correction or correction.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Correction request not found")
    
    if correction.status != CorrectionStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This correction has already been processed")
    
    now_utc = utc_now()
    correction.status = CorrectionStatus.REJECTED
    correction.reviewed_by = str(reviewer.id)
    correction.reviewed_at = now_utc
    correction.review_comment = comment
    correction.updated_at = now_utc
    await correction.save()
    
    return correction


async def cancel_correction(
    company_id: str,
    correction_id: str,
    employee_id: str,
) -> AttendanceCorrectionRequest:
    """Cancel own pending correction request."""
    correction = await AttendanceCorrectionRequest.get(correction_id)
    if not correction or correction.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Correction request not found")
    if correction.employee_id != employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only cancel your own correction requests")
    if correction.status != CorrectionStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending corrections can be cancelled")
    
    correction.status = CorrectionStatus.CANCELLED
    correction.updated_at = utc_now()
    await correction.save()
    
    return correction


def _parse_datetime(value: Any) -> Optional[datetime]:
    """Parse ISO datetime string."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, TypeError):
            pass
    return None


def serialize_correction(correction: AttendanceCorrectionRequest, employee: Optional[User] = None) -> Dict[str, Any]:
    return {
        "id": str(correction.id),
        "company_id": correction.company_id,
        "employee_id": correction.employee_id,
        "employee_name": employee.full_name() if employee else None,
        "attendance_date": correction.attendance_date,
        "attendance_id": correction.attendance_id,
        "correction_type": correction.correction_type.value,
        "current_check_in": correction.current_check_in,
        "current_check_out": correction.current_check_out,
        "current_work_minutes": correction.current_work_minutes,
        "current_status": correction.current_status,
        "requested_check_in": correction.requested_check_in,
        "requested_check_out": correction.requested_check_out,
        "requested_work_minutes": correction.requested_work_minutes,
        "requested_status": correction.requested_status,
        "reason": correction.reason,
        "attachment_url": correction.attachment_url,
        "status": correction.status.value,
        "requested_at": correction.requested_at,
        "reviewed_by": correction.reviewed_by,
        "reviewed_at": correction.reviewed_at,
        "review_comment": correction.review_comment,
        "created_at": correction.created_at,
        "updated_at": correction.updated_at,
    }
