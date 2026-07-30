"""
Task health, extension workflow, and performance summaries.
"""
from __future__ import annotations

from datetime import datetime, time
from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException, status

from app.models.task import Task, TaskExtensionRequest, TaskExtensionStatus, TaskHealthStatus, TaskStatus
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole, UserStatus
from app.core.clock import parse_to_utc, utc_now
from app.services.timeline_service import create_timeline_event


MANAGER_ROLES = {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}


def _task_status_value(task: Task) -> str:
    return task.status.value if hasattr(task.status, "value") else str(task.status)


def _health_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value or TaskHealthStatus.HEALTHY.value)


def calculate_task_health(task: Task, now: Optional[datetime] = None) -> TaskHealthStatus:
    now = now or utc_now()
    if task.status == TaskStatus.COMPLETED:
        return TaskHealthStatus.COMPLETED
    if int(getattr(task, "extension_count", 0) or 0) > 0:
        return TaskHealthStatus.EXTENDED
    if not task.due_date:
        return TaskHealthStatus.HEALTHY
    due_day = task.due_date.date()
    today = now.date()
    if due_day < today:
        return TaskHealthStatus.OVERDUE
    if due_day == today:
        return TaskHealthStatus.DUE_TODAY
    return TaskHealthStatus.HEALTHY


def _as_naive(value: datetime) -> datetime:
    return parse_to_utc(value) or value


async def sync_task_health(task: Task, now: Optional[datetime] = None) -> Task:
    now = now or utc_now()
    previous = _health_value(getattr(task, "health_status", None))
    next_health = calculate_task_health(task, now)
    if previous != next_health.value:
        task.health_status = next_health
        task.health_updated_at = now
        task.updated_at = now
        await task.save()

    if task.assigned_to and task.due_date and task.status != TaskStatus.COMPLETED:
        if next_health == TaskHealthStatus.DUE_TODAY:
            await _record_task_event(
                task,
                TimelineEventType.TASK_DUE_TODAY,
                "Task Due Today",
                timestamp=datetime.combine(task.due_date.date(), time.min),
                idempotency_key=f"task:{task.id}:due_today:{task.due_date.date().isoformat()}",
            )
        elif next_health == TaskHealthStatus.OVERDUE:
            await _record_task_event(
                task,
                TimelineEventType.TASK_OVERDUE,
                "Task Became Overdue",
                timestamp=datetime.combine(task.due_date.date(), time.max),
                idempotency_key=f"task:{task.id}:overdue:{task.due_date.date().isoformat()}",
            )
    return task


async def sync_task_health_for_company(company_id: Optional[str] = None) -> int:
    query: Dict[str, Any] = {"status": {"$ne": TaskStatus.COMPLETED.value}}
    if company_id:
        query["company_id"] = company_id
    tasks = await Task.find(query).to_list()
    for task in tasks:
        await sync_task_health(task)
    return len(tasks)


