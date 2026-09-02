"""
HR Operations Agent API Endpoint.

Provides a chat interface for the HR Agent that handles employee management,
recruitment, attendance, leave, documents, and payroll queries.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.agents.hr.service import HRAgentService
from app.api.dependencies import get_current_user
from app.core.config import settings
from app.models.user import User


router = APIRouter()
hr_service = HRAgentService()


def _require_hr_agent_enabled() -> None:
    if not settings.HR_AGENT_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="HR Agent is not enabled. Set HR_AGENT_ENABLED=true in your environment.",
        )


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class HRChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=6000, description="Natural-language HR question")
    conversation_id: str | None = Field(default=None, max_length=128)
    session_id: str | None = Field(default=None, max_length=128)
    selected_record_type: str | None = Field(
        default=None,
        max_length=80,
        description="Pre-selected entity type: employee, candidate, or job",
    )
    selected_record_id: str | None = Field(
        default=None,
        max_length=128,
        description="Pre-selected entity _id",
    )


class HRChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    answer: str
    conversation_id: str | None = None
    session_id: str | None = None
    entity_context: dict[str, Any] = Field(default_factory=dict)
    usage: dict[str, Any] = Field(default_factory=dict)
    tool_calls_summary: list[dict[str, Any]] = Field(default_factory=list)
    error_detail: str | None = None


class HRQuickActionsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actions: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=HRChatResponse)
async def hr_agent_chat(
    payload: HRChatRequest,
    current_user: User = Depends(get_current_user),
) -> HRChatResponse:
    """Chat with the HR Operations Agent.

    The agent investigates SynTask data and returns data-grounded answers
    about employees, candidates, jobs, attendance, leave, documents,
    recruitment, and payroll (when available).
    """
    _require_hr_agent_enabled()

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

    result = await hr_service.chat(
        current_user=current_user,
        message=payload.message,
        conversation_id=payload.conversation_id,
        session_id=payload.session_id,
        entity_context=entity_context,
    )

    return HRChatResponse(**result)


@router.get("/quick-actions", response_model=HRQuickActionsResponse)
async def hr_quick_actions(
    current_user: User = Depends(get_current_user),
) -> HRQuickActionsResponse:
    """Return HR-specific quick action prompts for the chat UI."""
    _require_hr_agent_enabled()

    actions = [
        {
            "key": "attention",
            "label": "What needs HR attention today?",
            "prompt": "What needs HR attention today? Give me a prioritized summary.",
        },
        {
            "key": "employee-360",
            "label": "Employee 360",
            "prompt": "Tell me everything important about an employee. I'll tell you who.",
        },
        {
            "key": "recruitment",
            "label": "Recruitment status",
            "prompt": "What is happening with our recruitment pipeline?",
        },
        {
            "key": "interviews",
            "label": "Pending interviews",
            "prompt": "Which interviews are waiting for feedback?",
        },
        {
            "key": "leave",
            "label": "Pending leave requests",
            "prompt": "Which leave requests need attention?",
        },
        {
            "key": "hiring-blockers",
            "label": "Hiring blockers",
            "prompt": "Are there any hiring blockers I should know about?",
        },
        {
            "key": "absent",
            "label": "Who is absent today?",
            "prompt": "Who is absent today?",
        },
    ]

    return HRQuickActionsResponse(actions=actions)
