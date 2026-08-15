"""
Leave management endpoints.
"""
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.api.dependencies import get_current_user, require_capability
from app.core.config import settings
from app.models.leave import LeaveBalance, LeaveDuration, LeaveRequest, LeaveStatus, LeaveType, LeaveTypeConfig
from app.models.notification import NotificationType
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole
from app.services.leave_service import (
    active_leave_types,
    adjust_allocation,
    assert_forward_target,
    assert_leave_manage_access,
    assert_leave_view_access,
    assert_leave_mutable,
    attendance_leave_marker,
    build_leave_type_map,
    clear_leave_days_from_attendance,
    commit_balance_units,
    create_leave_type,
    deactivate_leave_type,
    ensure_default_leave_types,
    ensure_no_overlap,
    get_balance,
    get_balances,
    get_current_availability,
    get_leave_type_config,
    history_entry,
    initial_pending_reviewers,
    leave_visibility_query,
    mark_leave_days_on_attendance,
    notify_user,
    parse_leave_date,
    release_balance_units,
    require_action_comment,
    reserve_balance_units,
    serialize_leave,
    serialize_leave_type,
    sync_leave_lifecycle,
    update_leave_type,
    validate_new_leave_request,
)
from app.services.timeline_service import create_timeline_event
from app.core.clock import utc_now
from app.services.file_service import FileService
from app.models.employee_profile import EmployeeProfile

router = APIRouter()
UPLOAD_DIR = Path(__file__).resolve().parents[4] / settings.UPLOAD_DIR / "leaves"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# =============================================================================
# Request creation (Phase 3: normalized leave type + duration)
# =============================================================================


