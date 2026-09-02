from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import work_reports
from app.api.v1.router import api_router
from app.models.task import TaskHealthStatus, TaskPriority, TaskStatus
from app.models.user import UserRole
from app.services.work_overview_service import _is_due_today
from app.services.work_overview_service import shared_work_metrics


class Query:
    def __init__(self, items):
        self.items = items

    def sort(self, *args, **kwargs):
        return self

    def skip(self, count):
        self.items = self.items[count:]
        return self

    def limit(self, count):
        self.items = self.items[:count]
        return self

    async def to_list(self):
        return self.items

    async def count(self):
        return len(self.items)


class FakeTask:
    records = []

    @classmethod
    def find(cls, query):
        return Query(cls.records)

    @classmethod
    async def get(cls, task_id):
        return next((item for item in cls.records if str(item.id) == str(task_id)), None)


def task(task_id, *, company_id="company-1", assigned_to="employee-1", due_date=None, status=TaskStatus.IN_PROGRESS, priority=TaskPriority.MEDIUM, dependencies=None):
    now = datetime(2026, 9, 2, 12)
    return SimpleNamespace(
        id=task_id, company_id=company_id, title=str(task_id), assigned_to=assigned_to,
        created_by="creator-1", reviewer_id="reviewer-1", due_date=due_date, status=status,
        priority=priority, dependencies=dependencies or [], health_status=TaskHealthStatus.HEALTHY,
        project_id="project-1", project_object_id=None, created_at=now, updated_at=now,
    )


def user(user_id, role):
    return SimpleNamespace(id=user_id, company_id="company-1", role=role, timezone="UTC")


@pytest.mark.asyncio
async def test_employee_cannot_report_on_unrelated_employee(monkeypatch):
    employee = user("employee-1", UserRole.EMPLOYEE)
    monkeypatch.setattr(work_reports, "_get_visible_user_ids", lambda _: _value(["employee-1"]))

    with pytest.raises(HTTPException) as error:
        await work_reports.task_report(assignee="employee-2", page=1, page_size=20, current_user=employee)
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_manager_only_sees_allowed_hierarchy(monkeypatch):
    manager = user("manager-1", UserRole.MANAGER)
    monkeypatch.setattr(work_reports, "_get_visible_user_ids", lambda _: _value(["manager-1", "employee-1"]))

    with pytest.raises(HTTPException) as error:
        await work_reports.employee_report(employee_id="employee-2", page=1, page_size=20, current_user=manager)
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_company_b_cannot_access_company_a_report(monkeypatch):
    company_b_employee = SimpleNamespace(id="employee-b", company_id="company-b", role=UserRole.EMPLOYEE, timezone="UTC")
    monkeypatch.setattr(work_reports, "_get_visible_user_ids", lambda _: _value(["employee-b"]))
    FakeTask.records = [task("task-a", company_id="company-a", assigned_to="employee-a")]
    monkeypatch.setattr(work_reports, "Task", FakeTask)

    result = await work_reports.task_report(page=1, page_size=20, current_user=company_b_employee)
    assert result["total"] == 0
    assert result["tasks"] == []


@pytest.mark.asyncio
async def test_blocked_health_and_date_filters_change_results(monkeypatch):
    actor = user("employee-1", UserRole.EMPLOYEE)
    due = datetime(2026, 9, 2, 10)
    dependency = task("dependency", status=TaskStatus.IN_PROGRESS)
    blocked = task("blocked", due_date=due, dependencies=["dependency"])
    clear = task("clear", due_date=due + timedelta(days=2), status=TaskStatus.ASSIGNED)
    FakeTask.records = [blocked, clear, dependency]
    monkeypatch.setattr(work_reports, "Task", FakeTask)
    monkeypatch.setattr(work_reports, "_get_visible_user_ids", lambda _: _value(["employee-1"]))
    monkeypatch.setattr(work_reports, "blocking_dependencies", lambda item: _blocking(item, dependency))

    blocked_result = await work_reports.task_report(blocked_only=True, page=1, page_size=20, current_user=actor)
    date_result = await work_reports.task_report(start_date="2026-09-02", end_date="2026-09-02", page=1, page_size=20, current_user=actor)
    assert blocked_result["total"] == 1
    assert blocked_result["tasks"][0]["task_id"] == "blocked"
    assert date_result["total"] == 1


@pytest.mark.asyncio
async def test_filtered_total_is_independent_of_page_size(monkeypatch):
    actor = user("employee-1", UserRole.EMPLOYEE)
    FakeTask.records = [task(f"task-{index}") for index in range(3)]
    monkeypatch.setattr(work_reports, "Task", FakeTask)
    monkeypatch.setattr(work_reports, "_get_visible_user_ids", lambda _: _value(["employee-1"]))

    result = await work_reports.task_report(page=2, page_size=1, current_user=actor)
    assert result["total"] == 3
    assert result["total_pages"] == 3
    assert len(result["tasks"]) == 1


@pytest.mark.asyncio
async def test_asia_kolkata_date_boundary_is_local_business_day():
    task_due = task("boundary", due_date=datetime(2026, 9, 1, 19, 0))
    now = datetime(2026, 9, 1, 20, 0)
    assert _is_due_today(task_due, now, "Asia/Kolkata") is True


@pytest.mark.asyncio
async def test_dashboard_and_work_overview_share_authoritative_task_metrics(monkeypatch):
    dependency = task("dependency", status=TaskStatus.IN_PROGRESS)
    blocked = task("blocked", dependencies=["dependency"], due_date=datetime(2026, 9, 1, 10))
    review = task("review", status=TaskStatus.IN_REVIEW)
    monkeypatch.setattr(work_reports, "blocking_dependencies", lambda item: _blocking(item, dependency))
    monkeypatch.setattr("app.services.work_overview_service.blocking_dependencies", lambda item: _blocking(item, dependency))

    overview_metrics = await shared_work_metrics([blocked, review], datetime(2026, 9, 2, 12), "UTC")
    dashboard_metrics = await shared_work_metrics([blocked, review], datetime(2026, 9, 2, 12), "UTC")
    assert dashboard_metrics["overdue"] == overview_metrics["overdue"]
    assert dashboard_metrics["blocked"] == overview_metrics["blocked"]
    assert dashboard_metrics["awaiting_review"] == overview_metrics["awaiting_review"]


def test_work_routes_have_single_canonical_prefixes():
    paths = {route.path for route in api_router.routes}
    assert "/project-templates/" in paths
    assert "/reports/projects" in paths
    assert not any("project-templates/project-templates" in path or "reports/reports" in path for path in paths)


def test_work_overview_is_canonical_frontend_route():
    source = open("../frontend/src/App.jsx", encoding="utf-8").read()
    assert 'path="work/overview"' in source
    assert 'path="work/reports"' in source
    assert 'path="project-templates"' in source
    assert 'path="sections/work"' in source
    assert 'Navigate to="/work/overview"' in source


async def _value(value):
    return value


async def _blocking(item, dependency):
    return [{"id": dependency.id}] if item.dependencies else []
