import pytest

from app.rag.qdrant_store import QdrantUnavailable, RAGQdrantStore
from app.semantic.vector_store import FakeQdrantVectorStore, QdrantVectorStore


def test_legacy_semantic_alias_is_explicit_fake():
    assert QdrantVectorStore is FakeQdrantVectorStore
    assert "Test-only in-memory fake" in (FakeQdrantVectorStore.__doc__ or "")


def test_rag_enabled_missing_qdrant_url_fails_closed(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.QDRANT_URL", None)

    with pytest.raises(QdrantUnavailable):
        RAGQdrantStore()


def test_rag_disabled_cannot_initialize_real_store_or_fake_fallback(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_ENABLED", False)
    monkeypatch.setattr("app.core.config.settings.QDRANT_URL", "http://localhost:6333")

    with pytest.raises(QdrantUnavailable):
        RAGQdrantStore()

