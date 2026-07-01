from __future__ import annotations

import json
from typing import Any

from app.core.redis_client import get_redis
from app.semantic.contracts import KnowledgeContext, RetrievedKnowledgeItem


class SemanticCache:
    async def get(self, key: str) -> KnowledgeContext | None:
        redis = await get_redis()
        if not redis:
            return None
        payload = await redis.get(key)
        if not payload:
            return None
        data = json.loads(payload)
        return KnowledgeContext(
            query=data["query"],
            company_id=data["company_id"],
            items=[RetrievedKnowledgeItem(**item) for item in data["items"]],
            filters=data["filters"],
            cache_hit=True,
        )

    async def set(self, key: str, context: KnowledgeContext, ttl: int = 300) -> None:
        redis = await get_redis()
        if not redis:
            return
        payload = {
            "query": context.query,
            "company_id": context.company_id,
            "filters": context.filters,
            "items": [
                {
                    "knowledge_id": item.knowledge_id,
                    "score": item.score,
                    "chunk_id": item.chunk_id,
                    "company_id": item.company_id,
                    "project_id": item.project_id,
                    "campaign_id": item.campaign_id,
                    "knowledge_type": item.knowledge_type,
                    "title": item.title,
                    "summary": item.summary,
                    "content": item.content,
                    "metadata": item.metadata,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                    "updated_at": item.updated_at.isoformat() if item.updated_at else None,
                }
                for item in context.items
            ],
        }
        await redis.setex(key, ttl, json.dumps(payload, default=str))

