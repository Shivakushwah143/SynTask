from __future__ import annotations

import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from app.ai.agents.sales_agent import SalesAgent
from app.ai.tools import ToolResult
from app.models.user import UserRole
from app.schemas.ai import AILeadIntelligenceResponse, AISalesAgentRequest


class DummySalesRegistry:
    def __init__(self, context: dict[str, object], intelligence: AILeadIntelligenceResponse | None = None, *, error: HTTPException | None = None) -> None:
        self.context = context
        self.intelligence = intelligence
        self.error = error

    async def execute(self, tool_name: str, payload: dict[str, object], context) -> ToolResult:
        if self.error:
            raise self.error
        if tool_name == "getCRMContext":
            return ToolResult(tool_name=tool_name, success=True, data=self.context)
        if tool_name == "getLeadIntelligence":
            assert self.intelligence is not None
            return ToolResult(tool_name=tool_name, success=True, data=self.intelligence.model_dump())
        return ToolResult(tool_name=tool_name, success=True, data={"tool": tool_name, "payload": payload})


def _user() -> SimpleNamespace:
    return SimpleNamespace(id="user-1", company_id="company-1", role=SimpleNamespace(value=UserRole.ADMIN.value))


def _intelligence(**overrides) -> AILeadIntelligenceResponse:
    base = {
        "lead_id": "lead-1",
        "lead_name": "Acme Studios",
        "company_name": "Acme Studios",
        "lead_score": 55,
        "priority": "medium",
        "urgency": "medium",
        "buying_intent": "warm",
        "duplicate_risk": False,
        "duplicate_matches": [],
        "recommended_salesperson": {"id": "sales-1", "name": "Alex Sales", "source": "current_assignment"},
        "recommended_pipeline_stage": "Discovery Scheduled",
        "recommended_next_action": "Book a discovery meeting",
        "reasoning_summary": "Deterministic test intelligence.",
        "source": "tool_layer",
        "provider": "deterministic",
        "model": "lead-intelligence-v1",
        "generated_at": "2026-07-06T00:00:00Z",
        "context": {},
    }
    base.update(overrides)
    return AILeadIntelligenceResponse.model_validate(base)


@pytest.mark.asyncio
async def test_sales_agent_cold_lead() -> None:
    context = {
        "lead": {"id": "lead-1", "prospect_name": "Cold Lead", "email": "cold@example.com", "phone": "12345"},
        "company": {"id": "company-1", "name": "Cold Co"},
        "contact": {"first_name": "Sam"},
        "assignment_information": {"current_stage": "new"},
    }
    agent = SalesAgent(tool_registry=DummySalesRegistry(context, _intelligence(lead_score=20, priority="low", urgency="low", buying_intent="cold", recommended_pipeline_stage="Contacted")))

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-1"))

    assert result.communication_strategy["primary"] == "email"
    assert result.communication_strategy["meeting_recommended"] is False
    assert result.email.subject is not None
    assert result.meeting.recommended is False
    assert result.crm.next_stage == "Contacted"


@pytest.mark.asyncio
async def test_sales_agent_warm_lead() -> None:
    context = {
        "lead": {"id": "lead-2", "prospect_name": "Warm Lead", "email": "warm@example.com", "phone": "54321"},
        "company": {"id": "company-2", "name": "Warm Co"},
        "contact": {"first_name": "Jamie"},
        "assignment_information": {"current_stage": "contacted"},
    }
    agent = SalesAgent(tool_registry=DummySalesRegistry(context, _intelligence(lead_id="lead-2", lead_name="Warm Lead", lead_score=55, priority="medium", urgency="medium", buying_intent="warm", recommended_pipeline_stage="Discovery Scheduled")))

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-2"))

    assert result.communication_strategy["primary"] == "email"
    assert result.communication_strategy["secondary"] == "follow_up"
    assert result.email.text and "Warm Co" in result.email.text
    assert result.follow_up.recommended_date is not None


