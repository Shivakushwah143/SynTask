from __future__ import annotations

import asyncio
from datetime import datetime
from uuid import uuid4

from app.rag.chunking import chunk_sections
from app.rag.embeddings import OpenAIEmbeddingProvider
from app.rag.models import RAGKnowledgeChunk, RAGKnowledgeSource, RAGKnowledgeSourceVersion, RAGSourceStatus
from app.rag.parsers import parse_document
from app.rag.qdrant_store import RAGQdrantStore
from app.worker.celery_app import celery_app


def _run(coro):
    return asyncio.run(coro)


async def _process_source_version(source_id: str, version_id: str) -> dict:
    source = await RAGKnowledgeSource.find_one(RAGKnowledgeSource.source_id == source_id)
    version = await RAGKnowledgeSourceVersion.find_one(RAGKnowledgeSourceVersion.version_id == version_id)
    if not source or not version:
        return {"status": "missing"}
    if source.approval_status != "approved" or source.status not in {RAGSourceStatus.APPROVED, RAGSourceStatus.INDEXING}:
        return {"status": "not_approved"}
    source.status = RAGSourceStatus.INDEXING
    version.status = RAGSourceStatus.INDEXING
    await source.save()
    await version.save()

    try:
        sections = parse_document(__import__("pathlib").Path(source.storage_path), source.document_type.value)
        chunks = chunk_sections(sections)
        embedder = OpenAIEmbeddingProvider(model=version.embedding_model, dimensions=version.embedding_dimensions)
        store = RAGQdrantStore(collection_name=version.qdrant_collection, dimensions=version.embedding_dimensions)
        await store.delete_source_version(company_id=source.company_id, version_id=version.version_id)
        for draft in chunks:
            point_id = str(uuid4())
            vector = await embedder.embed(draft.text)
            payload = {
                "company_id": source.company_id,
                "tenant_id": source.tenant_id,
                "source_id": source.source_id,
                "source_type": source.source_type.value if hasattr(source.source_type, "value") else str(source.source_type),
                "version_id": version.version_id,
                "chunk_id": draft.chunk_id,
                "document_type": source.document_type.value,
                "title": source.title,
                "location": draft.location,
                "excerpt": draft.text,
                "approval_status": source.approval_status,
                "status": "active",
                "deleted": False,
                "project_id": (source.visibility or {}).get("project_id"),
                "department_id": (source.visibility or {}).get("department_id"),
                "client_id": (source.visibility or {}).get("client_id"),
                "visibility": source.visibility or {},
                "embedding_model": version.embedding_model,
                "embedding_dimensions": version.embedding_dimensions,
                "embedding_schema_version": version.embedding_schema_version,
                "indexed_at": datetime.utcnow().isoformat(),
            }
            await store.upsert(point_id=point_id, vector=vector, payload=payload)
            await RAGKnowledgeChunk(
                chunk_id=draft.chunk_id,
                source_id=source.source_id,
                version_id=version.version_id,
                company_id=source.company_id,
                tenant_id=source.tenant_id,
                qdrant_point_id=point_id,
                ordinal=draft.ordinal,
                location=draft.location,
                excerpt=draft.text[:500],
                checksum=draft.checksum,
                visibility=source.visibility or {},
                metadata={"document_type": source.document_type.value},
            ).insert()
        source.status = RAGSourceStatus.ACTIVE
        version.status = RAGSourceStatus.ACTIVE
        version.chunk_count = len(chunks)
        version.indexed_at = datetime.utcnow()
        version.updated_at = datetime.utcnow()
        source.updated_at = datetime.utcnow()
        await version.save()
        await source.save()
        return {"status": "active", "chunk_count": len(chunks)}
    except Exception as exc:
        try:
            store = RAGQdrantStore(collection_name=version.qdrant_collection, dimensions=version.embedding_dimensions)
            await store.delete_source_version(company_id=source.company_id, version_id=version.version_id)
        except Exception:
            pass
        source.status = RAGSourceStatus.FAILED
        version.status = RAGSourceStatus.FAILED
        source.failure_reason = str(exc)
        version.failure_reason = str(exc)
        await source.save()
        await version.save()
        raise


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def process_rag_source_version(self, source_id: str, version_id: str):
    try:
        return _run(_process_source_version(source_id, version_id))
    except Exception as exc:
        raise self.retry(exc=exc)
