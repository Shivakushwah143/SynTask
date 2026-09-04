"""
Task Workspace Redesign - status summary counts, attention filters, RBAC.

Pure-logic tests run everywhere (no DB). Real-Beanie tests verify the actual
summary/list endpoint functions against MongoDB and are gated by
RUN_MONGO_INTEGRATION=1 following the repository convention.
"""
import os
from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.api.deps import PaginationParams
from app.api.v1.endpoints import tasks as task_endpoints
from app.core.clock import utc_now
from app.models.project import Project
from app.models.scheduled_job import ScheduledJob
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.timeline import TimelineEvent
from app.models.user import User, UserRole, UserStatus


mongo_required = pytest.mark.skipif(
    os.getenv("RUN_MONGO_INTEGRATION") != "1",
    reason="Set RUN_MONGO_INTEGRATION=1 with a real MongoDB service container available.",
)


# ---------------------------------------------------------------------------
# Pure-logic tests (no database)
# ---------------------------------------------------------------------------

def fake_task(task_id, status, priority="medium", health="healthy"):
    return SimpleNamespace(
        id=task_id,
        status=status,
        priority=priority,
        health_status=health,
    )


class TestBuildStatusSummaryCounts:
    def test_counts_every_lifecycle_status_and_attention_bucket(self):
        tasks = [
            fake_task("t-todo", "todo"),
            fake_task("t-assigned", "assigned"),
            fake_task("t-progress", "in_progress", health="overdue"),
            fake_task("t-review", "in_review"),
            fake_task("t-revision", "revision_required"),
            fake_task("t-approved", "approved"),
            fake_task("t-completed", "completed"),
            fake_task("t-cancelled", "cancelled"),
            fake_task("t-critical", "todo", priority="critical"),
            fake_task("t-due-today", "todo", health="due_today"),
            fake_task("t-blocked", "in_progress", health="overdue"),
        ]
        blocked_ids = {"t-blocked"}

        summary = task_endpoints.build_status_summary_counts(tasks, blocked_task_ids=blocked_ids)

        assert summary["all"] == 11
        assert summary["todo"] == 3
        assert summary["assigned"] == 1
        assert summary["in_progress"] == 2
        assert summary["in_review"] == 1
        assert summary["revision_required"] == 1
        assert summary["approved"] == 1
        assert summary["completed"] == 1
        assert summary["cancelled"] == 1
        assert summary["blocked"] == 1
        assert summary["overdue"] == 2
        assert summary["due_today"] == 1
        assert summary["critical"] == 1
        # lifecycle counts always add up to "all"
        assert summary["all"] == sum(summary[status] for status in [s.value for s in TaskStatus])

    def test_unknown_statuses_stay_out_of_lifecycle_counts_but_count_in_all(self):
        tasks = [
            fake_task("t-known", "todo"),
            fake_task("t-legacy", "scheduled"),
        ]
        summary = task_endpoints.build_status_summary_counts(tasks)
        assert summary["all"] == 2
        assert summary["todo"] == 1
        assert "scheduled" not in summary

    def test_empty_collection(self):
        summary = task_endpoints.build_status_summary_counts([])
        assert summary["all"] == 0
        assert all(summary[key] == 0 for key in summary)


class TestHealthQueryConditions:
    def test_overdue_condition_uses_health_semantics(self):
        condition = task_endpoints._task_overdue_query_condition()
        assert condition["status"] == {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]}
        assert condition["extension_count"] == {"$in": [None, 0]}
        # due before the start of the current UTC day
        assert condition["due_date"]["$lt"] < datetime.utcnow()

    def test_due_today_condition_bounds_current_utc_day(self):
        condition = task_endpoints._task_due_today_query_condition()
        start = condition["due_date"]["$gte"]
        end = condition["due_date"]["$lt"]
        assert (end - start) == timedelta(days=1)
        assert start <= datetime.utcnow() < end


