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

