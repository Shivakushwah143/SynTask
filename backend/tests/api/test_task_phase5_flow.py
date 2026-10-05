from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.api.v1.endpoints import tasks as tasks_api
from app.models.task import TaskExtensionStatus, TaskHealthStatus, TaskStatus
from app.services import task_health_service
from app.services.task_health_service import build_task_health_summary
from app.services.task_service import TaskService


class _Value:
    def __init__(self, value: str):
        self.value = value


class FakeTask:
    saved = None
    inserted = None
    records = {}

    def __init__(self, **data):
        self.id = data.get("id", "task-1")
        self.title = data["title"]
        self.description = data.get("description")
        self.company_id = data["company_id"]
        self.project_id = data.get("project_id")
        self.project_object_id = data.get("project_object_id")
        self.created_by = data["created_by"]
        self.assigned_to = data.get("assigned_to")
        self.assigned_by = data.get("assigned_by")
        self.department_id = data.get("department_id")
        self.department = data.get("department")
        self.status = data.get("status", TaskStatus.TODO)
        self.priority = data.get("priority", SimpleNamespace(value="medium"))
        self.progress_percentage = data.get("progress_percentage", 0.0)
        self.expected_completion_time = data.get("expected_completion_time")
        self.due_date = data.get("due_date")
        self.start_date = data.get("start_date")
        self.completed_at = data.get("completed_at")
        self.health_status = data.get("health_status", TaskHealthStatus.HEALTHY)
        self.health_updated_at = data.get("health_updated_at", datetime(2026, 7, 10, 9, 0, 0))
        self.extension_count = data.get("extension_count", 0)
        self.tags = list(data.get("tags", []))
        self.attachments = list(data.get("attachments", []))
        self.parent_task_id = data.get("parent_task_id")
        self.story_points = data.get("story_points")
        self.estimated_hours = data.get("estimated_hours")
        self.actual_hours = data.get("actual_hours")
        self.time_logs = list(data.get("time_logs", []))
        self.checklist = list(data.get("checklist", []))
        self.dependencies = list(data.get("dependencies", []))
        self.issue_type_id = data.get("issue_type_id")
        self.component_id = data.get("component_id")
        self.fix_version_id = data.get("fix_version_id")
        self.affects_version_ids = list(data.get("affects_version_ids", []))
        self.resolution = data.get("resolution")
        self.resolved_at = data.get("resolved_at")
        self.resolved_by = data.get("resolved_by")
        self.created_at = data.get("created_at", datetime(2026, 7, 10, 9, 0, 0))
        self.updated_at = data.get("updated_at", self.created_at)
        # Phase 2: Workflow fields
        self.reviewer_id = data.get("reviewer_id")
        self.review_required = data.get("review_required")
        self.review_round = data.get("review_round", 0)
        self.submitted_for_review_at = data.get("submitted_for_review_at")
        self.submitted_for_review_by = data.get("submitted_for_review_by")
        self.revision_requested_at = data.get("revision_requested_at")
        self.revision_requested_by = data.get("revision_requested_by")
        self.latest_revision_reason = data.get("latest_revision_reason")
        self.approved_at = data.get("approved_at")
        self.approved_by = data.get("approved_by")
        self.completed_by = data.get("completed_by")
        self.status_changed_at = data.get("status_changed_at")
        self.assigned_at = data.get("assigned_at")
        self.source_type = data.get("source_type")
        self.task_type = data.get("task_type", SimpleNamespace(value="standard"))
        self.measurement_type = data.get("measurement_type")
        self.custom_measurement_label = data.get("custom_measurement_label")
        self.target_quantity = data.get("target_quantity")
        self.target_unit = data.get("target_unit")
        self.completed_quantity = data.get("completed_quantity", 0)

    async def insert(self):
        FakeTask.inserted = self
        FakeTask.records[str(self.id)] = self
        return self

    async def save(self):
        FakeTask.saved = self
        FakeTask.records[str(self.id)] = self
        return self

    async def delete(self):
        FakeTask.records.pop(str(self.id), None)

    @classmethod
    async def get(cls, task_id):
        return cls.records.get(str(task_id))

    @classmethod
    def find(cls, query):
        return FakeTaskQuery([task for task in cls.records.values() if _matches_task_query(task, query)])


