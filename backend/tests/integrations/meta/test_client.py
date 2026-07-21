import httpx
import pytest


@pytest.mark.asyncio
async def test_graph_client_fetches_a_lead_with_a_read_only_get_request():
    from app.integrations.meta.client import MetaGraphClient

    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"id": "lead-1", "field_data": []})

    client = MetaGraphClient(
        access_token="token",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    try:
        lead = await client.get_lead("lead-1")
    finally:
        await client.aclose()

    assert lead["id"] == "lead-1"
    assert requests[0].method == "GET"
    assert requests[0].url.path.endswith("/lead-1")
    assert requests[0].url.params["access_token"] == "token"


def test_graph_client_exposes_no_meta_write_operations():
    from app.integrations.meta.client import MetaGraphClient

    forbidden = {"create", "update", "delete", "publish", "pause", "resume", "budget", "bid"}
    public_methods = {name for name in dir(MetaGraphClient) if not name.startswith("_")}

    assert not any(word in name.lower() for name in public_methods for word in forbidden)
