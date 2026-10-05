"""Pure unit tests for eTimeOffice sync normalization + mapping helpers.

These cover the provider parsing, wall-clock -> UTC conversion, name
suggestion rules, and policy-flag computations that do not need a database or
network. The live provider round-trip (auth + download + idempotent upsert) is
verified manually against the real eTimeOffice API during feature verification.
"""
from datetime import date, datetime, time

from app.integrations.etimeoffice.client import ETimeOfficeInOutDay, _parse_time
from app.services.etimeoffice_mapping_service import (
    is_placeholder_name,
    normalize_name,
    suggest_employee,
)
from app.services.etimeoffice_sync_service import (
    _day_to_attendance_fields,
    _late_early_flags,
    _wall_to_utc,
)
from app.models.attendance import AttendanceStatus


def test_parse_time_vendor_values():
    assert _parse_time("09:48") == time(9, 48)
    assert _parse_time("--:--") is None
    assert _parse_time("") is None
    assert _parse_time(None) is None
    assert _parse_time("garbage") is None


def test_provider_day_carries_directory_name():
    day = ETimeOfficeInOutDay(
        external_employee_code="0001",
        external_employee_name="Kavita Borse",
        date=date(2026, 9, 3),
    )
    assert day.external_employee_name == "Kavita Borse"


def test_normalize_and_placeholder_names():
    assert normalize_name("  Kavita   Borse ") == "kavita borse"
    assert normalize_name("") == ""
    assert is_placeholder_name("Empname0005") is True
    assert is_placeholder_name("Emp 5") is True
    assert is_placeholder_name("N/A") is True
    assert is_placeholder_name("Kavita Borse") is False


def test_suggest_employee_exact_match_only():
    candidates = [
        {"id": "a", "name": "Kavita Borse", "employee_number": "", "role": "sub_admin"},
        {"id": "b", "name": "Riya Jain", "employee_number": "", "role": "employee"},
        {"id": "c", "name": "Vivek verma", "employee_number": "", "role": "employee"},
    ]
    # Exact normalized match is suggested with high confidence.
    assert suggest_employee(candidates, "Kavita Borse")["id"] == "a"
    assert suggest_employee(candidates, "  vivek VERMA")["id"] == "c"
    # Near-duplicate names are ambiguous -> no suggestion.
    assert suggest_employee(candidates, "Kavita") is None
    assert suggest_employee(candidates, "Riya") is None


def test_suggest_employee_skips_placeholders_and_typos():
    candidates = [
        {"id": "a", "name": "Purvi Khandelwaal", "employee_number": "", "role": "manager"},
    ]
    # Placeholder external names are never suggested.
    assert suggest_employee(candidates, "Empname0005") is None
    assert suggest_employee(candidates, "0005") is None
    # A near-match (provider spells Khandelwal, SynTask Khandelwaal) is a
    # confident suggestion for the UI (never an assignment).
    suggestion = suggest_employee(candidates, "Purvi Khandelwal")
    assert suggestion is not None and suggestion["id"] == "a"


def test_suggest_employee_no_match_without_candidates():
    assert suggest_employee([], "Kavita Borse") is None


def test_wall_to_utc_ist():
    # 09:48 India Standard Time == 04:18 UTC (naive UTC, SynTask convention).
    converted = _wall_to_utc(date(2026, 9, 4), time(9, 48), "Asia/Kolkata")
    assert converted == datetime(2026, 9, 4, 4, 18)


def test_late_early_flags_use_wall_clock():
    # Login 09:48 IST stored as 04:18 UTC; default start 09:00 + no grace.
    login = datetime(2026, 9, 4, 4, 18)
    flags = _late_early_flags("Asia/Kolkata", None, login, None)
    assert flags["is_late"] is True
    assert flags["late_minutes"] == 48.0

    # Checkout 18:26 IST (12:56 UTC) is not an early departure vs 18:00.
    logout = datetime(2026, 9, 4, 12, 56)
    flags = _late_early_flags("Asia/Kolkata", None, login, logout)
    assert flags["is_early_departure"] is False


def test_day_to_attendance_fields_matches_vendor_arithmetic():
    # Vendor row: IN 12:22 / OUT 16:14 / Work 03:41 / Break 00:11 (IST).
    day = ETimeOfficeInOutDay(
        external_employee_code="0001",
        date=date(2026, 9, 3),
        check_in=time(12, 22),
        check_out=time(16, 14),
        work_minutes=3 * 60 + 41,
        break_minutes=11,
        status="P",
    )
    fields = _day_to_attendance_fields(day, "Asia/Kolkata", None)
    assert fields["date"] == "2026-09-03"
    assert fields["login_time"] == datetime(2026, 9, 3, 6, 52)  # 12:22 IST
    assert fields["logout_time"] == datetime(2026, 9, 3, 10, 44)  # 16:14 IST
    assert fields["total_working_hours"] == (3 * 60 + 41) * 60.0
    assert fields["break_duration"] == 11 * 60.0
    assert fields["status"] == AttendanceStatus.CHECKED_OUT
    assert fields["is_late"] is True
    assert fields["source"] == "etimeoffice"
    assert fields["external_employee_code"] == "0001"


def test_day_without_checkout_today_is_working():
    day = ETimeOfficeInOutDay(
        external_employee_code="0002",
        date=date(2026, 9, 3),
        check_in=time(10, 8),
        check_out=None,
        status="P",
    )
    # 2026-09-03 is not "today"; an open punch on a past day is treated as a
    # completed-but-unclosed record rather than a live working session.
    fields = _day_to_attendance_fields(day, "Asia/Kolkata", None)
    assert fields["logout_time"] is None
    assert fields["status"] == AttendanceStatus.CHECKED_OUT
