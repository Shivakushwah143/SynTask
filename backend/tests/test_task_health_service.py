from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from app.models.task import TaskExtensionStatus, TaskHealthStatus, TaskStatus
from app.services import task_health_service as service
from app.services.task_health_service import calculate_performance_metrics, calculate_task_health


def task(**kwargs):
    defaults = {
        "status": TaskStatus.TODO,
        "due_date": None,
        "created_at": datetime(2026, 7, 10, 9, 0, 0),
        "completed_at": None,
        "extension_count": 0,
        "health_status": TaskHealthStatus.HEALTHY,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class FakeTask:
    records = {}

    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "task-1")
        self.title = kwargs.get("title", "Task")
        self.assigned_to = kwargs.get("assigned_to")
        self.created_by = kwargs.get("created_by", "user-1")
        self.company_id = kwargs.get("company_id", "company-1")
        self.project_id = kwargs.get("project_id")
        self.status = kwargs.get("status", TaskStatus.TODO)
        self.priority = kwargs.get("priority", SimpleNamespace(value="medium"))
        self.due_date = kwargs.get("due_date")
        self.completed_at = kwargs.get("completed_at")
        self.health_status = kwargs.get("health_status", TaskHealthStatus.HEALTHY)
        self.health_updated_at = kwargs.get("health_updated_at")
        self.extension_count = kwargs.get("extension_count", 0)
        self.updated_at = kwargs.get("updated_at")
        self.saved = False
        FakeTask.records[str(self.id)] = self

    async def save(self):
        self.saved = True
        FakeTask.records[str(self.id)] = self
        return self

    @classmethod
    async def get(cls, task_id):
        return cls.records.get(str(task_id))

    @classmethod
    def find(cls, query):
        items = []
        for task in cls.records.values():
            match = True
            for key, expected in query.items():
                actual = getattr(task, key, None)
                if isinstance(expected, dict) and "$ne" in expected:
                    if actual == expected["$ne"]:
                        match = False
                        break
                elif actual != expected:
                    match = False
                    break
            if match:
                items.append(task)
        class _Query:
            async def to_list(self_inner):
                return list(items)

        return _Query()


class FakeRequest:
    records = {}
    task_id = SimpleNamespace(field="task_id", value=None)
    status = SimpleNamespace(field="status", value=None)
    company_id = SimpleNamespace(field="company_id", value=None)
    employee_id = SimpleNamespace(field="employee_id", value=None)

    def __init__(self, **kwargs):
        self.id = kwargs.get("id", "request-1")
        self.task_id = kwargs["task_id"]
        self.company_id = kwargs["company_id"]
        self.employee_id = kwargs["employee_id"]
        self.current_due_date = kwargs["current_due_date"]
        self.requested_due_date = kwargs["requested_due_date"]
        self.reason = kwargs["reason"]
        self.status = kwargs.get("status", TaskExtensionStatus.PENDING)
        self.reviewed_by = kwargs.get("reviewed_by")
        self.reviewed_at = kwargs.get("reviewed_at")
        self.review_comment = kwargs.get("review_comment")
        self.created_at = kwargs.get("created_at", datetime(2026, 7, 10, 9, 0, 0))
        self.updated_at = kwargs.get("updated_at", self.created_at)
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
            if getattr(item, "field", None) == "task_id":
                items = [request for request in items if request.task_id == item.value]
            if getattr(item, "field", None) == "status":
                items = [request for request in items if request.status == item.value]
            if getattr(item, "field", None) == "company_id":
                items = [request for request in items if request.company_id == item.value]
            if getattr(item, "field", None) == "employee_id":
                items = [request for request in items if request.employee_id == item.value]
        return items[0] if items else None

    @classmethod
    def find(cls, *filters, **kwargs):
        items = list(cls.records.values())
        for item in filters:
            if getattr(item, "field", None) == "task_id":
                items = [request for request in items if request.task_id == item.value]
            if getattr(item, "field", None) == "company_id":
                items = [request for request in items if request.company_id == item.value]
            if getattr(item, "field", None) == "employee_id":
                items = [request for request in items if request.employee_id == item.value]
            if getattr(item, "field", None) == "status":
                items = [request for request in items if request.status == item.value]
        return SimpleNamespace(sort=lambda *args, **kwargs: SimpleNamespace(to_list=lambda: items))


class FakeUser:
    def __init__(self, user_id="user-1", role="employee", company_id="company-1"):
        self.id = user_id
        self.role = role
        self.company_id = company_id
        self.first_name = "Test"
        self.last_name = user_id
        self.reports_to = None
        self.ancestors = []

    def full_name(self):
        return f"User {self.id}"

    async def get_all_subordinates(self):
        return []


@pytest.fixture(autouse=True)
def reset_health_fakes():
    FakeTask.records = {}
    FakeRequest.records = {}
    yield


async def _noop_async(*args, **kwargs):
    return None


def test_calculate_task_health_states():
    now = datetime(2026, 7, 13, 12, 0, 0)

    assert calculate_task_health(task(status=TaskStatus.COMPLETED), now) == TaskHealthStatus.COMPLETED
    assert calculate_task_health(task(due_date=datetime(2026, 7, 13, 18, 0, 0)), now) == TaskHealthStatus.DUE_TODAY
    assert calculate_task_health(task(due_date=datetime(2026, 7, 12, 18, 0, 0)), now) == TaskHealthStatus.OVERDUE
    assert calculate_task_health(task(extension_count=1, due_date=datetime(2026, 7, 12, 18, 0, 0)), now) == TaskHealthStatus.EXTENDED
    assert calculate_task_health(task(due_date=datetime(2026, 7, 14, 18, 0, 0)), now) == TaskHealthStatus.HEALTHY


