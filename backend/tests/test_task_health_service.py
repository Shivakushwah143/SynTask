from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models.task import TaskHealthStatus, TaskStatus
from app.services.task_health_service import calculate_performance_metrics, calculate_task_health


def task(**kwargs):
    defaults = {
        "status": TaskStatus.TODO,
        "due_date": None,
        "created_at": datetime(2026, 7, 10, 9, 0, 0),
        "completed_at": None,
        "extension_count": 0,
        "health_status": TaskHealthStatus.HEALTHY,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_calculate_task_health_states():
    now = datetime(2026, 7, 13, 12, 0, 0)

    assert calculate_task_health(task(status=TaskStatus.COMPLETED), now) == TaskHealthStatus.COMPLETED
    assert calculate_task_health(task(due_date=datetime(2026, 7, 13, 18, 0, 0)), now) == TaskHealthStatus.DUE_TODAY
    assert calculate_task_health(task(due_date=datetime(2026, 7, 12, 18, 0, 0)), now) == TaskHealthStatus.OVERDUE
    assert calculate_task_health(task(extension_count=1, due_date=datetime(2026, 7, 12, 18, 0, 0)), now) == TaskHealthStatus.EXTENDED
    assert calculate_task_health(task(due_date=datetime(2026, 7, 14, 18, 0, 0)), now) == TaskHealthStatus.HEALTHY


def test_calculate_performance_metrics():
    created = datetime(2026, 7, 10, 9, 0, 0)
    tasks = [
        task(status=TaskStatus.COMPLETED, created_at=created, due_date=created + timedelta(days=1), completed_at=created + timedelta(hours=4)),
        task(status=TaskStatus.COMPLETED, created_at=created, due_date=created + timedelta(hours=2), completed_at=created + timedelta(hours=4)),
        task(status=TaskStatus.TODO, health_status=TaskHealthStatus.OVERDUE),
        task(status=TaskStatus.IN_PROGRESS, extension_count=1, health_status=TaskHealthStatus.EXTENDED),
    ]

    metrics = calculate_performance_metrics(tasks)

    assert metrics["total_assigned_tasks"] == 4
    assert metrics["completed_tasks"] == 2
    assert metrics["pending_tasks"] == 2
    assert metrics["overdue_tasks"] == 1
    assert metrics["extended_tasks"] == 1
    assert metrics["completion_rate"] == 50
    assert metrics["on_time_completion_rate"] == 50
    assert metrics["late_completion_rate"] == 50
