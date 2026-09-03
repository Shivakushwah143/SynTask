from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.models.project import ProjectStatus
from app.models.task import TaskStatus
from app.models.time_tracking import ActiveTimeSession, ActiveTimeSessionStatus, TimeLogSource
from app.models.user import UserRole
from app.core import automation_engine as automation_module
from app.services import project_completion_service as completion_module
from app.services import time_tracking_service as timer_module


class FakeQuery:
    def __init__(self, value=None):
        self.value = value

    async def find_one_and_update(self, update):
        return self.value

    def __await__(self):
        async def resolve():
            return self.value

        return resolve().__await__()

    async def to_list(self):
        return self.value or []


class FakeSession:
    def __init__(self, *, task_id, company_id="company-1", user_id="user-1", **kwargs):
        self.id = "session-1"
        self.task_id = task_id
        self.company_id = company_id
        self.user_id = user_id
        self.project_id = kwargs.get("project_id")
        self.client_id = kwargs.get("client_id")
        self.started_at = kwargs.get("started_at", datetime.now() - timedelta(minutes=5))
        self.last_resumed_at = kwargs.get("last_resumed_at", self.started_at)
        self.paused_at = kwargs.get("paused_at")
        self.accumulated_seconds = kwargs.get("accumulated_seconds", 0)
        self.status = kwargs.get("status", ActiveTimeSessionStatus.RUNNING)
        self.deleted = False

    async def insert(self):
        FakeSessionStore.active = self

    async def save(self):
        FakeSessionStore.active = self

    @classmethod
    def find_one(cls, query):
        session = FakeSessionStore.active
        if query.get("status"):
            statuses = query["status"]["$in"]
            if not session or session.status.value not in statuses:
                session = None
        elif session and (
            session.company_id != query.get("company_id")
            or session.user_id != query.get("user_id")
        ):
            session = None
        return FakeQuery(session)

    async def delete(self):
        self.deleted = True
        if FakeSessionStore.active is self:
            FakeSessionStore.active = None


class FakeSessionStore:
    active = None

    @classmethod
    def find_one(cls, query):
        session = cls.active
        if query.get("status"):
            statuses = query["status"]["$in"]
            if not session or session.status.value not in statuses:
                session = None
        elif session and (
            session.company_id != query.get("company_id")
            or session.user_id != query.get("user_id")
        ):
            session = None
        return FakeQuery(session)


class FakeTimeLog:
    records = []

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = f"log-{len(self.records) + 1}"

    async def insert(self):
        self.records.append(self)


class FakeTask:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.id = kwargs.get("id", "task-1")
        self.company_id = kwargs.get("company_id", "company-1")
        self.created_by = kwargs.get("created_by", "creator-1")
        self.status = kwargs.get("status", TaskStatus.ASSIGNED)
        self.assigned_to = kwargs.get("assigned_to", "user-1")
        self.project_id = kwargs.get("project_id")
        self.dependencies = kwargs.get("dependencies", [])
        self.review_required = kwargs.get("review_required")
        self.required_for_project_completion = kwargs.get("required_for_project_completion", True)
        self.title = kwargs.get("title", "Task")

    async def save(self):
        return self


@pytest.fixture
def actor():
    return SimpleNamespace(
        id="user-1",
        company_id="company-1",
        role=UserRole.EMPLOYEE,
        first_name="Test",
        last_name="User",
        email="user-1@example.com",
        full_name=lambda: "Test User",
    )


@pytest.mark.asyncio
async def test_assigned_task_start_timer_transitions_to_in_progress(monkeypatch, actor):
    task = FakeTask(status=TaskStatus.ASSIGNED)
    calls = []

    async def get_task(task_id):
        return task

    async def fake_transition(**kwargs):
        calls.append(kwargs)
        task.status = TaskStatus.IN_PROGRESS
        return task

    monkeypatch.setattr(timer_module.Task, "get", staticmethod(get_task))
    monkeypatch.setattr(timer_module, "load_task_project", lambda task: _none_async())
    monkeypatch.setattr(timer_module, "transition_task", fake_transition)
    monkeypatch.setattr(timer_module, "ActiveTimeSession", FakeSession)
    FakeSessionStore.active = None

    session = await timer_module.start_timer(task.id, actor)

    assert task.status == TaskStatus.IN_PROGRESS
    assert calls[0]["action"] == "start_work"
    assert "project" not in calls[0]
    assert session.task_id == task.id