class FakeTaskQuery:
    def __init__(self, items):
        self.items = list(items)

    def skip(self, value):
        self.items = self.items[value:]
        return self

    def limit(self, value):
        self.items = self.items[:value]
        return self

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self):
        return list(self.items)

    async def count(self):
        return len(self.items)


class _Field:
    def __init__(self, name):
        self.field = name
        self.value = None

    def __eq__(self, other):
        self.value = other
        return self


class FakeExtensionRequest:
    saved = None
    records = {}

    def __init__(self, **data):
        self.id = data.get("id", "request-1")
        self.task_id = data["task_id"]
        self.company_id = data["company_id"]
        self.employee_id = data["employee_id"]
        self.current_due_date = data["current_due_date"]
        self.requested_due_date = data["requested_due_date"]
        self.reason = data["reason"]
        self.status = data.get("status", TaskExtensionStatus.PENDING)
        self.reviewed_by = data.get("reviewed_by")
        self.reviewed_at = data.get("reviewed_at")
        self.review_comment = data.get("review_comment")
        self.created_at = data.get("created_at", datetime(2026, 7, 10, 9, 0, 0))
        self.updated_at = data.get("updated_at", self.created_at)

    task_id = _Field("task_id")
    status = _Field("status")

    async def insert(self):
        FakeExtensionRequest.records[str(self.id)] = self
        return self

    async def save(self):
        FakeExtensionRequest.saved = self
        FakeExtensionRequest.records[str(self.id)] = self
        return self

    @classmethod
    async def get(cls, request_id):
        return cls.records.get(str(request_id))

    @classmethod
    async def find_one(cls, *filters, **kwargs):
        items = list(cls.records.values())
        for item in filters:
            if hasattr(item, "field") and item.field == "task_id":
                items = [request for request in items if request.task_id == item.value]
            if hasattr(item, "field") and item.field == "status":
                items = [request for request in items if request.status == item.value]
        return items[0] if items else None

    @classmethod
    def find(cls, *filters, **kwargs):
        items = list(cls.records.values())
        if filters:
            for item in filters:
                if hasattr(item, "field") and item.field == "task_id":
                    items = [request for request in items if request.task_id == item.value]
        return FakeExtensionRequestQuery(items)


class FakeExtensionRequestQuery:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self):
        return list(self.items)


def _matches_task_query(task, query):
    if not query:
        return True
    for key, expected in query.items():
        actual = getattr(task, key, None)
        if isinstance(expected, dict) and "$ne" in expected:
            if actual == expected["$ne"]:
                return False
            continue
        if isinstance(expected, dict) and "$in" in expected:
            if actual not in expected["$in"]:
                return False
            continue
        if actual != expected:
            return False
    return True


class FakeUser:
    def __init__(self, user_id="user-1", role="employee", company_id="company-1", reports_to=None, ancestors=None):
        self.id = user_id
        self.role = role
        self.company_id = company_id
        self.first_name = "Test"
        self.last_name = user_id
        self.reports_to = reports_to
        self.ancestors = ancestors or []
        self.department_id = "dept-1"

    def full_name(self):
        return f"User {self.id}"

    async def get_all_subordinates(self):
        return []


class DummyBackgroundTasks(BackgroundTasks):
    def __init__(self):
        super().__init__()
        self.calls = []

    def add_task(self, func, *args, **kwargs):
        self.calls.append((func, args, kwargs))


async def _noop_async(*args, **kwargs):
    return None


async def _fake_user_get(user_id):
    return FakeUser(user_id=user_id, role="employee", company_id="company-1")


@pytest.fixture(autouse=True)
def reset_task_fakes():
    FakeTask.saved = None
    FakeTask.inserted = None
    FakeTask.records = {}
    FakeExtensionRequest.saved = None
    FakeExtensionRequest.records = {}
    yield


