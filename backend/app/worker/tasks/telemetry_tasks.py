"""
Telemetry retention — scheduled cleanup of expired AITrace / AISpan records.

Observability is bounded: ``AI_TELEMETRY_RETENTION_DAYS`` (default 30)
governs how long operational trace/span records are kept. A lightweight
daily beat task removes records whose ``started_at`` is older than the
retention window. Cleanup is best-effort and never touches audit /
query-analytics collections.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from app.core.clock import utc_now
from app.core.config import settings
from app.models.ai_observability import AISpan, AITrace
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run(coro):
    return asyncio.run(coro)


async def _ensure_db():
    from app.core.database import init_db

    await init_db()


async def _purge(model_cls, cutoff) -> int:
    result = await model_cls.find({"started_at": {"$lt": cutoff}}).delete()
    return int(getattr(result, "deleted_count", 0) or 0)


@celery_app.task(name="ai_telemetry.purge_expired")
def purge_expired_ai_telemetry() -> dict:
    """Delete AI traces/spans older than the configured retention window."""
    retention_days = int(getattr(settings, "AI_TELEMETRY_RETENTION_DAYS", 30) or 30)
    if retention_days <= 0:
        return {"retention_days": retention_days, "purged_traces": 0, "purged_spans": 0, "skipped": True}
    cutoff = utc_now() - timedelta(days=retention_days)

    async def _execute() -> dict:
        await _ensure_db()
        return {
            "retention_days": retention_days,
            "purged_traces": await _purge(AITrace, cutoff),
            "purged_spans": await _purge(AISpan, cutoff),
            "skipped": False,
        }

    try:
        return _run(_execute())
    except Exception:
        logger.exception("AI telemetry purge failed")
        return {"error": "purge_failed", "retention_days": retention_days}
