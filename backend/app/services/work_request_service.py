from __future__ import annotations

from datetime import datetime
from uuid import uuid4
from bson import ObjectId
from pymongo import ReturnDocument
from typing import Any, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.models.changelog import ChangeLog
from app.models.notification import Notification, NotificationType
from app.models.project import Project
from app.models.task import Task
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole, UserStatus
from app.models.work_request import WorkRequest, WorkRequestStatus, WorkRequestType
from app.models.task import TaskExtensionRequest
from app.services.project_permissions import ProjectPermission, has_project_permission, load_project_for_permission
from app.services.project_service import ProjectService
from app.services.task_health_service import assert_task_view_access
from app.services.task_service import TaskService
from app.services.timeline_service import create_timeline_event


TERMINAL_REQUEST_STATUSES = {
    WorkRequestStatus.REJECTED,
    WorkRequestStatus.CONVERTED,
    WorkRequestStatus.CANCELLED,
}


def _value(value: Any) -> str:
    return getattr(value, "value", value)


def _same_company(actor: User, company_id: str) -> bool:
    return actor.role == UserRole.SUPER_ADMIN or str(actor.company_id) == str(company_id)


async def _next_request_id(company_id: str) -> str:
    return f"REQ-{utc_now().year}-{uuid4().hex[:12].upper()}"