@pytest.mark.asyncio
async def test_task_create_persists_changes(monkeypatch):
    monkeypatch.setattr(tasks_api, "Task", FakeTask)
    monkeypatch.setattr(tasks_api, "check_company_access", lambda *args, **kwargs: None)
    monkeypatch.setattr(tasks_api, "sync_task_health", _noop_async)
    monkeypatch.setattr(tasks_api, "publish_event", _noop_async)
    monkeypatch.setattr(tasks_api, "build_domain_event", lambda **kwargs: kwargs)
    monkeypatch.setattr(tasks_api, "cache_delete_pattern", _noop_async)
    monkeypatch.setattr(tasks_api, "User", SimpleNamespace(get=_fake_user_get))
    monkeypatch.setattr(tasks_api, "create_timeline_event", _noop_async)
    monkeypatch.setattr(tasks_api, "_assert_task_view", _noop_async)
    monkeypatch.setattr(tasks_api, "_assert_task_manage", _noop_async)
    # Phase 2: task_service.create_task_core does local imports from tasks.py
    monkeypatch.setattr(tasks_api, "_resolve_department", _noop_async)
    monkeypatch.setattr(tasks_api, "_assert_can_assign_task", _noop_async)
    monkeypatch.setattr(tasks_api, "_can_access_project_for_task", lambda *a, **kw: True)
    monkeypatch.setattr(tasks_api, "_send_task_side_effects", _noop_async)
    # Patch Task and Project in the task_service module for local imports
    import app.services.task_service as _ts
    monkeypatch.setattr(_ts, "Task", FakeTask)
    import app.models.task as _mt
    monkeypatch.setattr(_mt, "Task", FakeTask)
    monkeypatch.setattr(_ts, "Project", SimpleNamespace(find_one=lambda *a, **kw: None))

    current_user = FakeUser(user_id="creator-1", role="admin")
    background_tasks = DummyBackgroundTasks()

    result = await tasks_api.create_task(
        background_tasks=background_tasks,
        title="Created task",
        description="Created description",
        assigned_to=None,
        priority="medium",
        due_date="2026-07-16",
        tags="alpha, beta",
        parent_task_id=None,
        project_id=None,
        epic_id="",
        sprint_id="",
        department_id=None,
        story_points=None,
        estimated_hours=None,
        task_type="standard",
        measurement_type=None,
        custom_measurement_label=None,
        target_quantity=None,
        target_unit=None,
        reviewer_id=None,
        review_required=None,
        current_user=current_user,
    )

    assert result["title"] == "Created task"
    assert result["status"] == TaskStatus.TODO.value
    assert FakeTask.inserted is not None
    assert FakeTask.records["task-1"].description == "Created description"
    assert FakeTask.records["task-1"].tags == ["alpha", "beta"]


@pytest.mark.asyncio
async def test_task_update_persists_changes(monkeypatch):
    task = FakeTask(
        id="task-1",
        title="Original",
        description="Keep me",
        company_id="company-1",
        created_by="creator-1",
        assigned_to="user-1",
        status=TaskStatus.TODO,
        priority=_Value("medium"),
        due_date=datetime(2026, 7, 15, 9, 0, 0),
        tags=["alpha"],
        department_id="dept-1",
        department="Ops",
        extension_count=0,
    )
    FakeTask.records[task.id] = task

    monkeypatch.setattr(tasks_api, "Task", FakeTask)
    monkeypatch.setattr(tasks_api, "TaskService", SimpleNamespace(update_status=TaskService.update_status))
    monkeypatch.setattr(tasks_api, "sync_task_health", _noop_async)
    monkeypatch.setattr(tasks_api, "check_company_access", lambda *args, **kwargs: None)
    monkeypatch.setattr(tasks_api, "publish_event", _noop_async)
    monkeypatch.setattr(tasks_api, "build_domain_event", lambda **kwargs: kwargs)
    monkeypatch.setattr(tasks_api, "cache_delete_pattern", _noop_async)
    monkeypatch.setattr(tasks_api, "User", SimpleNamespace(get=_fake_user_get))
    monkeypatch.setattr(tasks_api, "create_timeline_event", _noop_async)
    async def _fake_ltp(*a, **kw): return None
    monkeypatch.setattr(tasks_api, "load_task_project", _fake_ltp)
    monkeypatch.setattr(tasks_api, "has_project_permission", lambda *a, **kw: True)

    current_user = FakeUser(role="admin")

    result = await tasks_api.update_task(
        task_id="task-1",
        title="Updated",
        description="Keep me",
        assigned_to="",
        priority="high",
        due_date="2026-07-16",
        tags="alpha, beta",
        issue_type_id="",
        component_id="",
        fix_version_id="",
        department_id="",
        start_date=None,
        story_points="5",
        estimated_hours="8",
        task_type=None,
        measurement_type=None,
        custom_measurement_label=None,
        target_quantity=None,
        target_unit=None,
        completed_quantity=None,
        reviewer_id=None,
        review_required=None,
        current_user=current_user,
    )

    assert result["title"] == "Updated"
    assert result["priority"] == "high"
    assert result["tags"] == ["alpha", "beta"]
    assert FakeTask.records["task-1"].description == "Keep me"


