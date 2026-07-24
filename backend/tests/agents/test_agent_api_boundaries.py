from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.agents.schemas import AgentRunResponse
from app.main import app
from app.models.user import UserRole, UserStatus


class FakeUser:
    id = "user-1"
    email = "user@example.com"
    first_name = "User"
    last_name = "Test"
    role = UserRole.ADMIN
    status = UserStatus.ACTIVE
    company_id = "tenant-a"
    department_id = None
    modules = ["task", "ai_agents"]


async def fake_current_user():
    return FakeUser()


def test_agent_platform_endpoints_feature_flagged(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.AGENT_PLATFORM_ENABLED", False)
    app.dependency_overrides[get_current_user] = fake_current_user
    try:
        response = TestClient(app).get("/api/v1/agents/definitions")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"] == "Agent Platform is disabled"


def test_no_generic_run_state_update_endpoint_exposed(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.AGENT_PLATFORM_ENABLED", False)
    app.dependency_overrides[get_current_user] = fake_current_user
    try:
        response = TestClient(app).patch("/api/v1/agents/runs/run-1", json={"state": "APPROVED"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 405


def test_project_agent_endpoint_feature_flagged(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.AGENT_PLATFORM_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.PROJECT_AGENT_ENABLED", False)
    app.dependency_overrides[get_current_user] = fake_current_user
    try:
        response = TestClient(app).post(
            "/api/v1/agents/project/runs",
            json={
                "project_id": "PROJ-1",
                "operation": "project_summary",
                "user_request": "Summarize this project",
                "idempotency_key": "idempotent-1",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"] == "Project Agent is disabled"


def test_project_agent_endpoint_resolves_scope_before_orchestrator(monkeypatch):
    calls = []

    class FakeScope:
        project_id = "PROJ-001"
        department_id = "department-1"

    async def fake_resolve_rag_scope(*, current_user, project_id):
        calls.append(("scope", current_user.company_id, project_id))
        return FakeScope()

    async def fake_validate_project_agent_record_scope(*, current_user, project_id, payload):
        calls.append(("records", current_user.company_id, project_id, payload.selected_record_ids.task_ids))

    async def fake_create_run(*, current_user, payload):
        calls.append(("run", current_user.company_id, payload.agent_id, payload.project_id, payload.query))
        return AgentRunResponse(
            run_id="run-1",
            agent_id=payload.agent_id,
            agent_version=payload.agent_version,
            state="CREATED",
            state_revision=0,
        )

    monkeypatch.setattr("app.core.config.settings.AGENT_PLATFORM_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.PROJECT_AGENT_ENABLED", True)
    monkeypatch.setattr("app.api.v1.endpoints.agents.resolve_rag_scope", fake_resolve_rag_scope)
    monkeypatch.setattr("app.api.v1.endpoints.agents._validate_project_agent_record_scope", fake_validate_project_agent_record_scope)
    monkeypatch.setattr("app.api.v1.endpoints.agents.orchestrator.create_run", fake_create_run)
    app.dependency_overrides[get_current_user] = fake_current_user
    try:
        response = TestClient(app).post(
            "/api/v1/agents/project/runs",
            json={
                "project_id": "PROJ-1",
                "operation": "project_summary",
                "user_request": "Summarize this project",
                "selected_record_ids": {"task_ids": ["task-1"]},
                "session_id": "session-1",
                "conversation_id": "conversation-1",
                "idempotency_key": "idempotent-1",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["agent_id"] == "project_agent"
    assert calls == [
        ("scope", "tenant-a", "PROJ-1"),
        ("records", "tenant-a", "PROJ-001", ["task-1"]),
        ("run", "tenant-a", "project_agent", "PROJ-001", "Summarize this project"),
    ]


def test_project_agent_endpoint_rejects_client_tenant_fields(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.AGENT_PLATFORM_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.PROJECT_AGENT_ENABLED", True)
    app.dependency_overrides[get_current_user] = fake_current_user
    try:
        response = TestClient(app).post(
            "/api/v1/agents/project/runs",
            json={
                "project_id": "PROJ-1",
                "operation": "project_summary",
                "user_request": "Summarize this project",
                "idempotency_key": "idempotent-1",
                "tenant_id": "evil-tenant",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_email_draft_endpoint_feature_flagged(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.AGENT_PLATFORM_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.EMAIL_DRAFT_AGENT_ENABLED", False)
    app.dependency_overrides[get_current_user] = fake_current_user
    try:
        response = TestClient(app).post(
            "/api/v1/agents/email-draft/runs",
            json={
                "draft_type": "general",
                "purpose": "Draft a quick internal update",
                "internal_or_external": "internal",
                "idempotency_key": "idempotent-1",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"] == "Email Draft Agent is disabled"


def test_email_draft_endpoint_rejects_client_tenant_fields(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.AGENT_PLATFORM_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.EMAIL_DRAFT_AGENT_ENABLED", True)
    app.dependency_overrides[get_current_user] = fake_current_user
    try:
        response = TestClient(app).post(
            "/api/v1/agents/email-draft/runs",
            json={
                "draft_type": "general",
                "purpose": "Draft a quick internal update",
                "internal_or_external": "internal",
                "idempotency_key": "idempotent-1",
                "tenant_id": "evil-tenant",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_email_draft_endpoint_validates_context_before_orchestrator(monkeypatch):
    calls = []

    async def fake_validate_email_draft_context(*, current_user, payload):
        calls.append(("context", current_user.company_id, payload.draft_type.value, payload.recipient.email))

    async def fake_create_run(*, current_user, payload):
        calls.append(("run", current_user.company_id, payload.agent_id, payload.query, payload.input_payload["internal_or_external"]))
        return AgentRunResponse(
            run_id="run-email-1",
            agent_id=payload.agent_id,
            agent_version=payload.agent_version,
            state="CREATED",
            state_revision=0,
        )

    monkeypatch.setattr("app.core.config.settings.AGENT_PLATFORM_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.EMAIL_DRAFT_AGENT_ENABLED", True)
    monkeypatch.setattr("app.api.v1.endpoints.agents._validate_email_draft_context", fake_validate_email_draft_context)
    monkeypatch.setattr("app.api.v1.endpoints.agents.orchestrator.create_run", fake_create_run)
    app.dependency_overrides[get_current_user] = fake_current_user
    try:
        response = TestClient(app).post(
            "/api/v1/agents/email-draft/runs",
            json={
                "draft_type": "client_update",
                "purpose": "Draft a status update",
                "recipient": {"name": "Client", "email": "client@example.com"},
                "internal_or_external": "external",
                "tone": "professional",
                "language": "en",
                "detail_level": "standard",
                "attachment_names": ["status.pdf"],
                "idempotency_key": "idempotent-1",
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["agent_id"] == "general_email_draft_agent"
    assert calls == [
        ("context", "tenant-a", "client_update", "client@example.com"),
        ("run", "tenant-a", "general_email_draft_agent", "Draft a status update", "external"),
    ]


def test_no_email_send_endpoint_exposed(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.AGENT_PLATFORM_ENABLED", True)
    monkeypatch.setattr("app.core.config.settings.EMAIL_DRAFT_AGENT_ENABLED", True)
    app.dependency_overrides[get_current_user] = fake_current_user
    try:
        response = TestClient(app).post("/api/v1/agents/email-draft/send", json={})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
