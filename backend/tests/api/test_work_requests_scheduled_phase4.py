import os
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from app.models.scheduled_job import ScheduledJobActionType, ScheduledJobScheduleType
from app.models.work_request import WorkRequestStatus, WorkRequestType
from app.services.scheduling_service import SchedulingService
from app.services.work_request_service import validate_context


def test_all_phase4_work_request_types_present():
    assert {item.value for item in WorkRequestType} == {
        "new_work",
        "change_request",
        "approval_request",
        "deadline_extension",
        "resource_request",
        "blocker",
        "leave_availability",
        "client_request",
        "other",
    }


def test_work_request_state_names_are_controlled():
    assert {item.value for item in WorkRequestStatus} == {
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "converted",
        "cancelled",
    }


@pytest.mark.parametrize(
    "request_type,payload",
    [
        (WorkRequestType.DEADLINE_EXTENSION, {"task_id": "task-1", "requested_changes": {"requested_due_date": "2026-09-13"}}),
        (WorkRequestType.RESOURCE_REQUEST, {"project_id": "PROJ-1"}),
        (WorkRequestType.BLOCKER, {"task_id": "task-1"}),
        (WorkRequestType.CLIENT_REQUEST, {"client_id": "client-1"}),
    ],
)
def test_contextual_request_fields_are_accepted(request_type, payload):
    validate_context(request_type, payload)


@pytest.mark.parametrize(
    "request_type,payload",
    [
        (WorkRequestType.DEADLINE_EXTENSION, {"requested_changes": {"requested_due_date": "2026-09-13"}}),
        (WorkRequestType.RESOURCE_REQUEST, {}),
        (WorkRequestType.BLOCKER, {}),
        (WorkRequestType.CLIENT_REQUEST, {}),
    ],
)
def test_missing_contextual_request_fields_are_rejected(request_type, payload):
    with pytest.raises(HTTPException) as exc:
        validate_context(request_type, payload)
    assert exc.value.status_code == 400


def _job(run_at, recurrence, timezone="UTC"):
    return SimpleNamespace(
        action_type=ScheduledJobActionType.CREATE_TASK,
        payload={"title": "Report"},
        run_at=run_at,
        created_by="user-1",
        company_id="company-1",
        schedule_type=ScheduledJobScheduleType.RECURRING,
        recurrence=recurrence,
        timezone=timezone,
    )


def test_daily_recurrence_calculates_next_occurrence():
    job = _job(datetime(2026, 9, 7, 10, 0, 0), {"frequency": "daily"})
    assert SchedulingService.next_occurrence(job, after=job.run_at) == datetime(2026, 9, 8, 10, 0, 0)


def test_weekly_recurrence_calculates_selected_weekday():
    job = _job(datetime(2026, 9, 7, 10, 0, 0), {"frequency": "weekly", "weekdays": [0]})
    assert SchedulingService.next_occurrence(job, after=job.run_at) == datetime(2026, 9, 14, 10, 0, 0)


def test_monthly_recurrence_clamps_31st_to_last_valid_day():
    job = _job(datetime(2026, 1, 31, 10, 0, 0), {"frequency": "monthly", "month_day": 31})
    assert SchedulingService.next_occurrence(job, after=job.run_at) == datetime(2026, 2, 28, 10, 0, 0)


def test_custom_daily_interval_recurrence():
    job = _job(datetime(2026, 9, 7, 10, 0, 0), {"frequency": "custom", "unit": "days", "count": 3})
    assert SchedulingService.next_occurrence(job, after=job.run_at) == datetime(2026, 9, 10, 10, 0, 0)


def test_timezone_recurrence_preserves_local_wall_clock():
    job = _job(datetime(2026, 9, 7, 4, 30, 0), {"frequency": "daily"}, timezone="Asia/Kolkata")
    assert SchedulingService.next_occurrence(job, after=job.run_at) == datetime(2026, 9, 8, 4, 30, 0)
