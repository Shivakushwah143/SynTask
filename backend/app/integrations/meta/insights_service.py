"""Tenant-scoped, read-only persistence for Meta marketing insight snapshots."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from app.integrations.meta.client import MetaGraphClient
from app.integrations.meta.config_service import MetaIntegrationConfigService
from app.integrations.meta.models import (
    MetaIntegrationSettings,
    MetaMarketingInsight,
    MetaSyncRun,
)


MAX_INSIGHTS_PAGES = 100


class MetaInsightsConfigurationError(ValueError):
    """A tenant cannot safely start an insights sync."""


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _action_value(actions: Iterable[Dict[str, Any]], action_type: str) -> float:
    return sum(
        _number(action.get("value"))
        for action in actions
        if isinstance(action, dict) and action.get("action_type") == action_type
    )


def _date(value: Any) -> datetime:
    return datetime.strptime(str(value), "%Y-%m-%d").replace(tzinfo=timezone.utc)


def normalize_insight(
    *, company_id: str, ad_account_id: str, payload: Dict[str, Any], fetched_at: datetime
) -> Dict[str, Any]:
    """Convert one provider row into an idempotent tenant snapshot."""
    actions = payload.get("actions") if isinstance(payload.get("actions"), list) else []
    action_values = (
        payload.get("action_values") if isinstance(payload.get("action_values"), list) else []
    )
    spend = _number(payload.get("spend"))
    leads = int(_action_value(actions, "lead"))
    conversions = int(_action_value(actions, "purchase"))
    revenue = _action_value(action_values, "purchase") or None
    return {
        "company_id": company_id,
        "ad_account_id": ad_account_id,
        "campaign_id": str(payload.get("campaign_id") or ""),
        "campaign_name": payload.get("campaign_name"),
        "adset_id": payload.get("adset_id"),
        "adset_name": payload.get("adset_name"),
        "ad_id": payload.get("ad_id"),
        "ad_name": payload.get("ad_name"),
        "date_start": _date(payload.get("date_start")),
        "date_stop": _date(payload.get("date_stop")),
        "attribution_window": payload.get("attribution_setting"),
        "currency": payload.get("account_currency"),
        "spend": spend,
        "impressions": int(_number(payload.get("impressions"))),
        "clicks": int(_number(payload.get("clicks"))),
        "conversions": conversions,
        "leads": leads,
        "revenue": revenue,
        "cpl": round(spend / leads, 2) if leads > 0 else None,
        "roas": round(revenue / spend, 2) if revenue is not None and spend > 0 else None,
        "fetched_at": fetched_at,
        "updated_at": fetched_at,
    }


async def upsert_insight_snapshot(snapshot: Dict[str, Any]) -> None:
    """Upsert using the model's complete tenant-safe unique snapshot identity."""
    fetched_at = snapshot.get("fetched_at") or datetime.now(timezone.utc)
    identity = {
        key: snapshot.get(key)
        for key in (
            "company_id",
            "ad_account_id",
            "campaign_id",
            "adset_id",
            "ad_id",
            "date_start",
            "date_stop",
        )
    }
    await MetaMarketingInsight.find_one(identity).update(
        {"$set": snapshot, "$setOnInsert": {"created_at": fetched_at}},
        upsert=True,
    )


class MetaInsightsService:
    """Synchronize exactly one persisted run; credentials never leave this process."""

    async def sync(self, run: MetaSyncRun) -> int:
        config = await self._enabled_config(run.company_id)
        token = MetaIntegrationConfigService.reveal_secret(
            config.system_user_token_encrypted
        )
        if not token:
            raise MetaInsightsConfigurationError("Meta system user token is required")
        if not config.ad_account_id:
            raise MetaInsightsConfigurationError("Meta ad account is required")

        since, until = await self._sync_window(run)
        processed = 0
        client = MetaGraphClient(access_token=token)
        try:
            cursor = run.cursor
            seen_cursors = set()
            page_count = 0
            while True:
                if cursor:
                    if cursor in seen_cursors:
                        raise MetaInsightsConfigurationError("Meta insights pagination cursor repeated")
                    seen_cursors.add(cursor)
                if page_count >= MAX_INSIGHTS_PAGES:
                    raise MetaInsightsConfigurationError("Meta insights pagination limit reached")
                page = await client.get_insights(
                    ad_account_id=config.ad_account_id,
                    after=cursor,
                    since=since,
                    until=until,
                )
                fetched_at = datetime.now(timezone.utc)
                page_count += 1
                for row in page["data"]:
                    snapshot = normalize_insight(
                        company_id=run.company_id,
                        ad_account_id=config.ad_account_id,
                        payload=row,
                        fetched_at=fetched_at,
                    )
                    if not snapshot["campaign_id"]:
                        continue
                    await upsert_insight_snapshot(snapshot)
                    processed += 1
                cursor = page["next_cursor"]
                run.cursor = cursor
                run.records_processed = processed
                run.updated_at = fetched_at
                await run.save()
                if not cursor:
                    break
        finally:
            await client.aclose()
        return processed

    async def _enabled_config(self, company_id: str):
        config = await MetaIntegrationSettings.find_one(
            {
                "company_id": company_id,
                "enabled": True,
                "insights_sync_enabled": True,
            }
        )
        if config is None:
            raise MetaInsightsConfigurationError("Meta insights sync is not enabled")
        return config

    async def _sync_window(self, run: MetaSyncRun) -> tuple[str, str]:
        """Persist one immutable date window before the first provider request."""
        if run.window_since and run.window_until:
            return run.window_since, run.window_until
        since, until = await self._incremental_window(run.company_id)
        run.window_since = since
        run.window_until = until
        run.updated_at = datetime.now(timezone.utc)
        await run.save()
        return since, until

    async def _incremental_window(self, company_id: str) -> tuple[str, str]:
        previous = await (
            MetaSyncRun.find(
                {
                    "company_id": company_id,
                    "sync_type": "insights",
                    "status": "completed",
                    "completed_at": {"$ne": None},
                }
            )
            .sort("-completed_at")
            .limit(1)
            .to_list()
        )
        now = datetime.now(timezone.utc).date().isoformat()
        if not previous or previous[0].completed_at is None:
            return now, now
        return previous[0].completed_at.date().isoformat(), now
