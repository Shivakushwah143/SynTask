from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import main as main_module


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

    monkeypatch.setattr(main_module, "init_db", fake_init_db)
    monkeypatch.setattr(main_module, "rebuild_all_ancestors", fake_rebuild_all_ancestors)
    main_module.app.state.db_ready = False

    await main_module.startup_event()

    assert calls == ["init", "rebuild"]
    assert main_module.app.state.db_ready is True


@pytest.mark.asyncio
async def test_startup_marks_db_not_ready_on_non_production_db_failure(monkeypatch):
    async def failing_init_db():
        raise RuntimeError("mongo down")

    async def fake_rebuild_all_ancestors():
        return None

    monkeypatch.setattr(main_module, "init_db", failing_init_db)
    monkeypatch.setattr(main_module, "rebuild_all_ancestors", fake_rebuild_all_ancestors)
    monkeypatch.setattr(main_module.settings, "ENVIRONMENT", "development")
    main_module.app.state.db_ready = True

    await main_module.startup_event()

    assert main_module.app.state.db_ready is False
