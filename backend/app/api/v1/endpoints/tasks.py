"""
Task Management Endpoints
"""
import inspect
from fastapi import APIRouter, HTTPException, status, Depends, Form, BackgroundTasks
from typing import Optional
from datetime import datetime, timedelta, timezone
from bson import ObjectId

from app.models.task import Task, TaskExtensionRequest, TaskHealthStatus, TaskStatus, TaskPriority, TaskType
from app.models.scheduled_job import ScheduledJob, ScheduledJobActionType, ScheduledJobStatus
from app.schemas.tasks import UpdateProductionProgressRequest, ProductionDashboardResponse, ProductionEmployeeMetric
from app.models.department import Department
from app.models.user import User, UserRole
from app.models.work_evidence import TaskProof, TaskProofContext
from app.events import publish_event
from app.events.factories import build_domain_event
from app.api.dependencies import (
    get_current_user,
    check_company_access,
)
from app.services.task_service import TaskService
from app.services.task_health_service import (
    assert_task_manage_access,
    assert_task_view_access,
    build_dashboard_task_health,
    build_employee_task_summary,
    build_extension_request_summary,
    build_overdue_task_summary,
    build_task_health_summary,
    build_team_completion_summary,
    create_extension_request,
    review_extension_request,
    serialize_extension_request,
    serialize_task_health,
    sync_task_health,
    sync_task_health_for_company,
)
from app.models.timeline import TimelineEventType, TimelineModule
from app.services.timeline_service import create_timeline_event
from app.core.cache import cache_delete_pattern, company_dashboard_pattern
from app.api.deps import Pagination20, PaginationParams
from app.core.clock import utc_now
from app.services.project_permissions import (
    ProjectPermission,
    has_project_permission,
    load_project_for_permission,
    load_task_project,
)
from app.services.task_workflow import (
    allowed_actions,
    blocking_dependencies,
    effective_review_required,
    normalize_checklist,
    normalize_checklist_item,
    transition_task,
    validate_dependency,
    validate_reviewer,
)

router = APIRouter()


def _serialize_task_proof(proof: TaskProof, submitter=None) -> dict:
    return {"id": str(proof.id), "name": proof.name, "value": proof.value,
            "category": getattr(proof, "category", "text"),
            "context": getattr(proof.context, "value", proof.context),
            "submitted_by": proof.submitted_by,
            "submitted_by_name": submitter.full_name() if submitter else None,
            "created_at": proof.created_at}


async def _save_optional_proof(task: Task, actor: User, name: str | None, value: str | None, context: TaskProofContext, category: str = "text"):
    if not (name and name.strip() and value and value.strip()):
        return None
    proof = TaskProof(company_id=str(task.company_id), task_id=str(task.id), submitted_by=str(actor.id),
                      name=name.strip(), value=value.strip(), category=category, context=context)
    await proof.insert()
    return proof


def enum_or_string_value(value, default=None):
    if value is None:
        return default
    return getattr(value, "value", value)


def serialize_utc_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def serialize_scheduled_task_placeholder(job: ScheduledJob) -> dict:
    payload = job.payload or {}
    return {
        "id": f"scheduled-job-{job.id}",
        "title": payload.get("title") or "Scheduled task",
        "description": payload.get("description") or "",
        "status": "scheduled",
        "payload_status": payload.get("status") or "todo",
        "priority": payload.get("priority") or "medium",
        "assigned_to": payload.get("assigned_to") or None,
        "assigned_to_name": None,
        "created_by": job.created_by,
        "project_id": payload.get("project_id") or None,
        "department_id": payload.get("department_id") or None,
        "department": None,
        "due_date": payload.get("due_date") or None,
        "start_date": None,
        "health_status": "scheduled",
        "extension_count": 0,
        "estimated_hours": payload.get("estimated_hours"),
        "task_type": payload.get("task_type") or "standard",
        "source_type": payload.get("source_type") or None,
        "measurement_type": payload.get("measurement_type"),
        "custom_measurement_label": payload.get("custom_measurement_label"),
        "target_quantity": payload.get("target_quantity"),
        "target_unit": payload.get("target_unit"),
        "tags": payload.get("tags") or [],
        "created_at": serialize_utc_datetime(job.created_at),
        "is_scheduled_placeholder": True,
        "scheduled_job_id": str(job.id),
        "scheduled_run_at": serialize_utc_datetime(job.run_at),
        "scheduled_status": enum_or_string_value(job.status),
    }


async def _get_user_scope_ids(current_user: User) -> list[str]:
    ids = {str(current_user.id)}
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        subordinates = await current_user.get_all_subordinates()
        ids.update(str(user.id) for user in subordinates)
    return list(ids)


async def _can_access_project_for_task(current_user: User, project) -> bool:
    return has_project_permission(current_user, project, ProjectPermission.VIEW_PROJECT)


async def _assert_task_view(current_user: User, task: Task) -> None:
    check_company_access(current_user, task.company_id)
    if current_user.role in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return
    current_user_id = str(current_user.id)
    if task.created_by == current_user_id or task.assigned_to == current_user_id or task.reviewer_id == current_user_id:
        return
    try:
        from app.models.watchers import Watcher
        watcher = await Watcher.find_one(
            Watcher.task_id == str(task.id),
            Watcher.user_id == current_user_id,
            Watcher.company_id == task.company_id,
        )
        if watcher:
            return
    except Exception:
        pass
    if current_user.role == UserRole.EMPLOYEE:
        if task.project_id or task.project_object_id:
            from app.api.dependencies import get_project_by_id
            project, _ = await get_project_by_id(task.project_id or task.project_object_id, current_user.company_id)
            if project and await _can_access_project_for_task(current_user, project):
                return
            # Employees involved in the project (assigned to any task in it) may
            # open its tasks, matching the project board visibility rule so the
            # board's task cards are clickable. The Tasks list page is unchanged.
            if project:
                involved = await Task.find_one({
                    "company_id": task.company_id,
                    "$or": [
                        {"project_id": getattr(project, "project_id", None) or str(project.id)},
                        {"project_id": str(project.id)},
                        {"project_object_id": str(project.id)},
                    ],
                    "assigned_to": str(current_user.id),
                })
                if involved:
                    return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        scope_ids = set(await _get_user_scope_ids(current_user))
        if task.created_by in scope_ids or (task.assigned_to and task.assigned_to in scope_ids):
            return
        if task.project_id:
            from app.api.dependencies import get_project_by_id
            project, _ = await get_project_by_id(task.project_id, current_user.company_id)
            if project and await _can_access_project_for_task(current_user, project):
                return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _assert_task_manage(current_user: User, task: Task) -> None:
    project = await load_task_project(task, current_user)
    if project and has_project_permission(current_user, project, ProjectPermission.MANAGE_TASK):
        return
    if current_user.role == UserRole.EMPLOYEE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    await _assert_task_view(current_user, task)
    if current_user.role == UserRole.MANAGER and not can_update_task_field(current_user, task, "details"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager can edit only assigned department tasks")


def build_task_list_query(
    current_user: User,
    *,
    scope_ids: Optional[list[str]] = None,
) -> dict:
    if current_user.role == UserRole.SUPER_ADMIN:
        query = {}
    else:
        if not current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must belong to a company",
            )
        query = {"company_id": current_user.company_id}

    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(current_user.id)
        query["$or"] = [
            {"assigned_to": current_user_id},
            {"created_by": current_user_id},
        ]
    elif current_user.role == UserRole.LEAD:
        ids = scope_ids or [str(current_user.id)]
        query["$or"] = [
            {"assigned_to": {"$in": ids}},
            {"created_by": str(current_user.id)},
        ]
    return query


def _merge_query_parts(parts: list[Optional[dict]]) -> dict:
    """Combine independent filter groups with implicit AND semantics.

    A single part is returned as-is; multiple parts are wrapped in ``$and``
    so lifecycle-status, attention, and advanced filters never overwrite one
    another (e.g. ``status=in_progress`` combined with an overdue condition
    that also references ``status``).
    """
    clean = [part for part in parts if part]
    if not clean:
        return {}
    if len(clean) == 1:
        return clean[0]
    return {"$and": clean}


async def _project_link_condition(project_identifier: str, current_user: User) -> dict:
    """Build the Task filter that links tasks to one Project.

    Tasks may store the logical ``project_id`` (e.g. ``PROJ-001``), the Mongo
    ``_id`` string, or the normalized ``project_object_id`` field, and project
    URLs/deep links may carry either identifier form. Resolving the Project
    first (mirroring project boards and completion readiness) and matching all
    three conventions keeps the Project Task list/counts consistent with the
    board regardless of which id the caller passed.

    Unknown or cross-company identifiers resolve to a match-nothing condition
    so no other company's rows can leak through a guessed project id.
    """
    from app.api.dependencies import get_project_by_id

    project, _ = await get_project_by_id(
        project_identifier,
        None if current_user.role == UserRole.SUPER_ADMIN else current_user.company_id,
    )
    if not project or str(project.company_id) != str(current_user.company_id):
        return {"$or": [{"project_object_id": {"$in": []}}, {"project_id": {"$in": []}}]}
    keys = {str(project.id)}
    if getattr(project, "project_id", None):
        keys.add(str(project.project_id))
    return {"$or": [{"project_object_id": str(project.id)}, {"project_id": {"$in": sorted(keys)}}]}


