import os
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.rag.qdrant_store import RAGQdrantStore


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_QDRANT_INTEGRATION") != "1",
    reason="Set RUN_QDRANT_INTEGRATION=1 with Qdrant, MongoDB and Redis service containers available.",
)


class ControlledEmbeddingProvider:
    model = "controlled-test-embedding"
    dimensions = 4

    async def embed(self, text: str):
        text = (text or "").lower()
        if "tenant-a" in text or "alpha" in text:
            return [1.0, 0.0, 0.0, 0.0]
        if "tenant-b" in text or "beta" in text:
            return [0.0, 1.0, 0.0, 0.0]
        return [0.5, 0.5, 0.0, 0.0]


@pytest.mark.asyncio
async def test_real_qdrant_tenant_filtered_retrieval_flow(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.OPENAI_EMBEDDING_DIMENSIONS", 4)
    monkeypatch.setattr("app.core.config.settings.QDRANT_COLLECTION", f"test_rag_{uuid4().hex}")

    store = RAGQdrantStore(dimensions=4)
    embedder = ControlledEmbeddingProvider()
    await store.ensure_collection()

    await store.upsert(
        point_id=str(uuid4()),
        vector=await embedder.embed("tenant-a alpha"),
        payload={
            "company_id": "tenant-a",
            "tenant_id": "tenant-a",
            "source_id": "source-a",
            "version_id": "version-a",
            "chunk_id": "chunk-a",
            "approval_status": "approved",
            "status": "active",
            "deleted": False,
            "project_id": "project-a",
            "department_id": None,
            "client_id": None,
            "location": {"section": "body"},
            "excerpt": "tenant-a alpha approved project content",
        },
    )
    await store.upsert(
        point_id=str(uuid4()),
        vector=await embedder.embed("tenant-b beta"),
        payload={
            "company_id": "tenant-b",
            "tenant_id": "tenant-b",
            "source_id": "source-b",
            "version_id": "version-b",
            "chunk_id": "chunk-b",
            "approval_status": "approved",
            "status": "active",
            "deleted": False,
            "project_id": "project-b",
            "department_id": None,
            "client_id": None,
            "location": {"section": "body"},
            "excerpt": "tenant-b beta approved project content",
        },
    )

    tenant_a_results = await store.search(
        vector=await embedder.embed("alpha"),
        filters={"company_id": "tenant-a", "tenant_id": "tenant-a", "approval_status": "approved", "status": "active", "deleted": False},
        limit=10,
    )

    assert tenant_a_results
    assert {item.payload["company_id"] for item in tenant_a_results} == {"tenant-a"}

    await store.delete_source(company_id="tenant-a", source_id="source-a")
    after_delete = await store.search(
        vector=await embedder.embed("alpha"),
        filters={"company_id": "tenant-a", "tenant_id": "tenant-a", "approval_status": "approved", "status": "active", "deleted": False},
        limit=10,
    )
    assert after_delete == []


@pytest.mark.asyncio
async def test_real_qdrant_named_dense_sparse_hybrid_query(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.OPENAI_EMBEDDING_DIMENSIONS", 4)
    monkeypatch.setattr("app.core.config.settings.RAG_HYBRID_COLLECTION", f"test_rag_hybrid_{uuid4().hex}")

    store = RAGQdrantStore(collection_name=f"test_rag_hybrid_{uuid4().hex}", dimensions=4)
    embedder = ControlledEmbeddingProvider()
    await store.ensure_hybrid_collection()
    await store.upsert_hybrid(
        point_id=str(uuid4()),
        dense_vector=await embedder.embed("tenant-a alpha APOLLO-42"),
        sparse_text="tenant-a alpha APOLLO-42 delivery policy",
        payload={
            "company_id": "tenant-a",
            "tenant_id": "tenant-a",
            "source_id": "source-hybrid-a",
            "version_id": "version-hybrid-a",
            "chunk_id": "chunk-hybrid-a",
            "approval_status": "approved",
            "status": "active",
            "deleted": False,
            "project_id": "project-a",
            "excerpt": "APOLLO-42 delivery policy",
        },
    )
    await store.upsert_hybrid(
        point_id=str(uuid4()),
        dense_vector=await embedder.embed("tenant-b beta"),
        sparse_text="tenant-b beta private",
        payload={
            "company_id": "tenant-b",
            "tenant_id": "tenant-b",
            "source_id": "source-hybrid-b",
            "version_id": "version-hybrid-b",
            "chunk_id": "chunk-hybrid-b",
            "approval_status": "approved",
            "status": "active",
            "deleted": False,
            "project_id": "project-b",
            "excerpt": "tenant-b beta private",
        },
    )

    results = await store.hybrid_search(
        dense_vector=await embedder.embed("alpha"),
        sparse_query_text="APOLLO-42 delivery",
        filters={"company_id": "tenant-a", "tenant_id": "tenant-a", "approval_status": "approved", "status": "active", "deleted": False},
        limit=5,
    )

    assert results
    assert {item.payload["company_id"] for item in results} == {"tenant-a"}
    assert results[0].payload["source_id"] == "source-hybrid-a"
