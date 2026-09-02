import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.models.project import ProjectStatus
from app.models.scheduled_job import ScheduledJobActionType, ScheduledJobScheduleType, ScheduledJobOccurrenceStatus
from app.models.task import TaskStatus
from app.models.work_request import WorkRequestStatus, WorkRequestType
from app.services import project_template_service as template_module
from app.services import scheduling_service as scheduling_module
from app.services import task_health_service as health_module
from app.services import work_request_service as request_module


class Query:
    def __init__(self, items=None):
        self.items = items or []

    async def to_list(self):
        return self.items

    async def count(self):
        return len(self.items)

    def __await__(self):
        async def resolve():
            return self.items[0] if self.items else None

        return resolve().__await__()


class TemplateTask:
    def __init__(self, ref_id, title, depends_on_refs=None):
        self.ref_id = ref_id
        self.title = title
        self.description = None
        self.priority = SimpleNamespace(value="medium")
        self.relative_start_day = 0
        self.relative_due_day = 1
        self.estimated_hours = None
        self.review_required = True
        self.assignee_placeholder = None
        self.reviewer_placeholder = None
        self.depends_on_refs = depends_on_refs or []
        self.tags = []
        self.required_for_project_completion = True
        self.checklist = []


class FakeGeneratedTask:
    records = []

    def __init__(self, task_id, *, ref_id, dependencies, source_type="project_template", related_entity_type="template-1", related_entity_id=None):
        self.id = task_id
        self.title = ref_id
        self.dependencies = dependencies
        self.source_type = source_type
        self.related_entity_type = related_entity_type
        self.related_entity_id = related_entity_id
        self.status = TaskStatus.TODO


@pytest.mark.asyncio
async def test_template_creates_tasks_through_task_service_and_resolves_dependencies(monkeypatch):
    template = SimpleNamespace(id="template-1", enabled=True, description="Template", project_type="software", default_priority="medium", version=1, name="Build")
    definitions = [TemplateTask("downstream", "Downstream", ["upstream"]), TemplateTask("upstream", "Upstream")]
    project = SimpleNamespace(id="project-object", project_id="PROJ-1")
    calls = []

    async def fake_get_template(*args, **kwargs):
        return template

    async def fake_get_tasks(*args, **kwargs):
        return definitions

    async def fake_project_find_one(query):
        return project if query.get("project_id") == "PROJ-1" else None

    def fake_task_find(query):
        marker = query.get("related_entity_id")
        return Query([task for task in FakeGeneratedTask.records if task.related_entity_id == marker])

    async def fake_create(**kwargs):
        calls.append(kwargs)
        task_id = f"task-{len(FakeGeneratedTask.records) + 1}"
        task = FakeGeneratedTask(task_id, ref_id=kwargs["related_entity_id"].split(":")[-1], dependencies=kwargs["dependencies"], related_entity_id=kwargs["related_entity_id"])
        FakeGeneratedTask.records.append(task)
        return {"id": task_id, "task_id": task_id}

    FakeGeneratedTask.records = []
    monkeypatch.setattr(template_module, "get_template", fake_get_template)
    monkeypatch.setattr(template_module, "get_template_tasks", fake_get_tasks)
    monkeypatch.setattr(template_module.Project, "find_one", staticmethod(fake_project_find_one))
    monkeypatch.setattr(template_module.Task, "find", staticmethod(fake_task_find))
    monkeypatch.setattr(template_module.Task, "find_one", staticmethod(fake_task_find))
    monkeypatch.setattr("app.services.task_service.TaskService.create_task_core", fake_create)

    result = await template_module.generate_project_from_template(
        template_id="template-1", company_id="company-1", name="Build", key="BLD", project_id="PROJ-1",
        lead_id="lead-1", start_date="2026-09-01T09:00:00+00:00", current_user=SimpleNamespace(id="admin", company_id="company-1"),
    )

    assert len(calls) == 2
    assert calls[0]["title"] == "Upstream"
    assert calls[1]["dependencies"] == ["task-1"]
    assert result["tasks_created"] == 2
    assert all(isinstance(dep, str) for dep in calls[1]["dependencies"])

    second = await template_module.generate_project_from_template(
        template_id="template-1", company_id="company-1", name="Build", key="BLD", project_id="PROJ-1",
        lead_id="lead-1", start_date="2026-09-01T09:00:00+00:00", current_user=SimpleNamespace(id="admin", company_id="company-1"),
    )
    assert len(calls) == 2
    assert second["tasks_created"] == 2


