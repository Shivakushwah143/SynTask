"""
Executive Operations Agent — the core agent loop.

Implements the mandatory pattern:
    Goal → Understand intent → Resolve entity → Fetch data → Reason →
    Fetch additional data → Answer → If action → proposal → Verify → Audit

Max steps are enforced via settings.EXECUTIVE_AGENT_MAX_STEPS.

The LLM is never the source of truth. SynTask database/services are.
Cross-domain reasoning is the primary capability: the agent investigates
across projects, tasks, clients, sales, HR, finance, and meetings to
connect evidence and explain cause/effect.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional
from uuid import uuid4

import asyncio
from app.ai.providers.groq import GroqProvider, Groq400Error, get_groq_telemetry
from app.core.config import settings
from app.core.clock import utc_now

from app.agents.executive.tools import EXECUTIVE_TOOL_SCHEMAS, execute_executive_tool
from app.agents.capability_selector import select_tools, is_cross_domain
from app.agents.answer_blocks import build_answer_blocks

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Executive Agent system prompt — compact, domain-aware
# ---------------------------------------------------------------------------

EXECUTIVE_AGENT_SYSTEM_PROMPT = """You are SynTask's Executive Operations Agent — the CEO's single AI interface for the entire company.

You have access to ALL authorized domains. The tools available to you define what you can query. Never invent data — always use tools to fetch live SynTask data.

## Core Rules
1. Read → Reason → Act → Verify: Always fetch data before answering.
2. Never invent records. Say what is missing if data doesn't exist.
3. Cross-domain reasoning: Connect evidence across departments.
4. Company isolation: Only return data within the authorized company.
5. Mutations require approval: Propose, don't execute directly.
6. Never store the whole company database in LLM context.

## Tool Selection
You have many tools. For each request:
- Call only 1-3 tools for simple factual questions.
- Call 2-4 tools for analysis questions.
- Call 3-6 tools for cross-domain investigation.

## Response Format
- **Summary**: One-line answer.
- **Details**: Structured data from SynTask.
- **Analysis**: Cross-domain connections where supported.
- **Risks / Blockers**: Issues or missing data.
- **Next Action**: Recommended step.

## Investigation Pattern
For "Why is Client X at risk?": client → projects → overdue tasks → assignees → workload → meetings → invoices → root cause.

