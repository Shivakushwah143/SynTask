"""
HR Operations Agent — the core agent loop.

Implements the mandatory pattern:
    Goal → Understand intent → Resolve entity → Fetch data → Reason →
    Fetch additional data → Answer → If action → proposal → Verify → Audit

Max steps are enforced via settings.HR_AGENT_MAX_STEPS.

The LLM is never the source of truth. SynTask database/services are.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from app.ai.providers.groq import GroqProvider
from app.core.config import settings
from app.core.clock import utc_now

from app.agents.hr.tools import HR_TOOL_SCHEMAS, execute_hr_tool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# HR Agent system prompt
# ---------------------------------------------------------------------------

HR_AGENT_SYSTEM_PROMPT = """You are SynTask's HR Operations Agent.

You help authorized users understand and operate Employee Management and Recruitment.

## Core Rules

1. **Read → Reason → Act → Verify**: Always fetch current SynTask data before answering.
2. **Never invent records**: If information doesn't exist, say what is missing.
3. **Use tools**: Call the provided tools to get real data from SynTask.
4. **Concise structured responses**: Return facts, not generic advice.
5. **Entity resolution**: When a user mentions a name, use search tools to resolve it.
6. **Follow-up context**: Remember the previously selected employee/candidate/job for pronoun references.
7. **Company isolation**: Only return data within the authorized company scope.
8. **Hiring fairness**: Use job-related evidence only for recruitment recommendations.
9. **Mutations require approval**: For any write actions, propose but do not execute directly.

## Response Format

Always structure your response with clear sections:
- **Summary**: One-line answer to the question.
- **Details**: Structured information from SynTask data.
- **Blockers**: Current issues or missing data (if any).
- **Next Action**: Recommended next step.

## Tool Usage

- Call tools with the exact arguments they expect.
- Use search_employees/search_candidates/search_jobs to resolve names.
- Use the 360 tools for comprehensive entity views.
- Use get_hr_attention_summary for daily briefs.
- Never make up employee IDs, candidate IDs, or job IDs — always search first.

## Important

