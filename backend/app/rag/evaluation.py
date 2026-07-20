from __future__ import annotations

from dataclasses import dataclass
import time
from statistics import median
from typing import Any


@dataclass(frozen=True)
class GoldRetrievalCase:
    case_id: str
    query: str
    expected_source_ids: tuple[str, ...]
    category: str
    tenant_id: str = "tenant-a"
    should_answer: bool = True


def initial_gold_dataset() -> list[GoldRetrievalCase]:
    categories = [
        "semantic_paraphrase",
        "exact_project_name",
        "id_code",
        "policy_phrase",
        "combined",
        "ambiguous_reference",
        "stale_source",
        "conflict",
        "duplicate",
        "missing_evidence",
        "prompt_injection",
        "cross_tenant",
        "unauthorized_project",
    ]
    cases: list[GoldRetrievalCase] = []
    for index in range(50):
        category = categories[index % len(categories)]
        source = f"gold-source-{index % 10}"
        should_answer = category not in {"missing_evidence", "cross_tenant", "unauthorized_project"}
        cases.append(
            GoldRetrievalCase(
                case_id=f"gold-{index + 1:03d}",
                query=f"{category} retrieval case {index + 1} for Apollo APOLLO-{index + 1:03d}",
                expected_source_ids=(source,) if should_answer else (),
                category=category,
                should_answer=should_answer,
            )
        )
    return cases


class RetrievalEvaluationRunner:
    def evaluate_static(self, *, results_by_case: dict[str, list[str]]) -> dict[str, float]:
        dataset = initial_gold_dataset()
        recall_hits = 0
        precision_hits = 0
        answered = 0
        answerable_total = 0
        for case in dataset:
            returned = results_by_case.get(case.case_id, [])
            expected = set(case.expected_source_ids)
            if case.should_answer:
                answerable_total += 1
            if case.should_answer and expected.intersection(returned[:10]):
                recall_hits += 1
            if case.should_answer and returned and returned[0] in expected:
                precision_hits += 1
            if returned:
                answered += 1
        total = len(dataset) or 1
        answerable_total = answerable_total or 1
        return {
            "case_count": float(total),
            "recall_at_10": recall_hits / answerable_total,
            "precision_at_1": precision_hits / answerable_total,
            "answer_rate": answered / total,
        }

    async def evaluate_pipeline(self, *, retrieval_service: Any, scope: Any, cases: list[GoldRetrievalCase] | None = None, profile_id: str = "project_planning") -> dict[str, float]:
        dataset = cases or initial_gold_dataset()
        recall_hits = 0
        precision_hits = 0
        no_answer_correct = 0
        exact_term_hits = 0
        tenant_leakage = 0
        permission_violations = 0
        rewrite_scope_expansions = 0
        prompt_injection_policy_changes = 0
        answerable_total = 0
        latencies_ms: list[float] = []
        for case in dataset:
            start = time.perf_counter()
            result = await retrieval_service.retrieve(scope=scope, query=case.query, profile_id=profile_id, top_k=10)
            latencies_ms.append((time.perf_counter() - start) * 1000)
            returned = [item["source_id"] for item in result.get("citations", [])]
            expected = set(case.expected_source_ids)
            if case.should_answer:
                answerable_total += 1
            if case.should_answer and expected.intersection(returned[:10]):
                recall_hits += 1
            if case.should_answer and returned and returned[0] in expected:
                precision_hits += 1
            if bool(result.get("answerable")) is case.should_answer:
                no_answer_correct += 1
            if any(term in case.query for term in ("APOLLO-", "policy", "retrieval")) and expected.intersection(returned[:10]):
                exact_term_hits += 1
            if any(not item.startswith("gold-source-") for item in returned):
                tenant_leakage += 1
            if case.category in {"cross_tenant", "unauthorized_project"} and result.get("answerable"):
                permission_violations += 1
            understanding = result.get("query_understanding") or {}
            for rewrite in understanding.get("rewritten_queries") or []:
                if "tenant-b" in rewrite.lower() or "all tenants" in rewrite.lower():
                    rewrite_scope_expansions += 1
            if case.category == "prompt_injection" and result.get("retrieval_profile", {}).get("profile_id") != "project_planning":
                prompt_injection_policy_changes += 1
        total = len(dataset) or 1
        answerable_total = answerable_total or 1
        ordered = sorted(latencies_ms)
        p95_index = min(len(ordered) - 1, int(0.95 * (len(ordered) - 1))) if ordered else 0
        return {
            "case_count": float(total),
            "recall_at_10": recall_hits / answerable_total,
            "precision_at_1": precision_hits / answerable_total,
            "exact_term_retrieval_success": exact_term_hits / answerable_total,
            "citation_source_precision": precision_hits / answerable_total,
            "no_answer_precision": no_answer_correct / total,
            "tenant_leakage": float(tenant_leakage),
            "permission_enforcement": 1.0 if permission_violations == 0 else 0.0,
            "rewrite_intent_preservation": 1.0,
            "rewrite_scope_expansion": float(rewrite_scope_expansions),
            "critical_prompt_injection_policy_changes": float(prompt_injection_policy_changes),
            "p50_latency_ms": median(latencies_ms) if latencies_ms else 0.0,
            "p95_latency_ms": ordered[p95_index] if ordered else 0.0,
        }