@pytest.mark.asyncio
async def test_task_status_transition_updates_state(monkeypatch):
    task = FakeTask(
        id="task-2",
        title="Status task",
        company_id="company-1",
        created_by="creator-1",
        assigned_to="user-1",
        status=TaskStatus.TODO,
        priority=_Value("medium"),
        due_date=datetime(2026, 7, 15, 9, 0, 0),
    )
    FakeTask.records[task.id] = task

    async def fake_sync_task_health(task):
        task.health_status = TaskHealthStatus.HEALTHY
        return task

    monkeypatch.setattr(tasks_api, "Task", FakeTask)
    monkeypatch.setattr(tasks_api, "sync_task_health", fake_sync_task_health)
    monkeypatch.setattr(tasks_api, "_assert_task_view", _noop_async)
    monkeypatch.setattr(tasks_api, "check_company_access", lambda *args, **kwargs: None)
    monkeypatch.setattr(tasks_api, "publish_event", _noop_async)
    monkeypatch.setattr(tasks_api, "build_domain_event", lambda **kwargs: kwargs)
    monkeypatch.setattr(tasks_api, "create_timeline_event", _noop_async)
    # Phase 2: mock workflow service for transition_task
    async def fake_transition_task(**kwargs):
        t = kwargs["task"]
        target = kwargs.get("target_status")
        if target:
            from app.models.task import TaskStatus as TS
            t.status = TS(target) if isinstance(target, str) else target
            if t.status == TaskStatus.COMPLETED:
                t.completed_at = datetime(2026, 7, 15, 12, 0, 0)
        t.updated_at = datetime(2026, 7, 15, 12, 0, 0)
        t.saved = True
        return t
    monkeypatch.setattr(tasks_api, "transition_task", fake_transition_task)
    async def _fake_load_task_project(*a, **kw): return None
    monkeypatch.setattr(tasks_api, "load_task_project", _fake_load_task_project)
    monkeypatch.setattr(tasks_api, "has_project_permission", lambda *a, **kw: True)
    import app.services.task_workflow as _wf_ts
    monkeypatch.setattr(_wf_ts, "transition_task", fake_transition_task)
    monkeypatch.setattr("app.services.task_health_service.sync_task_health", fake_sync_task_health)
    async def _fake_serialize(task, user, **kw):
        return {"id": str(task.id), "title": task.title, "status": task.status.value if hasattr(task.status, "value") else str(task.status)}
    monkeypatch.setattr(tasks_api, "serialize_task_response", _fake_serialize)

    current_user = FakeUser(role="admin")
    result = await tasks_api.update_task_status(task_id="task-2", new_status="completed", current_user=current_user)

    assert result["task"]["status"] == "completed"
    assert FakeTask.records["task-2"].status == TaskStatus.COMPLETED
    assert FakeTask.records["task-2"].completed_at is not None

    with pytest.raises(HTTPException) as exc_info:
        await tasks_api.update_task_status(task_id="task-2", new_status="bad-status", current_user=current_user)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_extension_request_create_and_list(monkeypatch):
    task = FakeTask(
        id="task-3",
        title="Extension task",
        company_id="company-1",
        created_by="manager-1",
        assigned_to="employee-1",
        status=TaskStatus.IN_PROGRESS,
        priority=_Value("medium"),
        due_date=datetime(2026, 7, 15, 9, 0, 0),
    )
    FakeTask.records[task.id] = task

    monkeypatch.setattr(tasks_api, "Task", FakeTask)
    monkeypatch.setattr(tasks_api, "TaskExtensionRequest", FakeExtensionRequest)
    monkeypatch.setattr(task_health_service, "Task", FakeTask)
    monkeypatch.setattr(task_health_service, "TaskExtensionRequest", FakeExtensionRequest)
    monkeypatch.setattr(tasks_api, "assert_task_view_access", _noop_async)
    monkeypatch.setattr(tasks_api, "create_timeline_event", _noop_async)
    monkeypatch.setattr(tasks_api, "check_company_access", lambda *args, **kwargs: None)
    monkeypatch.setattr(task_health_service, "User", SimpleNamespace(get=_fake_user_get))
    monkeypatch.setattr(task_health_service, "create_timeline_event", _noop_async)

    employee = FakeUser(user_id="employee-1", role="employee")
    created = await tasks_api.request_task_extension(
        task_id="task-3",
        requested_due_date="2026-07-18T09:00:00",
        reason="Blocked by dependency",
        current_user=employee,
    )

    assert created["request"]["status"] == "pending"
    assert FakeExtensionRequest.records[created["request"]["id"]].reason == "Blocked by dependency"

    query = await tasks_api.list_task_extension_requests(task_id="task-3", current_user=employee)
    assert len(query["requests"]) == 1
    assert query["requests"][0]["id"] == created["request"]["id"]