class TestQueryPartMerging:
    def test_single_part_returns_as_is(self):
        merged = task_endpoints._merge_query_parts([{"company_id": "c1"}])
        assert merged == {"company_id": "c1"}

    def test_multiple_parts_wrap_in_and(self):
        merged = task_endpoints._merge_query_parts([
            {"company_id": "c1"},
            {"status": "in_progress"},
            task_endpoints._task_overdue_query_condition(),
        ])
        assert "$and" in merged
        assert len(merged["$and"]) == 3
        # lifecycle status and attention condition never overwrite each other
        statuses = [part.get("status") for part in merged["$and"] if "status" in part]
        assert "in_progress" in statuses

    def test_empty_parts(self):
        assert task_endpoints._merge_query_parts([]) == {}
        assert task_endpoints._merge_query_parts([None, {}, None]) == {}


class TestDueRangeCondition:
    def test_date_only_values_cover_the_whole_day(self):
        condition = task_endpoints._task_due_range_condition("2026-07-01", "2026-07-31")
        assert condition["due_date"]["$gte"] == datetime(2026, 7, 1)
        assert condition["due_date"]["$lte"].hour == 23
        assert condition["due_date"]["$lte"].minute == 59

    def test_missing_bounds_are_omitted(self):
        condition = task_endpoints._task_due_range_condition(None, None)
        assert condition == {"due_date": {}}


# ---------------------------------------------------------------------------
# Real-Beanie integration tests (RUN_MONGO_INTEGRATION=1)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def mongo_db():
    db_name = f"syntask_workspace_{uuid4().hex}"
    client = AsyncIOMotorClient(
        os.getenv("MONGODB_URL", "mongodb://localhost:27017"),
        serverSelectionTimeoutMS=5000,
    )
    await client.admin.command("ping")
    await init_beanie(
        database=client[db_name],
        document_models=[User, Task, Project, ScheduledJob, TimelineEvent],
    )
    try:
        yield client[db_name]
    finally:
        await client.drop_database(db_name)
        client.close()


async def _create_user(email, company_id, role, first_name="Test", reports_to=None, ancestors=None):
    user = User(
        email=email,
        first_name=first_name,
        last_name="User",
        role=role,
        status=UserStatus.ACTIVE,
        company_id=company_id,
        modules=["task", "tasks_projects"],
    )
    if reports_to is not None:
        user.reports_to = str(reports_to)
    if ancestors:
        user.ancestors = [str(item) for item in ancestors]
    await user.insert()
    return user


async def _create_task(
    company_id,
    title,
    created_by,
    assigned_to=None,
    status=TaskStatus.TODO,
    priority=TaskPriority.MEDIUM,
    due_date=None,
    dependencies=None,
    source_type=None,
):
    task = Task(
        title=title,
        company_id=company_id,
        created_by=created_by,
        assigned_to=assigned_to,
        status=status,
        priority=priority,
        due_date=due_date,
        dependencies=dependencies or [],
        source_type=source_type,
    )
    await task.insert()
    return task


@mongo_required
@pytest.mark.asyncio
async def test_admin_summary_counts_match_seeded_tasks(mongo_db):
    company = "summary-co"
    admin = await _create_user("admin@summary.com", company, UserRole.ADMIN)
    employee = await _create_user("emp@summary.com", company, UserRole.EMPLOYEE)
    now = utc_now()

    # One task per lifecycle status with known attention properties.
    statuses = [
        TaskStatus.TODO,
        TaskStatus.ASSIGNED,
        TaskStatus.IN_PROGRESS,
        TaskStatus.IN_REVIEW,
        TaskStatus.REVISION_REQUIRED,
        TaskStatus.APPROVED,
        TaskStatus.COMPLETED,
        TaskStatus.CANCELLED,
    ]
    created = {}
    for status in statuses:
        created[status] = await _create_task(
            company, f"Task {status.value}", str(admin.id),
            assigned_to=str(employee.id), status=status,
        )

    # Overdue: in_progress with past due date and no extension
    await _create_task(
        company, "Overdue task", str(admin.id),
        assigned_to=str(employee.id), status=TaskStatus.IN_PROGRESS,
        due_date=now - timedelta(days=2),
    )
    # Due today
    await _create_task(
        company, "Due today task", str(admin.id),
        assigned_to=str(employee.id), status=TaskStatus.IN_PROGRESS,
        due_date=now,
    )
    # Critical priority
    await _create_task(
        company, "Critical task", str(admin.id),
        assigned_to=str(employee.id), priority=TaskPriority.CRITICAL,
    )
    # Blocked by an incomplete dependency
    blocker = await _create_task(
        company, "Blocker", str(admin.id),
        assigned_to=str(employee.id), status=TaskStatus.IN_PROGRESS,
    )
    await _create_task(
        company, "Blocked task", str(admin.id),
        assigned_to=str(employee.id), status=TaskStatus.IN_PROGRESS,
        dependencies=[str(blocker.id)],
    )
    # Extended (extension_count) task is neither overdue nor due today
    extended = await _create_task(
        company, "Extended task", str(admin.id),
        assigned_to=str(employee.id), status=TaskStatus.IN_PROGRESS,
        due_date=now - timedelta(days=1),
    )
    extended.extension_count = 1
    await extended.save()

    summary = await task_endpoints.task_status_summary(admin)

    # 8 lifecycle tasks + overdue + due_today + critical + blocker + blocked + extended
    assert summary["all"] == 14
    # the critical task is created as TODO, so todo counts 2 (lifecycle + critical)
    assert summary["todo"] == 2
    # in_progress: status loop + overdue + due_today + blocked + extended + blocker
    assert summary["in_progress"] == 6
    for status in created:
        if status.value in ("todo", "in_progress"):
            continue
        assert summary[status.value] == 1, f"expected count 1 for {status.value}"
    assert summary["overdue"] == 1
    assert summary["due_today"] == 1
    assert summary["critical"] == 1
    assert summary["blocked"] == 1
    # extended tasks are never counted as overdue/due_today; the blocker stays healthy