@pytest.mark.asyncio
async def test_sales_agent_hot_lead() -> None:
    context = {
        "lead": {"id": "lead-3", "prospect_name": "Hot Lead", "email": "hot@example.com", "phone": "99999"},
        "company": {"id": "company-3", "name": "Hot Co"},
        "contact": {"first_name": "Avery"},
        "assignment_information": {"current_stage": "qualified"},
    }
    agent = SalesAgent(tool_registry=DummySalesRegistry(context, _intelligence(lead_id="lead-3", lead_name="Hot Lead", lead_score=88, priority="high", urgency="immediate", buying_intent="hot", recommended_pipeline_stage="Proposal Sent", recommended_next_action="Send a proposal")))

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-3"))

    assert result.communication_strategy["primary"] == "email"
    assert result.communication_strategy["secondary"] == "whatsapp"
    assert result.meeting.recommended is True
    assert result.whatsapp["message"] is not None


@pytest.mark.asyncio
async def test_sales_agent_enterprise_lead() -> None:
    context = {
        "lead": {"id": "lead-4", "prospect_name": "Enterprise Lead", "email": "enterprise@example.com", "phone": "11111"},
        "company": {"id": "company-4", "name": "Enterprise Co", "company_size": "1000+"},
        "contact": {"first_name": "Morgan"},
        "assignment_information": {"current_stage": "qualified"},
    }
    agent = SalesAgent(tool_registry=DummySalesRegistry(context, _intelligence(lead_id="lead-4", lead_name="Enterprise Lead", lead_score=90, priority="high", urgency="high", buying_intent="enterprise", recommended_pipeline_stage="Proposal Sent")))

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-4"))

    assert result.crm.next_stage == "Proposal Sent"
    assert result.meeting.recommended is True


@pytest.mark.asyncio
async def test_sales_agent_duplicate_lead() -> None:
    context = {
        "lead": {"id": "lead-5", "prospect_name": "Dup Lead", "email": "dup@example.com", "phone": "22222"},
        "company": {"id": "company-5", "name": "Dup Co"},
        "contact": {"first_name": "Casey"},
        "assignment_information": {"current_stage": "new"},
    }
    agent = SalesAgent(tool_registry=DummySalesRegistry(context, _intelligence(lead_id="lead-5", duplicate_risk=True, buying_intent="cold", priority="low", urgency="review", recommended_pipeline_stage="Contacted")))

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-5"))

    assert result.communication_strategy["primary"] == "stop"
    assert result.crm.next_stage == "new"
    assert result.meeting.recommended is False


@pytest.mark.asyncio
async def test_sales_agent_existing_customer() -> None:
    context = {
        "lead": {"id": "lead-6", "prospect_name": "Customer Lead", "email": "customer@example.com", "phone": "33333"},
        "company": {"id": "company-6", "name": "Customer Co"},
        "contact": {"first_name": "Taylor"},
        "assignment_information": {"current_stage": "won"},
    }
    agent = SalesAgent(tool_registry=DummySalesRegistry(context, _intelligence(lead_id="lead-6", buying_intent="existing_customer", priority="high", urgency="high", recommended_pipeline_stage="Won")))

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-6"))

    assert result.communication_strategy["secondary"] == "notify_account_manager"
    assert result.crm.next_stage == "Won"


@pytest.mark.asyncio
async def test_sales_agent_missing_email() -> None:
    context = {
        "lead": {"id": "lead-7", "prospect_name": "No Email", "email": None, "phone": "44444"},
        "company": {"id": "company-7", "name": "No Email Co"},
        "contact": {"first_name": "Jordan"},
        "assignment_information": {"current_stage": "contacted"},
    }
    agent = SalesAgent(tool_registry=DummySalesRegistry(context, _intelligence(lead_id="lead-7", lead_name="No Email", lead_score=30, priority="low", urgency="low", buying_intent="cold", recommended_pipeline_stage="Contacted")))

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-7"))

    assert result.email.subject is None
    assert result.communication_strategy["primary"] == "email"
    assert result.whatsapp["message"] is None