@pytest.mark.asyncio
async def test_template_dependency_blocks_downstream_task(monkeypatch):
    dependency = SimpleNamespace(id="task-1", company_id="company-1", status=TaskStatus.IN_PROGRESS, title="Upstream")
    downstream = SimpleNamespace(id="task-2", company_id="company-1", status=TaskStatus.TODO, title="Downstream", dependencies=["task-1"])

    async def get_task(task_id):
        return dependency if task_id == "task-1" else downstream

    monkeypatch.setattr(health_module.Task, "get", staticmethod(get_task))
    from app.services.task_workflow import assert_not_blocked

    with pytest.raises(HTTPException) as error:
        await assert_not_blocked(downstream)
    assert error.value.status_code == 400


@pytest.mark.asyncio
async def test_approved_deadline_extension_updates_once_and_rejection_keeps_deadline(monkeypatch):
    old_due = datetime(2026, 9, 10, 9, 0, 0)
    new_due = datetime(2026, 9, 15, 9, 0, 0)
    task = SimpleNamespace(id="task-1", company_id="company-1", due_date=old_due, status=TaskStatus.IN_PROGRESS, assigned_to="employee")
    actor = SimpleNamespace(id="manager", company_id="company-1", role="admin", full_name=lambda: "Manager")
    request = SimpleNamespace(
        id="request-1", company_id="company-1", type=WorkRequestType.DEADLINE_EXTENSION, task_id="task-1", requested_by="employee", title="Deadline", 
        status=WorkRequestStatus.UNDER_REVIEW, requested_changes={"requested_due_date": "2026-09-15T09:00:00+00:00"},
        reason="Need more time", description="Deadline", action_result={},
    )
    request.save = lambda: _done()
    class FakeExtensionRequest:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            self.id = "extension-1"

        async def insert(self):
            return self

    extension_inserted = 0

    async def get_task(task_id):
        return task

    async def fake_review(extension_request, reviewer, approved, comment):
        nonlocal extension_inserted
        extension_inserted += 1
        task.due_date = new_due

    monkeypatch.setattr(request_module.Task, "get", staticmethod(get_task))
    monkeypatch.setattr(request_module, "assert_request_view", lambda *args: _done())
    monkeypatch.setattr(request_module, "can_review_request", lambda *args: _true())
    monkeypatch.setattr(request_module, "record_request_event", lambda *args: _done())
    monkeypatch.setattr(request_module, "notify_request_user", lambda *args: _done())
    monkeypatch.setattr(request_module, "TaskExtensionRequest", FakeExtensionRequest)
    monkeypatch.setattr(health_module, "review_extension_request", fake_review)
    await request_module.WorkRequestService.transition(request, actor, "approve")
    assert task.due_date == new_due
    assert extension_inserted == 1

    request.status = WorkRequestStatus.UNDER_REVIEW
    request.action_result = {}
    task.due_date = old_due
    await request_module.WorkRequestService.transition(request, actor, "reject", "Not approved")
    assert task.due_date == old_due


async def _done():
    return None


async def _true():
    return True