def _task_overdue_query_condition() -> dict:
    """Mongo condition matching the OVERDUE health semantics (UTC day).

    Mirrors ``calculate_task_health``: not completed/cancelled, no approved
    extension, and due before the current UTC day.
    """
    now = utc_now()
    today = now.date()
    start_of_today = datetime(today.year, today.month, today.day)
    return {
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "extension_count": {"$in": [None, 0]},
        "due_date": {"$lt": start_of_today},
    }


def _task_due_today_query_condition() -> dict:
    """Mongo condition matching the DUE_TODAY health semantics (UTC day)."""
    now = utc_now()
    today = now.date()
    tomorrow = today + timedelta(days=1)
    start_of_today = datetime(today.year, today.month, today.day)
    start_of_tomorrow = datetime(tomorrow.year, tomorrow.month, tomorrow.day)
    return {
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "extension_count": {"$in": [None, 0]},
        "due_date": {"$gte": start_of_today, "$lt": start_of_tomorrow},
    }


def _task_due_range_condition(due_from: Optional[str], due_to: Optional[str]) -> dict:
    """Build a ``due_date`` range condition from inclusive date inputs.

    Date-only values (``YYYY-MM-DD``) cover the whole local calendar day;
    full ISO instants are used verbatim.
    """
    condition = {}
    if due_from:
        parsed_from = _parse_task_datetime(due_from, "due_from")
        condition["$gte"] = parsed_from
    if due_to:
        parsed_to = _parse_task_datetime(due_to, "due_to")
        if len(due_to) == 10:  # YYYY-MM-DD only -> include the whole day
            parsed_to = parsed_to.replace(hour=23, minute=59, second=59, microsecond=999999)
        condition["$lte"] = parsed_to
    return {"due_date": condition}


async def _collect_blocked_task_ids(tasks: list[Task]) -> set[str]:
    """Return ids of tasks blocked by at least one incomplete dependency.

    Dependency documents are fetched in a single query and matched with the
    same company-guard semantics as ``task_workflow.blocking_dependencies``.
    """
    dependency_ids: set[str] = set()
    for task in tasks:
        for dependency_id in getattr(task, "dependencies", None) or []:
            if dependency_id:
                dependency_ids.add(str(dependency_id))
    if not dependency_ids:
        return set()
    dependency_lookup_ids = []
    for dependency_id in dependency_ids:
        if ObjectId.is_valid(dependency_id):
            dependency_lookup_ids.append(ObjectId(dependency_id))
        else:
            dependency_lookup_ids.append(dependency_id)
    dependency_tasks = await Task.find({"_id": {"$in": dependency_lookup_ids}}).to_list()
    dependency_status = {str(item.id): enum_or_string_value(item.status) for item in dependency_tasks}
    dependency_company = {str(item.id): str(item.company_id) for item in dependency_tasks}
    blocked_ids: set[str] = set()
    for task in tasks:
        for dependency_id in getattr(task, "dependencies", None) or []:
            dep_status = dependency_status.get(str(dependency_id))
            dep_company = dependency_company.get(str(dependency_id))
            if dep_status is None or dep_company != str(task.company_id):
                continue
            if dep_status != TaskStatus.COMPLETED.value:
                blocked_ids.add(str(task.id))
                break
    return blocked_ids


def build_status_summary_counts(tasks, *, blocked_task_ids=frozenset()) -> dict:
    """Compute global Task lifecycle + attention counts for a task collection.

    ``tasks`` must already be scoped by company/RBAC (callers reuse
    ``build_task_list_query``) and health-synced. ``blocked_task_ids`` is the
    precomputed set of ids blocked by incomplete dependencies.
    """
    counts = {s.value: 0 for s in TaskStatus}
    blocked = 0
    overdue = 0
    due_today = 0
    critical = 0
    for task in tasks:
        status = enum_or_string_value(task.status)
        if status in counts:
            counts[status] += 1
        if enum_or_string_value(task.priority) == TaskPriority.CRITICAL.value:
            critical += 1
        health = enum_or_string_value(getattr(task, "health_status", None))
        if health == TaskHealthStatus.OVERDUE.value:
            overdue += 1
        elif health == TaskHealthStatus.DUE_TODAY.value:
            due_today += 1
        if str(task.id) in blocked_task_ids:
            blocked += 1
    return {
        "all": len(tasks),
        **counts,
        "blocked": blocked,
        "overdue": overdue,
        "due_today": due_today,
        "critical": critical,
    }


def can_update_task_field(current_user: User, task: Task, field_name: str) -> bool:
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        return True
    if current_user.role == UserRole.EMPLOYEE:
        return field_name == "status" and task.assigned_to == str(current_user.id)
    if current_user.role == UserRole.MANAGER:
        manager_department = getattr(current_user, "department_id", None)
        task_department = getattr(task, "department_id", None)
        return bool(manager_department and task_department and str(manager_department) == str(task_department))
    if current_user.role == UserRole.LEAD:
        return True
    return False


async def serialize_task_response(
    task: Task,
    current_user: User,
    *,
    include_detail: bool = False,
    users_by_id: Optional[dict] = None,
) -> dict:
    async def resolve_user(user_id):
        if not user_id:
            return None
        if users_by_id is not None:
            return users_by_id.get(str(user_id))
        return await User.get(user_id)

    assigned_user = await resolve_user(task.assigned_to)
    reviewer = await resolve_user(getattr(task, "reviewer_id", None))
    created_by_user = await resolve_user(getattr(task, "created_by", None))
    blockers = await blocking_dependencies(task)
    payload = {
        "id": str(task.id),
        "title": task.title,
        "description": task.description if include_detail else getattr(task, "description", None),
        "status": enum_or_string_value(task.status),
        "priority": enum_or_string_value(task.priority),
        "assigned_to": task.assigned_to,
        "assigned_to_name": f"{assigned_user.first_name} {assigned_user.last_name}".strip() if assigned_user else None,
        "reviewer_id": getattr(task, "reviewer_id", None),
        "reviewer_name": f"{reviewer.first_name} {reviewer.last_name}".strip() if reviewer else None,
        "review_required": effective_review_required(task),
        "review_round": getattr(task, "review_round", 0),
        "created_by": task.created_by,
        "created_by_name": f"{created_by_user.first_name} {created_by_user.last_name}".strip() if created_by_user else None,
        "project_id": str(task.project_id) if task.project_id else None,
        "project_object_id": str(task.project_object_id) if getattr(task, "project_object_id", None) else None,
        "department_id": getattr(task, "department_id", None),
        "department": getattr(task, "department", None),
        "due_date": task.due_date,
        "start_date": task.start_date,
        "completed_at": task.completed_at,
        "health_status": getattr(task.health_status, "value", task.health_status),
        "extension_count": getattr(task, "extension_count", 0),
        "estimated_hours": getattr(task, "estimated_hours", None),
        "actual_hours": getattr(task, "actual_hours", None),
        "progress_percentage": getattr(task, "progress_percentage", 0.0),
        "task_type": getattr(task.task_type, "value", task.task_type) if hasattr(task, "task_type") else "standard",
        "measurement_type": getattr(task, "measurement_type", None),
        "custom_measurement_label": getattr(task, "custom_measurement_label", None),
        "target_quantity": getattr(task, "target_quantity", None),
        "target_unit": getattr(task, "target_unit", None),
        "completed_quantity": getattr(task, "completed_quantity", 0),
        "source_type": getattr(task, "source_type", None),
        "tags": task.tags,
        "checklist": normalize_checklist(getattr(task, "checklist", [])),
        "dependencies": getattr(task, "dependencies", []) or [],
        "is_blocked": bool(blockers),
        "blocking_dependencies": blockers,
        "allowed_actions": await allowed_actions(task, current_user),
        "submitted_for_review_at": getattr(task, "submitted_for_review_at", None),
        "submitted_for_review_by": getattr(task, "submitted_for_review_by", None),
        "revision_requested_at": getattr(task, "revision_requested_at", None),
        "revision_requested_by": getattr(task, "revision_requested_by", None),
        "latest_revision_reason": getattr(task, "latest_revision_reason", None),
        "approved_at": getattr(task, "approved_at", None),
        "approved_by": getattr(task, "approved_by", None),
        "completed_by": getattr(task, "completed_by", None),
        "status_changed_at": getattr(task, "status_changed_at", None),
        "assigned_at": getattr(task, "assigned_at", None),
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "is_scheduled_placeholder": False,
    }
    if include_detail:
        payload.update({
            "attachments": task.attachments if hasattr(task, "attachments") and task.attachments else [],
            "expected_completion_time": getattr(task, "expected_completion_time", None),
            "parent_task_id": getattr(task, "parent_task_id", None),
            "epic_id": getattr(task, "epic_id", None),
            "sprint_id": getattr(task, "sprint_id", None),
            "story_points": getattr(task, "story_points", None),
            "workflow_id": getattr(task, "workflow_id", None),
            "issue_type_id": getattr(task, "issue_type_id", None),
            "component_id": getattr(task, "component_id", None),
            "fix_version_id": getattr(task, "fix_version_id", None),
            "affects_version_ids": getattr(task, "affects_version_ids", []),
            "resolution": getattr(task, "resolution", None),
            "resolved_at": getattr(task, "resolved_at", None),
            "resolved_by": getattr(task, "resolved_by", None),
            "time_logs": getattr(task, "time_logs", []),
        })
    return payload