- If the current branch doesn't have payroll/payslip modules, state that clearly.
- Do not provide generic HR advice — always reference actual SynTask data.
- If you cannot find an employee/candidate, say so explicitly.
"""


# ---------------------------------------------------------------------------
# Conversation turn tracking
# ---------------------------------------------------------------------------

@dataclass
class ToolExecution:
    tool_name: str
    arguments: dict[str, Any]
    result: dict[str, Any]
    step: int
    duration_ms: float


@dataclass
class AgentLoopResult:
    """Result from the HR agent loop."""
    answer: str
    tool_executions: list[ToolExecution] = field(default_factory=list)
    steps_used: int = 0
    max_steps: int = 0
    success: bool = True
    error: Optional[str] = None
    entity_context: dict[str, Any] = field(default_factory=dict)
    model: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


# ---------------------------------------------------------------------------
# HR Agent
# ---------------------------------------------------------------------------

class HROperationsAgent:
    """The HR Operations Agent — one unified agent for Employee Management + Recruitment.

    Uses Groq with tool calling to investigate SynTask data and provide
    accurate, data-grounded answers.
    """

    def __init__(self, *, provider: GroqProvider | None = None):
        self.provider = provider or GroqProvider()
        self.max_steps = settings.HR_AGENT_MAX_STEPS

    async def run(
        self,
        *,
        company_id: str,
        user_id: str,
        user_role: str,
        message: str,
        conversation_history: list[dict[str, str]] | None = None,
        entity_context: dict[str, Any] | None = None,
        security_context: Any = None,
    ) -> AgentLoopResult:
        """Execute the HR agent loop.

        Args:
            company_id: Tenant/company ID for isolation.
            user_id: Authenticated user ID.
            user_role: User's role string (admin, manager, etc.).
            message: User's natural-language question.
            conversation_history: Previous turns for follow-up context.
            entity_context: Pre-selected entity context (from entity pages).

        Returns:
            AgentLoopResult with the final answer and execution metadata.
        """
        if not settings.HR_AGENT_ENABLED:
            return AgentLoopResult(
                answer="The HR Agent is currently disabled. Please enable HR_AGENT_ENABLED in your environment.",
                success=False,
                error="HR_AGENT_DISABLED",
            )

        if not settings.GROQ_API_KEY:
            return AgentLoopResult(
                answer="The HR Agent cannot respond because GROQ_API_KEY is not configured.",
                success=False,
                error="GROQ_API_KEY_MISSING",
            )

        start_time = time.perf_counter()
        tool_executions: list[ToolExecution] = []
        entity_ctx = dict(entity_context or {})

        # Build initial messages
        messages = self._build_initial_messages(
            company_id=company_id,
            user_id=user_id,
            user_role=user_role,
            message=message,
            conversation_history=conversation_history,
            entity_context=entity_ctx,
        )

        # ── Filter tool schemas by authorization (before sending to LLM) ──────
        from app.ai.security.schema_filter import filter_hr_schemas_for_context
        if security_context is not None:
            hr_schemas = filter_hr_schemas_for_context(security_context, HR_TOOL_SCHEMAS)
        else:
            hr_schemas = HR_TOOL_SCHEMAS

        # Agent loop
        for step in range(1, self.max_steps + 1):
            try:
                result = await self.provider.generate_with_tools(
                    prompt="",
                    context={"company_id": company_id, "user_id": user_id, "role": user_role},
                    tools=hr_schemas,
                    options={
                        "system_prompt": HR_AGENT_SYSTEM_PROMPT,
                        "messages": messages,
                        "temperature": 0.1,
                        "max_tokens": 4096,
                    },
                )
            except Exception as exc:
                logger.exception("HR Agent Groq call failed at step %d", step)
                return AgentLoopResult(
                    answer=f"I encountered an error while processing your request: {exc}",
                    tool_executions=tool_executions,
                    steps_used=step,
                    max_steps=self.max_steps,
                    success=False,
                    error=f"PROVIDER_ERROR: {exc}",
                    entity_context=entity_ctx,
                )

            # No tool calls → final answer
            if not result.tool_calls:
                answer = result.content or "I was unable to generate a response."
                total_ms = (time.perf_counter() - start_time) * 1000
                logger.info(
                    "HR Agent completed in %d steps (%.0fms): %s",
                    step, total_ms, answer[:200],
                )
                return AgentLoopResult(
                    answer=answer,
                    tool_executions=tool_executions,
                    steps_used=step,
                    max_steps=self.max_steps,
                    success=True,
                    entity_context=entity_ctx,
                    model=result.model,
                    prompt_tokens=result.prompt_tokens or 0,
                    completion_tokens=result.completion_tokens or 0,
                    total_tokens=result.total_tokens or 0,
                )

            # Process tool calls
            # Append assistant message with tool calls
            assistant_msg: dict[str, Any] = {"role": "assistant", "content": result.content or ""}
            if result.tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": json.dumps(tc.arguments),
                        },
                    }
                    for tc in result.tool_calls
                ]
            messages.append(assistant_msg)

            # Execute each tool call
            for tool_call in result.tool_calls:
                tc_start = time.perf_counter()
                logger.info(
                    "HR Agent step %d: calling %s(%s)",
                    step, tool_call.name, json.dumps(tool_call.arguments)[:200],
                )

                tool_result = await execute_hr_tool(
                    tool_name=tool_call.name,
                    arguments=tool_call.arguments,
                    company_id=company_id,
                    security_context=security_context,
                )

                tc_duration = (time.perf_counter() - tc_start) * 1000
                tool_executions.append(ToolExecution(
                    tool_name=tool_call.name,
                    arguments=tool_call.arguments,
                    result=tool_result,
                    step=step,
                    duration_ms=tc_duration,
                ))

                # Track entity context for follow-ups
                self._update_entity_context(entity_ctx, tool_call.name, tool_call.arguments, tool_result)

                # Append tool result as a message
                # Truncate large results to stay within context limits
                result_str = json.dumps(tool_result, default=str)
                if len(result_str) > 4000:
                    result_str = result_str[:4000] + '... (truncated)'

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result_str,
                })

        # Max steps reached
        logger.warning("HR Agent reached max steps (%d)", self.max_steps)
        return AgentLoopResult(
            answer=(
                "I was unable to fully complete your request within the allowed processing steps. "
                "Please try a more specific question or break your request into smaller parts."
            ),
            tool_executions=tool_executions,
            steps_used=self.max_steps,
            max_steps=self.max_steps,
            success=False,
            error="MAX_STEPS_EXCEEDED",
            entity_context=entity_ctx,
        )

    # ------------------------------------------------------------------
    # Streaming variant
    # ------------------------------------------------------------------

    async def run_stream(
        self,
        *,
        company_id: str,
        user_id: str,
        user_role: str,
        message: str,
        conversation_history: list[dict[str, str]] | None = None,
        entity_context: dict[str, Any] | None = None,
        timings: dict[str, Any] | None = None,
        security_context: Any = None,
    ) -> Any:
        """Async-generator variant of ``run`` with live token streaming.

        Yields user-safe wire events (see ``app.agents.streaming``): status /
        token / done / error. Tool-call argument deltas are accumulated inside
        the provider; only the final answer content is streamed as tokens.
        Independent tool calls run concurrently while friendly progress events
        are emitted (tool names are never exposed).
        """
        from app.agents.streaming import (
            STATUS_ANALYZING,
            STATUS_ANSWER,
            STATUS_CHECKING_DATA,
            STATUS_UNDERSTANDING,
            status_event,
            token_event,
        )

        def _mark(name: str) -> None:
            if timings is not None and timings.get(name) is None and timings.get("_t0"):
                timings[name] = round((time.perf_counter() - timings["_t0"]) * 1000, 1)

        if not settings.HR_AGENT_ENABLED:
            yield {
                "type": "error",
                "message": "The HR Agent is currently disabled.",
                "data": {
                    "success": False,
                    "answer": "The HR Agent is currently disabled. Please enable HR_AGENT_ENABLED in your environment.",
                    "error": "HR_AGENT_DISABLED",
                },
            }
            return

        if not settings.GROQ_API_KEY:
            yield {
                "type": "error",
                "message": "The HR Agent cannot respond because GROQ_API_KEY is not configured.",
                "data": {
                    "success": False,
                    "answer": "The HR Agent cannot respond because GROQ_API_KEY is not configured.",
                    "error": "GROQ_API_KEY_MISSING",
                },
            }
            return

        entity_ctx = dict(entity_context or {})
        yield status_event("accepted", STATUS_UNDERSTANDING)

        messages = self._build_initial_messages(
            company_id=company_id,
            user_id=user_id,
            user_role=user_role,
            message=message,
            conversation_history=conversation_history,
            entity_context=entity_ctx,
        )

        # ── Filter tool schemas by authorization (before sending to LLM) ──────
        from app.ai.security.schema_filter import filter_hr_schemas_for_context
        if security_context is not None:
            hr_schemas = filter_hr_schemas_for_context(security_context, HR_TOOL_SCHEMAS)
        else:
            hr_schemas = HR_TOOL_SCHEMAS

        yield status_event("routing", STATUS_UNDERSTANDING)

        tool_executions: list[ToolExecution] = []

        for step in range(1, self.max_steps + 1):
            if step > 1:
                yield status_event("analyzing", STATUS_ANALYZING)

            _mark("first_groq_started")
            try:
                step_content_parts: list[str] = []
                step_tool_calls = []
                step_tools_emitted = False
                step_answer_started = False
                model = ""
                usage: dict[str, Any] = {}

                async for ev in self.provider.generate_with_tools_stream(
                    prompt="",
                    context={"company_id": company_id, "user_id": user_id, "role": user_role},
                    tools=hr_schemas,
                    options={
                        "system_prompt": HR_AGENT_SYSTEM_PROMPT,
                        "messages": messages,
                        "temperature": 0.1,
                        "max_tokens": 4096,
                    },
                ):
                    etype = ev["type"]
                    if etype == "content":
                        if not step_answer_started:
                            step_answer_started = True
                            _mark("first_answer_token")
                            yield status_event("answer", STATUS_ANSWER)
                        step_content_parts.append(ev["text"])
                        yield token_event(ev["text"])
                    elif etype == "tool_call_delta":
                        if not step_tools_emitted:
                            step_tools_emitted = True
                            yield status_event("tools", STATUS_CHECKING_DATA)
                    elif etype == "complete":
                        model = ev.get("model") or model
                        usage = ev.get("usage") or {}
                        step_tool_calls = (ev.get("message") or {}).get("tool_calls") or []
                        _mark("first_groq_done")
            except Exception as exc:
                logger.exception("HR Agent Groq call failed at step %d", step)
                yield {
                    "type": "error",
                    "message": "I hit a technical issue while processing your request — please try again.",
                    "data": {
                        "success": False,
                        "answer": f"I encountered an error while processing your request: {exc}",
                        "error": f"PROVIDER_ERROR: {exc}",
                        "entity_context": entity_ctx,
                        "model": model or "",
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0,
                        "steps_used": step,
                        "max_steps": self.max_steps,
                        "groq_call_count": step,
                        "tool_calls_summary": [
                            {
                                "tool": te.tool_name,
                                "step": te.step,
                                "duration_ms": round(te.duration_ms, 1),
                                "has_error": "error" in te.result,
                            }
                            for te in tool_executions
                        ],
                    },
                }
                return

            # ── No tool calls → final answer ──────────────────────────────────
            if not step_tool_calls:
                answer = "".join(step_content_parts) or "I was unable to generate a response."
                _mark("response_done")
                yield {
                    "type": "done",
                    "data": {
                        "success": True,
                        "answer": answer,
                        "error": None,
                        "entity_context": entity_ctx,
                        "model": model,
                        "prompt_tokens": (usage.get("prompt_tokens") or 0),
                        "completion_tokens": (usage.get("completion_tokens") or 0),
                        "total_tokens": (usage.get("total_tokens") or 0),
                        "steps_used": step,
                        "max_steps": self.max_steps,
                        "groq_call_count": step,
                        "selected_tools": [],
                        "tool_calls_summary": [
                            {
                                "tool": te.tool_name,
                                "step": te.step,
                                "duration_ms": round(te.duration_ms, 1),
                                "has_error": "error" in te.result,
                            }
                            for te in tool_executions
                        ],
                    },
                }
                return

            # ── Append assistant message with tool calls ──────────────────────
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": "".join(step_content_parts),
            }
            assistant_msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": json.dumps(tc.arguments),
                    },
                }
                for tc in step_tool_calls
            ]
            messages.append(assistant_msg)

            if not step_tools_emitted:
                yield status_event("tools", STATUS_CHECKING_DATA)

            # ── Execute tool calls concurrently, streaming progress ───────────
            async def _exec_one(tc):
                tc_start = time.perf_counter()
                res = await execute_hr_tool(
                    tool_name=tc.name,
                    arguments=tc.arguments,
                    company_id=company_id,
                    security_context=security_context,
                )
                tc_duration = (time.perf_counter() - tc_start) * 1000
                return tc, res, tc_duration

            try:
                pending = [asyncio.ensure_future(_exec_one(tc)) for tc in step_tool_calls]
                total_tools = len(pending)
                completed_by_id: dict[str, tuple] = {}
                done_count = 0
                try:
                    for fut in asyncio.as_completed(pending):
                        tc, tool_result, tc_duration = await fut
                        completed_by_id[tc.id] = (tc, tool_result, tc_duration)
                        done_count += 1
                        yield status_event(
                            "tools", STATUS_CHECKING_DATA, done=done_count, total=total_tools,
                        )
                    _mark("tools_done")
                finally:
                    # Client disconnect / cancellation: stop unfinished tool work.
                    for fut in pending:
                        if not fut.done():
                            fut.cancel()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("HR Agent tool execution failed at step %d", step)
                yield {
                    "type": "error",
                    "message": "I hit a technical issue while checking HR records — please try again.",
                    "data": {
                        "success": False,
                        "answer": f"I encountered an error while processing your request: {exc}",
                        "error": f"TOOL_ERROR: {exc}",
                        "entity_context": entity_ctx,
                        "model": model,
                        "prompt_tokens": (usage.get("prompt_tokens") or 0),
                        "completion_tokens": (usage.get("completion_tokens") or 0),
                        "total_tokens": (usage.get("total_tokens") or 0),
                        "steps_used": step,
                        "max_steps": self.max_steps,
                        "groq_call_count": step,
                        "tool_calls_summary": [
                            {
                                "tool": te.tool_name,
                                "step": te.step,
                                "duration_ms": round(te.duration_ms, 1),
                                "has_error": "error" in te.result,
                            }
                            for te in tool_executions
                        ],
                    },
                }
                return

            # Tool results appended in the model's original call order so the
            # conversation history stays deterministic (parity with ``run``).
            for tc in step_tool_calls:
                entry = completed_by_id.get(tc.id)
                if not entry:
                    continue
                tool_call, tool_result, tc_duration = entry
                tool_executions.append(ToolExecution(
                    tool_name=tool_call.name,
                    arguments=tool_call.arguments,
                    result=tool_result,
                    step=step,
                    duration_ms=tc_duration,
                ))
                self._update_entity_context(entity_ctx, tool_call.name, tool_call.arguments, tool_result)
                result_str = json.dumps(tool_result, default=str)
                if len(result_str) > 4000:
                    result_str = result_str[:4000] + '... (truncated)'
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result_str,
                })

        # Max steps reached
        _mark("response_done")
        yield {
            "type": "done",
            "data": {
                "success": False,
                "answer": (
                    "I was unable to fully complete your request within the allowed processing steps. "
                    "Please try a more specific question or break your request into smaller parts."
                ),
                "error": "MAX_STEPS_EXCEEDED",
                "entity_context": entity_ctx,
                "model": "",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "steps_used": self.max_steps,
                "max_steps": self.max_steps,
                "groq_call_count": self.max_steps,
                "selected_tools": [],
                "tool_calls_summary": [
                    {
                        "tool": te.tool_name,
                        "step": te.step,
                        "duration_ms": round(te.duration_ms, 1),
                        "has_error": "error" in te.result,
                    }
                    for te in tool_executions
                ],
            },
        }

    def _build_initial_messages(
        self,
        *,
        company_id: str,
        user_id: str,
        user_role: str,
        message: str,
        conversation_history: list[dict[str, str]] | None,
        entity_context: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Build the initial messages array for the Groq API."""
        messages: list[dict[str, Any]] = []

        # System context
        messages.append({
            "role": "system",
            "content": (
                f"Company ID: {company_id}\n"
                f"User ID: {user_id}\n"
                f"User Role: {user_role}\n"
                f"Current Date: {utc_now().strftime('%Y-%m-%d')}"
            ),
        })

        # Entity context (from entity pages)
        if entity_context:
            ctx_str = json.dumps(entity_context, default=str)
            messages.append({
                "role": "system",
                "content": f"The user is currently viewing: {ctx_str}",
            })

        # Conversation history
        if conversation_history:
            for turn in conversation_history[-6:]:  # Last 6 turns max
                role = turn.get("role", "user")
                content = turn.get("content", "")
                messages.append({"role": role, "content": content})

        # Current message
        messages.append({"role": "user", "content": message})

        return messages

    def _update_entity_context(
        self,
        entity_ctx: dict[str, Any],
        tool_name: str,
        arguments: dict[str, Any],
        result: dict[str, Any],
    ) -> None:
        """Track entity context for follow-up pronoun resolution."""
        # When employee is resolved, remember it
        if tool_name in ("search_employees", "get_employee_360"):
            emp = result.get("employee") or {}
            if isinstance(emp, dict) and emp.get("id"):
                entity_ctx["selected_employee_id"] = emp["id"]
                entity_ctx["selected_employee_name"] = emp.get("full_name")

        if tool_name == "search_candidates":
            candidates = result.get("candidates") or []
            if len(candidates) == 1:
                entity_ctx["selected_candidate_id"] = candidates[0].get("id")
                entity_ctx["selected_candidate_name"] = candidates[0].get("full_name")

        if tool_name == "get_candidate_360":
            candidate = result.get("candidate") or {}
            if isinstance(candidate, dict) and candidate.get("id"):
                entity_ctx["selected_candidate_id"] = candidate["id"]
                entity_ctx["selected_candidate_name"] = candidate.get("full_name")

        if tool_name in ("search_jobs", "get_job_360"):
            job = result.get("job") or {}
            if isinstance(job, dict) and job.get("id"):
                entity_ctx["selected_job_id"] = job["id"]
                entity_ctx["selected_job_title"] = job.get("title")
