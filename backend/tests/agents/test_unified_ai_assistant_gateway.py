from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints import ai_assistant
from app.api.v1.endpoints.ai_assistant import UnifiedAssistantChatRequest
from app.api.dependencies import get_current_user
from app.rag.working_memory import WorkingMemorySnapshot


def test_unified_request_rejects_frontend_authority_fields():
    with pytest.raises(ValidationError):
        UnifiedAssistantChatRequest.model_validate(
            {
                "message": "What needs attention today?",
                "idempotency_key": "retry-key-1",
                "company_id": "forged-company",
                "workspace": {"page": "dashboard", "role": "admin"},
            }
        )


class FakeWorkingMemory:
    def __init__(self, existing=None):
        self.existing = existing
        self.created = False
        self.requested_session_id = None

    async def get_session(self, *, scope, session_id, conversation_id):
        self.requested_session_id = session_id
        return self.existing

    async def create_session(self, *, scope, conversation_id):
        self.created = True
        return WorkingMemorySnapshot(
            session_id="server-issued-session",
            conversation_id=conversation_id,
            company_id=scope.company_id,
            tenant_id=scope.tenant_id,
            user_id=scope.user_id,
            created_at=ai_assistant.datetime.utcnow(),
            updated_at=ai_assistant.datetime.utcnow(),
            expires_at=ai_assistant.datetime.utcnow(),
        )


@pytest.mark.asyncio
async def test_gateway_reuses_valid_server_owned_session(monkeypatch):
    scope = ai_assistant.RAGScope(company_id="tenant-1", tenant_id="tenant-1", user_id="user-1", role="employee")
    existing = WorkingMemorySnapshot(
        session_id="existing-session",
        conversation_id="conversation-1",
        company_id="tenant-1",
        tenant_id="tenant-1",
        user_id="user-1",
        created_at=ai_assistant.datetime.utcnow(),
        updated_at=ai_assistant.datetime.utcnow(),
        expires_at=ai_assistant.datetime.utcnow(),
    )
    fake = FakeWorkingMemory(existing=existing)
    monkeypatch.setattr(ai_assistant, "working_memory_service", fake)

    session = await ai_assistant._get_or_create_session(scope=scope, conversation_id="conversation-1", session_id="existing-session")

    assert session.session_id == "existing-session"
    assert fake.created is False


@pytest.mark.asyncio
async def test_gateway_creates_replacement_when_session_missing(monkeypatch):
    scope = ai_assistant.RAGScope(company_id="tenant-1", tenant_id="tenant-1", user_id="user-1", role="employee")
    fake = FakeWorkingMemory(existing=None)
    monkeypatch.setattr(ai_assistant, "working_memory_service", fake)

    session = await ai_assistant._get_or_create_session(scope=scope, conversation_id="conversation-1", session_id="expired-session")

    assert fake.requested_session_id == "expired-session"
    assert fake.created is True
    assert session.session_id == "server-issued-session"


@pytest.mark.asyncio
async def test_conversation_reference_rejects_wrong_owner(monkeypatch):
    class FakeConversation:
        company_id = "tenant-2"
        user_id = "user-2"

    async def fake_find_one(*args, **kwargs):
        return FakeConversation()

    monkeypatch.setattr(ai_assistant.AIConversation, "find_one", fake_find_one)
    user = type("User", (), {"company_id": "tenant-1", "id": "user-1", "role": "employee"})()

    with pytest.raises(HTTPException) as exc:
        await ai_assistant._get_or_create_conversation(current_user=user, conversation_id="stolen-conversation")

    assert exc.value.status_code == 403


def test_unified_endpoint_routes_arbitrary_employee_task_question_to_executive(monkeypatch):
    class FakeRegistry:
        async def get_definition(self, *, agent_id, version):
            assert agent_id == "executive_operations_agent"
            assert version == "v1"
            return type(
                "Definition",
                (),
                {
                    "agent_id": agent_id,
                    "version": version,
                    "allowed_roles": ["admin"],
                    "allowed_trigger_types": ["manual"],
                    "required_scopes": ["tenant_id"],
                    "allowed_tool_ids": [],
                    "forbidden_tool_ids": [],
                    "retired_at": None,
                    "enabled": True,
                },
            )()

    class FakeOrchestrator:
        registry = FakeRegistry()

        def _authorize_definition(self, *, current_user, definition, payload):
            assert payload.agent_id == definition.agent_id

    class FakeExecutiveService:
        async def chat(self, **kwargs):
            assert kwargs["message"] == "How many tasks are assigned to Neha Sharma?"
            return {
                "success": True,
                "answer": "Neha Sharma has 3 assigned tasks from SynTask data.",
                "usage": {"model": "llama-3.1-70b-versatile", "steps_used": 2},
                "tool_calls_summary": [
                    {"tool": "search_employees", "step": 1, "duration_ms": 1.0, "has_error": False},
                    {"tool": "get_user_tasks", "step": 1, "duration_ms": 2.0, "has_error": False},
                ],
            }

    class FakeConversation:
        conversation_id = "conversation-1"
        messages = []

        async def save(self):
            return None

    class FakeSession:
        session_id = "session-1"

    async def fake_conversation(**kwargs):
        return FakeConversation()

    async def fake_session(**kwargs):
        return FakeSession()

    async def fake_update_client_state(**kwargs):
        return None

    async def fake_memory(**kwargs):
        return {"enabled": True, "memories": [], "policy": {}}

    user = type(
        "User",
        (),
        {
            "id": "user-1",
            "company_id": "tenant-1",
            "role": type("Role", (), {"value": "admin"})(),
            "modules": ["tasks", "hr", "sales", "projects", "finance"],
            "department_id": None,
        },
    )()

    monkeypatch.setattr(ai_assistant.settings, "AGENT_PLATFORM_ENABLED", True)
    monkeypatch.setattr(ai_assistant, "orchestrator", FakeOrchestrator())
    monkeypatch.setattr(ai_assistant, "executive_agent_service", FakeExecutiveService())
    monkeypatch.setattr(ai_assistant, "_get_or_create_conversation", fake_conversation)
    monkeypatch.setattr(ai_assistant, "_get_or_create_session", fake_session)
    monkeypatch.setattr(ai_assistant, "_personal_memory_state", fake_memory)
    monkeypatch.setattr(ai_assistant.working_memory_service, "update_client_state", fake_update_client_state)

    test_app = FastAPI()
    test_app.include_router(ai_assistant.router, prefix="/api/v1/ai-assistant")
    test_app.dependency_overrides[get_current_user] = lambda: user

    response = TestClient(test_app).post(
        "/api/v1/ai-assistant/chat",
        json={
            "message": "How many tasks are assigned to Neha Sharma?",
            "idempotency_key": "idem-neha-tasks",
            "workspace": {},
            "preferences": {},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["agent"]["agent_id"] == "executive_operations_agent"
    assert body["state"] == "COMPLETED"
    assert [item["tool"] for item in body["usage"]["tool_calls_summary"]] == ["search_employees", "get_user_tasks"]
    assert "Neha Sharma has 3 assigned tasks" in body["answer"]["summary"]