@mongo_required
@pytest.mark.asyncio
async def test_employee_summary_scope_is_own_tasks(mongo_db):
    company = "emp-scope-co"
    admin = await _create_user("admin@empscope.com", company, UserRole.ADMIN)
    employee = await _create_user("emp@empscope.com", company, UserRole.EMPLOYEE)
    other = await _create_user("other@empscope.com", company, UserRole.EMPLOYEE)

    await _create_task(company, "Mine", str(admin.id), assigned_to=str(employee.id), status=TaskStatus.IN_PROGRESS)
    await _create_task(company, "Created by me", str(employee.id), status=TaskStatus.TODO)
    await _create_task(company, "Not mine", str(admin.id), assigned_to=str(other.id), status=TaskStatus.TODO)

    summary = await task_endpoints.task_status_summary(employee)
    assert summary["all"] == 2
    assert summary["in_progress"] == 1
    assert summary["todo"] == 1


@mongo_required
@pytest.mark.asyncio
async def test_lead_summary_scope_includes_subordinates(mongo_db):
    company = "lead-scope-co"
    admin = await _create_user("admin@leadscope.com", company, UserRole.ADMIN)
    lead = await _create_user("lead@leadscope.com", company, UserRole.LEAD)
    employee = await _create_user("emp@leadscope.com", company, UserRole.EMPLOYEE, reports_to=lead.id, ancestors=[lead.id])
    outsider = await _create_user("out@leadscope.com", company, UserRole.EMPLOYEE)

    await _create_task(company, "Subordinate task", str(admin.id), assigned_to=str(employee.id), status=TaskStatus.IN_PROGRESS)
    await _create_task(company, "Lead created", str(lead.id), status=TaskStatus.TODO)
    await _create_task(company, "Outsider task", str(admin.id), assigned_to=str(outsider.id), status=TaskStatus.TODO)

    summary = await task_endpoints.task_status_summary(lead)
    assert summary["all"] == 2
    assert summary["in_progress"] == 1
    assert summary["todo"] == 1


@mongo_required
@pytest.mark.asyncio
async def test_company_isolation_in_summary(mongo_db):
    company_a = "iso-a"
    company_b = "iso-b"
    admin_a = await _create_user("admin@a.com", company_a, UserRole.ADMIN)
    admin_b = await _create_user("admin@b.com", company_b, UserRole.ADMIN)

    await _create_task(company_a, "A task", str(admin_a.id), status=TaskStatus.TODO)
    await _create_task(company_b, "B task", str(admin_b.id), status=TaskStatus.TODO)
    await _create_task(company_b, "B task 2", str(admin_b.id), status=TaskStatus.COMPLETED)

    summary_a = await task_endpoints.task_status_summary(admin_a)
    summary_b = await task_endpoints.task_status_summary(admin_b)

    assert summary_a["all"] == 1
    assert summary_b["all"] == 2
    assert summary_a["todo"] == 1
    assert summary_a["completed"] == 0


