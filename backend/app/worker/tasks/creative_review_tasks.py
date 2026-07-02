from __future__ import annotations

import asyncio
import logging

from app.creative.service import CreativeReviewService
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run(coro):
    return asyncio.run(coro)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def enqueue_creative_review_task(self, review_id: str, reviewer_id: str | None = None):
    try:
        service = CreativeReviewService()
        return _run(service.process_review(review_id, reviewer_id=reviewer_id))
    except Exception as exc:
        logger.exception("Creative review task failed for %s", review_id)
        raise self.retry(exc=exc)

