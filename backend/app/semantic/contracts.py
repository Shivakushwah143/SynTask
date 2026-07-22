from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass(slots=True)
class SemanticChunk:
    chunk_id: str
    knowledge_id: str
    company_id: str
    project_id: Optional[str]
    campaign_id: Optional[str]
    knowledge_type: str
    source_entity: str
    source_entity_id: str
    title: str
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RetrievedKnowledgeItem:
    knowledge_id: str
    score: float
    chunk_id: str
    company_id: str
    project_id: Optional[str]
    campaign_id: Optional[str]
    knowledge_type: str
    title: str
    summary: str
    content: str
    metadata: dict[str, Any]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass(slots=True)
class KnowledgeContext:
    query: str
    company_id: str
    items: list[RetrievedKnowledgeItem]
    filters: dict[str, Any]
    cache_hit: bool = False
    generated_at: datetime = field(default_factory=datetime.now)

