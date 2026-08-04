from datetime import datetime
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints.projects import project_board_view, project_detail, shared
from app.models.project import ProjectStatus
from app.models.task import TaskPriority, TaskStatus
from app.models.user import UserRole


def user(user_id="admin-1"):
    return SimpleNamespace(
        id=user_id,
        role=UserRole.ADMIN,
        company_id="company-1",
        full_name=lambda: "Admin User",
    )


def project(**overrides):
    data = {
        "id": "6a705d6e32b37e4355c08587",
        "project_id": "PROJ-1",
        "name": "Legacy Project",
        "key": "PROJ",
        "description": "",
        "type": "software",
        "status": ProjectStatus.ACTIVE,
        "company_id": "company-1",
        "client_id": None,
        "lead_id": "legacy-lead-id",
        "assigned_to": None,
        "assigned_user_ids": ["legacy-manager-id"],
        "team_member_ids": [],
        "created_by": "legacy-admin-id",
        "assignment_history": [],
        "assigned_by": None,
        "assigned_at": None,
        "start_date": None,
        "delivery_date": None,
        "end_date": None,
        "created_at": datetime(2026, 8, 1),
        "updated_at": datetime(2026, 8, 1),
        "board_columns": [
            {"id": "todo", "label": "TO DO", "color": "bg-gray-100", "order": 0},
            {"id": "completed", "label": "DONE", "color": "bg-green-100", "order": 1},
        ],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def task(**overrides):
    data = {
        "id": "task-1",
        "title": "Task",
        "description": "",
        "status": TaskStatus.TODO,
        "priority": TaskPriority.MEDIUM,
        "assigned_to": "legacy-employee-id",
        "created_by": "legacy-admin-id",
        "due_date": None,
        "created_at": datetime(2026, 8, 1),
        "tags": [],
        "story_points": None,
        "attachments": [],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class FakeTaskQuery:
    def __init__(self, tasks):
        self.tasks = tasks

    async def to_list(self):
        return self.tasks


class FakeTaskModel:
    def __init__(self, tasks):
        self.tasks = tasks

    def find(self, *_args, **_kwargs):
        return FakeTaskQuery(self.tasks)

    async def find_one(self, *_args, **_kwargs):
        return self.tasks[0] if self.tasks else None


@pytest.mark.asyncio
async def test_project_detail_tolerates_legacy_non_objectid_user_references(monkeypatch):
    monkeypatch.setattr(project_detail, "get_project_by_id", lambda *_args, **_kwargs: _async_tuple(project()))
    monkeypatch.setattr(project_detail, "Task", FakeTaskModel([task()]))
    monkeypatch.setattr(project_detail.User, "find", lambda *_args, **_kwargs: FakeTaskQuery([]))

    response = await project_detail.get_project("6a705d6e32b37e4355c08587", current_user=user())

    assert response["id"] == "6a705d6e32b37e4355c08587"
    assert response["assigned_tasks_by_user"][0]["user_id"] == "legacy-employee-id"


@pytest.mark.asyncio
async def test_project_board_tolerates_legacy_non_objectid_user_references(monkeypatch):
    async def fake_user_get(_user_id):
        return None

    monkeypatch.setattr(project_board_view, "get_project_by_id", lambda *_args, **_kwargs: _async_tuple(project()))
    monkeypatch.setattr(project_board_view, "Task", FakeTaskModel([task()]))
    monkeypatch.setattr(project_board_view.User, "find", lambda *_args, **_kwargs: FakeTaskQuery([]))
    monkeypatch.setattr(project_board_view.User, "get", fake_user_get)

    response = await project_board_view.get_project_board("6a705d6e32b37e4355c08587", current_user=user())

    assert response["project"]["id"] == "6a705d6e32b37e4355c08587"
    assert response["tasks_by_status"]["todo"][0]["assigned_to"] == "legacy-employee-id"


@pytest.mark.asyncio
async def test_project_detail_and_board_tolerate_string_task_status_and_priority(monkeypatch):
    legacy_task = task(status="todo", priority="medium")
    monkeypatch.setattr(project_detail, "get_project_by_id", lambda *_args, **_kwargs: _async_tuple(project()))
    monkeypatch.setattr(project_detail, "Task", FakeTaskModel([legacy_task]))
    monkeypatch.setattr(project_detail.User, "find", lambda *_args, **_kwargs: FakeTaskQuery([]))
    detail_response = await project_detail.get_project("6a705d6e32b37e4355c08587", current_user=user())

    monkeypatch.setattr(project_board_view, "get_project_by_id", lambda *_args, **_kwargs: _async_tuple(project()))
    monkeypatch.setattr(project_board_view, "Task", FakeTaskModel([legacy_task]))
    monkeypatch.setattr(project_board_view.User, "find", lambda *_args, **_kwargs: FakeTaskQuery([]))
    monkeypatch.setattr(project_board_view.User, "get", lambda *_args, **_kwargs: _async_none())
    board_response = await project_board_view.get_project_board("6a705d6e32b37e4355c08587", current_user=user())

    assert detail_response["statistics"]["todo_count"] == 1
    assert board_response["tasks_by_status"]["todo"][0]["priority"] == "medium"


@pytest.mark.asyncio
async def test_project_board_tolerates_string_dates_and_legacy_project_users(monkeypatch):
    string_date_project = project(
        assigned_user_ids=["legacy-manager-id"],
        created_at="2026-08-01T00:00:00",
        updated_at="2026-08-01T00:00:00",
        start_date="2026-08-01",
    )
    string_date_task = task(created_at="2026-08-01T00:00:00", due_date="2026-08-10")

    async def fail_if_called(_user_id):
        raise AssertionError("legacy non-ObjectId user id should not call User.get")

    monkeypatch.setattr(project_board_view, "get_project_by_id", lambda *_args, **_kwargs: _async_tuple(string_date_project))
    monkeypatch.setattr(project_board_view, "Task", FakeTaskModel([string_date_task]))
    monkeypatch.setattr(project_board_view.User, "find", lambda *_args, **_kwargs: FakeTaskQuery([]))
    monkeypatch.setattr(project_board_view.User, "get", fail_if_called)

    response = await project_board_view.get_project_board("6a705d6e32b37e4355c08587", current_user=user())

    assert response["project"]["created_at"] == "2026-08-01T00:00:00"
    assert response["project"]["start_date"] == "2026-08-01"
    assert response["tasks_by_status"]["todo"][0]["due_date"] == "2026-08-10"


@pytest.mark.asyncio
async def test_employee_task_fallback_does_not_crash_on_missing_user_id_name(monkeypatch):
    employee = user("employee-1")
    employee.role = UserRole.EMPLOYEE
    no_member_project = project(lead_id=None, assigned_user_ids=[], created_by="admin-1")

    monkeypatch.setattr(project_board_view, "get_project_by_id", lambda *_args, **_kwargs: _async_tuple(no_member_project))
    monkeypatch.setattr(project_board_view, "Task", FakeTaskModel([task(assigned_to="employee-1")]))
    monkeypatch.setattr(shared, "Task", FakeTaskModel([task(assigned_to="employee-1")]))
    monkeypatch.setattr(project_board_view.User, "find", lambda *_args, **_kwargs: FakeTaskQuery([]))
    monkeypatch.setattr(project_board_view.User, "get", lambda *_args, **_kwargs: _async_none())

    response = await project_board_view.get_project_board("6a705d6e32b37e4355c08587", current_user=employee)

    assert response["tasks_by_status"]["todo"][0]["assigned_to"] == "employee-1"


async def _async_tuple(value):
    return value, value.project_id


async def _async_none():
    return None
