from __future__ import annotations

import json

import pytest

from app.ai.providers.groq import GroqProvider
from app.ai.providers.openai import OpenAIProvider
from app.core.config import settings


class DummyResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {
            "model": "test-model",
            "choices": [{"message": {"content": '{"summary":"ok"}'}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }


class CaptureClient:
    payloads: list[dict] = []

    def __init__(self, *args, **kwargs):
        return None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url, *, headers, content):
        self.payloads.append({"url": url, "headers": headers, "content": json.loads(content)})
        return DummyResponse()


@pytest.fixture(autouse=True)
def capture_http(monkeypatch):
    CaptureClient.payloads = []
    monkeypatch.setattr("httpx.AsyncClient", CaptureClient)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "openai-test-key")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "groq-test-key")
    yield CaptureClient.payloads


def governed_context():
    return {
        "context_package_id": "ctx-1",
        "identity_context": {"tenant_id": "tenant-1", "user_id": "user-1", "role": "manager"},
        "permission_context": {"allowed_agents": ["project_agent"], "prohibited_operations": ["send_email"]},
        "structured_memory": [{"record_type": "project", "record_id": "project-1", "fields": {"status": "active"}}],
        "approved_rag_evidence": [{"citation_id": "cite-1", "content": "Approved policy excerpt"}],
        "unsafe": {"external_model_allowed": False, "content": "must not leave server"},
        "provider_credentials": {"api_key": "should-redact"},
        "raw_prompt": "should-redact",
    }


@pytest.mark.asyncio
async def test_openai_provider_serializes_governed_context_without_protected_fields(capture_http):
    await OpenAIProvider().generate("What needs attention?", governed_context(), {})

    messages = capture_http[0]["content"]["messages"]
    context_message = messages[1]["content"]

    assert "SYSTEM GOVERNANCE" in context_message
    assert "ctx-1" in context_message
    assert "project-1" in context_message
    assert "cite-1" in context_message
    assert "must not leave server" not in context_message
    assert "should-redact" not in context_message
    assert messages[2] == {"role": "user", "content": "What needs attention?"}


@pytest.mark.asyncio
async def test_groq_provider_serializes_same_governed_context_envelope(capture_http):
    await GroqProvider().generate("Draft update", governed_context(), {})

    messages = capture_http[0]["content"]["messages"]
    context_message = messages[1]["content"]

    assert "SYSTEM GOVERNANCE" in context_message
    assert "permission_context" in context_message
    assert "send_email" in context_message
    assert "Approved policy excerpt" in context_message
    assert "provider_credentials" not in context_message
