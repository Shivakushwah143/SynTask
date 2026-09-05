"""Groq-based intent interpreter for ambiguous natural language queries.

When the deterministic keyword router cannot confidently classify a user
message, this module calls Groq to understand intent and extract entities.
The result is a structured intent dict that the router uses to dispatch
to the correct agent.

The LLM is used ONLY for intent classification — never for data access.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.agents.routing import EXECUTIVE_AGENT_ID, HR_AGENT_ID, PROJECT_AGENT_ID
from app.core.json_safe import to_json_safe

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Allowed target agents (fixed enum — never trust raw model output)
# ---------------------------------------------------------------------------
ALLOWED_TARGET_AGENTS = (EXECUTIVE_AGENT_ID, HR_AGENT_ID, PROJECT_AGENT_ID)


# ---------------------------------------------------------------------------
# Structured intent schema (Pydantic — validated before use)
# ---------------------------------------------------------------------------
class IntentEntity(BaseModel):
    type: str = Field(description="Entity type: employee, project, client, task, lead")
    text: str = Field(description="Raw entity text from user message")


class StructuredIntent(BaseModel):
    intent: str = Field(description="Classified intent type")
    entities: list[IntentEntity] = Field(default_factory=list, description="Extracted entities")
    metrics: list[str] = Field(default_factory=list, description="Requested metrics or data points")
    timeframe: str | None = Field(default=None, description="Timeframe if mentioned")
    target_agent: str = Field(description="Best agent to handle this query")
    confidence: float = Field(ge=0.0, le=1.0, description="Classification confidence")


# ---------------------------------------------------------------------------
# Groq prompt for intent classification
# ---------------------------------------------------------------------------

INTENT_CLASSIFICATION_PROMPT = """You are an intent classifier for a business operations AI assistant.

Classify the user's message into a structured intent. You have three available agents:

1. **executive_operations_agent** — Company-wide intelligence: tasks, workload, projects, clients, sales, finance, cross-domain questions, employee productivity, team overview, activity summaries.

2. **hr_operations_agent** — Human resources: employee profiles, attendance, leave, payroll, documents, onboarding, recruitment, HR-specific questions.

3. **project_task_agent** — Specific task/project operations: status of a specific task by ID, create/update tasks, project breakdowns, blockers for a specific project.

## Rules
- "How many tasks assigned to <employee name>?" → executive_operations_agent (cross-domain task query)
- "Tell me about <employee name>" → hr_operations_agent (employee profile)
- "Who is absent today?" → hr_operations_agent (attendance/leave)
- "What is status of TASK-123?" → project_task_agent (specific task)
- "What happened today?" → executive_operations_agent (daily activity)
- "sales kaisa chal raha?" → executive_operations_agent (sales overview)
- "Why client ABC problem?" → executive_operations_agent (cross-domain investigation)
- Ambiguous employee task queries → executive_operations_agent

Respond with ONLY valid JSON matching this schema:
{
    "intent": "string describing the intent",
    "entities": [{"type": "employee|project|client|task|lead", "text": "raw text"}],
    "metrics": ["list of data points requested"],
    "timeframe": "timeframe string or null",
    "target_agent": "executive_operations_agent|hr_operations_agent|project_task_agent",
    "confidence": 0.0-1.0
}"""


# ---------------------------------------------------------------------------
# Intent Interpreter
# ---------------------------------------------------------------------------
@dataclass
class IntentClassificationResult:
    """Result from the Groq-based intent classifier."""
    structured_intent: StructuredIntent
    raw_response: str = ""
    latency_ms: float = 0.0
    success: bool = True
    error: str | None = None
    used_fallback: bool = False


class IntentInterpreter:
    """Interpret ambiguous natural language queries using Groq."""

    def __init__(self) -> None:
        self._groq_provider = None

    def _get_provider(self):
        if self._groq_provider is None:
            from app.ai.providers.groq import GroqProvider
            self._groq_provider = GroqProvider()
        return self._groq_provider

    async def classify(
        self,
        message: str,
        *,
        conversation_context: list[dict[str, str]] | None = None,
        entity_context: dict[str, Any] | None = None,
    ) -> IntentClassificationResult:
        """Classify a user message into a structured intent via Groq.

        Args:
            message: The user's natural language question.
            conversation_context: Previous conversation turns for context.
            entity_context: Previously resolved entities (for follow-ups).

        Returns:
            IntentClassificationResult with structured intent.
        """
        start = time.perf_counter()

        # Build the classification prompt
        user_prompt = self._build_classification_prompt(
            message, conversation_context=conversation_context, entity_context=entity_context
        )

        try:
            provider = self._get_provider()
            result = await provider.generate(
                prompt=user_prompt,
                context={},
                options={
                    "system_prompt": INTENT_CLASSIFICATION_PROMPT,
                    "temperature": 0.0,
                    "max_tokens": 512,
                    "response_format": {"type": "json_object"},
                },
            )

            latency_ms = (time.perf_counter() - start) * 1000

            # Parse and validate
            parsed = json.loads(result.content) if result.content else {}
            validated = StructuredIntent(**parsed)

            # Ensure target_agent is in the allowed list
            if validated.target_agent not in ALLOWED_TARGET_AGENTS:
                validated.target_agent = EXECUTIVE_AGENT_ID
                validated.confidence = min(validated.confidence, 0.5)

            logger.info(
                "Intent classified: intent=%s target_agent=%s confidence=%.2f latency=%.0fms",
                validated.intent,
                validated.target_agent,
                validated.confidence,
                latency_ms,
            )

            return IntentClassificationResult(
                structured_intent=validated,
                raw_response=result.content or "",
                latency_ms=latency_ms,
                success=True,
            )

        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            logger.warning("Intent classification failed: %s (%.0fms)", type(exc).__name__, latency_ms)
            return IntentClassificationResult(
                structured_intent=self._fallback_intent(message),
                latency_ms=latency_ms,
                success=False,
                error=str(exc),
                used_fallback=True,
            )

    def _build_classification_prompt(
        self,
        message: str,
        *,
        conversation_context: list[dict[str, str]] | None = None,
        entity_context: dict[str, Any] | None = None,
    ) -> str:
        parts = [f"User message: \"{message}\""]

        if conversation_context:
            recent = conversation_context[-4:]
            history_str = "\n".join(
                f"{turn.get('role', 'user')}: {turn.get('content', '')}" for turn in recent
            )
            parts.append(f"\nRecent conversation:\n{history_str}")

        if entity_context:
            parts.append(f"\nPreviously resolved entities: {json.dumps(to_json_safe(entity_context))}")

        return "\n".join(parts)

    def _fallback_intent(self, message: str) -> StructuredIntent:
        """Simple heuristic fallback when Groq is unavailable."""
        text = message.lower()
        if any(w in text for w in ("how many", "what did", "who has", "workload", "sales", "client", "finance", "company")):
            return StructuredIntent(
                intent="company_operations_query",
                target_agent=EXECUTIVE_AGENT_ID,
                confidence=0.5,
            )
        if any(w in text for w in ("task", "project", "status", "deadline")):
            return StructuredIntent(
                intent="task_project_query",
                target_agent=PROJECT_AGENT_ID,
                confidence=0.4,
            )
        if any(w in text for w in ("employee", "leave", "attendance", "hr", "absent")):
            return StructuredIntent(
                intent="hr_query",
                target_agent=HR_AGENT_ID,
                confidence=0.4,
            )
        return StructuredIntent(
            intent="general_operations",
            target_agent=EXECUTIVE_AGENT_ID,
            confidence=0.3,
        )