@router.post("/")
async def create_leave_request(
    leave_type: Optional[LeaveType] = Form(None),
    leave_type_id: Optional[str] = Form(None),
    duration: Optional[LeaveDuration] = Form(None),
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

    # Backend-authoritative validation + unit calculation (never trust the frontend).
    type_config, units = await validate_new_leave_request(
        current_user.company_id,
        current_user,
        leave_type_id,
        duration,
        start,
        end,
        reason,
    )

    # Reserve balance for paid leave types (unpaid leave is not balance-enforced).
    if type_config and type_config.is_paid:
        bal = await get_balance(current_user.company_id, str(current_user.id), str(type_config.id))
        available = (bal or {}).get("available", 0.0)
        reserved = await reserve_balance_units(
            current_user.company_id, str(current_user.id), str(type_config.id), units
        )
        if not reserved:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"You have only {available:g} days of {type_config.name} available.",
            )

    has_attachment = bool(attachment and getattr(attachment, "filename", None) and attachment.filename.strip())
    stored_attachment = await _save_attachment(attachment) if has_attachment else None
    if type_config:
        # New normalized request: category via leave_type_id, duration separate.
        leave = LeaveRequest(
            employee_id=str(current_user.id),
            employee_role=current_user.role.value,
            company_id=current_user.company_id,
            leave_type=None,
            leave_type_id=str(type_config.id),
            duration=duration or LeaveDuration.FULL_DAY,
            requested_units=units,
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
    else:
        # Legacy path (old enum value, no configurable type / balance).
        legacy_type = leave_type or LeaveType.FULL_DAY
        if not leave_type:
            # Default the legacy value from duration so old full/half-day semantics survive.
            legacy_type = LeaveDuration.FULL_DAY if duration != LeaveDuration.HALF_DAY else LeaveDuration.HALF_DAY
        leave = LeaveRequest(
            employee_id=str(current_user.id),
            employee_role=current_user.role.value,
            company_id=current_user.company_id,
            leave_type=legacy_type,
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
        description=_leave_display(leave, type_config),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(leave.id),
        actor_id=str(current_user.id),
        timestamp=leave.created_at,
        metadata={"status": leave.status.value},
        idempotency_key=f"leave:{leave.id}:requested",
    )
    await _notify_reviewers(leave, current_user, pending_with_user_ids, "Leave request submitted")

    type_map = {str(type_config.id): type_config} if type_config else None
    return {"message": "Leave request submitted", "leave": serialize_leave(leave, current_user, type_map=type_map)}


# =============================================================================
# Leave type configuration (HR Settings → Leave Types)
# =============================================================================


@router.get("/types")
async def list_leave_types_endpoint(
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
):
    """List company leave types (idempotently seeded with defaults)."""
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    await ensure_default_leave_types(current_user.company_id, actor_id=str(current_user.id))
    items = await active_leave_types(
        current_user.company_id, include_inactive=include_inactive
    )
    return [serialize_leave_type(item) for item in items]


@router.post("/types", status_code=status.HTTP_201_CREATED)
async def create_leave_type_endpoint(
    payload: dict,
    current_user: User = Depends(require_capability("leave_management.manage")),
):
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    doc = await create_leave_type(current_user.company_id, current_user, payload)
    return serialize_leave_type(doc)


@router.patch("/types/{leave_type_id}")
async def update_leave_type_endpoint(
    leave_type_id: str,
    payload: dict,
    current_user: User = Depends(require_capability("leave_management.manage")),
):
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    doc = await update_leave_type(current_user.company_id, leave_type_id, payload)
    return serialize_leave_type(doc)


@router.delete("/types/{leave_type_id}")
async def deactivate_leave_type_endpoint(
    leave_type_id: str,
    current_user: User = Depends(require_capability("leave_management.manage")),
):
    """Soft-deactivate a leave type; historical requests keep their reference."""
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    doc = await deactivate_leave_type(current_user.company_id, leave_type_id)
    return serialize_leave_type(doc)


# =============================================================================
# Leave balances & allocations (HR)
# =============================================================================


@router.get("/balances/me")
async def get_my_leave_balances(current_user: User = Depends(get_current_user)):
    """The current user's balances across active leave types (backend-computed)."""
    if not current_user.company_id:
        return {"balances": []}
    return {"balances": await get_balances(current_user.company_id, str(current_user.id))}


@router.get("/employees/{employee_id}/balances")
async def get_employee_leave_balances(
    employee_id: str,
    current_user: User = Depends(get_current_user),
):
    """Authorized balance view for a specific employee (own + manager/HR scope)."""
    employee = await User.get(employee_id)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if str(employee.id) != str(current_user.id):
        await assert_leave_view_access(current_user, employee)
    if not employee.company_id:
        return {"employee": serialize_employee_summary(employee), "balances": []}
    return {
        "employee": serialize_employee_summary(employee),
        "balances": await get_balances(employee.company_id, str(employee.id)),
    }


@router.get("/allocations")
async def list_leave_allocations(
    employee_id: Optional[str] = Query(None),
    leave_type_id: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_capability("leave_management.view")),
):
    """HR leave allocations list with employee + leave-type summaries."""
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    query: dict = {"company_id": current_user.company_id}
    if employee_id:
        query["employee_id"] = employee_id
    if leave_type_id:
        query["leave_type_id"] = leave_type_id
    if period:
        query["period"] = period
    balances = await LeaveBalance.find(query).sort("employee_id").skip(skip).limit(limit).to_list()
    total = await LeaveBalance.find(query).count()
    items = await _serialize_allocations(current_user.company_id, balances)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.patch("/allocations/{balance_id}")
async def update_leave_allocation(
    balance_id: str,
    payload: dict,
    current_user: User = Depends(require_capability("leave_management.manage")),
):
    """Adjust an employee's allocation for a leave type (audited)."""
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    bal = await LeaveBalance.get(balance_id)
    if not bal or bal.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave allocation not found")
    new_allocated = payload.get("new_allocated")
    if new_allocated is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="new_allocated is required")
    balance = await adjust_allocation(
        current_user.company_id,
        bal.employee_id,
        bal.leave_type_id,
        new_allocated,
        actor_id=str(current_user.id),
        reason=payload.get("reason"),
    )
    return balance


