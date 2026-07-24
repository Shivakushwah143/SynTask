import httpx
import pytest
from datetime import datetime, timezone

from app.integrations.meta.api import _settings_view
from app.integrations.meta.api import _insights_payload, _iso_date
from app.integrations.meta.client import MetaGraphClient, MetaGraphClientError


def test_empty_settings_view_never_contains_secrets():
    view = _settings_view(None, "company-1")

    assert view["company_id"] == "company-1"
    assert view["enabled"] is False
    assert "page_access_token_encrypted" not in view
    assert "system_user_token_encrypted" not in view


def test_insights_payload_summarizes_marketing_metrics():
    class Row:
        campaign_id = "campaign-1"
        campaign_name = "Campaign"
        adset_id = "adset-1"
        adset_name = "Ad set"
        ad_id = "ad-1"
        ad_name = "Ad"
        date_start = datetime(2026, 7, 21, tzinfo=timezone.utc)
        date_stop = datetime(2026, 7, 21, tzinfo=timezone.utc)
        currency = "INR"
        spend = 100
        impressions = 1000
        clicks = 50
        leads = 4
        conversions = 2
        revenue = 400
        cpl = 25
        roas = 4

    payload = _insights_payload([Row()])

    assert payload["summary"] == {
        "spend": 100.0,
        "impressions": 1000,
        "clicks": 50,
        "leads": 4,
        "conversions": 2,
        "revenue": 400.0,
        "cpl": 25.0,
        "roas": 4.0,
    }
    assert payload["items"][0]["campaign_id"] == "campaign-1"


def test_iso_date_rejects_ambiguous_dates():
    with pytest.raises(Exception):
        _iso_date("21-07-2026")


@pytest.mark.asyncio
async def test_connection_uses_read_only_identity_lookup():
    observed = {}

    async def handler(request):
        observed["method"] = request.method
        observed["path"] = request.url.path
        return httpx.Response(200, json={"id": "page-1", "name": "Page"})

    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = MetaGraphClient(access_token="secret", http_client=http_client)

    assert await client.test_connection() == {"id": "page-1", "name": "Page"}
    assert observed == {"method": "GET", "path": "/v20.0/me"}
    await http_client.aclose()


@pytest.mark.asyncio
async def test_connection_rejects_invalid_provider_payload():
    async def handler(_request):
        return httpx.Response(200, json={"name": "Missing id"})

    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = MetaGraphClient(access_token="secret", http_client=http_client)

    with pytest.raises(MetaGraphClientError, match="invalid"):
        await client.test_connection()
    await http_client.aclose()
