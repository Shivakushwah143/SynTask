"""
Celery application for async background work.
"""
from celery import Celery

from app.core.config import settings

BROKER_URL = "memory://" if settings.DISABLE_CELERY else (settings.CELERY_BROKER_URL or settings.REDIS_URL)
RESULT_BACKEND = "cache+memory://" if settings.DISABLE_CELERY else (settings.CELERY_RESULT_BACKEND or settings.REDIS_URL)

celery_app = Celery(
    "syntask",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=[
        "app.worker.tasks.email_tasks",
        "app.worker.tasks.notification_tasks",
        "app.worker.tasks.webhook_tasks",
        "app.worker.tasks.creative_review_tasks",
        "app.worker.tasks.semantic_tasks",
        "app.worker.tasks.rag_tasks",
        "app.worker.tasks.recruitment_inbox_tasks",
        "app.integrations.meta.tasks",
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
    task_always_eager=settings.CELERY_ALWAYS_EAGER or settings.DISABLE_CELERY,
    task_eager_propagates=True,
    beat_schedule={
        "meta-dispatch-due-webhook-events": {
            "task": "meta.dispatch_due_webhook_events",
            "schedule": 60.0,
        },
        "meta-schedule-insights-sync-runs": {
            "task": "meta.schedule_insights_sync_runs",
            "schedule": 3600.0,
        },
        "meta-dispatch-due-insights-sync-runs": {
            "task": "meta.dispatch_due_insights_sync_runs",
            "schedule": 60.0,
        },
    },
)


def is_celery_enabled() -> bool:
    return not settings.DISABLE_CELERY
