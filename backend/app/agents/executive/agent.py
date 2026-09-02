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

from app.ai.providers.groq import GroqProvider
from app.core.config import settings
from app.core.clock import utc_now

from app.agents.executive.tools import EXECUTIVE_TOOL_SCHEMAS, execute_executive_tool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Executive Agent system prompt
# ---------------------------------------------------------------------------

EXECUTIVE_AGENT_SYSTEM_PROMPT = """You are SynTask's Executive Operations Agent.

You help the CEO and executive team understand and operate the entire company.

You have access to ALL business domains:
- Projects & Tasks
- Clients
- Sales / CRM / Leads
- HR / Employees / Recruitment
- Finance / Invoices
- Meetings
- Documents

## Core Rules

1. **Read → Reason → Act → Verify**: Always fetch current SynTask data before answering.
2. **Never invent records**: If information doesn't exist, say what is missing.
3. **Use tools**: Call the provided tools to get real data from SynTask.
4. **Cross-domain reasoning**: Connect evidence across departments. Don't treat modules as isolated.
5. **Concise structured responses**: Return facts with analysis, not generic advice.
6. **Entity resolution**: When a user mentions a name, use search tools to resolve it.
7. **Follow-up context**: Remember previously selected entities for pronoun references.
8. **Company isolation**: Only return data within the authorized company scope.
9. **Mutations require approval**: For any write actions, propose but do not execute directly.
10. **Never report action success until state is re-read and verified.**

## Response Format

Always structure your response with clear sections:
- **Summary**: One-line answer to the question.
- **Details**: Structured information from SynTask data.
- **Analysis**: Connect evidence across domains, explain cause/effect where supported.
- **Risks / Blockers**: Current issues or missing data (if any).
- **Next Action**: Recommended next step.

## Investigation Pattern

When asked a complex question like "Why is Client X at risk?", follow:
1. Get the client's current state
2. Check linked projects → overdue tasks → assignees → workload
3. Check recent meetings and activity
4. Check invoices and financial status
5. Connect evidence across domains
6. Explain the root cause and recommend action

## Daily Brief

When asked "What needs my attention today?", call get_company_attention_summary
and organize the results into a prioritized executive brief with:
- HIGH PRIORITY items
- MEDIUM items
- LOW items
- POSITIVE developments
- RECOMMENDED FIRST ACTION

## Important

- Do not provide generic business advice — always reference actual SynTask data.
- If you cannot find an entity, say so explicitly and suggest alternatives.
- Financial actions must never auto-execute unless explicitly classified as safe.
- Critical business decisions remain with the CEO — recommend only.
- For tool failure, explain what was attempted, what failed, and what data is missing.
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


# ---------------------------------------------------------------------------
# Executive Operations Agent
# ---------------------------------------------------------------------------

class ExecutiveOperationsAgent:
    """The Executive Operations Agent — one unified agent for company-wide intelligence.

    Uses Groq with tool calling to investigate SynTask data across all domains
    and provide accurate, data-grounded, cross-domain answers.
    """

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
    ) -> AgentLoopResult:
        """Execute the executive agent loop.

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
        if not settings.EXECUTIVE_AGENT_ENABLED:
            return AgentLoopResult(
                answer="The Executive Operations Agent is currently disabled. Please enable EXECUTIVE_AGENT_ENABLED in your environment.",
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
        for step in range(1, self.max_steps + 1):
            try:
                result = await self.provider.generate_with_tools(
                    prompt="",
                    context={"company_id": company_id, "user_id": user_id, "role": user_role},
                    tools=EXECUTIVE_TOOL_SCHEMAS,
                    options={
                        "system_prompt": EXECUTIVE_AGENT_SYSTEM_PROMPT,
                        "messages": messages,
                        "temperature": 0.1,
                        "max_tokens": 4096,
                    },
                )
            except Exception as exc:
                logger.exception("Executive Agent Groq call failed at step %d", step)
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
                    "Executive Agent completed in %d steps (%.0fms): %s",
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
                    "Executive Agent step %d: calling %s(%s)",
                    step, tool_call.name, json.dumps(tool_call.arguments)[:200],
                )

                tool_result = await execute_executive_tool(
                    tool_name=tool_call.name,
                    arguments=tool_call.arguments,
                    company_id=company_id,
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
        logger.warning("Executive Agent reached max steps (%d)", self.max_steps)
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
            for turn in conversation_history[-8:]:  # Last 8 turns for executive context
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

        # Lead resolved
        if tool_name == "get_lead_360":
            lead = result.get("lead") or {}
            if isinstance(lead, dict) and lead.get("id"):
                entity_ctx["selected_lead_id"] = lead["id"]
                entity_ctx["selected_lead_name"] = lead.get("name")

        # User tasks resolved — track user_id
        if tool_name in ("get_user_tasks", "get_user_task_activity"):
            uid = arguments.get("user_id") or result.get("user_id")
            if uid:
                entity_ctx["selected_user_id"] = uid
