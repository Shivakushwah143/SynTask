from __future__ import annotations

import pytest

from app.rag.evaluation import GoldRetrievalCase, RetrievalEvaluationRunner, initial_gold_dataset
from app.rag.evidence import EvidenceDecisionService, EvidenceDecisionType
from app.rag.memory_router import MemoryRoute
from app.rag.query_understanding import QueryUnderstandingService
from app.rag.retrieval_profiles import RetrievalProfile, RetrievalProfileRegistry
from app.rag.sparse import SparseHashEncoder


def test_query_understanding_preserves_original_and_limits_rewrites(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.RAG_QUERY_MAX_REWRITES", 2)
    result = QueryUnderstandingService().understand(
        query="Why is Project Apollo late and what does our delivery policy require?",
        working_memory={"current_project": {"id": "APOLLO-1", "name": "Apollo"}},
    )

    assert result.original_query == "Why is Project Apollo late and what does our delivery policy require?"
    assert result.route == MemoryRoute.COMBINED
    assert result.resolved_entity_ids["project"] == "APOLLO-1"
    assert len(result.rewritten_queries) <= 2
    assert len(result.decomposed_subqueries) >= 2


def test_query_understanding_does_not_rewrite_exact_id_unnecessarily():
    result = QueryUnderstandingService().understand(query="Find APOLLO-123 delivery policy")

    assert result.rewritten_queries[0] == "Find APOLLO-123 delivery policy"


def test_retrieval_profile_project_scope_required_and_profiles_narrow_permissions():
    profile = RetrievalProfileRegistry().get("project_planning")

    assert "project_id" in profile.scope_requirements
    assert "protected_hr" in profile.forbidden_source_types
    with pytest.raises(ValueError):
        RetrievalProfile(
            profile_id="project_planning",
            objective="bad",
            allowed_source_types=["all"],
            allowed_structured_domains=["project"],
            scope_requirements=["tenant_id"],
        )


def test_sparse_encoder_is_deterministic_and_exact_terms_survive():
    encoder = SparseHashEncoder()

    first = encoder.encode("Apollo APOLLO-123 Apollo")
    second = encoder.encode("Apollo APOLLO-123 Apollo")

    assert first == second
    assert len(first["indices"]) == 2
    assert len(first["values"]) == 2


def test_evidence_decision_grounded_no_answer_and_conflict():
    service = EvidenceDecisionService()

    assert service.decide(citations=[]).decision == EvidenceDecisionType.NO_EVIDENCE
    assert service.decide(citations=[{"score": 0.9}], conflicts=["x"]).decision == EvidenceDecisionType.CONFLICTING_EVIDENCE
    assert service.decide(citations=[{"score": 0.9}]).decision == EvidenceDecisionType.SUFFICIENT_EVIDENCE


def test_gold_dataset_has_required_size_and_security_cases():
    dataset = initial_gold_dataset()
    categories = {case.category for case in dataset}
    denied_cases = [case for case in dataset if case.category in {"cross_tenant", "unauthorized_project", "missing_evidence"}]

    assert len(dataset) >= 50
    assert {"prompt_injection", "cross_tenant", "unauthorized_project", "combined", "conflict"}.issubset(categories)
    assert all(not case.should_answer and case.expected_source_ids == () for case in denied_cases)
    metrics = RetrievalEvaluationRunner().evaluate_static(results_by_case={})
    assert metrics["case_count"] == float(len(dataset))


@pytest.mark.asyncio
async def test_evaluation_pipeline_measures_answerable_and_denied_cases_separately():
    class FakeRetrieval:
        async def retrieve(self, *, scope, query, profile_id, top_k):
            answerable = "deny" not in query
            return {
                "answerable": answerable,
                "citations": [{"source_id": "gold-source-1"}] if answerable else [],
                "retrieval_profile": {"profile_id": profile_id},
                "query_understanding": {"rewritten_queries": [query]},
            }

    cases = [
        GoldRetrievalCase(case_id="answer", query="APOLLO-001 policy", expected_source_ids=("gold-source-1",), category="semantic_paraphrase"),
        GoldRetrievalCase(case_id="deny", query="deny APOLLO-002", expected_source_ids=(), category="unauthorized_project", should_answer=False),
    ]

    metrics = await RetrievalEvaluationRunner().evaluate_pipeline(retrieval_service=FakeRetrieval(), scope=object(), cases=cases)

    assert metrics["recall_at_10"] == 1.0
    assert metrics["precision_at_1"] == 1.0
    assert metrics["no_answer_precision"] == 1.0
    assert metrics["permission_enforcement"] == 1.0
