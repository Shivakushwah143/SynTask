from datetime import datetime, timedelta, timezone

import pytest

from app.core.clock import clock_service, parse_to_utc, utc_now


def test_utc_now_returns_naive_utc_datetime():
    now = utc_now()

    assert now.tzinfo is None
    assert abs((datetime.utcnow() - now).total_seconds()) < 5


def test_parse_to_utc_converts_aware_datetime():
    aware = datetime(2026, 7, 19, 10, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))

    assert parse_to_utc(aware) == datetime(2026, 7, 19, 5, 0)


def test_parse_to_utc_converts_iso_z_string():
    assert parse_to_utc("2026-07-19T05:00:00Z") == datetime(2026, 7, 19, 5, 0)


def test_validate_timezone_rejects_unknown_zone():
    with pytest.raises(ValueError):
        clock_service.validate_timezone("Mars/Base")
