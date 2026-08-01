from __future__ import annotations

import hashlib
from datetime import datetime

from app.core.clock import aware_utc_now
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from app.core.config import settings
from app.rag.memory_router import MemoryRoute, MemoryRouter, MemoryRoutingDecision
from app.rag.permissions import RAGScope
from app.rag.query_understanding import QueryUnderstandingResult, QueryUnderstandingService
from app.rag.retrieval import RAGRetrievalService
from app.rag.structured_memory import ProposedAction, StructuredMemoryRequest, StructuredMemoryService, StructuredRecordType
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
    created_at: datetime = Field(default_factory=aware_utc_now)
    authorization_status: str = "authorized"
    sensitivity: str = "internal"
    external_model_allowed: bool = True
    citation_id: Optional[str] = None
    untrusted: bool = False


class StructuredMemoryStatus(BaseModel):
    status: str = "integrated"
    authoritative: bool = True
    facts: list[dict[str, Any]] = Field(default_factory=list)
    missing: list[dict[str, Any]] = Field(default_factory=list)
    errors: list[dict[str, Any]] = Field(default_factory=list)


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
    routing_decision: MemoryRoutingDecision | None = None
    proposed_action: ProposedAction | None = None
    query_understanding: QueryUnderstandingResult | None = None
    retrieval_profile: dict[str, Any] | None = None
    fusion_trace: dict[str, Any] = Field(default_factory=dict)
    reranking_trace: dict[str, Any] = Field(default_factory=dict)
    evidence_decision: dict[str, Any] | None = None
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
    query_understanding: dict[str, Any] | None = None
    retrieval_profile: dict[str, Any] | None = None
    evidence_decision: dict[str, Any] | None = None


