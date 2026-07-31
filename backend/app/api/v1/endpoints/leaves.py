"""
Leave management endpoints.
"""
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.api.dependencies import get_current_user
from app.core.config import settings
from app.models.leave import LeaveRequest, LeaveStatus, LeaveType
from app.models.notification import NotificationType
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole
from app.services.leave_service import (
    assert_forward_target,
    assert_leave_manage_access,
    assert_leave_view_access,
    assert_leave_mutable,
    ensure_no_overlap,
    get_current_availability,
    history_entry,
    initial_pending_reviewers,
    leave_visibility_query,
    notify_user,
    parse_leave_date,
    require_action_comment,
    serialize_leave,
    sync_leave_lifecycle,
)
from app.services.timeline_service import create_timeline_event
from app.core.clock import utc_now
from app.services.file_service import FileService

router = APIRouter()
UPLOAD_DIR = Path(__file__).resolve().parents[4] / settings.UPLOAD_DIR / "leaves"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/")
async def create_leave_request(
    leave_type: LeaveType = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    reason: str = Form(...),
    attachment: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
):
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    start = parse_leave_date(start_date)
    end = parse_leave_date(end_date, end_of_day=True)
    if end < start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date cannot be before start date")
    if not reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reason is required")
    await ensure_no_overlap(str(current_user.id), start, end)
    pending_with_user_ids = await initial_pending_reviewers(current_user)
    if not pending_with_user_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No leave approver found")

    has_attachment = bool(attachment and getattr(attachment, "filename", None) and attachment.filename.strip())
    stored_attachment = await _save_attachment(attachment) if has_attachment else None
    leave = LeaveRequest(
        employee_id=str(current_user.id),
        employee_role=current_user.role.value,
        company_id=current_user.company_id,
        leave_type=leave_type,
        start_date=start,
        end_date=end,
        reason=reason.strip(),
        attachment_url=stored_attachment["file_url"] if stored_attachment else None,
        attachment_public_id=stored_attachment.get("cloudinary_public_id") if stored_attachment else None,
        requested_by=str(current_user.id),
        pending_with_user_ids=pending_with_user_ids,
        approval_history=[
            history_entry("submitted", str(current_user.id), target_user_id=",".join(pending_with_user_ids)),
        ],
    )
    await leave.insert()

    await create_timeline_event(
        user_id=leave.employee_id,
        company_id=leave.company_id,
        event_type=TimelineEventType.LEAVE_REQUESTED,
        title="Leave Requested",
        description=leave.leave_type.value.replace("_", " ").title(),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(leave.id),
        actor_id=str(current_user.id),
        timestamp=leave.created_at,
        metadata={"leave_type": leave.leave_type.value, "status": leave.status.value},
        idempotency_key=f"leave:{leave.id}:requested",
    )
    await _notify_reviewers(leave, current_user, pending_with_user_ids, "Leave request submitted")

    return {"message": "Leave request submitted", "leave": serialize_leave(leave, current_user)}


