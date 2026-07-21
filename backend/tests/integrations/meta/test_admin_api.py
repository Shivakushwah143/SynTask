import httpx
import pytest

from app.integrations.meta.api import _settings_view
from app.integrations.meta.client import MetaGraphClient, MetaGraphClientError


def test_empty_settings_view_never_contains_secrets():
    view = _settings_view(None, "company-1")

    assert view["company_id"] == "company-1"
    assert view["enabled"] is False
    assert "page_access_token_encrypted" not in view
    assert "system_user_token_encrypted" not in view


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
