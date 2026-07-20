from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from app.core.config import settings
from app.rag.permissions import RAGScope
from app.rag.retrieval import RAGRetrievalService
from app.rag.working_memory import WorkingMemoryService, WorkingMemorySnapshot


class AuthorityType(str, Enum):
    USER_INPUT = "USER_INPUT"
    WORKING_MEMORY = "WORKING_MEMORY"
    STRUCTURED_MEMORY = "STRUCTURED_MEMORY"
    RAG_DOCUMENT = "RAG_DOCUMENT"
    TOOL_OUTPUT = "TOOL_OUTPUT"
    LLM_FALLBACK = "LLM_FALLBACK"


class ContextItem(BaseModel):
    authority_type: AuthorityType
    content: str
    source_identifier: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    authorization_status: str = "authorized"
    sensitivity: str = "internal"
    external_model_allowed: bool = True
    citation_id: Optional[str] = None
    untrusted: bool = False


class StructuredMemoryStatus(BaseModel):
    status: str = "not_integrated"
    authoritative: bool = True
    facts: list[dict[str, Any]] = Field(default_factory=list)


class ContextBudget(BaseModel):
    max_items: int
    max_chars: int
    used_items: int = 0
    used_chars: int = 0
    truncated: bool = False


class ContextPackage(BaseModel):
    context_package_id: str
    trace_id: str
    created_at: datetime
    expires_at: datetime
    authenticated_scope: dict[str, Any]
    permission_hash: str
    original_query: str
    resolved_query: str
    working_memory: dict[str, Any]
    resolved_reference_bindings: dict[str, Any] = Field(default_factory=dict)
    structured_memory: StructuredMemoryStatus = Field(default_factory=StructuredMemoryStatus)
    authorized_rag_excerpts: list[ContextItem] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    source_authority_labels: dict[str, str] = Field(default_factory=dict)
    conflicts: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    retrieval_status: str = "not_requested"
    clarification_required: bool = False
    budget: ContextBudget


