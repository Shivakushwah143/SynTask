"""
Notification Endpoints
"""
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, status, Depends
from pydantic import BaseModel, Field

from app.models.notification import Notification
from app.models.user import User
from app.api.dependencies import get_current_user
from app.api.deps import Pagination20, PaginationParams
from app.services.reminder_service import reminder_service
from app.core.clock import utc_now

router = APIRouter()


class ToastAcknowledgePayload(BaseModel):
    notification_ids: list[str] = Field(default_factory=list)


def _notification_type_value(value: Any) -> str:
    return getattr(value, "value", str(value or "system"))


def _serialize_notification(notification: Notification) -> dict[str, Any]:
    return {
        "id": str(notification.id),
        "user_id": notification.user_id,
        "company_id": notification.company_id,
        "type": _notification_type_value(notification.type),
        "title": notification.title,
        "message": notification.message,
        "is_read": notification.is_read,
        "read_at": notification.read_at,
        "action_url": notification.action_url,
        "related_id": notification.related_id,
        "related_type": notification.related_type,
        "priority": getattr(notification, "priority", "info"),
        "scheduled_for": getattr(notification, "scheduled_for", None),
        "toast_shown_at": getattr(notification, "toast_shown_at", None),
        "metadata": notification.metadata or {},
        "created_at": notification.created_at,
    }


async def _get_owned_notification(notification_id: str, current_user: User) -> Notification:
    notification = await Notification.get(notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    if str(notification.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    return notification


@router.get("/")
async def list_notifications(
    is_read: Optional[bool] = Query(default=None),
    pagination: PaginationParams = Pagination20,
    current_user: User = Depends(get_current_user)
):
    """List user notifications"""
    skip, limit = pagination.skip, pagination.limit
    query = {"user_id": str(current_user.id)}
    
    if is_read is not None:
        query["is_read"] = is_read
    
    notifications = await Notification.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
    total = await Notification.find(query).count()
    unread_count = await Notification.find({"user_id": str(current_user.id), "is_read": False}).count()
    
    return {
        "notifications": [_serialize_notification(notif) for notif in notifications],
        "total": total,
        "unread_count": unread_count,
        "skip": skip,
        "limit": limit
    }


@router.get("/reminder-toasts")
async def list_pending_reminder_toasts(
    current_user: User = Depends(get_current_user)
):
    """List unacknowledged due-today/tomorrow reminder notifications for login/dashboard toasts."""
    try:
        await reminder_service.check_all_reminders()
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Login reminder catch-up failed")
    notifications = await reminder_service.get_pending_toast_notifications(
        str(current_user.id),
        current_user.company_id,
    )
    return {
        "notifications": [_serialize_notification(notif) for notif in notifications],
        "total": len(notifications),
    }


@router.post("/reminder-toasts/ack")
async def acknowledge_reminder_toasts(
    payload: ToastAcknowledgePayload,
    current_user: User = Depends(get_current_user)
):
    updated = await reminder_service.acknowledge_toasts(str(current_user.id), payload.notification_ids)
    return {"updated": updated}


@router.patch("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark notification as read"""
    notification = await _get_owned_notification(notification_id, current_user)
    notification.is_read = True
    notification.read_at = utc_now()
    await notification.save()
    
    return {"message": "Notification marked as read", "notification": _serialize_notification(notification)}


@router.post("/mark-all-read")
async def mark_all_notifications_as_read(
    current_user: User = Depends(get_current_user)
):
    """Mark all notifications as read"""
    notifications = await Notification.find(
        {"user_id": str(current_user.id), "is_read": False}
    ).to_list()
    
    for notification in notifications:
        notification.is_read = True
        notification.read_at = utc_now()
        await notification.save()
    
    return {"message": f"{len(notifications)} notifications marked as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete notification"""
    notification = await _get_owned_notification(notification_id, current_user)
    await notification.delete()
    
    return {"message": "Notification deleted successfully"}
