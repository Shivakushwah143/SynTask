from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
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
    modules = ["task"]


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

