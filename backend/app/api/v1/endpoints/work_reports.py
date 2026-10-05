"""
Work Reports API — operational reports for Projects, Tasks, Employees, Clients, and Time.

All reports enforce company scope and permission rules server-side.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.dependencies import get_current_user
from app.core.clock import ClockService, utc_now
from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.services.project_health_service import ProjectHealthService, calculate_project_health
from app.services.project_permissions import ProjectPermission, has_project_permission
from app.services.task_health_service import assert_task_view_access, calculate_task_health
from app.services.task_workflow import blocking_dependencies
from app.services.work_metrics_service import aggregate_time_by_project

router = APIRouter(tags=["Work Reports"])


async def _get_visible_user_ids(user: User) -> Optional[List[str]]:
    """Get visible user IDs based on role. None = no filter (admin scope)."""
    role = user.role
    if isinstance(role, str):
        role_val = role.lower()
    else:
        role_val = role.value.lower() if hasattr(role, "value") else str(role).lower()

    if role_val in ("super_admin", "admin", "sub_admin"):
        return None  # admin sees all

    # Manager/Lead sees self + subordinates
    if role_val in ("manager", "lead"):
        subordinates = await user.get_all_subordinates()
        return [str(user.id)] + [str(s.id) for s in subordinates]

    # Employee sees only self
    return [str(user.id)]


def _assert_visible_user(user: User, requested_id: Optional[str], visible_ids: Optional[List[str]]) -> None:
    if requested_id and visible_ids is not None and str(requested_id) not in visible_ids:
        raise HTTPException(status_code=403, detail="You do not have access to this employee report")


def _date_bounds(start_date: Optional[str], end_date: Optional[str], user: User) -> tuple[Optional[datetime], Optional[datetime]]:
    if not start_date and not end_date:
        return None, None
    start = start_date or end_date
    end = end_date or start_date
    try:
        start_value = datetime.fromisoformat(start.replace("Z", "+00:00")).date()
        end_value = datetime.fromisoformat(end.replace("Z", "+00:00")).date()
        start_at, end_at = ClockService.local_day_bounds_utc(start_value, end_value, getattr(user, "timezone", None))
        return start_at, end_at
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid report date range") from exc


async def _project_visible(project: Project, user: User, visible_ids: Optional[List[str]]) -> bool:
    if str(project.company_id) != str(user.company_id):
        return False
    if visible_ids is None:
        return True
    if user.role not in {UserRole.MANAGER, UserRole.LEAD} and has_project_permission(user, project, ProjectPermission.VIEW_PROJECT):
        return True
    project_members = {str(getattr(project, field, "")) for field in ("lead_id", "assigned_to", "created_by") if getattr(project, field, None)}
    project_members.update(str(value) for value in (getattr(project, "assigned_user_ids", None) or []))
    if project_members.intersection(visible_ids):
        return True
    tasks = await Task.find({
        "company_id": user.company_id,
        "$or": [
            {"project_id": str(project.project_id or project.id)},
            {"project_id": str(project.id)},
            {"project_object_id": str(project.id)},
        ],
    }).to_list()
    for task in tasks:
        try:
            await assert_task_view_access(user, task)
            return True
        except HTTPException:
            continue
    return False


# ---------------------------------------------------------------------------
# Project Report
# ---------------------------------------------------------------------------

@router.get("/projects")
async def project_report(
    status: Optional[str] = None,
    health: Optional[str] = None,
    owner: Optional[str] = None,
    client_id: Optional[str] = None,
    project_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Project report with filters."""
    query: Dict[str, Any] = {"company_id": current_user.company_id}

    if status:
        query["status"] = status
    if owner:
        query["lead_id"] = owner
    if client_id:
        query["client_id"] = client_id
    if project_type:
        query["type"] = project_type

    visible_ids = await _get_visible_user_ids(current_user)
    _assert_visible_user(current_user, owner, visible_ids)
    projects = await Project.find(query).to_list()
    start_at, end_at = _date_bounds(start_date, end_date, current_user)

    # Pre-fetch ALL tasks for matching projects in one query (batch N+1).
    project_identifiers: list[str] = []
    project_oid_map: dict[str, str] = {}  # project_oid -> project_id_str
    for project in projects:
        pid = str(project.project_id or project.id)
        project_identifiers.append(pid)
        project_oid_map[str(project.id)] = pid
    all_project_tasks = await Task.find({
        "company_id": current_user.company_id,
        "$or": [
            {"project_id": {"$in": project_identifiers}},
            {"project_object_id": {"$in": [str(p.id) for p in projects]}},
        ],
    }).to_list()
    # Index tasks by project ID (supports both project_id and project_object_id links)
    tasks_by_project: Dict[str, list] = {}
    for t in all_project_tasks:
        t_pid = t.project_id or ""
        t_poid = getattr(t, "project_object_id", None) or ""
        for key in {t_pid, t_poid}:
            if key:
                tasks_by_project.setdefault(key, []).append(t)

    now_utc = utc_now()
    results = []
    for project in projects:
        if not await _project_visible(project, current_user, visible_ids):
            continue
        if start_at and project.delivery_date and project.delivery_date < start_at:
            continue
        if end_at and project.start_date and project.start_date > end_at:
            continue

        proj_key = str(project.project_id or project.id)
        proj_tasks = tasks_by_project.get(proj_key, []) or tasks_by_project.get(str(project.id), [])

        # Health (computed from pre-fetched tasks)
        from app.services.project_health_service import calculate_project_health, calculate_project_progress
        health_data = calculate_project_health(project, proj_tasks, now_utc)
        project_health = health_data.level
        if health and project_health != health:
            continue

        progress = health_data.completion_percentage
        completed = health_data.completed_task_count
        open_tasks = health_data.total_open_tasks
        overdue = health_data.overdue_task_count

        # Time
        time_data = await aggregate_time_by_project(current_user.company_id, str(project.id))

        results.append({
            "project_id": project.project_id or str(project.id),
            "name": project.name,
            "status": project.status.value if hasattr(project.status, "value") else str(project.status),
            "priority": project.priority.value if hasattr(project.priority, "value") else str(project.priority),
            "client_id": project.client_id,
            "lead_id": project.lead_id,
            "start_date": project.start_date.isoformat() if project.start_date else None,
            "delivery_date": project.delivery_date.isoformat() if project.delivery_date else None,
            "health": project_health,
            "progress": progress,
            "completed_tasks": completed,
            "open_tasks": open_tasks,
            "overdue_tasks": overdue,
            "tracked_time_hours": time_data["total_hours"],
        })

    total = len(results)
    skip = (page - 1) * page_size
    results = results[skip:skip + page_size]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "projects": results,
    }