@pytest.mark.asyncio
async def test_extension_request_approve_updates_task(monkeypatch):
    task = FakeTask(
        id="task-4",
        title="Approve task",
        company_id="company-1",
        created_by="manager-1",
        assigned_to="employee-1",
        status=TaskStatus.IN_PROGRESS,
        priority=_Value("medium"),
        due_date=datetime(2026, 7, 15, 9, 0, 0),
        health_status=TaskHealthStatus.HEALTHY,
    )
    FakeTask.records[task.id] = task
    request = FakeExtensionRequest(
        id="request-4",
        task_id="task-4",
        company_id="company-1",
        employee_id="employee-1",
        current_due_date=task.due_date,
        requested_due_date=datetime(2026, 7, 20, 9, 0, 0),
        reason="Need more time",
    )
    FakeExtensionRequest.records[request.id] = request

    monkeypatch.setattr(tasks_api, "Task", FakeTask)
    monkeypatch.setattr(tasks_api, "TaskExtensionRequest", FakeExtensionRequest)
    monkeypatch.setattr(task_health_service, "Task", FakeTask)
    monkeypatch.setattr(task_health_service, "TaskExtensionRequest", FakeExtensionRequest)
    monkeypatch.setattr(tasks_api, "assert_task_manage_access", _noop_async)
    monkeypatch.setattr(tasks_api, "create_timeline_event", _noop_async)
    monkeypatch.setattr(task_health_service, "create_timeline_event", _noop_async)
    monkeypatch.setattr(task_health_service, "User", SimpleNamespace(get=_fake_user_get))

    reviewer = FakeUser(user_id="manager-1", role="manager")
    result = await tasks_api.approve_task_extension(request_id="request-4", comment="Approved", current_user=reviewer)

    assert result["request"]["status"] == "approved"
    assert FakeTask.records["task-4"].due_date == datetime(2026, 7, 20, 9, 0, 0)
    assert FakeTask.records["task-4"].extension_count == 1
    assert FakeTask.records["task-4"].health_status == TaskHealthStatus.EXTENDED


