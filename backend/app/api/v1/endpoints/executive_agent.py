"""
Executive Operations Agent API Endpoint.

Provides a chat interface for the Executive Agent that handles company-wide
intelligence: projects, tasks, clients, sales, HR, finance, and meetings.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.agents.executive.service import ExecutiveAgentService
from app.api.dependencies import get_current_user
from app.core.config import settings
from app.models.user import User


router = APIRouter()
executive_service = ExecutiveAgentService()


def _require_executive_agent_enabled() -> None:
    if not settings.EXECUTIVE_AGENT_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Executive Operations Agent is not enabled. Set EXECUTIVE_AGENT_ENABLED=true in your environment.",
        )


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ExecutiveChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=6000, description="Natural-language executive question")
    conversation_id: str | None = Field(default=None, max_length=128)
    session_id: str | None = Field(default=None, max_length=128)
    selected_record_type: str | None = Field(
        default=None,
        max_length=80,
        description="Pre-selected entity type: project, client, employee, lead, etc.",
    )
    selected_record_id: str | None = Field(
        default=None,
        max_length=128,
        description="Pre-selected entity _id",
    )


class ExecutiveChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    answer: str
    conversation_id: str | None = None
    session_id: str | None = None
    entity_context: dict[str, Any] = Field(default_factory=dict)
    usage: dict[str, Any] = Field(default_factory=dict)
    tool_calls_summary: list[dict[str, Any]] = Field(default_factory=list)
    error_detail: str | None = None


class ExecutiveQuickActionsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actions: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=ExecutiveChatResponse)
async def executive_agent_chat(
    payload: ExecutiveChatRequest,
    current_user: User = Depends(get_current_user),
) -> ExecutiveChatResponse:
    """Chat with the Executive Operations Agent.

    The agent investigates SynTask data across all business domains and returns
    data-grounded, cross-domain answers about the company state.
    """
    _require_executive_agent_enabled()

    if not getattr(current_user, "company_id", None):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant scope required",
        )

    # Build entity context from selected record
    entity_context: dict[str, Any] = {}
    if payload.selected_record_type and payload.selected_record_id:
        entity_context = {
            "selected_record_type": payload.selected_record_type,
            "selected_record_id": payload.selected_record_id,
        }

    result = await executive_service.chat(
        current_user=current_user,
        message=payload.message,
        conversation_id=payload.conversation_id,
        session_id=payload.session_id,
        entity_context=entity_context,
    )

    return ExecutiveChatResponse(**result)


@router.get("/quick-actions", response_model=ExecutiveQuickActionsResponse)
async def executive_quick_actions(
    current_user: User = Depends(get_current_user),
) -> ExecutiveQuickActionsResponse:
    """Return executive-specific quick action prompts for the chat UI."""
    _require_executive_agent_enabled()

    actions = [
        {
            "key": "attention",
            "label": "What needs my attention today?",
            "prompt": "What needs my attention today? Give me a prioritized executive brief.",
        },
        {
            "key": "company-health",
            "label": "Company health",
            "prompt": "How is the company doing? Give me a high-level health check.",
        },
        {
            "key": "project-risks",
            "label": "Project risks",
            "prompt": "Which projects are at risk or delayed?",
        },
        {
            "key": "client-risks",
            "label": "Client risks",
            "prompt": "Which clients are at risk and why?",
        },
        {
            "key": "sales",
            "label": "Sales status",
            "prompt": "How is sales performing this month?",
        },
        {
            "key": "team-workload",
            "label": "Team workload",
            "prompt": "Who has the highest workload right now?",
        },
        {
            "key": "finance",
            "label": "Finance status",
            "prompt": "Which invoices are overdue and how much is receivable?",
        },
        {
            "key": "hr",
            "label": "HR status",
            "prompt": "What is happening with HR? Any attendance or hiring issues?",
        },
    ]

    return ExecutiveQuickActionsResponse(actions=actions)
