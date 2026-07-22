from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.services.eod_service import (
    assert_edit_window_open,
    assert_not_future_date,
    build_eod_date_bounds,
    is_approved_leave_day,
    serialize_eod_report,
)


def test_build_eod_date_bounds_covers_full_utc_day():
    start, end = build_eod_date_bounds(date(2026, 7, 13))

    assert start == datetime(2026, 7, 13, 0, 0, 0)
    assert end == datetime(2026, 7, 13, 23, 59, 59, 999999)


def test_assert_not_future_date_rejects_tomorrow():
    with pytest.raises(HTTPException) as exc:
        assert_not_future_date(date.today() + timedelta(days=1))

    assert exc.value.status_code == 400
    assert "Future date" in exc.value.detail


def test_assert_edit_window_open_rejects_existing_past_report():
    with pytest.raises(HTTPException) as exc:
        assert_edit_window_open(date.today() - timedelta(days=1))

    assert exc.value.status_code == 400
    assert "edit window" in exc.value.detail


def test_is_approved_leave_day_matches_date_range():
    class Leave:
        status = "approved"
        start_date = datetime(2026, 7, 10, 9, 0, 0)
        end_date = datetime(2026, 7, 13, 18, 0, 0)

    assert is_approved_leave_day(Leave(), date(2026, 7, 13)) is True
    assert is_approved_leave_day(Leave(), date(2026, 7, 14)) is False


def test_serialize_eod_report_keeps_future_ai_metadata_extensible():
    class Report:
        id = "report-id"
        employee_id = "employee-id"
        company_id = "company-id"
        report_date = date(2026, 7, 13)
        worked_on = "Reviewed sprint work"
        blockers = ""
        tomorrow_plan = "Continue implementation"
        completed_task_ids = ["task-1"]
        in_progress_task_ids = ["task-2"]
        assigned_today_task_ids = ["task-3"]
        total_working_seconds = 3600
        ai_metadata = {"summary_ready": False}
        created_at = datetime(2026, 7, 13, 17, 0, 0)
        updated_at = datetime(2026, 7, 13, 17, 5, 0)

    data = serialize_eod_report(Report())

    assert data["id"] == "report-id"
    assert data["status"] == "submitted"
    assert data["ai_metadata"] == {"summary_ready": False}
    assert data["task_summary"]["completed_count"] == 1