# ---------------------------------------------------------------------------
# Task Report
# ---------------------------------------------------------------------------

@router.get("/tasks")
async def task_report(
    assignee: Optional[str] = None,
    reviewer: Optional[str] = None,
    status_filter: Optional[str] = None,
    priority: Optional[str] = None,
    health: Optional[str] = None,
    overdue_only: bool = False,
    blocked_only: bool = False,
    project_id: Optional[str] = None,
    client_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Task report with comprehensive filters."""
    visible_ids = await _get_visible_user_ids(current_user)
    query: Dict[str, Any] = {"company_id": current_user.company_id}

    _assert_visible_user(current_user, assignee, visible_ids)
    _assert_visible_user(current_user, reviewer, visible_ids)
    if assignee:
        query["assigned_to"] = assignee
    elif visible_ids is not None:
        query["assigned_to"] = {"$in": visible_ids}

    if reviewer:
        query["reviewer_id"] = reviewer
    if status_filter:
        query["status"] = status_filter
    if priority:
        query["priority"] = priority
    tasks = [task for task in await Task.find(query).to_list() if str(task.company_id) == str(current_user.company_id)]
    start_at, end_at = _date_bounds(start_date, end_date, current_user)
    project = None
    client_project_ids = None
    if project_id:
        project = await Project.find_one({"company_id": current_user.company_id, "$or": [{"project_id": project_id}, {"_id": project_id}]})
        if not project or not await _project_visible(project, current_user, visible_ids):
            raise HTTPException(status_code=404, detail="Project not found")
    elif client_id:
        client_projects = await Project.find({"company_id": current_user.company_id, "client_id": client_id}).to_list()
        visible_client_projects = [item for item in client_projects if await _project_visible(item, current_user, visible_ids)]
        client_project_ids = {str(value) for item in visible_client_projects for value in (item.id, item.project_id) if value}
    now = utc_now()
    filtered_tasks = []
    for task in tasks:
        if project_id and str(task.project_id or "") not in {str(project.project_id or ""), str(project.id)}:
            continue
        if client_id:
            if client_project_ids is None or str(task.project_id or "") not in client_project_ids:
                continue
        if start_at and (not task.due_date or task.due_date < start_at):
            continue
        if end_at and (not task.due_date or task.due_date > end_at):
            continue
        if overdue_only and not (task.due_date and task.due_date < now and task.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED)):
            continue
        task_health = calculate_task_health(task, now)
        if health and getattr(task_health, "value", task_health) != health:
            continue
        if blocked_only and not await blocking_dependencies(task):
            continue
        filtered_tasks.append(task)
    filtered_tasks.sort(key=lambda item: item.due_date or datetime.max)
    total = len(filtered_tasks)
    skip = (page - 1) * page_size
    tasks = filtered_tasks[skip:skip + page_size]

    results = []
    for task in tasks:
        task_health = calculate_task_health(task, now)
        results.append({
            "task_id": str(task.id),
            "title": task.title,
            "project_id": task.project_id,
            "assignee": task.assigned_to,
            "reviewer": getattr(task, "reviewer_id", None),
            "status": task.status.value if hasattr(task.status, "value") else str(task.status),
            "priority": task.priority.value if hasattr(task.priority, "value") else str(task.priority),
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "carry_forward_due_date": getattr(task, "carry_forward_due_date", None).isoformat() if getattr(task, "carry_forward_due_date", None) else None,
            "carry_forward_days": int(getattr(task, "carry_forward_days", 0) or 0),
            "review_round": getattr(task, "review_round", 0),
            "health": getattr(task_health, "value", str(task_health)),
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "tasks": results,
    }


# ---------------------------------------------------------------------------
# Employee Work Report
# ---------------------------------------------------------------------------

@router.get("/employees")
async def employee_report(
    employee_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Employee work report."""
    visible_ids = await _get_visible_user_ids(current_user)

    # Get all tasks for visible users
    task_query: Dict[str, Any] = {"company_id": current_user.company_id}
    if visible_ids is not None:
        task_query["assigned_to"] = {"$in": visible_ids}
    _assert_visible_user(current_user, employee_id, visible_ids)
    if employee_id:
        task_query["assigned_to"] = employee_id

    tasks = await Task.find(task_query).to_list()
    start_at, end_at = _date_bounds(start_date, end_date, current_user)
    tasks = [task for task in tasks if (not start_at or (task.due_date and task.due_date >= start_at)) and (not end_at or (task.due_date and task.due_date <= end_at))]

    # Group by assignee
    by_user: Dict[str, List[Task]] = {}
    for task in tasks:
        uid = task.assigned_to or "unassigned"
        by_user.setdefault(uid, []).append(task)

    results = []
    for uid, user_tasks in by_user.items():
        total = len(user_tasks)
        completed = sum(1 for t in user_tasks if t.status == TaskStatus.COMPLETED)
        overdue = sum(1 for t in user_tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED) and t.due_date and t.due_date < utc_now())
        revisions = sum(1 for t in user_tasks if t.status == TaskStatus.REVISION_REQUIRED)

        results.append({
            "employee_id": uid,
            "assigned_tasks": total,
            "completed_tasks": completed,
            "overdue_tasks": overdue,
            "revision_count": revisions,
        })

    # Paginate
    total_users = len(results)
    skip = (page - 1) * page_size
    paginated = results[skip:skip + page_size]

    return {
        "total": total_users,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_users + page_size - 1) // page_size,
        "employees": paginated,
    }