def test_calculate_performance_metrics():
    created = datetime(2026, 7, 10, 9, 0, 0)
    tasks = [
        task(status=TaskStatus.COMPLETED, created_at=created, due_date=created + timedelta(days=1), completed_at=created + timedelta(hours=4)),
        task(status=TaskStatus.COMPLETED, created_at=created, due_date=created + timedelta(hours=2), completed_at=created + timedelta(hours=4)),
        task(status=TaskStatus.TODO, health_status=TaskHealthStatus.OVERDUE),
        task(status=TaskStatus.IN_PROGRESS, extension_count=1, health_status=TaskHealthStatus.EXTENDED),
    ]

    metrics = calculate_performance_metrics(tasks)

    assert metrics["total_assigned_tasks"] == 4
    assert metrics["completed_tasks"] == 2
    assert metrics["pending_tasks"] == 2
    assert metrics["overdue_tasks"] == 1
    assert metrics["extended_tasks"] == 1
    assert metrics["completion_rate"] == 50
    assert metrics["on_time_completion_rate"] == 50
    assert metrics["late_completion_rate"] == 50


@pytest.mark.asyncio
async def test_sync_task_health_updates_persisted_state(monkeypatch):
    task_doc = FakeTask(
        id="task-1",
        title="Health sync",
        assigned_to="employee-1",
        created_by="manager-1",
        status=TaskStatus.IN_PROGRESS,
        due_date=datetime(2026, 7, 13, 18, 0, 0),
        health_status=TaskHealthStatus.HEALTHY,
    )
    monkeypatch.setattr(service, "create_timeline_event", _noop_async)

    result = await service.sync_task_health(task_doc, datetime(2026, 7, 13, 12, 0, 0))

    assert result.health_status == TaskHealthStatus.DUE_TODAY
    assert result.health_updated_at == datetime(2026, 7, 13, 12, 0, 0)
    assert result.updated_at == datetime(2026, 7, 13, 12, 0, 0)
    assert result.saved is True


@pytest.mark.asyncio
async def test_sync_task_health_for_company_recomputes_non_completed_tasks(monkeypatch):
    FakeTask(id="task-1", company_id="company-1", status=TaskStatus.TODO, due_date=datetime(2026, 7, 13, 18, 0, 0))
    FakeTask(id="task-2", company_id="company-1", status=TaskStatus.COMPLETED, due_date=datetime(2026, 7, 13, 18, 0, 0))

    async def fake_sync_task_health(task, now=None):
        task.health_status = calculate_task_health(task, datetime(2026, 7, 13, 12, 0, 0))
        task.saved = True
        return task

    monkeypatch.setattr(service, "Task", FakeTask)
    monkeypatch.setattr(service, "sync_task_health", fake_sync_task_health)

    count = await service.sync_task_health_for_company("company-1")

    assert count == 1
    assert FakeTask.records["task-1"].health_status == TaskHealthStatus.DUE_TODAY
    assert FakeTask.records["task-2"].health_status == TaskHealthStatus.HEALTHY


@pytest.mark.asyncio
async def test_build_task_health_summary_reflects_synced_state(monkeypatch):
    task_one = FakeTask(id="task-1", company_id="company-1", assigned_to="employee-1", status=TaskStatus.IN_PROGRESS, due_date=datetime(2026, 7, 13, 18, 0, 0))
    task_two = FakeTask(id="task-2", company_id="company-1", assigned_to="employee-1", status=TaskStatus.IN_PROGRESS, due_date=datetime(2026, 7, 14, 18, 0, 0))

    async def fake_sync_task_health(task, now=None):
        task.health_status = calculate_task_health(task, datetime(2026, 7, 13, 12, 0, 0))
        return task

    monkeypatch.setattr(service, "Task", FakeTask)
    async def fake_visible_tasks_for_user(current_user):
        return [task_one, task_two]

    monkeypatch.setattr(service, "_visible_tasks_for_user", fake_visible_tasks_for_user)
    monkeypatch.setattr(service, "sync_task_health", fake_sync_task_health)

    current_user = FakeUser(user_id="employee-1", role="employee")
    summary = await service.build_task_health_summary(current_user)

    assert summary["total"] == 2
    assert summary["summary"][TaskHealthStatus.DUE_TODAY.value] == 1
    assert summary["summary"][TaskHealthStatus.HEALTHY.value] == 1


def test_serialize_task_health_normalizes_enum_and_counts():
    task_doc = FakeTask(
        id="task-9",
        title="Serialize me",
        assigned_to="employee-1",
        status=TaskStatus.COMPLETED,
        due_date=datetime(2026, 7, 13, 18, 0, 0),
        completed_at=datetime(2026, 7, 13, 17, 0, 0),
        health_status=TaskHealthStatus.COMPLETED,
        extension_count=2,
    )

    payload = service.serialize_task_health(task_doc)

    assert payload["status"] == TaskStatus.COMPLETED.value
    assert payload["health_status"] == TaskHealthStatus.COMPLETED.value
    assert payload["extension_count"] == 2
