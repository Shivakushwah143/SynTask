from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from types import SimpleNamespace

from app import main as main_module
from app.core import database as database_module


@pytest.fixture
def client(monkeypatch):
    async def fake_init_db():
        return None

    async def fake_rebuild_all_ancestors():
        return None

    monkeypatch.setattr(main_module, "init_db", fake_init_db)
    monkeypatch.setattr(main_module, "rebuild_all_ancestors", fake_rebuild_all_ancestors)
    main_module.app.state.db_ready = False
    with TestClient(main_module.app) as test_client:
        yield test_client


def test_health_reports_healthy_when_db_ready(client):
    main_module.app.state.db_ready = True

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "version": main_module.settings.VERSION,
        "environment": main_module.settings.ENVIRONMENT,
        "database": "connected",
    }


def test_health_reports_degraded_when_db_not_ready(client):
    main_module.app.state.db_ready = False

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "version": main_module.settings.VERSION,
        "environment": main_module.settings.ENVIRONMENT,
        "database": "unavailable",
    }


@pytest.mark.asyncio
async def test_startup_marks_db_ready_on_success(monkeypatch):
    calls = []

    async def fake_init_db():
        calls.append("init")

    async def fake_rebuild_all_ancestors():
        calls.append("rebuild")

    def fake_create_task(coro):
        coro.close()
        return SimpleNamespace()

    monkeypatch.setattr(main_module, "init_db", fake_init_db)
    monkeypatch.setattr(main_module, "rebuild_all_ancestors", fake_rebuild_all_ancestors)
    monkeypatch.setattr("asyncio.create_task", fake_create_task)
    main_module.app.state.db_ready = False

    await main_module.startup_event()

    assert calls == ["init", "rebuild"]
    assert main_module.app.state.db_ready is True


@pytest.mark.asyncio
async def test_startup_marks_db_not_ready_on_non_production_db_failure(monkeypatch):
    scheduled_tasks = []

    async def failing_init_db():
        raise RuntimeError("mongo down")

    async def fake_rebuild_all_ancestors():
        return None

    def fake_create_task(coro):
        scheduled_tasks.append(coro)
        coro.close()
        return SimpleNamespace()

    monkeypatch.setattr(main_module, "init_db", failing_init_db)
    monkeypatch.setattr(main_module, "rebuild_all_ancestors", fake_rebuild_all_ancestors)
    monkeypatch.setattr(main_module.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr("asyncio.create_task", fake_create_task)
    main_module.app.state.db_ready = True

    await main_module.startup_event()

    assert main_module.app.state.db_ready is False
    assert scheduled_tasks == []


def test_api_returns_service_unavailable_when_database_not_ready(client):
    main_module.app.state.db_ready = False

    response = client.get("/api/v1/calendar/events?start_date=2026-06-29&end_date=2026-08-02&view_type=my_calendar")

    assert response.status_code == 503
    assert response.json() == {
        "success": False,
        "message": "Database unavailable. Check MongoDB connection and restart the backend.",
    }


@pytest.mark.asyncio
async def test_init_db_reraises_non_production_connection_failure(monkeypatch):
    class BrokenAdmin:
        async def command(self, _command):
            raise RuntimeError("mongo down")

    class BrokenClient:
        admin = BrokenAdmin()

        def close(self):
            return None

    monkeypatch.setattr(database_module.settings, "MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setattr(database_module.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(database_module, "AsyncIOMotorClient", lambda *args, **kwargs: BrokenClient())

    with pytest.raises(RuntimeError, match="mongo down"):
        await database_module.init_db()
