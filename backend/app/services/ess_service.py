"""
Phase 8 — Employee Self-Service (ESS) service.

ESS is *secure employee access to the modules already built* — it never
duplicates Employee / Attendance / Leave / Documents / Payroll logic. This
service owns only three self-service concerns:

    Authenticated User
            ↓
    Employee Profile (identity resolution — one place, no repetition)
            ↓
    Own HR resources (profile self-edit + a lightweight My HR overview)

- ``resolve_employee_profile`` is the single identity-resolution helper every
  self endpoint uses: company scope + employment identity, never an
  employee_id supplied by the frontend.
- ``get_my_profile`` returns the Phase 1 EmployeeProfile detail DTO.
- ``update_my_profile`` accepts ONLY the employee-editable whitelist
  (personal email, personal phone, address, emergency contact). Protected
  HR fields (department, designation, manager, employee number, employment
  status, salary-affecting fields, ...) are explicitly rejected.
- ``build_my_summary`` is the lightweight My HR overview aggregate — it
  intentionally returns summaries only (never full histories) and reuses the
  existing attendance/leave/document/payslip services.
"""
from __future__ import annotations

import logging
from datetime import datetime, time
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now, ClockService
from app.models.attendance import Attendance, AttendanceStatus
from app.models.department import Department
from app.models.employee_profile import Address, EmergencyContact, EmployeeProfile
from app.models.hr_document import HRDocument, HRDocumentStatus, HRDocumentVisibility
from app.models.leave import LeaveRequest, LeaveStatus
from app.models.user import User
from app.services.attendance_holiday_service import is_holiday
from app.services.attendance_policy_service import get_active_policy
from app.services.attendance_status_resolver import (
    get_payable_factor,
    is_working_day,
    resolve_attendance_status,
)
from app.services.employee_profile_service import build_detail
from app.services.hr_document_service import compute_expiry_state
from app.services.leave_service import get_balances
from app.services.payslip_service import get_my_payslips

logger = logging.getLogger(__name__)

# =============================================================================
# Employee identity resolution — the ONE place self endpoints resolve the actor
# =============================================================================

# Employee-editable fields (self-service). Everything else on the profile is
# HR-controlled and explicitly rejected, never silently ignored.
EMPLOYEE_EDITABLE_FIELDS = {
    "personal_email",
    "personal_phone",
    "address",
    "emergency_contact",
}

# HR-controlled profile fields — explicit rejection list.
PROTECTED_PROFILE_FIELDS = {
    "employee_number",
    "date_of_birth",
    "gender",
    "employment_type",
    "joining_date",
    "department_id",
    "designation",
    "reports_to",
    "work_location",
    "work_mode",
    "employment_status",
    "probation",
    "exit_info",
    "candidate_id",
    "company_id",
    "user_id",
}


async def resolve_employee_profile(user: User) -> Optional[EmployeeProfile]:
    """Resolve the authenticated user's Employee Profile (company-scoped).

    Returns ``None`` when the user is not a company employee (platform super
    admins, service/organization accounts without a profile) — callers render
    the graceful "profile not available" state instead of crashing.
    """
    if not user.company_id:
        return None
    return await EmployeeProfile.find_one(
        {"company_id": user.company_id, "user_id": str(user.id)}
    )


async def require_employee_profile(user: User) -> EmployeeProfile:
    profile = await resolve_employee_profile(user)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile is not available for this account.",
        )
    return profile


async def get_my_profile(user: User) -> dict:
    """The current user's own EmployeeProfile detail DTO (self-service)."""
    profile = await require_employee_profile(user)
    return await build_detail(profile, user, can_edit=False)


async def update_my_profile(user: User, data: dict) -> dict:
    """Partial self-update of employee-editable personal fields only.

    - Protected HR fields are explicitly rejected with a 400 (never silently
      ignored, so a stale frontend form cannot accidentally drift).
    - Address / emergency contact merge over the existing stored values —
      sending one field never erases the rest.
    """
    profile = await require_employee_profile(user)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No updatable fields were provided.",
        )

    provided = {key for key in data if data.get(key) is not None}
    protected = provided & PROTECTED_PROFILE_FIELDS
    if protected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "These fields are managed by HR and cannot be changed from "
                f"self-service: {', '.join(sorted(protected))}."
            ),
        )
    unknown = provided - EMPLOYEE_EDITABLE_FIELDS
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown editable fields: {', '.join(sorted(unknown))}.",
        )

    changes: dict = {}

    if "personal_email" in data:
        value = (data.get("personal_email") or "").strip() or None
        if value and "@" not in value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Personal email must be a valid email address.",
            )
        if value != profile.personal_email:
            changes["personal_email"] = value
            profile.personal_email = value

    if "personal_phone" in data:
        value = (data.get("personal_phone") or "").strip() or None
        if value != profile.personal_phone:
            changes["personal_phone"] = value
            profile.personal_phone = value

    if "address" in data:
        new_address = _merge_address(profile.address, data.get("address"))
        changes["address"] = new_address.model_dump()
        profile.address = new_address

    if "emergency_contact" in data:
        new_contact = _merge_emergency_contact(profile.emergency_contact, data.get("emergency_contact"))
        changes["emergency_contact"] = new_contact.model_dump()
        profile.emergency_contact = new_contact

    if changes:
        profile.updated_at = utc_now()
        await profile.save()
        await _record_self_update_event(user, profile, changes)

    return await build_detail(profile, user, can_edit=False)


