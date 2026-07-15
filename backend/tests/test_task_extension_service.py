from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import HTTPException

from app.models.task import TaskExtensionStatus, TaskHealthStatus, TaskStatus
from app.services import task_health_service as service


class FakeTask:
    records = {}

    def __init__(self, **data):
        self.id = data.get("id", "task-1")
        self.title = data.get("title", "Task")
        self.company_id = data.get("company_id", "company-1")
        self.project_id = data.get("project_id")
        self.created_by = data.get("created_by", "manager-1")
        self.assigned_to = data.get("assigned_to", "employee-1")
        self.status = data.get("status", TaskStatus.TODO)
        self.due_date = data.get("due_date", datetime(2026, 7, 15, 9, 0, 0))
        self.extension_count = data.get("extension_count", 0)
        self.health_status = data.get("health_status", TaskHealthStatus.HEALTHY)
        self.health_updated_at = data.get("health_updated_at")
        self.updated_at = data.get("updated_at")
        self.saved = False
        FakeTask.records[str(self.id)] = self

    async def save(self):
        self.saved = True
        FakeTask.records[str(self.id)] = self
        return self

    @classmethod
    async def get(cls, task_id):
        return cls.records.get(str(task_id))


class _Field:
    def __init__(self, name):
        self.field = name
        self.value = None

    def __eq__(self, other):
        self.value = other
        return self


class FakeRequest:
    records = {}

    task_id = _Field("task_id")
    status = _Field("status")
    company_id = _Field("company_id")
    employee_id = _Field("employee_id")

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
        self.saved = False
        FakeRequest.records[str(self.id)] = self

    async def insert(self):
        FakeRequest.records[str(self.id)] = self
        return self

    async def save(self):
        self.saved = True
        FakeRequest.records[str(self.id)] = self
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
            if hasattr(item, "field") and item.field == "employee_id":
                items = [request for request in items if request.employee_id == item.value]
            if hasattr(item, "field") and item.field == "company_id":
                items = [request for request in items if request.company_id == item.value]
        return items[0] if items else None

    @classmethod
    def find(cls, *filters, **kwargs):
        items = list(cls.records.values())
        for item in filters:
            if hasattr(item, "field") and item.field == "task_id":
                items = [request for request in items if request.task_id == item.value]
            if hasattr(item, "field") and item.field == "company_id":
                items = [request for request in items if request.company_id == item.value]
            if hasattr(item, "field") and item.field == "employee_id":
                items = [request for request in items if request.employee_id == item.value]
            if hasattr(item, "field") and item.field == "status":
                items = [request for request in items if request.status == item.value]
        return FakeQuery(items)


class FakeQuery:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self):
        return list(self.items)


class FakeUser:
    def __init__(self, user_id="employee-1", role="employee", company_id="company-1"):
        self.id = user_id
        self.role = role
        self.company_id = company_id
        self.first_name = "Test"
        self.last_name = user_id

    def full_name(self):
        return f"User {self.id}"

    async def get_all_subordinates(self):
        return []


@pytest.fixture(autouse=True)
def reset_fakes():
    FakeTask.records = {}
    FakeRequest.records = {}
    yield


async def _noop_async(*args, **kwargs):
    return None


@pytest.mark.asyncio
async def test_extension_request_create_and_duplicate_block(monkeypatch):
    task = FakeTask(id="task-1", assigned_to="employee-1", status=TaskStatus.IN_PROGRESS)
    monkeypatch.setattr(service, "Task", FakeTask)
    monkeypatch.setattr(service, "TaskExtensionRequest", FakeRequest)
    monkeypatch.setattr(service, "assert_task_view_access", _noop_async)
    monkeypatch.setattr(service, "create_timeline_event", _noop_async)

    employee = FakeUser()

    created = await service.create_extension_request(
        task,
        employee,
        datetime(2026, 7, 18, 9, 0, 0),
        "Blocked by dependency",
    )

    assert created.status == TaskExtensionStatus.PENDING
    assert created.reason == "Blocked by dependency"
    assert FakeRequest.records[str(created.id)].task_id == "task-1"

    with pytest.raises(HTTPException) as exc_info:
        await service.create_extension_request(
            task,
            employee,
            datetime(2026, 7, 19, 9, 0, 0),
            "Still blocked",
        )

    assert exc_info.value.status_code == 400
    assert "Active extension request already exists" in exc_info.value.detail


@pytest.mark.asyncio
async def test_extension_request_approve_updates_task_and_request(monkeypatch):
    task = FakeTask(
        id="task-2",
        assigned_to="employee-1",
        created_by="manager-1",
        status=TaskStatus.IN_PROGRESS,
        due_date=datetime(2026, 7, 15, 9, 0, 0),
        health_status=TaskHealthStatus.HEALTHY,
    )
    request = FakeRequest(
        id="request-1",
        task_id="task-2",
        company_id="company-1",
        employee_id="employee-1",
        current_due_date=task.due_date,
        requested_due_date=datetime(2026, 7, 20, 9, 0, 0),
        reason="Need more time",
    )
    monkeypatch.setattr(service, "Task", FakeTask)
    monkeypatch.setattr(service, "TaskExtensionRequest", FakeRequest)
    monkeypatch.setattr(service, "assert_task_manage_access", _noop_async)
    monkeypatch.setattr(service, "create_timeline_event", _noop_async)

    reviewer = FakeUser(user_id="manager-1", role="manager")
    reviewed = await service.review_extension_request(request, reviewer, True, "Approved")

    assert reviewed.status == TaskExtensionStatus.APPROVED
    assert reviewed.reviewed_by == "manager-1"
    assert reviewed.review_comment == "Approved"
    assert task.due_date == datetime(2026, 7, 20, 9, 0, 0)
    assert task.extension_count == 1
    assert task.health_status == TaskHealthStatus.EXTENDED
    assert task.saved is True
    assert request.saved is True


