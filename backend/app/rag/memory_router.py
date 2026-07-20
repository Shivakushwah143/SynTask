from __future__ import annotations

from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class MemoryRoute(str, Enum):
    WORKING_MEMORY = "WORKING_MEMORY"
    STRUCTURED_MEMORY = "STRUCTURED_MEMORY"
    KNOWLEDGE_RAG = "KNOWLEDGE_RAG"
    COMBINED = "COMBINED"
    CLARIFICATION_REQUIRED = "CLARIFICATION_REQUIRED"
    UNSUPPORTED = "UNSUPPORTED"
    ACTION_REQUIRES_APPROVAL = "ACTION_REQUIRES_APPROVAL"


class MemoryRoutingDecision(BaseModel):
    original_query: str
    selected_route: MemoryRoute
    routing_reason: str
    detected_entities: list[dict[str, Any]] = Field(default_factory=list)
    resolved_entity_ids: dict[str, str] = Field(default_factory=dict)
    required_sources: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    confidence: float
    router_version: str = "memory-router-v1"
    trace_id: str = Field(default_factory=lambda: str(uuid4()))


MUTATION_TERMS = ("move ", "reschedule", "change ", "assign ", "update ", "create ", "delete ", "send ")
POLICY_TERMS = ("policy", "handbook", "guideline", "procedure", "leave policy", "delivery policy")
STRUCTURED_TERMS = ("owner", "owns", "stage", "status", "deadline", "due", "assigned", "meeting", "project", "task", "lead", "company", "client", "contact", "user")
REFERENCE_TERMS = ("this ", "that ", "it ", "current ")


class MemoryRouter:
    version = "memory-router-v1"

    def route(self, *, query: str, working_memory: dict[str, Any] | None = None, trace_id: str | None = None) -> MemoryRoutingDecision:
        text = " ".join(query.lower().split())
        detected = self._detect_entities(text, working_memory or {})
        resolved = {item["type"]: item["id"] for item in detected if item.get("id")}
        missing = []
        route = MemoryRoute.UNSUPPORTED
        reason = "No supported memory source matched deterministically."
        sources: list[str] = []
        confidence = 0.45

        if any(term in text for term in MUTATION_TERMS):
            if any(term in text for term in REFERENCE_TERMS) and not resolved:
                route = MemoryRoute.CLARIFICATION_REQUIRED
                reason = "Mutation target reference is ambiguous."
                missing = ["target_record_id"]
                sources = ["WORKING_MEMORY"]
                confidence = 0.78
            else:
                route = MemoryRoute.ACTION_REQUIRES_APPROVAL
                reason = "Mutation intent must become a read-only proposed action."
                sources = ["WORKING_MEMORY", "STRUCTURED_MEMORY"]
                confidence = 0.86
        elif any(term in text for term in POLICY_TERMS) and any(term in text for term in ("project", "task", "lead", "company", "client")):
            route = MemoryRoute.COMBINED
            reason = "Question requires current business facts plus approved policy evidence."
            sources = ["STRUCTURED_MEMORY", "KNOWLEDGE_RAG"]
            confidence = 0.84
        elif any(term in text for term in POLICY_TERMS):
            route = MemoryRoute.KNOWLEDGE_RAG
            reason = "Question asks for approved document knowledge."
            sources = ["KNOWLEDGE_RAG"]
            confidence = 0.82
        elif any(term in text for term in STRUCTURED_TERMS):
            if any(term in text for term in REFERENCE_TERMS) and not resolved:
                route = MemoryRoute.CLARIFICATION_REQUIRED
                reason = "Structured business question has unresolved reference."
                missing = ["record_reference"]
                sources = ["WORKING_MEMORY", "STRUCTURED_MEMORY"]
                confidence = 0.76
            else:
                route = MemoryRoute.STRUCTURED_MEMORY
                reason = "Question asks for current authorized business fact."
                sources = ["STRUCTURED_MEMORY"]
                confidence = 0.83

        return MemoryRoutingDecision(
            original_query=query,
            selected_route=route,
            routing_reason=reason,
            detected_entities=detected,
            resolved_entity_ids=resolved,
            required_sources=sources,
            missing_information=missing,
            confidence=confidence,
            router_version=self.version,
            trace_id=trace_id or str(uuid4()),
        )

    def _detect_entities(self, text: str, working_memory: dict[str, Any]) -> list[dict[str, Any]]:
        entities: list[dict[str, Any]] = []
        for key, entity_type in (("current_project", "project"), ("current_lead", "lead"), ("current_company", "company"), ("current_task", "task")):
            value = working_memory.get(key) or {}
            entity_id = value.get("id") or value.get("record_id") or value.get("project_id")
            if entity_id and (entity_type in text or any(term in text for term in REFERENCE_TERMS)):
                entities.append({"type": entity_type, "id": str(entity_id), "source": "WORKING_MEMORY"})
        selected = working_memory.get("selected_record") or {}
        if selected.get("id") and any(term in text for term in REFERENCE_TERMS):
            entities.append({"type": str(selected.get("type") or "record"), "id": str(selected["id"]), "source": "WORKING_MEMORY"})
        return entities
