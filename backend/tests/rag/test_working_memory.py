from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.rag.permissions import RAGScope
from app.rag.working_memory import (
    ClientWorkingMemoryUpdate,
    ServerWorkingMemoryUpdate,
    WorkingMemoryConflict,
    WorkingMemoryUnavailable,
    WorkingMemoryService,
    sanitize_mapping,
    working_memory_key,
)


class FakeClock:
    def __init__(self):
        self.value = datetime(2026, 7, 20, tzinfo=timezone.utc)

    def now(self):
        return self.value

    def advance(self, seconds: int):
        self.value += timedelta(seconds=seconds)


class FakeRedis:
    def __init__(self, fail=False):
        self.store = {}
        self.ttls = {}
        self.fail = fail

    async def setex(self, key, ttl, value):
        if self.fail:
            raise RuntimeError("redis down")
        self.store[key] = value
        self.ttls[key] = ttl

    async def get(self, key):
        if self.fail:
            raise RuntimeError("redis down")
        return self.store.get(key)

    async def expire(self, key, ttl):
        if self.fail:
            raise RuntimeError("redis down")
        self.ttls[key] = ttl

    async def delete(self, key):
        if self.fail:
            raise RuntimeError("redis down")
        self.store.pop(key, None)


def scope(company="c1", user="u1", project_id=None):
    return RAGScope(company_id=company, tenant_id=company, user_id=user, role="admin", project_id=project_id)


@pytest.mark.asyncio
async def test_server_generated_session_identity_and_scoped_key(monkeypatch):
    clock = FakeClock()
    redis = FakeRedis()
    monkeypatch.setattr("app.core.config.settings.RAG_WORKING_MEMORY_ABSOLUTE_TTL_SECONDS", 28800)
    service = WorkingMemoryService(redis_client=redis, clock=clock)

    snapshot = await service.create_session(scope=scope(), conversation_id="conv-1")

    assert snapshot.session_id
    assert "conv-1" not in working_memory_key(scope(), snapshot.session_id)
    assert working_memory_key(scope(), snapshot.session_id) in redis.store
    assert snapshot.company_id == "c1"
    assert snapshot.user_id == "u1"


@pytest.mark.asyncio
async def test_forged_and_cross_owner_session_access_rejected():
    clock = FakeClock()
    redis = FakeRedis()
    service = WorkingMemoryService(redis_client=redis, clock=clock)
    snapshot = await service.create_session(scope=scope(company="tenant-a", user="user-a"), conversation_id="conv")

    assert await service.get_session(scope=scope(company="tenant-a", user="user-a"), session_id=snapshot.session_id, conversation_id="conv")
    assert await service.get_session(scope=scope(company="tenant-b", user="user-a"), session_id=snapshot.session_id, conversation_id="conv") is None
    assert await service.get_session(scope=scope(company="tenant-a", user="user-b"), session_id=snapshot.session_id, conversation_id="conv") is None
    with pytest.raises(HTTPException):
        await service.get_session(scope=scope(company="tenant-a", user="user-a"), session_id=snapshot.session_id, conversation_id="other")


@pytest.mark.asyncio
async def test_idle_ttl_refresh_and_absolute_ttl_not_extended(monkeypatch):
    clock = FakeClock()
    redis = FakeRedis()
    monkeypatch.setattr("app.core.config.settings.RAG_WORKING_MEMORY_IDLE_TTL_SECONDS", 1800)
    monkeypatch.setattr("app.core.config.settings.RAG_WORKING_MEMORY_ABSOLUTE_TTL_SECONDS", 28800)
    service = WorkingMemoryService(redis_client=redis, clock=clock)
    snapshot = await service.create_session(scope=scope(), conversation_id="conv")

    clock.advance(28700)
    await service.get_session(scope=scope(), session_id=snapshot.session_id, conversation_id="conv")

    assert redis.ttls[working_memory_key(scope(), snapshot.session_id)] <= 100


@pytest.mark.asyncio
async def test_explicit_delete_and_expired_session_rejection(monkeypatch):
    clock = FakeClock()
    redis = FakeRedis()
    monkeypatch.setattr("app.core.config.settings.RAG_WORKING_MEMORY_ABSOLUTE_TTL_SECONDS", 10)
    service = WorkingMemoryService(redis_client=redis, clock=clock)
    snapshot = await service.create_session(scope=scope(), conversation_id="conv")
    await service.delete_session(scope=scope(), session_id=snapshot.session_id, conversation_id="conv")
    assert await service.get_session(scope=scope(), session_id=snapshot.session_id, conversation_id="conv") is None

    second = await service.create_session(scope=scope(), conversation_id="conv")
    clock.advance(11)
    assert await service.get_session(scope=scope(), session_id=second.session_id, conversation_id="conv") is None


@pytest.mark.asyncio
async def test_optimistic_version_prevents_stale_update():
    service = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    snapshot = await service.create_session(scope=scope(), conversation_id="conv")
    await service.update_client_state(
        scope=scope(),
        session_id=snapshot.session_id,
        update=ClientWorkingMemoryUpdate(conversation_id="conv", expected_version=1, message={"role": "user", "content": "hello"}),
    )
    with pytest.raises(WorkingMemoryConflict):
        await service.update_client_state(
            scope=scope(),
            session_id=snapshot.session_id,
            update=ClientWorkingMemoryUpdate(conversation_id="conv", expected_version=1, message={"role": "user", "content": "stale"}),
        )


@pytest.mark.asyncio
async def test_deterministic_truncation_and_sensitive_tool_output_redaction(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_WORKING_MEMORY_MAX_MESSAGES", 2)
    monkeypatch.setattr("app.core.config.settings.RAG_WORKING_MEMORY_MAX_TOOL_OUTPUTS", 1)
    service = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    snapshot = await service.create_session(scope=scope(), conversation_id="conv")
    for item in ("one", "two", "three"):
        snapshot = await service.update_client_state(
            scope=scope(),
            session_id=snapshot.session_id,
            update=ClientWorkingMemoryUpdate(conversation_id="conv", message={"content": item}),
        )
    snapshot = await service.update_server_state(
        scope=scope(),
        session_id=snapshot.session_id,
        update=ServerWorkingMemoryUpdate(conversation_id="conv", tool_output={"result": "contains API_KEY abc"}),
    )

    assert [m["content"] for m in snapshot.messages] == ["two", "three"]
    assert snapshot.recent_tool_outputs == [{"result": "[redacted]"}]


def test_client_safe_sanitizer_drops_authoritative_fields():
    sanitized = sanitize_mapping(
        {"company_id": "evil", "tenant_id": "evil", "authorization": "admin", "business_facts": {"status": "won"}, "safe": "ok"},
        limit=50,
    )
    assert sanitized == {"safe": "ok"}


@pytest.mark.asyncio
async def test_missing_tenant_scope_fails_closed():
    service = WorkingMemoryService(redis_client=FakeRedis(), clock=FakeClock())
    with pytest.raises(HTTPException):
        await service.create_session(scope=RAGScope(company_id="", tenant_id="", user_id="u1", role="admin"), conversation_id="conv")


@pytest.mark.asyncio
async def test_redis_outage_reports_working_memory_unavailable():
    service = WorkingMemoryService(redis_client=FakeRedis(fail=True), clock=FakeClock())
    with pytest.raises(WorkingMemoryUnavailable):
        await service.create_session(scope=scope(), conversation_id="conv")
