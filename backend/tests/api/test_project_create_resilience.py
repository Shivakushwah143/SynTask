from __future__ import annotations

import os
from types import SimpleNamespace

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

import pytest
from bson import ObjectId

from fastapi import HTTPException

from app.api.v1.endpoints.projects import project_create
from app.models.user import UserRole
from app.services import project_service


class DummyProject:
    project_id = None
    company_id = None
    key = None
    status = SimpleNamespace(value="active")

    saved = None

    def __init__(self, **data):
        self.id = ObjectId()
        self.name = data["name"]
        self.key = data["key"]
        self.project_id = data["project_id"]
        self.description = data.get("description")
        self.company_id = data["company_id"]
        self.client_id = data.get("client_id")
        self.type = SimpleNamespace(value=data.get("type", "software"))
        self.lead_id = data.get("lead_id")
        self.assigned_to = data.get("assigned_to")
        self.status = SimpleNamespace(value="active")
        self.updated_at = SimpleNamespace(isoformat=lambda: "2026-07-10T00:00:00")
        self.created_at = self.updated_at

    @classmethod
    async def find_one(cls, *args, **kwargs):
        return None

    @classmethod
    async def get(cls, project_id):
        return cls.saved

    async def insert(self):
        return self

    async def save(self):
        DummyProject.saved = self
        return self


class DummyResult:
    matched_count = 1
    modified_count = 1


class DummyCollection:
    async def update_one(self, *args, **kwargs):
        return DummyResult()

    async def find_one(self, *args, **kwargs):
        return {"project_id": "PROJ-001"}


class DummyDB(dict):
    def __getitem__(self, item):
        return DummyCollection()


@pytest.mark.asyncio
async def test_create_project_rejects_missing_phase1_owner(monkeypatch):
    monkeypatch.setattr(project_create, "Project", DummyProject)
    monkeypatch.setattr(project_service, "Project", DummyProject)
    monkeypatch.setattr(project_create, "ProjectType", lambda value: SimpleNamespace(value=value))
    async def noop(*args, **kwargs):
        return None
    monkeypatch.setattr(project_create, "cache_delete", noop)
    monkeypatch.setattr(project_create, "cache_delete_pattern", noop)
    monkeypatch.setattr("app.core.database.get_database", lambda: DummyDB())
    monkeypatch.setattr(project_create, "publish_event", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("redis down")))
    monkeypatch.setattr(project_create, "User", SimpleNamespace(get=lambda *args, **kwargs: None))
    async def project_type_stub(*_args, **_kwargs):
        return "software"
    monkeypatch.setattr(project_service.ProjectService, "ensure_project_type", project_type_stub)

    current_user = SimpleNamespace(company_id="company-1", id="user-1", role=UserRole.ADMIN)

    with pytest.raises(HTTPException) as exc:
        await project_create.create_project(
            name="Project One",
            key="PROJ",
            description="Example",
            type="software",
            client_id=None,
            lead_id=None,
            assigned_to=None,
            assigned_user_ids=None,
            start_date=None,
            delivery_date=None,
            priority="medium",
            project_id="PROJ-001",
            current_user=current_user,
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "Project owner is required"
