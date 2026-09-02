"""
Work Reports API — operational reports for Projects, Tasks, Employees, Clients, and Time.

All reports enforce company scope and permission rules server-side.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from app.api.dependencies import get_current_user
from app.core.clock import utc_now
from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.services.project_health_service import ProjectHealthService
from app.services.work_metrics_service import aggregate_time_by_project

router = APIRouter(prefix="/reports", tags=["Work Reports"])


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

    total = await Project.find(query).count()
    skip = (page - 1) * page_size
    projects = await Project.find(query).sort("created_at", -1).skip(skip).limit(page_size).to_list()

    results = []
    for project in projects:
        # Health
        health_data = await ProjectHealthService.calculate_project_health(project)
        project_health = health_data.get("health", "healthy") if health_data else "healthy"
        if health and project_health != health:
            continue

        # Progress
        progress = await ProjectHealthService.calculate_project_progress(project)

        # Task counts
        task_filter: Dict[str, Any] = {
            "company_id": current_user.company_id,
            "$or": [
                {"project_id": str(project.project_id or project.id)},
                {"project_id": str(project.id)},
            ],
        }
        all_tasks = await Task.find(task_filter).to_list()
        completed = sum(1 for t in all_tasks if t.status == TaskStatus.COMPLETED)
        open_tasks = sum(1 for t in all_tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED))
        overdue = sum(1 for t in all_tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED) and t.due_date and t.due_date < utc_now())

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
    if project_id:
        query["project_id"] = project_id

    now = utc_now()
    if overdue_only:
        query["status"] = {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}
        query["due_date"] = {"$lt": now}

    total = await Task.find(query).count()
    skip = (page - 1) * page_size
    tasks = await Task.find(query).sort("due_date", 1).skip(skip).limit(page_size).to_list()

    results = []
    for task in tasks:
        results.append({
            "task_id": str(task.id),
            "title": task.title,
            "project_id": task.project_id,
            "assignee": task.assigned_to,
            "reviewer": getattr(task, "reviewer_id", None),
            "status": task.status.value if hasattr(task.status, "value") else str(task.status),
            "priority": task.priority.value if hasattr(task.priority, "value") else str(task.priority),
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "review_round": getattr(task, "review_round", 0),
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
    if employee_id:
        task_query["assigned_to"] = employee_id

    tasks = await Task.find(task_query).to_list()

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

    clients = await Client.find(query).to_list()
    results = []

    for client in clients:
        client_id_str = str(client.id)
        projects = await Project.find(
            {"company_id": current_user.company_id, "client_id": client_id_str}
        ).to_list()

        active = 0
        completed = 0
        at_risk_count = 0
        project_ids = []

        for p in projects:
            project_ids.append(str(p.id))
            status_val = p.status.value if hasattr(p.status, "value") else str(p.status)
            if status_val == ProjectStatus.COMPLETED.value:
                completed += 1
            elif status_val not in (ProjectStatus.ARCHIVED.value, ProjectStatus.CANCELLED.value):
                active += 1
                health = await ProjectHealthService.calculate_project_health(p)
                if health and health.get("health") == "at_risk":
                    at_risk_count += 1

        # Task counts
        task_query: Dict[str, Any] = {
            "company_id": current_user.company_id,
            "project_id": {"$in": project_ids},
        } if project_ids else {"company_id": current_user.company_id, "project_id": "__none__"}
        client_tasks = await Task.find(task_query).to_list() if project_ids else []
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
    report_user_id = employee_id or (visible_ids[0] if visible_ids and len(visible_ids) == 1 else None)

    result = await TimeReportingService.generate_employee_time_report(
        company_id=current_user.company_id,
        user_id=report_user_id or str(current_user.id),
        start_date=start_date,
        end_date=end_date,
    )

    return result
