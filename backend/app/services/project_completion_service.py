from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskStatus
from app.models.time_tracking import ActiveTimeSession
from app.models.user import User, UserRole
from app.models.work_request import WorkRequest, WorkRequestStatus, WorkRequestType
from app.services.project_permissions import ProjectPermission, has_project_permission
from app.services.task_workflow import blocking_dependencies, normalize_status


def project_status_value(project: Project) -> str:
    return getattr(project.status, "value", project.status)


def can_control_project(project: Project, actor: User) -> bool:
    if actor.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER}:
        return actor.role == UserRole.SUPER_ADMIN or str(actor.company_id) == str(project.company_id)
    if str(actor.id) == str(project.lead_id or ""):
        return True
    return has_project_permission(actor, project, ProjectPermission.MANAGE_PROJECT)


def project_task_query(project: Project) -> dict[str, Any]:
    keys = [str(project.id)]
    if project.project_id:
        keys.append(str(project.project_id))
    return {
        "company_id": project.company_id,
        "$or": [
            {"project_object_id": str(project.id)},
            {"project_id": {"$in": keys}},
        ],
    }


async def completion_readiness(project: Project, actor: User) -> dict[str, Any]:
    if str(project.company_id) != str(actor.company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    tasks = await Task.find(project_task_query(project)).to_list()
    required_tasks = [task for task in tasks if getattr(task, "required_for_project_completion", True)]
    incomplete = []
    pending_review = []
    blockers = []
    for task in required_tasks:
        task_status = normalize_status(task.status)
        if task_status in {TaskStatus.IN_REVIEW, TaskStatus.REVISION_REQUIRED, TaskStatus.APPROVED}:
            pending_review.append(task)
        if task_status not in {TaskStatus.COMPLETED, TaskStatus.CANCELLED}:
            incomplete.append(task)
        deps = await blocking_dependencies(task)
        if deps:
            blockers.append({"task_id": str(task.id), "title": task.title, "dependencies": deps})

    active_timers = await ActiveTimeSession.find({
        "company_id": project.company_id,
        "project_id": str(project.id),
    }).to_list()

    request_blockers = await WorkRequest.find({
        "company_id": project.company_id,
        "project_id": {"$in": [str(project.id), str(project.project_id or "")]},
        "type": WorkRequestType.BLOCKER.value,
        "status": {"$in": [WorkRequestStatus.SUBMITTED.value, WorkRequestStatus.UNDER_REVIEW.value, WorkRequestStatus.APPROVED.value]},
    }).to_list()

    reasons = []
    if incomplete:
        reasons.append({"type": "incomplete_task", "count": len(incomplete)})
    if pending_review:
        reasons.append({"type": "pending_review", "count": len(pending_review)})
    if blockers:
        reasons.append({"type": "unresolved_blocker", "count": len(blockers)})
    if active_timers:
        reasons.append({"type": "active_timer", "count": len(active_timers)})
    if request_blockers:
        reasons.append({"type": "open_work_request_blocker", "count": len(request_blockers)})
    if project_status_value(project) not in {ProjectStatus.REVIEW.value, ProjectStatus.EXECUTION.value}:
        reasons.append({"type": "invalid_project_status", "status": project_status_value(project), "count": 1})

    return {
        "ready": not reasons,
        "blocking_reasons": reasons,
        "required_tasks": len(required_tasks),
        "completed_required_tasks": len([task for task in required_tasks if normalize_status(task.status) == TaskStatus.COMPLETED]),
        "entities": {
            "incomplete_tasks": [{"id": str(task.id), "title": task.title, "status": getattr(task.status, "value", task.status)} for task in incomplete[:10]],
            "pending_review_tasks": [{"id": str(task.id), "title": task.title, "status": getattr(task.status, "value", task.status)} for task in pending_review[:10]],
            "blocked_tasks": blockers[:10],
            "active_timers": [{"id": str(item.id), "user_id": item.user_id, "task_id": item.task_id} for item in active_timers[:10]],
            "request_blockers": [{"id": str(item.id), "title": item.title, "status": getattr(item.status, "value", item.status)} for item in request_blockers[:10]],
        },
    }


async def assert_ready_for_completion(project: Project, actor: User) -> dict[str, Any]:
    if not can_control_project(project, actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the project owner or authorized manager can complete this project.")
    if project_status_value(project) == ProjectStatus.COMPLETED.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project is already completed.")
    readiness = await completion_readiness(project, actor)
    if not readiness["ready"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project is not ready for completion.")
    return readiness


async def mark_project_completed(project: Project, actor: User) -> Project:
    await assert_ready_for_completion(project, actor)
    project.status = ProjectStatus.COMPLETED
    project.completed_at = utc_now()
    project.completed_by = str(actor.id)
    project.updated_at = utc_now()
    await project.save()
    return project


async def archive_project(project: Project, actor: User) -> Project:
    if not can_control_project(project, actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to archive this project")
    if project_status_value(project) != ProjectStatus.REPORTING.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only reporting projects can be archived")
    project.status = ProjectStatus.ARCHIVED
    project.updated_at = utc_now()
    await project.save()
    return project
