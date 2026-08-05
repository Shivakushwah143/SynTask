from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import tasks as task_endpoints
from app.api.v1.endpoints import scheduled_jobs as scheduled_job_endpoints
from app.models.scheduled_job import ScheduledJobActionType
from app.models.user import UserRole
from app.services.project_permissions import (
    ProjectPermission,
    get_effective_project_role,
    has_project_permission,
)


def user(user_id, role=UserRole.EMPLOYEE, company_id="company-1"):
    return SimpleNamespace(id=user_id, role=role, company_id=company_id)


def project(**overrides):
    data = {
        "id": "project-x",
        "company_id": "company-1",
        "lead_id": "employee-lead",
        "assigned_to": None,
        "assigned_user_ids": [],
        "team_member_ids": [],
        "created_by": "admin-1",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def task(**overrides):
    data = {
        "id": "task-1",
        "company_id": "company-1",
        "project_id": "project-x",
        "assigned_to": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def test_employee_project_lead_gets_lead_permissions_only_for_that_project():
    employee = user("employee-lead")

    assert get_effective_project_role(employee, project()).value == "project_lead"
    assert has_project_permission(employee, project(), ProjectPermission.CREATE_TASK) is True
    assert has_project_permission(employee, project(id="project-y", lead_id="other"), ProjectPermission.CREATE_TASK) is False


def test_project_member_does_not_get_lead_only_permissions():
    employee = user("member-1")
    member_project = project(lead_id="employee-lead", team_member_ids=["member-1"])

    assert get_effective_project_role(employee, member_project).value == "project_member"
    assert has_project_permission(employee, member_project, ProjectPermission.VIEW_PROJECT) is True
    assert has_project_permission(employee, member_project, ProjectPermission.CREATE_TASK) is False


def test_admin_and_global_lead_behavior_remains_correct():
    assert has_project_permission(user("admin-1", UserRole.ADMIN), project(), ProjectPermission.CREATE_TASK) is True
    assert has_project_permission(user("lead-1", UserRole.LEAD), project(assigned_user_ids=["lead-1"]), ProjectPermission.CREATE_TASK) is True


def test_old_lead_loses_and_new_lead_gains_immediately_after_replacement():
    replaced_project = project(lead_id="new-lead")

    assert has_project_permission(user("old-lead"), replaced_project, ProjectPermission.CREATE_TASK) is False
    assert has_project_permission(user("new-lead"), replaced_project, ProjectPermission.CREATE_TASK) is True


@pytest.mark.asyncio
async def test_employee_project_lead_can_manage_task_in_own_project(monkeypatch):
    async def fake_load_task_project(_task, _current_user):
        return project(lead_id="employee-lead")

    monkeypatch.setattr(task_endpoints, "load_task_project", fake_load_task_project)

    await task_endpoints._assert_task_manage(user("employee-lead"), task())


@pytest.mark.asyncio
async def test_cross_project_task_manage_request_is_blocked(monkeypatch):
    async def fake_load_task_project(_task, _current_user):
        return project(id="project-y", lead_id="other-lead")

    monkeypatch.setattr(task_endpoints, "load_task_project", fake_load_task_project)

    with pytest.raises(HTTPException) as exc:
        await task_endpoints._assert_task_manage(user("employee-lead"), task(project_id="project-y"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_employee_project_lead_can_assign_same_company_user_in_own_project():
    await task_endpoints._assert_can_assign_task(
        user("employee-lead"),
        user("assignee-1"),
        project(lead_id="employee-lead"),
    )


@pytest.mark.asyncio
async def test_project_member_cannot_assign_task():
    with pytest.raises(HTTPException) as exc:
        await task_endpoints._assert_can_assign_task(
            user("member-1"),
            user("assignee-1"),
            project(lead_id="employee-lead", team_member_ids=["member-1"]),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_employee_project_lead_can_schedule_task_in_own_project(monkeypatch):
    async def fake_load_project_for_permission(_project_id, _current_user):
        return project(lead_id="employee-lead")

    monkeypatch.setattr(scheduled_job_endpoints, "load_project_for_permission", fake_load_project_for_permission)

    await scheduled_job_endpoints._ensure_can_schedule_action(
        user("employee-lead"),
        ScheduledJobActionType.CREATE_TASK,
        {"project_id": "project-x"},
    )


@pytest.mark.asyncio
async def test_employee_cannot_schedule_task_for_other_project(monkeypatch):
    async def fake_load_project_for_permission(_project_id, _current_user):
        return project(lead_id="other-lead")

    monkeypatch.setattr(scheduled_job_endpoints, "load_project_for_permission", fake_load_project_for_permission)

    with pytest.raises(HTTPException) as exc:
        await scheduled_job_endpoints._ensure_can_schedule_action(
            user("employee-lead"),
            ScheduledJobActionType.CREATE_TASK,
            {"project_id": "project-y"},
        )

    assert exc.value.status_code == 403
