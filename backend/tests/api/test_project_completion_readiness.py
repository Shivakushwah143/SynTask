"""Project completion-readiness endpoint regression tests.

The GET /projects/{id}/completion-readiness handler previously raised 500
(NameError: has_project_access is not defined) for every request. These tests
exercise the real HTTP-layer handler against MongoDB (RUN_MONGO_INTEGRATION=1)
and cover the authorization paths (company isolation, employee access).
"""
import os
from uuid import uuid4

import pytest
import pytest_asyncio

from beanie import init_beanie
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from app.api.v1.endpoints.projects.project_control import get_completion_readiness
from app.models.project import Project, ProjectPriority, ProjectStatus
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.time_tracking import ActiveTimeSession
from app.models.user import User, UserRole, UserStatus
from app.models.work_request import WorkRequest


mongo_required = pytest.mark.skipif(
    os.getenv("RUN_MONGO_INTEGRATION") != "1",
    reason="Set RUN_MONGO_INTEGRATION=1 with a real MongoDB service container available.",
)


@pytest_asyncio.fixture
async def mongo_db():
    db_name = f"syntask_completion_{uuid4().hex}"
    client = AsyncIOMotorClient(
        os.getenv("MONGODB_URL", "mongodb://localhost:27017"),
        serverSelectionTimeoutMS=5000,
    )
    await client.admin.command("ping")
    await init_beanie(
        database=client[db_name],
        document_models=[User, Project, Task, ActiveTimeSession, WorkRequest],
    )
    try:
        yield client[db_name]
    finally:
        await client.drop_database(db_name)
        client.close()


async def _create_user(email, company_id, role):
    user = User(
        email=email,
        first_name="Test",
        last_name="User",
        role=role,
        status=UserStatus.ACTIVE,
        company_id=company_id,
        modules=["task", "tasks_projects"],
    )
    await user.insert()
    return user


async def _create_project(company_id, lead_id, project_id="PRJ-RDY-1"):
    project = Project(
        name="Readiness Project",
        key="PRJRDY",
        project_id=project_id,
        company_id=company_id,
        lead_id=lead_id,
        status=ProjectStatus.EXECUTION,
        priority=ProjectPriority.MEDIUM,
        created_by=lead_id,
    )
    await project.insert()
    return project


async def _create_task(company_id, project, title, status=TaskStatus.IN_PROGRESS, assigned_to=None):
    task = Task(
        title=title,
        company_id=company_id,
        created_by=str(project.lead_id),
        assigned_to=assigned_to,
        status=status,
        priority=TaskPriority.MEDIUM,
        project_object_id=str(project.id),
    )
    await task.insert()
    return task


@mongo_required
@pytest.mark.asyncio
async def test_completion_readiness_returns_report_for_authorized_admin(mongo_db):
    company = "readiness-co-1"
    admin = await _create_user("admin@readiness.com", company, UserRole.ADMIN)
    project = await _create_project(company, str(admin.id))
    await _create_task(company, project, "Pending task")

    readiness = await get_completion_readiness(str(project.id), admin)

    assert readiness["ready"] is False
    assert {"type": "incomplete_task", "count": 1} in readiness["blocking_reasons"]
    assert readiness["required_tasks"] == 1
    assert readiness["completed_required_tasks"] == 0
    assert readiness["entities"]["incomplete_tasks"][0]["title"] == "Pending task"


@mongo_required
@pytest.mark.asyncio
async def test_completion_readiness_ready_when_only_completed_tasks(mongo_db):
    company = "readiness-co-2"
    admin = await _create_user("admin2@readiness.com", company, UserRole.ADMIN)
    project = await _create_project(company, str(admin.id))
    await _create_task(company, project, "Done task", status=TaskStatus.COMPLETED)

    readiness = await get_completion_readiness(str(project.id), admin)

    assert readiness["ready"] is True
    assert readiness["blocking_reasons"] == []
    assert readiness["required_tasks"] == 1
    assert readiness["completed_required_tasks"] == 1


@mongo_required
@pytest.mark.asyncio
async def test_cross_company_user_cannot_read_readiness(mongo_db):
    company_a = "readiness-co-a"
    company_b = "readiness-co-b"
    admin_a = await _create_user("admina@readiness.com", company_a, UserRole.ADMIN)
    admin_b = await _create_user("adminb@readiness.com", company_b, UserRole.ADMIN)
    project = await _create_project(company_a, str(admin_a.id))

    with pytest.raises(HTTPException) as excinfo:
        await get_completion_readiness(str(project.id), admin_b)

    assert excinfo.value.status_code == 404


@mongo_required
@pytest.mark.asyncio
async def test_employee_without_access_is_forbidden(mongo_db):
    company = "readiness-co-3"
    admin = await _create_user("admin3@readiness.com", company, UserRole.ADMIN)
    employee = await _create_user("emp3@readiness.com", company, UserRole.EMPLOYEE)
    project = await _create_project(company, str(admin.id))

    with pytest.raises(HTTPException) as excinfo:
        await get_completion_readiness(str(project.id), employee)

    assert excinfo.value.status_code == 403


@mongo_required
@pytest.mark.asyncio
async def test_employee_with_assigned_project_task_can_read(mongo_db):
    company = "readiness-co-4"
    admin = await _create_user("admin4@readiness.com", company, UserRole.ADMIN)
    employee = await _create_user("emp4@readiness.com", company, UserRole.EMPLOYEE)
    project = await _create_project(company, str(admin.id))
    await _create_task(company, project, "Assigned task", assigned_to=str(employee.id))

    readiness = await get_completion_readiness(str(project.id), employee)

    assert readiness["ready"] is False
    assert {"type": "incomplete_task", "count": 1} in readiness["blocking_reasons"]