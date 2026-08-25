"""
Leave management business logic.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, Optional

from beanie import Document
from fastapi import HTTPException, status
from pymongo import ReturnDocument

from app.models.attendance import Attendance
from app.models.leave import (
    LeaveBalance,
    LeaveDuration,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
    LeaveTypeConfig,
)
from app.models.notification import Notification, NotificationType
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole
from app.services.timeline_service import create_timeline_event
from app.core.clock import parse_to_utc, utc_now

logger = logging.getLogger(__name__)


APPROVER_ROLES = {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN}
TERMINAL_LEAVE_STATUSES = {LeaveStatus.APPROVED, LeaveStatus.REJECTED, LeaveStatus.CANCELLED}
ACTIVE_LEAVE_STATUSES = (LeaveStatus.PENDING, LeaveStatus.FORWARDED, LeaveStatus.APPROVED)

# Legacy leave-type values → readable labels (Phase 3 keeps old enum values readable).
LEGACY_LEAVE_LABELS = {
    LeaveType.FULL_DAY: "Full Day",
    LeaveType.HALF_DAY: "Half Day",
    LeaveType.SICK_LEAVE: "Sick Leave",
    LeaveType.CASUAL_LEAVE: "Casual Leave",
    LeaveType.EMERGENCY_LEAVE: "Emergency Leave",
    LeaveType.WORK_FROM_HOME: "Work From Home",
}

# Legacy category values map to the seeded configurable Leave Types by code.
LEGACY_TYPE_CODE_MAP = {
    LeaveType.SICK_LEAVE: "sick_leave",
    LeaveType.CASUAL_LEAVE: "casual_leave",
    LeaveType.EMERGENCY_LEAVE: "emergency_leave",
}

# Default configurable Leave Types seeded per company (idempotent).
DEFAULT_LEAVE_TYPES = [
    {"name": "Casual Leave", "code": "casual_leave", "is_paid": True, "default_annual_allocation": 10.0, "allow_half_day": True, "requires_approval": True, "description": "Paid casual leave for personal errands and short breaks."},
    {"name": "Sick Leave", "code": "sick_leave", "is_paid": True, "default_annual_allocation": 6.0, "allow_half_day": True, "requires_approval": True, "description": "Paid leave for illness or medical appointments."},
    {"name": "Annual Leave", "code": "annual_leave", "is_paid": True, "default_annual_allocation": 12.0, "allow_half_day": True, "requires_approval": True, "description": "Paid annual / earned leave."},
    {"name": "Emergency Leave", "code": "emergency_leave", "is_paid": True, "default_annual_allocation": 2.0, "allow_half_day": True, "requires_approval": True, "description": "Paid leave for genuine emergencies."},
    {"name": "Unpaid Leave", "code": "unpaid_leave", "is_paid": False, "default_annual_allocation": 0.0, "allow_half_day": True, "requires_approval": True, "description": "Leave without pay; tracked for payroll input."},
]


async def assert_leave_view_access(current_user: User, employee: User) -> None:
    if str(current_user.id) == str(employee.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Users cannot view their own leave requests")
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if current_user.company_id != employee.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        if employee.reports_to == str(current_user.id) or str(current_user.id) in (employee.ancestors or []):
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def history_entry(action: str, actor_id: str, *, comment: Optional[str] = None, target_user_id: Optional[str] = None) -> Dict[str, Any]:
    return {
        "action": action,
        "actor_id": str(actor_id),
        "target_user_id": str(target_user_id) if target_user_id else None,
        "comment": comment,
        "timestamp": utc_now().isoformat(),
    }


def can_approve_leave(current_user: User, employee: User, leave: LeaveRequest) -> bool:
    current_user_id = str(current_user.id)
    if current_user_id == str(employee.id) or current_user_id == leave.employee_id:
        return False
    if leave.status not in {LeaveStatus.PENDING, LeaveStatus.FORWARDED}:
        return False
    if current_user.role not in APPROVER_ROLES:
        return False
    if current_user.role == UserRole.SUPER_ADMIN:
        return False
    if current_user.company_id != employee.company_id:
        return False
    # Managers review employee/lead requests. Once the manager forwards a request
    # to admins, only the selected reviewers can act on it; otherwise the manager
    # reviews their reports' requests (including legacy requests that predate the
    # pending_with_user_ids field, so it may be empty).
    if current_user.role == UserRole.MANAGER:
        if employee.role not in {UserRole.EMPLOYEE, UserRole.LEAD}:
            return False
        if getattr(leave, "forwarded_by", None):
            pending_with = {str(item) for item in getattr(leave, "pending_with_user_ids", []) or []}
            return current_user_id in pending_with
        return True
    # Admins must be in pending_with_user_ids (set via forwarding)
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        pending_with = {str(item) for item in getattr(leave, "pending_with_user_ids", []) or []}
        if current_user_id not in pending_with:
            return False
        return employee.role == UserRole.MANAGER or bool(getattr(leave, "forwarded_by", None))
    return False


async def assert_leave_manage_access(current_user: User, employee: User, leave: LeaveRequest) -> None:
    if not can_approve_leave(current_user, employee, leave):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot review this leave request")


def assert_leave_mutable(leave: LeaveRequest) -> None:
    if leave.status in TERMINAL_LEAVE_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Finalized leave requests cannot be modified")


def require_action_comment(comment: Optional[str], label: str) -> str:
    cleaned = (comment or "").strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} is required")
    return cleaned


async def nearest_manager(employee: User) -> Optional[User]:
    if employee.role == UserRole.LEAD and employee.reports_to:
        manager = await User.get(employee.reports_to)
        return manager if manager and manager.role == UserRole.MANAGER else None
    for ancestor_id in reversed(employee.ancestors or []):
        ancestor = await User.get(ancestor_id)
        if ancestor and ancestor.role == UserRole.MANAGER:
            return ancestor
    return None


async def company_admin_ids(company_id: Optional[str]) -> list[str]:
    """Return IDs of company-level approvers (admins and sub-admins)."""
    if not company_id:
        return []
    approvers = await User.find({
        "company_id": company_id,
        "role": {"$in": [UserRole.ADMIN.value, UserRole.SUB_ADMIN.value]},
    }).to_list()
    return [str(approver.id) for approver in approvers]


async def initial_pending_reviewers(employee: User) -> list[str]:
    if employee.role in {UserRole.EMPLOYEE, UserRole.LEAD}:
        manager = await nearest_manager(employee)
        if manager:
            return [str(manager.id)]
        admins = await company_admin_ids(employee.company_id)
        if admins:
            return admins
        return [str(employee.id)]
    if employee.role == UserRole.MANAGER:
        admins = await company_admin_ids(employee.company_id)
        if admins:
            return admins
        return [str(employee.id)]
    if employee.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        admins = await company_admin_ids(employee.company_id)
        other_admins = [a for a in admins if a != str(employee.id)]
        return other_admins if other_admins else [str(employee.id)]
    return [str(employee.id)]


def leave_visibility_query(current_user: User, employee_id: Optional[str] = None) -> Dict[str, Any]:
    current_user_id = str(current_user.id)
    if employee_id:
        if employee_id == current_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Users cannot view their own leave requests")
        return {"employee_id": employee_id}
    if current_user.role == UserRole.SUPER_ADMIN:
        return {}
    query: Dict[str, Any] = {"company_id": current_user.company_id, "employee_id": {"$ne": current_user_id}}
    # Admins, sub-admins and managers see every company leave except their own.
    # Seeing a request is not the same as acting on it: approve/reject remains
    # restricted to the pending reviewers (the members the manager selected when
    # forwarding), enforced separately by can_approve_leave.
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER}:
        return query
    query["employee_id"] = "__none__"
    return query


async def assert_forward_target(current_user: User, leave: LeaveRequest, employee: User, target_user: User) -> None:
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can forward leave requests")
    if not str(target_user.id).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Forward target is required")
    if str(target_user.id) == str(current_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot forward leave to yourself")
    await assert_leave_manage_access(current_user, employee, leave)
    if str(target_user.id) == leave.employee_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot forward leave to requester")
    if target_user.company_id != leave.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forward target outside company")
    if target_user.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Forward target must be Admin or Sub Admin")


def parse_leave_date(value: str, *, end_of_day: bool = False) -> datetime:
    if not value or not isinstance(value, str) or not value.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date string cannot be empty"
        )
    try:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            parsed = datetime.strptime(value, "%Y-%m-%d")
        if "T" not in value:
            return datetime.combine(parsed.date(), time.max if end_of_day else time.min)
        return parse_to_utc(parsed)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: '{value}'. Expected YYYY-MM-DD or ISO 8601 string."
        )


async def ensure_no_overlap(employee_id: str, start_date: datetime, end_date: datetime, exclude_id: Any = None) -> None:
    query: Dict[str, Any] = {
        "employee_id": employee_id,
        "status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.FORWARDED.value, LeaveStatus.APPROVED.value]},
        "start_date": {"$lte": end_date},
        "end_date": {"$gte": start_date},
    }
    if exclude_id:
        query["_id"] = {"$ne": exclude_id}
    existing = await LeaveRequest.find_one(query)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Overlapping leave request already exists")


def availability_for_leave(leave: Optional[LeaveRequest]) -> str:
    if not leave:
        return "working"
    if leave.leave_type == LeaveType.WORK_FROM_HOME:
        return "wfh"
    return "leave"


async def get_current_availability(employee_id: str, company_id: Optional[str]) -> Dict[str, Any]:
    now = utc_now()
    query: Dict[str, Any] = {
        "employee_id": employee_id,
        "status": LeaveStatus.APPROVED.value,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now},
    }
    if company_id:
        query["company_id"] = company_id
    leave = await LeaveRequest.find_one(query)
    return {
        "availability": availability_for_leave(leave),
        "leave": serialize_leave(leave) if leave else None,
    }


async def sync_leave_lifecycle(company_id: Optional[str] = None) -> None:
    now = utc_now()
    query: Dict[str, Any] = {"status": LeaveStatus.APPROVED.value}
    if company_id:
        query["company_id"] = company_id
    leaves = await LeaveRequest.find(query).to_list()
    for leave in leaves:
        if leave.start_date <= now:
            is_wfh = leave.leave_type == LeaveType.WORK_FROM_HOME
            await create_timeline_event(
                user_id=leave.employee_id,
                company_id=leave.company_id,
                event_type=TimelineEventType.WFH_STARTED if is_wfh else TimelineEventType.LEAVE_STARTED,
                title="WFH Started" if is_wfh else "Leave Started",
                description=_leave_title(leave),
                related_module=TimelineModule.LEAVE,
                related_record_id=str(leave.id),
                timestamp=leave.start_date,
                metadata={"leave_type": leave.leave_type.value},
                idempotency_key=f"leave:{leave.id}:started",
            )
        if leave.end_date < now:
            is_wfh = leave.leave_type == LeaveType.WORK_FROM_HOME
            await create_timeline_event(
                user_id=leave.employee_id,
                company_id=leave.company_id,
                event_type=TimelineEventType.WFH_ENDED if is_wfh else TimelineEventType.LEAVE_ENDED,
                title="WFH Ended" if is_wfh else "Leave Ended",
                description=_leave_title(leave),
                related_module=TimelineModule.LEAVE,
                related_record_id=str(leave.id),
                timestamp=leave.end_date,
                metadata={"leave_type": leave.leave_type.value},
                idempotency_key=f"leave:{leave.id}:ended",
            )


async def notify_user(user_id: str, company_id: Optional[str], notification_type: NotificationType, title: str, message: str, leave_id: str) -> None:
    try:
        await Notification(
            user_id=user_id,
            company_id=company_id,
            type=notification_type,
            title=title,
            message=message,
            related_id=leave_id,
            related_type="leave",
            action_url="/leaves",
        ).insert()
    except Exception as exc:
        logger.error("Failed to create leave notification: %s", exc)


async def notify_admins(company_id: Optional[str], notification_type: NotificationType, title: str, message: str, leave_id: str) -> None:
    if not company_id:
        return
    approvers = await User.find({
        "company_id": company_id,
        "role": {"$in": [UserRole.ADMIN.value, UserRole.SUB_ADMIN.value]},
    }).to_list()
    for approver in approvers:
        await notify_user(str(approver.id), company_id, notification_type, title, message, leave_id)


def serialize_leave(
    leave: LeaveRequest,
    employee: Optional[User] = None,
    type_map: Optional[Dict[str, LeaveTypeConfig]] = None,
) -> Dict[str, Any]:
    employee_role = getattr(leave, "employee_role", None)
    if not employee_role and employee:
        employee_role = employee.role.value
    legacy_value = leave.leave_type.value if isinstance(leave.leave_type, LeaveType) else None
    leave_type_id = getattr(leave, "leave_type_id", None)
    # Normalized leave-type info: prefer the configurable type; legacy requests
    # fall back to a readable legacy label (never crash on old values).
    type_config = (type_map or {}).get(leave_type_id or "") if leave_type_id else None
    leave_type_name = type_config.name if type_config else (LEGACY_LEAVE_LABELS.get(LeaveType(legacy_value)) if legacy_value else None)
    is_paid = type_config.is_paid if type_config else _legacy_is_paid(legacy_value)
    allow_half_day = type_config.allow_half_day if type_config else True
    raw_duration = getattr(leave, "duration", None)
    duration = raw_duration.value if isinstance(raw_duration, LeaveDuration) else (legacy_value if legacy_value in {"full_day", "half_day"} else None)
    return {
        "id": str(leave.id),
        "employee_id": leave.employee_id,
        "employee_role": employee_role,
        "employee_name": employee.full_name() if employee else None,
        "company_id": leave.company_id,
        # Legacy compatibility field (historical values) — new requests set None.
        "leave_type": legacy_value,
        "leave_type_id": leave_type_id,
        "leave_type_name": leave_type_name,
        "duration": duration,
        "requested_units": float(getattr(leave, "requested_units", 1.0) or 1.0),
        "is_paid": is_paid,
        "allow_half_day": allow_half_day,
        "start_date": leave.start_date,
        "end_date": leave.end_date,
        "reason": leave.reason,
        "attachment_url": leave.attachment_url,
        "attachment_public_id": getattr(leave, "attachment_public_id", None),
        "status": leave.status.value,
        "reviewed_by": leave.reviewed_by,
        "reviewed_at": leave.reviewed_at,
        "review_comment": leave.review_comment,
        "pending_with_user_ids": [str(item) for item in (getattr(leave, "pending_with_user_ids", []) or [])],
        "forwarded_by": leave.forwarded_by,
        "forwarded_to_user_id": getattr(leave, "forwarded_to_user_id", None),
        "forwarded_to_user_ids": [str(item) for item in (getattr(leave, "forwarded_to_user_ids", []) or [])],
        "forwarded_at": leave.forwarded_at,
        "forwarded_to_admin": leave.forwarded_to_admin,
        "forward_comment": getattr(leave, "forward_comment", None),
        "approval_history": getattr(leave, "approval_history", []) or [],
        "cancelled_at": leave.cancelled_at,
        "created_at": leave.created_at,
        "updated_at": leave.updated_at,
    }


def _legacy_is_paid(legacy_value: Optional[str]) -> Optional[bool]:
    """Best-effort paid classification for legacy requests (payroll input)."""
    if legacy_value in {"sick_leave", "casual_leave", "emergency_leave"}:
        return True
    if legacy_value == "work_from_home":
        return None  # attendance/work-mode, not paid leave
    if legacy_value in {"full_day", "half_day"}:
        return True
    return None


def leave_display_title(leave: LeaveRequest) -> str:
    """Safe display title that never crashes on legacy/missing type values."""
    legacy = leave.leave_type.value if isinstance(leave.leave_type, LeaveType) else None
    if legacy:
        return LEGACY_LEAVE_LABELS.get(LeaveType(legacy), legacy.replace("_", " ").title())
    return "Leave"


# =============================================================================
# Phase 3 — Leave Type configuration
# =============================================================================


def serialize_leave_type(doc: LeaveTypeConfig) -> Dict[str, Any]:
    return {
        "id": str(doc.id),
        "company_id": doc.company_id,
        "name": doc.name,
        "code": doc.code,
        "description": doc.description,
        "is_paid": doc.is_paid,
        "default_annual_allocation": float(doc.default_annual_allocation or 0.0),
        "allow_half_day": doc.allow_half_day,
        "requires_approval": doc.requires_approval,
        "carry_forward_allowed": doc.carry_forward_allowed,
        "max_carry_forward": doc.max_carry_forward,
        "active": doc.active,
        "created_by": doc.created_by,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
    }


async def ensure_default_leave_types(company_id: str, actor_id: Optional[str] = None) -> list[LeaveTypeConfig]:
    """Idempotently seed the default configurable Leave Types for a company."""
    from pymongo.errors import DuplicateKeyError

    created: list[LeaveTypeConfig] = []
    for spec in DEFAULT_LEAVE_TYPES:
        existing = await LeaveTypeConfig.find_one({"company_id": company_id, "code": spec["code"]})
        if existing:
            continue
        try:
            doc = LeaveTypeConfig(company_id=company_id, created_by=actor_id, **spec)
            await doc.insert()
            created.append(doc)
        except DuplicateKeyError:
            continue
    return created


async def active_leave_types(company_id: str, *, include_inactive: bool = False) -> list[LeaveTypeConfig]:
    await ensure_default_leave_types(company_id)
    query: Dict[str, Any] = {"company_id": company_id}
    if not include_inactive:
        query["active"] = True
    return await LeaveTypeConfig.find(query).sort("name").to_list()


async def get_leave_type_config(company_id: str, leave_type_id: str) -> Optional[LeaveTypeConfig]:
    if not leave_type_id:
        return None
    return await LeaveTypeConfig.find_one({"company_id": company_id, "_id": leave_type_id})


async def create_leave_type(company_id: str, actor: User, payload: Dict[str, Any]) -> LeaveTypeConfig:
    from pymongo.errors import DuplicateKeyError

    payload = dict(payload)
    name = (payload.get("name") or "").strip()
    code = (payload.get("code") or "").strip().lower().replace(" ", "_").replace("-", "_")
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required")
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code is required")
    existing = await LeaveTypeConfig.find_one({"company_id": company_id, "code": code})
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A leave type with this code already exists")
    allowed = {
        "name", "code", "description", "is_paid", "default_annual_allocation",
        "allow_half_day", "requires_approval", "carry_forward_allowed", "max_carry_forward", "active",
    }
    clean = {k: v for k, v in payload.items() if k in allowed and v is not None}
    try:
        doc = LeaveTypeConfig(company_id=company_id, name=name, code=code, created_by=str(actor.id), **clean)
        await doc.insert()
    except DuplicateKeyError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A leave type with this code already exists")
    return doc


async def update_leave_type(company_id: str, leave_type_id: str, payload: Dict[str, Any]) -> LeaveTypeConfig:
    doc = await LeaveTypeConfig.get(leave_type_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave type not found")
    allowed = {
        "name", "description", "is_paid", "default_annual_allocation",
        "allow_half_day", "requires_approval", "carry_forward_allowed", "max_carry_forward", "active",
    }
    for key, value in payload.items():
        if key in allowed and value is not None:
            setattr(doc, key, value)
    doc.updated_at = utc_now()
    await doc.save()
    return doc


async def deactivate_leave_type(company_id: str, leave_type_id: str) -> LeaveTypeConfig:
    """Soft deactivate — historical requests keep their reference."""
    doc = await LeaveTypeConfig.get(leave_type_id)
    if not doc or doc.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave type not found")
    doc.active = False
    doc.updated_at = utc_now()
    await doc.save()
    return doc


async def build_leave_type_map(company_id: str, type_ids: list[str]) -> Dict[str, LeaveTypeConfig]:
    ids = [tid for tid in type_ids if tid]
    if not ids:
        return {}
    docs = await LeaveTypeConfig.find({"company_id": company_id, "_id": {"$in": ids}}).to_list()
    return {str(doc.id): doc for doc in docs}


# =============================================================================
# Phase 3 — Leave Duration / units
# =============================================================================


def legacy_duration_for(value: Optional[str]) -> Optional[LeaveDuration]:
    if value == LeaveDuration.FULL_DAY.value:
        return LeaveDuration.FULL_DAY
    if value == LeaveDuration.HALF_DAY.value:
        return LeaveDuration.HALF_DAY
    return None


def compute_requested_units(start_date: datetime, end_date: datetime, duration: Optional[LeaveDuration]) -> float:
    """Backend-authoritative leave consumption.

    Full day counts every calendar day in the inclusive range (Phase 3 does not
    subtract weekends/holidays — a working-day provider can be injected in
    Phase 4). Half day consumes 0.5 and must be a single day (enforced in
    validation).
    """
    if duration == LeaveDuration.HALF_DAY:
        return 0.5
    start_day = start_date.date()
    end_day = end_date.date()
    return float(max(1, (end_day - start_day).days + 1))


# =============================================================================
# Phase 3 — Leave Balance / Allocation (cached + reconciled, CAS protected)
# =============================================================================


def _current_period() -> str:
    return str(utc_now().year)


async def _find_balance(company_id: str, employee_id: str, leave_type_id: str) -> Optional[LeaveBalance]:
    return await LeaveBalance.find_one(
        {"company_id": company_id, "employee_id": employee_id, "leave_type_id": leave_type_id}
    )


async def ensure_initial_allocations(company_id: str, employee_id: str) -> None:
    """Idempotently create a balance (with the type's default allocation) for
    every active leave type of the current period. New employees start with the
    configured default; HR can override via the allocation APIs."""
    from pymongo.errors import DuplicateKeyError

    period = _current_period()
    types = await active_leave_types(company_id, include_inactive=False)
    for doc_type in types:
        existing = await _find_balance(company_id, employee_id, str(doc_type.id))
        if existing:
            continue
        try:
            await LeaveBalance(
                company_id=company_id,
                employee_id=employee_id,
                leave_type_id=str(doc_type.id),
                period=period,
                allocated=float(doc_type.default_annual_allocation or 0.0),
                used=0.0,
                pending=0.0,
                version=0,
                adjustments=[],
            ).insert()
        except DuplicateKeyError:
            continue


async def compute_used_pending(company_id: str, employee_id: str, leave_type_id: str) -> tuple[float, float]:
    """Derive used/pending from requests (source of truth for the cache)."""
    used = 0.0
    pending = 0.0
    requests = await LeaveRequest.find(
        {"company_id": company_id, "employee_id": employee_id, "leave_type_id": leave_type_id}
    ).to_list()
    for req in requests:
        units = float(getattr(req, "requested_units", 1.0) or 1.0)
        if req.status == LeaveStatus.APPROVED:
            used += units
        elif req.status in (LeaveStatus.PENDING, LeaveStatus.FORWARDED):
            pending += units
    return round(used, 4), round(pending, 4)


async def reconcile_balance(company_id: str, employee_id: str, leave_type_id: str) -> None:
    """Sync the cached used/pending values from requests (optimistic-lock safe)."""
    used, pending = await compute_used_pending(company_id, employee_id, leave_type_id)
    bal = await _find_balance(company_id, employee_id, leave_type_id)
    if not bal:
        await ensure_initial_allocations(company_id, employee_id)
        bal = await _find_balance(company_id, employee_id, leave_type_id)
        if not bal:
            return
    for _ in range(10):
        updated = await LeaveBalance.get_pymongo_collection().find_one_and_update(
            {"_id": bal.id, "version": bal.version},
            {"$set": {"used": used, "pending": pending, "updated_at": utc_now()}, "$inc": {"version": 1}},
            return_document=ReturnDocument.AFTER,
        )
        if updated:
            return
        refreshed = await _find_balance(company_id, employee_id, leave_type_id)
        if not refreshed:
            return
        bal = refreshed


async def get_balance(company_id: str, employee_id: str, leave_type_id: str) -> Optional[Dict[str, Any]]:
    await ensure_initial_allocations(company_id, employee_id)
    await reconcile_balance(company_id, employee_id, leave_type_id)
    bal = await _find_balance(company_id, employee_id, leave_type_id)
    if not bal:
        return None
    return {
        "leave_type_id": leave_type_id,
        "allocated": round(bal.allocated, 4),
        "used": round(bal.used, 4),
        "pending": round(bal.pending, 4),
        "available": round(bal.allocated - bal.used - bal.pending, 4),
        "period": bal.period,
    }


async def get_balances(company_id: str, employee_id: str) -> list[Dict[str, Any]]:
    """Balances across active leave types — backend-computed, never frontend-calculated."""
    types = await active_leave_types(company_id, include_inactive=False)
    result = []
    for doc_type in types:
        bal = await get_balance(company_id, employee_id, str(doc_type.id))
        if bal is None:
            continue
        result.append(
            {
                **bal,
                "name": doc_type.name,
                "code": doc_type.code,
                "is_paid": doc_type.is_paid,
                "allow_half_day": doc_type.allow_half_day,
            }
        )
    return result


async def reserve_balance_units(company_id: str, employee_id: str, leave_type_id: str, units: float) -> bool:
    """Atomically reserve units on pending (CAS loop) — prevents concurrent over-allocation."""
    if units <= 0:
        return True
    for _ in range(10):
        bal = await _find_balance(company_id, employee_id, leave_type_id)
        if not bal:
            await ensure_initial_allocations(company_id, employee_id)
            continue
        available = round(bal.allocated - bal.used - bal.pending, 4)
        if available + 1e-9 < units:
            return False
        updated = await LeaveBalance.get_pymongo_collection().find_one_and_update(
            {"_id": bal.id, "version": bal.version},
            {"$set": {"pending": round(bal.pending + units, 4), "updated_at": utc_now()}, "$inc": {"version": 1}},
            return_document=ReturnDocument.AFTER,
        )
        if updated:
            return True
    return False


async def commit_balance_units(company_id: str, employee_id: str, leave_type_id: str, units: float) -> bool:
    """Approve: move units pending → used. Returns False when allocation was reduced
    below the commitment (approval must then be blocked/reviewed)."""
    if units <= 0:
        return True
    for _ in range(10):
        bal = await _find_balance(company_id, employee_id, leave_type_id)
        if not bal:
            await ensure_initial_allocations(company_id, employee_id)
            continue
        if round(bal.allocated - bal.used - bal.pending, 4) + 1e-9 < 0:
            return False
        updated = await LeaveBalance.get_pymongo_collection().find_one_and_update(
            {"_id": bal.id, "version": bal.version},
            {
                "$set": {
                    "pending": round(bal.pending - units, 4),
                    "used": round(bal.used + units, 4),
                    "updated_at": utc_now(),
                },
                "$inc": {"version": 1},
            },
            return_document=ReturnDocument.AFTER,
        )
        if updated:
            return True
    return False


async def release_balance_units(company_id: str, employee_id: str, leave_type_id: str, units: float) -> bool:
    """Reject/cancel pending: release reserved units."""
    if units <= 0:
        return True
    for _ in range(10):
        bal = await _find_balance(company_id, employee_id, leave_type_id)
        if not bal:
            return True
        new_pending = max(0.0, round(bal.pending - units, 4))
        updated = await LeaveBalance.get_pymongo_collection().find_one_and_update(
            {"_id": bal.id, "version": bal.version},
            {"$set": {"pending": new_pending, "updated_at": utc_now()}, "$inc": {"version": 1}},
            return_document=ReturnDocument.AFTER,
        )
        if updated:
            return True
    return False


async def reverse_used_units(company_id: str, employee_id: str, leave_type_id: str, units: float) -> bool:
    """Cancel approved: reverse used units."""
    if units <= 0:
        return True
    for _ in range(10):
        bal = await _find_balance(company_id, employee_id, leave_type_id)
        if not bal:
            return True
        new_used = max(0.0, round(bal.used - units, 4))
        updated = await LeaveBalance.get_pymongo_collection().find_one_and_update(
            {"_id": bal.id, "version": bal.version},
            {"$set": {"used": new_used, "updated_at": utc_now()}, "$inc": {"version": 1}},
            return_document=ReturnDocument.AFTER,
        )
        if updated:
            return True
    return False


async def adjust_allocation(
    company_id: str,
    employee_id: str,
    leave_type_id: str,
    new_allocated: float,
    actor_id: str,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """HR allocation adjustment with audit trail."""
    await ensure_initial_allocations(company_id, employee_id)
    bal = await _find_balance(company_id, employee_id, leave_type_id)
    if not bal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave allocation not found")
    new_allocated = float(new_allocated)
    if new_allocated < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Allocation cannot be negative")
    for _ in range(10):
        updated = await LeaveBalance.get_pymongo_collection().find_one_and_update(
            {"_id": bal.id, "version": bal.version},
            {
                "$set": {"allocated": round(new_allocated, 4), "updated_at": utc_now()},
                "$inc": {"version": 1},
                "$push": {
                    "adjustments": {
                        "previous_allocated": round(bal.allocated, 4),
                        "new_allocated": round(new_allocated, 4),
                        "actor_id": str(actor_id),
                        "reason": reason,
                        "timestamp": utc_now().isoformat(),
                    }
                },
            },
            return_document=ReturnDocument.AFTER,
        )
        if updated:
            return await get_balance(company_id, employee_id, leave_type_id) or {
                "leave_type_id": leave_type_id,
                "allocated": round(new_allocated, 4),
                "used": 0.0,
                "pending": 0.0,
                "available": round(new_allocated, 4),
                "period": _current_period(),
            }
        refreshed = await _find_balance(company_id, employee_id, leave_type_id)
        if not refreshed:
            break
        bal = refreshed
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Allocation was updated concurrently. Please retry.")


# =============================================================================
# Phase 3 — Leave → Attendance integration (minimal, reliable)
# =============================================================================


def attendance_leave_marker(leave: LeaveRequest, type_map: Optional[Dict[str, LeaveTypeConfig]] = None) -> Optional[str]:
    """"paid_leave" | "unpaid_leave" | None for an APPROVED leave day.

    Paid/unpaid is decided by the LeaveTypeConfig referenced through
    ``leave.leave_type_id`` (Phase 3 normalized model). Legacy requests fall
    back to the legacy classification. When the classification cannot be
    resolved the marker is None and a warning is logged — an unknown leave is
    never silently treated as paid or unpaid.
    """
    if leave_is_work_from_home(leave):
        return None
    is_paid = None
    leave_type_id = getattr(leave, "leave_type_id", None)
    if leave_type_id:
        config = type_map.get(str(leave_type_id)) if type_map else None
        is_paid = config.is_paid if config else None
    else:
        is_paid = _legacy_is_paid(leave.leave_type.value if isinstance(leave.leave_type, LeaveType) else None)
    if is_paid is None:
        logger.warning(
            "Leave %s paid classification could not be resolved (leave_type_id=%s) — no attendance marker written",
            leave.id, leave_type_id,
        )
        return None
    return "paid_leave" if is_paid else "unpaid_leave"


def leave_is_work_from_home(leave: LeaveRequest) -> bool:
    return bool(isinstance(leave.leave_type, LeaveType) and leave.leave_type == LeaveType.WORK_FROM_HOME)


def _date_range_days(start_date: datetime, end_date: datetime) -> list[date]:
    days: list[date] = []
    current = start_date.date()
    end = end_date.date()
    while current <= end:
        days.append(current)
        current += timedelta(days=1)
    return days


async def mark_leave_days_on_attendance(
    company_id: str, employee_id: str, start_date: datetime, end_date: datetime, marker: Optional[str]
) -> None:
    """Upsert Attendance records so approved-leave days carry the leave marker."""
    if not marker:
        return
    for day in _date_range_days(start_date, end_date):
        await Attendance.get_pymongo_collection().update_one(
            {"company_id": company_id, "employee_id": employee_id, "date": day.strftime("%Y-%m-%d")},
            {
                "$set": {"leave_status": marker, "updated_at": utc_now()},
                "$setOnInsert": {"status": "Offline", "created_at": utc_now()},
            },
            upsert=True,
        )


async def clear_leave_days_from_attendance(
    company_id: str, employee_id: str, start_date: datetime, end_date: datetime
) -> None:
    """Remove the leave marker; delete records that were created solely for leave."""
    for day in _date_range_days(start_date, end_date):
        day_str = day.strftime("%Y-%m-%d")
        record = await Attendance.find_one(
            {"company_id": company_id, "employee_id": employee_id, "date": day_str}
        )
        if not record:
            continue
        record.leave_status = None
        if not record.login_time and not record.logout_time and not (record.total_working_hours or 0) and not (record.break_duration or 0):
            await record.delete()
        else:
            record.updated_at = utc_now()
            await record.save()


# =============================================================================
# Phase 3 — Request validation
# =============================================================================


async def validate_new_leave_request(
    company_id: str,
    employee: User,
    leave_type_id: Optional[str],
    duration: Optional[LeaveDuration],
    start_date: datetime,
    end_date: datetime,
    reason: str,
) -> tuple[Optional[LeaveTypeConfig], float]:
    """Validate a new leave request. Returns (type_config, requested_units).

    Raises HTTPException with user-actionable messages; the frontend surfaces
    these inline instead of treating them as system errors.
    """
    if end_date < start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date cannot be before start date")
    if not (reason or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reason is required")

    type_config = None
    if leave_type_id:
        type_config = await get_leave_type_config(company_id, leave_type_id)
        if not type_config:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected leave type does not exist")
        if type_config.active is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This leave type is currently inactive")
        duration = duration or LeaveDuration.FULL_DAY
        if duration == LeaveDuration.HALF_DAY:
            if start_date.date() != end_date.date():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Half-day leave can only be requested for a single day")
            if not type_config.allow_half_day:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Half-day leave is not available for {type_config.name}")
        units = compute_requested_units(start_date, end_date, duration)
    else:
        # Legacy path (old frontend/values): no configurable type, no balance.
        units = compute_requested_units(start_date, end_date, duration or LeaveDuration.FULL_DAY)
    return type_config, units


def _leave_title(leave: LeaveRequest) -> str:
    return leave_display_title(leave)
