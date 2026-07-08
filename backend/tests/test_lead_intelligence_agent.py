from __future__ import annotations

import os
from types import SimpleNamespace

import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-test-secret")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-test-encryption-key-1234")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SUPER_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "SuperAdmin123!")

from app.ai.agents.lead_intelligence import LeadIntelligenceAgent
from app.ai.tools import ToolResult
from app.schemas.ai import AILeadIntelligenceRequest


class DummyToolRegistry:
    def __init__(self, context: dict[str, object], search_results: dict[str, object] | None = None) -> None:
        self.context = context
        self.search_results = search_results or {"leads": []}

    async def execute(self, tool_name: str, payload: dict[str, object], context) -> ToolResult:
        if tool_name == "getCRMContext":
            return ToolResult(tool_name=tool_name, success=True, data=self.context)
        if tool_name == "searchCRM":
            return ToolResult(tool_name=tool_name, success=True, data=self.search_results)
        return ToolResult(tool_name=tool_name, success=False, data={}, error=f"Unexpected tool {tool_name}")


def _user() -> SimpleNamespace:
    return SimpleNamespace(id="user-1", company_id="company-1", role=SimpleNamespace(value="admin"))


@pytest.mark.asyncio
async def test_lead_intelligence_marks_cold_lead() -> None:
    registry = DummyToolRegistry(
        context={
            "lead": {"id": "lead-1", "prospect_name": "Local Bakery", "source": "manual", "phone": "", "email": None},
            "company": None,
            "contact": None,
            "deal": None,
            "proposals": [],
            "notes": {"total": 0},
            "files": {"total": 0},
            "recent_activities": [],
            "recent_follow_ups": [],
            "recent_tasks": [],
            "timeline": {"total": 0, "items": []},
            "assignment_information": {"assigned_to": "sales-1", "assigned_to_name": "Alex Sales", "current_stage": "new"},
            "source_information": {"source": "manual"},
        },
    )
    agent = LeadIntelligenceAgent(tool_registry=registry)

    result = await agent.analyze(_user(), AILeadIntelligenceRequest(lead_id="lead-1"))

    assert result.lead_score <= 20
    assert result.priority == "low"
    assert result.urgency == "low"
    assert result.buying_intent == "cold"
    assert result.recommended_pipeline_stage == "new"


@pytest.mark.asyncio
async def test_lead_intelligence_marks_hot_enterprise_lead() -> None:
    registry = DummyToolRegistry(
        context={
            "lead": {"id": "lead-2", "prospect_name": "Enterprise Prospect", "source": "website_form", "phone": "99999", "email": "lead@enterprise.com"},
            "company": {"id": "company-2", "name": "Enterprise Co", "company_size": "1000+", "phone": "99999"},
            "contact": {"id": "contact-1", "first_name": "Jane", "last_name": "Doe"},
            "deal": {"id": "deal-1", "stage": "Proposal Sent", "value": 250000},
            "proposals": [{"id": "proposal-1"}, {"id": "proposal-2"}],
            "notes": {"total": 4},
            "files": {"total": 2},
            "recent_activities": [{"id": "a1"}, {"id": "a2"}],
            "recent_follow_ups": [{"id": "f1"}],
            "recent_tasks": [{"id": "t1"}],
            "timeline": {"total": 12, "items": [{"id": "timeline-1"}]},
            "assignment_information": {"assigned_to": "sales-2", "assigned_to_name": "Taylor Seller", "current_stage": "qualified"},
            "source_information": {"source": "website_form"},
        },
    )
    agent = LeadIntelligenceAgent(tool_registry=registry)

    result = await agent.analyze(_user(), AILeadIntelligenceRequest(lead_id="lead-2"))

    assert result.lead_score >= 80
    assert result.priority == "high"
    assert result.urgency in {"immediate", "high"}
    assert result.buying_intent in {"enterprise", "hot", "existing_customer"}
    assert result.recommended_pipeline_stage in {"Proposal Sent", "Qualified"}
    assert result.recommended_salesperson["name"] == "Taylor Seller"


@pytest.mark.asyncio
async def test_lead_intelligence_detects_duplicates() -> None:
    registry = DummyToolRegistry(
        context={
            "lead": {"id": "lead-3", "prospect_name": "Acme Studios", "source": "manual", "phone": "77777", "email": "acme@example.com"},
            "company": None,
            "contact": None,
            "deal": None,
            "proposals": [],
            "notes": {"total": 1},
            "files": {"total": 0},
            "recent_activities": [],
            "recent_follow_ups": [],
            "recent_tasks": [],
            "timeline": {"total": 1, "items": [{"id": "timeline-1"}]},
            "assignment_information": {"assigned_to": "sales-1", "assigned_to_name": "Alex Sales", "current_stage": "contacted"},
            "source_information": {"source": "manual"},
        },
        search_results={
            "leads": [
                {"id": "lead-3", "prospect_name": "Acme Studios", "email": "acme@example.com", "phone": "77777"},
                {"id": "lead-99", "prospect_name": "Acme Studios Copy", "email": "acme@example.com", "phone": "99999"},
            ]
        },
    )
    agent = LeadIntelligenceAgent(tool_registry=registry)

    result = await agent.analyze(_user(), AILeadIntelligenceRequest(lead_id="lead-3"))

    assert result.duplicate_risk is True
    assert result.duplicate_matches
    assert result.urgency == "review"
