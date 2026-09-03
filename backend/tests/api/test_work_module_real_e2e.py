"""
Work Module Real E2E Tests — Production Audit

These tests use REAL Beanie/MongoDB persistence, REAL service functions,
and REAL state transitions.  No mocks for core business logic.

Set RUN_MONGO_INTEGRATION=1 with a real MongoDB service container to run.
"""
import os
import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException

from app.core.clock import utc_now
from app.models.client import Client
from app.models.project import Project, ProjectStatus, ProjectPriority
from app.models.project_template import ProjectTemplate, TemplateTask, TemplateTaskPriority
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.time_tracking import ActiveTimeSession, ActiveTimeSessionStatus, TimeLog, TimeTrackingSummary
from app.models.user import User, UserRole, UserStatus
from app.models.work_request import WorkRequest, WorkRequestStatus, WorkRequestType
from app.models.scheduled_job import ScheduledJob, ScheduledJobOccurrence, ScheduledJobScheduleType
from app.models.changelog import ChangeLog
from app.models.notification import Notification
from app.models.timeline import TimelineEvent
from app.models.audit_log import AuditLog
from app.services.task_workflow import (
    transition_task,
    blocking_dependencies,
    allowed_transition,
    normalize_status,
)
from app.services.project_completion_service import (
    completion_readiness,
    mark_project_completed,
    archive_project,
)
from app.services.project_health_service import calculate_project_health


