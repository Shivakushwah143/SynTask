from __future__ import annotations

import asyncio
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.task import TaskHealthStatus, TaskStatus
from app.services import task_service as task_service_module
from app.services import task_health_service as task_health_service_module
from app.services.task_service import TaskService


class DummyTask:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "task-1")
        self.company_id = kwargs.get("company_id", "company-1")
        self.status = kwargs.get("status", TaskStatus.TODO)
        self.completed_at = kwargs.get("completed_at")
        self.updated_at = kwargs.get("updated_at", datetime(2026, 7, 10, 9, 0, 0))
        self.progress_percentage = kwargs.get("progress_percentage", 0)
        self.expected_completion_time = kwargs.get("expected_completion_time")
        self.checklist = kwargs.get("checklist", [])
        self.dependencies = kwargs.get("dependencies", [])
        self.time_logs = kwargs.get("time_logs", [])
        self.actual_hours = kwargs.get("actual_hours")
        self.priority = kwargs.get("priority", SimpleNamespace(value="medium"))
        self.assigned_to = kwargs.get("assigned_to")
        self.due_date = kwargs.get("due_date")
        self.health_status = kwargs.get("health_status", TaskHealthStatus.HEALTHY)
        self.saved = False

    async def save(self):
        self.saved = True
        return self


def test_update_status_marks_completion_and_refreshes_health(monkeypatch):
    task = DummyTask(status=TaskStatus.IN_PROGRESS)
    synced = []

    async def fake_sync_task_health(value):
        synced.append(value.status)
        return value

    async def fake_trigger_automation(*args, **kwargs):
        return None

    monkeypatch.setattr(task_health_service_module, "sync_task_health", fake_sync_task_health)
    monkeypatch.setattr(task_service_module, "trigger_automation", fake_trigger_automation)
    monkeypatch.setattr(asyncio, "create_task", lambda coro: coro.close())

    async def runner():
        return await TaskService.update_status(task, TaskStatus.COMPLETED, "user-1")

    updated = asyncio.run(runner())

    assert updated.status == TaskStatus.COMPLETED
    assert updated.completed_at is not None
    assert updated.saved is True
    assert synced == [TaskStatus.COMPLETED]


@pytest.mark.asyncio
async def test_update_status_clears_completion_for_non_terminal_state(monkeypatch):
    task = DummyTask(status=TaskStatus.COMPLETED, completed_at=datetime(2026, 7, 10, 11, 0, 0))

    async def fake_sync_task_health(value):
        return value

    async def fake_trigger_automation(*args, **kwargs):
        return None

    monkeypatch.setattr(task_health_service_module, "sync_task_health", fake_sync_task_health)
    monkeypatch.setattr(task_service_module, "trigger_automation", fake_trigger_automation)
    monkeypatch.setattr(asyncio, "create_task", lambda coro: coro.close())

    updated = await TaskService.update_status(task, TaskStatus.IN_PROGRESS, "user-1")

    assert updated.status == TaskStatus.IN_PROGRESS
    assert updated.completed_at is None
    assert updated.saved is True


@pytest.mark.asyncio
async def test_update_execution_persists_related_fields():
    task = DummyTask()

    updated = await TaskService.update_execution(
        task,
        {
            "progress_percentage": 45,
            "expected_completion_time": datetime(2026, 7, 20, 12, 0, 0),
            "checklist": [{"title": "One"}],
            "dependencies": ["a", " ", 2],
            "time_log_hours": 2.5,
            "time_log_note": "worked on it",
        },
    )

    assert updated.progress_percentage == 45
    assert updated.expected_completion_time == datetime(2026, 7, 20, 12, 0, 0)
    assert updated.checklist == [{"title": "One"}]
    assert updated.dependencies == ["a", "2"]
    assert updated.actual_hours == 2.5
    assert len(updated.time_logs) == 1
    assert updated.saved is True


@pytest.mark.asyncio
async def test_update_execution_rejects_invalid_progress():
    task = DummyTask()

    with pytest.raises(HTTPException) as exc_info:
        await TaskService.update_execution(task, {"progress_percentage": 120})

    assert exc_info.value.status_code == 400


def test_workload_snapshot_counts_real_task_state():
    tasks = [
        DummyTask(status=TaskStatus.TODO, priority=SimpleNamespace(value="low"), assigned_to="u1"),
        DummyTask(status=TaskStatus.IN_PROGRESS, priority=SimpleNamespace(value="high"), assigned_to="u1"),
        DummyTask(status=TaskStatus.COMPLETED, priority=SimpleNamespace(value="medium"), assigned_to=None),
    ]
    tasks[0].due_date = datetime(2026, 7, 9, 9, 0, 0)
    tasks[1].due_date = datetime(2026, 7, 9, 9, 0, 0)
    tasks[2].due_date = datetime(2026, 7, 9, 9, 0, 0)

    snapshot = TaskService.workload_snapshot(tasks)

    assert snapshot["total"] == 3
    assert snapshot["by_status"]["todo"] == 1
    assert snapshot["by_status"]["in_progress"] == 1
    assert snapshot["by_status"]["completed"] == 1
    assert snapshot["by_priority"]["low"] == 1
    assert snapshot["by_assignee"]["u1"] == 2
    assert snapshot["overdue"] == 2
