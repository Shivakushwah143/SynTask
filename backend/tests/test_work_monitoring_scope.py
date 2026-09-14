from datetime import date, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.task import TaskStatus
from app.models.user import User, UserRole, UserStatus
from app.services import work_monitoring_service as service


class _Query:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self):
        return self.rows


def _user(user_id, role, company_id="company-a", status=UserStatus.ACTIVE):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id, status=status)


def test_period_rejects_mixed_date_semantics():
    with pytest.raises(HTTPException) as error:
        service._parse_period("2026-09-14", "2026-09-01", "2026-09-14")
    assert error.value.status_code == 422


def test_period_rejects_reversed_range():
    with pytest.raises(HTTPException) as error:
        service._parse_period(None, "2026-09-14", "2026-09-01")
    assert error.value.status_code == 422


def test_period_accepts_single_day():
    start, end, mode = service._parse_period("2026-09-13", None, None)
    assert (start, end, mode) == (date(2026, 9, 13), date(2026, 9, 13), "single_day")


def test_document_ids_convert_user_identity_strings_for_mongo_queries():
    ids = service._document_ids(["6a5a23751e4e313f1c9bc612", "not-a-mongo-id"])
    assert [str(item) for item in ids] == ["6a5a23751e4e313f1c9bc612"]


@pytest.mark.asyncio
async def test_manager_scope_uses_descendants_and_company(monkeypatch):
    captured = {}
    people = [_user("direct", UserRole.EMPLOYEE), _user("indirect", UserRole.EMPLOYEE)]

    def fake_find(query):
        captured.update(query)
        return _Query(people)

    monkeypatch.setattr(User, "find", fake_find)
    scope = await service.get_monitoring_scope(_user("manager", UserRole.MANAGER))

    assert scope["employee_ids"] == ["direct", "indirect"]
    assert captured["company_id"] == "company-a"
    assert captured["ancestors"] == "manager"


@pytest.mark.asyncio
async def test_employee_scope_never_queries_coworkers(monkeypatch):
    monkeypatch.setattr(User, "find", lambda *_args, **_kwargs: pytest.fail("employee scope must not query coworkers"))
    employee = _user("employee", UserRole.EMPLOYEE)
    assert (await service.get_monitoring_scope(employee))["employee_ids"] == ["employee"]


@pytest.mark.asyncio
async def test_out_of_scope_detail_is_forbidden(monkeypatch):
    async def fake_scope(_current):
        return {"company_id": "company-a", "employee_ids": ["allowed"], "type": "descendants", "global": False}

    monkeypatch.setattr(service, "get_monitoring_scope", fake_scope)
    with pytest.raises(HTTPException) as error:
        await service.ensure_employee_in_monitoring_scope(_user("manager", UserRole.MANAGER), "other-company-user")
    assert error.value.status_code == 403


def _monitored_user(user_id="admin", role=UserRole.ADMIN, **extra):
    """Stub with every attribute the filters projection reads from a user."""
    fields = {
        "id": user_id,
        "role": role,
        "company_id": "company-a",
        "status": UserStatus.ACTIVE,
        "reports_to": None,
        "department_id": None,
    }
    fields.update(extra)
    return SimpleNamespace(full_name=lambda: "Admin User", **fields)


def _task(task_id, due=None, status=TaskStatus.TODO, dependencies=None):
    return SimpleNamespace(id=task_id, due_date=due, status=status, dependencies=dependencies or [])


def _due(day):
    return datetime(day.year, day.month, day.day, 18, 30)


def test_period_tasks_include_due_in_window_and_carry_overdue():
    tasks = [
        _task("inside", _due(date(2026, 9, 10))),
        _task("carried", _due(date(2026, 8, 2))),
        _task("later", _due(date(2026, 10, 1))),
    ]

    period = service._period_tasks(tasks, date(2026, 9, 8), date(2026, 9, 14), today=date(2026, 9, 14))

    assert [task.id for task in period["window"]] == ["inside"]
    assert [task.id for task in period["overdue"]] == ["carried"]
    assert period["undated_open"] == []


def test_period_tasks_do_not_carry_late_work_from_a_future_window():
    """A task due before a future window is not overdue yet, so it stays out."""
    tasks = [_task("not_yet_late", _due(date(2026, 9, 18))), _task("already_late", _due(date(2026, 8, 2)))]

    period = service._period_tasks(tasks, date(2026, 9, 20), date(2026, 9, 30), today=date(2026, 9, 14))

    assert [task.id for task in period["overdue"]] == ["already_late"]
    assert period["window"] == []


def test_period_tasks_keep_closed_tasks_out_of_overdue():
    tasks = [
        _task("done", _due(date(2026, 8, 2)), status=TaskStatus.COMPLETED),
        _task("cancelled", _due(date(2026, 8, 3)), status=TaskStatus.CANCELLED),
        _task("open", _due(date(2026, 8, 4))),
    ]

    period = service._period_tasks(tasks, date(2026, 9, 8), date(2026, 9, 14), today=date(2026, 9, 14))

    assert [task.id for task in period["overdue"]] == ["open"]


def test_period_tasks_report_open_undated_work_separately():
    tasks = [_task("undated"), _task("closed_undated", status=TaskStatus.COMPLETED), _task("d", _due(date(2026, 9, 9)))]

    period = service._period_tasks(tasks, date(2026, 9, 8), date(2026, 9, 14), today=date(2026, 9, 14))

    assert [task.id for task in period["undated_open"]] == ["undated"]
    assert [task.id for task in period["window"]] == ["d"]


def test_period_tasks_are_ordered_by_due_date():
    tasks = [_task("third", _due(date(2026, 9, 12))), _task("first", _due(date(2026, 9, 9))), _task("second", _due(date(2026, 9, 11)))]

    period = service._period_tasks(tasks, date(2026, 9, 8), date(2026, 9, 14), today=date(2026, 9, 14))

    assert [task.id for task in period["window"]] == ["first", "second", "third"]


def test_document_ids_skips_non_object_id_identifiers():
    """Project references are human-readable codes (e.g. `ECP-001`), not ObjectIds."""
    converted = service._document_ids(["bbbbbbbbbbbbbbbbbbbbbbbb", "ECP-001", None, "", 42])

    assert [str(item) for item in converted] == ["bbbbbbbbbbbbbbbbbbbbbbbb"]


@pytest.mark.asyncio
async def test_filters_tolerate_code_style_project_references(monkeypatch):
    """A task linked by project code must not break the filter option lookup."""
    admin = _monitored_user()
    captured = {}

    async def fake_scope(_current):
        return {"company_id": "company-a", "employee_ids": ["admin"], "type": "company", "global": True}

    def fake_project_find(query):
        captured.update(query)
        return _Query([])

    monkeypatch.setattr(service, "get_monitoring_scope", fake_scope)
    monkeypatch.setattr(service.User, "find", lambda *_args, **_kwargs: _Query([admin]))
    monkeypatch.setattr(service.EmployeeProfile, "find", lambda *_args, **_kwargs: _Query([]))
    monkeypatch.setattr(service.Department, "find", lambda *_args, **_kwargs: _Query([]))
    monkeypatch.setattr(service.Task, "find", lambda *_args, **_kwargs: _Query([SimpleNamespace(project_id="ECP-001")]))
    monkeypatch.setattr(service.Project, "find", fake_project_find)

    result = await service.get_monitoring_filters(admin)

    assert captured["$or"][0]["project_id"]["$in"] == ["ECP-001"]
    assert captured["$or"][1]["_id"]["$in"] == []
    assert result["projects"] == []