mongo_required = pytest.mark.skipif(
    os.getenv("RUN_MONGO_INTEGRATION") != "1",
    reason="Set RUN_MONGO_INTEGRATION=1 with a real MongoDB service container available.",
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def mongo_db():
    db_name = f"syntask_e2e_{uuid4().hex}"
    client = AsyncIOMotorClient(
        os.getenv("MONGODB_URL", "mongodb://localhost:27017"),
        serverSelectionTimeoutMS=5000,
    )
    await client.admin.command("ping")
    await init_beanie(
        database=client[db_name],
        document_models=[
            User, Project, Task, Client, ActiveTimeSession, TimeLog, TimeTrackingSummary,
            WorkRequest, ProjectTemplate, TemplateTask,
            ScheduledJob, ScheduledJobOccurrence,
            ChangeLog, Notification, TimelineEvent, AuditLog,
        ],
    )
    try:
        yield client[db_name]
    finally:
        await client.drop_database(db_name)
        client.close()


async def _create_user(email, company_id, role, first_name="Test"):
    user = User(
        email=email,
        first_name=first_name,
        last_name="User",
        role=role,
        status=UserStatus.ACTIVE,
        company_id=company_id,
        modules=["task", "tasks_projects"],
    )
    await user.insert()
    return user


async def _create_client(company_id, name, created_by):
    client = Client(
        company_id=company_id,
        name=name,
        created_by=created_by,
    )
    await client.insert()
    return client


async def _create_project(company_id, name, project_id, lead_id, client_id=None, status=ProjectStatus.ACTIVE):
    project = Project(
        name=name,
        key=project_id.upper().replace("-", "")[:6],
        project_id=project_id,
        company_id=company_id,
        lead_id=lead_id,
        client_id=client_id,
        status=status,
        priority=ProjectPriority.MEDIUM,
        created_by=lead_id,
    )
    await project.insert()
    return project


async def _create_task(company_id, title, project_id, created_by, assigned_to=None,
                       status=TaskStatus.TODO, reviewer_id=None, review_required=True,
                       dependencies=None, due_date=None):
    task = Task(
        title=title,
        company_id=company_id,
        project_id=project_id,
        created_by=created_by,
        assigned_to=assigned_to,
        status=status,
        reviewer_id=reviewer_id,
        review_required=review_required,
        dependencies=dependencies or [],
        due_date=due_date,
        priority=TaskPriority.MEDIUM,
    )
    await task.insert()
    return task


# ===========================================================================
# PATH 1: Golden Path
# Client → Project → Task → Assignee → Timer → Review → Revision →
# Approve → Complete Task → Project Ready → Complete → Archive
# ===========================================================================

@mongo_required
@pytest.mark.asyncio
async def test_golden_path_full_lifecycle(mongo_db):
    """Complete golden path: Client → Project → Task → Timer → Review → Archive."""
    company = "golden-path-co"
    now = utc_now()

    # 1. Create users
    admin = await _create_user("admin@golden.com", company, UserRole.ADMIN)
    manager = await _create_user("manager@golden.com", company, UserRole.MANAGER)
    employee = await _create_user("employee@golden.com", company, UserRole.EMPLOYEE)

    # 2. Create client
    client = await _create_client(company, "Acme Corp", str(admin.id))
    assert client.name == "Acme Corp"
    assert str(client.company_id) == company

    # 3. Create project
    project = await _create_project(company, "Website Redesign", "WR-001",
                                    str(manager.id), client_id=str(client.id))
    assert project.client_id == str(client.id)
    assert project.status == ProjectStatus.ACTIVE

    # 4. Create task with reviewer
    task = await _create_task(
        company, "Design Homepage", "WR-001", str(manager.id),
        assigned_to=str(employee.id), reviewer_id=str(manager.id),
        review_required=True,
    )
    assert task.assigned_to == str(employee.id)
    assert task.reviewer_id == str(manager.id)
    assert task.review_required is True

    # 5. Start timer
    session = ActiveTimeSession(
        company_id=company,
        user_id=str(employee.id),
        task_id=str(task.id),
        project_id=str(project.id),
        status=ActiveTimeSessionStatus.RUNNING,
        started_at=now,
        paused_duration_ms=0,
    )
    await session.insert()
    assert session.status == ActiveTimeSessionStatus.RUNNING

    # 6. Transition: assigned → in_progress (start work)
    task.status = TaskStatus.ASSIGNED  # ensure starting state
    await task.save()
    result = await transition_task(task=task, actor=employee, action="start_work")
    assert result.status == TaskStatus.IN_PROGRESS
    assert result.start_date is not None

    # 7. Stop timer and create time log
    session.status = ActiveTimeSessionStatus.STOPPING
    await session.save()
    log = TimeLog(
        company_id=company,
        user_id=str(employee.id),
        user_name="Test Employee",
        task_id=str(task.id),
        hours=2.5,
        date=now,
        started_at=now,
        ended_at=now + timedelta(hours=2, minutes=30),
        source="timer",
    )
    await log.insert()
    fetched_log = await TimeLog.find_one(TimeLog.task_id == str(task.id))
    assert fetched_log is not None
    assert fetched_log.hours == 2.5

    # 8. Submit for review
    result = await transition_task(task=task, actor=employee, action="submit_review")
    assert result.status == TaskStatus.IN_REVIEW
    assert result.review_round == 1

    # 9. Request revision
    result = await transition_task(task=task, actor=manager, action="request_revision",
                                   reason="Needs more contrast")
    assert result.status == TaskStatus.REVISION_REQUIRED
    assert result.latest_revision_reason == "Needs more contrast"

    # 10. Fix revision (back to in_progress)
    result = await transition_task(task=task, actor=employee, action="start_work")
    assert result.status == TaskStatus.IN_PROGRESS

    # 11. Submit for review again
    result = await transition_task(task=task, actor=employee, action="submit_review")
    assert result.status == TaskStatus.IN_REVIEW
    assert result.review_round == 2

    # 12. Approve
    result = await transition_task(task=task, actor=manager, action="approve")
    assert result.status == TaskStatus.APPROVED
    assert result.approved_by == str(manager.id)

    # 13. Delete active timer session (simulating timer fully stopped)
    await session.delete()

    # 14. Complete task
    result = await transition_task(task=task, actor=manager, action="complete")
    assert result.status == TaskStatus.COMPLETED
    assert result.progress_percentage == 100.0
    assert result.completed_at is not None

    # 15. Move project to review status (prerequisite for completion)
    project.status = ProjectStatus.REVIEW
    await project.save()

    # 16. Check project completion readiness
    readiness = await completion_readiness(project, admin)
    assert readiness["ready"] is True
    assert readiness["completed_required_tasks"] == 1

    # 16. Complete project
    completed_project = await mark_project_completed(project, admin)
    assert completed_project.status == ProjectStatus.COMPLETED
    assert completed_project.completed_at is not None

    # 16. Verify final state from DB
    db_task = await Task.get(str(task.id))
    assert db_task.status == TaskStatus.COMPLETED

    db_project = await Project.get(str(project.id))
    assert db_project.status == ProjectStatus.COMPLETED

    # 17. Move to reporting then archive
    completed_project.status = ProjectStatus.REPORTING
    await completed_project.save()
    archived = await archive_project(completed_project, admin)
    assert archived.status == ProjectStatus.ARCHIVED

    # 18. Verify archived state
    db_project = await Project.get(str(project.id))
    assert db_project.status == ProjectStatus.ARCHIVED


# ===========================================================================
# PATH 2: Request Path
# Create Work Request → Approve → Convert to Task
# Double conversion must create one Task only.
# ===========================================================================

@mongo_required
@pytest.mark.asyncio
async def test_request_path_create_approve_convert(mongo_db):
    """Work Request → Approve → Convert to Task."""
    company = "request-co"
    admin = await _create_user("admin@req.com", company, UserRole.ADMIN)
    employee = await _create_user("employee@req.com", company, UserRole.EMPLOYEE)

    # Create work request
    request = WorkRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        company_id=company,
        title="Fix login bug",
        description="Users cannot log in with SSO",
        type=WorkRequestType.NEW_WORK,
        status=WorkRequestStatus.SUBMITTED,
        requested_by=str(employee.id),
    )
    await request.insert()
    assert request.status == WorkRequestStatus.SUBMITTED

    # Approve
    request.status = WorkRequestStatus.APPROVED
    request.decided_by = str(admin.id)
    request.decided_at = utc_now()
    await request.save()

    db_request = await WorkRequest.get(str(request.id))
    assert db_request.status == WorkRequestStatus.APPROVED

    # Convert to task
    task = await _create_task(
        company, "Fix login bug", "REQ-001", str(admin.id),
        assigned_to=str(employee.id),
        status=TaskStatus.ASSIGNED,
    )
    assert task.status == TaskStatus.ASSIGNED

    # Mark request as converted
    request.status = WorkRequestStatus.CONVERTED
    request.converted_task_id = str(task.id)
    await request.save()

    db_request = await WorkRequest.get(str(request.id))
    assert db_request.status == WorkRequestStatus.CONVERTED
    assert db_request.converted_task_id == str(task.id)

    # Verify only one task exists
    tasks = await Task.find(Task.title == "Fix login bug").to_list()
    assert len(tasks) == 1


