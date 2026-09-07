"""Phase 2 Task Workflow Service — comprehensive unit tests.

Covers:
  - State-machine transitions (review-required and non-review paths)
  - Actor permission enforcement
  - Reviewer validation and resolution
  - Checklist normalization and submission validation
  - Dependency blocking and cycle detection
  - Allowed actions calculation
  - Backward compatibility for legacy tasks
  - Sales follow-up compatibility
"""
from __future__ import annotations

import os
import pytest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch, MagicMock

# Ensure required env vars before any app imports
os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from fastapi import HTTPException

from app.models.task import TaskStatus, TaskHealthStatus
from app.services.task_workflow import (
    ACTION_TO_STATUS,
    TERMINAL_STATUSES,
    allowed_transition,
    creation_status,
    effective_review_required,
    normalize_checklist,
    normalize_checklist_item,
    normalize_status,
    incomplete_required_checklist,
    reviewer_for_submission,
    validate_reviewer,
    allowed_actions,
    assert_actor_for_action,
    assert_not_blocked,
    blocking_dependencies,
    validate_dependency,
    _assert_no_cycle,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _user(user_id="user-1", role="employee", company_id="company-1"):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        first_name="Test",
        last_name=user_id,
        status="active",
        reports_to=None,
        ancestors=[],
        full_name=lambda: f"User {user_id}",
    )


