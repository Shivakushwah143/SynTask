from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import calendar as calendar_module
from app.api.v1.endpoints.calendar import (
    build_calendar_scheduled_job_query,
    build_calendar_task_query,
    build_project_name_lookup_query,
    calendar_error_detail,
    is_past_calendar_datetime,
    is_sales_follow_up_job,
    parse_calendar_window,
    resolve_calendar_job_assignee_names,
    scheduled_job_calendar_title,
    scheduled_job_to_calendar_event,
    should_show_scheduled_placeholder,
    valid_object_ids,
    load_calendar_project_name,
    task_to_calendar_event,
)
from app.models.scheduled_job import ScheduledJobActionType, ScheduledJobStatus
from app.models.user import UserRole


def user(role=UserRole.EMPLOYEE):
    return SimpleNamespace(id="employee-1", role=role, company_id="company-1")


def test_calendar_window_uses_datetime_bounds_for_database_queries():
    start, end, start_at, end_at = parse_calendar_window("2026-07-13", "2026-07-19")

    assert start == date(2026, 7, 13)
    assert end == date(2026, 7, 19)
    assert start_at == datetime(2026, 7, 13, 0, 0, 0)
    assert end_at == datetime(2026, 7, 19, 23, 59, 59, 999999)


def test_employee_calendar_task_query_is_assigned_only_and_date_scoped():
    _, _, start_at, end_at = parse_calendar_window("2026-07-13", "2026-07-19")
    query = build_calendar_task_query(
        user(),
        view_type="my_calendar",
        user_ids_to_fetch=["employee-1"],
        start_at=start_at,
        end_at=end_at,
    )

    assert query["company_id"] == "company-1"
    assert query["$and"][0] == {"$or": [{"assigned_to": "employee-1"}, {"created_by": "employee-1"}]}
    assert query["$and"][1] == {
        "$or": [
            {"due_date": {"$gte": start_at, "$lte": end_at}},
            {"start_date": {"$gte": start_at, "$lte": end_at}},
            {"due_date": None, "start_date": None, "created_at": {"$gte": start_at, "$lte": end_at}},
        ]
    }


def test_project_name_lookup_query_keeps_logical_keys_out_of_mongo_id_filter():
    query = build_project_name_lookup_query(["PROJ-101", "507f1f77bcf86cd799439011"])

    assert {"project_id": {"$in": ["PROJ-101", "507f1f77bcf86cd799439011"]}} in query["$or"]
    assert [str(item) for item in query["$or"][0]["_id"]["$in"]] == ["507f1f77bcf86cd799439011"]


def test_valid_object_ids_filters_and_converts_invalid_ids():
    ids = valid_object_ids(["employee-1", "507f1f77bcf86cd799439011", None, ""])

    assert [str(item) for item in ids] == ["507f1f77bcf86cd799439011"]


def test_is_past_calendar_datetime_handles_timezone_aware_values():
    meeting_date = datetime(2026, 7, 18, 8, 0, 0, tzinfo=timezone.utc)
    now = datetime(2026, 7, 18, 9, 0, 0)

    assert is_past_calendar_datetime(meeting_date, now) is True


def test_calendar_error_detail_includes_exception_type_when_message_empty():
    assert calendar_error_detail(Exception()) == "Error fetching calendar events: Exception"


def test_assigned_task_serializes_as_employee_calendar_event():
    task = SimpleNamespace(
        id="task-1",
        title="Finish report",
        description="",
        due_date=datetime(2026, 7, 15, 14, 30),
        created_at=datetime(2026, 7, 14, 10, 0),
        assigned_to="employee-1",
        project_id="project-1",
        priority=SimpleNamespace(value="high"),
        status=SimpleNamespace(value="in_progress"),
    )

    event = task_to_calendar_event(task, assignee_name="Asha Patel", project_name="Client Launch")

    assert event["id"] == "task_task-1"
    assert event["type"] == "task"
    assert event["start"] == "2026-07-15"
    # Backend must return full UTC ISO instants, never pre-formatted times.
    assert event["start_at"] == "2026-07-15T14:30:00"
    assert event["time"] is None
    assert event["assignee_id"] == "employee-1"
    assert event["project_name"] == "Client Launch"


