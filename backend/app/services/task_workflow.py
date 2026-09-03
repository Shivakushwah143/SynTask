from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.events import publish_event
from app.events.factories import build_domain_event
from app.models.changelog import ChangeLog
from app.models.notification import Notification, NotificationType
from app.models.project import Project
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole, UserStatus
from app.services.project_permissions import ProjectPermission, has_project_permission, load_task_project
from app.services.timeline_service import create_timeline_event
from app.services.task_health_service import sync_task_health


REVIEW_BYPASS_SOURCES = {"sales_follow_up"}
TERMINAL_STATUSES = {TaskStatus.COMPLETED, TaskStatus.CANCELLED}
OPEN_STATUSES = {
    TaskStatus.TODO,
    TaskStatus.ASSIGNED,
    TaskStatus.IN_PROGRESS,
    TaskStatus.IN_REVIEW,
    TaskStatus.REVISION_REQUIRED,
    TaskStatus.APPROVED,
}


ACTION_TO_STATUS = {
    "assign": TaskStatus.ASSIGNED,
    "start_work": TaskStatus.IN_PROGRESS,
    "submit_review": TaskStatus.IN_REVIEW,
    "request_revision": TaskStatus.REVISION_REQUIRED,
    "approve": TaskStatus.APPROVED,
    "complete": TaskStatus.COMPLETED,
    "reopen": TaskStatus.ASSIGNED,
    "cancel": TaskStatus.CANCELLED,
}


STATUS_TO_ACTION = {
    TaskStatus.TODO: "assign",
    TaskStatus.ASSIGNED: "assign",
    TaskStatus.IN_PROGRESS: "start_work",
    TaskStatus.IN_REVIEW: "submit_review",
    TaskStatus.REVISION_REQUIRED: "request_revision",
    TaskStatus.APPROVED: "approve",
    TaskStatus.COMPLETED: "complete",
    TaskStatus.CANCELLED: "cancel",
}


TIMELINE_BY_ACTION = {
    "assign": (TimelineEventType.TASK_ASSIGNED, "Task Assigned"),
    "start_work": (TimelineEventType.TASK_STARTED, "Task Started"),
    "submit_review": (TimelineEventType.TASK_SUBMITTED_FOR_REVIEW, "Submitted for Review"),
    "request_revision": (TimelineEventType.TASK_REVISION_REQUESTED, "Revision Requested"),
    "approve": (TimelineEventType.TASK_APPROVED, "Task Approved"),
    "complete": (TimelineEventType.TASK_COMPLETED, "Task Completed"),
    "reopen": (TimelineEventType.TASK_REOPENED, "Task Reopened"),
    "cancel": (TimelineEventType.TASK_CANCELLED, "Task Cancelled"),
}


def status_value(value: Any) -> str:
    return getattr(value, "value", value)


def normalize_status(value: Any) -> TaskStatus:
    try:
        return TaskStatus(str(status_value(value)).lower())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid task status") from exc


def action_for_status_transition(current: Any, target: Any) -> str:
    current_status = normalize_status(current)
    target_status = normalize_status(target)
    if current_status == TaskStatus.COMPLETED and target_status == TaskStatus.ASSIGNED:
        return "reopen"
    return STATUS_TO_ACTION.get(target_status, "status_update")


def effective_review_required(task: Task, project: Optional[Project] = None) -> bool:
    if getattr(task, "review_required", None) is not None:
        return bool(task.review_required)
    if getattr(task, "source_type", None) in REVIEW_BYPASS_SOURCES:
        return False
    return bool(getattr(task, "project_id", None) or getattr(task, "project_object_id", None) or project)


def creation_status(assigned_to: Optional[str]) -> TaskStatus:
    return TaskStatus.ASSIGNED if assigned_to else TaskStatus.TODO


def normalize_checklist_item(item: Any, *, default_required: bool = False) -> dict[str, Any]:
    now = utc_now()
    if isinstance(item, str):
        return {
            "id": uuid.uuid4().hex,
            "text": item,
            "completed": False,
            "required": default_required,
            "created_at": now.isoformat(),
            "completed_at": None,
            "completed_by": None,
        }
    if isinstance(item, dict):
        completed = bool(item.get("completed", False))
        return {
            "id": str(item.get("id") or uuid.uuid4().hex),
            "text": str(item.get("text") or item.get("title") or item.get("label") or ""),
            "completed": completed,
            "required": bool(item.get("required", default_required)),
            "created_at": item.get("created_at") or now.isoformat(),
            "completed_at": item.get("completed_at"),
            "completed_by": item.get("completed_by"),
        }
    return normalize_checklist_item(str(item), default_required=default_required)


