"""Public, signed Meta webhook routes."""

import json
from datetime import datetime, timezone
from uuid import uuid4

from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.core.config import settings
from app.api.dependencies import get_current_company_admin
from app.integrations.meta.config_service import MetaConfigurationError, resolve_target_company_id, validate_activation
from app.integrations.meta.config_service import MetaIntegrationConfigService, mask_secret
from app.integrations.meta.client import MetaGraphClient, MetaGraphClientError
from app.integrations.meta.models import MetaIntegrationSettings, MetaMarketingInsight, MetaSyncRun
from app.integrations.meta.schemas import MetaIntegrationSettingsUpdate
from app.models.user import User, UserStatus
from app.integrations.meta.signatures import verify_meta_signature, verify_verify_token
from app.integrations.meta.tasks import (
    MetaInsightsActiveRunError,
    create_and_enqueue_insights_sync_run,
)
from app.integrations.meta.webhook_service import MetaWebhookService, WebhookIngestResult


MAX_WEBHOOK_BODY_BYTES = 1_048_576
router = APIRouter()
webhook_service = MetaWebhookService()


def _target_company(current_user, company_id: str | None) -> str:
    try:
        return resolve_target_company_id(
            actor_role=current_user.role.value,
            actor_company_id=current_user.company_id,
            selected_company_id=company_id,
        )
    except MetaConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


def _settings_view(config: MetaIntegrationSettings | None, company_id: str) -> dict:
    if config is None:
        return {
            "company_id": company_id,
            "enabled": False,
            "lead_sync_enabled": False,
            "insights_sync_enabled": False,
            "inbound_messaging_enabled": False,
            "page_id": None,
            "page_access_token_masked": None,
            "business_id": None,
            "ad_account_id": None,
            "system_user_token_masked": None,
            "lead_form_id": None,
            "whatsapp_business_id": None,
            "default_lead_owner_id": None,
        }
    return {
        "company_id": config.company_id,
        "enabled": config.enabled,
        "lead_sync_enabled": config.lead_sync_enabled,
        "insights_sync_enabled": config.insights_sync_enabled,
        "inbound_messaging_enabled": config.inbound_messaging_enabled,
        "page_id": config.page_id,
        "page_access_token_masked": mask_secret(
            MetaIntegrationConfigService.reveal_secret(config.page_access_token_encrypted)
        ),
        "business_id": config.business_id,
        "ad_account_id": config.ad_account_id,
        "system_user_token_masked": mask_secret(
            MetaIntegrationConfigService.reveal_secret(config.system_user_token_encrypted)
        ),
        "lead_form_id": config.lead_form_id,
        "whatsapp_business_id": config.whatsapp_business_id,
        "default_lead_owner_id": config.default_lead_owner_id,
    }


def _iso_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD") from None


def _insights_payload(rows: list[MetaMarketingInsight]) -> dict:
    spend = round(sum(float(row.spend or 0) for row in rows), 2)
    impressions = sum(int(row.impressions or 0) for row in rows)
    clicks = sum(int(row.clicks or 0) for row in rows)
    leads = sum(int(row.leads or 0) for row in rows)
    conversions = sum(int(row.conversions or 0) for row in rows)
    revenue_values = [float(row.revenue) for row in rows if row.revenue is not None]
    revenue = round(sum(revenue_values), 2) if revenue_values else None
    return {
        "summary": {
            "spend": spend,
            "impressions": impressions,
            "clicks": clicks,
            "leads": leads,
            "conversions": conversions,
            "revenue": revenue,
            "cpl": round(spend / leads, 2) if leads > 0 else None,
            "roas": round(revenue / spend, 2) if revenue is not None and spend > 0 else None,
        },
        "items": [
            {
                "campaign_id": row.campaign_id,
                "campaign_name": row.campaign_name,
                "adset_id": row.adset_id,
                "adset_name": row.adset_name,
                "ad_id": row.ad_id,
                "ad_name": row.ad_name,
                "date_start": row.date_start,
                "date_stop": row.date_stop,
                "currency": row.currency,
                "spend": row.spend,
                "impressions": row.impressions,
                "clicks": row.clicks,
                "leads": row.leads,
                "conversions": row.conversions,
                "cpl": row.cpl,
                "roas": row.roas,
            }
            for row in rows
        ],
    }


@router.get("/settings")
async def get_meta_settings(
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_company_admin),
):
    target = _target_company(current_user, company_id)
    config = await MetaIntegrationSettings.find_one({"company_id": target})
    response = _settings_view(config, target)
    response["app_id"] = settings.META_APP_ID
    return response


