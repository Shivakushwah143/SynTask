"""Central clock and timezone helpers.

All persisted instants are UTC. UI converts them for display using user/workspace settings.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import pytz


DEFAULT_TIMEZONE = "UTC"


class ClockService:
    @staticmethod
    def utc_now() -> datetime:
        return datetime.now(timezone.utc).replace(tzinfo=None)

    @staticmethod
    def aware_utc_now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def today_utc():
        return ClockService.utc_now().date()

    @staticmethod
    def zoned_now(timezone_name: str | None = None):
        """Return an aware datetime for the given timezone (or the default)."""
        tz = timezone_name or DEFAULT_TIMEZONE
        zone = pytz.timezone(tz) if tz in pytz.all_timezones_set else pytz.timezone(DEFAULT_TIMEZONE)
        return datetime.now(zone)

    @staticmethod
    def today_str(timezone_name: str | None = None, fmt: str = "%Y-%m-%d") -> str:
        """Return today's date key in the given timezone (used for date-keyed records)."""
        return ClockService.zoned_now(timezone_name).strftime(fmt)

    @staticmethod
    def user_today_str(user: Any, fmt: str = "%Y-%m-%d") -> str:
        """Return today's date key in the user's configured timezone (falls back to default)."""
        return ClockService.today_str(getattr(user, "timezone", None), fmt)

    @staticmethod
    def format_in_tz(value: datetime, timezone_name: str | None, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
        """Format a naive-UTC datetime as a wall-clock string in the given timezone.

        Used for user-facing exports/emails (CSV, notifications) where the
        frontend is not available to convert through timeService.
        """
        zone = pytz.timezone(timezone_name) if timezone_name in pytz.all_timezones_set else pytz.timezone(DEFAULT_TIMEZONE)
        return ClockService.ensure_utc(value).astimezone(zone).strftime(fmt)

    @staticmethod
    def parse_to_utc(value: datetime | str | None) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    @staticmethod
    def validate_timezone(timezone_name: str | None) -> str:
        if not timezone_name:
            return DEFAULT_TIMEZONE
        if timezone_name not in pytz.all_timezones_set:
            raise ValueError("Invalid timezone")
        return timezone_name

    @staticmethod
    def local_day_bounds_utc(start_date: Any, end_date: Any, timezone_name: str | None = None) -> tuple[datetime, datetime]:
        """Convert a local calendar-day window into naive-UTC instants.

        start_date/end_date are `date`-like values. The returned naive UTC
        datetimes cover every instant that falls inside those local dates, so a
        MongoDB range query on UTC `run_at`/`due_date` stays timezone-safe.
        """
        zone_name = ClockService.validate_timezone(timezone_name)
        zone = pytz.timezone(zone_name)
        start_local = zone.localize(datetime.combine(start_date, datetime.min.time()))
        end_local = zone.localize(datetime.combine(end_date, datetime.max.time()))
        return (
            start_local.astimezone(pytz.utc).replace(tzinfo=None),
            end_local.astimezone(pytz.utc).replace(tzinfo=None),
        )

    @staticmethod
    def ensure_utc(value: datetime | None) -> Optional[datetime]:
        """Return an aware UTC datetime; stamp UTC onto naive values."""
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def from_timestamp_utc(timestamp: float | int) -> datetime:
        """Convert a Unix timestamp to an aware UTC datetime."""
        return datetime.fromtimestamp(timestamp, tz=timezone.utc)

    @staticmethod
    def parse_date_utc(value: datetime | str, fmt: str = "%Y-%m-%d") -> datetime:
        """Parse a date-only string and return an aware UTC datetime."""
        if isinstance(value, datetime):
            value = value.strftime(fmt)
        return datetime.strptime(str(value), fmt).replace(tzinfo=timezone.utc)

    @staticmethod
    def settings_payload(user: Any) -> dict[str, Any]:
        return {
            "timezone": getattr(user, "timezone", None) or DEFAULT_TIMEZONE,
            "automatic_time": getattr(user, "automatic_time", True),
            "manual_time": getattr(user, "manual_time", None),
            "hour_format": getattr(user, "hour_format", "12"),
            "show_seconds": getattr(user, "show_seconds", False),
            "server_utc": ClockService.utc_now().isoformat() + "Z",
        }


clock_service = ClockService()


def utc_now() -> datetime:
    return clock_service.utc_now()


def aware_utc_now() -> datetime:
    return clock_service.aware_utc_now()


def today_utc():
    return clock_service.today_utc()


def zoned_now(timezone_name: str | None = None):
    return clock_service.zoned_now(timezone_name)


def today_str(timezone_name: str | None = None, fmt: str = "%Y-%m-%d") -> str:
    return clock_service.today_str(timezone_name, fmt)


def user_today_str(user: Any, fmt: str = "%Y-%m-%d") -> str:
    return clock_service.user_today_str(user, fmt)


def format_in_tz(value: datetime, timezone_name: str | None, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    return clock_service.format_in_tz(value, timezone_name, fmt)


def parse_to_utc(value: datetime | str | None) -> Optional[datetime]:
    return clock_service.parse_to_utc(value)


def ensure_utc(value: datetime | None) -> Optional[datetime]:
    return clock_service.ensure_utc(value)


def from_timestamp_utc(timestamp: float | int) -> datetime:
    return clock_service.from_timestamp_utc(timestamp)


def parse_date_utc(value: datetime | str, fmt: str = "%Y-%m-%d") -> datetime:
    return clock_service.parse_date_utc(value, fmt)


def local_day_bounds_utc(start_date: Any, end_date: Any, timezone_name: str | None = None) -> tuple[datetime, datetime]:
    return clock_service.local_day_bounds_utc(start_date, end_date, timezone_name)
