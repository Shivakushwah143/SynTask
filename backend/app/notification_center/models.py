"""Notification Center-owned model facade; old imports remain compatible."""

from app.models.notification import Notification, NotificationType

__all__ = ["Notification", "NotificationType"]