class ContextPackageBuilder:
    def __init__(
        self,
        *,
        working_memory_service: WorkingMemoryService | None = None,
        retrieval_service: RAGRetrievalService | None = None,
        structured_memory_service: StructuredMemoryService | None = None,
        memory_router: MemoryRouter | None = None,
        query_understanding_service: QueryUnderstandingService | None = None,
    ) -> None:
        self.working_memory_service = working_memory_service or WorkingMemoryService()
        self.retrieval_service = retrieval_service
        self.structured_memory_service = structured_memory_service
        self.memory_router = memory_router or MemoryRouter()
        self.query_understanding_service = query_understanding_service or QueryUnderstandingService(router=self.memory_router)

    async def build(
        self,
        *,
        scope: RAGScope,
        session_id: str,
        conversation_id: str,
        query: str,
        top_k: int | None = None,
        retrieval_profile_id: str | None = None,
        structured_context_ids: dict[str, str | None] | None = None,
        trace_id: str | None = None,
    ) -> ContextPackage:
        if not scope.company_id or not scope.tenant_id:
            raise ValueError("Tenant scope is required before building a ContextPackage")
        created_at = aware_utc_now()
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
        structured_ids = dict(structured_context_ids or {})
        clarification_required = False
        structured_memory = StructuredMemoryStatus()
        routing_decision: MemoryRoutingDecision | None = None
        proposed_action: ProposedAction | None = None
        conflicts: list[str] = []
        query_understanding: QueryUnderstandingResult | None = None
        retrieval_profile: dict[str, Any] | None = None
        fusion_trace: dict[str, Any] = {}
        reranking_trace: dict[str, Any] = {}
        evidence_decision: dict[str, Any] | None = None

        if not snapshot:
            warnings.append("working_memory_unavailable")
            clarification_required = True
        else:
            resolved_query, clarification_required = self._resolve_query(query, snapshot)
            email_bindings = self._email_draft_reference_bindings(query=query, snapshot=snapshot, retrieval_profile_id=retrieval_profile_id)
            if email_bindings:
                bindings = {**bindings, **email_bindings}
                structured_ids = {**email_bindings, **structured_ids}
            if snapshot.status != "available":
                warnings.append(snapshot.status)

        memory_payload = snapshot.model_context() if snapshot else {"status": "working_memory_unavailable"}
        routing_decision = self.memory_router.route(query=query, working_memory=memory_payload, trace_id=trace)
        query_understanding = self.query_understanding_service.understand(query=query, working_memory=memory_payload, trace_id=trace)
        clarification_required = clarification_required or routing_decision.selected_route == MemoryRoute.CLARIFICATION_REQUIRED

        if self._should_load_structured_memory(routing_decision=routing_decision, retrieval_profile_id=retrieval_profile_id):
            structured_memory = await self._load_structured_memory(
                scope=scope,
                snapshot=snapshot,
                query=query,
                routing_decision=routing_decision,
                retrieval_profile_id=retrieval_profile_id,
                structured_context_ids=structured_ids,
            )
            if any(item.get("status") in {"missing", "forbidden", "unavailable", "stale"} for item in structured_memory.missing + structured_memory.errors):
                warnings.append("structured_memory_authoritative_read_incomplete")
            conflicts.extend(self._structured_overrides(snapshot=snapshot, structured_memory=structured_memory))
            if routing_decision.selected_route == MemoryRoute.ACTION_REQUIRES_APPROVAL:
                proposed_action = self._propose_action(scope=scope, query=query, routing_decision=routing_decision)

        if routing_decision.selected_route in {MemoryRoute.KNOWLEDGE_RAG, MemoryRoute.COMBINED}:
            try:
                retrieval_service = self.retrieval_service or RAGRetrievalService()
                rag_result = await self._retrieve(
                    retrieval_service=retrieval_service,
                    scope=scope,
                    query=resolved_query,
                    top_k=top_k or settings.RAG_RETRIEVAL_TOP_K,
                    retrieval_profile_id=retrieval_profile_id,
                    working_memory=memory_payload,
                )
                retrieval_profile = rag_result.get("retrieval_profile")
                fusion_trace = {"policy_version": rag_result.get("fusion_policy_version")} if rag_result.get("fusion_policy_version") else {}
                reranking_trace = {"policy_version": rag_result.get("reranking_policy_version")} if rag_result.get("reranking_policy_version") else {}
                evidence_decision = rag_result.get("evidence_decision")
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
        elif routing_decision.selected_route in {MemoryRoute.STRUCTURED_MEMORY, MemoryRoute.ACTION_REQUIRES_APPROVAL, MemoryRoute.CLARIFICATION_REQUIRED}:
            retrieval_status = "not_requested"
        else:
            retrieval_service = self.retrieval_service or RAGRetrievalService()
            try:
                rag_result = await self._retrieve(
                    retrieval_service=retrieval_service,
                    scope=scope,
                    query=resolved_query,
                    top_k=top_k or settings.RAG_RETRIEVAL_TOP_K,
                    retrieval_profile_id=retrieval_profile_id,
                    working_memory=memory_payload,
                )
                retrieval_profile = rag_result.get("retrieval_profile")
                fusion_trace = {"policy_version": rag_result.get("fusion_policy_version")} if rag_result.get("fusion_policy_version") else {}
                reranking_trace = {"policy_version": rag_result.get("reranking_policy_version")} if rag_result.get("reranking_policy_version") else {}
                evidence_decision = rag_result.get("evidence_decision")
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
            structured_memory=structured_memory,
            authorized_rag_excerpts=items,
            citations=self._filter_citations_for_items(citations, items),
            source_authority_labels={
                "working_memory": AuthorityType.WORKING_MEMORY.value,
                "structured_memory": AuthorityType.STRUCTURED_MEMORY.value,
                "rag": AuthorityType.RAG_DOCUMENT.value,
            },
            conflicts=conflicts,
            warnings=warnings,
            retrieval_status=retrieval_status,
            clarification_required=clarification_required,
            routing_decision=routing_decision,
            proposed_action=proposed_action,
            query_understanding=query_understanding,
            retrieval_profile=retrieval_profile,
            fusion_trace=fusion_trace,
            reranking_trace=reranking_trace,
            evidence_decision=evidence_decision,
            budget=budget,
        )

    def _should_load_structured_memory(self, *, routing_decision: MemoryRoutingDecision, retrieval_profile_id: str | None) -> bool:
        if retrieval_profile_id == "email_draft_templates":
            return True
        return routing_decision.selected_route in {MemoryRoute.STRUCTURED_MEMORY, MemoryRoute.COMBINED, MemoryRoute.ACTION_REQUIRES_APPROVAL}

    async def _retrieve(
        self,
        *,
        retrieval_service,
        scope: RAGScope,
        query: str,
        top_k: int,
        retrieval_profile_id: str | None,
        working_memory: dict[str, Any],
    ) -> dict[str, Any]:
        if retrieval_profile_id:
            try:
                return await retrieval_service.retrieve(
                    scope=scope,
                    query=query,
                    top_k=top_k,
                    profile_id=retrieval_profile_id,
                    working_memory=working_memory,
                )
            except TypeError as exc:
                if "profile_id" not in str(exc) and "working_memory" not in str(exc):
                    raise
        return await retrieval_service.retrieve(scope=scope, query=query, top_k=top_k)

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

    def _email_draft_reference_bindings(self, *, query: str, snapshot: WorkingMemorySnapshot, retrieval_profile_id: str | None) -> dict[str, str]:
        if retrieval_profile_id != "email_draft_templates":
            return {}
        lowered = query.lower()
        bindings: dict[str, str] = {}
        if any(token in lowered for token in ("this project", "that project", "project update")):
            self._bind_record(bindings, "project_id", snapshot.current_project)
        if any(token in lowered for token in ("this task", "that task", "task update")):
            self._bind_record(bindings, "task_id", snapshot.current_task)
        if any(token in lowered for token in ("this client", "that client", "client update")):
            self._bind_selected(bindings, "client_id", snapshot.selected_record, expected_type="client")
        if any(token in lowered for token in ("this lead", "that lead", "lead")):
            self._bind_record(bindings, "lead_id", snapshot.current_lead)
        if any(token in lowered for token in ("this company", "that company", "company")):
            self._bind_record(bindings, "company_record_id", snapshot.current_company)
        if any(token in lowered for token in ("this meeting", "that meeting", "meeting follow")):
            self._bind_selected(bindings, "meeting_id", snapshot.selected_record, expected_type="meeting")
        if any(token in lowered for token in ("this contact", "that contact", "recipient", "them")):
            self._bind_selected(bindings, "recipient_contact_id", snapshot.selected_record, expected_type="contact")
            self._bind_selected(bindings, "recipient_client_id", snapshot.selected_record, expected_type="client")
            self._bind_selected(bindings, "recipient_lead_id", snapshot.selected_record, expected_type="lead")
            self._bind_selected(bindings, "recipient_user_id", snapshot.selected_record, expected_type="user")
        if "last draft" in lowered or "previous draft" in lowered:
            draft_id = self._last_email_draft_id(snapshot)
            if draft_id:
                bindings["last_email_draft_run_id"] = draft_id
        return bindings

    def _bind_record(self, bindings: dict[str, str], key: str, record: dict[str, Any] | None) -> None:
        record_id = (record or {}).get("id")
        if record_id:
            bindings[key] = str(record_id)

    def _bind_selected(self, bindings: dict[str, str], key: str, record: dict[str, Any] | None, *, expected_type: str) -> None:
        if (record or {}).get("type") == expected_type and (record or {}).get("id"):
            bindings[key] = str(record["id"])

    def _last_email_draft_id(self, snapshot: WorkingMemorySnapshot) -> str | None:
        for output in reversed(snapshot.recent_tool_outputs):
            if output.get("agent_id") == "general_email_draft_agent" and output.get("run_id"):
                return str(output["run_id"])
        return None

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

    async def _load_structured_memory(
        self,
        *,
        scope: RAGScope,
        snapshot: WorkingMemorySnapshot | None,
        query: str,
        routing_decision: MemoryRoutingDecision,
        retrieval_profile_id: str | None = None,
        structured_context_ids: dict[str, str | None] | None = None,
    ) -> StructuredMemoryStatus:
        service = self.structured_memory_service or StructuredMemoryService()
        current_user = getattr(scope, "current_user", None)
        if current_user is None:
            return StructuredMemoryStatus(status="unavailable", errors=[{"status": "unavailable", "error": "current_user_required"}])
        requests = self._structured_requests(
            query=query,
            snapshot=snapshot,
            routing_decision=routing_decision,
            retrieval_profile_id=retrieval_profile_id,
            structured_context_ids=structured_context_ids or {},
        )
        facts: list[dict[str, Any]] = []
        missing: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []
        for request in requests:
            result = await service.read(current_user=current_user, request=request)
            payload = result.model_dump(mode="json")
            if result.status.value == "available":
                facts.append(payload)
            elif result.status.value == "unavailable":
                errors.append(payload)
            else:
                missing.append(payload)
        return StructuredMemoryStatus(status="integrated", facts=facts, missing=missing, errors=errors)

    def _structured_requests(
        self,
        *,
        query: str,
        snapshot: WorkingMemorySnapshot | None,
        routing_decision: MemoryRoutingDecision,
        retrieval_profile_id: str | None = None,
        structured_context_ids: dict[str, str | None] | None = None,
    ) -> list[StructuredMemoryRequest]:
        if retrieval_profile_id == "email_draft_templates":
            return self._email_draft_structured_requests(structured_context_ids or {})
        lowered = query.lower()
        resolved = routing_decision.resolved_entity_ids
        if "lead" in resolved or snapshot and snapshot.current_lead:
            record_id = resolved.get("lead") or (snapshot.current_lead or {}).get("id")
            fields = ["current_stage", "assigned_to", "status", "updated_at"] if "stage" in lowered or "owner" in lowered else []
            return [StructuredMemoryRequest(record_type=StructuredRecordType.LEAD, record_id=record_id, requested_fields=fields)]
        if "project" in resolved or "project" in lowered:
            record_id = resolved.get("project") or ((snapshot.current_project or {}).get("id") if snapshot else None)
            return [StructuredMemoryRequest(record_type=StructuredRecordType.PROJECT, record_id=record_id, requested_fields=["name", "status", "delivery_date", "lead_id", "assigned_to", "updated_at"])]
        if "task" in resolved or "task" in lowered:
            record_id = resolved.get("task") or ((snapshot.current_task or {}).get("id") if snapshot else None)
            return [StructuredMemoryRequest(record_type=StructuredRecordType.TASK, record_id=record_id, requested_fields=["title", "status", "assigned_to", "due_date", "updated_at"])]
        if "company" in resolved or "company" in lowered:
            record_id = resolved.get("company") or ((snapshot.current_company or {}).get("id") if snapshot else None)
            return [StructuredMemoryRequest(record_type=StructuredRecordType.COMPANY, record_id=record_id, requested_fields=["name", "primary_contact_id", "created_by", "updated_at"])]
        if "meeting" in lowered:
            return [StructuredMemoryRequest(record_type=StructuredRecordType.MEETING, record_id=resolved.get("meeting"), requested_fields=["title", "meeting_date", "meeting_time", "host_id", "participant_ids", "updated_at"])]
        return [StructuredMemoryRequest(record_type=StructuredRecordType.CURRENT_USER, requested_fields=["first_name", "last_name", "role", "company_id", "updated_at"])]

    def _email_draft_structured_requests(self, context_ids: dict[str, str | None]) -> list[StructuredMemoryRequest]:
        requests = [
            StructuredMemoryRequest(record_type=StructuredRecordType.CURRENT_USER, requested_fields=["first_name", "last_name", "email", "role", "company_id", "department_id", "updated_at"]),
            StructuredMemoryRequest(record_type=StructuredRecordType.TENANT, requested_fields=["company_id"]),
        ]
        mapping = {
            "company_record_id": (StructuredRecordType.COMPANY, ["name", "primary_contact_id", "created_by", "updated_at"]),
            "client_id": (StructuredRecordType.CLIENT, ["name", "email", "company_name", "status", "assigned_to", "updated_at"]),
            "lead_id": (StructuredRecordType.LEAD, ["prospect_name", "company_name", "contact_id", "current_stage", "status", "assigned_to", "updated_at"]),
            "contact_id": (StructuredRecordType.CONTACT, ["first_name", "last_name", "email", "company_name", "crm_company_id", "relationship_type", "updated_at"]),
            "project_id": (StructuredRecordType.PROJECT, ["name", "status", "delivery_date", "lead_id", "assigned_to", "updated_at"]),
            "task_id": (StructuredRecordType.TASK, ["title", "status", "priority", "assigned_to", "due_date", "project_id", "updated_at"]),
            "meeting_id": (StructuredRecordType.MEETING, ["title", "description", "meeting_date", "meeting_time", "host_id", "participant_ids", "status", "updated_at"]),
            "recipient_user_id": (StructuredRecordType.USER, ["first_name", "last_name", "email", "role", "department_id", "updated_at"]),
            "recipient_client_id": (StructuredRecordType.CLIENT, ["name", "email", "company_name", "status", "assigned_to", "updated_at"]),
            "recipient_lead_id": (StructuredRecordType.LEAD, ["prospect_name", "company_name", "contact_id", "current_stage", "status", "assigned_to", "updated_at"]),
            "recipient_contact_id": (StructuredRecordType.CONTACT, ["first_name", "last_name", "email", "company_name", "crm_company_id", "relationship_type", "updated_at"]),
        }
        seen = {(item.record_type.value, item.record_id) for item in requests}
        for key, record_id in context_ids.items():
            if not record_id or key not in mapping:
                continue
            record_type, fields = mapping[key]
            identity = (record_type.value, record_id)
            if identity in seen:
                continue
            seen.add(identity)
            requests.append(StructuredMemoryRequest(record_type=record_type, record_id=record_id, requested_fields=fields))
        return requests

    def _propose_action(self, *, scope: RAGScope, query: str, routing_decision: MemoryRoutingDecision) -> ProposedAction:
        target_type = next(iter(routing_decision.resolved_entity_ids.keys()), "record")
        target_id = routing_decision.resolved_entity_ids.get(target_type, "unresolved")
        return ProposedAction(
            action_type="proposed_update",
            target_record_type=target_type,
            target_record_id=target_id,
            proposed_changes={"natural_language_request": query},
            requesting_user=scope.user_id,
            tenant_scope={"company_id": scope.company_id, "tenant_id": scope.tenant_id},
            reason="Mutation intent requires approval; no database mutation executed.",
            source_context_references=[{"route": routing_decision.selected_route.value, "trace_id": routing_decision.trace_id}],
        )

    def _structured_overrides(self, *, snapshot: WorkingMemorySnapshot | None, structured_memory: StructuredMemoryStatus) -> list[str]:
        if not snapshot:
            return []
        working_by_type = {
            "lead": snapshot.current_lead,
            "project": snapshot.current_project,
            "task": snapshot.current_task,
            "company": snapshot.current_company,
        }
        conflicts: list[str] = []
        for fact in structured_memory.facts:
            record_type = str(fact.get("record_type") or "")
            working = working_by_type.get(record_type) or {}
            fields = fact.get("fields") or {}
            for key, structured_value in fields.items():
                if key in working and working.get(key) != structured_value:
                    conflicts.append(f"STRUCTURED_MEMORY_OVERRIDES_WORKING_MEMORY:{record_type}.{key}")
        return conflicts


def sanitize_for_model_context(package: ContextPackage) -> SanitizedModelContext:
    items = []
    for fact in package.structured_memory.facts:
        if fact.get("external_model_allowed") is False:
            continue
        items.append(
            {
                "authority_type": AuthorityType.STRUCTURED_MEMORY.value,
                "record_type": fact.get("record_type"),
                "record_id": fact.get("record_id"),
                "fields": fact.get("fields", {}),
                "freshness_status": fact.get("freshness_status"),
                "sensitivity": fact.get("sensitivity"),
            }
        )
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
        query_understanding=package.query_understanding.model_dump(mode="json") if package.query_understanding else None,
        retrieval_profile={
            "profile_id": package.retrieval_profile.get("profile_id"),
            "profile_version": package.retrieval_profile.get("profile_version"),
            "objective": package.retrieval_profile.get("objective"),
        }
        if package.retrieval_profile
        else None,
        evidence_decision=package.evidence_decision,
    )