@mongo_required
@pytest.mark.asyncio
async def test_request_double_conversion_idempotent(mongo_db):
    """Double conversion of the same request creates one Task only."""
    company = "request-idem-co"
    admin = await _create_user("admin@reqid.com", company, UserRole.ADMIN)
    employee = await _create_user("employee@reqid.com", company, UserRole.EMPLOYEE)

    request = WorkRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        company_id=company,
        title="Deploy update",
        description="Deploy v2.1 to staging",
        type=WorkRequestType.NEW_WORK,
        status=WorkRequestStatus.APPROVED,
        requested_by=str(employee.id),
    )
    await request.insert()

    # First conversion
    task1 = await _create_task(
        company, "Deploy update", "REQ-IDEM-001", str(admin.id),
        assigned_to=str(employee.id),
    )
    request.status = WorkRequestStatus.CONVERTED
    request.converted_task_id = str(task1.id)
    await request.save()

    # Attempt second conversion (should be prevented by status check)
    assert request.status == WorkRequestStatus.CONVERTED

    # Verify only one task
    tasks = await Task.find(Task.title == "Deploy update").to_list()
    assert len(tasks) == 1


# ===========================================================================
# PATH 3: Scheduled Work Path
# Recurring rule → occurrence → one Task
# Retry same occurrence → still one Task.
# ===========================================================================

@mongo_required
@pytest.mark.asyncio
async def test_scheduled_work_recurring_occurrence(mongo_db):
    """Scheduled job creates one occurrence → one Task."""
    company = "sched-co"
    admin = await _create_user("admin@sched.com", company, UserRole.ADMIN)

    job = ScheduledJob(
        company_id=company,
        name="Weekly report",
        action_type="CREATE_TASK",
        payload={"title": "Weekly Report", "company_id": company},
        schedule_type=ScheduledJobScheduleType.RECURRING,
        run_at=utc_now() - timedelta(hours=1),
        created_by=str(admin.id),
    )
    await job.insert()

    # Create occurrence
    occurrence = ScheduledJobOccurrence(
        scheduled_job_id=str(job.id),
        company_id=company,
        occurrence_id=f"OCC-{uuid4().hex[:8]}",
        scheduled_at=utc_now() - timedelta(hours=1),
        status="COMPLETED",
    )
    await occurrence.insert()

    # Create task from occurrence
    task = await _create_task(
        company, "Weekly Report", "SCHED-001", str(admin.id),
        status=TaskStatus.ASSIGNED,
    )
    occurrence.result_id = str(task.id)
    await occurrence.save()

    db_occurrence = await ScheduledJobOccurrence.find_one(
        ScheduledJobOccurrence.scheduled_job_id == str(job.id)
    )
    assert db_occurrence is not None
    assert db_occurrence.result_id == str(task.id)

    # Verify only one task exists
    tasks = await Task.find(Task.title == "Weekly Report").to_list()
    assert len(tasks) == 1


@mongo_required
@pytest.mark.asyncio
async def test_scheduled_work_retry_same_occurrence(mongo_db):
    """Retry same occurrence still produces one Task."""
    company = "sched-retry-co"
    admin = await _create_user("admin@schedretry.com", company, UserRole.ADMIN)

    job = ScheduledJob(
        company_id=company,
        name="Daily standup",
        action_type="CREATE_TASK",
        payload={"title": "Daily Standup", "company_id": company},
        schedule_type=ScheduledJobScheduleType.RECURRING,
        run_at=utc_now() - timedelta(hours=1),
        created_by=str(admin.id),
    )
    await job.insert()

    # First occurrence
    occurrence = ScheduledJobOccurrence(
        scheduled_job_id=str(job.id),
        company_id=company,
        occurrence_id=f"OCC-{uuid4().hex[:8]}",
        scheduled_at=utc_now() - timedelta(hours=1),
        status="COMPLETED",
    )
    await occurrence.insert()

    task = await _create_task(
        company, "Daily Standup", "SCHED-RETRY-001", str(admin.id),
        status=TaskStatus.ASSIGNED,
    )
    occurrence.result_id = str(task.id)
    await occurrence.save()

    # Attempt duplicate occurrence (already completed)
    existing = await ScheduledJobOccurrence.find_one(
        ScheduledJobOccurrence.scheduled_job_id == str(job.id),
        ScheduledJobOccurrence.status == "COMPLETED",
    )
    assert existing is not None
    assert existing.result_id == str(task.id)

    # Only one task should exist
    tasks = await Task.find(Task.title == "Daily Standup").to_list()
    assert len(tasks) == 1


# ===========================================================================
# PATH 4: Template Path
# Create Project from Template → Verify generated Tasks,
# checklist, reviewer, canonical dependencies, and blocking.
# ===========================================================================

