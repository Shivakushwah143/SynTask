from __future__ import annotations

import pytest

from app.api.v1.endpoints import ai


class DummyRole:
    value = "employee"


class DummyUser:
    id = "user-1"
    company_id = "tenant-1"
    role = DummyRole()


@pytest.mark.asyncio
async def test_legacy_ai_usage_telemetry_is_sanitized(monkeypatch):
    calls = []

    async def fake_log_interaction(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(ai.AILogger, "log_interaction", fake_log_interaction)

    await ai._log_legacy_ai_usage(current_user=DummyUser(), feature="chat")

    assert calls[0]["feature"] == "legacy_ai:chat"
    assert calls[0]["status"] == "deprecated_route_used"
    assert calls[0]["prompt"] is None
    assert calls[0]["raw_response"] is None
    assert calls[0]["context"] == {
        "route": "/api/v1/ai/chat",
        "migration_status": "legacy_active",
        "fallback_reason": "not_migrated",
        "safe_for_logs": True,
    }
