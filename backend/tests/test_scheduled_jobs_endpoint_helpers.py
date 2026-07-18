from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.scheduled_jobs import (
    _ensure_can_schedule_action,
    _ensure_can_manage_scheduled_jobs,
    _ensure_future_run_at,
    _normalize_run_at,
)
from app.models.scheduled_job import ScheduledJobActionType
from app.models.user import UserRole


def test_normalize_run_at_converts_timezone_aware_datetime_to_naive_utc():
    aware = datetime(2026, 7, 18, 15, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))

    assert _normalize_run_at(aware) == datetime(2026, 7, 18, 10, 0)


def test_ensure_future_run_at_rejects_past_datetime():
    with pytest.raises(HTTPException) as exc:
        _ensure_future_run_at(datetime.utcnow() - timedelta(minutes=1))

    assert exc.value.status_code == 400
    assert exc.value.detail == "Schedule time must be in the future"


def test_lead_can_schedule_task_creation_but_not_project_creation():
    lead = SimpleNamespace(role=UserRole.LEAD)

    _ensure_can_schedule_action(lead, ScheduledJobActionType.CREATE_TASK)
    with pytest.raises(HTTPException) as exc:
        _ensure_can_schedule_action(lead, ScheduledJobActionType.CREATE_PROJECT)

    assert exc.value.status_code == 403


def test_employee_cannot_manage_scheduled_jobs():
    employee = SimpleNamespace(role=UserRole.EMPLOYEE)

    with pytest.raises(HTTPException) as exc:
        _ensure_can_manage_scheduled_jobs(employee)

    assert exc.value.status_code == 403
