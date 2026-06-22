"""
Notification delivery placeholder tasks.
"""
import logging

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def deliver_notification_task(self, notification_id: str):
    try:
        logger.info(f"Notification delivery queued: {notification_id}")
        return True
    except Exception as exc:
        raise self.retry(exc=exc)
