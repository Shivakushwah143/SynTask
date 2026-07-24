import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock
from app.integrations.meta import api as meta_api
from app.api.dependencies import get_current_company_admin
from app.integrations.meta.readiness_service import MetaReadinessService

class MockUser:
    id = "admin-1"
    role = "admin"
    company_id = "company-1"

@pytest.fixture
def test_app():
    app = FastAPI()
    app.include_router(meta_api.router, prefix="/api/v1/integrations/meta")
    
    async def mock_admin():
        return MockUser()
        
    app.dependency_overrides[get_current_company_admin] = mock_admin
    return app

@pytest.fixture
def client(test_app):
    return TestClient(test_app)

@pytest.mark.asyncio
async def test_get_meta_readiness(client, monkeypatch):
    mock_checklist = AsyncMock(return_value=[
        {"checklist_id": "TEST_ID", "checklist_name": "Test Name", "status": "pending"}
    ])
    monkeypatch.setattr(MetaReadinessService, "get_readiness_checklist", mock_checklist)
    
    response = client.get("/api/v1/integrations/meta/readiness")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["checklist_id"] == "TEST_ID"

@pytest.mark.asyncio
async def test_update_meta_readiness(client, monkeypatch):
    mock_update = AsyncMock(return_value={
        "checklist_id": "TEST_ID",
        "status": "passed",
        "evidence_url": "http://evidence.com",
        "notes": "Passed notes"
    })
    monkeypatch.setattr(MetaReadinessService, "update_readiness_record", mock_update)
    
    response = client.patch(
        "/api/v1/integrations/meta/readiness/TEST_ID",
        json={"status": "passed", "evidence_url": "http://evidence.com", "notes": "Passed notes"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "passed"
    assert data["evidence_url"] == "http://evidence.com"
    
    mock_update.assert_called_once_with(
        checklist_id="TEST_ID",
        status="passed",
        evidence_url="http://evidence.com",
        notes="Passed notes",
        verified_by="admin-1"
    )

@pytest.mark.asyncio
async def test_export_meta_readiness(client, monkeypatch):
    mock_export = AsyncMock(return_value={
        "checklist_count": 5,
        "passed_count": 2,
        "fully_ready": False,
        "items": []
    })
    monkeypatch.setattr(MetaReadinessService, "export_evidence_package", mock_export)
    
    response = client.get("/api/v1/integrations/meta/readiness/export")
    assert response.status_code == 200
    data = response.json()
    assert data["checklist_count"] == 5
    assert data["passed_count"] == 2
