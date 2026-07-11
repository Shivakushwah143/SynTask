"""
Recruitment inbox background tasks.
"""
import asyncio

from app.worker.celery_app import celery_app


def _run(coro):
    return asyncio.run(coro)


async def _ensure_db():
    from app.core.database import init_db

    await init_db()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_recruitment_import_task(self, import_id: str, company_id: str):
    try:
        async def _process():
            await _ensure_db()
            from app.recruitment.services import RecruitmentInboxService

            item = await RecruitmentInboxService.process_import(company_id, import_id)
            return {"id": str(item.id), "status": item.status.value}

        return _run(_process())
    except Exception as exc:
        raise self.retry(exc=exc)