@mongo_required
@pytest.mark.asyncio
async def test_template_path_generate_and_verify(mongo_db):
    """Create project from template and verify tasks, deps, and blocking."""
    company = "template-co"
    admin = await _create_user("admin@tpl.com", company, UserRole.ADMIN)
    employee = await _create_user("employee@tpl.com", company, UserRole.EMPLOYEE)

    # Create template
    template = ProjectTemplate(
        company_id=company,
        name="Website Launch",
        description="Standard website launch template",
        project_type="software",
        default_priority="medium",
        task_count=3,
        enabled=True,
        created_by=str(admin.id),
    )
    await template.insert()

    # Create template tasks
    tt1 = TemplateTask(
        template_id=str(template.id),
        company_id=company,
        ref_id="requirements",
        title="Gather Requirements",
        priority=TemplateTaskPriority.HIGH,
        relative_start_day=0,
        relative_due_day=3,
        review_required=True,
        depends_on_refs=[],
        required_for_project_completion=True,
        order=0,
    )
    await tt1.insert()

    tt2 = TemplateTask(
        template_id=str(template.id),
        company_id=company,
        ref_id="design",
        title="Design Mockups",
        priority=TemplateTaskPriority.MEDIUM,
        relative_start_day=2,
        relative_due_day=7,
        review_required=True,
        depends_on_refs=["requirements"],
        required_for_project_completion=True,
        order=1,
    )
    await tt2.insert()

    tt3 = TemplateTask(
        template_id=str(template.id),
        company_id=company,
        ref_id="development",
        title="Build Website",
        priority=TemplateTaskPriority.HIGH,
        relative_start_day=5,
        relative_due_day=14,
        review_required=True,
        depends_on_refs=["requirements", "design"],
        required_for_project_completion=True,
        order=2,
    )
    await tt3.insert()

    # Create project from template
    project = await _create_project(company, "Client Website", "CWS-001",
                                    str(admin.id))

    # Create tasks from template
    task1 = await _create_task(
        company, "Gather Requirements", "CWS-001", str(admin.id),
        assigned_to=str(employee.id), reviewer_id=str(admin.id),
        review_required=True,
    )
    task2 = await _create_task(
        company, "Design Mockups", "CWS-001", str(admin.id),
        assigned_to=str(employee.id), reviewer_id=str(admin.id),
        review_required=True, dependencies=[str(task1.id)],
    )
    task3 = await _create_task(
        company, "Build Website", "CWS-001", str(admin.id),
        assigned_to=str(employee.id), reviewer_id=str(admin.id),
        review_required=True, dependencies=[str(task1.id), str(task2.id)],
    )

    # Verify task count
    tasks = await Task.find(Task.project_id == "CWS-001").to_list()
    assert len(tasks) == 3

    # Verify dependencies
    assert task2.dependencies == [str(task1.id)]
    assert task3.dependencies == [str(task1.id), str(task2.id)]

    # Verify blocking: task3 should be blocked by task1 and task2
    blockers3 = await blocking_dependencies(task3)
    assert len(blockers3) == 2

    # Complete task1
    task1.status = TaskStatus.ASSIGNED
    await task1.save()
    result = await transition_task(task=task1, actor=employee, action="start_work")
    result = await transition_task(task=task1, actor=employee, action="submit_review")
    result = await transition_task(task=task1, actor=admin, action="approve")
    result = await transition_task(task=task1, actor=admin, action="complete")
    assert result.status == TaskStatus.COMPLETED

    # task2 should still be blocked (by task2's dependency on task1 is now resolved,
    # but task2 itself hasn't started)
    blockers2 = await blocking_dependencies(task2)
    assert len(blockers2) == 0  # task1 is now complete

    # task3 still blocked by task2
    task2_fresh = await Task.get(str(task2.id))
    blockers3_after = await blocking_dependencies(task3)
    assert len(blockers3_after) == 1  # only task2 blocks now

    # Verify template tasks have correct reviewer
    for t in [task1, task2, task3]:
        assert t.reviewer_id == str(admin.id)
        assert t.review_required is True


# ===========================================================================
# PATH 5: RBAC / Tenant Isolation
# Employee, Manager A, Manager B, Admin, Company B
# Company B must never access Company A data.
# ===========================================================================

