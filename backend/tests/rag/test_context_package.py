from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.user import UserRole
from app.rag.context_package import AuthorityType, ContextPackageBuilder, sanitize_for_model_context
from app.rag.memory_router import MemoryRoute
from app.rag.permissions import RAGScope
from app.rag.structured_memory import StructuredMemoryRecord
from app.rag.working_memory import ClientWorkingMemoryUpdate, ServerWorkingMemoryUpdate, WorkingMemoryService
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


class ProfileAwareRetrievalService:
    def __init__(self):
        self.calls = []

    async def retrieve(self, *, scope: RAGScope, query: str, top_k: int, profile_id: str, working_memory: dict):
        self.calls.append(
            {
                "scope": scope,
                "query": query,
                "top_k": top_k,
                "profile_id": profile_id,
                "working_memory_status": working_memory.get("status"),
            }
        )
        return {
            "run_id": "run-1",
            "answerable": True,
            "citations": [
                {
                    "citation_id": "cit-email-1",
                    "source_id": "source-email-1",
                    "version_id": "version-email-1",
                    "chunk_id": "chunk-email-1",
                    "title": "Approved email template",
                    "location": {"section": "client_update"},
                    "excerpt": "Use concise client update tone.",
                    "score": 0.93,
                }
            ],
            "retrieval_profile": {
                "profile_id": profile_id,
                "profile_version": "email-draft-templates-v1",
                "objective": "Draft-only email templates, tone guidance, approved terminology, and communication policy retrieval",
            },
        }


class FakeUser:
    id = "u1"
    company_id = "c1"
    role = UserRole.ADMIN
    modules = ["task", "sales"]
    first_name = "Ada"
    last_name = "Lovelace"


class FakeStructuredMemoryService:
    def __init__(self):
        self.calls = []

    async def read(self, *, current_user, request):
        self.calls.append((current_user, request))
        if request.record_id == "missing":
            return StructuredMemoryRecord(
                record_type=request.record_type.value,
                tenant_scope={"company_id": current_user.company_id, "tenant_id": current_user.company_id},
                status="missing",
                authorization={"status": "missing"},
            )
        return StructuredMemoryRecord(
            record_type=request.record_type.value,
            record_id=request.record_id or "current",
            tenant_scope={"company_id": current_user.company_id, "tenant_id": current_user.company_id},
            fields={"current_stage": "qualified", "assigned_to": "priya", "updated_at": "2026-07-20T00:00:00Z"},
            authorization={"status": "authorized"},
        )


def scoped_user(project_id=None):
    return RAGScope(company_id="c1", tenant_id="c1", user_id="u1", role="admin", project_id=project_id, current_user=FakeUser())


@pytest.mark.asyncio
async def test_context_package_integrates_router_and_includes_rag_citation_for_fallback():
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

    assert package.structured_memory.status == "integrated"
    assert package.structured_memory.facts == []
    assert package.resolved_query.endswith("[resolved current project: Apollo]")
    assert package.clarification_required is False
    assert package.authorized_rag_excerpts[0].authority_type == AuthorityType.RAG_DOCUMENT
    assert package.authorized_rag_excerpts[0].untrusted is True
    assert package.citations[0]["citation_id"] == "cit-1"
    assert retrieval.calls[0][0].project_id == "apollo"


@pytest.mark.asyncio
async def test_structured_query_rereads_current_business_fact_and_skips_rag():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = FakeRetrievalService()
    structured = FakeStructuredMemoryService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval, structured_memory_service=structured)
    session = await wm.create_session(scope=scoped_user(), conversation_id="conv")
    await wm.update_server_state(
        scope=scoped_user(),
        session_id=session.session_id,
        update=ServerWorkingMemoryUpdate(conversation_id="conv", current_lead={"id": "lead-1", "current_stage": "stale"}),
    )

    package = await builder.build(scope=scoped_user(), session_id=session.session_id, conversation_id="conv", query="Which stage is this lead in?")

    assert package.routing_decision.selected_route == MemoryRoute.STRUCTURED_MEMORY
    assert package.structured_memory.facts[0]["fields"]["current_stage"] == "qualified"
    assert structured.calls[0][1].record_id == "lead-1"
    assert retrieval.calls == []


@pytest.mark.asyncio
async def test_policy_query_routes_to_rag_only():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = FakeRetrievalService()
    structured = FakeStructuredMemoryService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval, structured_memory_service=structured)
    session = await wm.create_session(scope=scoped_user(), conversation_id="conv")

    package = await builder.build(scope=scoped_user(), session_id=session.session_id, conversation_id="conv", query="What is our leave policy?")

    assert package.routing_decision.selected_route == MemoryRoute.KNOWLEDGE_RAG
    assert package.structured_memory.facts == []
    assert len(retrieval.calls) == 1


@pytest.mark.asyncio
async def test_context_package_uses_requested_email_draft_retrieval_profile():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = ProfileAwareRetrievalService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval)
    session = await wm.create_session(scope=scoped_user(), conversation_id="conv")

    package = await builder.build(
        scope=scoped_user(),
        session_id=session.session_id,
        conversation_id="conv",
        query="What is our approved email template policy for client updates?",
        retrieval_profile_id="email_draft_templates",
    )

    assert retrieval.calls[0]["profile_id"] == "email_draft_templates"
    assert retrieval.calls[0]["working_memory_status"] == "available"
    assert package.retrieval_profile["profile_id"] == "email_draft_templates"
    model_context = sanitize_for_model_context(package).model_dump()
    assert model_context["retrieval_profile"]["profile_id"] == "email_draft_templates"