async def _none_async():
    return None


@pytest.mark.asyncio
async def test_start_timer_is_idempotent_and_creates_one_session(monkeypatch, actor):
    task = FakeTask(status=TaskStatus.IN_PROGRESS)
    FakeSessionStore.active = None
    insert_count = 0

    async def get_task(task_id):
        return task

    async def insert(self):
        nonlocal insert_count
        if FakeSessionStore.active:
            raise DuplicateKeyError("duplicate active session")
        insert_count += 1
        FakeSessionStore.active = self

    monkeypatch.setattr(timer_module.Task, "get", staticmethod(get_task))
    monkeypatch.setattr(timer_module, "load_task_project", lambda task: _none_async())
    monkeypatch.setattr(timer_module.ActiveTimeSession, "find_one", FakeSession.find_one)
    monkeypatch.setattr(FakeSession, "insert", insert)
    monkeypatch.setattr(timer_module, "ActiveTimeSession", FakeSession)

    first = await timer_module.start_timer(task.id, actor)
    second = await timer_module.start_timer(task.id, actor)

    assert first is second
    assert first.task_id == second.task_id == task.id
    assert insert_count == 1


@pytest.mark.asyncio
async def test_stop_timer_is_atomic_and_creates_one_time_log(monkeypatch, actor):
    FakeSessionStore.active = FakeSession(task_id="task-1", accumulated_seconds=120)
    FakeTimeLog.records = []

    class ClaimQuery:
        async def find_one_and_update(self, update):
            session = FakeSessionStore.active
            if not session or session.status != ActiveTimeSessionStatus.RUNNING:
                return None
            FakeSessionStore.active = None
            return session

    monkeypatch.setattr(timer_module.ActiveTimeSession, "find_one", lambda query: ClaimQuery())
    monkeypatch.setattr(timer_module, "TimeLog", FakeTimeLog)
    monkeypatch.setattr(timer_module, "_update_summary_and_task", lambda *args: _none_async())

    first = await timer_module.stop_timer(actor)
    with pytest.raises(HTTPException):
        await timer_module.stop_timer(actor)

    assert first.source == TimeLogSource.TIMER
    assert len(FakeTimeLog.records) == 1


@pytest.mark.asyncio
async def test_automation_status_uses_workflow_and_rejects_review_bypass(monkeypatch):
    task = FakeTask(status=TaskStatus.ASSIGNED, project_id="project-1", review_required=True)
    actor = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.ADMIN, full_name=lambda: "Manager")
    workflow_calls = []

    async def get_task(task_id):
        return task

    async def get_user(user_id):
        return actor

    async def fake_transition(**kwargs):
        workflow_calls.append(kwargs)
        raise HTTPException(status_code=400, detail="Task must be approved before completion.")

    monkeypatch.setattr(automation_module.Task, "get", staticmethod(get_task))
    monkeypatch.setattr(automation_module.User, "get", staticmethod(get_user))
    monkeypatch.setattr("app.services.task_workflow.transition_task", fake_transition)

    with pytest.raises(HTTPException):
        await automation_module.AutomationEngine._change_status(
            {"status": "completed"},
            {"entity_id": task.id, "user_id": actor.id},
        )

    assert workflow_calls[0]["action"] == "complete"
    assert task.status == TaskStatus.ASSIGNED


