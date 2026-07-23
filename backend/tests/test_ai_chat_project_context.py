from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.ai.role_engine import RoleResolution
from app.ai.service import AIService
from app.models.project import ProjectStatus
from app.models.user import UserRole
from app.schemas.ai import AIChatRequest


def _resolution() -> RoleResolution:
    return RoleResolution(
        role_key="admin",
        prompt_version="1.0",
        fallback_chain=[],
        fallback_used=False,
        fallback_reason=None,
        access_scope="company",
    )


def test_current_projects_question_intent_detected():
    assert AIService._is_current_projects_question("i want to know how projects which are running currently")
    assert AIService._is_current_projects_question("show active projects")
    assert not AIService._is_current_projects_question("hello what is your work")


@pytest.mark.asyncio
async def test_current_projects_chat_response_uses_verified_project_context(monkeypatch):
    service = AIService(provider=SimpleNamespace())

    async def fake_projects(current_user, limit=10):
        return [
            {
                "id": "mongo-1",
                "project_id": "PROJ-001",
                "name": "Client Portal",
                "key": "PORTAL",
                "status": "active",
                "type": "software",
                "delivery_date": "2026-08-01T00:00:00+00:00",
                "lead_id": "lead-1",
            }
        ]

    monkeypatch.setattr(service, "_list_visible_current_projects", fake_projects)
    response = await service._build_current_projects_chat_response(
        current_user=SimpleNamespace(id="admin-1", company_id="company-1", role=UserRole.ADMIN),
        request=AIChatRequest(message="which projects are running currently"),
        context={"conversation": {"conversation_id": "conv-1"}},
        resolution=_resolution(),
    )

    assert response.source == "deterministic"
    assert response.provider == "syntask"
    assert response.actions == []
    assert "Client Portal" in response.message
    assert "Source: verified projects collection" in response.message
    assert response.context["verified_project_context"]["read_only"] is True
    assert response.context["verified_project_context"]["projects"][0]["project_id"] == "PROJ-001"


@pytest.mark.asyncio
async def test_employee_project_lookup_is_tenant_and_visibility_filtered(monkeypatch):
    captured = {}

    class FakeTaskFind:
        async def to_list(self):
            return [SimpleNamespace(project_id="PROJ-002")]

    class FakeProjectFind:
        def sort(self, *fields):
            captured["sort"] = fields
            return self

        def limit(self, value):
            captured["limit"] = value
            return self

        async def to_list(self):
            return [
                SimpleNamespace(
                    id="mongo-2",
                    project_id="PROJ-002",
                    name="Internal Ops",
                    key="OPS",
                    status=ProjectStatus.EXECUTION,
                    type="operations",
                    delivery_date=datetime(2026, 8, 3, tzinfo=timezone.utc),
                    lead_id="lead-2",
                )
            ]

    class FakeTask:
        @staticmethod
        def find(query):
            captured["task_query"] = query
            return FakeTaskFind()

    class FakeProject:
        @staticmethod
        def find(query):
            captured["project_query"] = query
            return FakeProjectFind()

    monkeypatch.setattr("app.ai.service.Task", FakeTask)
    monkeypatch.setattr("app.ai.service.Project", FakeProject)

    service = AIService(provider=SimpleNamespace())
    projects = await service._list_visible_current_projects(
        SimpleNamespace(id="employee-1", company_id="company-1", role=UserRole.EMPLOYEE)
    )

    assert captured["task_query"] == {"company_id": "company-1", "assigned_to": "employee-1"}
    assert captured["project_query"]["company_id"] == "company-1"
    assert "completed" not in captured["project_query"]["status"]["$in"]
    assert captured["project_query"]["$or"] == [
        {"team_member_ids": "employee-1"},
        {"project_id": {"$in": ["PROJ-002"]}},
        {"_id": {"$in": ["PROJ-002"]}},
    ]
    assert projects[0]["status"] == "execution"