@pytest.mark.asyncio
async def test_email_draft_profile_loads_selected_structured_context_even_for_policy_route():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = ProfileAwareRetrievalService()
    structured = FakeStructuredMemoryService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval, structured_memory_service=structured)
    session = await wm.create_session(scope=scoped_user(), conversation_id="conv")

    package = await builder.build(
        scope=scoped_user(project_id="apollo"),
        session_id=session.session_id,
        conversation_id="conv",
        query="What is our approved email template policy for client updates?",
        retrieval_profile_id="email_draft_templates",
        structured_context_ids={
            "project_id": "apollo",
            "task_id": "task-1",
            "client_id": "client-1",
            "recipient_contact_id": "contact-1",
        },
    )

    requested = [(call[1].record_type.value, call[1].record_id) for call in structured.calls]
    assert ("current_user", None) in requested
    assert ("tenant", None) in requested
    assert ("project", "apollo") in requested
    assert ("task", "task-1") in requested
    assert ("client", "client-1") in requested
    assert ("contact", "contact-1") in requested
    assert package.structured_memory.facts
    assert retrieval.calls[0]["profile_id"] == "email_draft_templates"


@pytest.mark.asyncio
async def test_email_draft_profile_resolves_working_memory_references_to_structured_context():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = ProfileAwareRetrievalService()
    structured = FakeStructuredMemoryService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval, structured_memory_service=structured)
    session = await wm.create_session(scope=scoped_user(project_id="apollo"), conversation_id="conv")
    await wm.update_server_state(
        scope=scoped_user(project_id="apollo"),
        session_id=session.session_id,
        update=ServerWorkingMemoryUpdate(
            conversation_id="conv",
            current_project={"id": "apollo", "name": "Apollo"},
            current_task={"id": "task-1", "title": "Launch plan"},
            tool_output={"agent_id": "general_email_draft_agent", "run_id": "run-email-1", "subject": "Old subject"},
        ),
    )
    await wm.update_client_state(
        scope=scoped_user(project_id="apollo"),
        session_id=session.session_id,
        update=ClientWorkingMemoryUpdate(conversation_id="conv", selected_record={"type": "contact", "id": "contact-1", "name": "Asha"}),
    )

    package = await builder.build(
        scope=scoped_user(project_id="apollo"),
        session_id=session.session_id,
        conversation_id="conv",
        query="Regenerate the last draft for this project and this task to this contact.",
        retrieval_profile_id="email_draft_templates",
    )

    assert package.resolved_reference_bindings["project_id"] == "apollo"
    assert package.resolved_reference_bindings["task_id"] == "task-1"
    assert package.resolved_reference_bindings["recipient_contact_id"] == "contact-1"
    assert package.resolved_reference_bindings["last_email_draft_run_id"] == "run-email-1"
    requested = [(call[1].record_type.value, call[1].record_id) for call in structured.calls]
    assert ("project", "apollo") in requested
    assert ("task", "task-1") in requested
    assert ("contact", "contact-1") in requested


@pytest.mark.asyncio
async def test_email_draft_explicit_context_overrides_working_memory_reference_binding():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = ProfileAwareRetrievalService()
    structured = FakeStructuredMemoryService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval, structured_memory_service=structured)
    session = await wm.create_session(scope=scoped_user(project_id="apollo"), conversation_id="conv")
    await wm.update_server_state(
        scope=scoped_user(project_id="apollo"),
        session_id=session.session_id,
        update=ServerWorkingMemoryUpdate(conversation_id="conv", current_project={"id": "apollo", "name": "Apollo"}),
    )

    package = await builder.build(
        scope=scoped_user(project_id="apollo"),
        session_id=session.session_id,
        conversation_id="conv",
        query="Draft an update for this project.",
        retrieval_profile_id="email_draft_templates",
        structured_context_ids={"project_id": "explicit-project"},
    )

    assert package.resolved_reference_bindings["project_id"] == "apollo"
    requested = [(call[1].record_type.value, call[1].record_id) for call in structured.calls]
    assert ("project", "explicit-project") in requested
    assert ("project", "apollo") not in requested


@pytest.mark.asyncio
async def test_mutation_intent_returns_proposed_action_without_retrieval():
    wm = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    retrieval = FakeRetrievalService()
    structured = FakeStructuredMemoryService()
    builder = ContextPackageBuilder(working_memory_service=wm, retrieval_service=retrieval, structured_memory_service=structured)
    session = await wm.create_session(scope=scoped_user(), conversation_id="conv")
    await wm.update_client_state(
        scope=scoped_user(),
        session_id=session.session_id,
        update=ClientWorkingMemoryUpdate(
            conversation_id="conv",
            selected_record={"type": "meeting", "id": "meeting-1"},
        ),
    )

    package = await builder.build(scope=scoped_user(), session_id=session.session_id, conversation_id="conv", query="Move this meeting to Friday.")

    assert package.routing_decision.selected_route == MemoryRoute.ACTION_REQUIRES_APPROVAL
    assert package.proposed_action.requires_approval is True
    assert package.proposed_action.target_record_type == "meeting"
    assert retrieval.calls == []


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
    assert model_context["structured_memory_status"] == "integrated"


def test_citation_relationships_survive_context_truncation(monkeypatch):
    from app.rag.context_package import ContextPackageBuilder, ContextItem

    monkeypatch.setattr("app.core.config.settings.RAG_CONTEXT_PACKAGE_MAX_ITEMS", 1)
    kept = ContextPackageBuilder()._filter_citations_for_items(
        [{"citation_id": "c1"}, {"citation_id": "c2"}],
        [ContextItem(authority_type=AuthorityType.RAG_DOCUMENT, content="a", citation_id="c2")],
    )

    assert kept == [{"citation_id": "c2"}]