@mongo_required
@pytest.mark.asyncio
async def test_follow_up_tasks_excluded_from_summary(mongo_db):
    company = "followup-co"
    admin = await _create_user("admin@followup.com", company, UserRole.ADMIN)
    await _create_task(company, "Normal task", str(admin.id), status=TaskStatus.TODO)
    await _create_task(
        company, "Sales follow-up", str(admin.id),
        status=TaskStatus.IN_PROGRESS, source_type="sales_follow_up",
    )

    summary = await task_endpoints.task_status_summary(admin)
    assert summary["all"] == 1
    assert summary["in_progress"] == 0


@mongo_required
@pytest.mark.asyncio
async def test_list_status_filter_and_pagination(mongo_db):
    company = "list-filter-co"
    admin = await _create_user("admin@listfilter.com", company, UserRole.ADMIN)
    for idx in range(5):
        await _create_task(company, f"Todo {idx}", str(admin.id), status=TaskStatus.TODO)
    for idx in range(3):
        await _create_task(company, f"Progress {idx}", str(admin.id), status=TaskStatus.IN_PROGRESS)

    page = await task_endpoints.list_tasks(
        status_filter="in_progress",
        pagination=PaginationParams(skip=0, limit=20),
        current_user=admin,
    )
    assert page["total"] == 3
    assert all(task["status"] == "in_progress" for task in page["tasks"])

    page2 = await task_endpoints.list_tasks(
        status_filter="todo",
        pagination=PaginationParams(skip=2, limit=2),
        current_user=admin,
    )
    assert page2["total"] == 5
    assert len(page2["tasks"]) == 2
    assert page2["skip"] == 2