def _merge_address(existing: Optional[Address], payload: Optional[dict]) -> Address:
    base = existing.model_dump() if existing else {}
    for key, value in (payload or {}).items():
        if value is not None:
            base[key] = value
    return Address(**base)


def _merge_emergency_contact(existing: Optional[EmergencyContact], payload: Optional[dict]) -> EmergencyContact:
    base = existing.model_dump() if existing else {}
    for key, value in (payload or {}).items():
        if value is not None:
            base[key] = value
    return EmergencyContact(**base)


async def _record_self_update_event(user: User, profile: EmployeeProfile, changes: dict) -> None:
    """Audit a self-service profile update through the existing event bus."""
    from app.services.employee_profile_service import _record_employee_event

    try:
        await _record_employee_event(
            user.company_id,
            "EmployeeProfileSelfUpdated",
            user,
            profile,
            payload={"employee_id": str(profile.id), "changes": changes},
        )
    except Exception:
        # Audit publishing must never break the profile update.
        logger.exception("Failed to publish self-update profile event")


# =============================================================================
# My HR overview — lightweight aggregate (summaries only, no full histories)
# =============================================================================

ESS_CAPABILITIES = (
    "can_edit_profile",
    "can_request_leave",
    "can_request_attendance_correction",
    "can_upload_document",
    "can_view_salary",
    "can_view_payslips",
)


async def build_my_summary(user: User) -> dict:
    """Lightweight My HR overview aggregate for one employee.

    Returns only summaries: profile essentials, today's attendance state,
    leave balance summary + pending count, employee-visible document alerts,
    and the latest processed payslip. Module pages use their own APIs for
    full histories — this endpoint never embeds them.
    """
    profile = await require_employee_profile(user)

    profile_summary = await _profile_summary(user, profile)
    attendance_today = await _attendance_today_summary(user)
    leave_summary = await _leave_summary(user)
    documents = await _document_alerts(user, profile)
    latest_payslip = await _latest_payslip(user)

    return {
        "profile": profile_summary,
        "attendance_today": attendance_today,
        "leave": leave_summary,
        "documents": documents,
        "latest_payslip": latest_payslip,
        "capabilities": {
            "can_edit_profile": True,
            "can_request_leave": True,
            "can_request_attendance_correction": True,
            "can_upload_document": True,  # My HR → My Documents self-service upload.
            "can_view_salary": True,  # Own salary only, via /salary/me.
            "can_view_payslips": True,  # Own payslips only, via /payroll/me/payslips.
        },
    }


async def _profile_summary(user: User, profile: EmployeeProfile) -> dict:
    department_name = None
    if profile.department_id:
        department = await Department.get(profile.department_id)
        if department and department.company_id == user.company_id and department.deleted_at is None:
            department_name = department.name

    manager_name = None
    if profile.reports_to:
        manager = await User.get(profile.reports_to)
        if manager and manager.company_id == user.company_id:
            manager_name = manager.full_name()

    return {
        "id": str(profile.id),
        "user_id": profile.user_id,
        "employee_number": profile.employee_number,
        "full_name": user.full_name(),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "avatar": getattr(user, "avatar", None),
        "phone": getattr(user, "phone", None),
        "department_id": profile.department_id,
        "department_name": department_name,
        "designation": profile.designation,
        "manager_id": profile.reports_to,
        "manager_name": manager_name,
        "employment_type": profile.employment_type.value if profile.employment_type else None,
        "joining_date": profile.joining_date,
        "work_mode": profile.work_mode.value if profile.work_mode else None,
        "work_location": profile.work_location,
        "employment_status": profile.employment_status.value,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
    }


