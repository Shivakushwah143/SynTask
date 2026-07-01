"""
Celery application for async background work.
"""
from celery import Celery

from app.core.config import settings

broker_url = settings.CELERY_BROKER_URL or settings.REDIS_URL
result_backend = settings.CELERY_RESULT_BACKEND or settings.REDIS_URL

celery_app = Celery(
    "syntask",
    broker=broker_url,
    backend=result_backend,
    include=[
        "app.worker.tasks.email_tasks",
        "app.worker.tasks.notification_tasks",
        "app.worker.tasks.webhook_tasks",
        "app.worker.tasks.creative_review_tasks",
        "app.worker.tasks.semantic_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_default_retry_delay=60,
    task_max_retries=3,
    worker_prefetch_multiplier=1,
)
