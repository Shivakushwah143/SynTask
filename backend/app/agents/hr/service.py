"""
HR Agent Service — API-facing service that wraps the HR agent loop.

Handles:
- Audit logging via existing AgentRun / AgentRunEvent infrastructure
- Conversation/session management
- Entity context persistence across turns
- Error normalization
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional
from uuid import uuid4

from app.agents.hr.agent import HROperationsAgent, AgentLoopResult
from app.core.clock import utc_now
from app.models.user import User

logger = logging.getLogger(__name__)


class HRAgentService:
    """Service layer for the HR Operations Agent."""

    def __init__(self) -> None:
        self.agent = HROperationsAgent()

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
        """Process an HR agent chat request.

        Returns a structured response dict suitable for the API response model.
        """
        company_id = getattr(current_user, "company_id", None)
        if not company_id:
            return {
                "success": False,
                "error": "Tenant scope required.",
                "answer": "You must belong to a company to use the HR Agent.",
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
            logger.exception("HR Agent audit log failed")

        return response

    async def stream_chat(
        self,
        *,
        current_user: User,
        message: str,
        conversation_id: str | None = None,
        session_id: str | None = None,
        entity_context: dict[str, Any] | None = None,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> Any:
        """Streaming variant of ``chat``.

        Async generator yielding user-safe wire events (status / token / done /
        error). The HR agent has no deterministic fast-fact tier today, so the
        agent loop streams directly — business behavior is unchanged.
        """
        from app.agents.streaming import (
            STATUS_UNDERSTANDING,
            status_event,
        )

        company_id = getattr(current_user, "company_id", None)
        if not company_id:
            yield {
                "type": "error",
                "message": "Tenant scope required.",
                "data": {
                    "success": False,
                    "error": "TENANT_REQUIRED",
                    "answer": "You must belong to a company to use the HR Agent.",
                },
            }
            return

        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

        t0 = time.perf_counter()
        timings: dict[str, Any] = {"_t0": t0, "request_received": 0.0}
        conv_id = conversation_id or str(uuid4())
        sess_id = session_id or str(uuid4())

        # First UI event immediately.
        yield status_event("accepted", STATUS_UNDERSTANDING)
        timings["routing_done"] = round((time.perf_counter() - t0) * 1000, 1)

        async for ev in self.agent.run_stream(
            company_id=str(company_id),
            user_id=str(current_user.id),
            user_role=user_role,
            message=message,
            conversation_history=conversation_history,
            entity_context=entity_context,
            timings=timings,
        ):
            if ev["type"] == "done":
                payload = self._finalize_stream_payload(
                    result_data=ev["data"],
                    timings=timings,
                    t0=t0,
                    conversation_id=conv_id,
                    session_id=sess_id,
                )
                # Audit log (best-effort)
                try:
                    await self._audit_log(
                        company_id=str(company_id),
                        user_id=str(current_user.id),
                        message=message,
                        result=None,
                        conversation_id=conv_id,
                        extra_meta={
                            "success": payload.get("success"),
                            "steps_used": payload.get("usage", {}).get("steps_used"),
                            "tools_called": len(payload.get("tool_calls_summary") or []),
                            "model": payload.get("usage", {}).get("model"),
                            "total_tokens": payload.get("usage", {}).get("total_tokens"),
                            "error": payload.get("error_detail"),
                        },
                    )
                except Exception:
                    logger.exception("HR Agent audit log failed")
                yield {"type": "done", "data": payload}
            elif ev["type"] == "error":
                payload = self._finalize_stream_payload(
                    result_data=ev["data"],
                    timings=timings,
                    t0=t0,
                    conversation_id=conv_id,
                    session_id=sess_id,
                )
                yield {"type": "error", "message": ev.get("message", "Request failed"), "data": payload}
            else:
                yield ev

    @staticmethod
    def _finalize_stream_payload(
        *,
        result_data: dict[str, Any],
        timings: dict[str, Any],
        t0: float,
        conversation_id: str,
        session_id: str,
    ) -> dict[str, Any]:
        """Compose the endpoint-facing payload for a streamed HR agent result."""
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        timings.setdefault("response_done", round((time.perf_counter() - t0) * 1000, 1))
        telemetry = {
            k: timings.get(k)
            for k in (
                "request_received", "routing_done", "first_groq_started",
                "first_groq_done", "tools_done", "first_answer_token",
                "response_done",
            )
        }
        success = bool(result_data.get("success"))
        response = {
            "success": success,
            "answer": result_data.get("answer") or "I was unable to generate a response.",
            "conversation_id": conversation_id,
            "session_id": session_id,
            "entity_context": result_data.get("entity_context") or {},
            "usage": {
                "model": result_data.get("model") or "",
                "prompt_tokens": result_data.get("prompt_tokens") or 0,
                "completion_tokens": result_data.get("completion_tokens") or 0,
                "total_tokens": result_data.get("total_tokens") or 0,
                "steps_used": result_data.get("steps_used") or 0,
                "max_steps": result_data.get("max_steps") or 0,
                "latency_ms": latency_ms,
                "groq_calls": result_data.get("groq_call_count") or 0,
                "telemetry_ms": telemetry,
            },
            "tool_calls_summary": result_data.get("tool_calls_summary") or [],
        }
        if not success and result_data.get("error"):
            response["error_detail"] = result_data["error"]
        return response

    async def _audit_log(
        self,
        *,
        company_id: str,
        user_id: str,
        message: str,
        result: AgentLoopResult | None = None,
        conversation_id: str,
        extra_meta: dict[str, Any] | None = None,
    ) -> None:
        """Write a lightweight audit event for the HR agent interaction."""
        try:
            from app.models.agent import AgentRunEvent

            event = AgentRunEvent(
                event_id=str(uuid4()),
                run_id=conversation_id,
                tenant_id=company_id,
                previous_state=None,
                new_state="completed" if (result.success if result else True) else "failed",
                event_type="hr_agent_chat",
                actor_type="user",
                actor_id=user_id,
                reason=message[:500],
                metadata=extra_meta or {
                    "success": result.success if result else True,
                    "steps_used": result.steps_used if result else 0,
                    "tools_called": len(result.tool_executions) if result else 0,
                    "model": result.model if result else "",
                    "total_tokens": result.total_tokens if result else 0,
                    "error": result.error if result else None,
                },
                occurred_at=utc_now(),
            )
            await event.insert()
        except Exception:
            logger.exception("HR Agent audit event write failed")
