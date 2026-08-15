"""
Phase 4 — Holiday management service.

Company-scoped holidays that integrate with attendance status resolution.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.models.attendance import Holiday
from app.models.user import User

logger = logging.getLogger(__name__)


async def list_holidays(
    company_id: str,
    year: Optional[int] = None,
    include_inactive: bool = False,
) -> list[Holiday]:
    """List company holidays, optionally filtered by year."""
    query: Dict[str, Any] = {"company_id": company_id}
    if not include_inactive:
        query["active"] = True
    if year:
        # Filter by calendar year using the date field
        query["date"] = {
            "$gte": datetime(year, 1, 1),
            "$lte": datetime(year, 12, 31, 23, 59, 59),
        }
    return await Holiday.find(query).sort("date").to_list()


async def get_holiday(company_id: str, holiday_id: str) -> Optional[Holiday]:
    holiday = await Holiday.get(holiday_id)
    if not holiday or holiday.company_id != company_id:
        return None
    return holiday


async def create_holiday(company_id: str, actor: User, payload: Dict[str, Any]) -> Holiday:
    """Create a new holiday."""
    name = (payload.get("name") or "").strip()
    date_str = payload.get("date")
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Holiday name is required")
    if not date_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Holiday date is required")

    # Parse date
    holiday_date = _parse_holiday_date(date_str)

    # Check for duplicate on same date (same company)
    existing = await Holiday.find_one({
        "company_id": company_id,
        "date": holiday_date,
        "active": True,
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A holiday already exists on {holiday_date.strftime('%Y-%m-%d')}",
        )

    holiday = Holiday(
        company_id=company_id,
        name=name,
        date=holiday_date,
        description=payload.get("description", ""),
        location=payload.get("location"),
        created_by=str(actor.id),
    )
    await holiday.insert()
    return holiday


async def update_holiday(company_id: str, holiday_id: str, payload: Dict[str, Any]) -> Holiday:
    holiday = await Holiday.get(holiday_id)
    if not holiday or holiday.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday not found")

    allowed = {"name", "date", "description", "location", "active"}
    for key, value in payload.items():
        if key in allowed and value is not None:
            if key == "date":
                value = _parse_holiday_date(value)
            if key == "name":
                value = value.strip()
            setattr(holiday, key, value)

    holiday.updated_at = utc_now()
    await holiday.save()
    return holiday


async def deactivate_holiday(company_id: str, holiday_id: str) -> Holiday:
    """Soft-deactivate a holiday."""
    holiday = await Holiday.get(holiday_id)
    if not holiday or holiday.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Holiday not found")
    holiday.active = False
    holiday.updated_at = utc_now()
    await holiday.save()
    return holiday


async def is_holiday(company_id: str, check_date: date) -> Optional[Holiday]:
    """Check if a specific date is a company holiday. Returns the Holiday or None."""
    dt = datetime.combine(check_date, time.min)
    return await Holiday.find_one({
        "company_id": company_id,
        "date": dt,
        "active": True,
    })


async def get_holidays_in_range(
    company_id: str, start_date: date, end_date: date
) -> list[Holiday]:
    """Return active holidays in a date range (inclusive)."""
    return await Holiday.find({
        "company_id": company_id,
        "active": True,
        "date": {
            "$gte": datetime.combine(start_date, time.min),
            "$lte": datetime.combine(end_date, time.max),
        },
    }).to_list()


def _parse_holiday_date(value: Any) -> datetime:
    """Parse a date string or datetime to a datetime at midnight UTC."""
    if isinstance(value, datetime):
        return datetime.combine(value.date(), time.min)
    if isinstance(value, str):
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return datetime.combine(parsed.date(), time.min)
            except (ValueError, TypeError):
                pass
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid date format. Expected YYYY-MM-DD.",
    )


def serialize_holiday(holiday: Holiday) -> Dict[str, Any]:
    return {
        "id": str(holiday.id),
        "company_id": holiday.company_id,
        "name": holiday.name,
        "date": holiday.date,
        "description": holiday.description,
        "location": holiday.location,
        "active": holiday.active,
        "created_by": holiday.created_by,
        "created_at": holiday.created_at,
        "updated_at": holiday.updated_at,
    }
