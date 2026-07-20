import hashlib
import hmac

import httpx
import pytest
from fastapi import FastAPI

from app.integrations.meta import api as meta_api


def _signature(body: bytes) -> str:
    return "sha256=" + hmac.new(b"app-secret", body, hashlib.sha256).hexdigest()


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )


@pytest.fixture
def app(monkeypatch):
    app = FastAPI()
    app.include_router(meta_api.router, prefix="/api/v1/integrations/meta")
    monkeypatch.setattr(meta_api.settings, "META_INTEGRATION_ENABLED", True)
    monkeypatch.setattr(meta_api.settings, "META_APP_SECRET", "app-secret")
    monkeypatch.setattr(meta_api.settings, "META_VERIFY_TOKEN", "verify-token")
    return app


@pytest.mark.asyncio
async def test_get_verification_returns_the_exact_challenge(app):
    async with _client(app) as client:
        response = await client.get(
            "/api/v1/integrations/meta/webhook",
            params={"hub.mode": "subscribe", "hub.verify_token": "verify-token", "hub.challenge": "exact-value"},
        )

    assert response.status_code == 200
    assert response.text == "exact-value"


@pytest.mark.asyncio
async def test_invalid_signature_is_rejected_before_ingestion(app, monkeypatch):
    async def fail_ingest(*args, **kwargs):
        raise AssertionError("invalid requests must not reach persistence")

    monkeypatch.setattr(meta_api.webhook_service, "ingest", fail_ingest)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/integrations/meta/webhook",
            content=b'{"entry":[]}',
            headers={"X-Hub-Signature-256": "sha256=wrong"},
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_oversize_body_is_rejected_before_signature_or_ingestion(app, monkeypatch):
    monkeypatch.setattr(meta_api, "MAX_WEBHOOK_BODY_BYTES", 3)
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/integrations/meta/webhook",
            content=b"1234",
            headers={"X-Hub-Signature-256": _signature(b"1234")},
        )

    assert response.status_code == 413


@pytest.mark.asyncio
async def test_valid_webhook_acknowledges_quickly_after_service_ingestion(app, monkeypatch):
    received = {}

    async def ingest(payload, *, raw_body, correlation_id):
        received.update(payload=payload, raw_body=raw_body, correlation_id=correlation_id)
        return meta_api.WebhookIngestResult(inserted=1)

    monkeypatch.setattr(meta_api.webhook_service, "ingest", ingest)
    body = b'{"entry":[]}'
    async with _client(app) as client:
        response = await client.post(
            "/api/v1/integrations/meta/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _signature(body)},
        )

    assert response.status_code == 200
    assert response.json() == {"status": "accepted"}
    assert received["raw_body"] == body
    assert received["payload"] == {"entry": []}
    assert received["correlation_id"]
