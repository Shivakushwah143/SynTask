"""
Webhook delivery tasks with retry.
"""
import logging

import httpx

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def deliver_webhook(self, webhook_id: str, payload: dict, target_url: str):
    try:
        response = httpx.post(target_url, json=payload, timeout=10.0)
        response.raise_for_status()
        logger.info(f"Webhook delivered: {webhook_id}")
        return {"success": True, "status_code": response.status_code}
    except Exception as exc:
        logger.warning(f"Webhook delivery failed [{webhook_id}]: {exc}")
        raise self.retry(exc=exc)
