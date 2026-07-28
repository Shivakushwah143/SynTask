from datetime import date, datetime, time, timezone
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints.calendar import (
    build_calendar_task_query,
    build_project_name_lookup_query,
    calendar_error_detail,
    is_past_calendar_datetime,
    valid_object_ids,
    load_calendar_project_name,
    parse_calendar_window,
    task_to_calendar_event,
)
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
    assert event["time"] == "14:30"
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