def build_employee_project_visibility_query(current_user: User, project_ids: list[str]) -> dict:
    clean_project_ids = []
    for project_id in project_ids:
        project_id = str(project_id)
        if project_id and project_id not in clean_project_ids:
            clean_project_ids.append(project_id)
    return {
        "$or": [
            {"lead_id": str(current_user.id)},
            {"team_member_ids": str(current_user.id)},
            {"project_id": {"$in": clean_project_ids}},
            {"_id": {"$in": clean_project_ids}},
        ]
    }


async def _assert_can_assign_task(current_user: User, assignee: Optional[User], project=None) -> None:
    if not assignee:
        return
    from app.services.authorization_service import authorize
    decision = await authorize(current_user, "tasks.assign", resource=project, target_user=assignee)
    if decision.allowed:
        return
    if decision.reason == "explicit_deny" or (decision.source == "user_override" and decision.reason == "scope_violation"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task assignment is outside the granted permission scope")
    # Legacy contextual policy remains until a user is explicitly migrated.
    if project and has_project_permission(current_user, project, ProjectPermission.ASSIGN_TASK):
        if assignee.company_id != project.company_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must be from the same company")
        if assignee.role not in {UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assignee role")
        return
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        if assignee.role not in {UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assignee role")
        return
    if current_user.role == UserRole.MANAGER:
        if assignee.role not in {UserRole.LEAD, UserRole.EMPLOYEE}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager can assign tasks only to Leads or Employees")
        return
    if current_user.role == UserRole.LEAD:
        scope_ids = set(await _get_user_scope_ids(current_user))
        if assignee.role != UserRole.EMPLOYEE or str(assignee.id) not in scope_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Lead can assign tasks only to Employees")
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign tasks")


async def _task_comment_recipient_ids(task: Task, current_user: User) -> list[str]:
    recipients = {str(task.created_by)}
    if task.assigned_to:
        recipients.add(str(task.assigned_to))

    if task.project_id:
        try:
            from app.api.dependencies import get_project_by_id
            project, _ = await get_project_by_id(task.project_id, current_user.company_id)
            if project:
                for user_id in getattr(project, "assigned_user_ids", None) or []:
                    recipients.add(str(user_id))
                for user_id in getattr(project, "team_member_ids", None) or []:
                    recipients.add(str(user_id))
                if getattr(project, "assigned_to", None):
                    recipients.add(str(project.assigned_to))
                if getattr(project, "lead_id", None):
                    recipients.add(str(project.lead_id))
                if getattr(project, "created_by", None):
                    recipients.add(str(project.created_by))
        except Exception:
            pass

    try:
        from app.models.watchers import Watcher
        watchers = await Watcher.find({
            "task_id": str(task.id),
            "company_id": task.company_id,
        }).to_list()
        recipients.update(str(watcher.user_id) for watcher in watchers)
    except Exception:
        pass

    try:
        admins = await User.find({
            "company_id": task.company_id,
            "role": {"$in": [UserRole.ADMIN.value, UserRole.SUB_ADMIN.value, UserRole.SUPER_ADMIN.value]},
        }).to_list()
        recipients.update(str(admin.id) for admin in admins)
    except Exception:
        pass

    recipients.discard(str(current_user.id))
    return [user_id for user_id in recipients if user_id]


async def _notify_task_comment(task: Task, comment, current_user: User) -> None:
    try:
        from app.models.notification import Notification, NotificationType

        actor_name = current_user.full_name() if hasattr(current_user, "full_name") else f"{current_user.first_name} {current_user.last_name}".strip()
        message_preview = (comment.content or "").strip()
        if len(message_preview) > 120:
            message_preview = f"{message_preview[:117]}..."

        notifications = []
        for user_id in await _task_comment_recipient_ids(task, current_user):
            notifications.append(
                Notification(
                    company_id=task.company_id,
                    user_id=user_id,
                    type=NotificationType.TASK_COMMENT,
                    title=f"New comment on {task.title}",
                    message=f"{actor_name}: {message_preview}" if message_preview else f"{actor_name} commented on a task.",
                    related_id=str(task.id),
                    related_type="task",
                    action_url=f"/projects/{task.project_id}/tasks/{task.id}" if task.project_id else f"/tasks/{task.id}",
                    metadata={
                        "task_id": str(task.id),
                        "comment_id": str(comment.id),
                        "event": "task_comment_added",
                    },
                )
            )

        if notifications:
            await Notification.insert_many(notifications)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Failed to create task comment notifications")


def _parse_task_datetime(value: str, field_name: str = "date") -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid {field_name} format. Use ISO format or YYYY-MM-DD",
            )


async def _resolve_department(company_id: str, department_id: Optional[str]):
    if not department_id:
        return None

    department = await Department.get(department_id)
    if (
        not department
        or department.deleted_at is not None
        or department.company_id != company_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid department",
        )
    return department


async def _send_task_side_effects(task: Task, current_user: User, assignee, project):
    """
    Runs AFTER the HTTP response has already been sent to the client
    (scheduled via BackgroundTasks). Any failure here (Redis down, email
    service down, etc.) must never block or fail the original request.
    """
    import logging
    logger = logging.getLogger(__name__)

    # --- Email notification ---
    if task.assigned_to and assignee:
        try:
            from app.worker.tasks.email_tasks import send_task_assignment_email_task
            project_name = None
            if project is not None:
                project_name = getattr(project, "name", None) or getattr(project, "project_name", None)

            send_task_assignment_email_task.apply_async(
                args=[{
                    "assignee_email": assignee.email,
                    "assignee_name": assignee.full_name(),
                    "task_title": task.title,
                    "task_description": task.description or "",
                    "task_priority": task.priority.value,
                    "task_due_date": task.due_date.isoformat() if task.due_date else None,
                    "assigned_by_name": current_user.full_name(),
                    "task_id": str(task.id),
                    "project_name": project_name,
                }],
                retry=False,   # don't retry publishing to broker if Redis is down
                expires=30,    # drop the job if it can't be picked up within 30s
            )
        except Exception as e:
            logger.error(f"Failed to queue task assignment email: {str(e)}")

    # --- In-app notification ---
    if task.assigned_to:
        try:
            from app.models.notification import Notification, NotificationType
            notification = Notification(
                company_id=current_user.company_id,
                user_id=task.assigned_to,
                type=NotificationType.TASK_ASSIGNED,
                title="New Task Assigned",
                message=f"You have been assigned a new task: {task.title}",
                priority="info",
                related_id=str(task.id),
                related_type="task",
                action_url=f"/tasks/{task.id}",
            )
            await notification.insert()
        except Exception as e:
            logger.error(f"Failed to create notification: {str(e)}")

    # --- Cache invalidation ---
    try:
        await cache_delete_pattern(company_dashboard_pattern(str(current_user.company_id)))
    except Exception as e:
        logger.error(f"Failed to invalidate cache: {str(e)}")

    # --- Domain event publish ---
    try:
        await publish_event(
            build_domain_event(
                event_name="TaskCreated",
                aggregate_type="task",
                aggregate_id=str(task.id),
                company_id=str(current_user.company_id),
                actor_id=str(current_user.id),
                payload={
                    "title": task.title,
                    "description": task.description,
                    "status": task.status.value,
                    "priority": task.priority.value,
                    "project_id": task.project_id,
                    "department_id": task.department_id,
                    "tags": task.tags,
                    "updated_at": task.updated_at.isoformat() if getattr(task, "updated_at", None) else None,
                },
                project_id=str(task.project_id) if task.project_id else None,
                metadata={"source": "task_create"},
            )
        )
    except Exception as e:
        logger.error(f"Failed to publish TaskCreated event: {str(e)}")


async def _notify_task_assignee(task: Task, current_user: User, assignee: User) -> None:
    try:
        from app.models.notification import Notification, NotificationType
        notification = Notification(
            company_id=current_user.company_id,
            user_id=str(assignee.id),
            type=NotificationType.TASK_ASSIGNED,
            title="Task Assigned",
            message=f"You have been assigned a new task: {task.title}",
            priority="info",
            related_id=str(task.id),
            related_type="task",
            action_url=f"/tasks/{task.id}",
        )
        await notification.insert()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to create task reassignment notification: {str(e)}")


@router.get("/")
async def list_tasks(
    status_filter: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
    reviewer_id: Optional[str] = None,
    created_by: Optional[str] = None,
    project_id: Optional[str] = None,
    department_id: Optional[str] = None,
    review_required: Optional[bool] = None,
    blocked: Optional[bool] = None,
    awaiting_review: Optional[bool] = None,
    overdue: Optional[bool] = None,
    due_today: Optional[bool] = None,
    critical: Optional[bool] = None,
    search: Optional[str] = None,
    due_from: Optional[str] = None,
    due_to: Optional[str] = None,
    exclude_follow_up: Optional[bool] = None,
    pagination: PaginationParams = Pagination20,
    current_user: User = Depends(get_current_user)
):
    """List tasks with filters.

    Filtering order: company/RBAC scope -> lifecycle status -> attention
    condition (blocked/overdue/due_today/critical) -> advanced filters ->
    search -> sort -> pagination. Attention conditions stay separate from
    TaskStatus: a task can be ``status=in_progress`` AND ``blocked=true`` AND
    ``health=overdue`` at the same time.
    """
    skip, limit = pagination.skip, pagination.limit
    scope_ids = await _get_user_scope_ids(current_user) if current_user.role == UserRole.LEAD else None
    query_parts: list[Optional[dict]] = [build_task_list_query(current_user, scope_ids=scope_ids)]

    if status_filter:
        query_parts.append({"status": status_filter})
    # Attention conditions are not lifecycle statuses.
    if critical:
        query_parts.append({"priority": TaskPriority.CRITICAL.value})
    if overdue:
        query_parts.append(_task_overdue_query_condition())
    if due_today:
        query_parts.append(_task_due_today_query_condition())
    if priority:
        query_parts.append({"priority": priority})
    if assigned_to and current_user.role != UserRole.EMPLOYEE:
        query_parts.append({"assigned_to": assigned_to})
    if created_by:
        query_parts.append({"created_by": created_by})
    if reviewer_id:
        query_parts.append({"reviewer_id": reviewer_id})
    if review_required is not None:
        query_parts.append({"review_required": review_required})
    if awaiting_review:
        query_parts.append({"status": TaskStatus.IN_REVIEW.value})
    if project_id:
        # Resolve to the real Project so every link convention matches (logical
        # project_id, Mongo _id, or project_object_id), consistent with how the
        # Project board and completion readiness resolve project tasks.
        if current_user.role == UserRole.EMPLOYEE:
            project = await load_project_for_permission(project_id, current_user)
            if has_project_permission(current_user, project, ProjectPermission.MANAGE_TASK):
                query_parts[0].pop("assigned_to", None)
        query_parts.append(await _project_link_condition(project_id, current_user))
    if department_id:
        query_parts.append({"department_id": department_id})
    if exclude_follow_up:
        query_parts.append({"source_type": {"$ne": "sales_follow_up"}})
    if due_from or due_to:
        query_parts.append(_task_due_range_condition(due_from, due_to))
    if search and search.strip():
        query_parts.append({"$text": {"$search": search.strip()}})

    query = _merge_query_parts(query_parts)

    if blocked is not None:
        # Dependency-blocked tasks cannot be expressed as a plain field filter;
        # resolve them against the full (unpaginated) candidate set so the
        # ``total`` and pagination stay correct for the active filters.
        # For ``blocked=True`` only tasks that declare dependencies can be
        # blocked; for ``blocked=False`` every scoped task is a candidate.
        candidate_query = query
        if blocked:
            candidate_query = {
                **query,
                "dependencies": {"$exists": True, "$ne": []},
            }
        blocked_candidates = await Task.find(candidate_query).sort("-created_at").to_list()
        for task in blocked_candidates:
            await sync_task_health(task)
        matched = [task for task in blocked_candidates if bool(await blocking_dependencies(task)) == blocked]
        total = len(matched)
        tasks = matched[skip:skip + limit]
    else:
        tasks = await Task.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
        for task in tasks:
            await sync_task_health(task)
        total = await Task.find(query).count()
    scheduled_task_placeholders = []
    if current_user.company_id and (not status_filter or status_filter == "scheduled") and not created_by:
        scheduled_query = {
            "company_id": current_user.company_id,
            "created_by": str(current_user.id),
            "action_type": ScheduledJobActionType.CREATE_TASK.value,
            "status": ScheduledJobStatus.PENDING.value,
        }
        if priority:
            scheduled_query["payload.priority"] = priority
        if assigned_to:
            scheduled_query["payload.assigned_to"] = assigned_to
        if project_id:
            scheduled_query["payload.project_id"] = project_id
        if department_id:
            scheduled_query["payload.department_id"] = department_id
        scheduled_jobs = await ScheduledJob.find(scheduled_query).sort("run_at").to_list()
        scheduled_task_placeholders = [serialize_scheduled_task_placeholder(job) for job in scheduled_jobs]
        total += len(scheduled_task_placeholders)
    # Batch-resolve all users needed by the richer task serializer instead of
    # issuing up to three User.get calls per task.
    related_user_ids = {
        str(user_id)
        for task in tasks
        for user_id in (
            getattr(task, "assigned_to", None),
            getattr(task, "reviewer_id", None),
            getattr(task, "created_by", None),
        )
        if user_id
    }
    users_by_id = {}
    if related_user_ids:
        valid_ids = [ObjectId(user_id) for user_id in related_user_ids if ObjectId.is_valid(user_id)]
        if valid_ids:
            related_users = await User.find({"_id": {"$in": valid_ids}}).to_list()
            users_by_id = {str(user.id): user for user in related_users}
    task_payloads = [
        await serialize_task_response(task, current_user, users_by_id=users_by_id)
        for task in tasks
    ]

    return {
        "tasks": scheduled_task_placeholders + task_payloads,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.post("/")
async def create_task(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    priority: str = Form("medium"),
    due_date: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    parent_task_id: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    epic_id: Optional[str] = Form(None),
    sprint_id: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    story_points: Optional[int] = Form(None),
    estimated_hours: Optional[float] = Form(None),
    task_type: str = Form("standard"),
    measurement_type: Optional[str] = Form(None),
    custom_measurement_label: Optional[str] = Form(None),
    target_quantity: Optional[int] = Form(None),
    target_unit: Optional[str] = Form(None),
    reviewer_id: Optional[str] = Form(None),
    review_required: Optional[bool] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new task.
    project_id: Frontend may send either the custom project ID (e.g. PROJ-001) or MongoDB _id.
    We resolve to the project and store the custom project_id in task.project_id so tasks are
    linked by logical ID, not by ObjectId.
    """
    # Validate quantitative task fields
    if task_type == "quantitative":
        if not measurement_type:
            raise HTTPException(status_code=400, detail="Measurement type is required for quantitative tasks")
        if not target_quantity or target_quantity < 1:
            raise HTTPException(status_code=400, detail="Target quantity must be at least 1 for quantitative tasks")

    from app.services.task_service import TaskService
    return await TaskService.create_task_core(
        title=title,
        description=description,
        assigned_to=assigned_to,
        priority=priority,
        due_date=due_date,
        tags=tags,
        parent_task_id=parent_task_id,
        project_id=project_id,
        epic_id=epic_id,
        sprint_id=sprint_id,
        department_id=department_id,
        story_points=story_points,
        estimated_hours=estimated_hours,
        task_type=task_type,
        measurement_type=measurement_type,
        custom_measurement_label=custom_measurement_label,
        target_quantity=target_quantity,
        target_unit=target_unit,
        reviewer_id=reviewer_id,
        review_required=review_required,
        current_user=current_user,
        background_tasks=background_tasks
    )


@router.post("/health/sync")
async def sync_task_health_endpoint(current_user: User = Depends(get_current_user)):
    if current_user.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or Admin access required")
    count = await sync_task_health_for_company(None if current_user.role == UserRole.SUPER_ADMIN else current_user.company_id)
    return {"message": "Task health synced", "processed": count}


@router.get("/health/me")
async def my_task_health(current_user: User = Depends(get_current_user)):
    return await build_employee_task_summary(current_user)


@router.get("/health/summary")
async def task_health_summary(current_user: User = Depends(get_current_user)):
    return await build_task_health_summary(current_user)


@router.get("/health/dashboard")
async def dashboard_task_health(current_user: User = Depends(get_current_user)):
    """Combined Task Health payload for the dashboard (one task scan).

    Returns the health summary, team-completion rows and extension-request
    counts the dashboard renders, so it can replace the three separate
    ``/health/summary`` + ``/health/team-completion`` + ``/health/extensions``
    requests that each scanned the same task dataset.
    """
    if current_user.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or Admin access required")
    return await build_dashboard_task_health(current_user)


@router.get("/health/team-completion")
async def team_completion_summary(current_user: User = Depends(get_current_user)):
    if current_user.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or Admin access required")
    return await build_team_completion_summary(current_user)


@router.get("/health/overdue")
async def overdue_task_summary(current_user: User = Depends(get_current_user)):
    return await build_overdue_task_summary(current_user)


@router.get("/health/extensions")
async def extension_request_summary(current_user: User = Depends(get_current_user)):
    return await build_extension_request_summary(current_user)


@router.get("/production/dashboard", response_model=ProductionDashboardResponse)
async def get_production_dashboard(
    current_user: User = Depends(get_current_user),
):
    """
    Aggregated production metrics for Admin and Manager roles.
    Returns per-employee quantitative task stats + team totals.
    Excludes Sub Admin.
    """
    if current_user.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins and Managers can view production dashboard"
        )

    company_id = current_user.company_id
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )

    pipeline = [
        {"$match": {
            "company_id": company_id,
            "task_type": "quantitative",
            "target_quantity": {"$ne": None, "$gt": 0},
        }},
        # Convert assigned_to (string) to ObjectId so $lookup matches users._id (ObjectId)
        {"$addFields": {
            "assigned_to_oid": {"$convert": {"input": "$assigned_to", "to": "objectId", "onError": None, "onNull": None}},
        }},
        {"$lookup": {
            "from": "users",
            "localField": "assigned_to_oid",
            "foreignField": "_id",
            "as": "assignee",
        }},
        {"$unwind": {"path": "$assignee", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "_id": 0,
            "task_id": {"$toString": "$_id"},
            "task_title": "$title",
            "employee_id": {"$ifNull": [{"$toString": "$assigned_to"}, "unassigned"]},
            "employee_name": {
                "$cond": {
                    "if": {"$and": [{"$ne": ["$assignee", None]}, {"$ne": ["$assignee.first_name", None]}]},
                    "then": {"$concat": ["$assignee.first_name", " ", "$assignee.last_name"]},
                    "else": "Unassigned",
                }
            },
            "department": "$department",
            "measurement_type": "$measurement_type",
            "measurement_label": {
                "$cond": {
                    "if": {"$and": [{"$eq": ["$measurement_type", "other"]}, {"$ne": ["$custom_measurement_label", None]}]},
                    "then": "$custom_measurement_label",
                    "else": "$measurement_type",
                }
            },
            "target_quantity": "$target_quantity",
            "target_unit": "$target_unit",
            "completed_quantity": {"$ifNull": ["$completed_quantity", 0]},
            "remaining_quantity": {"$subtract": ["$target_quantity", {"$ifNull": ["$completed_quantity", 0]}]},
            "completion_percentage": {
                "$round": [{"$multiply": [{"$divide": [{"$ifNull": ["$completed_quantity", 0]}, "$target_quantity"]}, 100]}, 1]
            },
        }},
        {"$sort": {"employee_name": 1}},
    ]

    try:
        # Use raw pymongo collection to avoid Beanie async cursor compatibility issues
        cursor = Task.get_pymongo_collection().aggregate(pipeline)
        if inspect.isawaitable(cursor):
            cursor = await cursor
        if hasattr(cursor, "to_list"):
            result = cursor.to_list(length=1000)
            if inspect.isawaitable(result):
                results = await result
            else:
                results = list(result)
        else:
            results = [item async for item in cursor]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Aggregation pipeline failed: {str(e)}")

    try:
        employees = [ProductionEmployeeMetric(**r) for r in results]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model validation failed: {str(e)}")

    team_target = sum(e.target_quantity for e in employees)
    team_completed = sum(e.completed_quantity for e in employees)
    team_remaining = team_target - team_completed
    team_pct = round((team_completed / team_target) * 100, 1) if team_target > 0 else 0.0

    return ProductionDashboardResponse(
        employees=employees,
        team_total_target=team_target,
        team_total_completed=team_completed,
        team_total_remaining=team_remaining,
        team_completion_percentage=team_pct,
    )


@router.get("/status-summary")
async def task_status_summary(
    current_user: User = Depends(get_current_user),
    project_id: Optional[str] = None,
):
    """Task lifecycle + attention counts for the Tasks workspace.

    Global scope (no ``project_id``) or Project-scoped (``project_id`` resolves
    the Project and uses the same link condition as the Task list endpoint, so
    summary counts and list totals stay logically consistent for logical ids,
    Mongo ids, and ``project_object_id`` links). Counts apply the SAME company
    isolation, RBAC, manager/team/project scope, and employee visibility as the
    Task list (``build_task_list_query``), so Company A counts never include
    Company B tasks and employees only see their accessible tasks. Follow-up
    items (sales follow-ups) are excluded to match the Tasks page view;
    Scheduled placeholders are not Task documents and are naturally absent.
    ``blocked`` counts tasks with at least one incomplete dependency and is
    independent of ``status``/``health_status``.
    """
    scope_ids = await _get_user_scope_ids(current_user) if current_user.role == UserRole.LEAD else None
    parts: list[Optional[dict]] = [
        build_task_list_query(current_user, scope_ids=scope_ids),
        {"source_type": {"$ne": "sales_follow_up"}},
    ]
    if project_id:
        parts.append(await _project_link_condition(project_id, current_user))
    query = _merge_query_parts(parts)
    tasks = await Task.find(query).to_list()
    for task in tasks:
        await sync_task_health(task)
    blocked_ids = await _collect_blocked_task_ids(tasks)
    return build_status_summary_counts(tasks, blocked_task_ids=blocked_ids)


@router.get("/{task_id}/health")
async def get_task_health(task_id: str, current_user: User = Depends(get_current_user)):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await assert_task_view_access(current_user, task)
    await sync_task_health(task)
    return {"task": serialize_task_health(task)}


@router.post("/{task_id}/extension-requests")
async def request_task_extension(
    task_id: str,
    requested_due_date: str = Form(...),
    reason: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    request = await create_extension_request(
        task,
        current_user,
        _parse_task_datetime(requested_due_date, "requested_due_date"),
        reason,
    )
    return {"message": "Extension request submitted", "request": serialize_extension_request(request)}


@router.get("/{task_id}/extension-requests")
async def list_task_extension_requests(task_id: str, current_user: User = Depends(get_current_user)):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await assert_task_view_access(current_user, task)
    requests = await TaskExtensionRequest.find(TaskExtensionRequest.task_id == task_id).sort("-created_at").to_list()
    return {"requests": [serialize_extension_request(item) for item in requests]}


@router.post("/extension-requests/{request_id}/approve")
async def approve_task_extension(
    request_id: str,
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    request = await TaskExtensionRequest.get(request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extension request not found")
    reviewed = await review_extension_request(request, current_user, True, comment)
    return {"message": "Extension approved", "request": serialize_extension_request(reviewed)}


@router.post("/extension-requests/{request_id}/reject")
async def reject_task_extension(
    request_id: str,
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    request = await TaskExtensionRequest.get(request_id)
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extension request not found")
    reviewed = await review_extension_request(request, current_user, False, comment)
    return {"message": "Extension rejected", "request": serialize_extension_request(reviewed)}


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific task by ID"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)
    await sync_task_health(task)

    return await serialize_task_response(task, current_user, include_detail=True)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a task in the current company."""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_manage(current_user, task)

    await task.delete()
    await cache_delete_pattern(company_dashboard_pattern(str(task.company_id)))

    await publish_event(
        build_domain_event(
            event_name="TaskDeleted",
            aggregate_type="task",
            aggregate_id=str(task.id),
            company_id=str(task.company_id),
            actor_id=str(current_user.id),
            payload={
                "task_id": str(task.id),
                "title": task.title,
                "project_id": str(task.project_id) if task.project_id else None,
            },
            project_id=str(task.project_id) if task.project_id else None,
            metadata={"source": "task_delete"},
        )
    )

    return {"message": "Task deleted successfully", "task_id": task_id}


@router.get("/{task_id}/execution")
async def get_task_execution(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get task execution metadata"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    return {
        "id": str(task.id),
        "title": task.title,
        "status": task.status.value,
        "priority": task.priority.value,
        "progress_percentage": task.progress_percentage,
        "expected_completion_time": task.expected_completion_time,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
        "checklist": task.checklist or [],
        "dependencies": task.dependencies or [],
        "time_logs": task.time_logs or [],
        "workload": TaskService.workload_snapshot([task]),
    }


@router.patch("/{task_id}/status")
async def update_task_status(
    task_id: str,
    new_status: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Update task status"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    # Validate new status
    try:
        task_status = TaskStatus(new_status.lower())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {[s.value for s in TaskStatus]}"
        )

    task = await TaskService.update_status(task, task_status, str(current_user.id), current_user=current_user)

    return {
        "message": "Task status updated successfully",
        "task": await serialize_task_response(task, current_user),
    }


async def _run_task_action(task_id: str, current_user: User, action: str, **kwargs) -> dict:
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    task = await transition_task(task=task, actor=current_user, action=action, **kwargs)
    return {"message": "Task workflow updated", "task": await serialize_task_response(task, current_user)}


@router.post("/{task_id}/start")
async def start_task(task_id: str, current_user: User = Depends(get_current_user)):
    return await _run_task_action(task_id, current_user, "start_work")


@router.post("/{task_id}/submit-review")
async def submit_task_for_review(
    task_id: str,
    reviewer_id: Optional[str] = Form(None),
    comment: Optional[str] = Form(None),
    proof_name: Optional[str] = Form(None),
    proof_value: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    result = await _run_task_action(task_id, current_user, "submit_review", reviewer_id=reviewer_id, comment=comment)
    task = await Task.get(task_id)
    try:
        proof = await _save_optional_proof(task, current_user, proof_name, proof_value, TaskProofContext.REVIEW_SUBMISSION)
        result["proof_saved"] = bool(proof)
    except Exception:
        result["proof_saved"] = False
        result["proof_error"] = "Task entered review, but proof could not be saved"
    return result


@router.post("/{task_id}/request-revision")
async def request_task_revision(
    task_id: str,
    reason: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    return await _run_task_action(task_id, current_user, "request_revision", reason=reason)


@router.post("/{task_id}/approve")
async def approve_task(task_id: str, current_user: User = Depends(get_current_user)):
    return await _run_task_action(task_id, current_user, "approve")


@router.post("/{task_id}/complete")
async def complete_task(task_id: str, current_user: User = Depends(get_current_user)):
    return await _run_task_action(task_id, current_user, "complete")


@router.post("/{task_id}/reopen")
async def reopen_task(task_id: str, current_user: User = Depends(get_current_user)):
    return await _run_task_action(task_id, current_user, "reopen")


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str, current_user: User = Depends(get_current_user)):
    return await _run_task_action(task_id, current_user, "cancel")


@router.patch("/{task_id}/execution")
async def update_task_execution(
    task_id: str,
    progress_percentage: Optional[float] = Form(None),
    expected_completion_time: Optional[str] = Form(None),
    checklist: Optional[str] = Form(None),
    dependencies: Optional[str] = Form(None),
    time_log_hours: Optional[float] = Form(None),
    time_log_note: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Update task execution metadata"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    payload: dict[str, object] = {}
    if progress_percentage is not None:
        payload["progress_percentage"] = progress_percentage
    if expected_completion_time is not None:
        payload["expected_completion_time"] = datetime.fromisoformat(expected_completion_time.replace("Z", "+00:00"))
    if checklist is not None:
        payload["checklist"] = [item.strip() for item in checklist.split("|") if item.strip()]
    if dependencies is not None:
        payload["dependencies"] = [item.strip() for item in dependencies.split("|") if item.strip()]
    if time_log_hours is not None:
        payload["time_log_hours"] = time_log_hours
        payload["time_log_note"] = time_log_note

    task = await TaskService.update_execution(task, payload)
    return {
        "message": "Task execution updated successfully",
        "task": await serialize_task_response(task, current_user, include_detail=True),
    }


@router.post("/{task_id}/checklist")
async def add_task_checklist_item(
    task_id: str,
    text: str = Form(...),
    required: bool = Form(False),
    current_user: User = Depends(get_current_user),
):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_manage(current_user, task)
    items = normalize_checklist(getattr(task, "checklist", []))
    items.append(normalize_checklist_item({"text": text, "required": required}))
    task.checklist = items
    task.updated_at = utc_now()
    await task.save()
    return {"message": "Checklist item added", "task": await serialize_task_response(task, current_user, include_detail=True)}


@router.patch("/{task_id}/checklist/{item_id}")
async def update_task_checklist_item(
    task_id: str,
    item_id: str,
    text: Optional[str] = Form(None),
    completed: Optional[bool] = Form(None),
    required: Optional[bool] = Form(None),
    current_user: User = Depends(get_current_user),
):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    if (text is not None or required is not None) and task.assigned_to == str(current_user.id) and current_user.role == UserRole.EMPLOYEE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assignees can only complete checklist items")
    if text is not None or required is not None:
        await _assert_task_manage(current_user, task)

    found = False
    items = normalize_checklist(getattr(task, "checklist", []))
    for item in items:
        if item["id"] != item_id:
            continue
        found = True
        if text is not None:
            item["text"] = text
        if required is not None:
            item["required"] = required
        if completed is not None:
            item["completed"] = completed
            item["completed_at"] = utc_now().isoformat() if completed else None
            item["completed_by"] = str(current_user.id) if completed else None
        break
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")
    task.checklist = items
    task.updated_at = utc_now()
    await task.save()
    return {"message": "Checklist item updated", "task": await serialize_task_response(task, current_user, include_detail=True)}


@router.delete("/{task_id}/checklist/{item_id}")
async def delete_task_checklist_item(
    task_id: str,
    item_id: str,
    current_user: User = Depends(get_current_user),
):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_manage(current_user, task)
    items = [item for item in normalize_checklist(getattr(task, "checklist", [])) if item["id"] != item_id]
    if len(items) == len(normalize_checklist(getattr(task, "checklist", []))):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")
    task.checklist = items
    task.updated_at = utc_now()
    await task.save()
    return {"message": "Checklist item deleted", "task": await serialize_task_response(task, current_user, include_detail=True)}


@router.post("/{task_id}/dependencies")
async def add_task_dependency(
    task_id: str,
    dependency_id: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_manage(current_user, task)
    dependency = await validate_dependency(task, dependency_id)
    dependencies = [str(item) for item in (task.dependencies or []) if str(item)]
    if str(dependency.id) not in dependencies:
        dependencies.append(str(dependency.id))
    task.dependencies = dependencies
    task.updated_at = utc_now()
    await task.save()
    return {"message": "Dependency added", "task": await serialize_task_response(task, current_user, include_detail=True)}


@router.delete("/{task_id}/dependencies/{dependency_id}")
async def delete_task_dependency(
    task_id: str,
    dependency_id: str,
    current_user: User = Depends(get_current_user),
):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_manage(current_user, task)
    dependencies = [str(item) for item in (task.dependencies or []) if str(item) != str(dependency_id)]
    if len(dependencies) == len(task.dependencies or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dependency not found")
    task.dependencies = dependencies
    task.updated_at = utc_now()
    await task.save()
    return {"message": "Dependency deleted", "task": await serialize_task_response(task, current_user, include_detail=True)}


@router.get("/{task_id}/comments")
async def get_task_comments(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all comments for a task"""
    from app.models.task import TaskComment

    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    # Find all comments for this task. Keep route-id fallback for comments saved
    # before task comments were normalized to the canonical Mongo task id.
    task_comment_ids = list(dict.fromkeys([str(task.id), str(task_id)]))
    task_comments = await TaskComment.find({
        "task_id": {"$in": task_comment_ids},
        "company_id": task.company_id,
    }).sort("-created_at").to_list()

    return {
        "comments": [
            {
                "id": str(comment.id),
                "content": comment.content,
                "user_id": comment.user_id,
                "user_name": comment.user_name,
                "created_at": comment.created_at,
                "attachments": comment.attachments,
            }
            for comment in task_comments
        ]
    }


@router.post("/{task_id}/comments")
async def add_task_comment(
    task_id: str,
    content: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Add a comment to a task"""
    from app.models.task import TaskComment

    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    # Create new comment document
    comment = TaskComment(
        task_id=str(task.id),
        company_id=current_user.company_id,
        user_id=str(current_user.id),
        user_name=f"{current_user.first_name} {current_user.last_name}",
        content=content,
        created_at=utc_now()
    )

    await comment.insert()

    # Update task's updated_at
    task.updated_at = utc_now()
    await task.save()
    await cache_delete_pattern(company_dashboard_pattern(str(task.company_id)))
    await _notify_task_comment(task, comment, current_user)

    await publish_event(
        build_domain_event(
            event_name="TaskCommentAdded",
            aggregate_type="task_comment",
            aggregate_id=str(comment.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload={
                "task_id": str(task.id),
                "content": comment.content,
                "user_id": comment.user_id,
                "user_name": comment.user_name,
                "created_at": comment.created_at.isoformat() if getattr(comment, "created_at", None) else None,
            },
            project_id=str(task.project_id) if task.project_id else None,
            metadata={"source": "task_comment_create"},
        )
    )

    return {
        "id": str(comment.id),
        "message": "Comment added successfully",
        "comment": {
            "id": str(comment.id),
            "content": comment.content,
            "user_id": comment.user_id,
            "user_name": comment.user_name,
            "created_at": comment.created_at,
        }
    }


@router.get("/{task_id}/subtasks")
async def get_task_subtasks(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all subtasks for a task"""
    # Find all tasks where parent_task_id matches this task_id
    subtasks = await Task.find(
        Task.parent_task_id == task_id,
        Task.company_id == current_user.company_id
    ).to_list()

    return {
        "subtasks": [
            {
                "id": str(subtask.id),
                "title": subtask.title,
                "status": subtask.status.value,
                "priority": subtask.priority.value,
                "assigned_to": subtask.assigned_to,
                "created_at": subtask.created_at,
            }
            for subtask in subtasks
        ]
    }


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    priority: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    issue_type_id: Optional[str] = Form(None),
    component_id: Optional[str] = Form(None),
    fix_version_id: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    story_points: Optional[int] = Form(None),
    estimated_hours: Optional[float] = Form(None),
    task_type: Optional[str] = Form(None),
    measurement_type: Optional[str] = Form(None),
    custom_measurement_label: Optional[str] = Form(None),
    target_quantity: Optional[int] = Form(None),
    target_unit: Optional[str] = Form(None),
    completed_quantity: Optional[int] = Form(None),
    reviewer_id: Optional[str] = Form(None),
    review_required: Optional[bool] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Update task details"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_manage(current_user, task)

    task_project = await load_task_project(task, current_user)
    previous_assigned_to = task.assigned_to

    # Update fields if provided
    if title is not None:
        task.title = title
    if description is not None:
        task.description = description
    if priority is not None:
        try:
            task.priority = TaskPriority(priority.lower())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority. Must be one of: {[p.value for p in TaskPriority]}"
            )
    if assigned_to is not None:
        # Allow empty string to unassign
        if assigned_to == '':
            if enum_or_string_value(task.status) not in {TaskStatus.TODO.value, TaskStatus.ASSIGNED.value}:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Started tasks cannot be unassigned")
            task.assigned_to = None
            task.assigned_by = None
            task.assigned_at = None
            if enum_or_string_value(task.status) == TaskStatus.ASSIGNED.value:
                await transition_task(task=task, actor=current_user, action="assign", target_status=TaskStatus.TODO.value)
        else:
            if assigned_to != previous_assigned_to:
                # Use the unified authoritative assign_service for reassignment
                from app.services.task_workflow import assign_task
                await assign_task(
                    task_id=str(task.id),
                    assignee_id=assigned_to,
                    actor=current_user,
                )
                # Refresh task from DB after assign_task
                task = await Task.get(str(task.id))
            else:
                # Same assignee — no-op for assignment, just ensure fields are set
                task.assigned_at = task.assigned_at or utc_now()
    if review_required is not None:
        if getattr(task, "source_type", None) == "sales_follow_up" and review_required:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sales follow-up tasks do not require review")
        task.review_required = review_required
    if reviewer_id is not None:
        if reviewer_id == "":
            task.reviewer_id = None
        else:
            await validate_reviewer(task, reviewer_id, task_project)
            task.reviewer_id = reviewer_id
    if due_date is not None:
        if due_date == '':
            task.due_date = None
        else:
            try:
                # Parse ISO format datetime string
                task.due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
            except ValueError:
                try:
                    # Try parsing as date only
                    task.due_date = datetime.strptime(due_date, '%Y-%m-%d')
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid due_date format. Use ISO format or YYYY-MM-DD"
                    )
    if tags is not None:
        if tags == '':
            task.tags = []
        else:
            # Parse comma-separated tags
            task.tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
    if issue_type_id is not None:
        task.issue_type_id = issue_type_id if issue_type_id != '' else None
    if component_id is not None:
        task.component_id = component_id if component_id != '' else None
    if fix_version_id is not None:
        task.fix_version_id = fix_version_id if fix_version_id != '' else None
    if department_id is not None:
        if department_id == '':
            task.department_id = None
            task.department = None
        else:
            department_doc = await _resolve_department(task.company_id, department_id)
            task.department_id = department_id if department_doc else None
            task.department = department_doc.name if department_doc else None
    if start_date is not None:
        if start_date == '':
            task.start_date = None
        else:
            try:
                task.start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except ValueError:
                try:
                    task.start_date = datetime.strptime(start_date, '%Y-%m-%d')
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid start_date format. Use ISO format or YYYY-MM-DD"
                    )
    if story_points is not None:
        task.story_points = story_points if story_points != '' else None
    if estimated_hours is not None:
        task.estimated_hours = float(estimated_hours) if estimated_hours != '' else None

    # Production / Quantitative fields
    if task_type is not None:
        if task_type == "quantitative" and not task.target_quantity:
            raise HTTPException(status_code=400, detail="Set a target quantity before converting to quantitative task")
        task.task_type = TaskType(task_type)
    if measurement_type is not None:
        task.measurement_type = measurement_type if measurement_type != '' else None
    if custom_measurement_label is not None:
        task.custom_measurement_label = custom_measurement_label if custom_measurement_label != '' else None
    if target_quantity is not None:
        if target_quantity != '' and int(target_quantity) < 1:
            raise HTTPException(status_code=400, detail="Target quantity must be at least 1")
        task.target_quantity = int(target_quantity) if target_quantity != '' else None
    if target_unit is not None:
        task.target_unit = target_unit if target_unit != '' else None
    if completed_quantity is not None:
        task.completed_quantity = int(completed_quantity) if completed_quantity != '' else 0

    task.updated_at = utc_now()
    await task.save()
    await sync_task_health(task)

    if task.assigned_to and task.assigned_to != previous_assigned_to:
        assigned_user = await User.get(task.assigned_to)
        if assigned_user:
            await _notify_task_assignee(task, current_user, assigned_user)
        await create_timeline_event(
            user_id=task.assigned_to,
            company_id=task.company_id,
            event_type=TimelineEventType.TASK_ASSIGNED,
            title="Task Assigned",
            description=task.title,
            related_module=TimelineModule.TASK,
            related_record_id=str(task.id),
            actor_id=str(current_user.id),
            metadata={"task_title": task.title, "project_id": task.project_id, "priority": task.priority.value},
            idempotency_key=f"task:{task.id}:assigned:{task.assigned_to}",
        )

    await create_timeline_event(
        user_id=task.assigned_to or str(current_user.id),
        company_id=task.company_id,
        event_type=TimelineEventType.TASK_UPDATED,
        title="Task Updated",
        description=task.title,
        related_module=TimelineModule.TASK,
        related_record_id=str(task.id),
        actor_id=str(current_user.id),
        metadata={"task_title": task.title, "project_id": task.project_id},
        idempotency_key=f"task:{task.id}:updated:{int(task.updated_at.timestamp())}",
    )

    await publish_event(
        build_domain_event(
            event_name="TaskUpdated",
            aggregate_type="task",
            aggregate_id=str(task.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload={
                "title": task.title,
                "description": task.description,
                "status": task.status.value,
                "priority": task.priority.value,
                "project_id": task.project_id,
                "department_id": task.department_id,
                "tags": task.tags,
                "updated_at": task.updated_at.isoformat() if getattr(task, "updated_at", None) else None,
            },
            project_id=str(task.project_id) if task.project_id else None,
            metadata={"source": "task_update"},
        )
    )

    response = await serialize_task_response(task, current_user, include_detail=True)
    response["message"] = "Task updated successfully"
    return response


@router.post("/{task_id}/attachments")
async def add_task_attachment(
    task_id: str,
    file_url: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Add an attachment to a task"""
    task = await Task.get(task_id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )

    await _assert_task_view(current_user, task)

    # Initialize attachments list if it doesn't exist
    if not hasattr(task, 'attachments') or task.attachments is None:
        task.attachments = []

    # Add file URL to attachments (avoid duplicates)
    if file_url not in task.attachments:
        task.attachments.append(file_url)
        task.updated_at = utc_now()
        await task.save()

        await publish_event(
            build_domain_event(
                event_name="TaskAttachmentAdded",
                aggregate_type="task",
                aggregate_id=str(task.id),
                company_id=str(current_user.company_id),
                actor_id=str(current_user.id),
                payload={
                    "file_url": file_url,
                    "attachments": task.attachments,
                    "updated_at": task.updated_at.isoformat() if getattr(task, "updated_at", None) else None,
                },
                project_id=str(task.project_id) if task.project_id else None,
                correlation_id=str(task.id),
                metadata={"source": "task_attachment_add"},
            )
        )

    return {
        "id": str(task.id),
        "attachments": task.attachments,
        "message": "Attachment added successfully"
    }


@router.post("/{task_id}/production-progress")
async def update_task_production_progress(
    task_id: str,
    body: UpdateProductionProgressRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """
    Update the completed quantity for a quantitative task.
    Accessible to the assigned employee, their manager, admin, and super admin.
    """
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    await _assert_task_view(current_user, task)

    if task.task_type != TaskType.QUANTITATIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task is not a quantitative task")
    if task.target_quantity is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantitative task has no target quantity set")

    if body.completed_quantity > task.target_quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Completed quantity cannot exceed target quantity")
    task.completed_quantity = body.completed_quantity
    task.updated_at = utc_now()
    await task.save()

    remaining = task.target_quantity - task.completed_quantity
    completion_pct = round((task.completed_quantity / task.target_quantity) * 100, 1) if task.target_quantity > 0 else 0.0

    # Fire event for cache invalidation
    await publish_event(
        build_domain_event(
            event_name="TaskProductionProgressUpdated",
            aggregate_type="task",
            aggregate_id=str(task.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload={
                "completed_quantity": task.completed_quantity,
                "target_quantity": task.target_quantity,
                "remaining_quantity": remaining,
                "completion_percentage": completion_pct,
                "notes": body.notes,
            },
            project_id=str(task.project_id) if task.project_id else None,
            metadata={"source": "production_progress_update"},
        )
    )

    response = {
        "id": str(task.id),
        "completed_quantity": task.completed_quantity,
        "remaining_quantity": remaining,
        "completion_percentage": completion_pct,
    }
    try:
        proofs = []
        for index, entry in enumerate(body.proof_entries):
            if entry.value and entry.value.strip():
                proofs.append(await _save_optional_proof(task, current_user, f"Item {index + 1}", entry.value, TaskProofContext.PROGRESS_UPDATE, entry.category))
        proof = await _save_optional_proof(task, current_user, body.proof_name, body.proof_value, TaskProofContext.PROGRESS_UPDATE)
        response["proof_saved"] = bool(proof or any(proofs))
    except Exception:
        response["proof_saved"] = False
        response["proof_error"] = "Progress was saved, but proof could not be saved"
    return response


@router.get("/{task_id}/proofs")
async def list_task_proofs(task_id: str, current_user: User = Depends(get_current_user)):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    proofs = await TaskProof.find({"company_id": str(task.company_id), "task_id": str(task.id)}).sort("created_at").to_list()
    submitters = {proof.submitted_by: await User.get(proof.submitted_by) for proof in proofs}
    return {"proofs": [_serialize_task_proof(proof, submitters.get(proof.submitted_by)) for proof in proofs]}


@router.post("/{task_id}/proofs", status_code=201)
async def create_task_proof(task_id: str, name: str = Form(...), value: str = Form(...), context: TaskProofContext = Form(...), category: str = Form("text"), current_user: User = Depends(get_current_user)):
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    if str(task.assigned_to or "") != str(current_user.id) and current_user.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the assigned worker or task manager can add proof")
    proof = await _save_optional_proof(task, current_user, name, value, context, category)
    if not proof:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Proof name and value are required")
    return {"proof": _serialize_task_proof(proof, current_user)}


# ── Phase 2: Semantic Workflow Action Endpoints ─────────────────────────────
# These provide clear, intent-driven endpoints that route through the
# centralized TaskWorkflowService.  PATCH /status remains for backward
# compatibility but is intentionally not the recommended path.


@router.post("/{task_id}/start")
async def start_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Start work on an assigned task (ASSIGNED → IN_PROGRESS)."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    task = await transition_task(task=task, actor=current_user, action="start_work")
    return {
        "id": str(task.id),
        "status": task.status.value,
        "message": "Task started successfully",
    }


@router.post("/{task_id}/submit-review")
async def submit_task_for_review(
    task_id: str,
    reviewer_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Submit task for review (IN_PROGRESS → IN_REVIEW)."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    task = await transition_task(
        task=task, actor=current_user, action="submit_review", reviewer_id=reviewer_id,
    )
    return {
        "id": str(task.id),
        "status": task.status.value,
        "reviewer_id": task.reviewer_id,
        "review_round": task.review_round,
        "message": "Task submitted for review",
    }


@router.post("/{task_id}/request-revision")
async def request_task_revision(
    task_id: str,
    reason: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """Request revision from assignee (IN_REVIEW → REVISION_REQUIRED)."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    task = await transition_task(
        task=task, actor=current_user, action="request_revision", reason=reason,
    )
    return {
        "id": str(task.id),
        "status": task.status.value,
        "latest_revision_reason": task.latest_revision_reason,
        "message": "Revision requested",
    }


@router.post("/{task_id}/approve")
async def approve_task(
    task_id: str,
    comment: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Approve a reviewed task (IN_REVIEW → APPROVED)."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    task = await transition_task(
        task=task, actor=current_user, action="approve", comment=comment,
    )
    return {
        "id": str(task.id),
        "status": task.status.value,
        "approved_by": task.approved_by,
        "approved_at": task.approved_at,
        "message": "Task approved",
    }


@router.post("/{task_id}/complete")
async def complete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Complete an approved or non-review task (→ COMPLETED)."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    task = await transition_task(task=task, actor=current_user, action="complete")
    return {
        "id": str(task.id),
        "status": task.status.value,
        "completed_at": task.completed_at,
        "message": "Task completed",
    }


@router.post("/{task_id}/reopen")
async def reopen_task(
    task_id: str,
    reason: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Reopen a completed task (COMPLETED → ASSIGNED)."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    task = await transition_task(
        task=task, actor=current_user, action="reopen", reason=reason,
    )
    return {
        "id": str(task.id),
        "status": task.status.value,
        "message": "Task reopened",
    }


@router.post("/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Cancel a task."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    task = await transition_task(task=task, actor=current_user, action="cancel")
    return {
        "id": str(task.id),
        "status": task.status.value,
        "message": "Task cancelled",
    }


@router.post("/{task_id}/checklist")
async def add_checklist_item(
    task_id: str,
    text: str = Form(...),
    required: bool = Form(False),
    current_user: User = Depends(get_current_user),
):
    """Add a checklist item to a task."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    new_item = normalize_checklist_item({"text": text, "required": required})
    task.checklist = list(task.checklist or []) + [new_item]
    task.updated_at = utc_now()
    await task.save()
    return {
        "id": str(task.id),
        "checklist": task.checklist,
        "message": "Checklist item added",
    }


@router.patch("/{task_id}/checklist/{item_id}")
async def update_checklist_item(
    task_id: str,
    item_id: str,
    completed: Optional[bool] = Form(None),
    text: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Update a checklist item (toggle completion or edit text)."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    now = utc_now()
    updated = False
    new_checklist = []
    for item in task.checklist or []:
        if str(item.get("id")) == str(item_id):
            if completed is not None:
                item["completed"] = completed
                if completed:
                    item["completed_at"] = now.isoformat()
                    item["completed_by"] = str(current_user.id)
                else:
                    item["completed_at"] = None
                    item["completed_by"] = None
            if text is not None:
                item["text"] = text
            updated = True
        new_checklist.append(item)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")
    task.checklist = new_checklist
    task.updated_at = now
    await task.save()
    return {
        "id": str(task.id),
        "checklist": task.checklist,
        "message": "Checklist item updated",
    }


@router.delete("/{task_id}/checklist/{item_id}")
async def delete_checklist_item(
    task_id: str,
    item_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a checklist item from a task."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    new_checklist = [item for item in (task.checklist or []) if str(item.get("id")) != str(item_id)]
    if len(new_checklist) == len(task.checklist or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")
    task.checklist = new_checklist
    task.updated_at = utc_now()
    await task.save()
    return {
        "id": str(task.id),
        "checklist": task.checklist,
        "message": "Checklist item deleted",
    }


@router.post("/{task_id}/dependencies")
async def add_task_dependency(
    task_id: str,
    dependency_id: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """Add a dependency (blocking task) to a task."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    dep_task = await validate_dependency(task, dependency_id)
    existing_deps = [str(d) for d in (task.dependencies or [])]
    if dependency_id in existing_deps:
        return {
            "id": str(task.id),
            "dependencies": task.dependencies,
            "message": "Dependency already exists",
        }
    task.dependencies = existing_deps + [dependency_id]
    task.updated_at = utc_now()
    await task.save()
    return {
        "id": str(task.id),
        "dependencies": task.dependencies,
        "message": "Dependency added",
    }


@router.delete("/{task_id}/dependencies/{dependency_id}")
async def remove_task_dependency(
    task_id: str,
    dependency_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a dependency from a task."""
    task = await Task.get(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await _assert_task_view(current_user, task)
    task.dependencies = [str(d) for d in (task.dependencies or []) if str(d) != dependency_id]
    task.updated_at = utc_now()
    await task.save()
    return {
        "id": str(task.id),
        "dependencies": task.dependencies,
        "message": "Dependency removed",
    }