# ---------------------------------------------------------------------------
# Client Work Report
# ---------------------------------------------------------------------------

@router.get("/clients")
async def client_report(
    client_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Client work report."""
    from app.models.client import Client

    query: Dict[str, Any] = {"company_id": current_user.company_id}
    if client_id:
        query["_id"] = client_id

    visible_ids = await _get_visible_user_ids(current_user)
    clients = await Client.find(query).to_list()
    results = []

    # Pre-fetch all projects for all clients in one batch to avoid N+1.
    all_client_ids = [str(c.id) for c in clients]
    all_projects = await Project.find(
        {"company_id": current_user.company_id, "client_id": {"$in": all_client_ids}}
    ).to_list() if all_client_ids else []
    projects_by_client: Dict[str, list] = {}
    for p in all_projects:
        projects_by_client.setdefault(str(p.client_id), []).append(p)

    # Pre-fetch ALL tasks for these projects in one query.
    all_project_ids: list[str] = []
    all_project_oids: list[str] = []
    for p in all_projects:
        pid = str(p.project_id or p.id)
        all_project_ids.append(pid)
        all_project_oids.append(str(p.id))
    all_client_tasks = await Task.find({
        "company_id": current_user.company_id,
        "$or": [
            {"project_id": {"$in": all_project_ids}},
            {"project_object_id": {"$in": all_project_oids}},
        ],
    }).to_list() if all_project_ids else []
    tasks_by_project: Dict[str, list] = {}
    for t in all_client_tasks:
        for key in {t.project_id or "", getattr(t, 'project_object_id', None) or ""}:
            if key:
                tasks_by_project.setdefault(key, []).append(t)

    now_utc = utc_now()
    for client in clients:
        client_id_str = str(client.id)
        projects = projects_by_client.get(client_id_str, [])
        projects = [project for project in projects if await _project_visible(project, current_user, visible_ids)]
        if client_id and not projects and visible_ids is not None:
            raise HTTPException(status_code=404, detail="Client not found")

        active = 0
        completed = 0
        at_risk_count = 0
        project_ids = []

        for p in projects:
            project_ids.append(str(p.id))
            if getattr(p, 'project_id', None):
                project_ids.append(str(p.project_id))
            status_val = p.status.value if hasattr(p.status, "value") else str(p.status)
            if status_val == ProjectStatus.COMPLETED.value:
                completed += 1
            elif status_val not in (ProjectStatus.ARCHIVED.value, ProjectStatus.CANCELLED.value):
                active += 1
                proj_tasks = tasks_by_project.get(str(p.project_id or p.id), []) or tasks_by_project.get(str(p.id), [])
                health_data = calculate_project_health(p, proj_tasks, now_utc)
                if health_data.level == "at_risk":
                    at_risk_count += 1

        # Use pre-fetched tasks for counting.
        client_tasks = []
        for pid in project_ids:
            client_tasks.extend(tasks_by_project.get(pid, []))
        # Deduplicate
        seen = set()
        unique_tasks = []
        for t in client_tasks:
            tid = str(t.id)
            if tid not in seen:
                seen.add(tid)
                unique_tasks.append(t)
        client_tasks = unique_tasks
        open_tasks = sum(1 for t in client_tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED))
        overdue_tasks = sum(1 for t in client_tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED) and t.due_date and t.due_date < utc_now())

        # Time
        from app.services.work_metrics_service import aggregate_time_by_client as _agg_client_time
        time_data = await _agg_client_time(
            current_user.company_id, client_id_str
        )

        results.append({
            "client_id": client_id_str,
            "name": client.name,
            "projects": len(projects),
            "active_projects": active,
            "completed_projects": completed,
            "at_risk_projects": at_risk_count,
            "open_tasks": open_tasks,
            "overdue_tasks": overdue_tasks,
            "tracked_time_hours": time_data["total_hours"],
        })

    total = len(results)
    skip = (page - 1) * page_size
    paginated = results[skip:skip + page_size]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "clients": paginated,
    }


# ---------------------------------------------------------------------------
# Time Report (delegates to TimeReportingService)
# ---------------------------------------------------------------------------

@router.get("/time")
async def time_report(
    employee_id: Optional[str] = None,
    project_id: Optional[str] = None,
    task_id: Optional[str] = None,
    client_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Time report — delegates to existing TimeReportingService."""
    from app.services.time_reporting_service import TimeReportingService

    visible_ids = await _get_visible_user_ids(current_user)
    _assert_visible_user(current_user, employee_id, visible_ids)
    if project_id:
        project = await Project.find_one({"company_id": current_user.company_id, "$or": [{"project_id": project_id}, {"_id": project_id}]})
        if not project or not await _project_visible(project, current_user, visible_ids):
            raise HTTPException(status_code=404, detail="Project not found")
    if task_id:
        task = await Task.get(task_id)
        if not task or str(task.company_id) != str(current_user.company_id):
            raise HTTPException(status_code=404, detail="Task not found")
        try:
            await assert_task_view_access(current_user, task)
        except HTTPException as exc:
            raise HTTPException(status_code=404, detail="Task not found") from exc

    result = await TimeReportingService.summarize_time(
        actor=current_user,
        start_date=start_date,
        end_date=end_date,
        employee_id=employee_id,
        project_id=project_id,
        task_id=task_id,
        client_id=client_id,
    )

    return result