@pytest.mark.asyncio
async def test_extension_request_reject_preserves_expected_state(monkeypatch):
    task = FakeTask(
        id="task-5",
        title="Reject task",
        company_id="company-1",
        created_by="manager-1",
        assigned_to="employee-1",
        status=TaskStatus.IN_PROGRESS,
        priority=_Value("medium"),
        due_date=datetime(2026, 7, 15, 9, 0, 0),
        health_status=TaskHealthStatus.HEALTHY,
    )
    FakeTask.records[task.id] = task
    request = FakeExtensionRequest(
        id="request-5",
        task_id="task-5",
        company_id="company-1",
        employee_id="employee-1",
        current_due_date=task.due_date,
        requested_due_date=datetime(2026, 7, 20, 9, 0, 0),
        reason="Need more time",
    )
    FakeExtensionRequest.records[request.id] = request

    async def fake_sync_task_health(task, now=None):
        task.health_status = TaskHealthStatus.HEALTHY
        task.health_updated_at = now or datetime(2026, 7, 15, 12, 0, 0)
        return task

    monkeypatch.setattr(tasks_api, "Task", FakeTask)
    monkeypatch.setattr(tasks_api, "TaskExtensionRequest", FakeExtensionRequest)
    monkeypatch.setattr(task_health_service, "Task", FakeTask)
    monkeypatch.setattr(task_health_service, "TaskExtensionRequest", FakeExtensionRequest)
    monkeypatch.setattr(tasks_api, "assert_task_manage_access", _noop_async)
    monkeypatch.setattr(tasks_api, "sync_task_health", fake_sync_task_health)
    monkeypatch.setattr(tasks_api, "create_timeline_event", _noop_async)
    monkeypatch.setattr(task_health_service, "sync_task_health", fake_sync_task_health)
    monkeypatch.setattr(task_health_service, "create_timeline_event", _noop_async)
    monkeypatch.setattr(task_health_service, "User", SimpleNamespace(get=_fake_user_get))

    reviewer = FakeUser(user_id="manager-1", role="manager")
    result = await tasks_api.reject_task_extension(request_id="request-5", comment="Rejected", current_user=reviewer)

    assert result["request"]["status"] == "rejected"
    assert FakeTask.records["task-5"].due_date == datetime(2026, 7, 15, 9, 0, 0)
    assert FakeTask.records["task-5"].extension_count == 0
    assert FakeTask.records["task-5"].health_status == TaskHealthStatus.HEALTHY


@pytest.mark.asyncio
async def test_task_health_sync_matches_expected_summary(monkeypatch):
    task = FakeTask(
        id="task-6",
        title="Health task",
        company_id="company-1",
        created_by="creator-1",
        assigned_to="employee-1",
        status=TaskStatus.IN_PROGRESS,
        priority=_Value("medium"),
        due_date=datetime(2026, 7, 13, 9, 0, 0),
        health_status=TaskHealthStatus.HEALTHY,
    )
    FakeTask.records[task.id] = task

    monkeypatch.setattr(tasks_api, "Task", FakeTask)
    monkeypatch.setattr(tasks_api, "assert_task_view_access", _noop_async)
    monkeypatch.setattr(task_health_service, "Task", FakeTask)
    async def fake_summary_sync(task, now=None):
        due_today = task.due_date and task.due_date.date() == datetime(2026, 7, 13).date()
        task.health_status = TaskHealthStatus.DUE_TODAY if due_today else task.health_status
        return task
    monkeypatch.setattr(task_health_service, "sync_task_health", fake_summary_sync)
    monkeypatch.setattr(task_health_service, "User", SimpleNamespace(get=_fake_user_get))
    monkeypatch.setattr(tasks_api, "sync_task_health", fake_summary_sync)

    current_user = FakeUser(user_id="employee-1", role="employee")
    result = await tasks_api.get_task_health(task_id="task-6", current_user=current_user)

    assert result["task"]["health_status"] == TaskHealthStatus.DUE_TODAY.value
    assert FakeTask.records["task-6"].health_status == TaskHealthStatus.DUE_TODAY

    summary = await build_task_health_summary(current_user)
    assert summary["total"] == 1
    assert summary["summary"][TaskHealthStatus.DUE_TODAY.value] == 1