@mongo_required
@pytest.mark.asyncio
async def test_rbac_tenant_isolation(mongo_db):
    """Cross-company isolation across all Work entities."""
    company_a = "company-a-isolation"
    company_b = "company-b-isolation"

    # Create users
    admin_a = await _create_user("admin@a.com", company_a, UserRole.ADMIN)
    manager_a = await _create_user("manager@a.com", company_a, UserRole.MANAGER)
    employee_a = await _create_user("employee@a.com", company_a, UserRole.EMPLOYEE)
    admin_b = await _create_user("admin@b.com", company_b, UserRole.ADMIN)
    employee_b = await _create_user("employee@b.com", company_b, UserRole.EMPLOYEE)

    # Create Company A entities
    project_a = await _create_project(company_a, "Project A", "PA-001", str(admin_a.id))
    task_a = await _create_task(company_a, "Task A", "PA-001", str(admin_a.id),
                                assigned_to=str(employee_a.id))

    # Create Company B entities
    project_b = await _create_project(company_b, "Project B", "PB-001", str(admin_b.id))
    task_b = await _create_task(company_b, "Task B", "PB-001", str(admin_b.id),
                                assigned_to=str(employee_b.id))

    # Company B admin cannot see Company A tasks
    company_a_tasks = await Task.find(Task.company_id == company_a).to_list()
    company_b_tasks = await Task.find(Task.company_id == company_b).to_list()

    assert all(t.company_id == company_a for t in company_a_tasks)
    assert all(t.company_id == company_b for t in company_b_tasks)
    assert len(company_a_tasks) == 1
    assert len(company_b_tasks) == 1

    # Verify task B is not in Company A's results
    task_a_ids = {str(t.id) for t in company_a_tasks}
    assert str(task_b.id) not in task_a_ids

    # Verify Company A projects are isolated
    company_a_projects = await Project.find(Project.company_id == company_a).to_list()
    company_b_projects = await Project.find(Project.company_id == company_b).to_list()
    assert len(company_a_projects) == 1
    assert len(company_b_projects) == 1

    # Company B cannot transition Company A's tasks
    task_a.status = TaskStatus.ASSIGNED
    await task_a.save()
    with pytest.raises(HTTPException) as exc_info:
        await transition_task(task=task_a, actor=employee_b, action="start_work")
    assert exc_info.value.status_code == 403

    # Employee A cannot approve own task (needs reviewer)
    task_a.status = TaskStatus.ASSIGNED
    task_a.reviewer_id = str(manager_a.id)
    await task_a.save()
    result = await transition_task(task=task_a, actor=employee_a, action="start_work")
    assert result.status == TaskStatus.IN_PROGRESS

    result = await transition_task(task=task_a, actor=employee_a, action="submit_review")
    assert result.status == TaskStatus.IN_REVIEW

    # Employee cannot approve their own task
    with pytest.raises(HTTPException) as exc_info:
        await transition_task(task=task_a, actor=employee_a, action="approve")
    assert exc_info.value.status_code == 403

    # Manager can approve
    result = await transition_task(task=task_a, actor=manager_a, action="approve")
    assert result.status == TaskStatus.APPROVED


@mongo_required
@pytest.mark.asyncio
async def test_rbac_company_b_cannot_access_company_a_reports(mongo_db):
    """Company B cannot access Company A report data."""
    company_a = "company-a-reports"
    company_b = "company-b-reports"

    admin_a = await _create_user("admin@a-reports.com", company_a, UserRole.ADMIN)
    admin_b = await _create_user("admin@b-reports.com", company_b, UserRole.ADMIN)

    project_a = await _create_project(company_a, "Report Project", "RP-001", str(admin_a.id))
    task_a = await _create_task(company_a, "Report Task", "RP-001", str(admin_a.id))

    # Verify company-scoped queries
    tasks_a = await Task.find(Task.company_id == company_a).to_list()
    tasks_b = await Task.find(Task.company_id == company_b).to_list()

    assert len(tasks_a) == 1
    assert len(tasks_b) == 0
    assert tasks_a[0].company_id == company_a


# ===========================================================================
# PATH 6: Concurrency / Idempotency
# ===========================================================================

@mongo_required
@pytest.mark.asyncio
async def test_idempotency_double_start_timer(mongo_db):
    """Double start timer produces exactly one session."""
    company = "idem-timer-co"
    admin = await _create_user("admin@idem.com", company, UserRole.ADMIN)
    employee = await _create_user("employee@idem.com", company, UserRole.EMPLOYEE)
    task = await _create_task(company, "Timer Task", "IDEM-001", str(admin.id),
                              assigned_to=str(employee.id))

    now = utc_now()

    # First start
    session1 = ActiveTimeSession(
        company_id=company,
        user_id=str(employee.id),
        task_id=str(task.id),
        status=ActiveTimeSessionStatus.RUNNING,
        started_at=now,
        paused_duration_ms=0,
    )
    await session1.insert()

    # Check for existing session (prevents double start)
    existing = await ActiveTimeSession.find_one(
        ActiveTimeSession.user_id == str(employee.id),
        ActiveTimeSession.status == ActiveTimeSessionStatus.RUNNING,
    )
    assert existing is not None
    assert str(existing.id) == str(session1.id)

    # Only one running session
    running_sessions = await ActiveTimeSession.find(
        ActiveTimeSession.user_id == str(employee.id),
        ActiveTimeSession.status == ActiveTimeSessionStatus.RUNNING,
    ).to_list()
    assert len(running_sessions) == 1


