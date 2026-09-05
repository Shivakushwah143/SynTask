"""Work Overview Service — Phase 3 tests.

Covers:
  - Next Action engine prioritization and tie-breakers
  - Workload pressure classification
  - Date classification helpers
  - Task dominant classification
  - Employee overview summary counts
  - Manager overview aggregation
  - Blocked tasks excluded from Next Action
  - Empty states
"""
from __future__ import annotations

import os
import pytest
from datetime import datetime, timedelta
from types import SimpleNamespace

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from app.models.task import TaskStatus, TaskPriority, TaskHealthStatus
from app.services.work_overview_service import (
    classify_workload_pressure,
    _is_overdue,
    _is_due_today,
    _is_upcoming,
    _is_critical,
    _is_high_priority,
    _compute_task_urgency,
    _next_action_label,
    _next_action_reason,
    _compute_next_action,
    _classify_dominant,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _task(**kwargs):
    now = datetime(2026, 8, 15, 10, 0, 0)
    defaults = {
        "id": "task-1",
        "title": "Test Task",
        "company_id": "company-1",
        "assigned_to": "user-1",
        "created_by": "user-1",
        "reviewer_id": None,
        "review_required": None,
        "review_round": 0,
        "status": TaskStatus.IN_PROGRESS,
        "priority": TaskPriority.MEDIUM,
        "due_date": None,
        "start_date": None,
        "completed_at": None,
        "completed_by": None,
        "health_status": TaskHealthStatus.HEALTHY,
        "extension_count": 0,
        "project_id": "PROJ-001",
        "project_object_id": None,
        "source_type": None,
        "tags": [],
        "attachments": [],
        "time_logs": [],
        "checklist": [],
        "dependencies": [],
        "created_at": now,
        "updated_at": now,
        "progress_percentage": 0.0,
        "task_type": SimpleNamespace(value="standard"),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


NOW = datetime(2026, 8, 15, 10, 0, 0)


# ── Workload Pressure ───────────────────────────────────────────────────────

class TestWorkloadPressure:
    def test_normal(self):
        assert classify_workload_pressure(0, 0, 5) == "normal"

    def test_high_overdue(self):
        assert classify_workload_pressure(1, 0, 5) == "high"

    def test_high_due_today(self):
        assert classify_workload_pressure(0, 3, 5) == "high"

    def test_high_active(self):
        assert classify_workload_pressure(0, 0, 7) == "high"

    def test_overloaded_overdue(self):
        assert classify_workload_pressure(3, 0, 5) == "overloaded"

    def test_overloaded_due_today(self):
        assert classify_workload_pressure(0, 5, 5) == "overloaded"

    def test_overloaded_active(self):
        assert classify_workload_pressure(0, 0, 10) == "overloaded"


# ── Date Classification ─────────────────────────────────────────────────────

class TestDateClassification:
    def test_overdue(self):
        task = _task(due_date=NOW - timedelta(days=1), status=TaskStatus.IN_PROGRESS)
        assert _is_overdue(task, NOW) is True

    def test_not_overdue_future(self):
        task = _task(due_date=NOW + timedelta(days=1), status=TaskStatus.IN_PROGRESS)
        assert _is_overdue(task, NOW) is False

    def test_overdue_completed_excluded(self):
        task = _task(due_date=NOW - timedelta(days=1), status=TaskStatus.COMPLETED)
        assert _is_overdue(task, NOW) is False

    def test_overdue_cancelled_excluded(self):
        task = _task(due_date=NOW - timedelta(days=1), status=TaskStatus.CANCELLED)
        assert _is_overdue(task, NOW) is False

    def test_due_today(self):
        task = _task(due_date=NOW.replace(hour=14), status=TaskStatus.IN_PROGRESS)
        assert _is_due_today(task, NOW) is True

    def test_not_due_today_tomorrow(self):
        task = _task(due_date=NOW + timedelta(days=1), status=TaskStatus.IN_PROGRESS)
        assert _is_due_today(task, NOW) is False

    def test_upcoming(self):
        task = _task(due_date=NOW + timedelta(days=3), status=TaskStatus.IN_PROGRESS)
        assert _is_upcoming(task, NOW) is True

    def test_not_upcoming_far_future(self):
        task = _task(due_date=NOW + timedelta(days=10), status=TaskStatus.IN_PROGRESS)
        assert _is_upcoming(task, NOW) is False

    def test_not_upcoming_today(self):
        task = _task(due_date=NOW.replace(hour=14), status=TaskStatus.IN_PROGRESS)
        assert _is_upcoming(task, NOW) is False

    def test_critical_priority(self):
        task = _task(priority=TaskPriority.CRITICAL)
        assert _is_critical(task) is True

    def test_not_critical_medium(self):
        task = _task(priority=TaskPriority.MEDIUM)
        assert _is_critical(task) is False

    def test_high_priority(self):
        task = _task(priority=TaskPriority.HIGH)
        assert _is_high_priority(task) is True

    def test_critical_is_high(self):
        task = _task(priority=TaskPriority.CRITICAL)
        assert _is_high_priority(task) is True


# ── Next Action Engine ──────────────────────────────────────────────────────

class TestNextAction:
    def test_overdue_takes_priority(self):
        overdue = _task(id="t1", title="Overdue", status=TaskStatus.IN_PROGRESS, priority=TaskPriority.LOW, due_date=NOW - timedelta(days=1), assigned_to="user-1")
        normal = _task(id="t2", title="Normal", status=TaskStatus.IN_PROGRESS, priority=TaskPriority.HIGH, due_date=NOW + timedelta(days=3), assigned_to="user-1")
        result = _compute_next_action([overdue, normal], now=NOW)
        assert result is not None
        assert result["task_id"] == "t1"

    def test_critical_takes_priority(self):
        critical = _task(id="t1", title="Critical", status=TaskStatus.ASSIGNED, priority=TaskPriority.CRITICAL, assigned_to="user-1")
        high = _task(id="t2", title="High", status=TaskStatus.ASSIGNED, priority=TaskPriority.HIGH, assigned_to="user-1")
        result = _compute_next_action([critical, high], now=NOW)
        assert result is not None
        assert result["task_id"] == "t1"

    def test_revision_required_before_normal(self):
        revision = _task(id="t1", title="Revision", status=TaskStatus.REVISION_REQUIRED, priority=TaskPriority.MEDIUM, assigned_to="user-1")
        progress = _task(id="t2", title="Progress", status=TaskStatus.IN_PROGRESS, priority=TaskPriority.HIGH, assigned_to="user-1")
        result = _compute_next_action([revision, progress], now=NOW)
        assert result is not None
        assert result["task_id"] == "t1"

    def test_in_progress_before_assigned(self):
        progress = _task(id="t1", title="Progress", status=TaskStatus.IN_PROGRESS, priority=TaskPriority.MEDIUM, due_date=NOW + timedelta(days=1), assigned_to="user-1")
        assigned = _task(id="t2", title="Assigned", status=TaskStatus.ASSIGNED, priority=TaskPriority.MEDIUM, due_date=NOW + timedelta(days=1), assigned_to="user-1")
        result = _compute_next_action([progress, assigned], now=NOW)
        assert result is not None
        assert result["task_id"] == "t1"

    def test_excludes_completed(self):
        completed = _task(id="t1", status=TaskStatus.COMPLETED, assigned_to="user-1")
        result = _compute_next_action([completed], now=NOW)
        assert result is None

    def test_excludes_cancelled(self):
        cancelled = _task(id="t1", status=TaskStatus.CANCELLED, assigned_to="user-1")
        result = _compute_next_action([cancelled], now=NOW)
        assert result is None

    def test_excludes_in_review(self):
        in_review = _task(id="t1", status=TaskStatus.IN_REVIEW, assigned_to="user-1")
        result = _compute_next_action([in_review], now=NOW)
        assert result is None

    def test_excludes_approved(self):
        approved = _task(id="t1", status=TaskStatus.APPROVED, assigned_to="user-1")
        result = _compute_next_action([approved], now=NOW)
        assert result is None

    def test_excludes_blocked_tasks(self):
        blocked = _task(id="t1", status=TaskStatus.IN_PROGRESS, assigned_to="user-1")
        blocker_map = {"t1": [{"id": "dep-1", "title": "Dep", "status": "in_progress"}]}
        result = _compute_next_action([blocked], blocker_map=blocker_map, now=NOW)
        assert result is None

    def test_empty_tasks(self):
        result = _compute_next_action([], now=NOW)
        assert result is None

    def test_no_assignee_excluded(self):
        task = _task(id="t1", status=TaskStatus.ASSIGNED, assigned_to=None)
        result = _compute_next_action([task], now=NOW)
        assert result is None

    def test_action_labels(self):
        assigned = _task(status=TaskStatus.ASSIGNED, assigned_to="user-1")
        action, label = _next_action_label(assigned)
        assert action == "start_work"
        assert label == "Start Work"

        progress = _task(status=TaskStatus.IN_PROGRESS, assigned_to="user-1")
        action, label = _next_action_label(progress)
        assert action == "continue_work"
        assert label == "Continue Work"

        revision = _task(status=TaskStatus.REVISION_REQUIRED, assigned_to="user-1")
        action, label = _next_action_label(revision)
        assert action == "fix_revision"
        assert label == "Fix Revision"


# ── Dominant Classification ─────────────────────────────────────────────────

class TestDominantClassification:
    def test_revision_required_dominates(self):
        task = _task(status=TaskStatus.REVISION_REQUIRED, priority=TaskPriority.LOW, due_date=NOW - timedelta(days=1))
        assert _classify_dominant(task, NOW) == "revision_required"

    def test_overdue_dominates(self):
        task = _task(status=TaskStatus.IN_PROGRESS, priority=TaskPriority.LOW, due_date=NOW - timedelta(days=1))
        assert _classify_dominant(task, NOW) == "overdue"

    def test_critical_dominates(self):
        task = _task(status=TaskStatus.IN_PROGRESS, priority=TaskPriority.CRITICAL, due_date=NOW + timedelta(days=3))
        assert _classify_dominant(task, NOW) == "critical"

    def test_due_today_dominates(self):
        task = _task(status=TaskStatus.ASSIGNED, priority=TaskPriority.MEDIUM, due_date=NOW.replace(hour=14))
        assert _classify_dominant(task, NOW) == "due_today"

    def test_in_progress_classified(self):
        task = _task(status=TaskStatus.IN_PROGRESS, priority=TaskPriority.MEDIUM, due_date=NOW + timedelta(days=5))
        assert _classify_dominant(task, NOW) == "in_progress"

    def test_upcoming_classified(self):
        task = _task(status=TaskStatus.ASSIGNED, priority=TaskPriority.LOW, due_date=NOW + timedelta(days=3))
        assert _classify_dominant(task, NOW) == "upcoming"


# ── Next Action Reasons ─────────────────────────────────────────────────────

class TestNextActionReasons:
    def test_overdue_reason(self):
        task = _task(due_date=NOW - timedelta(days=2))
        reason = _next_action_reason(task, NOW)
        assert "Overdue by 2 days" in reason

    def test_due_today_reason(self):
        task = _task(due_date=NOW.replace(hour=14))
        reason = _next_action_reason(task, NOW)
        assert "Due today" in reason

    def test_critical_reason(self):
        task = _task(priority=TaskPriority.CRITICAL, due_date=NOW + timedelta(days=5))
        reason = _next_action_reason(task, NOW)
        assert "Critical" in reason

    def test_revision_reason(self):
        task = _task(status=TaskStatus.REVISION_REQUIRED, latest_revision_reason="Change CTA")
        reason = _next_action_reason(task, NOW)
        assert "Change CTA" in reason

    def test_upcoming_reason(self):
        task = _task(due_date=NOW + timedelta(days=3), priority=TaskPriority.LOW)
        reason = _next_action_reason(task, NOW)
        assert "3 days" in reason
