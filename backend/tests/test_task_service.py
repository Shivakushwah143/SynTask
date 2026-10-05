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
    """Phase 2: update_status now routes through transition_task which requires current_user."""
    from app.services.task_workflow import transition_task
    task = DummyTask(status=TaskStatus.APPROVED, review_required=True,
                     completed_by=None, completed_at=None,
                     reviewer_id="reviewer-1", assigned_to="user-1")
    synced = []
    saved = []

    async def fake_sync_task_health(value):
        synced.append(value.status)
        return value

    async def fake_transition_task(**kwargs):
        # Simulate what transition_task does: set status, save, etc.
        t = kwargs["task"]
        t.status = kwargs.get("target_status") or TaskStatus.COMPLETED
        t.completed_at = datetime(2026, 7, 10, 12, 0, 0)
        t.saved = True
        saved.append(t)
        return t

    monkeypatch.setattr(task_health_service_module, "sync_task_health", fake_sync_task_health)
    # The import is done inside update_status(), so patch the module it imports from
    import app.services.task_workflow as _wf
    monkeypatch.setattr(_wf, "transition_task", fake_transition_task)
    monkeypatch.setattr(asyncio, "create_task", lambda coro: coro.close())

    current_user = SimpleNamespace(id="reviewer-1", role="admin", company_id="company-1")
    updated = asyncio.run(
        TaskService.update_status(task, TaskStatus.COMPLETED, "reviewer-1", current_user=current_user)
    )

    assert updated.status == TaskStatus.COMPLETED
    assert updated.completed_at is not None
    assert updated.saved is True


@pytest.mark.asyncio
async def test_update_status_clears_completion_for_non_terminal_state(monkeypatch):
    """Phase 2: update_status now routes through transition_task which requires current_user."""
    task = DummyTask(status=TaskStatus.APPROVED, completed_at=datetime(2026, 7, 10, 11, 0, 0),
                     assigned_to="user-1", completed_by="user-1")

    async def fake_sync_task_health(value):
        return value

    async def fake_transition_task(**kwargs):
        t = kwargs["task"]
        t.status = kwargs.get("target_status") or TaskStatus.IN_PROGRESS
        t.completed_at = None
        t.saved = True
        return t

    monkeypatch.setattr(task_health_service_module, "sync_task_health", fake_sync_task_health)
    import app.services.task_workflow as _wf2
    monkeypatch.setattr(_wf2, "transition_task", fake_transition_task)
    monkeypatch.setattr(asyncio, "create_task", lambda coro: coro.close())

    current_user = SimpleNamespace(id="user-1", role="admin", company_id="company-1")
    updated = await TaskService.update_status(task, TaskStatus.IN_PROGRESS, "user-1", current_user=current_user)

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
    # Phase 2: checklist is now normalized to structured items by normalize_checklist
    assert len(updated.checklist) == 1
    assert updated.checklist[0]["text"] == "One"
    assert updated.checklist[0]["completed"] is False
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