@pytest.mark.asyncio
async def test_sales_agent_missing_phone() -> None:
    context = {
        "lead": {"id": "lead-8", "prospect_name": "No Phone", "email": "nophone@example.com", "phone": None},
        "company": {"id": "company-8", "name": "No Phone Co"},
        "contact": {"first_name": "Riley"},
        "assignment_information": {"current_stage": "contacted"},
    }
    agent = SalesAgent(tool_registry=DummySalesRegistry(context, _intelligence(lead_id="lead-8", lead_name="No Phone", lead_score=40, priority="medium", urgency="medium", buying_intent="warm", recommended_pipeline_stage="Discovery Scheduled")))

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-8"))

    assert result.email.subject is not None
    assert result.whatsapp["message"] is None


@pytest.mark.asyncio
async def test_sales_agent_permission_failure() -> None:
    agent = SalesAgent(
        tool_registry=DummySalesRegistry(
            context={},
            intelligence=_intelligence(),
            error=HTTPException(status_code=403, detail="Access denied"),
        )
    )

    with pytest.raises(HTTPException) as exc:
        await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-9"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_sales_agent_tenant_isolation_failure() -> None:
    agent = SalesAgent(
        tool_registry=DummySalesRegistry(
            context={},
            intelligence=_intelligence(),
            error=HTTPException(status_code=403, detail="Tenant isolation violation"),
        )
    )

    with pytest.raises(HTTPException) as exc:
        await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-10"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_sales_agent_manual_mode_generates_without_sending() -> None:
    registry = DummySalesRegistry(
        context={
            "lead": {"id": "lead-11", "prospect_name": "Manual Lead", "email": "manual@example.com", "phone": "55555"},
            "company": {"id": "company-11", "name": "Manual Co"},
            "contact": {"first_name": "Morgan"},
            "assignment_information": {"current_stage": "contacted"},
        },
        intelligence=_intelligence(lead_id="lead-11", lead_name="Manual Lead", lead_score=60, priority="medium", urgency="medium", buying_intent="warm", recommended_pipeline_stage="Discovery Scheduled"),
    )
    agent = SalesAgent(tool_registry=registry)

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-11", execution_mode="manual"))

    assert result.execution_mode == "manual"
    assert result.execution_status == "generated"
    assert result.delivery["sent"] is False
    assert result.delivery["actions"] == []


@pytest.mark.asyncio
async def test_sales_agent_auto_mode_executes_business_tools() -> None:
    registry = DummySalesRegistry(
        context={
            "lead": {"id": "lead-12", "prospect_name": "Auto Lead", "email": "auto@example.com", "phone": "66666"},
            "company": {"id": "company-12", "name": "Auto Co"},
            "contact": {"first_name": "Ava"},
            "assignment_information": {"current_stage": "qualified"},
        },
        intelligence=_intelligence(lead_id="lead-12", lead_name="Auto Lead", lead_score=88, priority="high", urgency="immediate", buying_intent="hot", recommended_pipeline_stage="Proposal Sent", recommended_next_action="Send a proposal"),
    )
    agent = SalesAgent(tool_registry=registry)

    result = await agent.analyze(_user(), AISalesAgentRequest(lead_id="lead-12", execution_mode="auto"))

    tools = [item["tool"] for item in result.delivery["actions"]]
    assert result.execution_mode == "auto"
    assert result.execution_status == "sent"
    assert result.delivery["sent"] is True
    assert "sendSalesEmail" in tools
    assert "sendWhatsAppMessage" in tools
    assert "scheduleMeeting" in tools
    assert "createFollowUp" in tools
    assert "updateCRMActivity" in tools
    assert "recordTimelineEvent" in tools
    assert "recordAuditEvent" in tools