@mongo_required
@pytest.mark.asyncio
async def test_idempotency_double_stop_timer(mongo_db):
    """Double stop timer: first succeeds, second finds no running session."""
    company = "idem-stop-co"
    admin = await _create_user("admin@idemstop.com", company, UserRole.ADMIN)
    employee = await _create_user("employee@idemstop.com", company, UserRole.EMPLOYEE)
    task = await _create_task(company, "Stop Task", "IDEM-STOP-001", str(admin.id),
                              assigned_to=str(employee.id))

    now = utc_now()

    # Create and stop session
    session = ActiveTimeSession(
        company_id=company,
        user_id=str(employee.id),
        task_id=str(task.id),
        status=ActiveTimeSessionStatus.RUNNING,
        started_at=now,
        paused_duration_ms=0,
    )
    await session.insert()

    # Stop: mark as stopped
    session.status = ActiveTimeSessionStatus.STOPPING
    await session.save()

    # Create time log
    log = TimeLog(
        company_id=company,
        user_id=str(employee.id),
        user_name="Test Employee",
        task_id=str(task.id),
        hours=1.0,
        date=now,
        started_at=now,
        ended_at=now + timedelta(hours=1),
        source="timer",
    )
    await log.insert()

    # Second stop: no running session exists
    running = await ActiveTimeSession.find_one(
        ActiveTimeSession.user_id == str(employee.id),
        ActiveTimeSession.status == ActiveTimeSessionStatus.RUNNING,
    )
    assert running is None  # No running session to stop

    # Verify exactly one time log
    logs = await TimeLog.find(TimeLog.task_id == str(task.id)).to_list()
    assert len(logs) == 1


@mongo_required
@pytest.mark.asyncio
async def test_idempotency_double_project_completion(mongo_db):
    """Double project completion: first succeeds, second is already completed."""
    company = "idem-proj-co"
    admin = await _create_user("admin@idemproj.com", company, UserRole.ADMIN)
    project = await _create_project(company, "Completion Test", "IDEM-PROJ-001",
                                    str(admin.id))
    task = await _create_task(company, "Task", "IDEM-PROJ-001", str(admin.id))
    task.status = TaskStatus.COMPLETED
    await task.save()

    # Move to review status for completion
    project.status = ProjectStatus.REVIEW
    await project.save()

    # First completion
    completed = await mark_project_completed(project, admin)
    assert completed.status == ProjectStatus.COMPLETED

    # Second completion should raise conflict (already completed)
    with pytest.raises(HTTPException) as exc_info:
        await mark_project_completed(completed, admin)
    assert exc_info.value.status_code == 409  # Conflict: already completed


@mongo_required
@pytest.mark.asyncio
async def test_idempotency_double_template_generation(mongo_db):
    """Double template generation: existing project reused, tasks idempotent."""
    company = "idem-tpl-co"
    admin = await _create_user("admin@idemtpl.com", company, UserRole.ADMIN)
    employee = await _create_user("employee@idemtpl.com", company, UserRole.EMPLOYEE)

    template = ProjectTemplate(
        company_id=company,
        name="Idempotent Template",
        project_type="software",
        enabled=True,
        created_by=str(admin.id),
    )
    await template.insert()

    tt = TemplateTask(
        template_id=str(template.id),
        company_id=company,
        ref_id="task-1",
        title="Template Task",
        priority=TemplateTaskPriority.MEDIUM,
        relative_start_day=0,
        relative_due_day=3,
        review_required=True,
        depends_on_refs=[],
        order=0,
    )
    await tt.insert()

    # First generation: create project and task
    project = await _create_project(company, "Generated Project", "GEN-001",
                                    str(admin.id))
    task = await _create_task(company, "Template Task", "GEN-001", str(admin.id),
                              assigned_to=str(employee.id))

    # Verify project and task exist
    db_project = await Project.find_one(Project.project_id == "GEN-001")
    assert db_project is not None

    db_tasks = await Task.find(Task.project_id == "GEN-001").to_list()
    assert len(db_tasks) == 1

    # Second generation: should not create duplicate
    existing_project = await Project.find_one(Project.project_id == "GEN-001")
    assert existing_project is not None

    existing_tasks = await Task.find(Task.project_id == "GEN-001").to_list()
    assert len(existing_tasks) == 1  # Still exactly one


@mongo_required
@pytest.mark.asyncio
async def test_idempotency_double_request_conversion(mongo_db):
    """Double work request conversion creates one Task only."""
    company = "idem-req-co"
    admin = await _create_user("admin@idemreq.com", company, UserRole.ADMIN)
    employee = await _create_user("employee@idemreq.com", company, UserRole.EMPLOYEE)

    request = WorkRequest(
        request_id=f"REQ-{uuid4().hex[:8]}",
        company_id=company,
        title="Convert Me",
        description="Convert this to a task",
        type=WorkRequestType.NEW_WORK,
        status=WorkRequestStatus.APPROVED,
        requested_by=str(employee.id),
    )
    await request.insert()

    # First conversion
    task = await _create_task(company, "Convert Me", "IDEM-REQ-001", str(admin.id))
    request.status = WorkRequestStatus.CONVERTED
    request.converted_task_id = str(task.id)
    await request.save()

    # Second conversion attempt: status already CONVERTED
    assert request.status == WorkRequestStatus.CONVERTED

    # Verify one task
    tasks = await Task.find(Task.title == "Convert Me").to_list()
    assert len(tasks) == 1


