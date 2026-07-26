from __future__ import annotations

import re
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

from app.core.config import settings
from app.rag.memory_router import MemoryRoute, MemoryRouter


class QueryIntent(str):
    WORKING_MEMORY = "WORKING_MEMORY"
    STRUCTURED_MEMORY = "STRUCTURED_MEMORY"
    KNOWLEDGE_RAG = "KNOWLEDGE_RAG"
    COMBINED = "COMBINED"
    CLARIFICATION_REQUIRED = "CLARIFICATION_REQUIRED"
    UNSUPPORTED = "UNSUPPORTED"
    ACTION_REQUIRES_APPROVAL = "ACTION_REQUIRES_APPROVAL"


class QueryUnderstandingResult(BaseModel):
    original_query: str
    normalized_query: str
    intent: str
    route: MemoryRoute
    detected_entities: list[dict[str, Any]] = Field(default_factory=list)
    resolved_entity_ids: dict[str, str] = Field(default_factory=dict)
    rewritten_queries: list[str] = Field(default_factory=list)
    decomposed_subqueries: list[str] = Field(default_factory=list)
    required_memory_sources: list[str] = Field(default_factory=list)
    required_structured_domains: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    clarification_required: bool = False
    unsupported_reason: str | None = None
    confidence: float
    model_provider: str = "deterministic"
    model_name: str | None = None
    prompt_version: str = "none"
    classifier_version: str = "query-understanding-v1"
    trace_id: str = Field(default_factory=lambda: str(uuid4()))

    @field_validator("rewritten_queries", "decomposed_subqueries")
    @classmethod
    def dedupe_queries(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        output: list[str] = []
        for item in value:
            normalized = " ".join(str(item).split())
            key = normalized.lower()
            if normalized and key not in seen:
                seen.add(key)
                output.append(normalized)
        return output


class QueryUnderstandingService:
    def __init__(self, *, router: MemoryRouter | None = None) -> None:
        self.router = router or MemoryRouter()

    def understand(self, *, query: str, working_memory: dict[str, Any] | None = None, trace_id: str | None = None) -> QueryUnderstandingResult:
        original = query
        normalized = " ".join(query.split())
        decision = self.router.route(query=normalized, working_memory=working_memory or {}, trace_id=trace_id)
        rewrites = self._rewrites(normalized, decision.resolved_entity_ids)
        subqueries = self._decompose(normalized)
        structured_domains = sorted({item["type"] for item in decision.detected_entities if item.get("type") in {"lead", "project", "task", "company", "meeting", "user", "client", "contact"}})
        if decision.selected_route in {MemoryRoute.STRUCTURED_MEMORY, MemoryRoute.COMBINED, MemoryRoute.ACTION_REQUIRES_APPROVAL} and not structured_domains:
            structured_domains = self._domains_from_text(normalized)
        return QueryUnderstandingResult(
            original_query=original,
            normalized_query=normalized,
            intent=decision.selected_route.value,
            route=decision.selected_route,
            detected_entities=decision.detected_entities,
            resolved_entity_ids=decision.resolved_entity_ids,
            rewritten_queries=rewrites,
            decomposed_subqueries=subqueries,
            required_memory_sources=decision.required_sources,
            required_structured_domains=structured_domains,
            missing_information=decision.missing_information,
            clarification_required=decision.selected_route == MemoryRoute.CLARIFICATION_REQUIRED,
            unsupported_reason=decision.routing_reason if decision.selected_route == MemoryRoute.UNSUPPORTED else None,
            confidence=decision.confidence,
            classifier_version=settings.RAG_QUERY_UNDERSTANDING_VERSION,
            trace_id=decision.trace_id,
        )

    def _rewrites(self, query: str, resolved_ids: dict[str, str]) -> list[str]:
        exactish = bool(re.search(r"\b[A-Z]{2,}-\d+\b|\".+\"", query))
        if exactish:
            return [query][: settings.RAG_QUERY_MAX_REWRITES]
        cleaned = re.sub(r"\b(what|why|who|which|did|does|our|the|a|an|is|are|about)\b", " ", query, flags=re.IGNORECASE)
        cleaned = " ".join(cleaned.split())
        entity_terms = " ".join(f"{key} {value}" for key, value in sorted(resolved_ids.items()))
        rewrites = [query]
        if cleaned and cleaned.lower() != query.lower():
            rewrites.append(cleaned)
        if entity_terms:
            rewrites.append(f"{cleaned or query} {entity_terms}")
        return rewrites[: settings.RAG_QUERY_MAX_REWRITES]

    def _decompose(self, query: str) -> list[str]:
        parts = re.split(r"\s+(?:and|also|plus)\s+", query, flags=re.IGNORECASE)
        return [part.strip(" ?.") for part in parts if part.strip(" ?.")][: settings.RAG_QUERY_MAX_SUBQUERIES]

    def _domains_from_text(self, query: str) -> list[str]:
        domains = []
        for domain in ("lead", "project", "task", "company", "meeting", "user", "client", "contact"):
            if domain in query.lower():
                domains.append(domain)
        return domains
