import pytest

from app.rag.retrieval import sanitize_excerpt


def test_sanitize_excerpt_limits_document_body(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_CITATION_EXCERPT_CHARS", 12)

    assert sanitize_excerpt("alpha   beta gamma delta") == "alpha beta g"

