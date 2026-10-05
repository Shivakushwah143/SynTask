"""Sales Follow-up API tests.

These tests exercise the dedicated Sales follow-up layer end-to-end at the
endpoint/service level using fakes for the document models (no Mongo required),
mirroring the pattern in tests/api/test_scheduled_task_list_visibility.py.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import sales_followups as followups
from app.core.clock import utc_now
from app.models.scheduled_job import ScheduledJobActionType, ScheduledJobStatus
from app.models.user import UserRole


# ── Helpers ──────────────────────────────────────────────────────────────────
def user(user_id="user-1", role=UserRole.ADMIN, company_id="company-1", status="active"):
    return SimpleNamespace(
        id=user_id,
        role=role,
        company_id=company_id,
        status=status,
        first_name="A",
        last_name="B",
        email=f"{user_id}@example.com",
    )


class FakeLead:
    def __init__(self, **kwargs):
        self.id = kwargs.pop("id", "lead-1")
        self.company_id = kwargs.pop("company_id", "company-1")
        self.deleted = kwargs.pop("deleted", False)
        self.current_stage = kwargs.pop("current_stage", "Qualify")
        self.assigned_to = kwargs.pop("assigned_to", "user-1")
        self.assigned_by = kwargs.pop("assigned_by", "user-1")
        self.created_by = kwargs.pop("created_by", "user-1")
        self.prospect_name = kwargs.pop("prospect_name", "Acme Pvt Ltd")
        self.company_name = kwargs.pop("company_name", "Acme Corp")
        self.next_follow_up_at = kwargs.pop("next_follow_up_at", None)
        self.next_action = kwargs.pop("next_action", None)
        self.transferred_at = kwargs.pop("transferred_at", None)
        self.won_status = kwargs.pop("won_status", None)
        self.updated_at = kwargs.pop("updated_at", utc_now())
        self.saved = False
        for key, value in kwargs.items():
            setattr(self, key, value)

    async def save(self):
        self.saved = True
        return self


def lead(lead_id="lead-1", company_id="company-1", stage="Qualify", assigned_to="user-1", **overrides):
    values = dict(
        id=lead_id,
        company_id=company_id,
        deleted=False,
        current_stage=stage,
        assigned_to=assigned_to,
        assigned_by="user-1",
        created_by="user-1",
        prospect_name="Acme Pvt Ltd",
        company_name="Acme Corp",
        next_follow_up_at=None,
        next_action=None,
        transferred_at=None,
        won_status=None,
        updated_at=utc_now(),
    )
    values.update(overrides)
    return FakeLead(**values)


class FakeLeadModel:
    leads = {}

    @classmethod
    async def get(cls, lead_id):
        return cls.leads.get(lead_id)

    @classmethod
    async def find_one(cls, query):
        return None


class FakeScheduledJobModel:
    jobs = {}

    @classmethod
    async def get(cls, job_id):
        return cls.jobs.get(job_id)

    @classmethod
    def find(cls, query):
        return FakeCursor(list(cls.jobs.values()))


class FakeUserModel:
    users = {}

    @classmethod
    async def get(cls, user_id):
        return cls.users.get(user_id)


class FakeCursor:
    def __init__(self, items):
        self._items = items

    def sort(self, *args, **kwargs):
        return self

    def skip(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    async def to_list(self):
        return list(self._items)

    async def count(self):
        return len(self._items)


class FakeJob:
    def __init__(self, **kwargs):
        self.id = kwargs.pop("id", "job-1")
        self.action_type = kwargs.pop("action_type", ScheduledJobActionType.CREATE_TASK)
        self.payload = kwargs.pop("payload", {})
        self.run_at = kwargs.pop("run_at", utc_now() + timedelta(days=1))
        self.status = kwargs.pop("status", ScheduledJobStatus.PENDING)
        self.company_id = kwargs.pop("company_id", "company-1")
        self.created_by = kwargs.pop("created_by", "user-1")
        self.created_at = kwargs.pop("created_at", utc_now())
        self.completed_at = kwargs.pop("completed_at", None)
        self.notes = kwargs.pop("notes", None)
        self.retry_count = kwargs.pop("retry_count", 0)
        self.error = kwargs.pop("error", None)
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.deleted = False

    async def save(self):
        return self

    async def delete(self):
        self.deleted = True


class FakeActivity:
    stored = []

    def __init__(self, **kwargs):
        self.id = kwargs.pop("id", "activity-1")
        self.metadata = kwargs.pop("metadata", {}) or {}
        for key, value in kwargs.items():
            setattr(self, key, value)
        self.status = getattr(self, "status", None)

    @classmethod
    async def find_one(cls, query):
        return next(
            (
                a
                for a in cls.stored
                if getattr(a, "metadata", {}).get("scheduled_job_id") == query.get("metadata.scheduled_job_id")
            ),
            None,
        )

    @classmethod
    async def find(cls, query):
        return FakeCursor([a for a in cls.stored if a.metadata.get("scheduled_job_id") == query.get("metadata.scheduled_job_id")])

    async def insert(self):
        FakeActivity.stored.append(self)

    async def save(self):
        return self


@pytest.fixture(autouse=True)
def _install_fakes(monkeypatch):
    FakeLeadModel.leads = {}
    FakeScheduledJobModel.jobs = {}
    FakeUserModel.users = {}
    FakeActivity.stored = []

    monkeypatch.setattr(followups, "SalesProspect", FakeLeadModel)
    monkeypatch.setattr(followups, "ScheduledJob", FakeScheduledJobModel)
    monkeypatch.setattr(followups, "User", FakeUserModel)
    monkeypatch.setattr(followups, "CRMActivity", FakeActivity)

    async def _noop_access(*args, **kwargs):
        return None

    monkeypatch.setattr(followups, "require_owned_record_access", _noop_access)


# ── Creation ─────────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_create_follow_up_creates_one_pending_create_task_job_and_syncs_records(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead()
    FakeUserModel.users["user-1"] = user()
    current_user = user()

    captured = {}

    async def fake_schedule_job(**kwargs):
        captured.update(kwargs)
        return FakeJob(
            id="job-1",
            action_type=ScheduledJobActionType.CREATE_TASK,
            payload=kwargs["payload"],
            run_at=kwargs["run_at"],
            status=ScheduledJobStatus.PENDING,
            company_id=kwargs["company_id"],
            created_by=kwargs["created_by"],
            created_at=utc_now(),
        )

    monkeypatch.setattr(followups.SchedulingService, "schedule_job", fake_schedule_job)

    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() + timedelta(days=4),
        title="Follow up with Acme",
        notes="Call regarding revised proposal",
        assigned_to="user-1",
        priority="medium",
        estimated_hours=0.5,
    )
    response = await followups.create_sales_follow_up("lead-1", request, current_user)

    # 1. One pending CREATE_TASK scheduled job with the sales relation metadata.
    assert captured["action_type"] == ScheduledJobActionType.CREATE_TASK
    assert captured["payload"]["source_type"] == "sales_follow_up"
    assert captured["payload"]["related_entity_type"] == "sales_lead"
    assert captured["payload"]["related_entity_id"] == "lead-1"
    assert captured["payload"]["related_entity_stage"] == "qualify"
    assert captured["payload"]["related_entity_url"] == "/crm/leads/lead-1"
    assert captured["payload"]["task_type"] == "standard"
    assert captured["payload"]["tags"] == "sales-follow-up"
    assert captured["payload"]["due_date"] == request.scheduled_at

    # 2. Lead next follow-up fields updated; stage untouched.
    stored_lead = FakeLeadModel.leads["lead-1"]
    assert stored_lead.next_follow_up_at == request.scheduled_at
    assert stored_lead.next_action == "Follow up with Acme"
    assert stored_lead.assigned_to == "user-1"
    assert stored_lead.current_stage == "Qualify"

    # 3. One scheduled FOLLOW_UP CRM activity linked to the job.
    assert len(FakeActivity.stored) == 1
    activity = FakeActivity.stored[0]
    assert activity.activity_type == "follow_up"
    assert activity.status.value == "scheduled" or str(activity.status) == "scheduled"
    assert activity.entity_type == "lead"
    assert activity.entity_id == "lead-1"
    assert activity.metadata["scheduled_job_id"] == "job-1"
    assert activity.metadata["source"] == "sales_follow_up"
    assert activity.metadata["source_stage"] == "qualify"

    assert response["id"] == "job-1"
    assert response["activity_id"] == "activity-1"


@pytest.mark.asyncio
async def test_create_follow_up_converts_aware_datetime_to_naive_utc(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead()
    FakeUserModel.users["user-1"] = user()
    current_user = user()
    captured = {}

    async def fake_schedule_job(**kwargs):
        captured.update(kwargs)
        return FakeJob(
            id="job-1",
            action_type=ScheduledJobActionType.CREATE_TASK,
            payload=kwargs["payload"],
            run_at=kwargs["run_at"],
            status=ScheduledJobStatus.PENDING,
            company_id=kwargs["company_id"],
            created_by=kwargs["created_by"],
        )

    monkeypatch.setattr(followups.SchedulingService, "schedule_job", fake_schedule_job)

    aware = datetime(2026, 8, 20, 15, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=aware,
        assigned_to="user-1",
    )
    await followups.create_sales_follow_up("lead-1", request, current_user)

    assert captured["run_at"] == datetime(2026, 8, 20, 10, 0)
    assert FakeLeadModel.leads["lead-1"].next_follow_up_at == datetime(2026, 8, 20, 10, 0)


@pytest.mark.asyncio
async def test_create_follow_up_rejects_past_date():
    FakeLeadModel.leads["lead-1"] = lead()
    FakeUserModel.users["user-1"] = user()
    current_user = user()
    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() - timedelta(minutes=5),
        assigned_to="user-1",
    )
    with pytest.raises(HTTPException) as exc:
        await followups.create_sales_follow_up("lead-1", request, current_user)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Schedule time must be in the future"


@pytest.mark.asyncio
async def test_create_follow_up_rejects_cross_company_lead(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead(company_id="company-2")
    current_user = user()

    async def fake_access(*args, **kwargs):
        raise HTTPException(status_code=403, detail="Access denied")

    monkeypatch.setattr(followups, "require_owned_record_access", fake_access)

    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() + timedelta(days=1),
        assigned_to="user-1",
    )
    with pytest.raises(HTTPException) as exc:
        await followups.create_sales_follow_up("lead-1", request, current_user)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_create_follow_up_rejects_cross_company_assignee(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead()
    FakeUserModel.users["user-1"] = user()
    current_user = user()
    cross_company_assignee = user(user_id="user-9", company_id="company-2")
    FakeUserModel.users["user-9"] = cross_company_assignee

    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() + timedelta(days=1),
        assigned_to="user-9",
    )
    with pytest.raises(HTTPException) as exc:
        await followups.create_sales_follow_up("lead-1", request, current_user)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Assigned user must be from the same company"


@pytest.mark.asyncio
async def test_create_follow_up_allows_admin_assignee_and_updates_lead_owner(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead(assigned_to="manager-1")
    FakeUserModel.users["admin-1"] = user(user_id="admin-1", role=UserRole.ADMIN)
    current_user = user(user_id="manager-1", role=UserRole.MANAGER)

    captured = {}

    async def fake_schedule_job(**kwargs):
        captured.update(kwargs)
        return FakeJob(
            id="job-1",
            action_type=ScheduledJobActionType.CREATE_TASK,
            payload=kwargs["payload"],
            run_at=kwargs["run_at"],
            status=ScheduledJobStatus.PENDING,
            company_id=kwargs["company_id"],
            created_by=kwargs["created_by"],
        )

    monkeypatch.setattr(followups.SchedulingService, "schedule_job", fake_schedule_job)

    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() + timedelta(days=2),
        assigned_to="admin-1",
    )
    response = await followups.create_sales_follow_up("lead-1", request, current_user)

    assert response["assigned_to"] == "admin-1"
    assert captured["payload"]["assigned_to"] == "admin-1"
    assert FakeLeadModel.leads["lead-1"].assigned_to == "admin-1"


@pytest.mark.asyncio
async def test_employee_can_schedule_follow_up_for_self_on_owned_lead(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead(assigned_to="emp-1")
    FakeUserModel.users["emp-1"] = user(user_id="emp-1", role=UserRole.EMPLOYEE)
    current_user = user(user_id="emp-1", role=UserRole.EMPLOYEE)

    captured = {}

    async def fake_schedule_job(**kwargs):
        captured.update(kwargs)
        return FakeJob(id="job-1", action_type=ScheduledJobActionType.CREATE_TASK, payload=kwargs["payload"], run_at=kwargs["run_at"])

    monkeypatch.setattr(followups.SchedulingService, "schedule_job", fake_schedule_job)

    # EMPLOYEE passes through require_owned_record_access (owned lead) and must
    # resolve to self even when assigned_to is omitted.
    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() + timedelta(days=2),
        assigned_to=None,
    )
    response = await followups.create_sales_follow_up("lead-1", request, current_user)
    assert response["assigned_to"] == "emp-1"
    assert captured["payload"]["assigned_to"] == "emp-1"


@pytest.mark.asyncio
async def test_employee_cannot_schedule_for_another_user(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead(assigned_to="emp-1")
    FakeUserModel.users["emp-1"] = user(user_id="emp-1", role=UserRole.EMPLOYEE)
    FakeUserModel.users["other-1"] = user(user_id="other-1", role=UserRole.EMPLOYEE)
    current_user = user(user_id="emp-1", role=UserRole.EMPLOYEE)

    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() + timedelta(days=2),
        assigned_to="other-1",
    )
    with pytest.raises(HTTPException) as exc:
        await followups.create_sales_follow_up("lead-1", request, current_user)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Employees can schedule follow-ups only for themselves"


@pytest.mark.asyncio
async def test_employee_cannot_schedule_for_unowned_lead(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead(assigned_to="someone-else")
    current_user = user(user_id="emp-1", role=UserRole.EMPLOYEE)

    async def fake_access(*args, **kwargs):
        raise HTTPException(status_code=403, detail="Access denied")

    monkeypatch.setattr(followups, "require_owned_record_access", fake_access)

    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() + timedelta(days=2),
        assigned_to="emp-1",
    )
    with pytest.raises(HTTPException) as exc:
        await followups.create_sales_follow_up("lead-1", request, current_user)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_transferred_lead_rejects_new_sales_follow_up(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead(stage="Won", won_status="transferred", transferred_at=utc_now())
    current_user = user()

    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() + timedelta(days=1),
        assigned_to="user-1",
    )
    with pytest.raises(HTTPException) as exc:
        await followups.create_sales_follow_up("lead-1", request, current_user)
    assert exc.value.status_code == 400
    assert "transferred to Clients" in exc.value.detail


@pytest.mark.asyncio
async def test_create_follow_up_cleanup_removes_job_on_partial_failure(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead()
    FakeUserModel.users["user-1"] = user()
    current_user = user()

    job = FakeJob(id="job-1", action_type=ScheduledJobActionType.CREATE_TASK, payload={}, run_at=utc_now())

    async def fake_schedule_job(**kwargs):
        return job

    async def failing_insert(self):
        raise RuntimeError("insert failed")

    monkeypatch.setattr(followups.SchedulingService, "schedule_job", fake_schedule_job)
    monkeypatch.setattr(FakeActivity, "insert", failing_insert)

    request = followups.SalesFollowUpCreateRequest(
        scheduled_at=utc_now() + timedelta(days=1),
        assigned_to="user-1",
    )
    with pytest.raises(RuntimeError):
        await followups.create_sales_follow_up("lead-1", request, current_user)

    assert job.deleted is True
    assert FakeActivity.stored == []


# ── List / Reschedule / Cancel ───────────────────────────────────────────────
def make_pending_job(payload=None, run_at=None):
    return FakeJob(
        id="job-1",
        action_type=ScheduledJobActionType.CREATE_TASK,
        payload=payload
        or {
            "title": "Follow up with Acme",
            "description": "notes",
            "assigned_to": "user-1",
            "priority": "medium",
            "due_date": run_at or (utc_now() + timedelta(days=1)),
            "source_type": "sales_follow_up",
            "related_entity_type": "sales_lead",
            "related_entity_id": "lead-1",
            "related_entity_stage": "qualify",
            "related_entity_url": "/crm/leads/lead-1",
        },
        run_at=run_at or (utc_now() + timedelta(days=1)),
        status=ScheduledJobStatus.PENDING,
        company_id="company-1",
        created_by="user-1",
        created_at=utc_now(),
    )


@pytest.mark.asyncio
async def test_list_follow_ups_returns_lead_follow_ups(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead()
    job = make_pending_job()
    FakeScheduledJobModel.jobs["job-1"] = job
    FakeActivity.stored = [FakeActivity(metadata={"scheduled_job_id": "job-1"})]
    current_user = user()

    response = await followups.list_sales_follow_ups("lead-1", current_user)
    assert response["total"] == 1
    assert response["follow_ups"][0]["id"] == "job-1"
    assert response["follow_ups"][0]["activity_id"] == "activity-1"


@pytest.mark.asyncio
async def test_reschedule_updates_all_related_records(monkeypatch):
    old_run_at = utc_now() + timedelta(days=1)
    FakeLeadModel.leads["lead-1"] = lead(next_follow_up_at=old_run_at, next_action="old title")
    job = make_pending_job(run_at=old_run_at)
    FakeScheduledJobModel.jobs["job-1"] = job
    activity = FakeActivity(
        status="scheduled",
        scheduled_at=old_run_at,
        due_date=old_run_at,
        metadata={"scheduled_job_id": "job-1"},
    )
    FakeActivity.stored = [activity]
    current_user = user()

    new_run_at = utc_now() + timedelta(days=3)
    request = followups.SalesFollowUpUpdateRequest(
        scheduled_at=new_run_at,
        title="New title",
    )
    response = await followups.update_sales_follow_up("lead-1", "job-1", request, current_user)

    assert job.run_at == new_run_at
    assert job.payload["due_date"] == new_run_at
    assert job.payload["title"] == "New title"
    assert FakeLeadModel.leads["lead-1"].next_follow_up_at == new_run_at
    assert activity.scheduled_at == new_run_at
    assert activity.due_date == new_run_at
    assert response["scheduled_at"] == new_run_at


@pytest.mark.asyncio
async def test_reschedule_updates_assignee_activity_owner_and_lead_owner(monkeypatch):
    old_run_at = utc_now() + timedelta(days=1)
    FakeLeadModel.leads["lead-1"] = lead(next_follow_up_at=old_run_at, assigned_to="user-1")
    FakeUserModel.users["admin-1"] = user(user_id="admin-1", role=UserRole.ADMIN)
    job = make_pending_job(run_at=old_run_at)
    FakeScheduledJobModel.jobs["job-1"] = job
    activity = FakeActivity(
        status="scheduled",
        scheduled_at=old_run_at,
        due_date=old_run_at,
        owner_id="user-1",
        owner_name="Old Owner",
        metadata={"scheduled_job_id": "job-1"},
    )
    FakeActivity.stored = [activity]
    current_user = user()

    request = followups.SalesFollowUpUpdateRequest(
        scheduled_at=utc_now() + timedelta(days=3),
        assigned_to="admin-1",
    )
    response = await followups.update_sales_follow_up("lead-1", "job-1", request, current_user)

    assert response["assigned_to"] == "admin-1"
    assert job.payload["assigned_to"] == "admin-1"
    assert FakeLeadModel.leads["lead-1"].assigned_to == "admin-1"
    assert activity.owner_id == "admin-1"
    assert activity.owner_name == "A B"


@pytest.mark.asyncio
async def test_cancel_updates_all_related_records(monkeypatch):
    old_run_at = utc_now() + timedelta(days=1)
    FakeLeadModel.leads["lead-1"] = lead(next_follow_up_at=old_run_at, next_action="title")
    job = make_pending_job(run_at=old_run_at)
    FakeScheduledJobModel.jobs["job-1"] = job
    activity = FakeActivity(
        status="scheduled",
        metadata={"scheduled_job_id": "job-1"},
    )
    FakeActivity.stored = [activity]
    current_user = user()

    response = await followups.cancel_sales_follow_up("lead-1", "job-1", current_user)

    assert job.status == ScheduledJobStatus.CANCELLED
    assert activity.status == "cancelled" or str(activity.status) == "cancelled"
    assert FakeLeadModel.leads["lead-1"].next_follow_up_at is None
    assert response["status"] == "CANCELLED"


@pytest.mark.asyncio
async def test_employee_cannot_reschedule_other_users_follow_up(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead()
    job = make_pending_job()
    job.created_by = "other-user"
    FakeScheduledJobModel.jobs["job-1"] = job
    current_user = user(user_id="emp-1", role=UserRole.EMPLOYEE)

    request = followups.SalesFollowUpUpdateRequest(
        scheduled_at=utc_now() + timedelta(days=2),
    )
    with pytest.raises(HTTPException) as exc:
        await followups.update_sales_follow_up("lead-1", "job-1", request, current_user)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_cannot_reschedule_non_pending_follow_up(monkeypatch):
    FakeLeadModel.leads["lead-1"] = lead()
    job = make_pending_job()
    job.status = ScheduledJobStatus.COMPLETED
    FakeScheduledJobModel.jobs["job-1"] = job
    current_user = user()

    request = followups.SalesFollowUpUpdateRequest(
        scheduled_at=utc_now() + timedelta(days=2),
    )
    with pytest.raises(HTTPException) as exc:
        await followups.update_sales_follow_up("lead-1", "job-1", request, current_user)
    assert exc.value.status_code == 400
    assert exc.value.detail == "Only pending follow-ups can be rescheduled"


# ── Scheduled execution / linkage ────────────────────────────────────────────
@pytest.mark.asyncio
async def test_scheduled_execution_creates_task_once_and_links_activity(monkeypatch):
    from app.services import scheduling_service

    created_tasks = []
    linked_activities = []

    async def fake_create_task_core(**kwargs):
        created_tasks.append(kwargs)
        return {"id": "task-1", "task_id": "task-1", "title": kwargs["title"]}

    async def fake_find_one(query):
        activity = SimpleNamespace(
            status=SimpleNamespace(value="scheduled"),
            metadata={"scheduled_job_id": "job-1"},
            updated_at=None,
            saved=False,
        )

        async def save():
            activity.saved = True
            linked_activities.append(activity)

        activity.save = save
        return activity

    monkeypatch.setattr(scheduling_service.TaskService, "create_task_core", fake_create_task_core)
    monkeypatch.setattr("app.models.crm_activity.CRMActivity", SimpleNamespace(find_one=fake_find_one))

    job = SimpleNamespace(
        id="job-1",
        company_id="company-1",
        payload={
            "title": "Follow up with Acme",
            "description": "notes",
            "assigned_to": "user-1",
            "priority": "medium",
            "due_date": utc_now() + timedelta(days=1),
            "task_type": "standard",
            "tags": "sales-follow-up",
            "source_type": "sales_follow_up",
            "related_entity_type": "sales_lead",
            "related_entity_id": "lead-1",
            "related_entity_stage": "qualify",
            "related_entity_url": "/crm/leads/lead-1",
        },
    )
    creator = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN)

    result = await scheduling_service.SchedulingService._execute_create_task(job, creator)

    # Task created exactly once with the sales relation preserved.
    assert len(created_tasks) == 1
    assert created_tasks[0]["source_type"] == "sales_follow_up"
    assert created_tasks[0]["related_entity_type"] == "sales_lead"
    assert created_tasks[0]["related_entity_id"] == "lead-1"
    assert created_tasks[0]["related_entity_url"] == "/crm/leads/lead-1"

    # The linked activity moved to in_progress with the task id recorded.
    assert len(linked_activities) == 1
    assert linked_activities[0].status.value == "in_progress"
    assert linked_activities[0].metadata["task_id"] == "task-1"
    assert result["id"] == "task-1"


@pytest.mark.asyncio
async def test_scheduled_execution_generic_task_still_works(monkeypatch):
    from app.services import scheduling_service

    created_tasks = []

    async def fake_create_task_core(**kwargs):
        created_tasks.append(kwargs)
        return {"id": "task-1", "task_id": "task-1"}

    find_calls = []

    async def fake_find_one(query):
        find_calls.append(query)
        return None

    monkeypatch.setattr(scheduling_service.TaskService, "create_task_core", fake_create_task_core)
    monkeypatch.setattr("app.models.crm_activity.CRMActivity", SimpleNamespace(find_one=fake_find_one))

    job = SimpleNamespace(
        id="job-generic",
        company_id="company-1",
        payload={
            "title": "Publish blog post",
            "description": None,
            "assigned_to": "user-2",
            "priority": "high",
            "due_date": utc_now() + timedelta(days=1),
            "project_id": "PROJ-1",
        },
    )
    creator = SimpleNamespace(id="user-1", company_id="company-1", role=UserRole.ADMIN)

    await scheduling_service.SchedulingService._execute_create_task(job, creator)

    assert len(created_tasks) == 1
    assert created_tasks[0]["project_id"] == "PROJ-1"
    assert created_tasks[0]["source_type"] is None
    # No CRM activity link is attempted for non sales-follow-up tasks.
    assert find_calls == []