@router.get("/")
async def list_leave_requests(
    status_filter: Optional[LeaveStatus] = Query(None, alias="status"),
    leave_type: Optional[LeaveType] = Query(None),
    employee_id: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    await sync_leave_lifecycle(current_user.company_id)
    query = await _base_query(current_user, employee_id)
    if status_filter:
        query["status"] = status_filter.value
    if leave_type:
        query["leave_type"] = leave_type.value
    if start_date or end_date:
        if start_date:
            query["end_date"] = {"$gte": start_date}
        if end_date:
            query["start_date"] = {"$lte": end_date}

    leaves = await LeaveRequest.find(query).sort("-created_at").skip(skip).limit(limit).to_list()
    total = await LeaveRequest.find(query).count()
    employees = await _employee_map(leaves)
    return {
        "leaves": [serialize_leave(leave, employees.get(leave.employee_id)) for leave in leaves],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/availability")
async def get_availability(
    employee_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    target = await User.get(employee_id) if employee_id else current_user
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if employee_id:
        await assert_leave_view_access(current_user, target)
    await sync_leave_lifecycle(target.company_id)
    data = await get_current_availability(str(target.id), target.company_id)
    data["employee_id"] = str(target.id)
    return data


@router.get("/calendar")
async def get_leave_calendar(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
):
    await sync_leave_lifecycle(current_user.company_id)
    query = await _base_query(current_user, None)
    query["status"] = LeaveStatus.APPROVED.value
    if start_date:
        query["end_date"] = {"$gte": start_date}
    if end_date:
        query["start_date"] = {"$lte": end_date}
    leaves = await LeaveRequest.find(query).sort("start_date").to_list()
    employees = await _employee_map(leaves)
    today = utc_now()
    today_items = [leave for leave in leaves if leave.start_date <= today <= leave.end_date]
    return {
        "today": [serialize_leave(leave, employees.get(leave.employee_id)) for leave in today_items],
        "upcoming": [serialize_leave(leave, employees.get(leave.employee_id)) for leave in leaves if leave.start_date > today],
        "items": [serialize_leave(leave, employees.get(leave.employee_id)) for leave in leaves],
    }


@router.get("/my")
async def get_my_leave_requests(
    status_filter: Optional[LeaveStatus] = Query(None, alias="status"),
    leave_type: Optional[LeaveType] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's own submitted leave requests."""
    query: dict = {"employee_id": str(current_user.id)}
    if status_filter:
        query["status"] = status_filter.value
    if leave_type:
        query["leave_type"] = leave_type.value
    leaves = await LeaveRequest.find(query).sort("-created_at").skip(skip).limit(limit).to_list()
    total = await LeaveRequest.find(query).count()
    return {
        "leaves": [serialize_leave(leave, current_user) for leave in leaves],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/forward-targets")
async def get_leave_forward_targets(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can forward leave requests")
    if not current_user.company_id:
        return {"users": []}
    approvers = await User.find({
        "company_id": current_user.company_id,
        "role": {"$in": [UserRole.ADMIN.value, UserRole.SUB_ADMIN.value]},
    }).to_list()
    return {
        "users": [
            {
                "id": str(target.id),
                "email": target.email,
                "first_name": target.first_name,
                "last_name": target.last_name,
                "role": target.role.value,
            }
            for target in approvers
            if str(target.id) != str(current_user.id)
        ]
    }


@router.post("/{leave_id}/approve")
async def approve_leave_request(
    leave_id: str,
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    leave, employee = await _load_manageable_leave(leave_id, current_user)
    if leave.status not in {LeaveStatus.PENDING, LeaveStatus.FORWARDED}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending or forwarded requests can be approved")
    await ensure_no_overlap(leave.employee_id, leave.start_date, leave.end_date, exclude_id=leave.id)
    leave.status = LeaveStatus.APPROVED
    leave.reviewed_by = str(current_user.id)
    leave.reviewed_at = utc_now()
    leave.review_comment = comment
    leave.pending_with_user_ids = []
    leave.approval_history = [
        *(getattr(leave, "approval_history", []) or []),
        history_entry("approved", str(current_user.id), comment=comment),
    ]
    leave.updated_at = utc_now()
    await leave.save()

    is_wfh = leave.leave_type == LeaveType.WORK_FROM_HOME
    await create_timeline_event(
        user_id=leave.employee_id,
        company_id=leave.company_id,
        event_type=TimelineEventType.WFH_APPROVED if is_wfh else TimelineEventType.LEAVE_APPROVED,
        title="WFH Approved" if is_wfh else "Leave Approved",
        description=leave.leave_type.value.replace("_", " ").title(),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(leave.id),
        actor_id=str(current_user.id),
        metadata={"leave_type": leave.leave_type.value, "status": leave.status.value},
        idempotency_key=f"leave:{leave.id}:approved",
    )
    await notify_user(leave.employee_id, leave.company_id, NotificationType.LEAVE_APPROVED, "Leave approved", "Your leave request was approved.", str(leave.id))
    await sync_leave_lifecycle(leave.company_id)
    return {"message": "Leave approved", "leave": serialize_leave(leave, employee)}


@router.post("/{leave_id}/reject")
async def reject_leave_request(
    leave_id: str,
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    leave, employee = await _load_manageable_leave(leave_id, current_user)
    if leave.status not in {LeaveStatus.PENDING, LeaveStatus.FORWARDED}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending or forwarded requests can be rejected")
    comment = require_action_comment(comment, "Rejection reason")
    leave.status = LeaveStatus.REJECTED
    leave.reviewed_by = str(current_user.id)
    leave.reviewed_at = utc_now()
    leave.review_comment = comment
    leave.pending_with_user_ids = []
    leave.approval_history = [
        *(getattr(leave, "approval_history", []) or []),
        history_entry("rejected", str(current_user.id), comment=comment),
    ]
    leave.updated_at = utc_now()
    await leave.save()
    await create_timeline_event(
        user_id=leave.employee_id,
        company_id=leave.company_id,
        event_type=TimelineEventType.LEAVE_REJECTED,
        title="Leave Rejected",
        description=leave.leave_type.value.replace("_", " ").title(),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(leave.id),
        actor_id=str(current_user.id),
        metadata={"leave_type": leave.leave_type.value, "status": leave.status.value, "comment": comment},
        idempotency_key=f"leave:{leave.id}:rejected",
    )
    await notify_user(leave.employee_id, leave.company_id, NotificationType.LEAVE_REJECTED, "Leave rejected", "Your leave request was rejected.", str(leave.id))
    return {"message": "Leave rejected", "leave": serialize_leave(leave, employee)}


@router.post("/{leave_id}/forward")
async def forward_leave_request(
    leave_id: str,
    target_user_id: str = Form(...),
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    leave, employee = await _load_manageable_leave(leave_id, current_user)
    assert_leave_mutable(leave)
    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be forwarded")
    comment = require_action_comment(comment, "Forwarding reason")
    target_user = await User.get(target_user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Forward target not found")
    await assert_forward_target(current_user, leave, employee, target_user)
    leave.pending_with_user_ids = [str(target_user.id)]
    leave.forwarded_to_user_id = str(target_user.id)
    leave.forwarded_by = str(current_user.id)
    leave.forwarded_at = utc_now()
    leave.forwarded_to_admin = True
    leave.forward_comment = comment
    leave.approval_history = [
        *(getattr(leave, "approval_history", []) or []),
        history_entry("forwarded", str(current_user.id), comment=comment, target_user_id=str(target_user.id)),
    ]
    leave.updated_at = utc_now()
    await leave.save()
    await create_timeline_event(
        user_id=leave.employee_id,
        company_id=leave.company_id,
        event_type=TimelineEventType.LEAVE_REQUESTED,
        title="Leave Forwarded",
        description=leave.leave_type.value.replace("_", " ").title(),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(leave.id),
        actor_id=str(current_user.id),
        metadata={"leave_type": leave.leave_type.value, "status": leave.status.value, "forwarded_to": str(target_user.id), "comment": comment},
        idempotency_key=f"leave:{leave.id}:forwarded:{len(leave.approval_history)}",
    )
    await notify_user(str(target_user.id), leave.company_id, NotificationType.LEAVE_REQUESTED, "Leave request forwarded", f"{employee.full_name()} leave request was forwarded to you.", str(leave.id))
    return {"message": "Leave forwarded", "leave": serialize_leave(leave, employee)}


@router.post("/{leave_id}/cancel")
async def cancel_leave_request(
    leave_id: str,
    current_user: User = Depends(get_current_user),
):
    leave = await LeaveRequest.get(leave_id)
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
    if leave.employee_id != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only requester can cancel leave")
    if leave.status not in {LeaveStatus.PENDING, LeaveStatus.FORWARDED}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending or forwarded requests can be cancelled")
    leave.status = LeaveStatus.CANCELLED
    leave.cancelled_at = utc_now()
    leave.pending_with_user_ids = []
    leave.approval_history = [
        *(getattr(leave, "approval_history", []) or []),
        history_entry("cancelled", str(current_user.id)),
    ]
    leave.updated_at = utc_now()
    await leave.save()
    await create_timeline_event(
        user_id=leave.employee_id,
        company_id=leave.company_id,
        event_type=TimelineEventType.LEAVE_CANCELLED,
        title="Leave Cancelled",
        description=leave.leave_type.value.replace("_", " ").title(),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(leave.id),
        actor_id=str(current_user.id),
        metadata={"leave_type": leave.leave_type.value, "status": leave.status.value},
        idempotency_key=f"leave:{leave.id}:cancelled",
    )
    return {"message": "Leave cancelled", "leave": serialize_leave(leave, current_user)}


async def _base_query(current_user: User, employee_id: Optional[str]) -> dict:
    if employee_id:
        employee = await User.get(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
        await assert_leave_view_access(current_user, employee)
        return {"employee_id": str(employee.id), "company_id": employee.company_id}
    # Admins, sub-admins and super-admins see all company leaves except their own (managed via admin view)
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        query = leave_visibility_query(current_user, employee_id)
        return query
    # Managers see all company leaves (except their own, shown under "My Requests" tab)
    if current_user.role == UserRole.MANAGER:
        return {"company_id": current_user.company_id, "employee_id": {"$ne": str(current_user.id)}}
    # Employees see only their own submitted leaves
    if current_user.role == UserRole.EMPLOYEE:
        if not current_user.company_id:
            return {"employee_id": "__none__"}
        return {"employee_id": str(current_user.id), "company_id": current_user.company_id}
    # Leads see all company leaves (except their own, shown via /my endpoint)
    if current_user.role == UserRole.LEAD:
        return {"company_id": current_user.company_id, "employee_id": {"$ne": str(current_user.id)}}
    return {"employee_id": "__none__"}


async def _load_manageable_leave(leave_id: str, current_user: User) -> tuple[LeaveRequest, User]:
    leave = await LeaveRequest.get(leave_id)
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
    employee = await User.get(leave.employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    await assert_leave_manage_access(current_user, employee, leave)
    return leave, employee


async def _employee_map(leaves: list[LeaveRequest]) -> dict[str, User]:
    ids = list({leave.employee_id for leave in leaves})
    if not ids:
        return {}
    users = []
    for user_id in ids:
        user = await User.get(user_id)
        if user:
            users.append(user)
    return {str(user.id): user for user in users}


async def _notify_reviewers(leave: LeaveRequest, employee: User, reviewer_ids: list[str], title: str) -> None:
    for reviewer_id in set(reviewer_ids):
        await notify_user(
            reviewer_id,
            leave.company_id,
            NotificationType.LEAVE_REQUESTED,
            title,
            f"{employee.full_name()} submitted a leave request.",
            str(leave.id),
        )


async def _save_attachment(file: UploadFile) -> dict:
    return await FileService.store_uploaded_file(
        file,
        upload_dir=UPLOAD_DIR,
        url_prefix="/api/v1/files/leaves",
        scope="leaves",
        sensitive=True,
    )
