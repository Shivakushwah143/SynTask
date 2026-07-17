"""
Leave management endpoints.
"""
from datetime import datetime
from pathlib import Path
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.api.dependencies import get_current_user
from app.core.config import settings
from app.models.leave import LeaveRequest, LeaveStatus, LeaveType
from app.models.notification import NotificationType
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole
from app.services.leave_service import (
    assert_leave_manage_access,
    assert_leave_view_access,
    ensure_no_overlap,
    get_current_availability,
    notify_admins,
    notify_user,
    parse_leave_date,
    serialize_leave,
    sync_leave_lifecycle,
)
from app.services.timeline_service import create_timeline_event

router = APIRouter()
UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / settings.UPLOAD_DIR / "leaves"
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
    await ensure_no_overlap(str(current_user.id), start, end)

    attachment_url = await _save_attachment(attachment) if attachment else None
    leave = LeaveRequest(
        employee_id=str(current_user.id),
        company_id=current_user.company_id,
        leave_type=leave_type,
        start_date=start,
        end_date=end,
        reason=reason.strip(),
        attachment_url=attachment_url,
        requested_by=str(current_user.id),
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
    await _notify_managers(leave, current_user)

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
    today = datetime.now()
    today_items = [leave for leave in leaves if leave.start_date <= today <= leave.end_date]
    return {
        "today": [serialize_leave(leave, employees.get(leave.employee_id)) for leave in today_items],
        "upcoming": [serialize_leave(leave, employees.get(leave.employee_id)) for leave in leaves if leave.start_date > today],
        "items": [serialize_leave(leave, employees.get(leave.employee_id)) for leave in leaves],
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
    await ensure_no_overlap(leave.employee_id, leave.start_date, leave.end_date, exclude_id=str(leave.id))
    leave.status = LeaveStatus.APPROVED
    leave.reviewed_by = str(current_user.id)
    leave.reviewed_at = datetime.now()
    leave.review_comment = comment
    leave.updated_at = datetime.now()
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


@router.post("/{leave_id}/forward")
async def forward_leave_request(
    leave_id: str,
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    leave, employee = await _load_manageable_leave(leave_id, current_user)
    if leave.status not in {LeaveStatus.PENDING, LeaveStatus.FORWARDED}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be forwarded")
    if current_user.role not in {UserRole.MANAGER, UserRole.LEAD} and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only managers can forward leave requests")

    leave.status = LeaveStatus.FORWARDED
    leave.forwarded_by = str(current_user.id)
    leave.forwarded_at = datetime.now()
    leave.forwarded_to_admin = True
    leave.review_comment = comment
    leave.updated_at = datetime.now()
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
        metadata={"leave_type": leave.leave_type.value, "status": leave.status.value, "forwarded_to_admin": True, "comment": comment},
        idempotency_key=f"leave:{leave.id}:forwarded",
    )
    await notify_admins(
        leave.company_id,
        NotificationType.LEAVE_FORWARDED,
        "Leave forwarded to admin",
        f"{employee.full_name()} leave request was forwarded for admin review.",
        str(leave.id),
    )
    return {"message": "Leave forwarded to admin", "leave": serialize_leave(leave, employee)}


@router.post("/{leave_id}/reject")
async def reject_leave_request(
    leave_id: str,
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    leave, employee = await _load_manageable_leave(leave_id, current_user)
    if leave.status not in {LeaveStatus.PENDING, LeaveStatus.FORWARDED}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending or forwarded requests can be rejected")
    leave.status = LeaveStatus.REJECTED
    leave.reviewed_by = str(current_user.id)
    leave.reviewed_at = datetime.now()
    leave.review_comment = comment
    leave.updated_at = datetime.now()
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
    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be cancelled")
    leave.status = LeaveStatus.CANCELLED
    leave.cancelled_at = datetime.now()
    leave.updated_at = datetime.now()
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
        return {"employee_id": str(employee.id)}
    if current_user.role == UserRole.EMPLOYEE:
        return {"employee_id": str(current_user.id)}
    if current_user.role == UserRole.SUPER_ADMIN:
        return {}
    query = {"company_id": current_user.company_id}
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        subordinates = await current_user.get_all_subordinates()
        ids = [str(user.id) for user in subordinates] + [str(current_user.id)]
        query["employee_id"] = {"$in": ids}
    return query


async def _load_manageable_leave(leave_id: str, current_user: User) -> tuple[LeaveRequest, User]:
    leave = await LeaveRequest.get(leave_id)
    if not leave:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found")
    employee = await User.get(leave.employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    await assert_leave_manage_access(current_user, employee)
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


async def _notify_managers(leave: LeaveRequest, employee: User) -> None:
    managers = []
    if employee.reports_to:
        manager = await User.get(employee.reports_to)
        if manager:
            managers.append(manager)
    admins = await User.find({"company_id": employee.company_id, "role": UserRole.ADMIN.value}).to_list()
    for manager in {str(user.id): user for user in managers + admins}.values():
        await notify_user(
            str(manager.id),
            leave.company_id,
            NotificationType.LEAVE_REQUESTED,
            "Leave request submitted",
            f"{employee.full_name()} submitted a leave request.",
            str(leave.id),
        )


async def _save_attachment(file: UploadFile) -> str:
    file_ext = Path(file.filename or "").suffix.lower()
    if file_ext and file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File type not allowed")
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large")
    filename = f"{uuid.uuid4()}{file_ext}"
    path = UPLOAD_DIR / filename
    with open(path, "wb") as handle:
        handle.write(content)
    return f"/api/v1/files/leaves/{filename}"