def permission_hash(scope: RAGScope) -> str:
    payload = "|".join(
        [
            scope.company_id or "",
            scope.tenant_id or "",
            scope.user_id or "",
            scope.role or "",
            scope.project_id or "",
            scope.department_id or "",
            scope.client_id or "",
            ",".join(sorted(scope.allowed_user_ids)),
            ",".join(sorted(scope.allowed_roles)),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class SanitizedModelContext(BaseModel):
    context_package_id: str
    trace_id: str
    original_query: str
    resolved_query: str
    structured_memory_status: str
    items: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    warnings: list[str] = Field(default_factory=list)
    clarification_required: bool = False


class ContextPackageBuilder:
    def __init__(
        self,
        *,
        working_memory_service: WorkingMemoryService | None = None,
        retrieval_service: RAGRetrievalService | None = None,
    ) -> None:
        self.working_memory_service = working_memory_service or WorkingMemoryService()
        self.retrieval_service = retrieval_service

    async def build(
        self,
        *,
        scope: RAGScope,
        session_id: str,
        conversation_id: str,
        query: str,
        top_k: int | None = None,
        trace_id: str | None = None,
    ) -> ContextPackage:
        if not scope.company_id or not scope.tenant_id:
            raise ValueError("Tenant scope is required before building a ContextPackage")
        created_at = datetime.now(timezone.utc)
        trace = trace_id or str(uuid4())
        snapshot = await self.working_memory_service.get_session(
            scope=scope,
            session_id=session_id,
            conversation_id=conversation_id,
            refresh_idle=True,
        )
        warnings: list[str] = []
        retrieval_status = "not_requested"
        citations: list[dict[str, Any]] = []
        rag_items: list[ContextItem] = []
        resolved_query = query
        bindings = snapshot.resolved_reference_bindings if snapshot else {}
        clarification_required = False

        if not snapshot:
            warnings.append("working_memory_unavailable")
            clarification_required = True
        else:
            resolved_query, clarification_required = self._resolve_query(query, snapshot)
            if snapshot.status != "available":
                warnings.append(snapshot.status)

        try:
            retrieval_service = self.retrieval_service or RAGRetrievalService()
            rag_result = await retrieval_service.retrieve(scope=scope, query=resolved_query, top_k=top_k or settings.RAG_RETRIEVAL_TOP_K)
            retrieval_status = "no_answer" if rag_result.get("answerable") is False else "success"
            for citation in rag_result.get("citations") or []:
                citations.append(citation)
                rag_items.append(
                    ContextItem(
                        authority_type=AuthorityType.RAG_DOCUMENT,
                        content=str(citation.get("excerpt") or ""),
                        source_identifier=str(citation.get("source_id") or ""),
                        citation_id=str(citation.get("citation_id") or ""),
                        sensitivity="internal",
                        external_model_allowed=True,
                        untrusted=True,
                    )
                )
        except Exception as exc:
            retrieval_status = "unavailable"
            warnings.append(f"rag_retrieval_unavailable:{type(exc).__name__}")

        memory_payload = snapshot.model_context() if snapshot else {"status": "working_memory_unavailable"}
        items = self._budget_items(rag_items, max_chars=settings.RAG_CONTEXT_PACKAGE_MAX_CHARS)
        budget = ContextBudget(
            max_items=settings.RAG_CONTEXT_PACKAGE_MAX_ITEMS,
            max_chars=settings.RAG_CONTEXT_PACKAGE_MAX_CHARS,
            used_items=len(items),
            used_chars=sum(len(item.content) for item in items),
            truncated=len(items) < len(rag_items),
        )
        return ContextPackage(
            context_package_id=str(uuid4()),
            trace_id=trace,
            created_at=created_at,
            expires_at=snapshot.expires_at if snapshot else created_at,
            authenticated_scope={
                "company_id": scope.company_id,
                "tenant_id": scope.tenant_id,
                "user_id": scope.user_id,
                "role": scope.role,
                "project_id": scope.project_id,
                "department_id": scope.department_id,
                "client_id": scope.client_id,
            },
            permission_hash=permission_hash(scope),
            original_query=query,
            resolved_query=resolved_query,
            working_memory=memory_payload,
            resolved_reference_bindings=bindings,
            structured_memory=StructuredMemoryStatus(),
            authorized_rag_excerpts=items,
            citations=self._filter_citations_for_items(citations, items),
            source_authority_labels={
                "working_memory": AuthorityType.WORKING_MEMORY.value,
                "structured_memory": AuthorityType.STRUCTURED_MEMORY.value,
                "rag": AuthorityType.RAG_DOCUMENT.value,
            },
            conflicts=[],
            warnings=warnings,
            retrieval_status=retrieval_status,
            clarification_required=clarification_required,
            budget=budget,
        )

    def _resolve_query(self, query: str, snapshot: WorkingMemorySnapshot) -> tuple[str, bool]:
        lowered = query.lower()
        project = snapshot.current_project
        bindings = snapshot.resolved_reference_bindings
        if any(token in lowered for token in (" its ", " this project", " that project")):
            candidates = bindings.get("project_options") or []
            if len(candidates) > 1:
                return query, True
            if project:
                name = project.get("name") or project.get("id")
                return f"{query} [resolved current project: {name}]", False
            return query, True
        return query, False

    def _budget_items(self, items: list[ContextItem], *, max_chars: int) -> list[ContextItem]:
        kept: list[ContextItem] = []
        used = 0
        for item in items[: settings.RAG_CONTEXT_PACKAGE_MAX_ITEMS]:
            remaining = max_chars - used
            if remaining <= 0:
                break
            content = item.content[:remaining]
            kept.append(item.model_copy(update={"content": content}))
            used += len(content)
        return kept

    def _filter_citations_for_items(self, citations: list[dict[str, Any]], items: list[ContextItem]) -> list[dict[str, Any]]:
        allowed = {item.citation_id for item in items if item.citation_id}
        return [citation for citation in citations if citation.get("citation_id") in allowed]


def sanitize_for_model_context(package: ContextPackage) -> SanitizedModelContext:
    items = []
    for item in package.authorized_rag_excerpts:
        if not item.external_model_allowed or item.authorization_status != "authorized":
            continue
        items.append(
            {
                "authority_type": item.authority_type.value,
                "content": item.content,
                "source_identifier": item.source_identifier,
                "citation_id": item.citation_id,
                "sensitivity": item.sensitivity,
                "untrusted_data": item.untrusted,
            }
        )
    return SanitizedModelContext(
        context_package_id=package.context_package_id,
        trace_id=package.trace_id,
        original_query=package.original_query,
        resolved_query=package.resolved_query,
        structured_memory_status=package.structured_memory.status,
        items=items,
        citations=package.citations,
        warnings=package.warnings,
        clarification_required=package.clarification_required,
    )
