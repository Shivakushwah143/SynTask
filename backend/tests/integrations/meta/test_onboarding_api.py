import pytest
import httpx
from fastapi import FastAPI
from app.integrations.meta import api as meta_api
from bson import ObjectId

def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    )

class MockRole:
    value = "admin"

class MockUser:
    def __init__(self):
        self.id = ObjectId()
        self.email = "admin@example.com"
        self.first_name = "Admin"
        self.last_name = "Test"
        self.role = MockRole()
        self.company_id = "company-1"
        self.status = "active"

@pytest.fixture
def app(monkeypatch):
    app = FastAPI()
    app.include_router(meta_api.router, prefix="/api/v1/integrations/meta")
    monkeypatch.setattr(meta_api.settings, "META_INTEGRATION_ENABLED", True)
    monkeypatch.setattr(meta_api.settings, "META_APP_ID", "12345")
    monkeypatch.setattr(meta_api.settings, "FRONTEND_URL", "http://frontend")
    
    # Mock authentication dependency
    async def mock_admin():
        return MockUser()
    app.dependency_overrides[meta_api.get_current_company_admin] = mock_admin
    return app

@pytest.mark.asyncio
async def test_create_instagram_onboarding_session(app, monkeypatch):
    class FakeSession:
        id = ObjectId()
        state = "instagram_state_123"

    async def mock_create(company_id, channel):
        return FakeSession()

    monkeypatch.setattr(
        "app.integrations.meta.config_service.MetaIntegrationConfigService.create_onboarding_session",
        mock_create
    )

    async with _client(app) as client:
        response = await client.post("/api/v1/integrations/meta/instagram/onboarding-sessions")
        
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"]
    assert data["state"] == "instagram_state_123"
    assert "dialog/oauth" in data["redirect_url"]
    assert "instagram_business_manage_messages" in data["redirect_url"]


@pytest.mark.asyncio
async def test_complete_instagram_onboarding_session(app, monkeypatch):
    class FakeConnection:
        id = ObjectId()

    async def mock_complete(session_id, code, current_user_id):
        return FakeConnection()

    monkeypatch.setattr(
        "app.integrations.meta.config_service.MetaIntegrationConfigService.complete_onboarding_session",
        mock_complete
    )

    async with _client(app) as client:
        response = await client.post(
            f"/api/v1/integrations/meta/instagram/onboarding-sessions/{ObjectId()}/complete",
            params={"code": "auth_code"}
        )
        
    assert response.status_code == 200
    assert response.json()["status"] == "connected"
    assert response.json()["connection_id"]


@pytest.mark.asyncio
async def test_get_meta_channels(app, monkeypatch):
    class FakeConnection:
        id = ObjectId()
        company_id = "company-1"
        channel = "instagram"
        provider_asset_id = "ig-123"
        display_name = "IG Profile"
        instagram_professional_account_id = "ig-123"
        page_id = "page-123"
        scopes = ["instagram_basic"]
        status = "active"
        can_receive = True
        can_send = True
        health_reason = None
        last_health_check_at = None
        last_webhook_at = None
        created_at = None
        updated_at = None

    class FakeCursor:
        async def to_list(self):
            return [FakeConnection()]

    monkeypatch.setattr(
        "app.integrations.meta.messaging_models.MetaChannelConnection.find",
        lambda query: FakeCursor()
    )

    async with _client(app) as client:
        response = await client.get("/api/v1/integrations/meta/channels")
        
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["channel"] == "instagram"
    assert data["items"][0]["provider_asset_id"] == "ig-123"


@pytest.mark.asyncio
async def test_validate_and_disconnect_meta_channel(app, monkeypatch):
    class FakeConnection:
        def __init__(self):
            self.id = ObjectId()
            self.company_id = "company-1"
            self.status = "active"
            self.can_receive = True
            self.can_send = True
        async def save(self):
            return self

    conn = FakeConnection()

    async def mock_find_one(query):
        return conn

    monkeypatch.setattr(
        "app.integrations.meta.messaging_models.MetaChannelConnection.find_one",
        mock_find_one
    )

    async with _client(app) as client:
        # Test Validate
        response = await client.post(f"/api/v1/integrations/meta/channels/{conn.id}/validate")
        assert response.status_code == 200
        assert response.json()["status"] == "active"

        # Test Disconnect
        response = await client.post(f"/api/v1/integrations/meta/channels/{conn.id}/disconnect")
        assert response.status_code == 200
        assert response.json()["status"] == "disconnected"
        assert conn.status == "disconnected"


@pytest.mark.asyncio
async def test_get_meta_analytics_route(app, monkeypatch):
    async def mock_summary(company_id):
        return {"total_conversations": 10, "average_first_response_time_seconds": 120.0}

    monkeypatch.setattr(
        "app.integrations.meta.omnichannel_analytics.MetaOmnichannelAnalyticsService.get_analytics_summary",
        mock_summary
    )

    async with _client(app) as client:
        response = await client.get("/api/v1/integrations/meta/analytics")
        
    assert response.status_code == 200
    data = response.json()
    assert data["total_conversations"] == 10
    assert data["average_first_response_time_seconds"] == 120.0


