from __future__ import annotations

from typing import Any

from app.semantic.contracts import KnowledgeContext


class KnowledgeContextBuilder:
    @staticmethod
    def build_payload(context: KnowledgeContext) -> dict[str, Any]:
        return {
            "query": context.query,
            "company_id": context.company_id,
            "filters": context.filters,
            "cache_hit": context.cache_hit,
            "generated_at": context.generated_at,
            "items": [
                {
                    "knowledge_id": item.knowledge_id,
                    "chunk_id": item.chunk_id,
                    "score": item.score,
                    "knowledge_type": item.knowledge_type,
                    "title": item.title,
                    "summary": item.summary,
                    "content": item.content,
                    "project_id": item.project_id,
                    "campaign_id": item.campaign_id,
                    "metadata": item.metadata,
                }
                for item in context.items
            ],
        }

