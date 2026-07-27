from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.endpoints import ai_assistant
from app.api.v1.endpoints.ai_assistant import UnifiedAssistantChatRequest
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
