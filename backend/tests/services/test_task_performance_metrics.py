from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.models.leave import LeaveStatus
from app.models.task import TaskStatus
from app.services.task_performance_metrics import METRIC_DEFINITIONS, MetricStatus, TaskPerformanceMetricService


def task(task_id: str, **overrides):
    data = {
        "id": task_id,
        "company_id": "tenant-1",
        "assigned_to": "user-1",
        "status": TaskStatus.TODO,
        "due_date": None,
        "start_date": None,
        "completed_at": None,
        "estimated_hours": None,
        "actual_hours": None,
        "story_points": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def service(now: datetime | None = None):
    return TaskPerformanceMetricService(
        tenant_id="tenant-1",
        authorized_user_ids=["user-1", "user-2"],
        generated_at=now or datetime(2026, 7, 21, tzinfo=UTC),
    )


def test_metric_dictionary_marks_history_dependent_metrics_unavailable():
    unavailable = {
        key
        for key, definition in METRIC_DEFINITIONS.items()
        if definition.availability == MetricStatus.UNAVAILABLE
    }

    assert {
        "blocked_task_rate",
        "estimate_variance_story_points",
        "eod_completion_rate",
        "dependency_delay_rate",
        "reopen_rework_rate",
        "scope_change_impact",
    }.issubset(unavailable)


def test_completion_on_time_and_overdue_metrics_are_deterministic():
    tasks = [
        task("done-1", status=TaskStatus.COMPLETED, due_date=datetime(2026, 7, 10, tzinfo=UTC), completed_at=datetime(2026, 7, 9, tzinfo=UTC)),
        task("done-2", status=TaskStatus.COMPLETED, due_date=datetime(2026, 7, 10, tzinfo=UTC), completed_at=datetime(2026, 7, 12, tzinfo=UTC)),
        task("todo-1", status=TaskStatus.TODO, due_date=datetime(2026, 7, 20, tzinfo=UTC)),
        task("cancelled", status=TaskStatus.CANCELLED, due_date=datetime(2026, 7, 1, tzinfo=UTC)),
        task("other-tenant", company_id="tenant-2", status=TaskStatus.COMPLETED),
    ]

    result = service().calculate(
        ["task_completion_rate", "task_on_time_completion_rate", "task_overdue_rate"],
        tasks=tasks,
    )

    assert result["task_completion_rate"].value == 2 / 3
    assert result["task_on_time_completion_rate"].value == 1 / 2
    assert result["task_overdue_rate"].value == 1
    assert result["task_completion_rate"].excluded_record_count == 1


def test_workload_and_estimate_metrics_do_not_convert_missing_values_to_zero():
    result = service().calculate(
        ["workload_count", "workload_effort_hours", "workload_effort_story_points", "estimate_variance_hours"],
        tasks=[
            task("a", status=TaskStatus.TODO, estimated_hours=5, story_points=3, actual_hours=7),
            task("b", status=TaskStatus.IN_PROGRESS, estimated_hours=None, story_points=None, actual_hours=None),
            task("c", status=TaskStatus.COMPLETED, estimated_hours=2, story_points=1, actual_hours=4),
        ],
    )

    assert result["workload_count"].value == 2
    assert result["workload_effort_hours"].value == 5
    assert result["workload_effort_story_points"].value == 3
    assert result["estimate_variance_hours"].value == 2
    assert "estimated_hours" in result["workload_effort_hours"].missing_fields


def test_eod_consistency_labels_conflicts_without_overriding_task_truth():
    eod = SimpleNamespace(
        id="eod-1",
        company_id="tenant-1",
        employee_id="user-1",
        completed_task_ids=["done", "still-open", "missing"],
        in_progress_task_ids=["doing"],
    )
    result = service().calculate(
        ["task_eod_consistency"],
        tasks=[
            task("done", status=TaskStatus.COMPLETED),
            task("still-open", status=TaskStatus.TODO),
            task("doing", status=TaskStatus.IN_PROGRESS),
        ],
        eod_reports=[eod],
    )["task_eod_consistency"]

    assert result.value == 2 / 4
    assert result.conflicts == ["still-open"]
    assert "completed_task_ids" in result.missing_fields
    assert any("employee-reported" in warning for warning in result.warnings)


def test_approved_leave_days_are_context_not_negative_performance():
    leave = SimpleNamespace(
        company_id="tenant-1",
        employee_id="user-1",
        status=LeaveStatus.APPROVED,
        start_date=datetime(2026, 7, 20, tzinfo=UTC),
        end_date=datetime(2026, 7, 21, tzinfo=UTC),
        reason="private",
    )

    assert service().approved_leave_days([leave]) == {
        ("user-1", datetime(2026, 7, 20, tzinfo=UTC).date()),
        ("user-1", datetime(2026, 7, 21, tzinfo=UTC).date()),
    }

