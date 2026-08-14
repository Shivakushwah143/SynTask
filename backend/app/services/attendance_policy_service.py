"""
Phase 4 — Attendance Policy service.

Company-scoped, timezone-aware attendance policy that replaces hard-coded
STANDARD_WORK_SECONDS and LATE_CLOCK_IN_HOUR_UTC rules.
"""
from __future__ import annotations

import logging
from datetime import time
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.core.clock import utc_now
from app.models.attendance import AttendancePolicy
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

# Default policy matching the legacy hard-coded behavior (to be overridden per company).
DEFAULT_POLICY = {
    "name": "Default Policy",
    "timezone": "UTC",
    "expected_start_time": "09:00",
    "expected_end_time": "18:00",
    "expected_work_minutes": 480.0,
    "late_grace_minutes": 0.0,
    "early_departure_grace_minutes": 0.0,
    "minimum_half_day_minutes": 240.0,
    "minimum_full_day_minutes": 360.0,
    "overtime_enabled": False,
    "overtime_after_minutes": 480.0,
    "work_week": ["Mon", "Tue", "Wed", "Thu", "Fri"],
}


async def ensure_default_policy(company_id: str, actor_id: Optional[str] = None) -> AttendancePolicy:
    """Idempotently create the default attendance policy for a company."""
    existing = await AttendancePolicy.find_one({"company_id": company_id, "active": True})
    if existing:
        return existing
    try:
        policy = AttendancePolicy(
            company_id=company_id,
            created_by=actor_id,
            **DEFAULT_POLICY,
        )
        await policy.insert()
        return policy
    except DuplicateKeyError:
        existing = await AttendancePolicy.find_one({"company_id": company_id, "active": True})
        if existing:
            return existing
        # Shouldn't happen but safe fallback
        raise


async def get_active_policy(company_id: str) -> Optional[AttendancePolicy]:
    """Return the active attendance policy for a company, creating default if needed."""
    return await ensure_default_policy(company_id)


async def get_policy(company_id: str, policy_id: str) -> Optional[AttendancePolicy]:
    policy = await AttendancePolicy.get(policy_id)
    if not policy or policy.company_id != company_id:
        return None
    return policy


async def list_policies(company_id: str, include_inactive: bool = False) -> list[AttendancePolicy]:
    query: Dict[str, Any] = {"company_id": company_id}
    if not include_inactive:
        query["active"] = True
    return await AttendancePolicy.find(query).sort("-created_at").to_list()


async def create_policy(company_id: str, actor: User, payload: Dict[str, Any]) -> AttendancePolicy:
    """Create a new attendance policy. Deactivates existing active policy if creating a new one."""
    allowed = {
        "name", "timezone", "expected_start_time", "expected_end_time",
        "expected_work_minutes", "late_grace_minutes", "early_departure_grace_minutes",
        "minimum_half_day_minutes", "minimum_full_day_minutes",
        "overtime_enabled", "overtime_after_minutes", "work_week", "active",
    }
    clean = {k: v for k, v in payload.items() if k in allowed}

    # Validate required fields
    name = clean.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Policy name is required")

    # Validate timezone
    tz = clean.get("timezone", "UTC")
    try:
        import pytz
        pytz.timezone(tz)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid timezone: {tz}")

    # Validate times
    start_time = clean.get("expected_start_time", "09:00")
    end_time = clean.get("expected_end_time", "18:00")
    _validate_time_str(start_time, "expected_start_time")
    _validate_time_str(end_time, "expected_end_time")

    # Validate work_minutes
    work_minutes = clean.get("expected_work_minutes", 480.0)
    if work_minutes <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expected_work_minutes must be positive")

    # Validate work_week
    work_week = clean.get("work_week", ["Mon", "Tue", "Wed", "Thu", "Fri"])
    valid_days = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
    if not work_week or not isinstance(work_week, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="work_week must be a non-empty list")
    for day in work_week:
        if day not in valid_days:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid work_week day: {day}")

    # Validate grace periods
    grace = clean.get("late_grace_minutes", 0.0)
    if grace < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="late_grace_minutes cannot be negative")
    early_grace = clean.get("early_departure_grace_minutes", 0.0)
    if early_grace < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="early_departure_grace_minutes cannot be negative")

    policy = AttendancePolicy(
        company_id=company_id,
        created_by=str(actor.id),
        **clean,
    )
    await policy.insert()
    return policy


async def update_policy(company_id: str, policy_id: str, payload: Dict[str, Any]) -> AttendancePolicy:
    policy = await AttendancePolicy.get(policy_id)
    if not policy or policy.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance policy not found")

    allowed = {
        "name", "timezone", "expected_start_time", "expected_end_time",
        "expected_work_minutes", "late_grace_minutes", "early_departure_grace_minutes",
        "minimum_half_day_minutes", "minimum_full_day_minutes",
        "overtime_enabled", "overtime_after_minutes", "work_week", "active",
    }

    for key, value in payload.items():
        if key in allowed and value is not None:
            if key == "timezone":
                try:
                    import pytz
                    pytz.timezone(value)
                except Exception:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid timezone: {value}")
            elif key in ("expected_start_time", "expected_end_time"):
                _validate_time_str(value, key)
            elif key == "expected_work_minutes" and value <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expected_work_minutes must be positive")
            elif key in ("late_grace_minutes", "early_departure_grace_minutes") and value < 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{key} cannot be negative")
            elif key == "work_week":
                valid_days = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
                if not value or not isinstance(value, list) or not all(d in valid_days for d in value):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid work_week")
            setattr(policy, key, value)

    policy.updated_at = utc_now()
    await policy.save()
    return policy


async def deactivate_policy(company_id: str, policy_id: str) -> AttendancePolicy:
    """Soft-deactivate a policy."""
    policy = await AttendancePolicy.get(policy_id)
    if not policy or policy.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance policy not found")
    policy.active = False
    policy.updated_at = utc_now()
    await policy.save()
    return policy


def parse_time_str(value: str) -> time:
    """Parse HH:MM string to time object."""
    parts = value.split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid time format: {value}")
    return time(int(parts[0]), int(parts[1]))


def _validate_time_str(value: str, field_name: str) -> None:
    try:
        parse_time_str(value)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name} format. Expected HH:MM.",
        )


def serialize_policy(policy: AttendancePolicy) -> Dict[str, Any]:
    return {
        "id": str(policy.id),
        "company_id": policy.company_id,
        "name": policy.name,
        "timezone": policy.timezone,
        "expected_start_time": policy.expected_start_time,
        "expected_end_time": policy.expected_end_time,
        "expected_work_minutes": policy.expected_work_minutes,
        "late_grace_minutes": policy.late_grace_minutes,
        "early_departure_grace_minutes": policy.early_departure_grace_minutes,
        "minimum_half_day_minutes": policy.minimum_half_day_minutes,
        "minimum_full_day_minutes": policy.minimum_full_day_minutes,
        "overtime_enabled": policy.overtime_enabled,
        "overtime_after_minutes": policy.overtime_after_minutes,
        "work_week": policy.work_week,
        "active": policy.active,
        "created_by": policy.created_by,
        "created_at": policy.created_at,
        "updated_at": policy.updated_at,
    }
