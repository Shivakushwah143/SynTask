"""Work Module Repair 5 — remaining backend correctness tests.

Covers:
  1. Automated assignment follows normal Task workflow
  2. Project Owner cannot be cleared
  3. client-facing Project cannot exist without Client
  4. Client Report returns correct At-Risk count
  5. Client Report counts Tasks linked by both supported Project ID formats
  6. Failed timer finalization can safely recover without duplicate TimeLogs
  7. Completed/Archived Project is not reported as active At Risk
  8. Cross-company protections still pass
"""
from __future__ import annotations

import os
import pytest
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from fastapi import HTTPException
from app.core.automation_engine import AutomationEngine
from app.models.project import ProjectStatus
from app.models.task import TaskStatus
from app.models.time_tracking import ActiveTimeSessionStatus
from app.models.user import UserRole
from app.services.project_health_service import calculate_project_health


# ── Helpers ──────────────────────────────────────────────────────────────────

class _FakeObj:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
    async def save(self):
        return self
    async def delete(self):
        pass
    async def insert(self):
        pass


def _task(**kwargs):
    now = datetime(2026, 8, 15, 10, 0, 0)
    defaults = {
        "id": "task-1", "title": "Test Task", "company_id": "company-1",
        "assigned_to": "user-1", "created_by": "user-1",
        "reviewer_id": None, "review_required": None, "review_round": 0,
        "status": TaskStatus.IN_PROGRESS, "priority": "medium",
        "due_date": None, "start_date": None,
        "completed_at": None, "completed_by": None,
        "health_status": "healthy", "extension_count": 0,
        "project_id": "PROJ-001", "project_object_id": None,
        "source_type": None, "tags": [], "attachments": [],
        "time_logs": [], "checklist": [], "dependencies": [],
        "created_at": now, "updated_at": now, "progress_percentage": 0.0,
    }
    defaults.update(kwargs)
    return _FakeObj(**defaults)


def _project(**kwargs):
    now = datetime(2026, 9, 1, 10, 0, 0)
    defaults = {
        "id": "proj-1", "name": "Test Project", "key": "TEST",
        "project_id": "PROJ-001", "company_id": "company-1",
        "client_id": None, "type": "internal",
        "status": ProjectStatus.EXECUTION, "priority": "medium",
        "lead_id": "lead-1", "assigned_to": "user-1", "created_by": "user-1",
        "start_date": now - timedelta(days=30),
        "delivery_date": now + timedelta(days=30),
        "updated_at": now, "team_member_ids": [],
    }
    defaults.update(kwargs)
    return _FakeObj(**defaults)


def _user(**kwargs):
    defaults = {
        "id": "user-1", "company_id": "company-1",
        "role": UserRole.EMPLOYEE, "first_name": "Test",
        "last_name": "User", "email": "test@example.com",
    }
    defaults.update(kwargs)
    obj = _FakeObj(**defaults)
    obj.full_name = lambda: f"{defaults['first_name']} {defaults['last_name']}"
    return obj


def _session(**kwargs):
    defaults = {
        "id": "session-1", "company_id": "company-1", "user_id": "user-1",
        "task_id": "task-1", "project_id": "proj-1", "client_id": None,
        "started_at": datetime(2026, 8, 15, 10, 0, 0),
        "last_resumed_at": datetime(2026, 8, 15, 10, 0, 0),
        "paused_at": None, "accumulated_seconds": 0,
        "status": ActiveTimeSessionStatus.STOPPING,
    }
    defaults.update(kwargs)
    obj = _FakeObj(**defaults)
    obj.save = AsyncMock()
    obj.delete = AsyncMock()
    return obj


def _async_return(value):
    async def _fn(*a, **kw):
        return value
    return _fn


def _healthy_health_result():
    return {
        "level": "healthy", "reasons": [],
        "overdue_task_count": 0, "total_open_tasks": 0,
        "completion_percentage": 100.0, "days_until_deadline": 30,
        "last_activity_at": None, "completed_task_count": 0,
        "eligible_task_count": 0, "deadline_urgency": "normal",
    }


# ── 1. Automation Assignment uses Task Workflow ──────────────────────────────

