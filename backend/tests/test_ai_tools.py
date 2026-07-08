from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from app.ai.tools import ToolContext, ToolResult, build_default_tool_registry


def test_tool_registry_contains_required_tools() -> None:
    registry = build_default_tool_registry()
    available = registry.available_tools()

    assert "getCRMContext" in available
    assert "searchCRM" in available
    assert "getLeadIntelligence" in available
    assert "sendSalesEmail" in available
    assert "sendWhatsAppMessage" in available
    assert "updateCRMActivity" in available
    assert "recordTimelineEvent" in available
    assert "recordAuditEvent" in available
    assert "notifySalesperson" in available
    assert "qualifyLead" in available
    assert "assignLead" in available
    assert "importLeads" in available
    assert "movePipeline" in available
    assert "scheduleMeeting" in available
    assert "createFollowUp" in available
    assert "generateProposal" in available
    assert "notifySales" in available
    assert "notifyUser" in available


def test_tool_result_serialization() -> None:
    result = ToolResult(tool_name="getCRMContext", success=True, data={"lead_id": "123"})
    serialized = result.to_dict()

    assert serialized["tool"] == "getCRMContext"
    assert serialized["success"] is True
    assert serialized["data"]["lead_id"] == "123"


def test_tool_context_exposes_company_id() -> None:
    class DummyUser:
        id = "user-1"
        company_id = "company-1"
        role = type("Role", (), {"value": "admin"})()

    context = ToolContext(current_user=DummyUser(), tool_name="getCRMContext")

    assert context.company_id == "company-1"