async def assert_task_view_access(current_user: User, task: Task) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if current_user.company_id != task.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        if task.assigned_to and await _user_in_scope(current_user, task.assigned_to):
            return
        if task.created_by == str(current_user.id):
            return
    if task.assigned_to == str(current_user.id) or task.created_by == str(current_user.id):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def assert_task_manage_access(current_user: User, task: Task) -> None:
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or Admin access required")
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if current_user.company_id != task.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return
    if task.assigned_to and await _user_in_scope(current_user, task.assigned_to):
        return
    if task.created_by == str(current_user.id):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def create_extension_request(task: Task, employee: User, requested_due_date: datetime, reason: str) -> TaskExtensionRequest:
    await assert_task_view_access(employee, task)
    if task.assigned_to != str(employee.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only assigned employee can request an extension")
    if task.status == TaskStatus.COMPLETED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot request extension after task completion")
    if not task.due_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task must have a current due date")
    requested_due_date = _as_naive(requested_due_date)
    current_due_date = _as_naive(task.due_date)
    if requested_due_date <= current_due_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Requested date must be later than current due date")
    existing = await TaskExtensionRequest.find_one(
        TaskExtensionRequest.task_id == str(task.id),
        TaskExtensionRequest.status == TaskExtensionStatus.PENDING,
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Active extension request already exists")

    request = TaskExtensionRequest(
        task_id=str(task.id),
        company_id=task.company_id,
        employee_id=str(employee.id),
        current_due_date=current_due_date,
        requested_due_date=requested_due_date,
        reason=reason.strip(),
    )
    await request.insert()
    await _record_task_event(
        task,
        TimelineEventType.TASK_EXTENSION_REQUESTED,
        "Extension Requested",
        actor_id=str(employee.id),
        metadata={"requested_due_date": requested_due_date.isoformat(), "reason": reason.strip()},
        idempotency_key=f"task:{task.id}:extension:{request.id}:requested",
    )
    return request


async def review_extension_request(request: TaskExtensionRequest, reviewer: User, approved: bool, comment: Optional[str] = None) -> TaskExtensionRequest:
    task = await Task.get(request.task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await assert_task_manage_access(reviewer, task)
    if task.status == TaskStatus.COMPLETED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot review extension for a completed task")
    if request.status != TaskExtensionStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Extension request already reviewed")

    now = utc_now()
    request.status = TaskExtensionStatus.APPROVED if approved else TaskExtensionStatus.REJECTED
    request.reviewed_by = str(reviewer.id)
    request.reviewed_at = now
    request.review_comment = comment
    request.updated_at = now
    await request.save()

    if approved:
        task.due_date = request.requested_due_date
        task.extension_count = int(getattr(task, "extension_count", 0) or 0) + 1
        task.health_status = TaskHealthStatus.EXTENDED
        task.health_updated_at = now
        task.updated_at = now
        await task.save()
        event_type = TimelineEventType.TASK_EXTENSION_APPROVED
        title = "Extension Approved"
    else:
        await sync_task_health(task, now)
        event_type = TimelineEventType.TASK_EXTENSION_REJECTED
        title = "Extension Rejected"

    await _record_task_event(
        task,
        event_type,
        title,
        actor_id=str(reviewer.id),
        metadata={
            "extension_request_id": str(request.id),
            "requested_due_date": request.requested_due_date.isoformat(),
            "review_comment": comment,
        },
        idempotency_key=f"task:{task.id}:extension:{request.id}:{request.status.value}",
    )
    return request


async def build_employee_task_summary(employee: User) -> Dict[str, Any]:
    tasks = await _visible_tasks_for_user(employee)
    await _sync_many(tasks)
    own_requests = await TaskExtensionRequest.find(
        TaskExtensionRequest.company_id == employee.company_id,
        TaskExtensionRequest.employee_id == str(employee.id),
    ).to_list()
    return {
        "employee_id": str(employee.id),
        "employee_name": employee.full_name(),
        **calculate_performance_metrics(tasks),
        "extension_requests": _extension_status_counts(own_requests),
    }


async def build_task_health_summary(current_user: User) -> Dict[str, Any]:
    tasks = await _visible_tasks_for_user(current_user)
    await _sync_many(tasks)
    counts = _health_counts(tasks)
    return {"summary": counts, "total": len(tasks)}


async def build_team_completion_summary(current_user: User) -> Dict[str, Any]:
    employees = await visible_employees(current_user)
    rows = []
    for employee in employees:
        tasks = await Task.find(Task.company_id == employee.company_id, Task.assigned_to == str(employee.id)).to_list()
        await _sync_many(tasks)
        rows.append({
            "employee_id": str(employee.id),
            "employee_name": employee.full_name(),
            **calculate_performance_metrics(tasks),
        })
    return {"employees": rows}


async def build_overdue_task_summary(current_user: User) -> Dict[str, Any]:
    tasks = await _visible_tasks_for_user(current_user)
    await _sync_many(tasks)
    overdue = [task for task in tasks if _health_value(getattr(task, "health_status", None)) == TaskHealthStatus.OVERDUE.value]
    return {"total": len(overdue), "tasks": [serialize_task_health(task) for task in overdue]}


async def build_extension_request_summary(current_user: User) -> Dict[str, Any]:
    query: Dict[str, Any] = {}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    if current_user.role == UserRole.EMPLOYEE:
        query["employee_id"] = str(current_user.id)
    elif current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        employee_ids = [str(current_user.id), *[str(item.id) for item in await current_user.get_all_subordinates()]]
        query["employee_id"] = {"$in": employee_ids}
    requests = await TaskExtensionRequest.find(query).sort("-created_at").to_list()
    return {"summary": _extension_status_counts(requests), "requests": [serialize_extension_request(item) for item in requests]}


async def visible_employees(current_user: User) -> list[User]:
    if current_user.role == UserRole.SUPER_ADMIN:
        return await User.find(User.role != UserRole.SUPER_ADMIN, User.status == UserStatus.ACTIVE).to_list()
    if not current_user.company_id:
        return []
    if current_user.role == UserRole.EMPLOYEE:
        return [current_user]
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return await User.find(User.company_id == current_user.company_id, User.status == UserStatus.ACTIVE).to_list()
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        return [current_user, *(await current_user.get_all_subordinates())]
    return [current_user]


def calculate_performance_metrics(tasks: Iterable[Task]) -> Dict[str, Any]:
    task_list = list(tasks)
    total = len(task_list)
    completed = [task for task in task_list if task.status == TaskStatus.COMPLETED]
    pending = [task for task in task_list if task.status != TaskStatus.COMPLETED]
    overdue = [task for task in task_list if _health_value(getattr(task, "health_status", None)) == TaskHealthStatus.OVERDUE.value]
    extended = [task for task in task_list if int(getattr(task, "extension_count", 0) or 0) > 0]
    completion_seconds = [
        (task.completed_at - task.created_at).total_seconds()
        for task in completed
        if task.completed_at and task.created_at
    ]
    on_time = [task for task in completed if not task.due_date or (task.completed_at and task.completed_at <= task.due_date)]
    late = [task for task in completed if task.due_date and task.completed_at and task.completed_at > task.due_date]
    return {
        "total_assigned_tasks": total,
        "completed_tasks": len(completed),
        "pending_tasks": len(pending),
        "overdue_tasks": len(overdue),
        "extended_tasks": len(extended),
        "average_completion_seconds": round(sum(completion_seconds) / len(completion_seconds), 2) if completion_seconds else 0,
        "completion_rate": _percent(len(completed), total),
        "on_time_completion_rate": _percent(len(on_time), len(completed)),
        "late_completion_rate": _percent(len(late), len(completed)),
    }


def serialize_task_health(task: Task) -> Dict[str, Any]:
    return {
        "id": str(task.id),
        "title": task.title,
        "assigned_to": task.assigned_to,
        "status": _task_status_value(task),
        "health_status": _health_value(getattr(task, "health_status", None)),
        "due_date": task.due_date,
        "completed_at": task.completed_at,
        "extension_count": int(getattr(task, "extension_count", 0) or 0),
    }


def serialize_extension_request(request: TaskExtensionRequest) -> Dict[str, Any]:
    return {
        "id": str(request.id),
        "task_id": request.task_id,
        "employee_id": request.employee_id,
        "current_due_date": request.current_due_date,
        "requested_due_date": request.requested_due_date,
        "reason": request.reason,
        "status": request.status.value,
        "reviewed_by": request.reviewed_by,
        "reviewed_at": request.reviewed_at,
        "review_comment": request.review_comment,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
    }


async def _visible_tasks_for_user(current_user: User) -> list[Task]:
    query: Dict[str, Any] = {}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    if current_user.role == UserRole.EMPLOYEE:
        query["assigned_to"] = str(current_user.id)
    elif current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        ids = [str(current_user.id), *[str(item.id) for item in await current_user.get_all_subordinates()]]
        query["assigned_to"] = {"$in": ids}
    return await Task.find(query).to_list()


async def _sync_many(tasks: Iterable[Task]) -> None:
    for task in tasks:
        await sync_task_health(task)


def _health_counts(tasks: Iterable[Task]) -> Dict[str, int]:
    counts = {item.value: 0 for item in TaskHealthStatus}
    for task in tasks:
        counts[_health_value(getattr(task, "health_status", None))] = counts.get(_health_value(getattr(task, "health_status", None)), 0) + 1
    return counts


def _extension_status_counts(requests: Iterable[TaskExtensionRequest]) -> Dict[str, int]:
    counts = {item.value: 0 for item in TaskExtensionStatus}
    for request in requests:
        key = request.status.value if hasattr(request.status, "value") else str(request.status)
        counts[key] = counts.get(key, 0) + 1
    return counts


def _percent(part: int, total: int) -> float:
    return round((part / total) * 100, 2) if total else 0.0


async def _user_in_scope(manager: User, user_id: str) -> bool:
    if user_id == str(manager.id):
        return True
    user = await User.get(user_id)
    if not user:
        return False
    return user.reports_to == str(manager.id) or str(manager.id) in (user.ancestors or [])


async def _record_task_event(
    task: Task,
    event_type: TimelineEventType,
    title: str,
    *,
    actor_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
    metadata: Optional[Dict[str, Any]] = None,
    idempotency_key: str,
) -> None:
    await create_timeline_event(
        user_id=task.assigned_to or task.created_by,
        company_id=task.company_id,
        event_type=event_type,
        title=title,
        description=task.title,
        related_module=TimelineModule.TASK,
        related_record_id=str(task.id),
        actor_id=actor_id,
        timestamp=timestamp,
        metadata={"task_title": task.title, "project_id": task.project_id, **(metadata or {})},
        idempotency_key=idempotency_key,
    )