async def _apply_deadline_extension(request: WorkRequest, reviewer: User, comment: Optional[str]) -> None:
    if request.action_result.get("task_extension_request_id"):
        return
    task = await Task.get(request.task_id)
    if not task or str(task.company_id) != str(request.company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    requested_due_date = request.requested_changes.get("requested_due_date")
    try:
        requested_due_date = datetime.fromisoformat(str(requested_due_date).replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid requested_due_date") from exc
    extension = TaskExtensionRequest(
        task_id=str(task.id),
        company_id=task.company_id,
        employee_id=str(request.requested_by),
        current_due_date=task.due_date or utc_now(),
        requested_due_date=requested_due_date,
        reason=request.reason or request.description,
    )
    await extension.insert()
    from app.services.task_health_service import review_extension_request

    await review_extension_request(extension, reviewer, True, comment)
    request.action_result = {
        **dict(request.action_result or {}),
        "task_extension_request_id": str(extension.id),
        "task_id": str(task.id),
        "requested_due_date": requested_due_date.isoformat(),
    }
    request.deadline_extension_in_progress = False


async def _claim_deadline_extension(request: WorkRequest) -> bool:
    try:
        claimed = await WorkRequest.get_pymongo_collection().find_one_and_update(
            {
                "_id": ObjectId(str(request.id)),
                "status": WorkRequestStatus.UNDER_REVIEW.value,
                "type": WorkRequestType.DEADLINE_EXTENSION.value,
                "deadline_extension_in_progress": {"$ne": True},
            },
            {"$set": {"deadline_extension_in_progress": True}},
            return_document=ReturnDocument.AFTER,
        )
    except Exception:
        # Unit/legacy objects without Mongo identifiers use the same workflow
        # path; production documents always have ObjectId-backed atomic claims.
        if not ObjectId.is_valid(str(request.id)):
            return True
        raise
    if claimed:
        return True
    latest = await WorkRequest.get(request.id)
    if latest and latest.action_result.get("task_extension_request_id"):
        request.status = latest.status
        request.action_result = latest.action_result
        return False
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Deadline extension approval is already in progress")


async def _claim_conversion(request: WorkRequest) -> None:
    request_oid = ObjectId(str(request.id))
    claimed = await WorkRequest.get_pymongo_collection().find_one_and_update(
        {
            "_id": request_oid,
            "status": WorkRequestStatus.APPROVED.value,
            "conversion_in_progress": {"$ne": True},
            "converted_task_id": None,
            "converted_project_id": None,
        },
        {"$set": {"conversion_in_progress": True, "conversion_started_at": utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not claimed:
        latest = await WorkRequest.get(request.id)
        if latest and (latest.converted_task_id or latest.converted_project_id):
            request.converted_task_id = latest.converted_task_id
            request.converted_project_id = latest.converted_project_id
            return
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request conversion is already in progress")


async def _release_conversion(request: WorkRequest) -> None:
    await WorkRequest.get_pymongo_collection().update_one(
        {"_id": ObjectId(str(request.id)), "conversion_in_progress": True},
        {"$set": {"conversion_in_progress": False}, "$unset": {"conversion_started_at": ""}},
    )


async def _admin_fallback(company_id: str) -> Optional[str]:
    user = await User.find_one({
        "company_id": company_id,
        "role": {"$in": [UserRole.ADMIN.value, UserRole.SUB_ADMIN.value, UserRole.MANAGER.value]},
        "status": UserStatus.ACTIVE.value,
    })
    return str(user.id) if user else None


async def resolve_reviewer(request: WorkRequest, explicit_reviewer_id: Optional[str], actor: User) -> Optional[str]:
    if explicit_reviewer_id:
        reviewer = await User.get(explicit_reviewer_id)
        if not reviewer or reviewer.status != UserStatus.ACTIVE or str(reviewer.company_id) != str(request.company_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request reviewer")
        if str(reviewer.id) == str(request.requested_by):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Requester cannot review their own request")
        return str(reviewer.id)

    if request.task_id:
        task = await Task.get(request.task_id)
        if task and str(task.company_id) == str(request.company_id):
            project_id = getattr(task, "project_id", None)
            if project_id:
                project = await Project.find_one({"company_id": request.company_id, "$or": [{"project_id": project_id}, {"_id": project_id}]})
                if project and getattr(project, "lead_id", None) and str(project.lead_id) != str(request.requested_by):
                    return str(project.lead_id)
            if task.created_by and str(task.created_by) != str(request.requested_by):
                return str(task.created_by)

    if request.project_id:
        project = await Project.find_one({"company_id": request.company_id, "$or": [{"project_id": request.project_id}, {"_id": request.project_id}]})
        if project:
            for candidate in [getattr(project, "lead_id", None), getattr(project, "assigned_to", None), getattr(project, "created_by", None)]:
                if candidate and str(candidate) != str(request.requested_by):
                    return str(candidate)

    if getattr(actor, "reports_to", None):
        return str(actor.reports_to)
    return await _admin_fallback(request.company_id)


async def can_review_request(actor: User, request: WorkRequest) -> bool:
    if not _same_company(actor, request.company_id):
        return False
    if actor.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        return True
    if str(actor.id) == str(request.assigned_reviewer_id or ""):
        return True
    if request.project_id:
        try:
            project = await load_project_for_permission(request.project_id, actor)
            if has_project_permission(actor, project, ProjectPermission.MANAGE_TASK):
                return True
        except HTTPException:
            pass
    return actor.role in {UserRole.MANAGER, UserRole.LEAD} and str(actor.id) != str(request.requested_by)


async def assert_request_view(actor: User, request: WorkRequest) -> None:
    if not _same_company(actor, request.company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work request not found")
    if actor.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        return
    if str(actor.id) in {str(request.requested_by), str(request.assigned_reviewer_id or ""), str(request.resolver_id or "")}:
        return
    if request.task_id:
        try:
            task = await Task.get(request.task_id)
            if task:
                await assert_task_view_access(actor, task)
                return
        except HTTPException:
            pass
    if request.project_id:
        project = await load_project_for_permission(request.project_id, actor)
        if has_project_permission(actor, project, ProjectPermission.VIEW_PROJECT):
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def validate_context(request_type: WorkRequestType, payload: dict[str, Any]) -> None:
    if request_type == WorkRequestType.DEADLINE_EXTENSION:
        if not payload.get("task_id") or not payload.get("requested_changes", {}).get("requested_due_date"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deadline extension requires task and requested_due_date")
    if request_type == WorkRequestType.RESOURCE_REQUEST and not payload.get("project_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resource request requires project_id")
    if request_type == WorkRequestType.BLOCKER and not (payload.get("task_id") or payload.get("project_id")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Blocker request requires task_id or project_id")
    if request_type == WorkRequestType.CLIENT_REQUEST and not payload.get("client_id"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client request requires client_id")


async def record_request_event(request: WorkRequest, actor: User, action: str, old_status: str, new_status: str) -> None:
    await ChangeLog(
        task_id=str(request.id),
        company_id=request.company_id,
        user_id=str(actor.id),
        user_name=actor.full_name(),
        field="status",
        field_type="work_request",
        old_value=old_status,
        new_value=new_status,
        old_string=old_status,
        new_string=new_status,
        metadata={"action": action, "request_id": request.request_id, "type": _value(request.type)},
    ).insert()
    await create_timeline_event(
        user_id=request.requested_by,
        company_id=request.company_id,
        event_type=TimelineEventType.TASK_UPDATED,
        title=f"Work Request {action.replace('_', ' ').title()}",
        description=request.title,
        related_module=TimelineModule.TASK,
        related_record_id=str(request.id),
        actor_id=str(actor.id),
        metadata={"request_id": request.request_id, "status": new_status},
    )


async def notify_request_user(user_id: Optional[str], request: WorkRequest, title: str, message: str) -> None:
    if not user_id:
        return
    await Notification(
        company_id=request.company_id,
        user_id=str(user_id),
        type=NotificationType.TASK_UPDATED,
        title=title,
        message=message,
        related_id=str(request.id),
        related_type="work_request",
        action_url=f"/work-requests/{request.id}",
    ).insert()


class WorkRequestService:
    @staticmethod
    async def create_request(actor: User, **payload) -> WorkRequest:
        if not actor.company_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
        request_type = WorkRequestType(payload["type"])
        validate_context(request_type, payload)
        request = WorkRequest(
            request_id=await _next_request_id(actor.company_id),
            company_id=actor.company_id,
            type=request_type,
            title=payload["title"],
            description=payload["description"],
            priority=payload.get("priority") or "medium",
            requested_by=str(actor.id),
            project_id=payload.get("project_id"),
            task_id=payload.get("task_id"),
            client_id=payload.get("client_id"),
            related_entity_type=payload.get("related_entity_type"),
            related_entity_id=payload.get("related_entity_id"),
            reason=payload.get("reason"),
            requested_changes=payload.get("requested_changes") or {},
        )
        request.assigned_reviewer_id = await resolve_reviewer(request, payload.get("assigned_reviewer_id"), actor)
        await request.insert()
        await record_request_event(request, actor, "submitted", "", request.status.value)
        await notify_request_user(request.assigned_reviewer_id, request, "Work request submitted", request.title)
        return request

    @staticmethod
    async def transition(request: WorkRequest, actor: User, action: str, reason: Optional[str] = None) -> WorkRequest:
        await assert_request_view(actor, request)
        old_status = WorkRequestStatus(_value(request.status))
        if old_status in TERMINAL_REQUEST_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request is already terminal")
        now = utc_now()
        if action == "start_review":
            if old_status != WorkRequestStatus.SUBMITTED:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only submitted requests can start review")
            if not await can_review_request(actor, request):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to review this request")
            request.status = WorkRequestStatus.UNDER_REVIEW
            request.review_started_at = now
        elif action == "approve":
            if old_status != WorkRequestStatus.UNDER_REVIEW:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request must be under review before approval")
            if not await can_review_request(actor, request):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to approve this request")
            if request.type == WorkRequestType.DEADLINE_EXTENSION and not await _claim_deadline_extension(request):
                return request
            request.status = WorkRequestStatus.APPROVED
            request.decided_at = now
            request.decided_by = str(actor.id)
            request.decision_reason = reason
            if request.type == WorkRequestType.DEADLINE_EXTENSION:
                await _apply_deadline_extension(request, actor, reason)
        elif action == "reject":
            if old_status != WorkRequestStatus.UNDER_REVIEW:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request must be under review before rejection")
            if not (reason or "").strip():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rejection reason is required")
            if not await can_review_request(actor, request):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to reject this request")
            request.status = WorkRequestStatus.REJECTED
            request.decided_at = now
            request.decided_by = str(actor.id)
            request.decision_reason = reason
        elif action == "cancel":
            if str(actor.id) != str(request.requested_by) and not await can_review_request(actor, request):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to cancel this request")
            if old_status not in {WorkRequestStatus.SUBMITTED, WorkRequestStatus.UNDER_REVIEW}:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only undecided requests can be cancelled")
            request.status = WorkRequestStatus.CANCELLED
            request.cancelled_at = now
            request.cancelled_by = str(actor.id)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid work request action")
        request.updated_at = now
        await request.save()
        await record_request_event(request, actor, action, old_status.value, request.status.value)
        if request.status in {WorkRequestStatus.APPROVED, WorkRequestStatus.REJECTED, WorkRequestStatus.CANCELLED}:
            await notify_request_user(request.requested_by, request, f"Work request {request.status.value}", reason or request.title)
        return request

    @staticmethod
    async def convert_to_task(request: WorkRequest, actor: User, payload: dict[str, Any]) -> dict[str, Any]:
        if request.converted_task_id:
            return {"status": "already_converted", "task_id": request.converted_task_id}
        if WorkRequestStatus(_value(request.status)) != WorkRequestStatus.APPROVED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only approved requests can be converted")
        if not await can_review_request(actor, request):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to convert this request")
        await _claim_conversion(request)
        if request.converted_task_id:
            return {"status": "already_converted", "task_id": request.converted_task_id}
        try:
            result = await TaskService.create_task_core(
                title=payload.get("title") or request.title,
                description=payload.get("description") or request.description,
                assigned_to=payload.get("assigned_to"),
                priority=payload.get("priority") or request.priority,
                due_date=payload.get("due_date"),
                project_id=payload.get("project_id") or request.project_id,
                department_id=payload.get("department_id"),
                reviewer_id=payload.get("reviewer_id"),
                review_required=payload.get("review_required"),
                source_type="work_request",
                related_entity_type="work_request",
                related_entity_id=request.request_id,
                current_user=actor,
                background_tasks=None,
            )
            request.converted_task_id = str(result.get("task_id") or result.get("id"))
            request.status = WorkRequestStatus.CONVERTED
            request.action_result = {"converted_to": "task", "task_id": request.converted_task_id}
            request.conversion_in_progress = False
            request.updated_at = utc_now()
            await request.save()
        except Exception:
            await _release_conversion(request)
            raise
        await record_request_event(request, actor, "converted_to_task", WorkRequestStatus.APPROVED.value, WorkRequestStatus.CONVERTED.value)
        await notify_request_user(request.requested_by, request, "Work request converted", request.title)
        return {"status": "converted", "task": result, "task_id": request.converted_task_id}

    @staticmethod
    async def convert_to_project(request: WorkRequest, actor: User, payload: dict[str, Any]) -> dict[str, Any]:
        if request.converted_project_id:
            return {"status": "already_converted", "project_id": request.converted_project_id}
        if WorkRequestStatus(_value(request.status)) != WorkRequestStatus.APPROVED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only approved requests can be converted")
        if not await can_review_request(actor, request):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to convert this request")
        await _claim_conversion(request)
        if request.converted_project_id:
            return {"status": "already_converted", "project_id": request.converted_project_id}
        try:
            result = await ProjectService.create_project_core(current_user=actor, **payload)
            request.converted_project_id = str(result.get("project_id") or result.get("id"))
            request.status = WorkRequestStatus.CONVERTED
            request.action_result = {"converted_to": "project", "project_id": request.converted_project_id}
            request.conversion_in_progress = False
            request.updated_at = utc_now()
            await request.save()
        except Exception:
            await _release_conversion(request)
            raise
        await record_request_event(request, actor, "converted_to_project", WorkRequestStatus.APPROVED.value, WorkRequestStatus.CONVERTED.value)
        await notify_request_user(request.requested_by, request, "Work request converted", request.title)
        return {"status": "converted", "project": result, "project_id": request.converted_project_id}