async def _attendance_today_summary(user: User) -> dict:
    """Today's attendance in the same normalized HR vocabulary as Phase 4."""
    if not user.company_id:
        return {"hr_status": "no_record", "check_in_at": None, "check_out_at": None}

    from app.services.attendance_status_resolver import HRAttendanceStatus

    policy = await get_active_policy(user.company_id)
    today_str = ClockService.user_today_str(user)
    today_date = datetime.strptime(today_str, "%Y-%m-%d").date()

    attendance = await Attendance.find_one(
        {"company_id": user.company_id, "employee_id": str(user.id), "date": today_str}
    )
    holiday = await is_holiday(user.company_id, today_date)
    is_week_off = not is_working_day(policy, today_date) if policy else False

    approved_leaves = await LeaveRequest.find({
        "company_id": user.company_id,
        "employee_id": str(user.id),
        "status": LeaveStatus.APPROVED.value,
        "start_date": {"$lte": datetime.combine(today_date, time.max)},
        "end_date": {"$gte": datetime.combine(today_date, time.min)},
    }).to_list()

    resolution = await resolve_attendance_status(
        company_id=user.company_id,
        employee_id=str(user.id),
        attendance_date=today_date,
        policy=policy,
        attendance=attendance,
        approved_leaves=approved_leaves,
        holiday=holiday,
    )

    total_break = int(max(0, attendance.break_duration or 0)) if attendance else 0
    total_work = int(max(0, attendance.total_working_hours or 0)) if attendance else 0
    if attendance and attendance.status == AttendanceStatus.WORKING and attendance.login_time:
        total_work = int(max(0, (utc_now() - attendance.login_time).total_seconds() - total_break))
    elif attendance and attendance.status == AttendanceStatus.ON_BREAK and attendance.current_break_started_at and attendance.login_time:
        total_work = int(max(0, (attendance.current_break_started_at - attendance.login_time).total_seconds() - total_break))

    return {
        "attendance_date": today_str,
        "hr_status": resolution["hr_status"],
        "status_source": resolution["status_source"],
        "check_in_at": attendance.login_time.isoformat() if attendance and attendance.login_time else None,
        "check_out_at": attendance.logout_time.isoformat() if attendance and attendance.logout_time else None,
        "total_work_seconds": total_work,
        "total_break_seconds": total_break,
        "is_late": resolution["is_late"],
        "late_minutes": resolution["late_minutes"],
        "expected_start_time": policy.expected_start_time if policy else "09:00",
        "expected_end_time": policy.expected_end_time if policy else "18:00",
        "is_holiday": resolution["is_holiday"],
        "holiday_name": resolution["holiday_name"],
        "is_week_off": resolution["is_week_off"],
        "payable_factor": get_payable_factor(resolution["hr_status"]),
        "policy": {
            "timezone": policy.timezone if policy else "UTC",
            "expected_work_minutes": policy.expected_work_minutes if policy else 480.0,
        } if policy else None,
    }


async def _leave_summary(user: User) -> dict:
    if not user.company_id:
        return {"balances": [], "pending_count": 0}
    balances = await get_balances(user.company_id, str(user.id))
    compact = [
        {
            "leave_type_id": b["leave_type_id"],
            "name": b["name"],
            "code": b["code"],
            "is_paid": b["is_paid"],
            "allow_half_day": b["allow_half_day"],
            "allocated": b["allocated"],
            "used": b["used"],
            "pending": b["pending"],
            "available": b["available"],
        }
        for b in balances
    ]
    pending_count = await LeaveRequest.find({
        "company_id": user.company_id,
        "employee_id": str(user.id),
        "status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.FORWARDED.value]},
    }).count()
    return {"balances": compact, "pending_count": pending_count}


async def _document_alerts(user: User, profile: EmployeeProfile) -> dict:
    """Employee-visible document alert counts (metadata only — no filenames)."""
    if not user.company_id:
        return {"total": 0, "expiring_soon": 0, "expired": 0}
    from app.services.hr_document_service import review_status_value

    documents = await HRDocument.find({
        "company_id": user.company_id,
        "employee_id": str(profile.id),
        "status": HRDocumentStatus.ACTIVE.value,
        "visibility": HRDocumentVisibility.EMPLOYEE_VISIBLE.value,
    }).to_list()

    total = len(documents)
    expiring_soon = 0
    expired = 0
    pending_review = 0
    rejected = 0
    for document in documents:
        if review_status_value(document.review_status) == "pending":
            pending_review += 1
        elif review_status_value(document.review_status) == "rejected":
            rejected += 1
        state = compute_expiry_state(document.expiry_date)
        if state == "expiring_soon":
            expiring_soon += 1
        elif state == "expired":
            expired += 1
    return {"total": total, "pending_review": pending_review, "rejected": rejected, "expiring_soon": expiring_soon, "expired": expired}


async def _latest_payslip(user: User) -> Optional[dict]:
    """Latest generated payslip for the employee (period + net only)."""
    items = await get_my_payslips(user)
    if not items:
        return None
    latest = items[0]
    return {
        "payslip_id": latest["payslip_id"],
        "period": latest.get("period"),
        "year": latest.get("year"),
        "month": latest.get("month"),
        "gross": latest.get("gross"),
        "deductions": latest.get("deductions"),
        "net": latest.get("net"),
        "currency": latest.get("currency") or "INR",
        "generated_at": latest.get("generated_at"),
    }
