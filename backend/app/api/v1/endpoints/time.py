from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.core.clock import clock_service, parse_to_utc, utc_now
from app.models.user import User, UserRole

router = APIRouter()


class TimeSettingsUpdate(BaseModel):
    timezone: Optional[str] = None
    automatic_time: Optional[bool] = None
    manual_time: Optional[datetime] = None
    hour_format: Optional[Literal["12", "24"]] = None
    show_seconds: Optional[bool] = None
    detected: bool = False


def _can_edit_time_settings(user: User, payload: TimeSettingsUpdate) -> bool:
    if payload.detected and payload.timezone and not getattr(user, "timezone", None):
        return True
    return user.role in {UserRole.ADMIN, UserRole.SUPER_ADMIN}


@router.get("/settings")
async def get_time_settings(current_user: User = Depends(get_current_user)):
    return clock_service.settings_payload(current_user)


@router.put("/settings")
async def update_time_settings(
    payload: TimeSettingsUpdate,
    current_user: User = Depends(get_current_user),
):
    if not _can_edit_time_settings(current_user, payload):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can edit time settings",
        )

    if payload.timezone is not None:
        try:
            current_user.timezone = clock_service.validate_timezone(payload.timezone)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if payload.automatic_time is not None:
        current_user.automatic_time = payload.automatic_time
    if payload.manual_time is not None:
        current_user.manual_time = parse_to_utc(payload.manual_time)
    if payload.hour_format is not None:
        current_user.hour_format = payload.hour_format
    if payload.show_seconds is not None:
        current_user.show_seconds = payload.show_seconds

    current_user.updated_at = utc_now()
    await current_user.save()
    return clock_service.settings_payload(current_user)
