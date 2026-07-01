from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from app.semantic.contracts import KnowledgeContext, RetrievedKnowledgeItem
from app.semantic.embeddings import EmbeddingProvider
from app.semantic.vector_store import VectorStore


class KnowledgeRetriever:
    def __init__(self, embedding_provider: EmbeddingProvider, vector_store: VectorStore, cache=None) -> None:
        self.embedding_provider = embedding_provider
        self.vector_store = vector_store
        self.cache = cache

    @staticmethod
    def _cache_key(company_id: str, query: str, filters: dict[str, Any]) -> str:
        parts = [company_id, query.strip().lower()]
        for key in sorted(filters):
            value = filters[key]
            if isinstance(value, dict):
                value = ",".join(f"{k}={v}" for k, v in sorted(value.items()))
            parts.append(f"{key}={value}")
        return "semantic:context:" + "|".join(parts)

    @staticmethod
    def _dedupe(items: list[RetrievedKnowledgeItem]) -> list[RetrievedKnowledgeItem]:
        seen: set[str] = set()
        deduped = []
        for item in items:
            if item.chunk_id in seen:
                continue
            seen.add(item.chunk_id)
            deduped.append(item)
        return deduped

    def _score(self, item: RetrievedKnowledgeItem) -> float:
        score = item.score
        importance = float(item.metadata.get("importance") or 1)
        confidence = float(item.metadata.get("confidence") or 0.8)
        freshness = float(item.metadata.get("freshness") or 1.0)
        return score * 0.6 + min(1.0, importance / 5.0) * 0.2 + confidence * 0.1 + freshness * 0.1

    async def retrieve(
        self,
        *,
        company_id: str,
        query: str,
        project_id: str | None = None,
        campaign_id: str | None = None,
        knowledge_type: str | None = None,
        date_range: dict[str, datetime] | None = None,
        importance: int | None = None,
        confidence: float | None = None,
        freshness: float | None = None,
        limit: int = 8,
    ) -> KnowledgeContext:
        filters: dict[str, Any] = {"company_id": company_id}
        if project_id:
            filters["project_id"] = project_id
        if campaign_id:
            filters["campaign_id"] = campaign_id
        if knowledge_type:
            filters["knowledge_type"] = knowledge_type
        if date_range:
            filters["date_range"] = date_range
        if importance is not None:
            filters["importance"] = importance
        if confidence is not None:
            filters["confidence"] = confidence
        if freshness is not None:
            filters["freshness"] = freshness

        cache_key = self._cache_key(company_id, query, filters)
        if self.cache:
            cached = await self.cache.get(cache_key)
            if cached:
                return cached

        embedding = await self.embedding_provider.embed(query)
        raw = await self.vector_store.search(embedding=embedding, filters=filters, limit=limit * 3)
        items = [
            RetrievedKnowledgeItem(
                knowledge_id=item["knowledge_id"],
                score=float(item["score"]),
                chunk_id=item["chunk_id"],
                company_id=item["company_id"],
                project_id=item.get("project_id"),
                campaign_id=item.get("campaign_id"),
                knowledge_type=item["knowledge_type"],
                title=item.get("title", ""),
                summary=item.get("knowledge_summary") or item.get("summary") or "",
                content=item.get("content") or "",
                metadata={k: v for k, v in item.items() if k not in {"score"}},
                created_at=item.get("created_at"),
                updated_at=item.get("updated_at"),
            )
            for item in raw
        ]
        items = self._dedupe(sorted(items, key=self._score, reverse=True))[:limit]
        context = KnowledgeContext(query=query, company_id=company_id, items=items, filters=filters)
        if self.cache:
            await self.cache.set(cache_key, context, ttl=300)
        return context