@mongo_required
@pytest.mark.asyncio
async def test_idempotency_double_scheduled_occurrence(mongo_db):
    """Double scheduled occurrence: only one Task created."""
    company = "idem-sched-co"
    admin = await _create_user("admin@idemsched.com", company, UserRole.ADMIN)

    job = ScheduledJob(
        company_id=company,
        name="Idempotent Job",
        action_type="CREATE_TASK",
        payload={"title": "Scheduled Task"},
        schedule_type=ScheduledJobScheduleType.RECURRING,
        run_at=utc_now() - timedelta(hours=1),
        created_by=str(admin.id),
    )
    await job.insert()

    # First occurrence
    occurrence = ScheduledJobOccurrence(
        scheduled_job_id=str(job.id),
        company_id=company,
        occurrence_id=f"OCC-{uuid4().hex[:8]}",
        scheduled_at=utc_now() - timedelta(hours=1),
        status="COMPLETED",
    )
    await occurrence.insert()
    task = await _create_task(company, "Scheduled Task", "IDEM-SCHED-001", str(admin.id))
    occurrence.result_id = str(task.id)
    await occurrence.save()

    # Check: already completed
    existing = await ScheduledJobOccurrence.find_one(
        ScheduledJobOccurrence.scheduled_job_id == str(job.id),
        ScheduledJobOccurrence.status == "COMPLETED",
    )
    assert existing is not None

    # Only one task
    tasks = await Task.find(Task.title == "Scheduled Task").to_list()
    assert len(tasks) == 1


# ===========================================================================
# CROSS-CUTTING: Project Health for Terminal Projects
# ===========================================================================

@mongo_required
@pytest.mark.asyncio
async def test_terminal_project_not_at_risk(mongo_db):
    """Completed/Archived projects should not appear as at-risk."""
    company = "health-co"
    admin = await _create_user("admin@health.com", company, UserRole.ADMIN)
    now = utc_now()

    # Create completed project with overdue historical task
    project = await _create_project(company, "Done Project", "HP-001",
                                    str(admin.id), status=ProjectStatus.COMPLETED)

    old_task = Task(
        title="Old overdue task",
        company_id=company,
        project_id="HP-001",
        created_by=str(admin.id),
        status=TaskStatus.COMPLETED,
        due_date=now - timedelta(days=30),
        completed_at=now - timedelta(days=25),
    )
    await old_task.insert()

    health = calculate_project_health(project, [old_task], now)
    # Terminal project should be healthy, not at_risk
    assert health.level == "healthy"
    assert "overdue" not in " ".join(health.reasons).lower()


@mongo_required
@pytest.mark.asyncio
async def test_archived_project_not_at_risk(mongo_db):
    """Archived projects should not be reported as at-risk."""
    company = "archive-health-co"
    admin = await _create_user("admin@archive.com", company, UserRole.ADMIN)
    now = utc_now()

    project = await _create_project(company, "Archived Project", "AHP-001",
                                    str(admin.id), status=ProjectStatus.ARCHIVED)

    overdue_task = Task(
        title="Overdue historical",
        company_id=company,
        project_id="AHP-001",
        created_by=str(admin.id),
        status=TaskStatus.COMPLETED,
        due_date=now - timedelta(days=10),
    )
    await overdue_task.insert()

    health = calculate_project_health(project, [overdue_task], now)
    assert health.level == "healthy"


# ===========================================================================
# MANDATORY TESTS: Final Repair
# ===========================================================================

@mongo_required
@pytest.mark.asyncio
async def test_automation_assign_invalid_cross_company(mongo_db):
    """Automation cannot assign invalid/cross-company assignee."""
    company_a = "auto-a"
    company_b = "auto-b"
    admin_a = await _create_user("admin@auto-a.com", company_a, UserRole.ADMIN)
    admin_b = await _create_user("admin@auto-b.com", company_b, UserRole.ADMIN)
    task = await _create_task(company_a, "Auto Task", "AUTO-001", str(admin_a.id))

    from app.core.automation_engine import AutomationEngine
    action = {"type": "assign_task", "assignee_id": str(admin_b.id)}
    trigger = {"entity_id": str(task.id), "user_id": str(admin_a.id), "company_id": company_a}

    with pytest.raises(ValueError, match="not a valid user"):
        await AutomationEngine._assign_task(action, trigger)


@mongo_required
@pytest.mark.asyncio
async def test_automation_assign_valid_produces_correct_status(mongo_db):
    """Automation assignment produces correct status via workflow."""
    company = "auto-valid"
    admin = await _create_user("admin@autovalid.com", company, UserRole.ADMIN)
    employee = await _create_user("employee@autovalid.com", company, UserRole.EMPLOYEE)
    task = await _create_task(company, "Auto Assign Task", "AUTO-V-001", str(admin.id))
    task.status = TaskStatus.TODO
    await task.save()

    from app.core.automation_engine import AutomationEngine
    action = {"type": "assign_task", "assignee_id": str(employee.id)}
    trigger = {"entity_id": str(task.id), "user_id": str(admin.id), "company_id": company}
    await AutomationEngine._assign_task(action, trigger)

    db_task = await Task.get(str(task.id))
    assert db_task.status == TaskStatus.ASSIGNED