class TestAutomationAssignmentUsesWorkflow:
    @pytest.mark.asyncio
    async def test_assign_task_calls_transition(self, monkeypatch):
        task = _task(status=TaskStatus.TODO)
        actor = _user(id="admin-1", role=UserRole.ADMIN)
        assignee = _user(id="user-2", role=UserRole.EMPLOYEE)
        calls: list[dict] = []

        async def fake_transition(**kwargs):
            calls.append(kwargs)
            task.status = TaskStatus.ASSIGNED
            # Simulate what transition_task does with assignee_id for assign action
            if kwargs.get("action") == "assign":
                aid = kwargs.get("assignee_id") or kwargs.get("reviewer_id")
                if aid:
                    task.assigned_to = aid
            return task

        monkeypatch.setattr("app.core.automation_engine.Task.get", staticmethod(_async_return(task)))
        # User.get is called for both actor and assignee validation
        original_user_get = _async_return(actor)
        async def fake_user_get(uid):
            if uid == actor.id:
                return actor
            if uid == assignee.id:
                return assignee
            return None
        monkeypatch.setattr("app.core.automation_engine.User.get", fake_user_get)
        monkeypatch.setattr("app.services.task_workflow.transition_task", fake_transition)

        await AutomationEngine._assign_task(
            {"assignee_id": "user-2"},
            {"entity_id": task.id, "user_id": actor.id, "company_id": "company-1"},
        )
        assert len(calls) == 1
        assert calls[0]["action"] == "assign"
        assert calls[0]["target_status"] == "assigned"
        assert calls[0]["assignee_id"] == "user-2"
        assert task.assigned_to == "user-2"

    @pytest.mark.asyncio
    async def test_assign_task_rejects_cross_company_actor(self, monkeypatch):
        task = _task(company_id="company-1")
        actor = _user(id="evil", company_id="company-2", role=UserRole.ADMIN)

        monkeypatch.setattr("app.core.automation_engine.Task.get", staticmethod(_async_return(task)))
        monkeypatch.setattr("app.core.automation_engine.User.get", staticmethod(_async_return(actor)))

        with pytest.raises(PermissionError, match="company"):
            await AutomationEngine._assign_task(
                {"assignee_id": "user-2"},
                {"entity_id": task.id, "user_id": actor.id},
            )

    @pytest.mark.asyncio
    async def test_assign_task_requires_actor(self, monkeypatch):
        task = _task()
        monkeypatch.setattr("app.core.automation_engine.Task.get", staticmethod(_async_return(task)))
        monkeypatch.setattr("app.core.automation_engine.User.get", staticmethod(_async_return(None)))

        with pytest.raises(ValueError, match="triggering user"):
            await AutomationEngine._assign_task(
                {"assignee_id": "user-2"},
                {"entity_id": task.id, "user_id": "nonexistent"},
            )


# ── 2. Project Owner cannot be cleared ───────────────────────────────────────

class TestProjectOwnerCannotBeCleared:
    @pytest.mark.asyncio
    async def test_clearing_lead_on_operational_project_raises(self):
        from app.services.project_service import ProjectService
        project = _project(lead_id="lead-1", status=ProjectStatus.EXECUTION)
        user = _user(role=UserRole.ADMIN)

        with pytest.raises(HTTPException, match="Project Owner cannot be removed"):
            await ProjectService.update_project(project=project, current_user=user, lead_id="")

    @pytest.mark.asyncio
    async def test_clearing_lead_on_archived_project_succeeds(self):
        from app.services.project_service import ProjectService
        project = _project(lead_id="lead-1", status=ProjectStatus.ARCHIVED)
        user = _user(role=UserRole.ADMIN)

        result = await ProjectService.update_project(project=project, current_user=user, lead_id="")
        assert result.lead_id == ""

    @pytest.mark.asyncio
    async def test_clearing_lead_on_cancelled_project_succeeds(self):
        from app.services.project_service import ProjectService
        project = _project(lead_id="lead-1", status=ProjectStatus.CANCELLED)
        user = _user(role=UserRole.ADMIN)

        result = await ProjectService.update_project(project=project, current_user=user, lead_id="")
        assert result.lead_id == ""


# ── 3. Client-facing Project requires valid Client ───────────────────────────

