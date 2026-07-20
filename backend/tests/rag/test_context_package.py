from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.rag.context_package import AuthorityType, ContextPackageBuilder, sanitize_for_model_context
from app.rag.permissions import RAGScope
from app.rag.working_memory import ServerWorkingMemoryUpdate, WorkingMemoryService
from test_working_memory import FakeClock, FakeRedis, scope


class FakeRetrievalService:
    def __init__(self):
        self.calls = []
        self.enabled = True

    async def retrieve(self, *, scope: RAGScope, query: str, top_k: int):
        self.calls.append((scope, query, top_k))
        if not self.enabled:
            return {"answerable": False, "citations": []}
        return {
            "run_id": "run-1",
            "answerable": True,
            "citations": [
                {
                    "citation_id": "cit-1",
                    "source_id": "source-1",
                    "version_id": "version-1",
                    "chunk_id": "chunk-1",
                    "title": "Brief",
                    "location": {"page": 1},
                    "excerpt": "Project Apollo launch scope",
                    "score": 0.91,
                }
            ],
        }


@pytest.mark.asyncio
async def test_context_package_marks_structured_memory_not_integrated_and_includes_rag_citation():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = FakeRetrievalService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval)
    session = await wm.create_session(scope=scope(project_id="apollo"), conversation_id="conv")
    await wm.update_server_state(
        scope=scope(project_id="apollo"),
        session_id=session.session_id,
        update=ServerWorkingMemoryUpdate(
            conversation_id="conv",
            current_project={"id": "apollo", "name": "Apollo"},
            reference_bindings={"it": "apollo"},
        ),
    )

    package = await builder.build(scope=scope(project_id="apollo"), session_id=session.session_id, conversation_id="conv", query="What does its brief say?")

    assert package.structured_memory.status == "not_integrated"
    assert package.structured_memory.facts == []
    assert package.resolved_query.endswith("[resolved current project: Apollo]")
    assert package.clarification_required is False
    assert package.authorized_rag_excerpts[0].authority_type == AuthorityType.RAG_DOCUMENT
    assert package.authorized_rag_excerpts[0].untrusted is True
    assert package.citations[0]["citation_id"] == "cit-1"
    assert retrieval.calls[0][0].project_id == "apollo"


@pytest.mark.asyncio
async def test_ambiguous_reference_requires_clarification_without_guessing():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=FakeRetrievalService())
    session = await wm.create_session(scope=scope(), conversation_id="conv")
    await wm.update_server_state(
        scope=scope(),
        session_id=session.session_id,
        update=ServerWorkingMemoryUpdate(
            conversation_id="conv",
            reference_bindings={"project_options": ["apollo", "zeus"]},
        ),
    )

    package = await builder.build(scope=scope(), session_id=session.session_id, conversation_id="conv", query="What does this project say?")

    assert package.clarification_required is True
    assert package.resolved_query == "What does this project say?"


@pytest.mark.asyncio
async def test_permission_changes_remove_previously_available_rag_context():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = FakeRetrievalService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval)
    session = await wm.create_session(scope=scope(project_id="apollo"), conversation_id="conv")

    await builder.build(scope=scope(project_id="apollo"), session_id=session.session_id, conversation_id="conv", query="brief")
    await builder.build(scope=scope(project_id="zeus"), session_id=session.session_id, conversation_id="conv", query="brief")

    assert retrieval.calls[0][0].project_id == "apollo"
    assert retrieval.calls[1][0].project_id == "zeus"


@pytest.mark.asyncio
async def test_missing_working_memory_does_not_invent_context():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = FakeRetrievalService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval)

    package = await builder.build(scope=scope(), session_id="missing", conversation_id="conv", query="What is it?")

    assert package.working_memory["status"] == "working_memory_unavailable"
    assert package.clarification_required is True
    assert "working_memory_unavailable" in package.warnings


def test_sanitized_model_context_excludes_internal_authorization_details():
    now = datetime.now(timezone.utc)
    from app.rag.context_package import ContextBudget, ContextItem, ContextPackage

    package = ContextPackage(
        context_package_id="cp1",
        trace_id="trace",
        created_at=now,
        expires_at=now + timedelta(minutes=5),
        authenticated_scope={"company_id": "secret-tenant", "user_id": "secret-user"},
        permission_hash="secret-permission-hash",
        original_query="q",
        resolved_query="q",
        working_memory={},
        authorized_rag_excerpts=[
            ContextItem(authority_type=AuthorityType.RAG_DOCUMENT, content="excerpt", citation_id="c1", source_identifier="s1", untrusted=True)
        ],
        citations=[{"citation_id": "c1", "source_id": "s1"}],
        budget=ContextBudget(max_items=10, max_chars=100, used_items=1, used_chars=7),
    )

    model_context = sanitize_for_model_context(package).model_dump()

    assert "authenticated_scope" not in model_context
    assert "permission_hash" not in model_context
    assert model_context["items"][0]["untrusted_data"] is True
    assert model_context["structured_memory_status"] == "not_integrated"


def test_citation_relationships_survive_context_truncation(monkeypatch):
    from app.rag.context_package import ContextPackageBuilder, ContextItem

    monkeypatch.setattr("app.core.config.settings.RAG_CONTEXT_PACKAGE_MAX_ITEMS", 1)
    kept = ContextPackageBuilder()._filter_citations_for_items(
        [{"citation_id": "c1"}, {"citation_id": "c2"}],
        [ContextItem(authority_type=AuthorityType.RAG_DOCUMENT, content="a", citation_id="c2")],
    )

    assert kept == [{"citation_id": "c2"}]