@router.get("/insights")
async def get_meta_insights(
    company_id: str | None = Query(default=None),
    since: str | None = Query(default=None),
    until: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    current_user=Depends(get_current_company_admin),
):
    target = _target_company(current_user, company_id)
    query: dict = {"company_id": target}
    since_date = _iso_date(since)
    until_date = _iso_date(until)
    if since_date or until_date:
        window = {}
        if since_date:
            window["$gte"] = since_date
        if until_date:
            window["$lte"] = until_date
        query["date_start"] = window
    rows = await (
        MetaMarketingInsight.find(query)
        .sort("-date_start")
        .limit(limit)
        .to_list()
    )
    return _insights_payload(rows)


@router.get("/sync-runs")
async def get_meta_sync_runs(
    company_id: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    current_user=Depends(get_current_company_admin),
):
    target = _target_company(current_user, company_id)
    runs = await (
        MetaSyncRun.find({"company_id": target, "sync_type": "insights"})
        .sort("-created_at")
        .limit(limit)
        .to_list()
    )
    return {
        "items": [
            {
                "id": str(run.id),
                "status": run.status,
                "records_processed": run.records_processed,
                "window_since": run.window_since,
                "window_until": run.window_until,
                "error_code": run.error_code,
                "created_at": run.created_at,
                "completed_at": run.completed_at,
            }
            for run in runs
        ]
    }


@router.put("/settings")
async def update_meta_settings(
    payload: MetaIntegrationSettingsUpdate,
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_company_admin),
):
    target = _target_company(current_user, company_id)
    existing = await MetaIntegrationSettings.find_one({"company_id": target})
    payload_data = payload.model_dump(exclude_unset=True)
    update_data = MetaIntegrationConfigService.prepare_update(
        company_id=target,
        payload=payload_data,
    )
    now = datetime.utcnow()
    if existing is None:
        config = MetaIntegrationSettings(
            **update_data,
            created_by=str(current_user.id),
            updated_by=str(current_user.id),
            created_at=now,
            updated_at=now,
        )
    else:
        for key, value in update_data.items():
            setattr(existing, key, value)
        existing.updated_by = str(current_user.id)
        existing.updated_at = now
        config = existing

    owner = None
    if config.default_lead_owner_id:
        try:
            owner_id = PydanticObjectId(str(config.default_lead_owner_id))
        except (TypeError, ValueError, InvalidId):
            owner_id = None
        if owner_id:
            owner = await User.find_one({
                "_id": owner_id,
                "company_id": target,
                "status": UserStatus.ACTIVE.value,
            })
    try:
        validate_activation(config.model_dump(), owner)
    except MetaConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    await config.save()
    response = _settings_view(config, target)
    response["app_id"] = settings.META_APP_ID
    return response


@router.get("/health")
async def get_meta_health(
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_company_admin),
):
    target = _target_company(current_user, company_id)
    config = await MetaIntegrationSettings.find_one({"company_id": target})
    if config is None:
        return {"status": "not_configured", "webhook_status": "not_configured"}
    return {
        "status": config.last_connection_status or ("configured" if config.enabled else "disabled"),
        "webhook_status": "receiving" if config.last_webhook_at else "awaiting_event",
        "last_connection_test_at": config.last_connection_test_at,
        "last_insights_sync_at": config.last_insights_sync_at,
        "last_error_code": config.last_error_code,
    }


@router.post("/test-connection")
async def test_meta_connection(
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_company_admin),
):
    target = _target_company(current_user, company_id)
    config = await MetaIntegrationSettings.find_one({"company_id": target})
    if config is None or not config.page_access_token_encrypted:
        raise HTTPException(status_code=400, detail="Meta page token is not configured")
    client = MetaGraphClient(
        access_token=MetaIntegrationConfigService.reveal_secret(
            config.page_access_token_encrypted
        )
    )
    try:
        identity = await client.test_connection()
    except MetaGraphClientError:
        config.last_connection_status = "failed"
        config.last_error_code = "connection_failed"
        config.last_error_at = datetime.utcnow()
        await config.save()
        raise HTTPException(status_code=502, detail="Meta connection test failed") from None
    finally:
        await client.aclose()
    config.last_connection_status = "connected"
    config.last_connection_test_at = datetime.utcnow()
    config.last_error_code = None
    await config.save()
    return {"status": "connected", "account_id": identity["id"]}


@router.post("/sync")
async def sync_meta_insights(
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_company_admin),
):
    """Queue a persisted, tenant-resolved read-only insights sync."""
    try:
        target_company_id = _target_company(current_user, company_id)
        run = await create_and_enqueue_insights_sync_run(
            company_id=target_company_id,
            requested_by=str(current_user.id),
        )
    except MetaConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except MetaInsightsActiveRunError:
        raise HTTPException(status_code=409, detail="An insights sync is already in progress") from None
    except ValueError:
        raise HTTPException(status_code=400, detail="Meta insights sync is unavailable") from None
    return {"status": "queued", "run_id": str(run.id)}


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