@pytest.mark.asyncio
async def test_calendar_project_name_resolves_human_project_key():
    async def project_resolver(project_id, company_id):
        assert project_id == "PROJ-101"
        assert company_id == "company-1"
        return SimpleNamespace(name="Client Launch")

    project_name = await load_calendar_project_name(
        "PROJ-101",
        "company-1",
        project_resolver=project_resolver,
    )

    assert project_name == "Client Launch"


# ── Scheduled CREATE_TASK jobs as Calendar placeholders ──────────────────────


def make_job(**overrides):
    defaults = dict(
        id="job-1",
        action_type=ScheduledJobActionType.CREATE_TASK,
        status=ScheduledJobStatus.PENDING,
        company_id="company-1",
        created_by="manager-1",
        run_at=datetime(2026, 8, 8, 6, 0),
        created_at=datetime(2026, 8, 1, 9, 0),
        payload={
            "title": "Follow up with Acme Corp",
            "description": "Call about the proposal",
            "assigned_to": "employee-1",
            "priority": "high",
            "due_date": datetime(2026, 8, 8, 6, 0),
            "source_type": "sales_follow_up",
            "related_entity_type": "sales_lead",
            "related_entity_id": "lead-1",
            "related_entity_stage": "acquire",
            "related_entity_url": "/crm/leads/lead-1",
            "tags": "sales-follow-up",
        },
        notes="Remind on Friday",
        error=None,
        result_type=None,
        result_id=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_scheduled_job_query_is_company_scoped_and_filters_active_create_task_jobs():
    _, _, start_at, end_at = parse_calendar_window("2026-08-01", "2026-08-31")
    query = build_calendar_scheduled_job_query(
        user(),
        view_type="my_calendar",
        user_ids_to_fetch=["employee-1"],
        start_at=start_at,
        end_at=end_at,
    )

    assert query["company_id"] == "company-1"
    assert query["action_type"] == ScheduledJobActionType.CREATE_TASK.value
    assert query["status"] == {
        "$in": [
            ScheduledJobStatus.PENDING.value,
            ScheduledJobStatus.RUNNING.value,
            ScheduledJobStatus.FAILED.value,
        ]
    }
    assert query["run_at"] == {"$gte": start_at, "$lte": end_at}
    # COMPLETED and CANCELLED are never part of the active status set.
    assert ScheduledJobStatus.COMPLETED.value not in query["status"]["$in"]
    assert ScheduledJobStatus.CANCELLED.value not in query["status"]["$in"]


def test_my_calendar_shows_assigned_jobs_and_own_created_jobs():
    _, _, start_at, end_at = parse_calendar_window("2026-08-01", "2026-08-31")
    query = build_calendar_scheduled_job_query(
        user(),
        view_type="my_calendar",
        user_ids_to_fetch=["employee-1"],
        start_at=start_at,
        end_at=end_at,
    )

    assert query["$or"] == [
        {"payload.assigned_to": "employee-1"},
        {"created_by": "employee-1"},
    ]


def test_team_calendar_scopes_scheduled_jobs_to_fetched_users():
    _, _, start_at, end_at = parse_calendar_window("2026-08-01", "2026-08-31")
    query = build_calendar_scheduled_job_query(
        user(UserRole.MANAGER),
        view_type="team_calendar",
        user_ids_to_fetch=["employee-1", "employee-2"],
        start_at=start_at,
        end_at=end_at,
    )

    assert query["payload.assigned_to"] == {"$in": ["employee-1", "employee-2"]}
    assert "$or" not in query


def test_scheduled_job_query_supports_project_filter():
    _, _, start_at, end_at = parse_calendar_window("2026-08-01", "2026-08-31")
    query = build_calendar_scheduled_job_query(
        user(),
        view_type="my_calendar",
        user_ids_to_fetch=[],
        start_at=start_at,
        end_at=end_at,
        project_id="PROJ-101",
    )

    assert query["payload.project_id"] == "PROJ-101"


def test_sales_follow_up_identified_by_source_type():
    job = make_job()
    assert is_sales_follow_up_job(job) is True


def test_older_follow_up_identified_via_related_entity_fallback():
    job = make_job(payload={"related_entity_type": "sales_lead", "title": "Follow up with Acme"})
    assert is_sales_follow_up_job(job) is True


def test_older_follow_up_identified_via_known_tag():
    job = make_job(payload={"title": "Touch base", "tags": "sales-follow-up"})
    assert is_sales_follow_up_job(job) is True


def test_generic_task_is_not_a_follow_up():
    job = make_job(payload={"title": "Write blog post", "tags": []})
    assert is_sales_follow_up_job(job) is False


def test_follow_up_not_identified_by_title_text():
    # Titles are deliberately not inspected: "Follow up" text alone is not enough.
    job = make_job(payload={"title": "Follow up on invoice", "tags": []})
    assert is_sales_follow_up_job(job) is False


def test_placeholder_hidden_when_generated_task_already_exists():
    assert should_show_scheduled_placeholder(make_job()) is True
    assert should_show_scheduled_placeholder(make_job(result_type="task", result_id="task-99")) is False


def test_pending_follow_up_event_uses_run_at_not_created_at():
    event = scheduled_job_to_calendar_event(make_job())

    assert event["type"] == "sales_follow_up"
    assert event["start"] == "2026-08-08"
    assert event["start_at"] == "2026-08-08T06:00:00"
    assert event["scheduled_run_at"] == "2026-08-08T06:00:00"
    assert event["start_at"] != "2026-08-01T09:00:00"
    assert event["is_scheduled_placeholder"] is True
    assert event["scheduled_job_id"] == "job-1"


def test_follow_up_event_serializes_lead_and_relation_metadata():
    event = scheduled_job_to_calendar_event(
        make_job(),
        assignee_name="Asha Patel",
        project_name=None,
        lead_name="Acme Corp",
    )

    assert event["title"] == "Follow up with Acme Corp"
    assert event["assignee"] == "Asha Patel"
    assert event["assignee_id"] == "employee-1"
    assert event["priority"] == "high"
    assert event["source_type"] == "sales_follow_up"
    assert event["related_entity_type"] == "sales_lead"
    assert event["related_entity_id"] == "lead-1"
    assert event["related_entity_stage"] == "acquire"
    assert event["related_entity_url"] == "/crm/leads/lead-1"
    assert event["notes"] == "Call about the proposal"


def test_follow_up_title_prefix_added_only_when_missing():
    titled = make_job(payload={"title": "Follow up with Acme Corp", "source_type": "sales_follow_up"})
    assert scheduled_job_calendar_title(titled, lead_name="Acme Corp") == "Follow up with Acme Corp"

    bare = make_job(payload={"title": "Acme Corp", "source_type": "sales_follow_up"})
    assert scheduled_job_calendar_title(bare, lead_name="Acme Corp") == "Follow-up: Acme Corp"

    unnamed = make_job(payload={"source_type": "sales_follow_up"})
    assert scheduled_job_calendar_title(unnamed, lead_name="Acme Corp") == "Follow-up: Acme Corp"


def test_generic_scheduled_task_event_uses_scheduled_task_type_and_title():
    job = make_job(payload={"title": "Write report", "assigned_to": "employee-1"})
    event = scheduled_job_to_calendar_event(job)

    assert event["type"] == "scheduled_task"
    assert event["title"] == "Scheduled Task: Write report"
    assert event["scheduled_status"] == "PENDING"
    assert event["status"] == "scheduled"


def test_generic_scheduled_task_title_not_doubled():
    job = make_job(payload={"title": "Scheduled Task: Write report"})
    assert scheduled_job_calendar_title(job) == "Scheduled Task: Write report"


def test_event_status_maps_running_and_failed():
    running = scheduled_job_to_calendar_event(make_job(status=ScheduledJobStatus.RUNNING))
    assert running["status"] == "running"
    assert running["scheduled_status"] == "RUNNING"

    failed_job = make_job(status=ScheduledJobStatus.FAILED, error="Task creation failed")
    failed = scheduled_job_to_calendar_event(failed_job)
    assert failed["status"] == "failed"
    assert failed["scheduled_status"] == "FAILED"
    assert failed["error"] == "Task creation failed"


def test_due_date_serialized_as_utc_iso_for_payload_datetime_and_string():
    datetime_event = scheduled_job_to_calendar_event(make_job())
    assert datetime_event["due_date"] == "2026-08-08T06:00:00"

    string_event = scheduled_job_to_calendar_event(make_job(payload={"due_date": "2026-08-10T10:00:00Z", "title": "x"}))
    assert string_event["due_date"] == "2026-08-10T10:00:00"


def test_project_name_and_assignee_resolved_for_generic_job():
    job = make_job(payload={"title": "Deploy", "project_id": "PROJ-101", "assigned_to": "employee-1"})
    event = scheduled_job_to_calendar_event(job, assignee_name="Asha Patel", project_name="Client Launch")

    assert event["project_id"] == "PROJ-101"
    assert event["project_name"] == "Client Launch"


def test_payload_datetime_normalizer_handles_missing_value():
    from app.api.v1.endpoints.calendar import _serialize_payload_datetime

    assert _serialize_payload_datetime(None) is None
    assert _serialize_payload_datetime("") is None


def test_calendar_window_timezone_converts_local_days_to_utc():
    start, end, start_at, end_at = parse_calendar_window("2026-08-01", "2026-08-31", "Asia/Kolkata")

    assert start == date(2026, 8, 1)
    assert end == date(2026, 8, 31)
    # Kolkata is UTC+5:30 — local 2026-08-01 00:00 is UTC 2026-07-31 18:30.
    assert start_at == datetime(2026, 7, 31, 18, 30)
    assert end_at == datetime(2026, 8, 31, 18, 29, 59, 999999)


def test_calendar_window_rejects_invalid_timezone():
    with pytest.raises(HTTPException) as exc:
        parse_calendar_window("2026-08-01", "2026-08-31", "Not/AZone")

    assert exc.value.status_code == 400
    assert "Invalid timezone" in exc.value.detail


def test_utc_window_behaviour_is_unchanged_without_timezone():
    _, _, start_at, end_at = parse_calendar_window("2026-08-01", "2026-08-31")
    assert start_at == datetime(2026, 8, 1, 0, 0)
    assert end_at == datetime(2026, 8, 31, 23, 59, 59, 999999)


@pytest.mark.asyncio
async def test_assignee_names_resolved_in_a_single_batch_query(monkeypatch):
    class FakeUserQuery:
        def __init__(self, users):
            self.users = users

        async def to_list(self):
            return self.users

    class FakeUserModel:
        captured = None

        @classmethod
        def find(cls, query):
            cls.captured = query
            return FakeUserQuery([
                SimpleNamespace(id="507f1f77bcf86cd799439011", first_name="Asha", last_name="Patel"),
                SimpleNamespace(id="507f1f77bcf86cd799439012", first_name="Ravi", last_name="Sharma"),
            ])

    monkeypatch.setattr(calendar_module, "User", FakeUserModel)
    names = await resolve_calendar_job_assignee_names(["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"])

    assert names["507f1f77bcf86cd799439011"] == "Asha Patel"
    assert names["507f1f77bcf86cd799439012"] == "Ravi Sharma"
    assert "$in" in FakeUserModel.captured["_id"]


def test_executed_task_event_keeps_sales_relation_metadata():
    task = SimpleNamespace(
        id="task-1",
        title="Follow up with Acme",
        description="",
        due_date=datetime(2026, 8, 8, 6, 0),
        created_at=datetime(2026, 8, 8, 6, 0),
        assigned_to="employee-1",
        project_id=None,
        priority=SimpleNamespace(value="medium"),
        status=SimpleNamespace(value="in_progress"),
        source_type="sales_follow_up",
        related_entity_type="sales_lead",
        related_entity_id="lead-1",
        related_entity_stage="acquire",
        related_entity_url="/crm/leads/lead-1",
    )

    event = task_to_calendar_event(task, assignee_name="Asha Patel")

    assert event["source_type"] == "sales_follow_up"
    assert event["related_entity_type"] == "sales_lead"
    assert event["related_entity_id"] == "lead-1"
    assert event["related_entity_stage"] == "acquire"
    assert event["related_entity_url"] == "/crm/leads/lead-1"


def test_existing_task_event_without_relation_metadata_still_serializes():
    task = SimpleNamespace(
        id="task-2",
        title="Plain task",
        description="",
        due_date=datetime(2026, 8, 8, 6, 0),
        created_at=datetime(2026, 8, 8, 6, 0),
        assigned_to=None,
        project_id=None,
        priority=SimpleNamespace(value="low"),
        status=SimpleNamespace(value="todo"),
    )

    event = task_to_calendar_event(task)

    assert event["type"] == "task"
    assert event["source_type"] is None
    assert event["related_entity_id"] is None
