"""Read-only client for the Meta Graph API."""

from __future__ import annotations

from typing import Any, Dict, Optional

import httpx


class MetaGraphClientError(RuntimeError):
    """A sanitized Meta Graph request failure."""


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
        try:
            response = await self._http_client.get(
                f"{self.BASE_URL}/{lead_id}",
                params={
                    "access_token": self._access_token,
                    "fields": "id,created_time,field_data,campaign_id,adset_id,ad_id,form_id",
                },
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise MetaGraphClientError("Meta Graph lead lookup failed") from exc
        if not isinstance(payload, dict):
            raise MetaGraphClientError("Meta Graph lead response was invalid")
        return payload

    async def aclose(self) -> None:
        if self._owns_client:
            await self._http_client.aclose()