@pytest.mark.asyncio
async def test_extension_request_reject_preserves_task_state(monkeypatch):
    task = FakeTask(
        id="task-3",
        assigned_to="employee-1",
        created_by="manager-1",
        status=TaskStatus.IN_PROGRESS,
        due_date=datetime(2026, 7, 15, 9, 0, 0),
        health_status=TaskHealthStatus.OVERDUE,
    )
    request = FakeRequest(
        id="request-2",
        task_id="task-3",
        company_id="company-1",
        employee_id="employee-1",
        current_due_date=task.due_date,
        requested_due_date=datetime(2026, 7, 22, 9, 0, 0),
        reason="Need more time",
    )
    monkeypatch.setattr(service, "Task", FakeTask)
    monkeypatch.setattr(service, "TaskExtensionRequest", FakeRequest)
    monkeypatch.setattr(service, "assert_task_manage_access", _noop_async)

    sync_calls = []

    async def fake_sync_task_health(value, now=None):
        sync_calls.append(now)
        value.health_status = TaskHealthStatus.OVERDUE
        return value

    monkeypatch.setattr(service, "sync_task_health", fake_sync_task_health)
    monkeypatch.setattr(service, "create_timeline_event", _noop_async)

    reviewer = FakeUser(user_id="manager-1", role="manager")
    reviewed = await service.review_extension_request(request, reviewer, False, "Rejected")

    assert reviewed.status == TaskExtensionStatus.REJECTED
    assert reviewed.reviewed_by == "manager-1"
    assert reviewed.review_comment == "Rejected"
    assert task.due_date == datetime(2026, 7, 15, 9, 0, 0)
    assert task.extension_count == 0
    assert task.health_status == TaskHealthStatus.OVERDUE
    assert task.saved is False
    assert request.saved is True
    assert len(sync_calls) == 1


@pytest.mark.asyncio
async def test_extension_request_already_reviewed_is_rejected(monkeypatch):
    task = FakeTask(
        id="task-4",
        assigned_to="employee-1",
        created_by="manager-1",
        status=TaskStatus.IN_PROGRESS,
        due_date=datetime(2026, 7, 15, 9, 0, 0),
    )
    request = FakeRequest(
        id="request-3",
        task_id="task-4",
        company_id="company-1",
        employee_id="employee-1",
        current_due_date=task.due_date,
        requested_due_date=datetime(2026, 7, 18, 9, 0, 0),
        reason="Need more time",
        status=TaskExtensionStatus.APPROVED,
    )
    monkeypatch.setattr(service, "Task", FakeTask)
    monkeypatch.setattr(service, "TaskExtensionRequest", FakeRequest)
    monkeypatch.setattr(service, "assert_task_manage_access", _noop_async)
    monkeypatch.setattr(service, "create_timeline_event", _noop_async)

    reviewer = FakeUser(user_id="manager-1", role="manager")
    with pytest.raises(HTTPException) as exc_info:
        await service.review_extension_request(request, reviewer, True, "Approved again")

    assert exc_info.value.status_code == 400
    assert "already reviewed" in exc_info.value.detail


@pytest.mark.asyncio
async def test_extension_review_rejected_when_task_completed(monkeypatch):
    task = FakeTask(
        id="task-5",
        assigned_to="employee-1",
        created_by="manager-1",
        status=TaskStatus.COMPLETED,
        due_date=datetime(2026, 7, 15, 9, 0, 0),
    )
    request = FakeRequest(
        id="request-4",
        task_id="task-5",
        company_id="company-1",
        employee_id="employee-1",
        current_due_date=task.due_date,
        requested_due_date=datetime(2026, 7, 18, 9, 0, 0),
        reason="Need more time",
    )
    monkeypatch.setattr(service, "Task", FakeTask)
    monkeypatch.setattr(service, "TaskExtensionRequest", FakeRequest)
    monkeypatch.setattr(service, "assert_task_manage_access", _noop_async)
    monkeypatch.setattr(service, "create_timeline_event", _noop_async)

    reviewer = FakeUser(user_id="manager-1", role="manager")
    with pytest.raises(HTTPException) as exc_info:
      await service.review_extension_request(request, reviewer, True, "Approved")

    assert exc_info.value.status_code == 400
    assert "completed task" in exc_info.value.detail
    assert task.due_date == datetime(2026, 7, 15, 9, 0, 0)
    assert request.status == TaskExtensionStatus.PENDING
