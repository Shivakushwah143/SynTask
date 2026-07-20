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
    monkeypatch.setattr("app.core.config.settings.QDRANT_COLLECTION", "rag_knowledge")

    pytest.importorskip("qdrant_client")
    store = RAGQdrantStore(dimensions=2)

    with pytest.raises(ValueError):
        await store.search(vector=[0.1, 0.2], filters={"company_id": "c1"}, limit=1)


@pytest.mark.asyncio
async def test_qdrant_store_uses_query_points_and_preserves_filter(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.QDRANT_URL", "http://localhost:6333")
    monkeypatch.setattr("app.core.config.settings.OPENAI_EMBEDDING_DIMENSIONS", 2)
    monkeypatch.setattr("app.core.config.settings.QDRANT_COLLECTION", "rag_knowledge")

    class FakeClient:
        def __init__(self):
            self.calls = []

        async def get_collections(self):
            return type("Collections", (), {"collections": [type("Collection", (), {"name": "rag_knowledge"})()]})()

        async def get_collection(self, collection_name):
            vectors = type("Vectors", (), {"size": 2})()
            params = type("Params", (), {"vectors": vectors})()
            config = type("Config", (), {"params": params})()
            return type("Info", (), {"config": config})()

        async def query_points(self, **kwargs):
            self.calls.append(kwargs)
            return type("Response", (), {"points": [type("Point", (), {"payload": {"company_id": "c1"}, "score": 1.0})()]})()

    store = RAGQdrantStore(dimensions=2)
    fake = FakeClient()
    store.client = fake

    results = await store.search(
        vector=[0.1, 0.2],
        filters={"company_id": "c1", "tenant_id": "c1", "approval_status": "approved", "deleted": False},
        limit=3,
    )

    assert len(results) == 1
    assert fake.calls[0]["query"] == [0.1, 0.2]
    assert fake.calls[0]["limit"] == 3
    assert fake.calls[0]["with_payload"] is True
    assert len(fake.calls[0]["query_filter"].must) == 4