@pytest.mark.asyncio
async def test_automation_respects_blocked_dependencies(monkeypatch):
    dependency = FakeTask(id="dependency-1", status=TaskStatus.IN_PROGRESS)
    task = FakeTask(status=TaskStatus.ASSIGNED, dependencies=[dependency.id])
    actor = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.ADMIN, full_name=lambda: "Manager")
    tasks = {task.id: task, dependency.id: dependency}

    async def get_task(task_id):
        return tasks.get(task_id)

    async def get_user(user_id):
        return actor

    monkeypatch.setattr(automation_module.Task, "get", staticmethod(get_task))
    monkeypatch.setattr(automation_module.User, "get", staticmethod(get_user))

    with pytest.raises(HTTPException) as error:
        await automation_module.AutomationEngine._change_status(
            {"status": "in_progress"},
            {"entity_id": task.id, "user_id": actor.id},
        )

    assert error.value.status_code == 400
    assert task.status == TaskStatus.ASSIGNED


@pytest.mark.asyncio
async def test_automation_respects_review_approval(monkeypatch):
    task = FakeTask(status=TaskStatus.IN_REVIEW, project_id="project-1", review_required=True)
    actor = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.ADMIN, full_name=lambda: "Manager")

    async def get_task(task_id):
        return task

    async def get_user(user_id):
        return actor

    monkeypatch.setattr(automation_module.Task, "get", staticmethod(get_task))
    monkeypatch.setattr(automation_module.User, "get", staticmethod(get_user))
    monkeypatch.setattr(ActiveTimeSession, "find_one", staticmethod(lambda *args, **kwargs: _none_async()))

    with pytest.raises(HTTPException) as error:
        await automation_module.AutomationEngine._change_status(
            {"status": "completed"},
            {"entity_id": task.id, "user_id": actor.id},
        )

    assert error.value.status_code == 400
    assert task.status == TaskStatus.IN_REVIEW


@pytest.mark.asyncio
async def test_automation_direct_workflow_field_update_is_rejected():
    with pytest.raises(ValueError):
        await automation_module.AutomationEngine._update_field(
            {"field": "status", "value": "completed"},
            {"entity_id": "task-1"},
        )


@pytest.mark.asyncio
async def test_cancelled_required_task_blocks_completion(monkeypatch):
    task = FakeTask(status=TaskStatus.CANCELLED, required_for_project_completion=True)
    project = SimpleNamespace(
        id="project-1", project_id=None, company_id="company-1", status=ProjectStatus.EXECUTION,
        lead_id="manager-1",
    )
    actor = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)

    monkeypatch.setattr(completion_module.Task, "find", lambda *args, **kwargs: FakeQuery([task]))
    monkeypatch.setattr(completion_module.ActiveTimeSession, "find", lambda *args, **kwargs: FakeQuery([]))
    monkeypatch.setattr(completion_module.WorkRequest, "find", lambda *args, **kwargs: FakeQuery([]))

    readiness = await completion_module.completion_readiness(project, actor)
    assert readiness["ready"] is False
    assert readiness["completed_required_tasks"] == 0


@pytest.mark.asyncio
async def test_optional_cancelled_task_does_not_block_completion(monkeypatch):
    task = FakeTask(status=TaskStatus.CANCELLED, required_for_project_completion=False)
    project = SimpleNamespace(
        id="project-1", project_id=None, company_id="company-1", status=ProjectStatus.EXECUTION,
        lead_id="manager-1",
    )
    actor = SimpleNamespace(id="manager-1", company_id="company-1", role=UserRole.MANAGER)

    monkeypatch.setattr(completion_module.Task, "find", lambda *args, **kwargs: FakeQuery([task]))
    monkeypatch.setattr(completion_module.ActiveTimeSession, "find", lambda *args, **kwargs: FakeQuery([]))
    monkeypatch.setattr(completion_module.WorkRequest, "find", lambda *args, **kwargs: FakeQuery([]))

    readiness = await completion_module.completion_readiness(project, actor)
    assert readiness["ready"] is True
    assert readiness["required_tasks"] == 0
