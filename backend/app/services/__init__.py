"""
Service layer for business logic orchestration.

Phase 3 introduced services for high-risk project/task/user workflows and
shared orchestration. Existing legacy endpoints can continue moving behind
service functions incrementally.
"""

from app.services.notification_service import NotificationService, DeliveryResult

__all__ = ["NotificationService", "DeliveryResult"]
