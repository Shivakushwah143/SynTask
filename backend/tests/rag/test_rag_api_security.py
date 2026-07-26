from fastapi import HTTPException

from app.api.v1.endpoints import rag as rag_api
from app.rag.schemas import RAGRetrieveRequest, RAGVisibilityInput


def test_retrieve_request_schema_rejects_authoritative_tenant_fields():
    assert "company_id" not in RAGRetrieveRequest.model_fields
    assert "tenant_id" not in RAGRetrieveRequest.model_fields
    assert "company_id" not in RAGVisibilityInput.model_fields
    assert "tenant_id" not in RAGVisibilityInput.model_fields


def test_feature_flag_disabled_fails_closed(monkeypatch):
    monkeypatch.setattr("app.api.v1.endpoints.rag.settings.RAG_ENABLED", False)

    try:
        rag_api._require_rag_enabled()
    except HTTPException as exc:
        assert exc.status_code == 503
        assert "disabled" in exc.detail
    else:
        raise AssertionError("RAG disabled state must fail closed")

