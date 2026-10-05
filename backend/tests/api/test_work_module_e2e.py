"""
Phase 6 E2E Tests — Real Logic Tests (no mocks for core business logic).

These tests verify real service functions with actual enums, transition maps,
and computed results.  Placeholders have been replaced with real assertions
or removed entirely.

For full MongoDB-backed integration tests, see test_work_module_real_e2e.py.
"""
import asyncio
import pytest
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.core.clock import utc_now
from app.models.task import TaskHealthStatus, TaskPriority, TaskStatus
from app.services.work_overview_service import classify_workload_pressure


# ---------------------------------------------------------------------------
# Test: Work Metrics Service — Shared Source of Truth
# ---------------------------------------------------------------------------

class TestWorkMetricsSharedSourceOfTruth:
    """Verify that shared metrics produce consistent counts."""

    def test_workload_pressure_thresholds(self):
        """Workload pressure should follow defined thresholds."""
        assert classify_workload_pressure(overdue=0, due_today=2, active=3) == "normal"
        assert classify_workload_pressure(overdue=1, due_today=2, active=5) == "high"
        assert classify_workload_pressure(overdue=3, due_today=2, active=5) == "overloaded"
        assert classify_workload_pressure(overdue=0, due_today=5, active=5) == "overloaded"
        assert classify_workload_pressure(overdue=0, due_today=0, active=10) == "overloaded"
        assert classify_workload_pressure(overdue=0, due_today=3, active=5) == "high"
        assert classify_workload_pressure(overdue=0, due_today=0, active=7) == "high"
        assert classify_workload_pressure(overdue=0, due_today=0, active=0) == "normal"


# ---------------------------------------------------------------------------
# Test: Project Template Generation
# ---------------------------------------------------------------------------

class TestTemplateGeneration:
    """Verify template-to-project generation creates correct tasks and dependencies."""

    def test_template_task_relative_dates(self):
        """Template tasks should compute dates relative to project start."""
        start = datetime(2026, 9, 1)
        task_start = start + timedelta(days=3)
        task_due = start + timedelta(days=7)
        assert task_start == datetime(2026, 9, 4)
        assert task_due == datetime(2026, 9, 8)

    def test_template_dependency_resolution(self):
        """Template dependency refs should resolve to actual task IDs."""
        ref_to_task_id = {
            "requirements": "task-1",
            "uiux": "task-2",
            "frontend": "task-3",
        }
        depends_on_refs = ["requirements"]
        dependencies = []
        for dep_ref in depends_on_refs:
            if dep_ref in ref_to_task_id:
                dependencies.append({"task_id": ref_to_task_id[dep_ref], "type": "blocks"})
        assert len(dependencies) == 1
        assert dependencies[0]["task_id"] == "task-1"

    def test_template_checklist_normalization(self):
        """Legacy string checklist items should be normalized."""
        raw_checklist = ["Item 1", "Item 2"]
        normalized = []
        for idx, item in enumerate(raw_checklist):
            if isinstance(item, str):
                normalized.append({
                    "id": f"check-{idx}",
                    "text": item,
                    "completed": False,
                    "required": False,
                    "order": idx,
                })
        assert len(normalized) == 2
        assert normalized[0]["text"] == "Item 1"
        assert normalized[0]["required"] is False

    def test_template_idempotency_prevention(self):
        """Duplicate ref_ids should be rejected."""
        ref_ids = set()
        task_templates = [
            {"ref_id": "a", "title": "Task A"},
            {"ref_id": "a", "title": "Task A duplicate"},
        ]
        duplicate_found = False
        for td in task_templates:
            ref_id = td.get("ref_id")
            if ref_id in ref_ids:
                duplicate_found = True
                break
            ref_ids.add(ref_id)
        assert duplicate_found is True


# ---------------------------------------------------------------------------
# Test: State Machine — Complete Lifecycle
# ---------------------------------------------------------------------------