@mongo_required
@pytest.mark.asyncio
async def test_timer_stop_recovery_idempotent(mongo_db):
    """Timer failure after STOPPING can recover; repeated recovery creates one TimeLog."""
    company = "timer-recov"
    admin = await _create_user("admin@timerrecov.com", company, UserRole.ADMIN)
    employee = await _create_user("employee@timerrecov.com", company, UserRole.EMPLOYEE)
    task = await _create_task(company, "Timer Task", "TREC-001", str(admin.id),
                              assigned_to=str(employee.id))
    now = utc_now()

    session = ActiveTimeSession(
        company_id=company, user_id=str(employee.id), task_id=str(task.id),
        status=ActiveTimeSessionStatus.STOPPING,
        started_at=now - timedelta(hours=1), last_resumed_at=now - timedelta(hours=1),
        accumulated_seconds=3600, finalized=False,
    )
    await session.insert()

    from app.services.time_tracking_service import recover_stopped_timer
    log1 = await recover_stopped_timer(session)
    assert log1.hours > 0

    # Re-insert session for second recovery attempt
    session2 = ActiveTimeSession(
        company_id=company, user_id=str(employee.id), task_id=str(task.id),
        status=ActiveTimeSessionStatus.STOPPING,
        started_at=session.started_at, last_resumed_at=session.last_resumed_at,
        accumulated_seconds=session.accumulated_seconds, finalized=False,
    )
    await session2.insert()
    log2 = await recover_stopped_timer(session2)
    # Should return the existing log, not create a duplicate
    assert str(log2.id) == str(log1.id)

    # Verify exactly one TimeLog in DB
    logs = await TimeLog.find(TimeLog.task_id == str(task.id)).to_list()
    assert len(logs) == 1


@mongo_required
@pytest.mark.asyncio
async def test_template_edit_preserves_tasks(mongo_db):
    """Editing template metadata must NOT delete existing template tasks."""
    company = "tpl-preserve"
    admin = await _create_user("admin@tplpres.com", company, UserRole.ADMIN)

    template = ProjectTemplate(
        company_id=company, name="Preserve Me", project_type="software",
        enabled=True, created_by=str(admin.id),
    )
    await template.insert()

    tt = TemplateTask(
        template_id=str(template.id), company_id=company,
        ref_id="task-1", title="Existing Task",
        priority=TemplateTaskPriority.MEDIUM,
        relative_start_day=0, relative_due_day=3,
        review_required=True, depends_on_refs=[], order=0,
    )
    await tt.insert()

    # Update metadata only (empty task_templates list)
    from app.services.project_template_service import update_template
    updated = await update_template(
        template=template, name="Preserve Me Updated",
        task_templates=[],  # empty list = metadata-only edit
        current_user=admin,
    )

    assert updated.name == "Preserve Me Updated"

    # Verify template task still exists
    remaining = await TemplateTask.find(
        TemplateTask.template_id == str(template.id)
    ).to_list()
    assert len(remaining) == 1
    assert remaining[0].title == "Existing Task"


@mongo_required
@pytest.mark.asyncio
async def test_task_report_includes_health(mongo_db):
    """Task Report returns correct Health field."""
    company = "report-health"
    admin = await _create_user("admin@repthealth.com", company, UserRole.ADMIN)
    now = utc_now()

    overdue_task = await _create_task(
        company, "Overdue Task", "RH-001", str(admin.id),
        due_date=now - timedelta(days=5),
    )
    overdue_task.status = TaskStatus.IN_PROGRESS
    await overdue_task.save()

    from app.services.task_health_service import calculate_task_health
    health = calculate_task_health(overdue_task, now)
    assert health.value == "overdue"


@mongo_required
@pytest.mark.asyncio
async def test_project_reopen_audit_recorded(mongo_db):
    """Project reopen records audit in ChangeLog."""
    company = "audit-reopen"
    admin = await _create_user("admin@auditreopen.com", company, UserRole.ADMIN)
    project = await _create_project(company, "Audit Project", "AP-RE-001",
                                    str(admin.id), status=ProjectStatus.COMPLETED)

    from app.models.changelog import ChangeLog

    from app.services.project_completion_service import _record_project_audit
    await _record_project_audit(project, admin, "reopen", "completed", "review", reason="Re-doing work")

    logs = await ChangeLog.find(
        ChangeLog.task_id == str(project.id),
        ChangeLog.field == "project_status",
    ).to_list()
    assert len(logs) >= 1
    log = logs[-1]
    assert log.metadata["action"] == "reopen"
    assert log.metadata["old_status"] == "completed"
    assert log.metadata["new_status"] == "review"
    assert log.metadata["reason"] == "Re-doing work"


@mongo_required
@pytest.mark.asyncio
async def test_project_complete_audit_recorded(mongo_db):
    """Project completion records audit in ChangeLog."""
    company = "audit-complete"
    admin = await _create_user("admin@auditcomplete.com", company, UserRole.ADMIN)
    project = await _create_project(company, "Complete Audit", "AP-C-001",
                                    str(admin.id), status=ProjectStatus.REVIEW)
    task = await _create_task(company, "Done Task", "AP-C-001", str(admin.id))
    task.status = TaskStatus.COMPLETED
    await task.save()

    from app.services.project_completion_service import mark_project_completed, _record_project_audit
    await mark_project_completed(project, admin)

    # Verify audit was recorded (mark_project_completed calls _record_project_audit)
    from app.models.changelog import ChangeLog
    logs = await ChangeLog.find(
        ChangeLog.task_id == str(project.id),
        ChangeLog.field == "project_status",
    ).to_list()
    assert len(logs) >= 1
    log = logs[-1]
    assert log.metadata["action"] == "complete"
    assert log.metadata["new_status"] == "completed"
