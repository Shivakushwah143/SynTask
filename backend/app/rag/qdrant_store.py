from __future__ import annotations

from typing import Any

from app.core.config import settings


class QdrantUnavailable(RuntimeError):
    pass


class RAGQdrantStore:
    def __init__(self, *, collection_name: str | None = None, dimensions: int | None = None) -> None:
        self.collection_name = collection_name or settings.QDRANT_COLLECTION
        self.dimensions = dimensions or settings.OPENAI_EMBEDDING_DIMENSIONS
        if not settings.RAG_ENABLED:
            raise QdrantUnavailable("RAG is disabled")
        if not settings.QDRANT_URL:
            raise QdrantUnavailable("QDRANT_URL is not configured")
        try:
            from qdrant_client import AsyncQdrantClient
        except Exception as exc:  # pragma: no cover - dependency presence is environment-specific
            raise QdrantUnavailable("qdrant-client is required") from exc
        self.client = AsyncQdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY or None, timeout=settings.QDRANT_TIMEOUT_SECONDS)

    def _validate_vector(self, vector: list[float]) -> None:
        if len(vector) != self.dimensions:
            raise ValueError("Vector dimensions are incompatible with configured Qdrant collection")

    async def ensure_collection(self) -> None:
        from qdrant_client.http import models

        collections = await self.client.get_collections()
        existing = {item.name for item in collections.collections}
        if self.collection_name not in existing:
            await self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(size=self.dimensions, distance=models.Distance.COSINE),
            )
            for field in ["company_id", "tenant_id", "source_id", "version_id", "chunk_id", "approval_status", "project_id", "department_id", "client_id", "deleted", "status"]:
                try:
                    await self.client.create_payload_index(
                        collection_name=self.collection_name,
                        field_name=field,
                        field_schema=models.PayloadSchemaType.KEYWORD if field != "deleted" else models.PayloadSchemaType.BOOL,
                    )
                except Exception:
                    pass
            return

        info = await self.client.get_collection(self.collection_name)
        vector_size = getattr(getattr(info.config.params, "vectors", None), "size", None)
        if vector_size and int(vector_size) != self.dimensions:
            raise ValueError("Configured embedding dimensions do not match existing Qdrant collection")

    async def upsert(self, *, point_id: str, vector: list[float], payload: dict[str, Any]) -> None:
        from qdrant_client.http import models

        self._validate_vector(vector)
        if not payload.get("company_id") or not payload.get("tenant_id"):
            raise ValueError("Qdrant payload requires tenant/company metadata")
        await self.ensure_collection()
        await self.client.upsert(
            collection_name=self.collection_name,
            points=[models.PointStruct(id=point_id, vector=vector, payload=payload)],
        )

    async def delete_source_version(self, *, company_id: str, version_id: str) -> None:
        from qdrant_client.http import models

        await self.ensure_collection()
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(key="company_id", match=models.MatchValue(value=company_id)),
                        models.FieldCondition(key="version_id", match=models.MatchValue(value=version_id)),
                    ]
                )
            ),
        )

    async def search(self, *, vector: list[float], filters: dict[str, Any], limit: int) -> list[Any]:
        from qdrant_client.http import models

        self._validate_vector(vector)
        if not filters.get("company_id") or not filters.get("tenant_id"):
            raise ValueError("Tenant scope is required before retrieval")
        await self.ensure_collection()
        must = []
        for key, value in filters.items():
            if value is None:
                continue
            must.append(models.FieldCondition(key=key, match=models.MatchValue(value=value)))
        return await self.client.search(
            collection_name=self.collection_name,
            query_vector=vector,
            query_filter=models.Filter(must=must),
            limit=limit,
            with_payload=True,
        )

