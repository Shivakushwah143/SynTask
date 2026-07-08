from __future__ import annotations

import json
import os
from types import SimpleNamespace
from urllib import error as urllib_error

import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from app.services.notification_service import BrevoEmailProvider, DeliveryResult, NotificationService


@pytest.mark.asyncio
async def test_brevo_provider_success(monkeypatch) -> None:
    provider = BrevoEmailProvider()
    provider.api_key = "brevo-key"
    provider.sender_email = "sales@synTask.com"

    class DummyResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps({"messageId": "msg-123"}).encode("utf-8")

    def fake_urlopen(req, timeout):
        return DummyResponse()

    monkeypatch.setattr("app.services.notification_service.urllib_request.urlopen", fake_urlopen)

    result = await provider.send_email(
        to_email="lead@example.com",
        subject="Hello",
        html="<p>Hello</p>",
        text="Hello",
        idempotency_key="abc",
    )

    assert result.success is True
    assert result.message_id == "msg-123"


@pytest.mark.asyncio
async def test_brevo_provider_retry_and_failure(monkeypatch) -> None:
    provider = BrevoEmailProvider()
    provider.api_key = "brevo-key"
    provider.sender_email = "sales@synTask.com"
    provider.retry_attempts = 2

    attempts = {"count": 0}

    def fake_urlopen(req, timeout):
        attempts["count"] += 1
        raise urllib_error.URLError("temporary failure")

    monkeypatch.setattr("app.services.notification_service.urllib_request.urlopen", fake_urlopen)

    result = await provider.send_email(
        to_email="lead@example.com",
        subject="Hello",
        html="<p>Hello</p>",
        text="Hello",
        idempotency_key="xyz",
    )

    assert result.success is False
    assert result.status == "failed"
    assert attempts["count"] == 2


@pytest.mark.asyncio
async def test_notification_service_records_delivery(monkeypatch) -> None:
    service = NotificationService(
        email_provider=SimpleNamespace(
            send_email=lambda **kwargs: DeliveryResult(provider="brevo", success=True, status="delivered", message_id="msg-1", raw_response={"ok": True}),
        )
    )

    async def fake_notify_salesperson(**kwargs):
        return SimpleNamespace(id="notif-1", model_dump=lambda: {"id": "notif-1"}, email_sent=False, email_sent_at=None, metadata={})

    async def fake_audit(**kwargs):
        return SimpleNamespace(model_dump=lambda: kwargs)

    async def fake_timeline(**kwargs):
        return SimpleNamespace(model_dump=lambda: kwargs)

    monkeypatch.setattr(service, "notify_salesperson", fake_notify_salesperson)
    monkeypatch.setattr(service, "record_audit_event", fake_audit)
    monkeypatch.setattr(service, "record_timeline_event", fake_timeline)

    result = await service.send_sales_email(
        company_id="company-1",
        lead_id="lead-1",
        recipient_email="lead@example.com",
        subject="Next step",
        html="<p>Next step</p>",
        text="Next step",
        actor_id="user-1",
        actor_name="Alex Sales",
        related_user_id="sales-1",
    )

    assert result["delivery"]["success"] is True
    assert result["notification_id"] == "notif-1"
