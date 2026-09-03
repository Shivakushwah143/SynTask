"""
Executive Operations Agent Service — API-facing service layer.

Handles:
- Hybrid Query Gate routing (deterministic + semantic fallback)
- Fast-fact deterministic handlers (0 Groq calls for simple questions)
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

from app.agents.executive.agent import ExecutiveOperationsAgent, AgentLoopResult
from app.agents.query_gate import QueryGate, QueryGateResult, QueryPath
from app.agents.fast_facts import execute_fast_fact
from app.agents.fast_fact_scope import extract_fast_fact_scope
from app.agents.query_analytics import capture_query_event
from app.agents.answer_blocks import build_fast_fact_blocks
from app.core.clock import utc_now
from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)


def _scope_summary(scope) -> str:
    """Short human summary of a resolved fast-fact scope (for logs)."""
    parts = []
    if getattr(scope, "employee_name", None):
        parts.append(f"employee={scope.employee_name}")
    if getattr(scope, "project_id", None):
        parts.append(f"project={scope.project_id}")
    if getattr(scope, "client_name", None):
        parts.append(f"client={scope.client_name}")
    if getattr(scope, "lead_name", None):
        parts.append(f"lead={scope.lead_name}")
    if getattr(scope, "job_title", None):
        parts.append(f"job={scope.job_title}")
    return "|".join(parts) or "company-wide"


class ExecutiveAgentService:
    """Service layer for the Executive Operations Agent."""

    def __init__(self) -> None:
        self.agent = ExecutiveOperationsAgent()
        self.query_gate = QueryGate()

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
        """Process an executive agent chat request."""
        company_id = getattr(current_user, "company_id", None)
        if not company_id:
            return {
                "success": False,
                "error": "Tenant scope required.",
                "answer": "You must belong to a company to use the Executive Operations Agent.",
            }

        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

        start_time = time.perf_counter()

        # ── Query Gate: determine cheapest execution path ──────────────────────
        gate_result = await self.query_gate.classify(
            message=message,
            company_id=str(company_id),
            user_role=user_role,
            conversation_history=conversation_history,
        )

        # ── FAST_FACT path: deterministic, 0 Groq calls ───────────────────────
        # Entity scope is resolved FIRST (only when the gate chose FAST_FACT) so
        # an employee/project/client mention (e.g. "Gaurav ke kitne task pending
        # hain?") never falls back to a company-wide count. If the entity cannot
        # be resolved, route to Executive reasoning instead of guessing.
        fast_fact_scope = None
        if gate_result.path == QueryPath.FAST_FACT and gate_result.fast_fact_handler:
            fast_fact_scope = await extract_fast_fact_scope(message, str(company_id))
            if fast_fact_scope.must_route_to_executive:
                logger.info(
                    "Fast-fact entity scope unresolved for '%s' (%s) — routing to Executive reasoning",
                    message[:80], "; ".join(fast_fact_scope.unresolved),
                )
                gate_result = QueryGateResult(
                    path=QueryPath.EXECUTIVE,
                    confidence=0.6,
                    reason="fast_fact_entity_unresolved",
                )
            else:
                logger.info(
                    "Query Gate: FAST_FACT path for '%s' (handler=%s, confidence=%.2f, scope=%s)",
                    message[:80], gate_result.fast_fact_handler, gate_result.confidence,
                    _scope_summary(fast_fact_scope),
                )
                fast_result = await execute_fast_fact(
                    gate_result.fast_fact_handler,
                    str(company_id),
                    scope=fast_fact_scope,
                )
                latency_ms = (time.perf_counter() - start_time) * 1000

                response = {
                    "success": True,
                    "answer": fast_result["answer"],
                    "answer_blocks": build_fast_fact_blocks(fast_result.get("facts"), title="Result"),
                    "conversation_id": conversation_id or str(uuid4()),
                    "session_id": session_id or str(uuid4()),
                    "entity_context": entity_context or {},
                    "usage": {
                        "model": "deterministic",
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0,
                        "steps_used": 0,
                        "max_steps": 0,
                        "groq_calls": 0,
                        "latency_ms": round(latency_ms, 1),
                        "path": "FAST_FACT",
                        "query_gate": {
                            "path": gate_result.path.value,
                            "handler": gate_result.fast_fact_handler,
                            "confidence": gate_result.confidence,
                            "reason": gate_result.reason,
                        },
                    },
                    "tool_calls_summary": [],
                }

                # Audit log (non-blocking)
                try:
                    await self._audit_log(
                        company_id=str(company_id),
                        user_id=str(current_user.id),
                        message=message,
                        result=None,
                        conversation_id=response["conversation_id"],
                        path="FAST_FACT",
                    )
                except Exception:
                    logger.exception("Executive Agent audit log failed")

                return response

        # ── EXECUTIVE path: LLM reasoning (all domains) ──────────────────────
        company_modules = [str(m).lower() for m in (getattr(current_user, "modules", None) or [])]
        result: AgentLoopResult = await self.agent.run(
            company_id=str(company_id),
            user_id=str(current_user.id),
            user_role=user_role,
            message=message,
            conversation_history=conversation_history,
            entity_context=entity_context,
            modules=company_modules,
        )

        latency_ms = (time.perf_counter() - start_time) * 1000

        # Build response
        response = {
            "success": result.success,
            "answer": result.answer,
            "answer_blocks": result.answer_blocks,
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

        # Add query gate metadata (nested under usage; the response model forbids
        # unknown top-level keys)
        response["usage"]["query_gate"] = {
            "path": gate_result.path.value,
            "confidence": gate_result.confidence,
            "reason": gate_result.reason,
        }
        response["usage"]["latency_ms"] = round(latency_ms, 1)
        response["usage"]["groq_calls"] = result.groq_call_count
        response["usage"]["path"] = gate_result.path.value
        response["usage"]["capability_packs"] = result.capability_packs_used
        response["usage"]["selected_tools"] = result.selected_tools

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
                path=gate_result.path.value,
            )
        except Exception:
            logger.exception("Executive Agent audit log failed")

        # Query analytics (non-blocking)
        try:
            capture_query_event(
                company_id=str(company_id),
                user_id=str(current_user.id),
                conversation_id=response["conversation_id"],
                message=message,
                path=gate_result.path.value,
                agent_id="executive_operations_agent",
                selected_tools=result.selected_tools,
                packs_used=result.capability_packs_used,
                success=result.success,
                error=result.error,
                groq_calls=result.groq_call_count,
                total_tokens=result.total_tokens,
                latency_ms=latency_ms,
            )
        except Exception:
            logger.debug("Query analytics capture failed", exc_info=True)

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
        error). Deterministic FAST_FACT paths still short-circuit with 0 Groq
        calls and stream their answer immediately.
        """
        from app.agents.streaming import (
            STATUS_UNDERSTANDING,
            status_event,
            token_event,
        )

        company_id = getattr(current_user, "company_id", None)
        if not company_id:
            yield {
                "type": "error",
                "message": "Tenant scope required.",
                "data": {
                    "success": False,
                    "error": "TENANT_REQUIRED",
                    "answer": "You must belong to a company to use the Executive Operations Agent.",
                },
            }
            return

        user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

        t0 = time.perf_counter()
        timings: dict[str, Any] = {"_t0": t0, "request_received": 0.0}
        conv_id = conversation_id or str(uuid4())
        sess_id = session_id or str(uuid4())

        # First UI event immediately — classification may take up to a Groq call.
        yield status_event("accepted", STATUS_UNDERSTANDING)

        gate_result = await self.query_gate.classify(
            message=message,
            company_id=str(company_id),
            user_role=user_role,
            conversation_history=conversation_history,
        )
        timings["routing_done"] = round((time.perf_counter() - t0) * 1000, 1)

        # ── FAST_FACT path: deterministic, 0 Groq calls ───────────────────────
        # Same entity-scope guard as ``chat``: a mentioned employee/project/etc
        # is resolved first; unresolved mentions route to Executive reasoning.
        fast_fact_scope = None
        if gate_result.path == QueryPath.FAST_FACT and gate_result.fast_fact_handler:
            fast_fact_scope = await extract_fast_fact_scope(message, str(company_id))
            if fast_fact_scope.must_route_to_executive:
                logger.info(
                    "Fast-fact entity scope unresolved for '%s' (%s) — routing to Executive reasoning",
                    message[:80], "; ".join(fast_fact_scope.unresolved),
                )
                gate_result = QueryGateResult(
                    path=QueryPath.EXECUTIVE,
                    confidence=0.6,
                    reason="fast_fact_entity_unresolved",
                )
            else:
                fast_result = await execute_fast_fact(
                    gate_result.fast_fact_handler,
                    str(company_id),
                    scope=fast_fact_scope,
                )
                timings["first_answer_token"] = round((time.perf_counter() - t0) * 1000, 1)
                timings["response_done"] = round((time.perf_counter() - t0) * 1000, 1)

                yield status_event("answer", "Preparing your answer…")
                yield token_event(fast_result["answer"])

                latency_ms = round((time.perf_counter() - t0) * 1000, 1)
                response = {
                    "success": True,
                    "answer": fast_result["answer"],
                    "answer_blocks": build_fast_fact_blocks(fast_result.get("facts"), title="Result"),
                    "conversation_id": conv_id,
                    "session_id": sess_id,
                    "entity_context": entity_context or {},
                    "usage": {
                        "model": "deterministic",
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0,
                        "steps_used": 0,
                        "max_steps": 0,
                        "groq_calls": 0,
                        "latency_ms": latency_ms,
                        "path": "FAST_FACT",
                        "telemetry_ms": {
                            k: timings.get(k)
                            for k in (
                                "request_received", "routing_done", "first_groq_started",
                                "first_groq_done", "tools_done", "first_answer_token",
                                "response_done",
                            )
                        },
                        "query_gate": {
                            "path": gate_result.path.value,
                            "handler": gate_result.fast_fact_handler,
                            "confidence": gate_result.confidence,
                            "reason": gate_result.reason,
                        },
                    },
                    "tool_calls_summary": [],
                }
                yield {"type": "done", "data": response}

                # Audit log (best-effort, non-blocking)
                try:
                    await self._audit_log(
                        company_id=str(company_id),
                        user_id=str(current_user.id),
                        message=message,
                        result=None,
                        conversation_id=conv_id,
                        path="FAST_FACT",
                    )
                except Exception:
                    logger.exception("Executive Agent audit log failed")
                return

        # ── EXECUTIVE path: LLM reasoning (all domains) ──────────────────────
        company_modules = [str(m).lower() for m in (getattr(current_user, "modules", None) or [])]

        async for ev in self.agent.run_stream(
            company_id=str(company_id),
            user_id=str(current_user.id),
            user_role=user_role,
            message=message,
            conversation_history=conversation_history,
            entity_context=entity_context,
            modules=company_modules,
            timings=timings,
        ):
            if ev["type"] == "done":
                payload = self._finalize_stream_payload(
                    result_data=ev["data"],
                    gate_result=gate_result,
                    timings=timings,
                    t0=t0,
                    conversation_id=conv_id,
                    session_id=sess_id,
                )
                # Audit + analytics on completion (best-effort)
                try:
                    await self._audit_log(
                        company_id=str(company_id),
                        user_id=str(current_user.id),
                        message=message,
                        result=None,
                        conversation_id=conv_id,
                        path=gate_result.path.value,
                        extra_meta={
                            "success": payload.get("success"),
                            "steps_used": payload.get("usage", {}).get("steps_used"),
                            "tools_called": len(payload.get("tool_calls_summary") or []),
                            "model": payload.get("usage", {}).get("model"),
                            "total_tokens": payload.get("usage", {}).get("total_tokens"),
                            "groq_calls": payload.get("usage", {}).get("groq_calls"),
                            "error": payload.get("error_detail"),
                            "tools_used": [t.get("tool") for t in (payload.get("tool_calls_summary") or [])],
                        },
                    )
                    capture_query_event(
                        company_id=str(company_id),
                        user_id=str(current_user.id),
                        conversation_id=conv_id,
                        message=message,
                        path=gate_result.path.value,
                        agent_id="executive_operations_agent",
                        selected_tools=payload.get("usage", {}).get("selected_tools") or [],
                        packs_used=payload.get("usage", {}).get("capability_packs") or [],
                        success=payload.get("success", False),
                        error=payload.get("error_detail"),
                        groq_calls=payload.get("usage", {}).get("groq_calls") or 0,
                        total_tokens=payload.get("usage", {}).get("total_tokens") or 0,
                        latency_ms=payload.get("usage", {}).get("latency_ms") or 0,
                    )
                except Exception:
                    logger.debug("Executive Agent stream audit/analytics failed", exc_info=True)
                yield {"type": "done", "data": payload}
            elif ev["type"] == "error":
                payload = self._finalize_stream_payload(
                    result_data=ev["data"],
                    gate_result=gate_result,
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
        gate_result: Any,
        timings: dict[str, Any],
        t0: float,
        conversation_id: str,
        session_id: str,
    ) -> dict[str, Any]:
        """Compose the endpoint-facing payload for a streamed agent result."""
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
            "answer_blocks": result_data.get("answer_blocks") or [],
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
                "path": gate_result.path.value if gate_result else "EXECUTIVE",
                "capability_packs": result_data.get("capability_packs_used") or [],
                "selected_tools": result_data.get("selected_tools") or [],
                "telemetry_ms": telemetry,
                "query_gate": {
                    "path": gate_result.path.value,
                    "confidence": gate_result.confidence,
                    "reason": gate_result.reason,
                } if gate_result else None,
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
        result: AgentLoopResult | None,
        conversation_id: str,
        path: str = "EXECUTIVE",
        extra_meta: dict[str, Any] | None = None,
    ) -> None:
        """Write a lightweight audit event."""
        try:
            from app.models.agent import AgentRunEvent

            event = AgentRunEvent(
                event_id=str(uuid4()),
                run_id=conversation_id,
                tenant_id=company_id,
                previous_state=None,
                new_state="completed" if (result.success if result else True) else "failed",
                event_type="executive_agent_chat",
                actor_type="user",
                actor_id=user_id,
                reason=message[:500],
                metadata=extra_meta or {
                    "success": result.success if result else True,
                    "path": path,
                    "steps_used": result.steps_used if result else 0,
                    "tools_called": len(result.tool_executions) if result else 0,
                    "model": result.model if result else "deterministic",
                    "total_tokens": result.total_tokens if result else 0,
                    "groq_calls": result.groq_call_count if result else 0,
                    "error": result.error if result else None,
                    "tools_used": [te.tool_name for te in result.tool_executions] if result else [],
                },
                occurred_at=utc_now(),
            )
            await event.insert()
        except Exception:
            logger.exception("Executive Agent audit event write failed")
