"""Public, signed Meta webhook routes."""

import json
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.core.config import settings
from app.integrations.meta.signatures import verify_meta_signature, verify_verify_token
from app.integrations.meta.webhook_service import MetaWebhookService, WebhookIngestResult


MAX_WEBHOOK_BODY_BYTES = 1_048_576
router = APIRouter()
webhook_service = MetaWebhookService()


@router.get("/webhook", response_class=PlainTextResponse)
async def verify_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
):
    if (
        hub_mode != "subscribe"
        or not verify_verify_token(hub_verify_token, settings.META_VERIFY_TOKEN)
        or hub_challenge is None
    ):
        raise HTTPException(status_code=401, detail="Webhook verification failed")
    return hub_challenge


@router.post("/webhook")
async def receive_webhook(request: Request):
    raw_body = await _read_limited_body(request)
    if not verify_meta_signature(
        raw_body,
        request.headers.get("X-Hub-Signature-256"),
        settings.META_APP_SECRET,
    ):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    if not settings.META_INTEGRATION_ENABLED:
        raise HTTPException(status_code=503, detail="Meta integration is disabled")

    try:
        payload = json.loads(raw_body)
    except (TypeError, UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from None
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    result = await webhook_service.ingest(
        payload,
        raw_body=raw_body,
        correlation_id=str(uuid4()),
    )
    if result.inserted:
        return {"status": "accepted"}
    if result.duplicates:
        return {"status": "duplicate"}
    return {"status": "rejected"}


async def _read_limited_body(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_WEBHOOK_BODY_BYTES:
                raise HTTPException(status_code=413, detail="Webhook payload too large")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid content length") from None

    chunks = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_WEBHOOK_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Webhook payload too large")
        chunks.append(chunk)
    return b"".join(chunks)
