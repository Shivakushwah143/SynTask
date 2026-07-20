from __future__ import annotations

import hashlib
from datetime import datetime
from uuid import uuid4

from app.core.config import settings
from app.rag.embeddings import OpenAIEmbeddingProvider
from app.rag.models import RAGCitation, RAGKnowledgeSource, RAGRetrievalRun
from app.rag.permissions import RAGScope, source_visible_to_scope
from app.rag.qdrant_store import RAGQdrantStore


def sanitize_excerpt(text: str) -> str:
    normalized = " ".join((text or "").split())
    limit = settings.RAG_CITATION_EXCERPT_CHARS
    return normalized[:limit]


class RAGRetrievalService:
    def __init__(self, embedding_provider=None, qdrant_store=None) -> None:
        self.embedding_provider = embedding_provider or OpenAIEmbeddingProvider()
        self.qdrant_store = qdrant_store or RAGQdrantStore()

    async def retrieve(self, *, scope: RAGScope, query: str, top_k: int) -> dict:
        if not scope.company_id or not scope.tenant_id:
            raise ValueError("Tenant scope is required before retrieval")
        run_id = str(uuid4())
        vector = await self.embedding_provider.embed(query)
        filters = scope.visibility_filter()
        filters.update({"status": "active"})
        results = await self.qdrant_store.search(vector=vector, filters=filters, limit=top_k)
        citations = []
        for item in results:
            payload = dict(getattr(item, "payload", None) or item.payload or {})
            source = await RAGKnowledgeSource.find_one(
                RAGKnowledgeSource.company_id == scope.company_id,
                RAGKnowledgeSource.source_id == payload.get("source_id"),
            )
            if not source or not source_visible_to_scope(source, scope):
                continue
            citation = RAGCitation(
                citation_id=str(uuid4()),
                run_id=run_id,
                company_id=scope.company_id,
                tenant_id=scope.tenant_id,
                source_id=source.source_id,
                version_id=payload.get("version_id"),
                chunk_id=payload.get("chunk_id"),
                location=payload.get("location") or {},
                excerpt=sanitize_excerpt(payload.get("excerpt") or payload.get("text") or ""),
                score=float(getattr(item, "score", 0.0) or 0.0),
            )
            await citation.insert()
            citations.append(
                {
                    "citation_id": citation.citation_id,
                    "source_id": citation.source_id,
                    "version_id": citation.version_id,
                    "chunk_id": citation.chunk_id,
                    "title": source.title,
                    "location": citation.location,
                    "excerpt": citation.excerpt,
                    "score": citation.score,
                }
            )

        await RAGRetrievalRun(
            run_id=run_id,
            company_id=scope.company_id,
            tenant_id=scope.tenant_id,
            user_id=scope.user_id,
            query_hash=hashlib.sha256(query.encode("utf-8")).hexdigest(),
            status="success",
            top_k=top_k,
            result_count=len(citations),
            no_answer=not citations,
            filters=filters,
            citation_ids=[item["citation_id"] for item in citations],
            created_at=datetime.utcnow(),
        ).insert()
        return {
            "run_id": run_id,
            "answerable": bool(citations),
            "no_answer_reason": None if citations else "No approved authorized document evidence was found.",
            "citations": citations,
        }


rag_retrieval_service = RAGRetrievalService