## Important
- Always reference actual SynTask data, not generic advice.
- Financial actions never auto-execute.
- Critical decisions remain with the CEO — recommend only.
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
    """Result from the executive agent loop."""
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
    groq_call_count: int = 0
    capability_packs_used: list[str] = field(default_factory=list)
    selected_tools: list[str] = field(default_factory=list)
    telemetry: dict[str, Any] = field(default_factory=dict)
    # Deterministic, UI-renderable blocks derived from tool results (see
    # ``app.agents.answer_blocks``). The frontend renders these as cards /
    # tables / lists instead of parsing Markdown pipes out of prose.
    answer_blocks: list[dict[str, Any]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Executive Operations Agent
# ---------------------------------------------------------------------------

class ExecutiveOperationsAgent:
    """The Executive Operations Agent — one unified agent for company-wide intelligence."""

    def __init__(self, *, provider: GroqProvider | None = None):
        self.provider = provider or GroqProvider()
        self.max_steps = settings.EXECUTIVE_AGENT_MAX_STEPS

    async def run(
        self,
        *,
        company_id: str,
        user_id: str,
        user_role: str,
        message: str,
        conversation_history: list[dict[str, str]] | None = None,
        entity_context: dict[str, Any] | None = None,
        modules: list[str] | None = None,
    ) -> AgentLoopResult:
        """Execute the executive agent loop."""
        if not settings.EXECUTIVE_AGENT_ENABLED:
            return AgentLoopResult(
                answer="The Executive Operations Agent is currently disabled.",
                success=False,
                error="EXECUTIVE_AGENT_DISABLED",
            )

        if not settings.GROQ_API_KEY:
            return AgentLoopResult(
                answer="The Executive Operations Agent cannot respond because GROQ_API_KEY is not configured.",
                success=False,
                error="GROQ_API_KEY_MISSING",
            )

        start_time = time.perf_counter()
        tool_executions: list[ToolExecution] = []
        entity_ctx = dict(entity_context or {})

        # ── Load persisted entity context from Redis ──────────────────────────
        entity_ctx = await self._load_redis_entity_context(company_id, user_id, entity_ctx)

        # ── Determine step budget ─────────────────────────────────────────────
        cross_domain = is_cross_domain(message, entity_ctx)
        effective_max_steps = 3 if cross_domain else 2

        # ── Dynamic tool selection (entity-context-aware) ─────────────────────
        selected_schemas, packs_used = select_tools(
            message, EXECUTIVE_TOOL_SCHEMAS,
            entity_context=entity_ctx,
            max_tools=6, min_tools=2,
        )

        # Build initial messages
        messages = self._build_initial_messages(
            company_id=company_id,
            user_id=user_id,
            user_role=user_role,
            message=message,
            conversation_history=conversation_history,
            entity_context=entity_ctx,
        )

        # Agent loop
        for step in range(1, effective_max_steps + 1):
            try:
                result = await self.provider.generate_with_tools(
                    prompt="",
                    context={"company_id": company_id, "user_id": user_id, "role": user_role},
                    tools=selected_schemas,
                    options={
                        "system_prompt": EXECUTIVE_AGENT_SYSTEM_PROMPT,
                        "messages": messages,
                        "temperature": 0.1,
                        "max_tokens": 4096,
                    },
                )
            except Groq400Error as exc:
                logger.error(
                    "Executive Agent Groq 400 at step %d: %s", step, exc.message,
                )
                return AgentLoopResult(
                    answer=f"I encountered a configuration error: {exc.message}. Please try rephrasing.",
                    tool_executions=tool_executions,
                    answer_blocks=build_answer_blocks(tool_executions, message=message),
                    steps_used=step,
                    max_steps=self.max_steps,
                    success=False,
                    error=f"GROQ_400: {exc.message}",
                    entity_context=entity_ctx,
                    capability_packs_used=packs_used,
                    telemetry=get_groq_telemetry(),
                )
            except Exception as exc:
                logger.exception("Executive Agent Groq call failed at step %d", step)
                return AgentLoopResult(
                    answer=f"I encountered an error: {exc}",
                    tool_executions=tool_executions,
                    answer_blocks=build_answer_blocks(tool_executions, message=message),
                    steps_used=step,
                    max_steps=self.max_steps,
                    success=False,
                    error=f"PROVIDER_ERROR: {exc}",
                    entity_context=entity_ctx,
                    capability_packs_used=packs_used,
                    telemetry=get_groq_telemetry(),
                )

            # No tool calls → final answer
            if not result.tool_calls:
                answer = result.content or "I was unable to generate a response."
                await self._save_redis_entity_context(company_id, user_id, entity_ctx)
                return AgentLoopResult(
                    answer=answer,
                    tool_executions=tool_executions,
                    answer_blocks=build_answer_blocks(tool_executions, message=message),
                    steps_used=step,
                    max_steps=self.max_steps,
                    success=True,
                    entity_context=entity_ctx,
                    model=result.model,
                    prompt_tokens=result.prompt_tokens or 0,
                    completion_tokens=result.completion_tokens or 0,
                    total_tokens=result.total_tokens or 0,
                    groq_call_count=step,
                    capability_packs_used=packs_used,
                    selected_tools=list({te.tool_name for te in tool_executions}),
                    telemetry=get_groq_telemetry(),
                )

            # Process tool calls
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

            # Execute tool calls — parallelize independent reads
            async def _exec_one(tc):
                tc_start = time.perf_counter()
                res = await execute_executive_tool(
                    tool_name=tc.name,
                    arguments=tc.arguments,
                    company_id=company_id,
                    user_role=user_role,
                    modules=modules,
                )
                tc_duration = (time.perf_counter() - tc_start) * 1000
                return tc, res, tc_duration

            tool_results = await asyncio.gather(
                *[_exec_one(tc) for tc in result.tool_calls]
            )

            for tool_call, tool_result, tc_duration in tool_results:
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
        await self._save_redis_entity_context(company_id, user_id, entity_ctx)
        return AgentLoopResult(
            answer="I was unable to fully complete your request within the allowed processing steps. Please try a more specific question.",
            tool_executions=tool_executions,
            answer_blocks=build_answer_blocks(tool_executions, message=message),
            steps_used=effective_max_steps,
            max_steps=self.max_steps,
            success=False,
            error="MAX_STEPS_EXCEEDED",
            entity_context=entity_ctx,
            capability_packs_used=packs_used,
            telemetry=get_groq_telemetry(),
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
        modules: list[str] | None = None,
        timings: dict[str, Any] | None = None,
    ) -> Any:
        """Async-generator variant of ``run`` with live token streaming.

        Yields user-safe wire events (see ``app.agents.streaming``):
          status (accepted/routing/tools/analyzing/answer), token, done, error.
        Internal tool names, prompts, record ids and sensitive values are never
        serialized. Groq tool-call argument deltas are accumulated inside the
        provider; only the final assistant content of the last completion is
        streamed as answer tokens.

        ``timings`` (optional shared dict seeded with ``_t0``) records elapsed
        ms for: first_groq_started / first_groq_done / tools_done /
        first_answer_token / response_done.
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

        if not settings.EXECUTIVE_AGENT_ENABLED:
            yield {
                "type": "error",
                "message": "The Executive Operations Agent is currently disabled.",
                "data": {
                    "success": False,
                    "answer": "The Executive Operations Agent is currently disabled.",
                    "error": "EXECUTIVE_AGENT_DISABLED",
                },
            }
            return

        if not settings.GROQ_API_KEY:
            yield {
                "type": "error",
                "message": "The Executive Operations Agent cannot respond because GROQ_API_KEY is not configured.",
                "data": {
                    "success": False,
                    "answer": "The Executive Operations Agent cannot respond because GROQ_API_KEY is not configured.",
                    "error": "GROQ_API_KEY_MISSING",
                },
            }
            return

        # The service layer emits the initial "accepted" status before calling
        # the agent so the UI gets feedback while routing/classification runs.
        entity_ctx = await self._load_redis_entity_context(company_id, user_id, dict(entity_context or {}))

        # ── Determine step budget ─────────────────────────────────────────────
        cross_domain = is_cross_domain(message, entity_ctx)
        effective_max_steps = 3 if cross_domain else 2

        # ── Dynamic tool selection (entity-context-aware) ─────────────────────
        selected_schemas, packs_used = select_tools(
            message, EXECUTIVE_TOOL_SCHEMAS,
            entity_context=entity_ctx,
            max_tools=6, min_tools=2,
        )

        messages = self._build_initial_messages(
            company_id=company_id,
            user_id=user_id,
            user_role=user_role,
            message=message,
            conversation_history=conversation_history,
            entity_context=entity_ctx,
        )

        tool_executions: list[ToolExecution] = []
        yield status_event("routing", STATUS_UNDERSTANDING)

        for step in range(1, effective_max_steps + 1):
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
                    tools=selected_schemas,
                    options={
                        "system_prompt": EXECUTIVE_AGENT_SYSTEM_PROMPT,
                        "messages": messages,
                        "temperature": 0.1,
                        "max_tokens": 4096,
                    },
                ):
                    etype = ev["type"]
                    if etype == "content":
                        # Streamed answer text. A short model preamble may precede a
                        # tool round in rare cases; the tools status event below
                        # supersedes it in the UI and it stays out of the final answer.
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
            except Groq400Error as exc:
                logger.error("Executive Agent Groq 400 at step %d: %s", step, exc.message)
                yield {
                    "type": "error",
                    "message": "I ran into a configuration issue — please try rephrasing.",
                    "data": {
                        "answer_blocks": build_answer_blocks(tool_executions, message=message),
                        "success": False,
                        "answer": f"I encountered a configuration error: {exc.message}. Please try rephrasing.",
                        "error": f"GROQ_400: {exc.message}",
                        "entity_context": entity_ctx,
                        "model": model or "",
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0,
                        "steps_used": step,
                        "max_steps": self.max_steps,
                        "groq_call_count": step,
                        "capability_packs_used": packs_used,
                        "selected_tools": [te.tool_name for te in tool_executions],
                        "tool_calls_summary": [],
                    },
                }
                return
            except Exception as exc:
                logger.exception("Executive Agent Groq call failed at step %d", step)
                yield {
                    "type": "error",
                    "message": "I hit a technical issue while investigating — please try again.",
                    "data": {
                        "answer_blocks": build_answer_blocks(tool_executions, message=message),
                        "success": False,
                        "answer": f"I encountered an error: {exc}",
                        "error": f"PROVIDER_ERROR: {exc}",
                        "entity_context": entity_ctx,
                        "model": model or "",
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0,
                        "steps_used": step,
                        "max_steps": self.max_steps,
                        "groq_call_count": step,
                        "capability_packs_used": packs_used,
                        "selected_tools": [te.tool_name for te in tool_executions],
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
                await self._save_redis_entity_context(company_id, user_id, entity_ctx)
                _mark("response_done")
                yield {
                    "type": "done",
                    "data": {
                        "answer_blocks": build_answer_blocks(tool_executions, message=message),
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
                        "capability_packs_used": packs_used,
                        "selected_tools": list({te.tool_name for te in tool_executions}),
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
                res = await execute_executive_tool(
                    tool_name=tc.name,
                    arguments=tc.arguments,
                    company_id=company_id,
                    user_role=user_role,
                    modules=modules,
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
                logger.exception("Executive Agent tool execution failed at step %d", step)
                yield {
                    "type": "error",
                    "message": "I hit a technical issue while checking company data — please try again.",
                    "data": {
                        "answer_blocks": build_answer_blocks(tool_executions, message=message),
                        "success": False,
                        "answer": f"I encountered an error: {exc}",
                        "error": f"TOOL_ERROR: {exc}",
                        "entity_context": entity_ctx,
                        "model": model,
                        "prompt_tokens": (usage.get("prompt_tokens") or 0),
                        "completion_tokens": (usage.get("completion_tokens") or 0),
                        "total_tokens": (usage.get("total_tokens") or 0),
                        "steps_used": step,
                        "max_steps": self.max_steps,
                        "groq_call_count": step,
                        "capability_packs_used": packs_used,
                        "selected_tools": [te.tool_name for te in tool_executions],
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

            # Tool results are appended in the model's original call order so the
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
        await self._save_redis_entity_context(company_id, user_id, entity_ctx)
        _mark("response_done")
        yield {
            "type": "done",
            "data": {
                "answer_blocks": build_answer_blocks(tool_executions, message=message),
                "success": False,
                "answer": (
                    "I was unable to fully complete your request within the allowed processing steps. "
                    "Please try a more specific question."
                ),
                "error": "MAX_STEPS_EXCEEDED",
                "entity_context": entity_ctx,
                "model": "",
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
                "steps_used": effective_max_steps,
                "max_steps": self.max_steps,
                "groq_call_count": effective_max_steps,
                "capability_packs_used": packs_used,
                "selected_tools": [te.tool_name for te in tool_executions],
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

        # System context (compact)
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
            for turn in conversation_history[-6:]:  # Last 6 turns (reduced from 8)
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
        # Project resolved
        if tool_name in ("search_projects", "get_project_360"):
            project = result.get("project") or {}
            if isinstance(project, dict) and project.get("id"):
                entity_ctx["selected_project_id"] = project["id"]
                entity_ctx["selected_project_name"] = project.get("name")

        # Client resolved
        if tool_name in ("search_clients", "get_client_360"):
            client = result.get("client") or {}
            if isinstance(client, dict) and client.get("id"):
                entity_ctx["selected_client_id"] = client["id"]
                entity_ctx["selected_client_name"] = client.get("name")

        # Employee resolved
        if tool_name in ("search_employees", "get_employee_360"):
            employees = result.get("employees") or []
            employee = result.get("employee") or {}
            if isinstance(employee, dict) and employee.get("id"):
                entity_ctx["selected_employee_id"] = employee["id"]
                entity_ctx["selected_employee_name"] = employee.get("full_name")
            elif len(employees) == 1:
                entity_ctx["selected_employee_id"] = employees[0].get("id")
                entity_ctx["selected_employee_name"] = employees[0].get("full_name")

        # Candidate resolved
        if tool_name in ("search_candidates", "get_candidate_360"):
            candidates = result.get("candidates") or []
            candidate = result.get("candidate") or {}
            if isinstance(candidate, dict) and candidate.get("id"):
                entity_ctx["selected_candidate_id"] = candidate["id"]
                entity_ctx["selected_candidate_name"] = candidate.get("full_name")
            elif len(candidates) == 1:
                entity_ctx["selected_candidate_id"] = candidates[0].get("id")
                entity_ctx["selected_candidate_name"] = candidates[0].get("full_name")

        # Job resolved
        if tool_name in ("search_jobs", "get_job_360"):
            jobs = result.get("jobs") or []
            job = result.get("job") or {}
            if isinstance(job, dict) and job.get("id"):
                entity_ctx["selected_job_id"] = job["id"]
                entity_ctx["selected_job_title"] = job.get("title")
            elif len(jobs) == 1:
                entity_ctx["selected_job_id"] = jobs[0].get("id")
                entity_ctx["selected_job_title"] = jobs[0].get("title")

        # Lead resolved
        if tool_name in ("search_clients", "get_lead_360"):
            lead = result.get("lead") or {}
            if isinstance(lead, dict) and lead.get("id"):
                entity_ctx["selected_lead_id"] = lead["id"]
                entity_ctx["selected_lead_name"] = lead.get("name")

        # User tasks resolved — track user_id
        if tool_name in ("get_user_tasks", "get_user_task_activity"):
            uid = arguments.get("user_id") or result.get("user_id")
            if uid:
                entity_ctx["selected_user_id"] = uid

        # Task resolved
        if tool_name in ("list_tasks", "get_task_detail"):
            tasks = result.get("tasks") or []
            task = result.get("task") or {}
            if isinstance(task, dict) and task.get("id"):
                entity_ctx["selected_task_id"] = task["id"]
                entity_ctx["selected_task_title"] = task.get("title")
            elif len(tasks) == 1:
                entity_ctx["selected_task_id"] = tasks[0].get("id")
                entity_ctx["selected_task_title"] = tasks[0].get("title")

        # Invoice resolved
        if tool_name in ("list_invoices", "get_invoice_detail"):
            invoices = result.get("invoices") or []
            invoice = result.get("invoice") or {}
            if isinstance(invoice, dict) and invoice.get("id"):
                entity_ctx["selected_invoice_id"] = invoice["id"]
                entity_ctx["selected_invoice_number"] = invoice.get("invoice_number")
            elif len(invoices) == 1:
                entity_ctx["selected_invoice_id"] = invoices[0].get("id")
                entity_ctx["selected_invoice_number"] = invoices[0].get("invoice_number")

        # Meeting resolved
        if tool_name in ("list_meetings", "get_meeting_detail"):
            meetings = result.get("meetings") or []
            meeting = result.get("meeting") or {}
            if isinstance(meeting, dict) and meeting.get("id"):
                entity_ctx["selected_meeting_id"] = meeting["id"]
                entity_ctx["selected_meeting_title"] = meeting.get("title")
            elif len(meetings) == 1:
                entity_ctx["selected_meeting_id"] = meetings[0].get("id")
                entity_ctx["selected_meeting_title"] = meetings[0].get("title")

        # CRM deal resolved
        if tool_name in ("list_crm_deals", "get_crm_deal_360"):
            deals = result.get("deals") or []
            deal = result.get("deal") or {}
            if isinstance(deal, dict) and deal.get("id"):
                entity_ctx["selected_deal_id"] = deal["id"]
            elif len(deals) == 1:
                entity_ctx["selected_deal_id"] = deals[0].get("id")

        # Sprint / Epic resolved
        if tool_name in ("list_sprints", "list_epics"):
            sprints = result.get("sprints") or []
            epics = result.get("epics") or []
            if len(sprints) == 1:
                entity_ctx["selected_sprint_id"] = sprints[0].get("id")
            if len(epics) == 1:
                entity_ctx["selected_epic_id"] = epics[0].get("id")

    # ── Redis entity context persistence ──────────────────────────────────────

    async def _load_redis_entity_context(
        self, company_id: str, user_id: str, fallback: dict[str, Any],
    ) -> dict[str, Any]:
        """Load previously persisted entity context from Redis."""
        try:
            from app.core.redis_client import get_redis
            redis = await get_redis()
            if not redis:
                return fallback
            key = f"exec:entity_ctx:{company_id}:{user_id}"
            raw = await redis.get(key)
            if raw:
                persisted = json.loads(raw)
                merged = {**persisted, **fallback}
                return merged
        except Exception:
            logger.debug("Failed to load Redis entity context", exc_info=True)
        return fallback

    async def _save_redis_entity_context(
        self, company_id: str, user_id: str, entity_ctx: dict[str, Any],
    ) -> None:
        """Persist entity context to Redis with a short TTL (5 minutes)."""
        if not entity_ctx:
            return
        try:
            from app.core.redis_client import get_redis
            redis = await get_redis()
            if not redis:
                return
            key = f"exec:entity_ctx:{company_id}:{user_id}"
            await redis.setex(key, 300, json.dumps(entity_ctx, default=str))
        except Exception:
            logger.debug("Failed to save Redis entity context", exc_info=True)
