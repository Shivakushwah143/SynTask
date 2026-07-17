"""
Leave management business logic.
"""
from __future__ import annotations

import logging
from datetime import datetime, time
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from app.models.leave import LeaveRequest, LeaveStatus, LeaveType
from app.models.notification import Notification, NotificationType
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole
from app.services.timeline_service import create_timeline_event

logger = logging.getLogger(__name__)


APPROVER_ROLES = {UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN}
TERMINAL_LEAVE_STATUSES = {LeaveStatus.APPROVED, LeaveStatus.REJECTED, LeaveStatus.CANCELLED}


async def assert_leave_view_access(current_user: User, employee: User) -> None:
    if str(current_user.id) == str(employee.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Users cannot view their own leave requests")
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if current_user.company_id != employee.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.ADMIN:
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
        "timestamp": datetime.utcnow().isoformat(),
    }


def is_direct_or_indirect_report(manager: User, employee: User) -> bool:
    manager_id = str(manager.id)
    return employee.reports_to == manager_id or manager_id in (employee.ancestors or [])


def can_approve_leave(current_user: User, employee: User, leave: LeaveRequest) -> bool:
    current_user_id = str(current_user.id)
    if current_user_id == str(employee.id) or current_user_id == leave.employee_id:
        return False
    if leave.status != LeaveStatus.PENDING:
        return False
    if current_user.role not in APPROVER_ROLES:
        return False
    if current_user.role == UserRole.SUPER_ADMIN:
        return False
    if current_user.company_id != employee.company_id:
        return False
    pending_with = {str(item) for item in getattr(leave, "pending_with_user_ids", []) or []}
    if current_user_id not in pending_with:
        return False
    if current_user.role == UserRole.ADMIN:
        return employee.role == UserRole.MANAGER or bool(getattr(leave, "forwarded_by", None))
    if current_user.role == UserRole.MANAGER:
        return employee.role in {UserRole.EMPLOYEE, UserRole.LEAD} and is_direct_or_indirect_report(current_user, employee)
    return False


async def assert_leave_manage_access(current_user: User, employee: User, leave: LeaveRequest) -> None:
    if not can_approve_leave(current_user, employee, leave):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot review this leave request")


def assert_leave_mutable(leave: LeaveRequest) -> None:
    if leave.status in TERMINAL_LEAVE_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Finalized leave requests cannot be modified")


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
    if not company_id:
        return []
    admins = await User.find({"company_id": company_id, "role": UserRole.ADMIN.value}).to_list()
    return [str(admin.id) for admin in admins]


async def initial_pending_reviewers(employee: User) -> list[str]:
    if employee.role in {UserRole.EMPLOYEE, UserRole.LEAD}:
        manager = await nearest_manager(employee)
        if manager:
            return [str(manager.id)]
        return await company_admin_ids(employee.company_id)
    if employee.role == UserRole.MANAGER:
        return await company_admin_ids(employee.company_id)
    return []


def leave_visibility_query(current_user: User, employee_id: Optional[str] = None) -> Dict[str, Any]:
    current_user_id = str(current_user.id)
    if employee_id:
        if employee_id == current_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Users cannot view their own leave requests")
        return {"employee_id": employee_id}
    if current_user.role == UserRole.SUPER_ADMIN:
        return {}
    query: Dict[str, Any] = {"company_id": current_user.company_id, "employee_id": {"$ne": current_user_id}}
    if current_user.role == UserRole.ADMIN:
        return query
    if current_user.role == UserRole.MANAGER:
        query["pending_with_user_ids"] = current_user_id
        return query
    query["employee_id"] = "__none__"
    return query


async def assert_forward_target(current_user: User, leave: LeaveRequest, employee: User, target_user: User) -> None:
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can forward leave requests")
    await assert_leave_manage_access(current_user, employee, leave)
    if str(target_user.id) == leave.employee_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot forward leave to requester")
    if target_user.company_id != leave.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forward target outside company")
    if target_user.role not in {UserRole.MANAGER, UserRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Forward target must be Manager or Admin")
    if target_user.role == UserRole.MANAGER and str(target_user.id) == str(current_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot forward leave to yourself")
    if target_user.role == UserRole.MANAGER and not is_direct_or_indirect_report(target_user, employee):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Target manager is outside requester hierarchy")
        return
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def parse_leave_date(value: str, *, end_of_day: bool = False) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    if "T" not in value:
        return datetime.combine(parsed.date(), time.max if end_of_day else time.min)
    return parsed.replace(tzinfo=None)


async def ensure_no_overlap(employee_id: str, start_date: datetime, end_date: datetime, exclude_id: Optional[str] = None) -> None:
    query: Dict[str, Any] = {
        "employee_id": employee_id,
        "status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.APPROVED.value]},
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
    now = datetime.now()
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
    now = datetime.now()
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
    admins = await User.find({"company_id": company_id, "role": UserRole.ADMIN.value}).to_list()
    for admin in admins:
        await notify_user(str(admin.id), company_id, notification_type, title, message, leave_id)


def serialize_leave(leave: LeaveRequest, employee: Optional[User] = None) -> Dict[str, Any]:
    employee_role = getattr(leave, "employee_role", None)
    if not employee_role and employee:
        employee_role = employee.role.value
    return {
        "id": str(leave.id),
        "employee_id": leave.employee_id,
        "employee_role": employee_role,
        "employee_name": employee.full_name() if employee else None,
        "company_id": leave.company_id,
        "leave_type": leave.leave_type.value,
        "start_date": leave.start_date,
        "end_date": leave.end_date,
        "reason": leave.reason,
        "attachment_url": leave.attachment_url,
        "status": leave.status.value,
        "reviewed_by": leave.reviewed_by,
        "reviewed_at": leave.reviewed_at,
        "review_comment": leave.review_comment,
        "forwarded_by": leave.forwarded_by,
        "forwarded_at": leave.forwarded_at,
        "forwarded_to_admin": leave.forwarded_to_admin,
        "cancelled_at": leave.cancelled_at,
        "created_at": leave.created_at,
        "updated_at": leave.updated_at,
    }


def _leave_title(leave: LeaveRequest) -> str:
    return leave.leave_type.value.replace("_", " ").title()

