from __future__ import annotations

import math
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Optional

from app.semantic.contracts import SemanticChunk


@dataclass(slots=True)
class VectorRecord:
    vector_id: str
    embedding: list[float]
    payload: dict[str, Any]


class VectorStore(ABC):
    @abstractmethod
    async def store(self, chunk: SemanticChunk, embedding: list[float]) -> str:
        raise NotImplementedError

    @abstractmethod
    async def update(self, vector_id: str, embedding: list[float], payload: dict[str, Any]) -> None:
        raise NotImplementedError

    @abstractmethod
    async def delete(self, *, company_id: str, knowledge_id: str | None = None, chunk_id: str | None = None) -> int:
        raise NotImplementedError

    @abstractmethod
    async def search(self, *, embedding: list[float], filters: dict[str, Any], limit: int = 10) -> list[dict[str, Any]]:
        raise NotImplementedError


class FakeQdrantVectorStore(VectorStore):
    """Test-only in-memory fake; never use as production Qdrant."""
    def __init__(self) -> None:
        self._records: dict[str, VectorRecord] = {}

    @staticmethod
    def _cosine(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        if not na or not nb:
            return 0.0
        return float(dot / (na * nb))

    @staticmethod
    def _matches(payload: dict[str, Any], filters: dict[str, Any]) -> bool:
        for key, value in filters.items():
            if value is None:
                continue
            if key == "date_range":
                created_at = payload.get("created_at")
                if not created_at:
                    return False
                start = value.get("start")
                end = value.get("end")
                if start and created_at < start:
                    return False
                if end and created_at > end:
                    return False
                continue
            if key in {"importance", "confidence", "freshness"}:
                current = payload.get(key)
                if current is None:
                    return False
                if key == "importance" and int(current) < int(value):
                    return False
                if key in {"confidence", "freshness"} and float(current) < float(value):
                    return False
                continue
            if payload.get(key) != value:
                return False
        return True

    async def store(self, chunk: SemanticChunk, embedding: list[float]) -> str:
        vector_id = chunk.chunk_id
        self._records[vector_id] = VectorRecord(vector_id=vector_id, embedding=embedding, payload={**chunk.metadata, "chunk_id": chunk.chunk_id, "knowledge_id": chunk.knowledge_id, "company_id": chunk.company_id, "project_id": chunk.project_id, "campaign_id": chunk.campaign_id, "knowledge_type": chunk.knowledge_type, "source_entity": chunk.source_entity, "source_entity_id": chunk.source_entity_id, "title": chunk.title, "content": chunk.content})
        return vector_id

    async def update(self, vector_id: str, embedding: list[float], payload: dict[str, Any]) -> None:
        self._records[vector_id] = VectorRecord(vector_id=vector_id, embedding=embedding, payload=payload)

    async def delete(self, *, company_id: str, knowledge_id: str | None = None, chunk_id: str | None = None) -> int:
        to_delete = []
        for vector_id, record in self._records.items():
            payload = record.payload
            if payload.get("company_id") != company_id:
                continue
            if knowledge_id and payload.get("knowledge_id") != knowledge_id:
                continue
            if chunk_id and payload.get("chunk_id") != chunk_id:
                continue
            to_delete.append(vector_id)
        for vector_id in to_delete:
            self._records.pop(vector_id, None)
        return len(to_delete)

    async def search(self, *, embedding: list[float], filters: dict[str, Any], limit: int = 10) -> list[dict[str, Any]]:
        scored = []
        for record in self._records.values():
            if not self._matches(record.payload, filters):
                continue
            score = self._cosine(embedding, record.embedding)
            scored.append({"score": score, **record.payload})
        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:limit]


# Backward-compatible alias for existing semantic tests and imports.
QdrantVectorStore = FakeQdrantVectorStore
