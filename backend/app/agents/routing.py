from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from app.agents.capability_packs import GENERAL_ASSISTANT_CAPABILITY, HR_AGENT_ID, EXECUTIVE_AGENT_ID, RoleCapabilityPack
from app.agents.email_draft import EMAIL_DRAFT_AGENT_ID, EMAIL_DRAFT_AGENT_VERSION
from app.agents.project_agent import PROJECT_AGENT_ID, PROJECT_AGENT_VERSION, ProjectAgentOperation
from app.agents.task_performance import TASK_PERFORMANCE_AGENT_ID, TASK_PERFORMANCE_AGENT_VERSION

logger = logging.getLogger(__name__)


def _routing_span_attrs(route: "AgentRoute") -> dict[str, Any]:
    """Safe scalar attrs describing a resolved route (for observability)."""
    return {
        "agent_id": route.agent_id,
        "agent_version": route.agent_version,
        "intent": route.intent,
        "routing_reason": route.routing_reason,
        "confidence": round(float(route.confidence), 3),
        "action_intent": route.action_intent,
        "risk_level": route.risk_level,
    }


HR_AGENT_VERSION = "v1"
EXECUTIVE_AGENT_VERSION = "v1"

ACTION_TERMS = ("create", "update", "assign", "delete", "move", "change", "send", "schedule", "approve")
EMAIL_TERMS = ("email", "mail", "draft", "reply", "subject", "recipient")
PERFORMANCE_TERMS = ("performance", "metrics", "overdue", "workload", "capacity", "completion", "eod", "trend")
PROJECT_TERMS = ("project", "task", "blocker", "risk", "dependency", "deadline", "scope", "milestone", "breakdown")
HR_TERMS = (
    "attendance", "leave", "hr document", "onboarding", "probation",
    "candidate", "recruitment", "job opening", "resume", "interview", "offer",
    "hiring", "payroll", "payslip", "salary", "absent", "hr attention",
    "who is", "tell me about", "what about", "which leave", "which interview",
    "hiring pipeline", "employee status",
    "how many days", "present", "application", "hiring",
)

DEEP_HR_TERMS = (
    "leave", "payroll", "payslip", "salary", "attendance", "absent",
    "employee profile", "profile", "hr document", "document", "onboarding",
    "probation", "candidate", "recruitment", "job opening", "resume",
    "interview", "offer", "hiring", "application",
)

# Executive-level terms that should be routed to the Executive Agent.
# Covers natural executive language: broad company questions, cross-domain
# investigation, person-specific task/work questions, and status queries.
EXECUTIVE_TERMS = (
    # Daily brief / company overview
    "what needs my attention", "attention today", "company health",
    "company doing", "what should i know", "what should i focus",
    "focus on this week", "what happened today", "what needs attention",
    # Executive identity
    "executive",
    # Client / project risk
    "client risk", "client at risk", "why is client",
    "project risk", "project delayed", "why is project",
    "why are we late", "late on",
    # Sales
    "sales performing", "sales status", "how is sales",
    "how many leads", "conversion", "sales",
    # Finance
    "overdue invoice", "finance status", "receivable",
    "collecting our money", "on time",
    # Workload / team
    "team workload", "highest workload", "overloaded",
    "team needs", "who is overloaded",
    # Meetings
    "meeting summary", "meeting follow",
    # Natural task/work questions (routed to Executive for cross-domain view)
    "what did", "what work", "pending for", "still pending",
    # Activity / status checks
    "what did", "what happened today",
    # CEO natural language patterns — person-specific task queries
    "how many task", "how many tasks", "task assign", "tasks assign",
    "task we assign", "tasks we assign",
    "how many assign", "what work does",
    "what did", "who has", "who has too much",
    # Deliverables / videos / content queries
    "videos pending", "how many videos", "video pending",
    "deliverables pending", "content pending",
    # Non-English / mixed language
    "chal raha", "kaisa",
)

EXECUTIVE_DOMAIN_TERMS = (
    "task", "tasks", "work", "pending", "complete", "completed", "done",
    "assigned", "assignment", "workload", "deadline", "delayed", "delay",
    "project", "client", "sales", "crm", "lead", "leads", "finance",
    "invoice", "receivable", "meeting", "company", "activity", "attention",
    "most", "highest", "risk", "blocked", "blocker",
)

