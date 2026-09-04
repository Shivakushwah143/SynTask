"""Pure unit tests for attendance policy late/early time computations.

These helpers previously crashed with a naive-vs-aware comparison TypeError on
every call (persisted login/logout instants are naive UTC), which made any
policy-aware attendance resolution (today-enhanced, payroll day status) fail.
The helpers must accept both naive-UTC (SynTask storage) and aware UTC values.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.attendance_status_resolver import (
    compute_early_departure,
    compute_late_minutes,
)

# Policy-shaped stub (the helpers only touch these attributes; instantiating
# the real Beanie AttendancePolicy document requires a live database).
POLICY = SimpleNamespace(
    timezone="Asia/Kolkata",
    expected_start_time="09:00",
    expected_end_time="18:00",
    late_grace_minutes=0.0,
    early_departure_grace_minutes=0.0,
)


def test_late_minutes_naive_utc():
    # 09:48 IST == 04:18 UTC naive; start 09:00 IST -> late by 48 minutes.
    is_late, minutes = compute_late_minutes(POLICY, datetime(2026, 9, 4, 4, 18))
    assert is_late is True
    assert minutes == 48.0


def test_late_minutes_aware_utc():
    is_late, minutes = compute_late_minutes(
        POLICY, datetime(2026, 9, 4, 4, 18, tzinfo=timezone.utc)
    )
    assert is_late is True
    assert minutes == 48.0


def test_on_time_before_deadline():
    # 08:58 IST == 03:28 UTC -> not late (before 09:00 IST).
    is_late, minutes = compute_late_minutes(POLICY, datetime(2026, 9, 4, 3, 28))
    assert is_late is False
    assert minutes == 0.0


def test_late_grace_applied():
    grace_policy = SimpleNamespace(**{**vars(POLICY), "late_grace_minutes": 15.0})
    # 09:10 IST == 03:40 UTC; 15 min grace -> on time.
    is_late, minutes = compute_late_minutes(grace_policy, datetime(2026, 9, 4, 3, 40))
    assert is_late is False
    assert minutes == 0.0


def test_early_departure():
    # 17:30 IST == 12:00 UTC; expected end 18:00 -> 30 min early.
    is_early, minutes = compute_early_departure(POLICY, datetime(2026, 9, 4, 12, 0))
    assert is_early is True
    assert minutes == 30.0

    # 18:26 IST == 12:56 UTC -> not early.
    is_early, minutes = compute_early_departure(POLICY, datetime(2026, 9, 4, 12, 56))
    assert is_early is False
    assert minutes == 0.0


def test_utc_policy_default_zone():
    utc_policy = SimpleNamespace(
        timezone="UTC",
        expected_start_time="09:00",
        expected_end_time="18:00",
        late_grace_minutes=0.0,
        early_departure_grace_minutes=0.0,
    )
    # 09:10 UTC naive -> late 10 min against a UTC policy.
    is_late, minutes = compute_late_minutes(utc_policy, datetime(2026, 9, 4, 9, 10))
    assert is_late is True
    assert minutes == 10.0
