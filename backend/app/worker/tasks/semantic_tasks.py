from __future__ import annotations

import asyncio
import logging

from app.semantic.chunking import SemanticChunker
from app.semantic.runtime import embedding_provider, vector_store
from app.models.knowledge import KnowledgeRecord
from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run(coro):
    return asyncio.run(coro)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def process_knowledge_created(self, knowledge_event_payload: dict):
    try:
        record = _run(KnowledgeRecord.get(knowledge_event_payload["aggregate_id"]))
        if not record:
            return {"status": "missing"}
        chunks = SemanticChunker.chunk(knowledge=record)
        for chunk in chunks:
            embedding = _run(embedding_provider.embed(chunk.content))
            _run(vector_store.store(chunk, embedding))
        return {"status": "processed", "chunk_count": len(chunks)}
    except Exception as exc:
        logger.exception("Semantic knowledge task failed")
        raise self.retry(exc=exc)