EXECUTIVE_INTENT_PATTERNS = (
    re.compile(r"\bhow\s+many\s+tasks?\b.*\b(assign(?:ed)?|for|to|does|do)\b", re.I),
    re.compile(r"\bwhat\s+did\b.+\b(complete|finish|do|work\s+on)\b", re.I),
    re.compile(r"\bwho\s+(?:has|have)\b.*\b(most|highest|pending|workload|work)\b", re.I),
    re.compile(r"\bwhy\s+is\b.+\b(delayed|late|at\s+risk|blocked|problem)\b", re.I),
    re.compile(r"\bhow\s+is\b.*\b(sales|company|crm|finance|workload)\b", re.I),
    re.compile(r"\bwhat\s+needs\b.*\battention\b", re.I),
    re.compile(r"\bwhat\s+happened\b.*\b(today|this\s+week|yesterday)\b", re.I),
)


@dataclass(frozen=True)
class AgentRoute:
    intent: str
    agent_id: str
    agent_version: str
    routing_reason: str
    confidence: float
    required_context_sections: list[str]
    read_only: bool = True
    action_intent: bool = False
    approval_required: bool = False
    risk_level: str = "normal"
    fallback_behavior: str = "run_selected_agent"
    specialist_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def model_context(self) -> dict[str, Any]:
        return {
            "intent": self.intent,
            "agent_id": self.agent_id,
            "agent_version": self.agent_version,
            "routing_reason": self.routing_reason,
            "confidence": self.confidence,
            "required_context_sections": self.required_context_sections,
            "read_only": self.read_only,
            "action_intent": self.action_intent,
            "approval_required": self.approval_required,
            "risk_level": self.risk_level,
            "fallback_behavior": self.fallback_behavior,
            "specialist_id": self.specialist_id,
            "metadata": self.metadata,
            "authority": "deterministic_router_v1",
        }


