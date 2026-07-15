"""
Notification Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends
from datetime import datetime

from app.notification_center.models import Notification
from app.models.user import User
from app.api.dependencies import get_current_user
from app.api.deps import Pagination20, PaginationParams

router = APIRouter()


@router.get("/")
async def list_notifications(
    is_read: bool = None,
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
        "notifications": [
            {
                "id": str(notif.id),
                "type": notif.type.value,
                "title": notif.title,
                "message": notif.message,
                "is_read": notif.is_read,
                "action_url": notif.action_url,
                "related_id": notif.related_id,
                "related_type": notif.related_type,
                "created_at": notif.created_at,
            }
            for notif in notifications
        ],
        "total": total,
        "unread_count": unread_count,
        "skip": skip,
        "limit": limit
    }


@router.patch("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark notification as read"""
    notification = await Notification.get(notification_id)
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    if notification.user_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    notification.is_read = True
    notification.read_at = datetime.utcnow()
    await notification.save()
    
    return {"message": "Notification marked as read"}


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
        notification.read_at = datetime.utcnow()
        await notification.save()
    
    return {"message": f"{len(notifications)} notifications marked as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete notification"""
    notification = await Notification.get(notification_id)
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    if notification.user_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    await notification.delete()
    
    return {"message": "Notification deleted successfully"}
