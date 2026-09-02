from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

from app.core.clock import parse_to_utc, utc_now
from app.models.project import Project
from app.models.task import Task
from app.models.time_tracking import TimeLog
from app.models.user import User, UserRole


def _date_query(start_date: Optional[str], end_date: Optional[str]) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if start_date:
        query["$gte"] = parse_to_utc(datetime.fromisoformat(start_date.replace("Z", "+00:00")))
    if end_date:
        query["$lte"] = parse_to_utc(datetime.fromisoformat(end_date.replace("Z", "+00:00")))
    return query


def default_range() -> tuple[datetime, datetime]:
    end = utc_now()
    start = end - timedelta(days=7)
    return start, end


async def summarize_time(
    *,
    actor: User,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    employee_id: Optional[str] = None,
    project_id: Optional[str] = None,
    task_id: Optional[str] = None,
    client_id: Optional[str] = None,
    source: Optional[str] = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {"company_id": actor.company_id, "voided": {"$ne": True}}
    if actor.role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.LEAD}:
        query["user_id"] = str(actor.id)
    elif employee_id:
        query["user_id"] = employee_id
    if project_id:
        query["project_id"] = project_id
    if task_id:
        query["task_id"] = task_id
    if client_id:
        query["client_id"] = client_id
    if source:
        query["source"] = source

    date_filter = _date_query(start_date, end_date)
    if date_filter:
        query["date"] = date_filter

    logs = await TimeLog.find(query).to_list()

    by_employee: dict[str, float] = {}
    by_task: dict[str, float] = {}
    by_project: dict[str, float] = {}
    by_client: dict[str, float] = {}
    by_source: dict[str, float] = {}
    for log in logs:
        hours = float(log.hours or 0)
        by_employee[log.user_id] = by_employee.get(log.user_id, 0) + hours
        by_task[log.task_id] = by_task.get(log.task_id, 0) + hours
        if log.project_id:
            by_project[log.project_id] = by_project.get(log.project_id, 0) + hours
        if log.client_id:
            by_client[log.client_id] = by_client.get(log.client_id, 0) + hours
        source_key = getattr(log.source, "value", log.source)
        by_source[source_key] = by_source.get(source_key, 0) + hours

    return {
        "total_hours": round(sum(float(log.hours or 0) for log in logs), 4),
        "total_entries": len(logs),
        "by_employee": [{"user_id": key, "hours": round(value, 4)} for key, value in by_employee.items()],
        "by_task": [{"task_id": key, "hours": round(value, 4)} for key, value in by_task.items()],
        "by_project": [{"project_id": key, "hours": round(value, 4)} for key, value in by_project.items()],
        "by_client": [{"client_id": key, "hours": round(value, 4)} for key, value in by_client.items()],
        "by_source": [{"source": key, "hours": round(value, 4)} for key, value in by_source.items()],
        "filters": {
            "start_date": start_date,
            "end_date": end_date,
            "employee_id": employee_id,
            "project_id": project_id,
            "task_id": task_id,
            "client_id": client_id,
            "source": source,
        },
    }


async def project_time_summary(project: Project, actor: User) -> dict[str, Any]:
    return await summarize_time(actor=actor, project_id=str(project.id))


async def task_time_summary(task: Task, actor: User) -> dict[str, Any]:
    return await summarize_time(actor=actor, task_id=str(task.id))
