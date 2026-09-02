"""
Executive Operations Agent Service — API-facing service layer.

Handles:
- Audit logging via existing AgentRun / AgentRunEvent infrastructure
- Conversation/session management
- Entity context persistence across turns
- Error normalization
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import uuid4

from app.agents.executive.agent import ExecutiveOperationsAgent, AgentLoopResult
from app.core.clock import utc_now
from app.models.user import User

logger = logging.getLogger(__name__)


class ExecutiveAgentService:
    """Service layer for the Executive Operations Agent."""

    def __init__(self) -> None:
        self.agent = ExecutiveOperationsAgent()

    async def chat(
        self,
        *,
        current_user: User,
        message: str,
        conversation_id: str | None = None,
        session_id: str | None = None,
        entity_context: dict[str, Any] | None = None,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """Process an executive agent chat request.

        Returns a structured response dict suitable for the API response model.
        """
        company_id = getattr(current_user, "company_id", None)
        if not company_id:
            return {
                "success": False,
                "error": "Tenant scope required.",
                "answer": "You must belong to a company to use the Executive Operations Agent.",
            }

        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

        # Run the agent loop
        result: AgentLoopResult = await self.agent.run(
            company_id=str(company_id),
            user_id=str(current_user.id),
            user_role=user_role,
            message=message,
            conversation_history=conversation_history,
            entity_context=entity_context,
        )

        # Build response
        response = {
            "success": result.success,
            "answer": result.answer,
            "conversation_id": conversation_id or str(uuid4()),
            "session_id": session_id or str(uuid4()),
            "entity_context": result.entity_context,
            "usage": {
                "model": result.model,
                "prompt_tokens": result.prompt_tokens,
                "completion_tokens": result.completion_tokens,
                "total_tokens": result.total_tokens,
                "steps_used": result.steps_used,
                "max_steps": result.max_steps,
            },
            "tool_calls_summary": [
                {
                    "tool": te.tool_name,
                    "step": te.step,
                    "duration_ms": round(te.duration_ms, 1),
                    "has_error": "error" in te.result,
                }
                for te in result.tool_executions
            ],
        }

        if not result.success and result.error:
            response["error_detail"] = result.error

        # Audit log (non-blocking)
        try:
            await self._audit_log(
                company_id=str(company_id),
                user_id=str(current_user.id),
                message=message,
                result=result,
                conversation_id=response["conversation_id"],
            )
        except Exception:
            logger.exception("Executive Agent audit log failed")

        return response

    async def _audit_log(
        self,
        *,
        company_id: str,
        user_id: str,
        message: str,
        result: AgentLoopResult,
        conversation_id: str,
    ) -> None:
        """Write a lightweight audit event for the executive agent interaction."""
        try:
            from app.models.agent import AgentRunEvent

            event = AgentRunEvent(
                event_id=str(uuid4()),
                run_id=conversation_id,
                tenant_id=company_id,
                previous_state=None,
                new_state="completed" if result.success else "failed",
                event_type="executive_agent_chat",
                actor_type="user",
                actor_id=user_id,
                reason=message[:500],
                metadata={
                    "success": result.success,
                    "steps_used": result.steps_used,
                    "tools_called": len(result.tool_executions),
                    "model": result.model,
                    "total_tokens": result.total_tokens,
                    "error": result.error,
                    "tools_used": [te.tool_name for te in result.tool_executions],
                },
                occurred_at=utc_now(),
            )
            await event.insert()
        except Exception:
            logger.exception("Executive Agent audit event write failed")
