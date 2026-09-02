from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

from app.core.clock import utc_now
from app.models.project import ProjectStatus
from app.models.task import TaskPriority, TaskStatus
from app.services.project_health_service import calculate_project_health
from app.services.project_workflow import PROJECT_ALLOWED_TRANSITIONS


def task(status=TaskStatus.TODO, priority=TaskPriority.MEDIUM, due_date=None, updated_at=None):
    return SimpleNamespace(status=status, priority=priority, due_date=due_date, updated_at=updated_at or utc_now())


def project(status=ProjectStatus.EXECUTION, delivery_date=None, updated_at=None):
    return SimpleNamespace(status=status, delivery_date=delivery_date, updated_at=updated_at or utc_now())


def test_cancelled_project_status_is_terminal():
    assert ProjectStatus.CANCELLED in PROJECT_ALLOWED_TRANSITIONS[ProjectStatus.EXECUTION]
    assert PROJECT_ALLOWED_TRANSITIONS[ProjectStatus.CANCELLED] == set()


def test_project_health_healthy_project():
    health = calculate_project_health(project(), [task(TaskStatus.COMPLETED), task(TaskStatus.TODO)])
    assert health.level == "healthy"
    assert health.completion_percentage == 50.0


def test_project_health_overdue_deadline_at_risk():
    health = calculate_project_health(project(delivery_date=utc_now() - timedelta(days=1)), [])
    assert health.level == "at_risk"
    assert "Project deadline has passed" in health.reasons


def test_project_health_critical_overdue_task_at_risk():
    health = calculate_project_health(project(), [task(priority=TaskPriority.CRITICAL, due_date=utc_now() - timedelta(days=1))])
    assert health.level == "at_risk"


def test_project_health_overdue_task_needs_attention():
    health = calculate_project_health(
        project(),
        [
            task(due_date=utc_now() - timedelta(days=1)),
            task(TaskStatus.TODO),
            task(TaskStatus.TODO),
            task(TaskStatus.TODO),
        ],
    )
    assert health.level == "needs_attention"


def test_project_health_upcoming_deadline_low_progress_needs_attention():
    health = calculate_project_health(project(delivery_date=utc_now() + timedelta(days=3)), [task(TaskStatus.TODO)])
    assert health.level == "needs_attention"
    assert health.deadline_urgency == "soon"