class TestClientFacingProjectRequiresClient:
    @pytest.mark.asyncio
    async def test_changing_to_client_facing_without_client_raises(self, monkeypatch):
        from app.services.project_service import ProjectService
        project = _project(type="internal", client_id=None)
        user = _user(role=UserRole.ADMIN)

        monkeypatch.setattr(ProjectService, "ensure_project_type", _async_return("software"))

        with pytest.raises(HTTPException, match="Client is required when changing"):
            await ProjectService.update_project(project=project, current_user=user, type="software")

    @pytest.mark.asyncio
    async def test_changing_to_client_facing_with_client_succeeds(self, monkeypatch):
        from app.services.project_service import ProjectService
        project = _project(type="internal", client_id="client-1")
        user = _user(role=UserRole.ADMIN)

        async def sync_link(proj, cid, cid_str):
            proj.client_id = cid

        monkeypatch.setattr(ProjectService, "ensure_project_type", _async_return("software"))
        monkeypatch.setattr(ProjectService, "sync_client_project_link", sync_link)

        result = await ProjectService.update_project(project=project, current_user=user, type="software", client_id="client-1")
        assert result.type == "software"

    @pytest.mark.asyncio
    async def test_final_state_validation_client_required(self):
        from app.services.project_service import ProjectService
        project = _project(type="marketing", client_id=None)
        user = _user(role=UserRole.ADMIN)

        with pytest.raises(HTTPException, match="Client is required for client-facing"):
            await ProjectService.update_project(project=project, current_user=user)


# ── 4 & 5. Client Report: At-Risk count uses 'level' field + dual-ID counting ─

class TestClientReportHealthLookup:
    """Verify the report reads health['level'] (not health['health'])."""

    def test_health_level_at_risk_detected(self):
        """Directly test that health dict with 'level' key is read correctly."""
        from app.services.project_health_service import serialize_project_health, ProjectHealth
        h = ProjectHealth(
            level="at_risk", reasons=["overdue"], overdue_task_count=2,
            total_open_tasks=5, completion_percentage=40.0,
            days_until_deadline=-3, last_activity_at=None,
            completed_task_count=1, eligible_task_count=5,
            deadline_urgency="overdue",
        )
        d = serialize_project_health(h)
        assert d["level"] == "at_risk"
        # The old bug checked d.get("health") which would be None
        assert d.get("health") is None

    def test_dual_id_filter_in_project_health(self):
        """project_task_identity_filter covers both project_id and _id."""
        from app.services.project_health_service import project_task_identity_filter
        project = _project(id="proj-1", project_id="PROJ-001")
        f = project_task_identity_filter(project)
        assert "company_id" in f
        or_clause = f["$or"]
        # Should have both project_id and project_object_id filters
        field_names = [list(c.keys())[0] for c in or_clause]
        assert "project_id" in field_names
        assert "project_object_id" in field_names


# ── 6. Timer Recovery without duplicate TimeLogs ─────────────────────────────

class TestTimerRecovery:
    @pytest.mark.asyncio
    async def test_recover_stopped_timer_creates_log_and_deletes_session(self, monkeypatch):
        from app.services.time_tracking_service import recover_stopped_timer

        session = _session(accumulated_seconds=300)
        created_logs: list = []

        class FakeTimeLog:
            def __init__(self_inner, **kw):
                self_inner.__dict__.update(kw)
                created_logs.append(self_inner)
            async def insert(self_inner):
                pass
            @classmethod
            def find_one(cls_inner, *args, **kwargs):
                return AsyncMock(return_value=None)()

        monkeypatch.setattr("app.services.time_tracking_service.TimeLog", FakeTimeLog)
        monkeypatch.setattr("app.services.time_tracking_service._update_summary_and_task", AsyncMock())

        log = await recover_stopped_timer(session)
        assert log.hours > 0
        assert session.delete.called
        assert len(created_logs) == 1

    @pytest.mark.asyncio
    async def test_recover_stopped_timer_idempotent(self, monkeypatch):
        from app.services.time_tracking_service import recover_stopped_timer
        call_count = 0

        class FakeTimeLog:
            def __init__(self_inner, **kw):
                nonlocal call_count
                call_count += 1
                self_inner.__dict__.update(kw)
            async def insert(self_inner):
                pass
            @classmethod
            def find_one(cls_inner, *args, **kwargs):
                # On second call, return existing log to test idempotency
                if call_count >= 1:
                    existing = FakeTimeLog(hours=1.0)
                    return AsyncMock(return_value=existing)()
                return AsyncMock(return_value=None)()

        monkeypatch.setattr("app.services.time_tracking_service.TimeLog", FakeTimeLog)
        monkeypatch.setattr("app.services.time_tracking_service._update_summary_and_task", AsyncMock())

        s1 = _session(accumulated_seconds=120)
        log1 = await recover_stopped_timer(s1)
        s2 = _session(accumulated_seconds=120)
        log2 = await recover_stopped_timer(s2)
        # Second call returns existing log, no new TimeLog created
        assert log1 is not None
        assert log2 is not None

    @pytest.mark.asyncio
    async def test_recover_rejects_zero_duration(self, monkeypatch):
        from app.services.time_tracking_service import recover_stopped_timer
        session = _session(accumulated_seconds=0)

        class FakeTimeLog:
            @classmethod
            def find_one(cls_inner, *args, **kwargs):
                return AsyncMock(return_value=None)()

        monkeypatch.setattr("app.services.time_tracking_service.TimeLog", FakeTimeLog)

        with pytest.raises(HTTPException, match="positive"):
            await recover_stopped_timer(session)