class DeterministicAgentRouter:
    def route(self, *, message: str, workspace: dict[str, Any], capability_pack: RoleCapabilityPack) -> AgentRoute:
        text = str(message or "").lower()
        action_intent = any(term in text for term in ACTION_TERMS)

        if self._is_deep_hr_query(text) and not self._is_executive_company_query(text):
            return self._agent_or_clarify(
                capability_pack=capability_pack,
                agent_id=HR_AGENT_ID,
                agent_version=HR_AGENT_VERSION,
                intent="hr_operations",
                routing_reason="deep_hr_terms",
                confidence=0.9,
                sections=["identity_context", "permission_context", "workspace_context", "working_memory", "request_context"],
                action_intent=action_intent,
                approval_required=action_intent,
            )

        if self._is_executive_company_query(text) or self._matches(text, EXECUTIVE_TERMS):
            return self._agent_or_clarify(
                capability_pack=capability_pack,
                agent_id=EXECUTIVE_AGENT_ID,
                agent_version=EXECUTIVE_AGENT_VERSION,
                intent="executive_operations",
                routing_reason="executive_terms",
                confidence=0.92,
                sections=["identity_context", "permission_context", "workspace_context", "working_memory", "request_context"],
                action_intent=action_intent,
                approval_required=action_intent,
            )

        # HR Agent routing — check before email/project so HR queries are handled first
        if self._matches(text, HR_TERMS):
            return self._agent_or_clarify(
                capability_pack=capability_pack,
                agent_id=HR_AGENT_ID,
                agent_version=HR_AGENT_VERSION,
                intent="hr_operations",
                routing_reason="hr_terms",
                confidence=0.88,
                sections=["identity_context", "permission_context", "workspace_context", "working_memory", "request_context"],
                action_intent=action_intent,
                approval_required=action_intent,
            )

        if self._matches(text, EMAIL_TERMS):
            return self._agent_or_clarify(
                capability_pack=capability_pack,
                agent_id=EMAIL_DRAFT_AGENT_ID,
                agent_version=EMAIL_DRAFT_AGENT_VERSION,
                intent="email_draft",
                routing_reason="email_draft_terms",
                confidence=0.9,
                sections=["identity_context", "permission_context", "workspace_context", "working_memory", "personal_preferences", "structured_memory", "approved_rag_evidence", "request_context"],
                action_intent=action_intent,
                approval_required=True,
            )
        if self._matches(text, PERFORMANCE_TERMS):
            return self._agent_or_clarify(
                capability_pack=capability_pack,
                agent_id=TASK_PERFORMANCE_AGENT_ID,
                agent_version=TASK_PERFORMANCE_AGENT_VERSION,
                intent="task_performance",
                routing_reason="performance_terms",
                confidence=0.86,
                sections=["identity_context", "permission_context", "workspace_context", "working_memory", "structured_memory", "approved_rag_evidence", "request_context"],
                action_intent=action_intent,
                approval_required=action_intent,
                risk_level="high",
            )
        if workspace.get("project_id") or self._matches(text, PROJECT_TERMS):
            operation = self._project_operation(text)
            return self._agent_or_clarify(
                capability_pack=capability_pack,
                agent_id=PROJECT_AGENT_ID,
                agent_version=PROJECT_AGENT_VERSION,
                intent="project_agent",
                routing_reason=f"project_terms:{operation.value}",
                confidence=0.84 if workspace.get("project_id") else 0.68,
                sections=["identity_context", "permission_context", "workspace_context", "working_memory", "personal_preferences", "structured_memory", "approved_rag_evidence", "request_context"],
                action_intent=action_intent,
                approval_required=action_intent,
                metadata={"project_operation": operation.value},
            )
        return AgentRoute(
            intent="general_personal_assistant",
            agent_id=PROJECT_AGENT_ID,
            agent_version=PROJECT_AGENT_VERSION,
            routing_reason="general_safe_read_fallback",
            confidence=0.55,
            required_context_sections=["identity_context", "permission_context", "workspace_context", "working_memory", "personal_preferences", "approved_rag_evidence", "request_context"],
            action_intent=action_intent,
            approval_required=action_intent,
            fallback_behavior="safe_read_or_clarify",
            metadata={"capability": GENERAL_ASSISTANT_CAPABILITY, "project_operation": ProjectAgentOperation.PROJECT_SUMMARY.value, "needs_llm_intent": True},
        )

    def _agent_or_clarify(
        self,
        *,
        capability_pack: RoleCapabilityPack,
        agent_id: str,
        agent_version: str,
        intent: str,
        routing_reason: str,
        confidence: float,
        sections: list[str],
        action_intent: bool,
        approval_required: bool,
        risk_level: str = "normal",
        metadata: dict[str, Any] | None = None,
    ) -> AgentRoute:
        if agent_id not in capability_pack.accessible_agents:
            return AgentRoute(
                intent="unsupported_capability",
                agent_id=PROJECT_AGENT_ID,
                agent_version=PROJECT_AGENT_VERSION,
                routing_reason=f"capability_pack_denied:{agent_id}",
                confidence=1.0,
                required_context_sections=["identity_context", "permission_context", "request_context"],
                action_intent=action_intent,
                approval_required=False,
                risk_level="blocked",
                fallback_behavior="access_denied",
                metadata=metadata or {},
            )
        return AgentRoute(
            intent=intent,
            agent_id=agent_id,
            agent_version=agent_version,
            routing_reason=routing_reason,
            confidence=confidence,
            required_context_sections=sections,
            action_intent=action_intent,
            approval_required=approval_required,
            risk_level=risk_level,
            metadata=metadata or {},
        )

    async def route_with_llm_intent(
        self,
        *,
        message: str,
        workspace: dict[str, Any],
        capability_pack: RoleCapabilityPack,
        conversation_history: list[dict[str, str]] | None = None,
        entity_context: dict[str, Any] | None = None,
    ) -> AgentRoute:
        """Route using deterministic rules first, then Groq intent interpreter for ambiguous queries.

        This is the recommended entry point for the unified AI assistant chat endpoint.
        It tries the fast deterministic route first. If confidence is below the threshold
        OR the deterministic route falls to the general fallback, the Groq intent
        interpreter is consulted.
        """
        from app.ai.observability import tracer as ai_tracer

        trace = ai_tracer.get_current_trace()
        if trace is not None:
            span = ai_tracer.start_span("ROUTING", "deterministic_agent_router", attrs={"uses_llm_intent": True})
        else:
            span = None
        try:
            route = await self._route_with_llm_intent_impl(
                message=message,
                workspace=workspace,
                capability_pack=capability_pack,
                conversation_history=conversation_history,
                entity_context=entity_context,
            )
        except Exception as exc:
            if span is not None:
                ai_tracer.end_span(
                    span,
                    status="FAILED",
                    error_type=type(exc).__name__,
                    error_message=f"{type(exc).__name__}: {exc}",
                )
            raise
        if span is not None:
            ai_tracer.end_span(span, attrs=_routing_span_attrs(route))
            ai_tracer.enrich_trace(
                trace,
                agent=route.agent_id,
                path=route.intent,
                route=route.routing_reason,
            )
        return route

    async def _route_with_llm_intent_impl(
        self,
        *,
        message: str,
        workspace: dict[str, Any],
        capability_pack: RoleCapabilityPack,
        conversation_history: list[dict[str, str]] | None = None,
        entity_context: dict[str, Any] | None = None,
    ) -> AgentRoute:
        """Deterministic-first routing with LLM intent fallback (instrumentation wrapper body)."""
        deterministic = self.route(message=message, workspace=workspace, capability_pack=capability_pack)

        # High-confidence deterministic route — use it directly
        if deterministic.confidence >= 0.80 and not deterministic.metadata.get("needs_llm_intent"):
            return deterministic

        # Low-confidence or general fallback — consult the LLM intent interpreter
        try:
            from app.agents.intent_interpreter import IntentInterpreter
            interpreter = IntentInterpreter()
            result = await interpreter.classify(
                message=message,
                conversation_context=conversation_history,
                entity_context=entity_context,
            )
            if result.success and result.structured_intent.confidence >= 0.6:
                intent = result.structured_intent
                target_agent = intent.target_agent
                agent_version = EXECUTIVE_AGENT_VERSION if target_agent == EXECUTIVE_AGENT_ID else (
                    HR_AGENT_VERSION if target_agent == HR_AGENT_ID else PROJECT_AGENT_VERSION
                )
                # Determine sections based on agent type
                sections = ["identity_context", "permission_context", "workspace_context", "working_memory", "request_context"]
                if target_agent == PROJECT_AGENT_ID:
                    sections.extend(["structured_memory", "approved_rag_evidence"])

                route = self._agent_or_clarify(
                    capability_pack=capability_pack,
                    agent_id=target_agent,
                    agent_version=agent_version,
                    intent=intent.intent,
                    routing_reason=f"llm_intent_interpreter:{intent.intent}",
                    confidence=intent.confidence,
                    sections=sections,
                    action_intent=deterministic.action_intent,
                    approval_required=deterministic.action_intent,
                )
                # Enrich metadata with extracted entities
                route.metadata["intent_entities"] = [
                    {"type": e.type, "text": e.text} for e in intent.entities
                ]
                route.metadata["intent_metrics"] = intent.metrics
                route.metadata["intent_timeframe"] = intent.timeframe
                logger.info(
                    "LLM intent override: %s → %s (confidence=%.2f)",
                    message[:80], target_agent, intent.confidence,
                )
                return route
        except Exception as exc:
            logger.warning("LLM intent interpreter failed, using deterministic route: %s", type(exc).__name__)

        return deterministic

    def _project_operation(self, text: str) -> ProjectAgentOperation:
        if any(term in text for term in ("breakdown", "decompose", "split", "scope")):
            return ProjectAgentOperation.DECOMPOSE_SCOPE
        if any(term in text for term in ("risk", "blocker", "dependency")):
            return ProjectAgentOperation.IDENTIFY_RISKS
        if any(term in text for term in ("estimate", "capacity")):
            return ProjectAgentOperation.ESTIMATE_WORK
        return ProjectAgentOperation.PROJECT_SUMMARY

    def _matches(self, text: str, terms: tuple[str, ...]) -> bool:
        return any(term in text for term in terms)

    def _is_executive_company_query(self, text: str) -> bool:
        if any(pattern.search(text) for pattern in EXECUTIVE_INTENT_PATTERNS):
            return True
        return any(term in text for term in EXECUTIVE_DOMAIN_TERMS) and any(
            trigger in text
            for trigger in (
                "how many", "what did", "who has", "who is", "why is", "how is",
                "what needs", "what happened", "which", "show me", "tell me",
            )
        )

    def _is_deep_hr_query(self, text: str) -> bool:
        if any(term in text for term in ("tell me about", "employee profile", "profile of")):
            return True
        return any(term in text for term in DEEP_HR_TERMS)
