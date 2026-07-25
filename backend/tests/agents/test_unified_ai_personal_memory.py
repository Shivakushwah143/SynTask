from __future__ import annotations

import pytest

from app.api.v1.endpoints import ai_assistant


class DummyUser:
    id = "user-1"
    company_id = "tenant-1"
    role = "employee"


class DummyMemory:
    id = "memory-1"
    company_id = "tenant-1"
    user_id = "user-1"
    title = "Response detail"
    content = "Use concise summaries"
    memory_type = "user_preference"
    source = "user_controlled_ai_settings"
    metadata = {"preference_key": "response_detail", "source_type": "user_provided", "external_model_allowed": True}

    class _Date:
        def isoformat(self):
            return "2026-07-25T00:00:00"

    created_at = _Date()
    updated_at = _Date()


class DummyQuery:
    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self):
        return [DummyMemory()]


def test_personal_memory_rejects_sensitive_or_profiling_terms():
    assert ai_assistant._contains_prohibited_memory("salary preference") is True
    assert ai_assistant._contains_prohibited_memory("response detail", "Use concise summaries", "response_detail") is False


@pytest.mark.asyncio
async def test_personal_memory_state_returns_only_user_owned_preferences_when_enabled(monkeypatch):
    async def fake_setting(*, current_user):
        return None

    class FakeUserMemory:
        @staticmethod
        def find(query):
            assert query["company_id"] == "tenant-1"
            assert query["user_id"] == "user-1"
            assert query["memory_type"] == "user_preference"
            return DummyQuery()

    monkeypatch.setattr(ai_assistant, "_memory_setting", fake_setting)
    monkeypatch.setattr(ai_assistant, "UserMemory", FakeUserMemory)

    state = await ai_assistant._personal_memory_state(current_user=DummyUser())

    assert state["enabled"] is True
    assert state["memories"][0]["memory_id"] == "memory-1"
    assert state["memories"][0]["source_type"] == "user_provided"


@pytest.mark.asyncio
async def test_personal_memory_state_omits_memories_when_disabled(monkeypatch):
    class DisabledSetting:
        content = "disabled"
        metadata = {"enabled": False}

    async def fake_setting(*, current_user):
        return DisabledSetting()

    monkeypatch.setattr(ai_assistant, "_memory_setting", fake_setting)

    state = await ai_assistant._personal_memory_state(current_user=DummyUser())

    assert state["enabled"] is False
    assert state["memories"] == []