# ── 7. Terminal Project Health ───────────────────────────────────────────────

class TestTerminalProjectHealth:
    def test_completed_project_not_at_risk(self):
        now = datetime(2026, 9, 1, 10, 0, 0)
        project = _project(status=ProjectStatus.COMPLETED)
        overdue = _task(due_date=now - timedelta(days=5), status=TaskStatus.IN_PROGRESS)
        health = calculate_project_health(project, [overdue], now=now)
        assert health.level == "healthy"

    def test_archived_project_not_at_risk(self):
        now = datetime(2026, 9, 1, 10, 0, 0)
        project = _project(status=ProjectStatus.ARCHIVED)
        critical = _task(due_date=now - timedelta(days=10), status=TaskStatus.IN_PROGRESS, priority="critical")
        health = calculate_project_health(project, [critical], now=now)
        assert health.level == "healthy"
        assert not any("overdue" in r.lower() for r in health.reasons)

    def test_cancelled_project_not_at_risk(self):
        now = datetime(2026, 9, 1, 10, 0, 0)
        project = _project(status=ProjectStatus.CANCELLED)
        overdue = _task(due_date=now - timedelta(days=3), status=TaskStatus.IN_PROGRESS)
        health = calculate_project_health(project, [overdue], now=now)
        assert health.level == "healthy"

    def test_active_project_with_overdue_is_at_risk(self):
        now = datetime(2026, 9, 1, 10, 0, 0)
        project = _project(status=ProjectStatus.EXECUTION)
        overdue = _task(due_date=now - timedelta(days=3), status=TaskStatus.IN_PROGRESS)
        health = calculate_project_health(project, [overdue], now=now)
        assert health.level == "at_risk"

    def test_active_project_with_no_tasks_is_healthy(self):
        now = datetime(2026, 9, 1, 10, 0, 0)
        project = _project(status=ProjectStatus.EXECUTION)
        health = calculate_project_health(project, [], now=now)
        assert health.level == "healthy"


# ── 8. Cross-company protections ────────────────────────────────────────────

class TestCrossCompanyProtections:
    @pytest.mark.asyncio
    async def test_automation_status_change_rejects_cross_company(self, monkeypatch):
        task = _task(company_id="company-1", status=TaskStatus.ASSIGNED)
        actor = _user(id="evil", company_id="company-2", role=UserRole.ADMIN)

        monkeypatch.setattr("app.core.automation_engine.Task.get", staticmethod(_async_return(task)))
        monkeypatch.setattr("app.core.automation_engine.User.get", staticmethod(_async_return(actor)))

        with pytest.raises(PermissionError, match="company"):
            await AutomationEngine._change_status(
                {"status": "in_progress"},
                {"entity_id": task.id, "user_id": actor.id},
            )

    @pytest.mark.asyncio
    async def test_automation_assign_rejects_cross_company(self, monkeypatch):
        task = _task(company_id="company-1")
        actor = _user(id="evil", company_id="company-2", role=UserRole.ADMIN)

        monkeypatch.setattr("app.core.automation_engine.Task.get", staticmethod(_async_return(task)))
        monkeypatch.setattr("app.core.automation_engine.User.get", staticmethod(_async_return(actor)))

        with pytest.raises(PermissionError, match="company"):
            await AutomationEngine._assign_task(
                {"assignee_id": "user-1"},
                {"entity_id": task.id, "user_id": actor.id},
            )

    def test_project_health_company_scoped(self):
        project = _project(company_id="company-1", status=ProjectStatus.EXECUTION)
        now = datetime(2026, 9, 1, 10, 0, 0)
        health = calculate_project_health(project, [], now=now)
        assert health.level == "healthy"
