from __future__ import annotations

import hashlib
from datetime import datetime

from app.core.clock import utc_now
from uuid import uuid4

from app.core.config import settings
from app.rag.embeddings import OpenAIEmbeddingProvider
from app.rag.evidence import EvidenceDecision, EvidenceDecisionService
from app.rag.models import RAGCitation, RAGKnowledgeSource, RAGRetrievalRun
from app.rag.permissions import RAGScope, source_visible_to_scope
from app.rag.qdrant_store import RAGQdrantStore
from app.rag.query_understanding import QueryUnderstandingResult, QueryUnderstandingService
from app.rag.retrieval import sanitize_excerpt
from app.rag.retrieval_profiles import RetrievalProfile, RetrievalProfileRegistry


class HybridRAGRetrievalService:
    def __init__(
        self,
        *,
        embedding_provider=None,
        qdrant_store=None,
        query_understanding_service: QueryUnderstandingService | None = None,
        profile_registry: RetrievalProfileRegistry | None = None,
        evidence_decision_service: EvidenceDecisionService | None = None,
    ) -> None:
        self.embedding_provider = embedding_provider or OpenAIEmbeddingProvider()
        self.qdrant_store = qdrant_store or RAGQdrantStore(collection_name=settings.RAG_HYBRID_COLLECTION)
        self.query_understanding_service = query_understanding_service or QueryUnderstandingService()
        self.profile_registry = profile_registry or RetrievalProfileRegistry()
        self.evidence_decision_service = evidence_decision_service or EvidenceDecisionService()

    async def retrieve(
        self,
        *,
        scope: RAGScope,
        query: str,
        profile_id: str = "project_planning",
        top_k: int | None = None,
        working_memory: dict | None = None,
    ) -> dict:
        if not scope.company_id or not scope.tenant_id:
            raise ValueError("Tenant scope is required before hybrid retrieval")
        profile = self.profile_registry.get(profile_id)
        self._validate_profile_scope(profile=profile, scope=scope)
        understanding = self.query_understanding_service.understand(query=query, working_memory=working_memory or {})
        run_id = str(uuid4())
        vector = await self.embedding_provider.embed(understanding.rewritten_queries[0] if understanding.rewritten_queries else understanding.normalized_query)
        filters = scope.visibility_filter()
        filters.update({"status": "active"})
        if profile.allowed_source_types:
            filters["source_type"] = profile.allowed_source_types
        results = await self.qdrant_store.hybrid_search(
            dense_vector=vector,
            sparse_query_text=understanding.normalized_query,
            filters=filters,
            limit=top_k or settings.RAG_RETRIEVAL_TOP_K,
            score_threshold=None,
        )
        citations = await self._citations(run_id=run_id, scope=scope, results=results, profile=profile)
        evidence_decision = self.evidence_decision_service.decide(
            citations=citations,
            min_score=max(profile.minimum_evidence_threshold, settings.RAG_MIN_EVIDENCE_SCORE),
        )
        await RAGRetrievalRun(
            run_id=run_id,
            company_id=scope.company_id,
            tenant_id=scope.tenant_id,
            user_id=scope.user_id,
            query_hash=hashlib.sha256(query.encode("utf-8")).hexdigest(),
            status="success",
            top_k=top_k or settings.RAG_RETRIEVAL_TOP_K,
            result_count=len(citations),
            no_answer=evidence_decision.decision.value not in {"SUFFICIENT_EVIDENCE", "PARTIAL_EVIDENCE"},
            filters=filters,
            citation_ids=[item["citation_id"] for item in citations],
            created_at=utc_now(),
        ).insert()
        return {
            "run_id": run_id,
            "answerable": evidence_decision.decision.value in {"SUFFICIENT_EVIDENCE", "PARTIAL_EVIDENCE"},
            "no_answer_reason": None if citations else evidence_decision.reason,
            "citations": citations,
            "query_understanding": understanding.model_dump(mode="json"),
            "retrieval_profile": profile.model_dump(mode="json"),
            "fusion_policy_version": profile.fusion_policy_version,
            "reranking_policy_version": profile.reranking_policy_version,
            "sparse_encoder_version": settings.RAG_SPARSE_ENCODER_VERSION,
            "evidence_decision": evidence_decision.model_dump(mode="json"),
        }

    async def _citations(self, *, run_id: str, scope: RAGScope, results: list, profile: RetrievalProfile) -> list[dict]:
        citations = []
        seen_chunks: set[str] = set()
        allowed_source_types = set(profile.allowed_source_types)
        forbidden_source_types = set(profile.forbidden_source_types)
        for item in results:
            payload = dict(getattr(item, "payload", None) or {})
            chunk_id = str(payload.get("chunk_id") or "")
            if chunk_id in seen_chunks:
                continue
            seen_chunks.add(chunk_id)
            payload_source_type = str(payload.get("source_type") or "")
            if payload_source_type and payload_source_type in forbidden_source_types:
                continue
            if payload_source_type and allowed_source_types and payload_source_type not in allowed_source_types:
                continue
            source = await RAGKnowledgeSource.find_one(
                RAGKnowledgeSource.company_id == scope.company_id,
                RAGKnowledgeSource.source_id == payload.get("source_id"),
            )
            if not source or not source_visible_to_scope(source, scope):
                continue
            source_type = source.source_type.value if hasattr(source.source_type, "value") else str(source.source_type)
            if source_type in forbidden_source_types:
                continue
            if allowed_source_types and source_type not in allowed_source_types:
                continue
            citation = RAGCitation(
                citation_id=str(uuid4()),
                run_id=run_id,
                company_id=scope.company_id,
                tenant_id=scope.tenant_id,
                source_id=source.source_id,
                version_id=payload.get("version_id"),
                chunk_id=payload.get("chunk_id"),
                location=payload.get("location") or {},
                excerpt=sanitize_excerpt(payload.get("excerpt") or payload.get("text") or ""),
                score=float(getattr(item, "score", 0.0) or 0.0),
            )
            await citation.insert()
            citations.append(
                {
                    "citation_id": citation.citation_id,
                    "source_id": citation.source_id,
                    "version_id": citation.version_id,
                    "chunk_id": citation.chunk_id,
                    "title": source.title,
                    "location": citation.location,
                    "excerpt": citation.excerpt,
                    "score": citation.score,
                }
            )
        return citations

    def _validate_profile_scope(self, *, profile: RetrievalProfile, scope: RAGScope) -> None:
        required = set(profile.scope_requirements)
        missing = []
        if "tenant_id" in required and not scope.tenant_id:
            missing.append("tenant_id")
        if "project_id" in required and not scope.project_id:
            missing.append("project_id")
        if "client_id" in required and not scope.client_id:
            missing.append("client_id")
        if "department_id" in required and not scope.department_id:
            missing.append("department_id")
        if missing:
            raise ValueError(f"Retrieval profile scope missing: {', '.join(missing)}")
