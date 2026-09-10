"""
AI Evaluation background tasks.

Runs an entire evaluation dataset in the worker, never inside the HTTP
request. Cases execute sequentially to avoid Groq rate-limit bursts; the runner
fails fast (BLOCKED_PROVIDER) on repeated provider failures.
"""
from __future__ import annotations

import asyncio

from app.worker.celery_app import celery_app


def _run(coro):
    return asyncio.run(coro)


async def _ensure_db():
    from app.core.database import init_db

    await init_db()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def run_ai_eval_dataset(self, run_id: str):
    """Execute one AIEvalRun identified by ``run_id``."""
    try:
        async def _execute():
            await _ensure_db()
            from app.agents.evaluation.runner import execute_run
            from app.models.ai_evaluation import AIEvalRun

            run = await AIEvalRun.find_one(AIEvalRun.run_id == run_id)
            if not run:
                return {"status": "missing", "run_id": run_id}
            # A previous attempt already finished the run — never re-run it.
            if run.status.value in {"COMPLETED", "BLOCKED", "FAILED"}:
                return {"status": run.status.value, "run_id": run_id, "already_terminal": True}
            return await execute_run(run_id)

        return _run(_execute())
    except Exception as exc:
        # Worker crash: mark the run FAILED so it stays recoverable but is
        # never mistaken for COMPLETED, then retry per Celery policy.
        try:
            async def _mark_failed():
                await _ensure_db()
                from app.core.clock import utc_now
                from app.models.ai_evaluation import AIEvalRun, AIEvalRunStatus

                run = await AIEvalRun.find_one(AIEvalRun.run_id == run_id)
                if run and run.status.value in {"QUEUED", "RUNNING"}:
                    run.status = AIEvalRunStatus.FAILED
                    run.completed_at = utc_now()
                    run.updated_at = utc_now()
                    await run.save()
                    return True
                return False

            _run(_mark_failed())
        except Exception:
            pass
        raise self.retry(exc=exc)