@mongo_required
@pytest.mark.asyncio
async def test_list_attention_filters(mongo_db):
    company = "attention-co"
    admin = await _create_user("admin@attention.com", company, UserRole.ADMIN)
    now = utc_now()

    await _create_task(
        company, "Overdue", str(admin.id), status=TaskStatus.IN_PROGRESS,
        due_date=now - timedelta(days=3),
    )
    await _create_task(
        company, "Due today", str(admin.id), status=TaskStatus.IN_PROGRESS,
        due_date=now,
    )
    await _create_task(
        company, "Critical", str(admin.id), priority=TaskPriority.CRITICAL,
    )
    blocker = await _create_task(
        company, "Blocker dep", str(admin.id), status=TaskStatus.IN_PROGRESS,
    )
    await _create_task(
        company, "Blocked", str(admin.id), status=TaskStatus.IN_PROGRESS,
        dependencies=[str(blocker.id)],
    )

    overdue_page = await task_endpoints.list_tasks(
        overdue=True, pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    assert [t["title"] for t in overdue_page["tasks"]] == ["Overdue"]

    due_today_page = await task_endpoints.list_tasks(
        due_today=True, pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    assert [t["title"] for t in due_today_page["tasks"]] == ["Due today"]

    critical_page = await task_endpoints.list_tasks(
        critical=True, pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    assert [t["title"] for t in critical_page["tasks"]] == ["Critical"]

    blocked_page = await task_endpoints.list_tasks(
        blocked=True, pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    assert [t["title"] for t in blocked_page["tasks"]] == ["Blocked"]
    assert blocked_page["total"] == 1
    # unblocked flag returns every task that is not dependency-blocked
    unblocked_page = await task_endpoints.list_tasks(
        blocked=False, pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    assert unblocked_page["total"] == 4

    # lifecycle status and attention condition combine
    combo = await task_endpoints.list_tasks(
        status_filter="in_progress", overdue=True,
        pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    assert [t["title"] for t in combo["tasks"]] == ["Overdue"]


@mongo_required
@pytest.mark.asyncio
async def test_list_combined_filters(mongo_db):
    company = "combined-co"
    admin = await _create_user("admin@combined.com", company, UserRole.ADMIN)
    employee = await _create_user("emp@combined.com", company, UserRole.EMPLOYEE)

    await _create_task(
        company, "High in progress", str(admin.id), assigned_to=str(employee.id),
        status=TaskStatus.IN_PROGRESS, priority=TaskPriority.HIGH,
    )
    await _create_task(
        company, "Medium in progress", str(admin.id), assigned_to=str(employee.id),
        status=TaskStatus.IN_PROGRESS, priority=TaskPriority.MEDIUM,
    )
    await _create_task(
        company, "High todo", str(admin.id), assigned_to=str(employee.id),
        status=TaskStatus.TODO, priority=TaskPriority.HIGH,
    )

    page = await task_endpoints.list_tasks(
        status_filter="in_progress", priority="high", assigned_to=str(employee.id),
        pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    assert [t["title"] for t in page["tasks"]] == ["High in progress"]
    assert page["total"] == 1


@mongo_required
@pytest.mark.asyncio
async def test_list_search_filter(mongo_db):
    company = "search-co"
    admin = await _create_user("admin@search.com", company, UserRole.ADMIN)
    await _create_task(company, "Design the landing page", str(admin.id), status=TaskStatus.TODO)
    await _create_task(company, "Build the API", str(admin.id), status=TaskStatus.TODO)
    await _create_task(company, "Write tests", str(admin.id), status=TaskStatus.TODO)

    page = await task_endpoints.list_tasks(
        search="landing", pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    assert [t["title"] for t in page["tasks"]] == ["Design the landing page"]
    assert page["total"] == 1

    multi = await task_endpoints.list_tasks(
        search="Design API", pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    # $text default is OR across terms
    assert multi["total"] == 2


@mongo_required
@pytest.mark.asyncio
async def test_list_exclude_follow_up(mongo_db):
    company = "exclude-fu-co"
    admin = await _create_user("admin@excludefu.com", company, UserRole.ADMIN)
    await _create_task(company, "Normal", str(admin.id), status=TaskStatus.TODO)
    await _create_task(company, "Follow up", str(admin.id), status=TaskStatus.TODO, source_type="sales_follow_up")

    page = await task_endpoints.list_tasks(
        exclude_follow_up=True, pagination=PaginationParams(skip=0, limit=20), current_user=admin,
    )
    assert page["total"] == 1
    assert [t["title"] for t in page["tasks"]] == ["Normal"]


@mongo_required
@pytest.mark.asyncio
async def test_list_company_isolation(mongo_db):
    company_a = "list-iso-a"
    company_b = "list-iso-b"
    admin_a = await _create_user("admin@a.com", company_a, UserRole.ADMIN)
    admin_b = await _create_user("admin@b.com", company_b, UserRole.ADMIN)

    await _create_task(company_a, "A task", str(admin_a.id), status=TaskStatus.TODO)
    await _create_task(company_b, "B task", str(admin_b.id), status=TaskStatus.TODO)

    page_a = await task_endpoints.list_tasks(
        pagination=PaginationParams(skip=0, limit=20), current_user=admin_a,
    )
    page_b = await task_endpoints.list_tasks(
        pagination=PaginationParams(skip=0, limit=20), current_user=admin_b,
    )
    assert page_a["total"] == 1
    assert page_b["total"] == 1
    assert page_a["tasks"][0]["title"] == "A task"
    assert page_b["tasks"][0]["title"] == "B task"


@mongo_required
@pytest.mark.asyncio
async def test_employee_list_scope_and_status_counts_consistent(mongo_db):
    company = "scope-consistency-co"
    admin = await _create_user("admin@scopeconsist.com", company, UserRole.ADMIN)
    employee = await _create_user("emp@scopeconsist.com", company, UserRole.EMPLOYEE)

    await _create_task(company, "Assigned to me", str(admin.id), assigned_to=str(employee.id), status=TaskStatus.IN_PROGRESS)
    await _create_task(company, "I created", str(employee.id), status=TaskStatus.TODO)
    await _create_task(company, "Someone else", str(admin.id), status=TaskStatus.TODO)

    page = await task_endpoints.list_tasks(
        exclude_follow_up=True, pagination=PaginationParams(skip=0, limit=20), current_user=employee,
    )
    summary = await task_endpoints.task_status_summary(employee)

    # Employee list total and summary "all" must agree for the Tasks page.
    assert page["total"] == summary["all"] == 2
