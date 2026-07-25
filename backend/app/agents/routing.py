from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.agents.capability_packs import GENERAL_ASSISTANT_CAPABILITY, RoleCapabilityPack
from app.agents.email_draft import EMAIL_DRAFT_AGENT_ID, EMAIL_DRAFT_AGENT_VERSION
from app.agents.project_agent import PROJECT_AGENT_ID, PROJECT_AGENT_VERSION, ProjectAgentOperation
from app.agents.task_performance import TASK_PERFORMANCE_AGENT_ID, TASK_PERFORMANCE_AGENT_VERSION


ACTION_TERMS = ("create", "update", "assign", "delete", "move", "change", "send", "schedule", "approve")
EMAIL_TERMS = ("email", "mail", "draft", "reply", "subject", "recipient")
PERFORMANCE_TERMS = ("performance", "metrics", "overdue", "workload", "capacity", "completion", "eod", "trend")
PROJECT_TERMS = ("project", "task", "blocker", "risk", "dependency", "deadline", "scope", "milestone", "breakdown")


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
            metadata={"capability": GENERAL_ASSISTANT_CAPABILITY, "project_operation": ProjectAgentOperation.PROJECT_SUMMARY.value},
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
