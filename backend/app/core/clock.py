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


def parse_to_utc(value: datetime | str | None) -> Optional[datetime]:
    return clock_service.parse_to_utc(value)