def normalize_checklist(items: list[Any] | None) -> list[dict[str, Any]]:
    return [normalize_checklist_item(item) for item in (items or []) if item]


def incomplete_required_checklist(task: Task) -> list[dict[str, Any]]:
    return [item for item in normalize_checklist(getattr(task, "checklist", None)) if item.get("required") and not item.get("completed")]


async def blocking_dependencies(task: Task) -> list[dict[str, Any]]:
    blockers = []
    for dependency_id in getattr(task, "dependencies", None) or []:
        dep = await Task.get(str(dependency_id)) if str(dependency_id) else None
        if not dep or str(dep.company_id) != str(task.company_id):
            continue
        if normalize_status(dep.status) != TaskStatus.COMPLETED:
            blockers.append({"id": str(dep.id), "title": dep.title, "status": status_value(dep.status)})
    return blockers


async def assert_not_blocked(task: Task) -> None:
    blockers = await blocking_dependencies(task)
    if blockers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Task is blocked by {len(blockers)} incomplete dependencies.")


async def validate_dependency(task: Task, dependency_id: str) -> Task:
    if str(task.id) == str(dependency_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task cannot depend on itself")
    dependency = await Task.get(dependency_id)
    if not dependency or str(dependency.company_id) != str(task.company_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid dependency task")
    if task.project_id and dependency.project_id and str(task.project_id) != str(dependency.project_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependency must belong to the same project")
    await _assert_no_cycle(task, dependency)
    return dependency


async def _assert_no_cycle(task: Task, dependency: Task) -> None:
    target = str(task.id)
    seen: set[str] = set()

    async def visit(candidate: Task) -> bool:
        candidate_id = str(candidate.id)
        if candidate_id in seen:
            return False
        seen.add(candidate_id)
        for dep_id in getattr(candidate, "dependencies", None) or []:
            if str(dep_id) == target:
                return True
            next_dep = await Task.get(str(dep_id))
            if next_dep and str(next_dep.company_id) == str(task.company_id) and await visit(next_dep):
                return True
        return False

    if await visit(dependency):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Circular task dependency is not allowed")


async def reviewer_for_submission(task: Task, actor: User, project: Optional[Project]) -> str:
    if getattr(task, "reviewer_id", None):
        return str(task.reviewer_id)
    if project and getattr(project, "lead_id", None):
        reviewer_id = str(project.lead_id)
        if reviewer_id != str(task.assigned_to or ""):
            await validate_reviewer(task, reviewer_id, project)
            return reviewer_id
    if getattr(task, "created_by", None) and str(task.created_by) != str(task.assigned_to or ""):
        await validate_reviewer(task, str(task.created_by), project)
        return str(task.created_by)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assign a reviewer before submitting this task for review.")


async def validate_reviewer(task: Task, reviewer_id: Optional[str], project: Optional[Project] = None) -> Optional[User]:
    if not reviewer_id:
        return None
    reviewer = await User.get(reviewer_id)
    if not reviewer or reviewer.status != UserStatus.ACTIVE or str(reviewer.company_id) != str(task.company_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reviewer")
    if effective_review_required(task, project) and str(reviewer.id) == str(task.assigned_to or ""):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignee and reviewer must be different")
    if reviewer.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}:
        return reviewer
    if project and has_project_permission(reviewer, project, ProjectPermission.MANAGE_TASK):
        return reviewer
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reviewer must be authorized to review this task")


async def can_manage_workflow(actor: User, task: Task, project: Optional[Project]) -> bool:
    if actor.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN} and (actor.role == UserRole.SUPER_ADMIN or str(actor.company_id) == str(task.company_id)):
        return True
    if project and has_project_permission(actor, project, ProjectPermission.MANAGE_TASK):
        return True
    return str(actor.id) == str(task.created_by)


async def assert_actor_for_action(action: str, actor: User, task: Task, project: Optional[Project]) -> None:
    actor_id = str(actor.id)
    manager = await can_manage_workflow(actor, task, project)
    if action in {"start_work", "submit_review"} and (actor_id == str(task.assigned_to or "") or manager):
        return
    if action == "request_revision" and (actor_id == str(task.reviewer_id or "") or manager):
        return
    if action == "approve" and actor_id == str(task.reviewer_id or "") and actor_id != str(task.assigned_to or ""):
        return
    if action in {"complete", "cancel", "reopen", "assign"} and manager:
        return
    if action == "complete" and not effective_review_required(task, project) and actor_id == str(task.assigned_to or ""):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not allowed to perform this task action")


def allowed_transition(current: TaskStatus, target: TaskStatus, task: Task, *, review_required: bool) -> bool:
    if current == target:
        return True
    if current == TaskStatus.CANCELLED:
        return False
    if current == TaskStatus.COMPLETED:
        return target == TaskStatus.ASSIGNED
    if target == TaskStatus.CANCELLED:
        return current != TaskStatus.CANCELLED
    allowed = {
        TaskStatus.TODO: {TaskStatus.ASSIGNED, TaskStatus.CANCELLED},
        TaskStatus.ASSIGNED: {TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED},
        TaskStatus.IN_PROGRESS: {TaskStatus.IN_REVIEW if review_required else TaskStatus.COMPLETED, TaskStatus.CANCELLED},
        TaskStatus.IN_REVIEW: {TaskStatus.REVISION_REQUIRED, TaskStatus.APPROVED, TaskStatus.CANCELLED},
        TaskStatus.REVISION_REQUIRED: {TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED},
        TaskStatus.APPROVED: {TaskStatus.COMPLETED, TaskStatus.REVISION_REQUIRED, TaskStatus.CANCELLED},
    }
    if current == TaskStatus.TODO and target == TaskStatus.IN_PROGRESS and getattr(task, "assigned_to", None):
        return True
    return target in allowed.get(current, set())


async def transition_task(
    *,
    task: Task,
    actor: User,
    action: str,
    target_status: Optional[str] = None,
    reviewer_id: Optional[str] = None,
    reason: Optional[str] = None,
    comment: Optional[str] = None,
) -> Task:
    project = await load_task_project(task, actor)
    if actor.role != UserRole.SUPER_ADMIN and str(actor.company_id) != str(task.company_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    action = action.strip().lower()
    target = normalize_status(target_status) if target_status else ACTION_TO_STATUS.get(action)
    if not target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid task workflow action")
    current = normalize_status(task.status)
    review_required = effective_review_required(task, project)

    await assert_actor_for_action(action, actor, task, project)
    if target in {TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, TaskStatus.COMPLETED}:
        await assert_not_blocked(task)
    if target == TaskStatus.COMPLETED:
        from app.models.time_tracking import ActiveTimeSession

        active_session = await ActiveTimeSession.find_one({"company_id": task.company_id, "task_id": str(task.id)})
        if active_session:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Stop the active timer before completing this task.")
    if action == "submit_review":
        if incomplete_required_checklist(task):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Complete all required checklist items before submitting for review.")
        if review_required:
            task.reviewer_id = await reviewer_for_submission(task, actor, project)
    if reviewer_id is not None:
        if action != "assign":
            await validate_reviewer(task, reviewer_id or None, project)
            task.reviewer_id = reviewer_id or None
    if action == "request_revision" and not (reason or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Revision reason is required")
    if target == TaskStatus.COMPLETED and review_required and current != TaskStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task must be approved before completion.")
    if not allowed_transition(current, target, task, review_required=review_required):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid transition: {current.value} -> {target.value}.")

    now = utc_now()
    old_status = current.value
    task.status = target
    task.review_required = review_required
    task.status_changed_at = now
    if target == TaskStatus.IN_PROGRESS and not task.start_date:
        task.start_date = now
    if action == "assign" and reviewer_id:
        # reviewer_id is repurposed as the assignee for automation assignment.
        # Skip validate_reviewer for the assign action.
        task.assigned_to = reviewer_id
        task.assigned_by = str(actor.id)
    if target == TaskStatus.IN_REVIEW:
        task.review_round = int(getattr(task, "review_round", 0) or 0) + 1
        task.submitted_for_review_at = now
        task.submitted_for_review_by = str(actor.id)
    if target == TaskStatus.REVISION_REQUIRED:
        task.revision_requested_at = now
        task.revision_requested_by = str(actor.id)
        task.latest_revision_reason = (reason or "").strip()
    if target == TaskStatus.APPROVED:
        task.approved_at = now
        task.approved_by = str(actor.id)
    if target == TaskStatus.COMPLETED:
        task.completed_at = now
        task.completed_by = str(actor.id)
        task.progress_percentage = 100.0
    elif target != TaskStatus.COMPLETED:
        task.completed_at = None
    task.updated_at = now
    await task.save()
    await sync_task_health(task)
    await record_workflow_change(task, actor, action, old_status, target.value, reason=reason, comment=comment)
    await notify_workflow(task, actor, action, reason=reason)
    publish_workflow_event(task, actor, action, old_status, target.value)
    return task


async def record_workflow_change(task: Task, actor: User, action: str, old_status: str, new_status: str, **metadata) -> None:
    await ChangeLog(
        task_id=str(task.id),
        company_id=str(task.company_id),
        user_id=str(actor.id),
        user_name=actor.full_name(),
        field="status",
        field_type="workflow",
        old_value=old_status,
        new_value=new_status,
        old_string=old_status,
        new_string=new_status,
        metadata={"action": action, "review_round": getattr(task, "review_round", 0), **{k: v for k, v in metadata.items() if v}},
    ).insert()
    event_type, title = TIMELINE_BY_ACTION.get(action, (TimelineEventType.TASK_UPDATED, "Task Updated"))
    await create_timeline_event(
        user_id=task.assigned_to or task.created_by,
        company_id=task.company_id,
        event_type=event_type,
        title=title,
        description=task.title,
        related_module=TimelineModule.TASK,
        related_record_id=str(task.id),
        actor_id=str(actor.id),
        metadata={"task_title": task.title, "from_status": old_status, "to_status": new_status, "review_round": getattr(task, "review_round", 0), **metadata},
        idempotency_key=f"task:{task.id}:{action}:{new_status}:{getattr(task, 'status_changed_at', utc_now()).isoformat()}",
    )


async def notify_workflow(task: Task, actor: User, action: str, *, reason: Optional[str] = None) -> None:
    recipient = None
    title = None
    message = None
    if action == "submit_review":
        recipient, title, message = task.reviewer_id, "Task submitted for review", task.title
    elif action == "request_revision":
        recipient, title, message = task.assigned_to, "Task revision required", reason or task.title
    elif action == "approve":
        recipient, title, message = task.assigned_to, "Task approved", task.title
    elif action == "complete":
        recipient, title, message = task.assigned_to, "Task completed", task.title
    if recipient and str(recipient) != str(actor.id):
        await Notification(
            company_id=task.company_id,
            user_id=str(recipient),
            type=NotificationType.TASK_UPDATED,
            title=title,
            message=message,
            related_id=str(task.id),
            related_type="task",
            action_url=f"/tasks/{task.id}",
        ).insert()


def publish_workflow_event(task: Task, actor: User, action: str, old_status: str, new_status: str) -> None:
    async def _publish():
        await publish_event(
            build_domain_event(
                event_name={
                    "start_work": "TaskStarted",
                    "submit_review": "TaskSubmittedForReview",
                    "request_revision": "TaskRevisionRequested",
                    "approve": "TaskApproved",
                    "complete": "TaskCompleted",
                    "reopen": "TaskReopened",
                    "cancel": "TaskCancelled",
                }.get(action, "TaskUpdated"),
                aggregate_type="task",
                aggregate_id=str(task.id),
                company_id=str(task.company_id),
                actor_id=str(actor.id),
                payload={"status": new_status, "old_status": old_status, "project_id": task.project_id, "updated_at": task.updated_at.isoformat()},
                project_id=str(task.project_id) if task.project_id else None,
                metadata={"source": "task_workflow", "action": action},
            )
        )
    asyncio.create_task(_publish())


async def allowed_actions(task: Task, actor: User) -> list[str]:
    project = await load_task_project(task, actor)
    current = normalize_status(task.status)
    review_required = effective_review_required(task, project)
    actions = []
    for action, target in ACTION_TO_STATUS.items():
        try:
            await assert_actor_for_action(action, actor, task, project)
            if allowed_transition(current, target, task, review_required=review_required):
                actions.append(action)
        except HTTPException:
            continue
    if await blocking_dependencies(task):
        actions = [action for action in actions if action not in {"start_work", "submit_review", "complete"}]
    return actions
