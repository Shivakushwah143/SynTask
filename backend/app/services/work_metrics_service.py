"""
Shared Work Metrics Service — single source of truth for operational counts.

Every consumer (Dashboard, Work Overview, Tasks page, Reports) should use these
primitives instead of calculating independently.  All queries are scoped by
company_id and respect user permissions via the `visible_user_ids` parameter.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set

from app.core.clock import utc_now
from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskStatus
from app.models.work_request import WorkRequest, WorkRequestStatus


# ---------------------------------------------------------------------------
# Core metric primitives
# ---------------------------------------------------------------------------

async def count_overdue_tasks(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> int:
    """Non-completed/cancelled tasks with due_date < now."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "due_date": {"$lt": utc_now()},
    }
    if visible_user_ids is not None:
        query["assigned_to"] = {"$in": visible_user_ids}
    return await Task.find(query).count()


async def count_due_today(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> int:
    """Tasks due today (UTC-based, compared against calendar date)."""
    now = utc_now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "due_date": {"$gte": day_start, "$lt": day_end},
    }
    if visible_user_ids is not None:
        query["assigned_to"] = {"$in": visible_user_ids}
    return await Task.find(query).count()


async def count_critical_tasks(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> int:
    """Non-completed/cancelled tasks with priority=critical."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "priority": "critical",
    }
    if visible_user_ids is not None:
        query["assigned_to"] = {"$in": visible_user_ids}
    return await Task.find(query).count()


async def count_blocked_tasks(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> int:
    """Tasks with unresolved dependencies.  This is a derived metric — count
    tasks that have at least one dependency whose blocking task is not completed."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "dependencies": {"$exists": True, "$ne": []},
    }
    if visible_user_ids is not None:
        query["assigned_to"] = {"$in": visible_user_ids}
    tasks_with_deps = await Task.find(query).to_list()
    blocked = 0
    for task in tasks_with_deps:
        if task.dependencies:
            # Check if any dependency is not completed
            dep_ids = [str(d.get("task_id", "")) for d in task.dependencies if d.get("task_id")]
            if dep_ids:
                completed_count = await Task.find(
                    {"_id": {"$in": dep_ids}, "status": TaskStatus.COMPLETED.value}
                ).count()
                if completed_count < len(dep_ids):
                    blocked += 1
    return blocked


async def count_tasks_awaiting_review(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> int:
    """Tasks in in_review status."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": TaskStatus.IN_REVIEW.value,
    }
    if visible_user_ids is not None:
        query["assigned_to"] = {"$in": visible_user_ids}
    return await Task.find(query).count()


async def count_active_tasks(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> int:
    """Non-completed/cancelled tasks."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
    }
    if visible_user_ids is not None:
        query["assigned_to"] = {"$in": visible_user_ids}
    return await Task.find(query).count()


async def count_revision_required_tasks(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> int:
    """Tasks in revision_required status."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": TaskStatus.REVISION_REQUIRED.value,
    }
    if visible_user_ids is not None:
        query["assigned_to"] = {"$in": visible_user_ids}
    return await Task.find(query).count()


async def count_active_projects(
    company_id: str,
) -> int:
    """Non-terminal projects."""
    terminal = {ProjectStatus.COMPLETED.value, ProjectStatus.ARCHIVED.value, ProjectStatus.CANCELLED.value}
    return await Project.find(
        {"company_id": company_id, "status": {"$nin": list(terminal)}}
    ).count()


async def count_at_risk_projects(
    company_id: str,
) -> int:
    """Projects with health == at_risk (from Phase 1 ProjectHealthService)."""
    from app.services.project_health_service import ProjectHealthService
    projects = await Project.find(
        {"company_id": company_id, "status": {"$nin": [ProjectStatus.ARCHIVED.value, ProjectStatus.CANCELLED.value]}}
    ).to_list()
    count = 0
    for project in projects:
        health = await ProjectHealthService.calculate_project_health(project)
        if health and health.get("health") == "at_risk":
            count += 1
    return count


async def count_pending_extension_requests(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> int:
    """Pending task extension requests."""
    from app.models.task import TaskExtensionRequest
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": "pending",
    }
    if visible_user_ids is not None:
        query["requested_by"] = {"$in": visible_user_ids}
    return await TaskExtensionRequest.find(query).count()


async def count_open_work_requests(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> int:
    """Open work requests (submitted/under_review)."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": {"$in": [WorkRequestStatus.SUBMITTED.value, WorkRequestStatus.UNDER_REVIEW.value]},
    }
    return await WorkRequest.find(query).count()


async def aggregate_time_by_project(
    company_id: str,
    project_id: str,
) -> Dict[str, Any]:
    """Aggregate finalized time logs for a project."""
    from app.models.time_tracking import TimeLog
    logs = await TimeLog.find(
        {"company_id": company_id, "project_id": project_id, "voided": {"$ne": True}}
    ).to_list()
    total_hours = sum(getattr(log, "hours", 0) or 0 for log in logs)
    return {
        "total_hours": round(total_hours, 2),
        "log_count": len(logs),
    }