@pytest.mark.asyncio
async def test_concurrent_request_conversion_claims_one_task(monkeypatch):
    request = SimpleNamespace(id=str(ObjectId()), request_id="REQ-2026-ABC", company_id="company-1", requested_by="employee", title="New task", description="Task", priority="medium", project_id=None, task_id=None, reviewer_id=None, status=WorkRequestStatus.APPROVED, converted_task_id=None, converted_project_id=None, conversion_in_progress=False, action_result={})
    actor = SimpleNamespace(id="admin", company_id="company-1", role="admin")
    state = {"claimed": False, "task_count": 0}

    class Collection:
        async def find_one_and_update(self, query, update, return_document):
            if state["claimed"]:
                return None
            state["claimed"] = True
            return {"_id": request.id}

        async def update_one(self, *args, **kwargs):
            state["claimed"] = False

    class FakeRequest:
        @classmethod
        def get_pymongo_collection(cls):
            return Collection()

        @classmethod
        async def get(cls, request_id):
            return request

    async def fake_create(**kwargs):
        state["task_count"] += 1
        await asyncio.sleep(0)
        request.converted_task_id = "task-1"
        return {"id": "task-1", "task_id": "task-1"}

    async def fake_save(self):
        return self

    request.save = fake_save.__get__(request)
    monkeypatch.setattr(request_module, "WorkRequest", FakeRequest)
    monkeypatch.setattr(request_module, "can_review_request", lambda *args: _true())
    monkeypatch.setattr(request_module.TaskService, "create_task_core", fake_create)
    monkeypatch.setattr(request_module, "record_request_event", lambda *args: _done())
    monkeypatch.setattr(request_module, "notify_request_user", lambda *args: _done())

    results = await asyncio.gather(
        request_module.WorkRequestService.convert_to_task(request, actor, {}),
        request_module.WorkRequestService.convert_to_task(request, actor, {}),
        return_exceptions=True,
    )
    assert state["task_count"] == 1
    assert sum(isinstance(item, dict) for item in results) == 1
    assert sum(isinstance(item, HTTPException) and item.status_code == 409 for item in results) == 1


@pytest.mark.asyncio
async def test_concurrent_request_ids_are_unique():
    values = await asyncio.gather(*(request_module._next_request_id("company-1") for _ in range(100)))
    assert len(values) == len(set(values))
    assert all(len(value.rsplit("-", 1)[-1]) == 12 for value in values)


def test_every_two_weeks_is_fourteen_days():
    job = SimpleNamespace(run_at=datetime(2026, 9, 7, 10), timezone="UTC", recurrence={"frequency": "weekly", "interval": 2, "weekdays": [0]})
    assert scheduling_module.SchedulingService.next_occurrence(job, after=job.run_at) == datetime(2026, 9, 21, 10)


@pytest.mark.asyncio
async def test_same_scheduled_occurrence_reuses_one_task(monkeypatch):
    created = []
    job = SimpleNamespace(id="job-1", company_id="company-1", payload={"title": "Recurring"}, schedule_type=ScheduledJobScheduleType.RECURRING, run_at=datetime(2026, 9, 7, 10), action_type=ScheduledJobActionType.CREATE_TASK)
    creator = SimpleNamespace(id="creator", company_id="company-1")

    class FakeTask:
        @classmethod
        async def find_one(cls, query):
            return created[0] if created else None

    async def fake_create(**kwargs):
        created.append(SimpleNamespace(id="task-1", title="Recurring", status=TaskStatus.TODO))
        return {"id": "task-1", "task_id": "task-1", "title": "Recurring"}

    monkeypatch.setattr(scheduling_module, "Task", FakeTask)
    monkeypatch.setattr(scheduling_module.TaskService, "create_task_core", fake_create)
    monkeypatch.setattr(scheduling_module.User, "get", staticmethod(lambda user_id: _creator(creator)))

    first = await scheduling_module.SchedulingService._execute_create_task(job, creator)
    second = await scheduling_module.SchedulingService._execute_create_task(job, creator)
    assert first["task_id"] == second["task_id"] == "task-1"
    assert len(created) == 1


async def _creator(value):
    return value


@pytest.mark.asyncio
async def test_completed_occurrence_is_not_reexecuted(monkeypatch):
    occurrence = SimpleNamespace(status=ScheduledJobOccurrenceStatus.COMPLETED, result_type="task", result_id="task-1")
    job = SimpleNamespace(id="job-1", run_at=datetime(2026, 9, 7, 10))

    class Occurrence:
        @classmethod
        async def find_one(cls, query):
            return occurrence

    monkeypatch.setattr(scheduling_module.ScheduledJobOccurrence, "find_one", Occurrence.find_one)
    assert await scheduling_module.SchedulingService._lock_occurrence(job) is occurrence
