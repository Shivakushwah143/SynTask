"""
Employee Timeline API.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user
from app.models.timeline import TimelineEvent, TimelineEventType, TimelineModule
from app.models.user import User, UserRole
from app.services.timeline_service import serialize_timeline_event

router = APIRouter()


@router.get("/employee/{user_id}")
async def get_employee_timeline(
    user_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    event_type: Optional[TimelineEventType] = Query(None),
    related_module: Optional[TimelineModule] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Return newest-first employee timeline events."""
    target_user = await User.get(user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    await _assert_timeline_access(current_user, target_user)

    query: dict[str, object] = {"user_id": str(target_user.id)}
    if target_user.company_id:
        query["company_id"] = target_user.company_id
    if start_date or end_date:
        timestamp_filter = {}
        if start_date:
            timestamp_filter["$gte"] = start_date
        if end_date:
            timestamp_filter["$lte"] = end_date
        query["timestamp"] = timestamp_filter
    if event_type:
        query["event_type"] = event_type.value
    if related_module:
        query["related_module"] = related_module.value

    events = await TimelineEvent.find(query).sort("-timestamp").skip(skip).limit(limit).to_list()
    total = await TimelineEvent.find(query).count()

    return {
        "events": [serialize_timeline_event(event) for event in events],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


async def _assert_timeline_access(current_user: User, target_user: User) -> None:
    if str(current_user.id) == str(target_user.id):
        return
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if current_user.company_id != target_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this timeline")
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return
    if current_user.role in [UserRole.MANAGER, UserRole.LEAD]:
        if target_user.reports_to == str(current_user.id) or str(current_user.id) in (target_user.ancestors or []):
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this timeline")