async def aggregate_time_by_client(
    company_id: str,
    client_id: str,
) -> Dict[str, Any]:
    """Aggregate finalized time logs for all projects of a client."""
    from app.models.time_tracking import TimeLog
    # Find all project IDs for this client
    projects = await Project.find(
        {"company_id": company_id, "client_id": client_id}
    ).to_list()
    project_ids = [str(p.id) for p in projects]
    if not project_ids:
        return {"total_hours": 0, "log_count": 0, "project_count": 0}

    logs = await TimeLog.find(
        {"company_id": company_id, "project_id": {"$in": project_ids}, "voided": {"$ne": True}}
    ).to_list()
    total_hours = sum(getattr(log, "hours", 0) or 0 for log in logs)
    return {
        "total_hours": round(total_hours, 2),
        "log_count": len(logs),
        "project_count": len(projects),
    }


# ---------------------------------------------------------------------------
# Batch aggregation for performance (single query per dimension)
# ---------------------------------------------------------------------------

async def batch_count_by_status(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
) -> Dict[str, int]:
    """Count tasks by status in a single query.  Returns dict keyed by status value."""
    query: Dict[str, Any] = {"company_id": company_id}
    if visible_user_ids is not None:
        query["assigned_to"] = {"$in": visible_user_ids}
    tasks = await Task.find(query).to_list()
    counts: Dict[str, int] = {}
    for task in tasks:
        status_val = task.status.value if hasattr(task.status, "value") else str(task.status)
        counts[status_val] = counts.get(status_val, 0) + 1
    return counts


async def get_overdue_tasks_list(
    company_id: str,
    visible_user_ids: Optional[List[str]] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Get overdue tasks for display."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        "due_date": {"$lt": utc_now()},
    }
    if visible_user_ids is not None:
        query["assigned_to"] = {"$in": visible_user_ids}
    tasks = await Task.find(query).sort("due_date").limit(limit).to_list()
    return [
        {
            "task_id": str(t.id),
            "title": t.title,
            "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            "priority": t.priority.value if hasattr(t.priority, "value") else str(t.priority),
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "assigned_to": t.assigned_to,
            "project_id": t.project_id,
        }
        for t in tasks
    ]


async def get_at_risk_projects_list(
    company_id: str,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Get at-risk projects with health reasons."""
    from app.services.project_health_service import ProjectHealthService
    projects = await Project.find(
        {"company_id": company_id, "status": {"$nin": [ProjectStatus.ARCHIVED.value, ProjectStatus.CANCELLED.value]}}
    ).to_list()
    at_risk = []
    for project in projects:
        health = await ProjectHealthService.calculate_project_health(project)
        if health and health.get("health") == "at_risk":
            at_risk.append({
                "project_id": project.project_id or str(project.id),
                "name": project.name,
                "status": project.status.value if hasattr(project.status, "value") else str(project.status),
                "health": "at_risk",
                "reasons": health.get("reasons", []),
            })
        if len(at_risk) >= limit:
            break
    return at_risk


async def client_work_summary(
    company_id: str,
    client_id: str,
) -> Dict[str, Any]:
    """Derived work summary for a client workspace."""
    projects = await Project.find(
        {"company_id": company_id, "client_id": client_id}
    ).to_list()

    active = []
    completed = []
    at_risk = []
    project_ids = []
    for p in projects:
        project_ids.append(str(p.id))
        status_val = p.status.value if hasattr(p.status, "value") else str(p.status)
        if status_val == ProjectStatus.COMPLETED.value:
            completed.append(p)
        elif status_val not in (ProjectStatus.ARCHIVED.value, ProjectStatus.CANCELLED.value):
            active.append(p)

    # At-risk among active
    from app.services.project_health_service import ProjectHealthService
    for p in active:
        health = await ProjectHealthService.calculate_project_health(p)
        if health and health.get("health") == "at_risk":
            at_risk.append(p)

    # Task counts
    task_query: Dict[str, Any] = {
        "company_id": company_id,
        "$or": [
            {"project_id": {"$in": project_ids}},
        ],
    }
    all_tasks = await Task.find(task_query).to_list()
    open_tasks = [t for t in all_tasks if t.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED)]
    overdue_tasks = [t for t in open_tasks if t.due_date and t.due_date < utc_now()]

    # Time
    time_data = await aggregate_time_by_client(company_id, client_id)

    return {
        "active_projects": len(active),
        "completed_projects": len(completed),
        "at_risk_projects": len(at_risk),
        "open_tasks": len(open_tasks),
        "overdue_tasks": len(overdue_tasks),
        "total_time_hours": time_data["total_hours"],
    }