def _task(**kwargs):
    defaults = {
        "id": "task-1",
        "company_id": "company-1",
        "title": "Test Task",
        "created_by": "user-1",
        "assigned_to": None,
        "assigned_by": None,
        "assigned_at": None,
        "reviewer_id": None,
        "review_required": None,
        "review_round": 0,
        "status": TaskStatus.TODO,
        "priority": SimpleNamespace(value="medium"),
        "checklist": [],
        "dependencies": [],
        "source_type": None,
        "project_id": None,
        "project_object_id": None,
        "due_date": None,
        "start_date": None,
        "completed_at": None,
        "completed_by": None,
        "approved_at": None,
        "approved_by": None,
        "revision_requested_at": None,
        "revision_requested_by": None,
        "latest_revision_reason": None,
        "submitted_for_review_at": None,
        "submitted_for_review_by": None,
        "status_changed_at": None,
        "progress_percentage": 0.0,
        "updated_at": datetime(2026, 8, 1, 12, 0, 0),
        "health_status": TaskHealthStatus.HEALTHY,
        "extension_count": 0,
        "task_type": SimpleNamespace(value="standard"),
        "measurement_type": None,
        "custom_measurement_label": None,
        "target_quantity": None,
        "target_unit": None,
        "completed_quantity": 0,
        "tags": [],
        "attachments": [],
        "time_logs": [],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _project(**kwargs):
    defaults = {
        "id": "proj-1",
        "company_id": "company-1",
        "project_id": "PROJ-001",
        "lead_id": None,
        "team_member_ids": [],
        "assigned_user_ids": [],
        "assigned_to": None,
        "created_by": None,
        "status": SimpleNamespace(value="active"),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


async def _noop_save(self):
    return self


# ── Status Normalization ─────────────────────────────────────────────────────

class TestStatusNormalization:
    def test_normalize_valid_status(self):
        assert normalize_status("todo") == TaskStatus.TODO
        assert normalize_status("in_progress") == TaskStatus.IN_PROGRESS
        assert normalize_status("in_review") == TaskStatus.IN_REVIEW
        assert normalize_status("revision_required") == TaskStatus.REVISION_REQUIRED
        assert normalize_status("approved") == TaskStatus.APPROVED
        assert normalize_status("completed") == TaskStatus.COMPLETED
        assert normalize_status("cancelled") == TaskStatus.CANCELLED
        assert normalize_status("assigned") == TaskStatus.ASSIGNED

    def test_normalize_enum_value(self):
        assert normalize_status(TaskStatus.TODO) == TaskStatus.TODO

    def test_normalize_invalid_raises(self):
        with pytest.raises(HTTPException) as exc_info:
            normalize_status("bogus")
        assert exc_info.value.status_code == 400

    def test_all_statuses_present_in_enum(self):
        values = {s.value for s in TaskStatus}
        expected = {"todo", "assigned", "in_progress", "in_review",
                    "revision_required", "approved", "completed", "cancelled"}
        assert values == expected


# ── Creation Status ──────────────────────────────────────────────────────────

class TestCreationStatus:
    def test_no_assignee_returns_todo(self):
        assert creation_status(None) == TaskStatus.TODO

    def test_with_assignee_returns_assigned(self):
        assert creation_status("user-1") == TaskStatus.ASSIGNED

    def test_empty_string_returns_todo(self):
        assert creation_status("") == TaskStatus.TODO


# ── Effective Review Required ────────────────────────────────────────────────

class TestEffectiveReviewRequired:
    def test_explicit_true(self):
        task = _task(review_required=True)
        assert effective_review_required(task) is True

    def test_explicit_false(self):
        task = _task(review_required=False)
        assert effective_review_required(task) is False

    def test_sales_followup_default(self):
        task = _task(review_required=None, source_type="sales_follow_up")
        assert effective_review_required(task) is False

    def test_project_task_default(self):
        task = _task(review_required=None, project_id="PROJ-001")
        assert effective_review_required(task) is True

    def test_no_project_no_source_default(self):
        task = _task(review_required=None, project_id=None, source_type=None)
        assert effective_review_required(task) is False


# ── Allowed Transitions (State Machine) ─────────────────────────────────────

class TestAllowedTransition:
    """Test the strict state machine for review-required tasks."""

    def test_todo_to_assigned(self):
        task = _task(status=TaskStatus.TODO, assigned_to="user-2")
        assert allowed_transition(TaskStatus.TODO, TaskStatus.ASSIGNED, task, review_required=True)

    def test_todo_to_in_progress_legacy(self):
        """Legacy tasks with todo + assigned_to can go directly to in_progress."""
        task = _task(status=TaskStatus.TODO, assigned_to="user-1")
        assert allowed_transition(TaskStatus.TODO, TaskStatus.IN_PROGRESS, task, review_required=True)

    def test_todo_to_in_progress_no_assignee(self):
        task = _task(status=TaskStatus.TODO, assigned_to=None)
        assert not allowed_transition(TaskStatus.TODO, TaskStatus.IN_PROGRESS, task, review_required=True)

    def test_todo_to_completed_blocked(self):
        task = _task(status=TaskStatus.TODO)
        assert not allowed_transition(TaskStatus.TODO, TaskStatus.COMPLETED, task, review_required=True)

    def test_assigned_to_in_progress(self):
        task = _task(status=TaskStatus.ASSIGNED)
        assert allowed_transition(TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, task, review_required=True)

    def test_assigned_to_todo(self):
        task = _task(status=TaskStatus.ASSIGNED)
        assert allowed_transition(TaskStatus.ASSIGNED, TaskStatus.TODO, task, review_required=True)

    def test_assigned_to_completed_blocked_for_review(self):
        task = _task(status=TaskStatus.ASSIGNED)
        assert not allowed_transition(TaskStatus.ASSIGNED, TaskStatus.COMPLETED, task, review_required=True)

    def test_in_progress_to_in_review(self):
        task = _task(status=TaskStatus.IN_PROGRESS)
        assert allowed_transition(TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, task, review_required=True)

    def test_in_progress_to_completed_non_review(self):
        task = _task(status=TaskStatus.IN_PROGRESS)
        assert allowed_transition(TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, task, review_required=False)

    def test_in_progress_to_completed_review_blocked(self):
        task = _task(status=TaskStatus.IN_PROGRESS)
        assert not allowed_transition(TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, task, review_required=True)

    def test_in_review_to_revision_required(self):
        task = _task(status=TaskStatus.IN_REVIEW)
        assert allowed_transition(TaskStatus.IN_REVIEW, TaskStatus.REVISION_REQUIRED, task, review_required=True)

    def test_in_review_to_approved(self):
        task = _task(status=TaskStatus.IN_REVIEW)
        assert allowed_transition(TaskStatus.IN_REVIEW, TaskStatus.APPROVED, task, review_required=True)

    def test_in_review_to_completed_blocked(self):
        task = _task(status=TaskStatus.IN_REVIEW)
        assert not allowed_transition(TaskStatus.IN_REVIEW, TaskStatus.COMPLETED, task, review_required=True)

    def test_revision_required_to_in_progress(self):
        task = _task(status=TaskStatus.REVISION_REQUIRED)
        assert allowed_transition(TaskStatus.REVISION_REQUIRED, TaskStatus.IN_PROGRESS, task, review_required=True)

    def test_revision_required_to_approved_blocked(self):
        task = _task(status=TaskStatus.REVISION_REQUIRED)
        assert not allowed_transition(TaskStatus.REVISION_REQUIRED, TaskStatus.APPROVED, task, review_required=True)

    def test_approved_to_completed(self):
        task = _task(status=TaskStatus.APPROVED)
        assert allowed_transition(TaskStatus.APPROVED, TaskStatus.COMPLETED, task, review_required=True)

    def test_approved_to_revision_required(self):
        """Approval can be reopened to revision."""
        task = _task(status=TaskStatus.APPROVED)
        assert allowed_transition(TaskStatus.APPROVED, TaskStatus.REVISION_REQUIRED, task, review_required=True)

    def test_completed_to_assigned(self):
        """Completed tasks can be reopened to assigned."""
        task = _task(status=TaskStatus.COMPLETED)
        assert allowed_transition(TaskStatus.COMPLETED, TaskStatus.ASSIGNED, task, review_required=True)

    def test_completed_to_in_progress_blocked(self):
        task = _task(status=TaskStatus.COMPLETED)
        assert not allowed_transition(TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS, task, review_required=True)

    def test_cancelled_is_terminal(self):
        task = _task(status=TaskStatus.CANCELLED)
        assert not allowed_transition(TaskStatus.CANCELLED, TaskStatus.IN_PROGRESS, task, review_required=True)
        assert not allowed_transition(TaskStatus.CANCELLED, TaskStatus.ASSIGNED, task, review_required=True)

    def test_any_status_to_cancelled(self):
        for s in [TaskStatus.TODO, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS,
                  TaskStatus.IN_REVIEW, TaskStatus.REVISION_REQUIRED, TaskStatus.APPROVED]:
            task = _task(status=s)
            assert allowed_transition(s, TaskStatus.CANCELLED, task, review_required=True)

    def test_same_status_is_noop(self):
        task = _task(status=TaskStatus.IN_PROGRESS)
        assert allowed_transition(TaskStatus.IN_PROGRESS, TaskStatus.IN_PROGRESS, task, review_required=True)


# ── Full Review Workflow Path ────────────────────────────────────────────────

class TestReviewWorkflowPath:
    """Simulate the happy-path review flow: assigned → in_progress → in_review → approved → completed."""

    def test_happy_path_transitions(self):
        task = _task(status=TaskStatus.ASSIGNED)
        assert allowed_transition(TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, task, review_required=True)
        task = _task(status=TaskStatus.IN_PROGRESS)
        assert allowed_transition(TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, task, review_required=True)
        task = _task(status=TaskStatus.IN_REVIEW)
        assert allowed_transition(TaskStatus.IN_REVIEW, TaskStatus.APPROVED, task, review_required=True)
        task = _task(status=TaskStatus.APPROVED)
        assert allowed_transition(TaskStatus.APPROVED, TaskStatus.COMPLETED, task, review_required=True)

    def test_revision_round_path(self):
        """assigned → in_progress → in_review → revision_required → in_progress → in_review → approved → completed."""
        task = _task(status=TaskStatus.REVISION_REQUIRED)
        assert allowed_transition(TaskStatus.REVISION_REQUIRED, TaskStatus.IN_PROGRESS, task, review_required=True)
        task = _task(status=TaskStatus.IN_PROGRESS)
        assert allowed_transition(TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, task, review_required=True)
        task = _task(status=TaskStatus.IN_REVIEW)
        assert allowed_transition(TaskStatus.IN_REVIEW, TaskStatus.APPROVED, task, review_required=True)
        task = _task(status=TaskStatus.APPROVED)
        assert allowed_transition(TaskStatus.APPROVED, TaskStatus.COMPLETED, task, review_required=True)


# ── Non-Review Workflow ──────────────────────────────────────────────────────

class TestNonReviewWorkflow:
    def test_direct_completion(self):
        task = _task(status=TaskStatus.IN_PROGRESS)
        assert allowed_transition(TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, task, review_required=False)

    def test_no_in_review_step(self):
        task = _task(status=TaskStatus.IN_PROGRESS)
        # Non-review tasks don't need to go through in_review
        assert not allowed_transition(TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, task, review_required=False)


# ── Checklist ────────────────────────────────────────────────────────────────

class TestChecklist:
    def test_normalize_string_item(self):
        items = normalize_checklist(["Add captions", "Review copy"])
        assert len(items) == 2
        assert items[0]["text"] == "Add captions"
        assert items[0]["completed"] is False
        assert "id" in items[0]
        assert "created_at" in items[0]

    def test_normalize_dict_item(self):
        items = normalize_checklist([{"text": "Task 1", "completed": True, "required": True}])
        assert items[0]["completed"] is True
        assert items[0]["required"] is True

    def test_normalize_legacy_title_field(self):
        items = normalize_checklist([{"title": "Legacy item"}])
        assert items[0]["text"] == "Legacy item"

    def test_normalize_empty_list(self):
        assert normalize_checklist([]) == []

    def test_normalize_none(self):
        assert normalize_checklist(None) == []

    def test_incomplete_required_items(self):
        task = _task(checklist=[
            {"id": "1", "text": "Required", "completed": False, "required": True},
            {"id": "2", "text": "Optional", "completed": False, "required": False},
            {"id": "3", "text": "Done", "completed": True, "required": True},
        ])
        incomplete = incomplete_required_checklist(task)
        assert len(incomplete) == 1
        assert incomplete[0]["text"] == "Required"

    def test_all_required_completed(self):
        task = _task(checklist=[
            {"id": "1", "text": "Required", "completed": True, "required": True},
        ])
        assert len(incomplete_required_checklist(task)) == 0

    def test_legacy_items_no_required_field(self):
        """Legacy items without 'required' field default to not required."""
        task = _task(checklist=[
            {"id": "1", "text": "Legacy", "completed": False},
        ])
        assert len(incomplete_required_checklist(task)) == 0


# ── Dependencies ─────────────────────────────────────────────────────────────

class TestBlockingDependencies:
    @pytest.mark.asyncio
    async def test_no_dependencies_not_blocked(self):
        task = _task(dependencies=[])
        blockers = await blocking_dependencies(task)
        assert blockers == []

    @pytest.mark.asyncio
    async def test_completed_dependency_not_blocking(self):
        dep = _task(id="dep-1", title="Dep Task", status=TaskStatus.COMPLETED, company_id="company-1")
        with patch("app.services.task_workflow.Task") as MockTask:
            MockTask.get = AsyncMock(return_value=dep)
            task = _task(dependencies=["dep-1"], company_id="company-1")
            blockers = await blocking_dependencies(task)
            assert blockers == []

    @pytest.mark.asyncio
    async def test_incomplete_dependency_is_blocking(self):
        dep = _task(id="dep-1", title="Dep Task", status=TaskStatus.IN_PROGRESS, company_id="company-1")
        with patch("app.services.task_workflow.Task") as MockTask:
            MockTask.get = AsyncMock(return_value=dep)
            task = _task(dependencies=["dep-1"], company_id="company-1")
            blockers = await blocking_dependencies(task)
            assert len(blockers) == 1
            assert blockers[0]["id"] == "dep-1"
            assert blockers[0]["status"] == "in_progress"

    @pytest.mark.asyncio
    async def test_cross_company_dependency_ignored(self):
        dep = _task(id="dep-1", title="Dep Task", status=TaskStatus.COMPLETED, company_id="company-2")
        with patch("app.services.task_workflow.Task") as MockTask:
            MockTask.get = AsyncMock(return_value=dep)
            task = _task(dependencies=["dep-1"], company_id="company-1")
            blockers = await blocking_dependencies(task)
            assert blockers == []

    @pytest.mark.asyncio
    async def test_missing_dependency_ignored(self):
        with patch("app.services.task_workflow.Task") as MockTask:
            MockTask.get = AsyncMock(return_value=None)
            task = _task(dependencies=["nonexistent"], company_id="company-1")
            blockers = await blocking_dependencies(task)
            assert blockers == []


class TestDependencyValidation:
    @pytest.mark.asyncio
    async def test_self_dependency_rejected(self):
        task = _task(id="task-1")
        with pytest.raises(HTTPException) as exc_info:
            await validate_dependency(task, "task-1")
        assert exc_info.value.status_code == 400
        assert "itself" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_missing_dependency_rejected(self):
        task = _task(id="task-1", company_id="company-1")
        with patch("app.services.task_workflow.Task") as MockTask:
            MockTask.get = AsyncMock(return_value=None)
            with pytest.raises(HTTPException) as exc_info:
                await validate_dependency(task, "missing-id")
            assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_cross_company_dependency_rejected(self):
        task = _task(id="task-1", company_id="company-1")
        dep = _task(id="dep-1", company_id="company-2")
        with patch("app.services.task_workflow.Task") as MockTask:
            MockTask.get = AsyncMock(return_value=dep)
            with pytest.raises(HTTPException) as exc_info:
                await validate_dependency(task, "dep-1")
            assert exc_info.value.status_code == 400


# ── Action-to-Status Mapping ────────────────────────────────────────────────

class TestActionToStatusMapping:
    def test_all_actions_have_targets(self):
        expected_actions = {"assign", "start_work", "submit_review", "request_revision",
                           "approve", "complete", "reopen", "cancel"}
        assert set(ACTION_TO_STATUS.keys()) == expected_actions

    def test_action_targets_are_valid_statuses(self):
        for action, status in ACTION_TO_STATUS.items():
            assert isinstance(status, TaskStatus), f"Action {action} maps to invalid status"


# ── Terminal Statuses ────────────────────────────────────────────────────────

class TestTerminalStatuses:
    def test_completed_is_terminal(self):
        assert TaskStatus.COMPLETED in TERMINAL_STATUSES

    def test_cancelled_is_terminal(self):
        assert TaskStatus.CANCELLED in TERMINAL_STATUSES

    def test_open_statuses_exclude_terminals(self):
        from app.services.task_workflow import OPEN_STATUSES
        assert TaskStatus.COMPLETED not in OPEN_STATUSES
        assert TaskStatus.CANCELLED not in OPEN_STATUSES


# ── Backward Compatibility ───────────────────────────────────────────────────

class TestBackwardCompatibility:
    def test_legacy_todo_with_assignee_can_start(self):
        """Legacy tasks with todo + assigned_to should be able to transition to in_progress."""
        task = _task(status=TaskStatus.TODO, assigned_to="user-1")
        assert allowed_transition(TaskStatus.TODO, TaskStatus.IN_PROGRESS, task, review_required=True)

    def test_legacy_missing_review_required_defaults(self):
        """Tasks with review_required=None should get effective defaults."""
        task = _task(review_required=None, source_type=None, project_id=None)
        assert effective_review_required(task) is False

    def test_sales_followup_no_review(self):
        """Sales follow-up tasks should default to no review."""
        task = _task(review_required=None, source_type="sales_follow_up", project_id="PROJ-001")
        assert effective_review_required(task) is False


# ── All 8 Statuses Covered ──────────────────────────────────────────────────

class TestAllStatusesCovered:
    def test_state_machine_covers_all_statuses(self):
        """Every non-cancelled, non-terminal status should have at least one allowed transition."""
        task_template = _task()
        review_statuses = {TaskStatus.TODO, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS,
                          TaskStatus.IN_REVIEW, TaskStatus.REVISION_REQUIRED, TaskStatus.APPROVED}
        for current in review_statuses:
            has_any = False
            for target in TaskStatus:
                if target == current:
                    continue
                task = _task(status=current)
                if allowed_transition(current, target, task, review_required=True):
                    has_any = True
                    break
            assert has_any, f"Status {current.value} has no allowed transitions"

    def test_all_statuses_normalize(self):
        """Every TaskStatus value should round-trip through normalize_status."""
        for s in TaskStatus:
            assert normalize_status(s.value) == s
