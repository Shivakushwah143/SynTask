from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable, Optional

from app.core.clock import utc_now
from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskPriority, TaskStatus
from app.services.project_workflow import PROJECT_ACTIVE_EXECUTION_STATUSES, PROJECT_TERMINAL_STATUSES


OVERDUE_TASK_AT_RISK_RATIO = 0.30
DEADLINE_ATTENTION_DAYS = 7
DEADLINE_ATTENTION_COMPLETION_THRESHOLD = 80.0
INACTIVE_ATTENTION_DAYS = 7


@dataclass(frozen=True)
class ProjectHealth:
    level: str
    reasons: list[str]
    overdue_task_count: int
    total_open_tasks: int
    completion_percentage: float
    days_until_deadline: Optional[int]
    last_activity_at: Optional[datetime]
    completed_task_count: int
    eligible_task_count: int
    deadline_urgency: str


def _value(value) -> str:
    return getattr(value, "value", value)


def project_task_identity_filter(project: Project) -> dict:
    project_ids = [str(project.id)]
    if getattr(project, "project_id", None):
        project_ids.append(str(project.project_id))
    return {
        "company_id": str(project.company_id),
        "$or": [
            {"project_id": {"$in": project_ids}},
            {"project_object_id": str(project.id)},
        ],
    }


def calculate_project_progress(tasks: Iterable[Task]) -> tuple[float, int, int]:
    task_list = list(tasks)
    eligible = [task for task in task_list if _value(getattr(task, "status", None)) != TaskStatus.CANCELLED.value]
    if not eligible:
        return 0.0, 0, 0
    completed = [task for task in eligible if _value(getattr(task, "status", None)) == TaskStatus.COMPLETED.value]
    return round((len(completed) / len(eligible)) * 100, 1), len(completed), len(eligible)


def deadline_urgency_for(project: Project, now: Optional[datetime] = None) -> tuple[str, Optional[int]]:
    if not getattr(project, "delivery_date", None):
        return "none", None
    now = now or utc_now()
    days_until = (project.delivery_date - now).days
    if days_until < 0:
        return "overdue", days_until
    if days_until <= 2:
        return "urgent", days_until
    if days_until <= 7:
        return "soon", days_until
    if days_until <= 14:
        return "upcoming", days_until
    return "normal", days_until


def calculate_project_health(project: Project, tasks: Iterable[Task], now: Optional[datetime] = None) -> ProjectHealth:
    now = now or utc_now()
    task_list = list(tasks)
    progress, completed_count, eligible_count = calculate_project_progress(task_list)
    open_tasks = [task for task in task_list if _value(getattr(task, "status", None)) not in {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value}]
    overdue_tasks = [task for task in open_tasks if getattr(task, "due_date", None) and task.due_date < now]
    overdue_critical_tasks = [
        task for task in overdue_tasks
        if _value(getattr(task, "priority", None)) == TaskPriority.CRITICAL.value
    ]
    latest_task_update = max((getattr(task, "updated_at", None) for task in task_list if getattr(task, "updated_at", None)), default=None)
    last_activity_at = max([value for value in [getattr(project, "updated_at", None), latest_task_update] if value], default=None)
    urgency, days_until_deadline = deadline_urgency_for(project, now)
    try:
        status = ProjectStatus(_value(getattr(project, "status", ProjectStatus.ACTIVE)).lower())
    except ValueError:
        status = ProjectStatus.ACTIVE
    terminal = status in PROJECT_TERMINAL_STATUSES
    reasons: list[str] = []

    if urgency == "overdue" and not terminal:
        reasons.append("Project deadline has passed")
    if overdue_critical_tasks:
        reasons.append("At least one critical task is overdue")
    if open_tasks and len(overdue_tasks) / len(open_tasks) >= OVERDUE_TASK_AT_RISK_RATIO:
        reasons.append("Thirty percent or more of open tasks are overdue")
    if reasons:
        level = "at_risk"
    else:
        if overdue_tasks:
            reasons.append("At least one task is overdue")
        if days_until_deadline is not None and 0 <= days_until_deadline <= DEADLINE_ATTENTION_DAYS and progress < DEADLINE_ATTENTION_COMPLETION_THRESHOLD and not terminal:
            reasons.append("Deadline is within 7 days and progress is below 80%")
        if status in PROJECT_ACTIVE_EXECUTION_STATUSES and last_activity_at and last_activity_at <= now - timedelta(days=INACTIVE_ATTENTION_DAYS):
            reasons.append("Project activity has been inactive for 7 or more days")
        level = "needs_attention" if reasons else "healthy"

    return ProjectHealth(
        level=level,
        reasons=reasons,
        overdue_task_count=len(overdue_tasks),
        total_open_tasks=len(open_tasks),
        completion_percentage=progress,
        days_until_deadline=days_until_deadline,
        last_activity_at=last_activity_at,
        completed_task_count=completed_count,
        eligible_task_count=eligible_count,
        deadline_urgency=urgency,
    )


async def load_project_tasks(project: Project) -> list[Task]:
    return await Task.find(project_task_identity_filter(project)).to_list()


async def get_project_health(project: Project) -> ProjectHealth:
    return calculate_project_health(project, await load_project_tasks(project))


class ProjectHealthService:
    """Compatibility facade for callers that use class-style service access."""

    @staticmethod
    async def calculate_project_health(project: Project) -> dict:
        return serialize_project_health(await get_project_health(project))

    @staticmethod
    async def calculate_project_progress(project: Project) -> float:
        health = await get_project_health(project)
        return health.completion_percentage

    @staticmethod
    async def get_project_health(project: Project) -> ProjectHealth:
        return await get_project_health(project)


def serialize_project_health(health: ProjectHealth) -> dict:
    return {
        "level": health.level,
        "reasons": health.reasons,
        "overdue_task_count": health.overdue_task_count,
        "total_open_tasks": health.total_open_tasks,
        "completion_percentage": health.completion_percentage,
        "days_until_deadline": health.days_until_deadline,
        "last_activity_at": health.last_activity_at,
        "completed_task_count": health.completed_task_count,
        "eligible_task_count": health.eligible_task_count,
        "deadline_urgency": health.deadline_urgency,
    }
