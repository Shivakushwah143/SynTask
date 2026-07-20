"""Read-only client for the Meta Graph API."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

import httpx


class MetaGraphClientError(RuntimeError):
    """A sanitized Meta Graph request failure."""


class MetaGraphRateLimitError(MetaGraphClientError):
    """Meta rejected a read because its rate limit was reached."""


class MetaGraphTransientError(MetaGraphClientError):
    """A retryable Meta Graph transport or server failure."""


class MetaGraphClient:
    """Small read-only Graph client used by Meta workers."""

    BASE_URL = "https://graph.facebook.com/v20.0"

    def __init__(
        self,
        *,
        access_token: str,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self._access_token = access_token
        self._http_client = http_client or httpx.AsyncClient(timeout=httpx.Timeout(10.0))
        self._owns_client = http_client is None

    async def get_lead(self, lead_id: str) -> Dict[str, Any]:
        payload = await self._get_json(
            f"{self.BASE_URL}/{lead_id}",
            params={
                "fields": "id,created_time,field_data,campaign_id,adset_id,ad_id,form_id",
            },
            operation="lead lookup",
        )
        if not isinstance(payload, dict):
            raise MetaGraphClientError("Meta Graph lead response was invalid")
        return payload

    async def get_insights(
        self,
        *,
        ad_account_id: str,
        after: Optional[str] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Read one bounded insights page; no Graph mutation is available here."""
        params: Dict[str, Any] = {
            "fields": (
                "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,"
                "date_start,date_stop,spend,impressions,clicks,actions,action_values,"
                "account_currency,attribution_setting"
            ),
            "level": "ad",
            "limit": max(1, min(limit, 100)),
        }
        if after:
            params["after"] = after
        if since and until:
            params["time_range"] = json.dumps(
                {"since": since, "until": until}, separators=(",", ":")
            )
        payload = await self._get_json(
            f"{self.BASE_URL}/{ad_account_id}/insights",
            params=params,
            operation="insights lookup",
        )
        if not isinstance(payload, dict) or not isinstance(payload.get("data", []), list):
            raise MetaGraphClientError("Meta Graph insights response was invalid")
        paging = payload.get("paging") or {}
        cursors = paging.get("cursors") if isinstance(paging, dict) else {}
        next_cursor = (
            cursors.get("after")
            if isinstance(paging, dict) and paging.get("next") and isinstance(cursors, dict)
            else None
        )
        return {"data": payload.get("data", []), "next_cursor": next_cursor}

    async def _get_json(
        self, url: str, *, params: Dict[str, Any], operation: str
    ) -> Any:
        try:
            response = await self._http_client.get(
                url, params={"access_token": self._access_token, **params}
            )
        except httpx.HTTPError as exc:
            raise MetaGraphTransientError(f"Meta Graph {operation} failed") from exc

        if response.status_code == 429:
            raise MetaGraphRateLimitError("Meta Graph rate limit reached")
        if response.status_code >= 500:
            raise MetaGraphTransientError(f"Meta Graph {operation} failed")
        if response.status_code >= 400:
            raise MetaGraphClientError(f"Meta Graph {operation} failed")
        try:
            return response.json()
        except ValueError as exc:
            raise MetaGraphClientError(f"Meta Graph {operation} failed") from exc

    async def aclose(self) -> None:
        if self._owns_client:
            await self._http_client.aclose()