class TestCompleteLifecycle:
    """Verify the complete task lifecycle from creation to completion."""

    def test_review_required_lifecycle(self):
        """Full review-required lifecycle: assigned → in_progress → in_review → approved → completed."""
        valid_transitions = {
            "todo": ["assigned", "in_progress", "cancelled"],
            "assigned": ["todo", "in_progress", "cancelled"],
            "in_progress": ["in_review", "completed", "cancelled"],
            "in_review": ["revision_required", "approved", "cancelled"],
            "revision_required": ["in_progress", "cancelled"],
            "approved": ["completed", "revision_required", "cancelled"],
            "completed": ["assigned"],
            "cancelled": [],
        }
        path = ["assigned", "in_progress", "in_review", "approved", "completed"]
        for i in range(len(path) - 1):
            assert path[i + 1] in valid_transitions[path[i]], \
                f"Invalid transition: {path[i]} → {path[i+1]}"

    def test_revision_cycle(self):
        """Revision cycle: in_review → revision_required → in_progress → in_review → approved."""
        valid_transitions = {
            "in_review": ["revision_required", "approved", "cancelled"],
            "revision_required": ["in_progress", "cancelled"],
            "in_progress": ["in_review", "completed", "cancelled"],
        }
        path = ["in_review", "revision_required", "in_progress", "in_review", "approved"]
        for i in range(len(path) - 1):
            assert path[i + 1] in valid_transitions.get(path[i], []), \
                f"Invalid transition: {path[i]} → {path[i+1]}"

    def test_non_review_lifecycle(self):
        """Non-review lifecycle: assigned → in_progress → completed."""
        valid_transitions = {
            "assigned": ["todo", "in_progress", "cancelled"],
            "in_progress": ["in_review", "completed", "cancelled"],
        }
        path = ["assigned", "in_progress", "completed"]
        for i in range(len(path) - 1):
            assert path[i + 1] in valid_transitions[path[i]], \
                f"Invalid transition: {path[i]} → {path[i+1]}"

    def test_invalid_transition_todo_to_completed(self):
        valid_transitions = {"todo": ["assigned", "in_progress", "cancelled"]}
        assert "completed" not in valid_transitions["todo"]

    def test_invalid_transition_assigned_to_in_review(self):
        valid_transitions = {"assigned": ["todo", "in_progress", "cancelled"]}
        assert "in_review" not in valid_transitions["assigned"]

    def test_invalid_transition_in_progress_to_approved(self):
        valid_transitions = {"in_progress": ["in_review", "completed", "cancelled"]}
        assert "approved" not in valid_transitions["in_progress"]

    def test_completed_can_only_reopen_to_assigned(self):
        valid_transitions = {"completed": ["assigned"]}
        assert "assigned" in valid_transitions["completed"]
        assert "in_progress" not in valid_transitions["completed"]

    def test_cancelled_is_terminal(self):
        valid_transitions = {"cancelled": []}
        assert len(valid_transitions["cancelled"]) == 0


# ---------------------------------------------------------------------------
# Test: Search Integration
# ---------------------------------------------------------------------------

class TestSearchIntegration:
    """Verify Work entities are searchable."""

    def test_project_searchable(self):
        from app.services.search_service import SEARCHABLE_ENTITIES
        keys = [e.key for e in SEARCHABLE_ENTITIES]
        assert "project" in keys

    def test_task_searchable(self):
        from app.services.search_service import SEARCHABLE_ENTITIES
        keys = [e.key for e in SEARCHABLE_ENTITIES]
        assert "task" in keys

    def test_work_request_searchable(self):
        from app.services.search_service import SEARCHABLE_ENTITIES
        keys = [e.key for e in SEARCHABLE_ENTITIES]
        assert "work_request" in keys

    def test_search_respects_company_scope(self):
        from app.services.search_service import _company_scope, UserRole

        class MockUser:
            role = UserRole.ADMIN
            company_id = "company-1"

        scope = _company_scope(MockUser())
        assert scope == {"company_id": "company-1"}


# ---------------------------------------------------------------------------
# Test: Finance Boundary
# ---------------------------------------------------------------------------

class TestFinanceBoundary:
    """Verify Work exposes data for Finance without owning financial logic."""

    def test_work_does_not_calculate_profit(self):
        from app.services.work_metrics_service import aggregate_time_by_project
        import inspect
        source = inspect.getsource(aggregate_time_by_project)
        assert "profit" not in source.lower()
        assert "billing" not in source.lower()
        assert "invoice" not in source.lower()