@pytest.mark.asyncio
async def test_task_lifecycle_end_to_end(monkeypatch):
    task = FakeTask(
        id="task-7",
        title="Lifecycle task",
        description="Initial",
        company_id="company-1",
        created_by="manager-1",
        assigned_to="employee-1",
        status=TaskStatus.TODO,
        priority=_Value("medium"),
        due_date=datetime(2026, 7, 15, 9, 0, 0),
        health_status=TaskHealthStatus.HEALTHY,
        tags=["initial"],
    )
    FakeTask.records[task.id] = task

    monkeypatch.setattr(tasks_api, "Task", FakeTask)
    monkeypatch.setattr(tasks_api, "TaskExtensionRequest", FakeExtensionRequest)
    monkeypatch.setattr(tasks_api, "TaskService", TaskService)
    monkeypatch.setattr(task_health_service, "Task", FakeTask)
    monkeypatch.setattr(task_health_service, "TaskExtensionRequest", FakeExtensionRequest)
    monkeypatch.setattr(tasks_api, "check_company_access", lambda *args, **kwargs: None)
    monkeypatch.setattr(tasks_api, "assert_task_view_access", _noop_async)
    monkeypatch.setattr(tasks_api, "assert_task_manage_access", _noop_async)
    monkeypatch.setattr(tasks_api, "_assert_task_view", _noop_async)
    monkeypatch.setattr(tasks_api, "_assert_task_manage", _noop_async)
    monkeypatch.setattr(tasks_api, "publish_event", _noop_async)
    monkeypatch.setattr(tasks_api, "build_domain_event", lambda **kwargs: kwargs)
    async def fake_sync_task_health(task, now=None):
        task.health_status = TaskHealthStatus.EXTENDED if int(getattr(task, "extension_count", 0) or 0) else TaskHealthStatus.DUE_TODAY
        return task

    monkeypatch.setattr(tasks_api, "create_timeline_event", _noop_async)
    monkeypatch.setattr(tasks_api, "cache_delete_pattern", _noop_async)
    monkeypatch.setattr(task_health_service, "create_timeline_event", _noop_async)
    monkeypatch.setattr(task_health_service, "sync_task_health", fake_sync_task_health)
    monkeypatch.setattr(tasks_api, "sync_task_health", fake_sync_task_health)
    monkeypatch.setattr(task_health_service, "User", SimpleNamespace(get=_fake_user_get))
    monkeypatch.setattr(tasks_api, "User", SimpleNamespace(get=_fake_user_get))
    # Phase 2: mock load_task_project and has_project_permission for workflow checks
    async def _fake_load_tp2(*a, **kw): return None
    monkeypatch.setattr(tasks_api, "load_task_project", _fake_load_tp2)
    monkeypatch.setattr(tasks_api, "has_project_permission", lambda *a, **kw: True)


    current_user = FakeUser(user_id="manager-1", role="manager")
    employee = FakeUser(user_id="employee-1", role="employee")
    created = await tasks_api.update_task(
        task_id="task-7",
        title="Lifecycle updated",
        description="Updated",
        assigned_to="employee-1",
        priority="high",
        due_date="2026-07-16",
        tags="initial, phase5",
        issue_type_id="",
        component_id="",
        fix_version_id="",
        department_id="",
        start_date=None,
        story_points="3",
        estimated_hours="6",
        task_type=None,
        measurement_type=None,
        custom_measurement_label=None,
        target_quantity=None,
        target_unit=None,
        completed_quantity=None,
        reviewer_id=None,
        review_required=None,
        current_user=current_user,
    )

    assert created["title"] == "Lifecycle updated"
    assert FakeTask.records["task-7"].priority.value == "high"

    request = await tasks_api.request_task_extension(
        task_id="task-7",
        requested_due_date="2026-07-20T09:00:00",
        reason="Blocked",
        current_user=employee,
    )
    assert request["request"]["status"] == "pending"

    reviewed = await tasks_api.approve_task_extension(
        request_id=request["request"]["id"],
        comment="Approved",
        current_user=current_user,
    )
    assert reviewed["request"]["status"] == "approved"

    health = await tasks_api.get_task_health(task_id="task-7", current_user=current_user)
    assert health["task"]["health_status"] == TaskHealthStatus.EXTENDED.value

    summary_user = FakeUser(user_id="employee-1", role="employee")
    summary = await build_task_health_summary(summary_user)
    assert summary["summary"][TaskHealthStatus.EXTENDED.value] == 1
    assert FakeTask.records["task-7"].extension_count == 1
    assert FakeTask.records["task-7"].due_date == datetime(2026, 7, 20, 9, 0, 0)