# =============================================================================
# Leave requests (existing surface, preserved + extended)
# =============================================================================


@router.get("/")
async def list_leave_requests(
    status_filter: Optional[LeaveStatus] = Query(None, alias="status"),
    leave_type: Optional[LeaveType] = Query(None),
    leave_type_id: Optional[str] = Query(None),
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
    if leave_type_id:
        query["leave_type_id"] = leave_type_id
    if start_date or end_date:
        if start_date:
            query["end_date"] = {"$gte": start_date}
        if end_date:
            query["start_date"] = {"$lte": end_date}

    leaves = await LeaveRequest.find(query).sort("-created_at").skip(skip).limit(limit).to_list()
    total = await LeaveRequest.find(query).count()
    employees = await _employee_map(leaves)
    type_map = await build_leave_type_map(current_user.company_id, [l.leave_type_id for l in leaves])
    return {
        "leaves": [serialize_leave(leave, employees.get(leave.employee_id), type_map=type_map) for leave in leaves],
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
    type_map = await build_leave_type_map(current_user.company_id, [l.leave_type_id for l in leaves])
    today = utc_now()
    today_items = [leave for leave in leaves if leave.start_date <= today <= leave.end_date]
    return {
        "today": [serialize_leave(leave, employees.get(leave.employee_id), type_map=type_map) for leave in today_items],
        "upcoming": [serialize_leave(leave, employees.get(leave.employee_id), type_map=type_map) for leave in leaves if leave.start_date > today],
        "items": [serialize_leave(leave, employees.get(leave.employee_id), type_map=type_map) for leave in leaves],
    }


@router.get("/my")
async def get_my_leave_requests(
    status_filter: Optional[LeaveStatus] = Query(None, alias="status"),
    leave_type: Optional[LeaveType] = Query(None),
    leave_type_id: Optional[str] = Query(None),
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
    if leave_type_id:
        query["leave_type_id"] = leave_type_id
    leaves = await LeaveRequest.find(query).sort("-created_at").skip(skip).limit(limit).to_list()
    total = await LeaveRequest.find(query).count()
    type_map = await build_leave_type_map(current_user.company_id, [l.leave_type_id for l in leaves])
    return {
        "leaves": [serialize_leave(leave, current_user, type_map=type_map) for leave in leaves],
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


# =============================================================================
# Approval workflow — atomic status transitions + balance/attendance sync
# =============================================================================


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

    leave_type_id = getattr(leave, "leave_type_id", None)
    type_config = await get_leave_type_config(leave.company_id, leave_type_id) if leave_type_id else None
    needs_commit = bool(type_config and type_config.is_paid)
    original_pending_with = leave.pending_with_user_ids

    # Atomic claim: only one concurrent reviewer can transition the request.
    claimed = await _claim_leave(
        leave_id,
        from_statuses={LeaveStatus.PENDING, LeaveStatus.FORWARDED},
        updates={
            "status": LeaveStatus.APPROVED,
            "reviewed_by": str(current_user.id),
            "reviewed_at": utc_now(),
            "review_comment": comment,
            "pending_with_user_ids": [],
            "updated_at": utc_now(),
        },
        history_action="approved",
        actor_id=str(current_user.id),
        comment=comment,
    )
    if not claimed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This leave request was already processed")

    if needs_commit:
        committed = await commit_balance_units(
            leave.company_id, leave.employee_id, leave_type_id, claimed.requested_units
        )
        if not committed:
            await _revert_approval(leave_id, original_pending_with)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"The employee's {type_config.name} allocation was reduced below the requested amount. "
                    "Approval could not be completed — please review the balance."
                ),
            )

    type_map = {str(type_config.id): type_config} if type_config else None
    # Leave → Attendance integration: approved leave days are marked so they are
    # never mistaken for unexplained absence. Legacy WFH stays an attendance/work
    # mode and produces no marker.
    marker = attendance_leave_marker(claimed, type_map)
    if marker:
        await mark_leave_days_on_attendance(
            claimed.company_id, claimed.employee_id, claimed.start_date, claimed.end_date, marker
        )

    is_wfh = claimed.leave_type == LeaveType.WORK_FROM_HOME
    await create_timeline_event(
        user_id=claimed.employee_id,
        company_id=claimed.company_id,
        event_type=TimelineEventType.WFH_APPROVED if is_wfh else TimelineEventType.LEAVE_APPROVED,
        title="WFH Approved" if is_wfh else "Leave Approved",
        description=_leave_display(claimed, type_config),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(claimed.id),
        actor_id=str(current_user.id),
        metadata={"status": claimed.status.value},
        idempotency_key=f"leave:{claimed.id}:approved",
    )
    await notify_user(claimed.employee_id, claimed.company_id, NotificationType.LEAVE_APPROVED, "Leave approved", "Your leave request was approved.", str(claimed.id))
    await sync_leave_lifecycle(claimed.company_id)
    return {"message": "Leave approved", "leave": serialize_leave(claimed, employee, type_map=type_map)}


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

    claimed = await _claim_leave(
        leave_id,
        from_statuses={LeaveStatus.PENDING, LeaveStatus.FORWARDED},
        updates={
            "status": LeaveStatus.REJECTED,
            "reviewed_by": str(current_user.id),
            "reviewed_at": utc_now(),
            "review_comment": comment,
            "pending_with_user_ids": [],
            "updated_at": utc_now(),
        },
        history_action="rejected",
        actor_id=str(current_user.id),
        comment=comment,
    )
    if not claimed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This leave request was already processed")

    leave_type_id = getattr(leave, "leave_type_id", None)
    type_config = await get_leave_type_config(leave.company_id, leave_type_id) if leave_type_id else None
    if type_config and type_config.is_paid:
        await release_balance_units(leave.company_id, leave.employee_id, leave_type_id, claimed.requested_units)

    type_map = {str(type_config.id): type_config} if type_config else None
    await create_timeline_event(
        user_id=claimed.employee_id,
        company_id=claimed.company_id,
        event_type=TimelineEventType.LEAVE_REJECTED,
        title="Leave Rejected",
        description=_leave_display(claimed, type_config),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(claimed.id),
        actor_id=str(current_user.id),
        metadata={"status": claimed.status.value, "comment": comment},
        idempotency_key=f"leave:{claimed.id}:rejected",
    )
    await notify_user(claimed.employee_id, claimed.company_id, NotificationType.LEAVE_REJECTED, "Leave rejected", "Your leave request was rejected.", str(claimed.id))
    return {"message": "Leave rejected", "leave": serialize_leave(claimed, employee, type_map=type_map)}


@router.post("/{leave_id}/forward")
async def forward_leave_request(
    leave_id: str,
    target_user_ids: List[str] = Form(...),
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    leave, employee = await _load_manageable_leave(leave_id, current_user)
    assert_leave_mutable(leave)
    if leave.status != LeaveStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be forwarded")
    comment = require_action_comment(comment, "Forwarding reason")
    # Deduplicate and validate every selected reviewer.
    unique_ids: list[str] = []
    seen: set[str] = set()
    for target_user_id in target_user_ids:
        target_id = str(target_user_id).strip()
        if not target_id or target_id in seen:
            continue
        seen.add(target_id)
        unique_ids.append(target_id)
    if not unique_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one reviewer")
    target_users: list[User] = []
    for target_id in unique_ids:
        target_user = await User.get(target_id)
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Forward target not found")
        await assert_forward_target(current_user, leave, employee, target_user)
        target_users.append(target_user)
    target_user_ids_clean = [str(target_user.id) for target_user in target_users]
    joined_target_ids = ",".join(target_user_ids_clean)
    leave.pending_with_user_ids = target_user_ids_clean
    leave.forwarded_to_user_id = target_user_ids_clean[0]
    leave.forwarded_to_user_ids = target_user_ids_clean
    leave.forwarded_by = str(current_user.id)
    leave.forwarded_at = utc_now()
    leave.forwarded_to_admin = True
    leave.forward_comment = comment
    leave.approval_history = [
        *(getattr(leave, "approval_history", []) or []),
        history_entry("forwarded", str(current_user.id), comment=comment, target_user_id=joined_target_ids),
    ]
    leave.updated_at = utc_now()
    await leave.save()
    leave_type_id = getattr(leave, "leave_type_id", None)
    type_config = await get_leave_type_config(leave.company_id, leave_type_id) if leave_type_id else None
    type_map = {str(type_config.id): type_config} if type_config else None
    await create_timeline_event(
        user_id=leave.employee_id,
        company_id=leave.company_id,
        event_type=TimelineEventType.LEAVE_REQUESTED,
        title="Leave Forwarded",
        description=_leave_display(leave, type_config),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(leave.id),
        actor_id=str(current_user.id),
        metadata={"status": leave.status.value, "forwarded_to": joined_target_ids, "comment": comment},
        idempotency_key=f"leave:{leave.id}:forwarded:{len(leave.approval_history)}",
    )
    for target_user in target_users:
        await notify_user(str(target_user.id), leave.company_id, NotificationType.LEAVE_REQUESTED, "Leave request forwarded", f"{employee.full_name()} leave request was forwarded to you.", str(leave.id))
    return {"message": "Leave forwarded", "leave": serialize_leave(leave, employee, type_map=type_map)}


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

    claimed = await _claim_leave(
        leave_id,
        from_statuses={LeaveStatus.PENDING, LeaveStatus.FORWARDED},
        updates={
            "status": LeaveStatus.CANCELLED,
            "cancelled_at": utc_now(),
            "pending_with_user_ids": [],
            "updated_at": utc_now(),
        },
        history_action="cancelled",
        actor_id=str(current_user.id),
    )
    if not claimed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This leave request was already processed")

    # Release reserved pending units (paid types). Pending leaves never created
    # attendance markers, so no attendance cleanup is required.
    leave_type_id = getattr(leave, "leave_type_id", None)
    type_config = await get_leave_type_config(leave.company_id, leave_type_id) if leave_type_id else None
    if type_config and type_config.is_paid:
        await release_balance_units(leave.company_id, leave.employee_id, leave_type_id, claimed.requested_units)

    type_map = {str(type_config.id): type_config} if type_config else None
    await create_timeline_event(
        user_id=claimed.employee_id,
        company_id=claimed.company_id,
        event_type=TimelineEventType.LEAVE_CANCELLED,
        title="Leave Cancelled",
        description=_leave_display(claimed, type_config),
        related_module=TimelineModule.LEAVE,
        related_record_id=str(claimed.id),
        actor_id=str(current_user.id),
        metadata={"status": claimed.status.value},
        idempotency_key=f"leave:{claimed.id}:cancelled",
    )
    return {"message": "Leave cancelled", "leave": serialize_leave(claimed, current_user, type_map=type_map)}


# =============================================================================
# Helpers
# =============================================================================


def _leave_display(leave: LeaveRequest, type_config: Optional[LeaveTypeConfig]) -> str:
    if type_config:
        return type_config.name
    if leave.leave_type:
        return leave.leave_type.value.replace("_", " ").title()
    return "Leave"


async def _claim_leave(
    leave_id: str,
    from_statuses: set[LeaveStatus],
    updates: dict,
    *,
    history_action: Optional[str] = None,
    actor_id: Optional[str] = None,
    comment: Optional[str] = None,
) -> Optional[LeaveRequest]:
    """Atomically transition a request if its status is still in ``from_statuses``.

    Returns the refreshed request, or None when another reviewer already acted
    (concurrent approve/reject is safe).
    """
    from_status_values = [s.value for s in from_statuses]
    set_values = {key: (value.value if isinstance(value, LeaveStatus) else value) for key, value in updates.items()}
    update: dict = {"$set": set_values}
    if history_action:
        update["$push"] = {
            "approval_history": history_entry(history_action, actor_id or "", comment=comment)
        }
    result = await LeaveRequest.get_pymongo_collection().update_one(
        {"_id": ObjectId(leave_id), "status": {"$in": from_status_values}},
        update,
    )
    if result.modified_count == 0:
        return None
    return await LeaveRequest.get(leave_id)


async def _revert_approval(leave_id: str, pending_with: list[str]) -> None:
    """Revert an approval claim (balance commit failed) so the request stays actionable."""
    await LeaveRequest.get_pymongo_collection().update_one(
        {"_id": ObjectId(leave_id), "status": LeaveStatus.APPROVED.value},
        {
            "$set": {
                "status": LeaveStatus.PENDING.value,
                "pending_with_user_ids": list(pending_with or []),
                "reviewed_by": None,
                "reviewed_at": None,
                "review_comment": None,
                "updated_at": utc_now(),
            },
            "$pop": {"approval_history": 1},
        },
    )


async def _base_query(current_user: User, employee_id: Optional[str]) -> dict:
    if employee_id:
        employee = await User.get(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
        await assert_leave_view_access(current_user, employee)
        # Admins, sub-admins and managers can view every leave of the selected
        # employee. Approve/reject is gated separately by pending_with_user_ids.
        return {"employee_id": str(employee.id), "company_id": employee.company_id}
    # Admins, sub-admins and super-admins see all company leaves except their own (managed via admin view)
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        return leave_visibility_query(current_user, employee_id)
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


def serialize_employee_summary(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.full_name(),
        "email": user.email,
        "role": user.role.value if isinstance(user.role, UserRole) else str(user.role),
    }


async def _serialize_allocations(company_id: str, balances: list[LeaveBalance]) -> list[dict]:
    employee_ids = list({b.employee_id for b in balances})
    type_ids = list({b.leave_type_id for b in balances})
    users: dict[str, User] = {}
    for user_id in employee_ids:
        user = await User.get(user_id)
        if user:
            users[user_id] = user
    profiles: dict[str, EmployeeProfile] = {}
    if employee_ids:
        found = await EmployeeProfile.find(
            {"company_id": company_id, "user_id": {"$in": employee_ids}}
        ).to_list()
        profiles = {p.user_id: p for p in found}
    types: dict[str, LeaveTypeConfig] = {}
    if type_ids:
        found = await LeaveTypeConfig.find(
            {"company_id": company_id, "_id": {"$in": type_ids}}
        ).to_list()
        types = {str(t.id): t for t in found}
    items = []
    for bal in balances:
        user = users.get(bal.employee_id)
        profile = profiles.get(bal.employee_id)
        type_config = types.get(bal.leave_type_id)
        items.append(
            {
                "id": str(bal.id),
                "employee_id": bal.employee_id,
                "employee_name": user.full_name() if user else None,
                "employee_number": profile.employee_number if profile else None,
                "leave_type_id": bal.leave_type_id,
                "leave_type_name": type_config.name if type_config else None,
                "leave_type_code": type_config.code if type_config else None,
                "is_paid": type_config.is_paid if type_config else None,
                "period": bal.period,
                "allocated": round(bal.allocated, 4),
                "used": round(bal.used, 4),
                "pending": round(bal.pending, 4),
                "available": round(bal.allocated - bal.used - bal.pending, 4),
                "adjustments": bal.adjustments or [],
            }
        )
    return items


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
