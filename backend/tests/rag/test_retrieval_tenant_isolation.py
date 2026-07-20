import pytest

from app.rag.qdrant_store import RAGQdrantStore


def test_qdrant_store_rejects_missing_tenant_filter(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.QDRANT_URL", "http://localhost:6333")

    pytest.importorskip("qdrant_client")
    store = RAGQdrantStore()

    with pytest.raises(ValueError):
        store._validate_vector([0.1, 0.2])


@pytest.mark.asyncio
async def test_qdrant_search_requires_tenant_filter(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.QDRANT_URL", "http://localhost:6333")
    monkeypatch.setattr("app.core.config.settings.OPENAI_EMBEDDING_DIMENSIONS", 2)

    pytest.importorskip("qdrant_client")
    store = RAGQdrantStore(dimensions=2)

    with pytest.raises(ValueError):
        await store.search(vector=[0.1, 0.2], filters={"company_id": "c1"}, limit=1)

