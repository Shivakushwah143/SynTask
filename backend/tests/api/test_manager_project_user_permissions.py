from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import tasks as task_endpoints
from app.api.v1.endpoints.projects import shared as project_shared
from app.core.hierarchy import get_creatable_roles
from app.models.user import Manager, User, UserRole


def user(user_id, role, *, company_id="company-1"):
    async def get_all_subordinates():
        return []

    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        get_all_subordinates=get_all_subordinates,
    )


def project(**overrides):
    data = {
        "id": "project-1",
        "company_id": "company-1",
        "created_by": "admin-1",
        "assigned_to": "lead-1",
        "assigned_user_ids": ["lead-1"],
        "lead_id": "lead-1",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def task(**overrides):
    data = {
        "id": "task-1",
        "company_id": "company-1",
        "created_by": "admin-1",
        "assigned_to": "employee-1",
        "project_id": "PROJECT-123",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.mark.asyncio
async def test_manager_can_manage_any_project_in_their_company():
    manager = user("manager-1", UserRole.MANAGER)
    company_project = project()

    assert await project_shared.can_manage_project(company_project, manager) is True
    assert await project_shared.check_project_access(company_project, manager) is True


@pytest.mark.asyncio
async def test_sub_admin_can_manage_any_project_in_their_company():
    sub_admin = user("subadmin-1", UserRole.SUB_ADMIN)
    company_project = project()

    assert await project_shared.can_manage_project(company_project, sub_admin) is True
    assert await project_shared.check_project_access(company_project, sub_admin) is True


@pytest.mark.asyncio
async def test_manager_cannot_manage_project_outside_their_company():
    manager = user("manager-1", UserRole.MANAGER)
    other_company_project = project(company_id="company-2")

    assert await project_shared.can_manage_project(other_company_project, manager) is False
    assert await project_shared.check_project_access(other_company_project, manager) is False


@pytest.mark.asyncio
async def test_manager_can_create_only_leads_and_employees():
    manager = user("manager-1", UserRole.MANAGER)

    assert User.can_create_role(manager, UserRole.MANAGER) is False
    assert User.can_create_role(manager, UserRole.LEAD) is True
    assert User.can_create_role(manager, UserRole.EMPLOYEE) is True
    assert await get_creatable_roles(manager) == [UserRole.LEAD.value, UserRole.EMPLOYEE.value]
    assert "create_leads" in Manager.model_fields["permissions"].default
    assert "create_employees" in Manager.model_fields["permissions"].default
    assert "create_managers" not in Manager.model_fields["permissions"].default


@pytest.mark.asyncio
async def test_manager_can_assign_tasks_to_any_company_lead_or_employee():
    manager = user("manager-1", UserRole.MANAGER)
    admin_created_lead = user("lead-1", UserRole.LEAD)
    admin_created_employee = user("employee-1", UserRole.EMPLOYEE)
    other_manager = user("manager-2", UserRole.MANAGER)

    await task_endpoints._assert_can_assign_task(manager, admin_created_lead)
    await task_endpoints._assert_can_assign_task(manager, admin_created_employee)

    with pytest.raises(HTTPException):
        await task_endpoints._assert_can_assign_task(manager, other_manager)


@pytest.mark.asyncio
async def test_project_team_member_can_view_task_comments(monkeypatch):
    employee = user("employee-2", UserRole.EMPLOYEE)
    team_project = project(team_member_ids=["employee-2"])

    async def fake_get_project_by_id(project_id, company_id):
        return team_project, project_id

    monkeypatch.setattr(task_endpoints, "check_company_access", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.api.dependencies.get_project_by_id", fake_get_project_by_id)

    await task_endpoints._assert_task_view(employee, task(assigned_to="employee-1"))


@pytest.mark.asyncio
async def test_project_lead_member_can_view_task_comments(monkeypatch):
    lead = user("lead-2", UserRole.LEAD)
    team_project = project(assigned_to=None, assigned_user_ids=[], lead_id=None, team_member_ids=["lead-2"])

    async def fake_get_project_by_id(project_id, company_id):
        return team_project, project_id

    monkeypatch.setattr(task_endpoints, "check_company_access", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.api.dependencies.get_project_by_id", fake_get_project_by_id)

    await task_endpoints._assert_task_view(lead, task(assigned_to="employee-1"))


@pytest.mark.asyncio
async def test_employee_with_task_in_project_can_view_colleague_task(monkeypatch):
    # Employee involved only via task assignment can open a colleague's task,
    # matching the project board visibility rule (board cards must be clickable).
    employee = user("employee-2", UserRole.EMPLOYEE)
    team_project = project(team_member_ids=["employee-3"])
    colleague_task = task(assigned_to="employee-3")

    async def fake_get_project_by_id(project_id, company_id):
        return team_project, project_id

    class FakeInvolvementTask:
        async def find_one(self, *_args, **_kwargs):
            return SimpleNamespace(id="involved-task")

    monkeypatch.setattr(task_endpoints, "check_company_access", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.api.dependencies.get_project_by_id", fake_get_project_by_id)
    monkeypatch.setattr(task_endpoints, "Task", FakeInvolvementTask())

    await task_endpoints._assert_task_view(employee, colleague_task)


@pytest.mark.asyncio
async def test_employee_without_project_involvement_cannot_view_colleague_task(monkeypatch):
    employee = user("employee-2", UserRole.EMPLOYEE)
    team_project = project(team_member_ids=["employee-3"])
    colleague_task = task(assigned_to="employee-3")

    async def fake_get_project_by_id(project_id, company_id):
        return team_project, project_id

    class FakeNoTask:
        async def find_one(self, *_args, **_kwargs):
            return None

    monkeypatch.setattr(task_endpoints, "check_company_access", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.api.dependencies.get_project_by_id", fake_get_project_by_id)
    monkeypatch.setattr(task_endpoints, "Task", FakeNoTask())

    with pytest.raises(HTTPException) as exc:
        await task_endpoints._assert_task_view(employee, colleague_task)
    assert exc.value.status_code == 403
