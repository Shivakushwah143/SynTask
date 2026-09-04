"""
Regression tests: biometric (eTimeOffice) attendance rows are immutable through
manual flows.

The employee work-window UI hides check-in/break/check-out for biometric days;
these tests pin the server-side enforcement so a manual action can never
overwrite, reopen, or delete a row written by the eTimeOffice sync.
"""
from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import attendance as attendance_api
from app.api.v1.endpoints.attendance import (
    BIOMETRIC_SOURCE,
    _is_biometric,
    _reject_biometric_mutation,
)
from app.models.attendance import AttendanceStatus


def _stub_user():
    return SimpleNamespace(id="u1", company_id="c1")


def _row(source: str | None, status: AttendanceStatus = AttendanceStatus.WORKING, logged_out: bool = False) -> SimpleNamespace:
    """A lightweight stand-in Attendance row for guard classification.

    A plain namespace is used because Beanie Document construction requires a
    live database; the guards under test only read ``source``/presence fields.
    """
    return SimpleNamespace(
        id="a1",
        employee_id="u1",
        company_id="c1",
        date="2026-09-04",
        source=source,
        status=status,
        login_time=datetime(2026, 9, 4, 4, 18),
        logout_time=datetime(2026, 9, 4, 12, 56) if logged_out else None,
        current_break_started_at=None,
        total_working_hours=0.0,
        break_duration=0.0,
    )


def test_is_biometric_classification():
    assert _is_biometric(None) is False
    assert _is_biometric(_row(source=None)) is False
    assert _is_biometric(_row(source="etimeoffice")) is True


def test_manual_action_rejected_for_biometric_row():
    """The shared guard raises 409 for biometric rows (covers check-in too)."""
    with pytest.raises(HTTPException) as exc:
        _reject_biometric_mutation(_row(source=BIOMETRIC_SOURCE), "Checked in via biometric")
    assert exc.value.status_code == 409
    assert "biometric" in exc.value.detail.lower()

    # Manual rows (source unset) and missing records pass through untouched.
    _reject_biometric_mutation(_row(source=None), "Checked in via biometric")
    _reject_biometric_mutation(None, "Checked in via biometric")


@pytest.mark.asyncio
async def test_check_out_rejects_biometric_row(monkeypatch):
    """In-progress and completed biometric days cannot be checked out manually."""
    for row in (_row(source=BIOMETRIC_SOURCE), _row(source=BIOMETRIC_SOURCE, logged_out=True)):
        monkeypatch.setattr(attendance_api, "_get_today_record", _async_return(row))

        with pytest.raises(HTTPException) as exc:
            await attendance_api.check_out(_stub_user())
        assert exc.value.status_code == 409
        assert "biometric" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_break_controls_reject_biometric_row(monkeypatch):
    """Pausing/resuming a biometric work day is not a manual break action."""
    biometric = _row(source=BIOMETRIC_SOURCE)

    monkeypatch.setattr(attendance_api, "_get_today_record", _async_return(biometric))
    with pytest.raises(HTTPException) as exc:
        await attendance_api.start_break(_stub_user())
    assert exc.value.status_code == 409

    monkeypatch.setattr(attendance_api, "_get_today_record", _async_return(biometric))
    with pytest.raises(HTTPException) as exc:
        await attendance_api.end_break(_stub_user())
    assert exc.value.status_code == 409


def _async_return(value):
    async def fake(*args, **kwargs):
        return value

    return fake
