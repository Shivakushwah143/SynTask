"""
AI Evaluation — run executor.

The runner sits AROUND the existing runtime and never creates alternative
behavior:

    Dataset -> EVAL RUNNER -> EXISTING AI SYSTEM (router -> agent -> Groq ->
    tools) -> deterministic graders

Cases run sequentially (avoiding Groq rate-limit bursts). Repeated provider
failures fail fast and mark the run BLOCKED_PROVIDER instead of burning tokens
on the remaining dataset.
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Optional
from uuid import uuid4

from app.agents.capability_packs import EXECUTIVE_AGENT_ID, HR_AGENT_ID, role_capability_pack
from app.agents.evaluation.graders import GraderEvidence, grade_case
from app.agents.evaluation.schemas import (
    GRADER_CATEGORIES,
    EvalCase,
    EvalDataset,
    serializable_case,
)
from app.agents.executive.service import ExecutiveAgentService
from app.agents.hr.service import HRAgentService
from app.core.clock import utc_now
from app.models.ai_evaluation import (
    AIEvalCaseResult,
    AIEvalCaseStatus,
    AIEvalRegressionStatus,
    AIEvalRun,
    AIEvalRunStatus,
)
from app.models.user import User

logger = logging.getLogger(__name__)

# Fail-fast threshold: after this many consecutive provider-blocked cases the
# run stops early rather than burning tokens on the remaining dataset.
PROVIDER_FAIL_FAST_STREAK = 2

_AGENT_SERVICES = {
    EXECUTIVE_AGENT_ID: ExecutiveAgentService,
    HR_AGENT_ID: HRAgentService,
}

# Error categories that indicate provider/config unavailability (BLOCKED), as
# opposed to genuine agent/tool failure (FAIL).
_PROVIDER_BLOCK_PREFIXES = (
    "PROVIDER_ERROR",
    "GROQ_400",
    "GROQ_API_KEY_MISSING",
    "EXECUTIVE_AGENT_DISABLED",
    "HR_AGENT_DISABLED",
    "AGENT_DISABLED",
)
_PROVIDER_BLOCK_MARKERS = ("rate limit", "429", "timeout", "connection", "unavailable", "insufficient_quota")


def _is_provider_block(error: Optional[str]) -> bool:
    text = (error or "").lower()
    if not text:
        return False
    if any(text.startswith(prefix.lower()) or prefix.lower() in text[:40] for prefix in _PROVIDER_BLOCK_PREFIXES):
        return True
    return any(marker in text for marker in _PROVIDER_BLOCK_MARKERS)


# ---------------------------------------------------------------------------
# Run orchestration
# ---------------------------------------------------------------------------


async def execute_run(run_id: str) -> dict[str, Any]:
    """Execute a QUEUED/RUNNING evaluation run end-to-end."""
    run = await AIEvalRun.find_one(AIEvalRun.run_id == run_id)
    if not run:
        return {"status": "missing"}
    if run.status in {AIEvalRunStatus.COMPLETED, AIEvalRunStatus.BLOCKED, AIEvalRunStatus.FAILED}:
        return {"status": run.status.value, "run_id": run_id}

    run.status = AIEvalRunStatus.RUNNING
    run.started_at = utc_now()
    run.updated_at = utc_now()
    await run.save()

    try:
        return await _execute_run_body(run)
    except Exception as exc:
        logger.exception("AI eval run %s crashed", run_id)
        run.status = AIEvalRunStatus.FAILED
        run.completed_at = utc_now()
        run.updated_at = utc_now()
        await run.save()
        return {"status": "FAILED", "run_id": run_id, "error": f"{type(exc).__name__}: {exc}"}


async def _execute_run_body(run: AIEvalRun) -> dict[str, Any]:
    from app.core.config import settings

    run_id = run.run_id

    # ── Preconditions ────────────────────────────────────────────────────────
    if not settings.GROQ_API_KEY:
        return await _block_run(run, reason="BLOCKED_PROVIDER", message="GROQ_API_KEY is not configured")

    actor_user = await _resolve_actor_user()
    if not actor_user:
        return await _block_run(
            run,
            reason="BLOCKED_DATASET_PRECONDITION",
            message="full_demo_v1 demo tenant was not found — run scripts/seed_full_demo.py first.",
        )
    run.actor_user_id = str(actor_user.id)
    run.tenant_id = str(actor_user.company_id)

    dataset = _load_dataset(run)
    if not dataset:
        run.status = AIEvalRunStatus.FAILED
        run.updated_at = utc_now()
        await run.save()
        return {"status": "FAILED", "run_id": run_id, "error": f"Unknown dataset {run.dataset_id}"}

    run.provider = "groq"
    run.model = settings.HR_AGENT_MODEL or settings.EXECUTIVE_AGENT_MODEL or settings.AI_MODEL_GROQ
    run.agent_versions = {dataset.agent_id: dataset.agent_version}
    run.total_cases = len(dataset.cases)
    run.critical_cases = sum(1 for case in dataset.cases if case.critical)
    await run.save()

    provider_streak = 0
    for case in dataset.cases:
        result = await _execute_case(run=run, dataset=dataset, case=case, actor_user=actor_user)
        await result.insert()

        # Case counts
        if result.status == AIEvalCaseStatus.BLOCKED:
            run.blocked_cases += 1
            if result.blocked_reason == "BLOCKED_PROVIDER":
                provider_streak += 1
            else:
                provider_streak = 0
            if case.critical:
                run.critical_blocked += 1
        elif result.status == AIEvalCaseStatus.PASS:
            run.passed_cases += 1
            provider_streak = 0
            if case.critical:
                run.critical_passed += 1
        else:
            run.failed_cases += 1
            provider_streak = 0
            if case.critical:
                run.critical_failed += 1
                run.critical_failures.append(case.id)

        run.updated_at = utc_now()
        await run.save()

        if provider_streak >= PROVIDER_FAIL_FAST_STREAK:
            logger.warning("AI eval run %s stopping early after %s consecutive provider failures", run_id, provider_streak)
            run.blocked_reason = "BLOCKED_PROVIDER"
            run.status = AIEvalRunStatus.BLOCKED
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            await run.save()
            return {"status": "BLOCKED", "run_id": run_id, "reason": "BLOCKED_PROVIDER"}

    # ── Category scores + regression verdict ────────────────────────────────
    run.category_scores = await _compute_category_scores(run_id=run_id)
    run.regression_status = await _apply_baseline_comparison(run=run)

    run.status = AIEvalRunStatus.COMPLETED
    run.completed_at = utc_now()
    run.updated_at = utc_now()
    await run.save()
    return {
        "status": "COMPLETED",
        "run_id": run_id,
        "passed": run.passed_cases,
        "failed": run.failed_cases,
        "blocked": run.blocked_cases,
        "regression_status": run.regression_status,
    }


async def _block_run(run: AIEvalRun, *, reason: str, message: str) -> dict[str, Any]:
    run.status = AIEvalRunStatus.BLOCKED
    run.blocked_reason = reason
    run.completed_at = utc_now()
    run.updated_at = utc_now()
    await run.save()
    logger.warning("AI eval run %s blocked: %s — %s", run.run_id, reason, message)
    return {"status": "BLOCKED", "run_id": run.run_id, "reason": reason, "message": message}


def _load_dataset(run: AIEvalRun) -> Optional[EvalDataset]:
    from app.agents.evaluation.datasets import load_dataset

    dataset = load_dataset(run.dataset_id)
    if not dataset:
        return None
    if dataset.dataset_version != run.dataset_version:
        logger.error(
            "Dataset version mismatch for run %s: expected %s got %s",
            run.run_id, run.dataset_version, dataset.dataset_version,
        )
        return None
    return dataset


async def _resolve_actor_user() -> Optional[User]:
    """Server-side demo tenant actor.

    Evaluation only ever runs against the deterministic ``full_demo_v1`` tenant
    (never uncontrolled production data). The tenant is resolved from the
    seeded admin account — never from dataset/client-supplied values.
    """
    from app.core.config import settings

    email = (settings.AI_EVAL_DEMO_ADMIN_EMAIL or "admin1@demo.com").strip().lower()
    return await User.find_one({"email": email, "status": "active"})


# ---------------------------------------------------------------------------
# Per-case execution
# ---------------------------------------------------------------------------


async def _execute_case(
    *,
    run: AIEvalRun,
    dataset: EvalDataset,
    case: EvalCase,
    actor_user: User,
) -> AIEvalCaseResult:
    """Run one case through the REAL router -> agent -> Groq -> tools path."""
    from app.agents.routing import DeterministicAgentRouter

    # Routing is always graded; cases without an explicit expected agent inherit
    # the dataset's primary agent as their routing target.
    if case.expected.expected_agent is None:
        case = case.model_copy(update={"expected": case.expected.model_copy(update={"expected_agent": dataset.agent_id})})

    capability_pack = role_capability_pack(
        case.actor_role or dataset.actor_role or "admin",
        modules=list(getattr(actor_user, "modules", []) or []),
    )
    router = DeterministicAgentRouter()
    route = await router.route_with_llm_intent(
        message=case.query,
        workspace={},
        capability_pack=capability_pack,
        conversation_history=None,
    )

    actual_agent = route.agent_id
    actual_intent = route.intent

    expected_agents = case.expected.expected_agent
    accepted = {expected_agents} if isinstance(expected_agents, str) else set(expected_agents)

    execution: dict[str, Any] = {}
    if actual_agent in accepted:
        execution = await _run_agent_service(actor_user=actor_user, case=case, agent_id=actual_agent)

    trace = execution.get("trace") or {}
    answer = execution.get("answer") or ""
    actual_success = execution.get("success")
    actual_error = execution.get("error")

    evidence = GraderEvidence(
        case=case,
        actual_agent=actual_agent,
        actual_intent=actual_intent,
        actual_path=trace.get("path"),
        actual_success=actual_success,
        actual_error=actual_error,
        answer=answer,
        tool_executions=list(trace.get("tool_calls") or []),
        latency_ms=float(trace.get("latency_ms") or 0.0),
        groq_calls=int(trace.get("groq_calls") or 0),
        steps=int(trace.get("steps") or 0),
    )
    if not execution.get("ran"):
        evidence.tool_executions = []
        evidence.answer = ""
        evidence.groq_calls = 0
        evidence.steps = 0

    # ── Provider/config block handling ─────────────────────────────────────
    blocked_reason = None
    if execution.get("ran") and not execution.get("success"):
        if _is_provider_block(actual_error):
            blocked_reason = "BLOCKED_PROVIDER"

    # ── Deterministic grading ──────────────────────────────────────────────
    outcomes = grade_case(evidence)
    failure_reasons: list[str] = []
    for outcome in outcomes.values():
        failure_reasons.extend(outcome.failures)

    # A genuinely failed agent run (not a provider block) is a FAIL even when
    # the dataset only declared routing/tool expectations.
    if execution.get("ran") and not execution.get("success") and not blocked_reason and not evidence.actual_success:
        failure_reasons.append(f"agent run failed: {actual_error or 'unknown agent error'}")

    # Tool-level error => FAIL with tool/error recorded (except expected no-data
    # cases where empty/not-found results are the expected behavior).
    tool_error = any(isinstance((item.get("result") or {}), dict) and "error" in (item.get("result") or {}) for item in evidence.tool_executions)
    if tool_error and not case.expected.no_data_expected:
        failed_tools = [item.get("tool") for item in evidence.tool_executions if "error" in (item.get("result") or {})]
        failure_reasons.append(f"tool error recorded on: {', '.join(sorted(set(failed_tools)))}")

    if blocked_reason:
        status = AIEvalCaseStatus.BLOCKED
    elif failure_reasons:
        status = AIEvalCaseStatus.FAIL
    else:
        status = AIEvalCaseStatus.PASS

    result = AIEvalCaseResult(
        run_id=run.run_id,
        tenant_id=run.tenant_id,
        case_id=case.id,
        dataset_id=run.dataset_id,
        case_category=case.category,
        status=status,
        blocked_reason=blocked_reason,
        actual_agent=actual_agent,
        actual_path=evidence.actual_path or actual_intent,
        actual_success=actual_success,
        actual_error=(actual_error or "")[:500] or None,
        tools=_summarize_tools(evidence.tool_executions),
        tool_error=tool_error,
        groq_calls=evidence.groq_calls,
        steps=evidence.steps,
        tokens=int(trace.get("total_tokens") or 0),
        latency_ms=round(evidence.latency_ms, 1),
        grader_results={
            category: {
                "passed": outcome.passed,
                "checks": outcome.checks[:50],
                "failures": outcome.failures[:20],
            }
            for category, outcome in outcomes.items()
        },
        failure_reasons=failure_reasons[:40],
        expected=serializable_case(case),
        sanitized_answer_excerpt=answer[:800],
    )
    return result


async def _run_agent_service(*, actor_user: User, case: EvalCase, agent_id: str) -> dict[str, Any]:
    """Run the case query through the real agent service in evaluation_mode."""
    service_cls = _AGENT_SERVICES.get(agent_id)
    if service_cls is None:
        return {"ran": False}
    service = service_cls()
    try:
        response = await service.chat(
            current_user=actor_user,
            message=case.query,
            conversation_id=None,
            session_id=None,
            entity_context={},
            conversation_history=None,
            evaluation_mode=True,
        )
    except Exception as exc:
        logger.exception("AI eval case '%s' crashed inside %s agent", case.id, agent_id)
        return {
            "ran": True,
            "success": False,
            "error": f"PROVIDER_ERROR: {type(exc).__name__}: {exc}",
            "answer": "",
            "trace": {},
        }
    trace = response.pop("_eval_trace", {}) or {}
    return {
        "ran": True,
        "success": bool(response.get("success")),
        "answer": response.get("answer") or "",
        "error": response.get("error_detail") or trace.get("error") or ("" if response.get("success") else "AGENT_FAILED"),
        "trace": trace,
    }


def _summarize_tools(tool_calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    has_error: set[str] = set()
    for item in tool_calls:
        tool = item.get("tool") or "unknown"
        counts[tool] += 1
        result = item.get("result")
        if isinstance(result, dict) and "error" in result:
            has_error.add(tool)
    return [
        {"tool": tool, "calls": count, "has_error": tool in has_error}
        for tool, count in sorted(counts.items())
    ]


# ---------------------------------------------------------------------------
# Scoring + baseline regression
# ---------------------------------------------------------------------------


async def _compute_category_scores(*, run_id: str) -> dict[str, dict[str, Any]]:
    results = await AIEvalCaseResult.find(AIEvalCaseResult.run_id == run_id).to_list()
    totals: Counter[str] = Counter()
    passed: Counter[str] = Counter()
    for result in results:
        if result.status == AIEvalCaseStatus.BLOCKED:
            continue
        for category, outcome in (result.grader_results or {}).items():
            if not isinstance(outcome, dict) or "passed" not in outcome:
                continue
            totals[category] += 1
            if outcome.get("passed"):
                passed[category] += 1

    scores: dict[str, dict[str, Any]] = {}
    for category in GRADER_CATEGORIES:
        total = totals[category]
        pass_count = passed[category]
        scores[category] = {
            "passed": pass_count,
            "total": total,
            "percent": round((pass_count / total) * 100, 1) if total else None,
        }
    return scores


async def _apply_baseline_comparison(run: AIEvalRun) -> str:
    """Compare the completed run case-by-case against its baseline run.

    - critical case FAIL          -> FAIL (never hidden by averages)
    - baseline PASS -> candidate FAIL  -> REGRESSION
    - all critical pass + no regressions -> PASS
    """
    if not run.baseline_run_id:
        return AIEvalRegressionStatus.FAIL.value if run.critical_failures else AIEvalRegressionStatus.PASS.value

    baseline_cases = await AIEvalCaseResult.find(
        AIEvalCaseResult.run_id == run.baseline_run_id
    ).to_list()
    baseline_status = {result.case_id: result.status for result in baseline_cases}

    candidate_cases = await AIEvalCaseResult.find(AIEvalCaseResult.run_id == run.run_id).to_list()

    regressions: list[str] = []
    improvements: list[str] = []
    for result in candidate_cases:
        if result.status != AIEvalCaseStatus.FAIL:
            continue
        baseline = baseline_status.get(result.case_id)
        if baseline == AIEvalCaseStatus.PASS:
            regressions.append(result.case_id)
    for result in candidate_cases:
        if result.status != AIEvalCaseStatus.PASS:
            continue
        baseline = baseline_status.get(result.case_id)
        if baseline == AIEvalCaseStatus.FAIL:
            improvements.append(result.case_id)

    run.regressions = regressions
    run.improvements = improvements

    if run.critical_failures:
        verdict = AIEvalRegressionStatus.FAIL.value
    elif regressions:
        verdict = AIEvalRegressionStatus.REGRESSION.value
    else:
        verdict = AIEvalRegressionStatus.PASS.value
    run.updated_at = utc_now()
    await run.save()
    return verdict


async def mark_run_as_baseline(run: AIEvalRun) -> AIEvalRun:
    """Allow any COMPLETED run to become the BASELINE for its dataset version."""
    run.is_baseline = True
    run.baseline_set_at = utc_now()
    run.updated_at = utc_now()
    await run.save()
    return run


def new_run_record(*, tenant_id: str, requested_by: User, dataset: EvalDataset, baseline_run_id: Optional[str] = None) -> AIEvalRun:
    """Build a QUEUED run record for a dataset."""
    return AIEvalRun(
        run_id=str(uuid4()),
        tenant_id=tenant_id,
        dataset_id=dataset.dataset_id,
        dataset_version=dataset.dataset_version,
        agent_id=dataset.agent_id,
        agent_version=dataset.agent_version,
        requested_by=str(requested_by.id),
        requested_by_name=getattr(requested_by, "full_name", lambda: None)() or requested_by.email,
        status=AIEvalRunStatus.QUEUED,
        baseline_run_id=baseline_run_id,
        total_cases=len(dataset.cases),
        critical_cases=sum(1 for case in dataset.cases if case.critical),
        category_scores={},
    )
