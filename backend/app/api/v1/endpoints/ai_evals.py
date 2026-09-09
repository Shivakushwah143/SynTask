"""
AI Evaluations API — Evaluation & Regression.

Only Admin / Super Admin may execute or manage evaluations. Normal employees
and managers never access raw evaluation details. Evaluation runs always
execute against the deterministic ``full_demo_v1`` demo tenant (resolved
server-side from the seeded demo admin account) — never uncontrolled
production data.
"""
from __future__ import annotations

import asyncio
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.agents.evaluation.datasets import list_datasets, load_dataset
from app.agents.evaluation.runner import mark_run_as_baseline, new_run_record
from app.api.dependencies import get_current_user
from app.core.config import settings
from app.core.clock import utc_now
from app.models.ai_evaluation import (
    AIEvalCaseResult,
    AIEvalCaseStatus,
    AIEvalRun,
    AIEvalRunStatus,
    GRADER_CATEGORY_LABELS,
    latest_baseline_run,
)
from app.models.user import User, UserRole

router = APIRouter()

CATEGORY_ORDER = list(GRADER_CATEGORY_LABELS)


def _role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


async def require_eval_admin(current_user: User = Depends(get_current_user)) -> User:
    """Only Admin and Super Admin may manage evaluations."""
    if _role(current_user) not in {UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required for AI Evaluations")
    return current_user


async def _demo_tenant() -> Optional[tuple[User, str]]:
    """Resolve the server-side demo tenant actor (full_demo_v1 seeded admin)."""
    email = (settings.AI_EVAL_DEMO_ADMIN_EMAIL or "admin1@demo.com").strip().lower()
    actor = await User.find_one({"email": email})
    if not actor or not actor.company_id:
        return None
    return actor, str(actor.company_id)


async def _require_demo_scope(current_user: User) -> tuple[User, str]:
    """Ensure the requester may operate on the demo-tenant evaluations."""
    demo = await _demo_tenant()
    if not demo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "BLOCKED_DATASET_PRECONDITION",
                "message": "full_demo_v1 demo tenant was not found — run scripts/seed_full_demo.py first.",
            },
        )
    demo_actor, tenant_id = demo
    if _role(current_user) == UserRole.ADMIN.value and str(current_user.company_id or "") != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI Evaluations run only against the full_demo_v1 demo tenant. This company is not the demo tenant.",
        )
    return demo_actor, tenant_id


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _category_rows(category_scores: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for category in CATEGORY_ORDER:
        score = category_scores.get(category) or {}
        rows.append({
            "category": category,
            "label": GRADER_CATEGORY_LABELS[category],
            "passed": score.get("passed") or 0,
            "total": score.get("total") or 0,
            "percent": score.get("percent"),
        })
    return rows


def _run_view(run: AIEvalRun) -> dict[str, Any]:
    return {
        "run_id": run.run_id,
        "tenant_id": run.tenant_id,
        "dataset_id": run.dataset_id,
        "dataset_version": run.dataset_version,
        "agent_id": run.agent_id,
        "agent_version": run.agent_version,
        "status": run.status.value if hasattr(run.status, "value") else str(run.status),
        "blocked_reason": run.blocked_reason,
        "requested_by": run.requested_by,
        "requested_by_name": run.requested_by_name,
        "provider": run.provider,
        "model": run.model,
        "total_cases": run.total_cases,
        "passed_cases": run.passed_cases,
        "failed_cases": run.failed_cases,
        "blocked_cases": run.blocked_cases,
        "critical_cases": run.critical_cases,
        "critical_passed": run.critical_passed,
        "critical_failed": run.critical_failed,
        "critical_blocked": run.critical_blocked,
        "critical_failures": run.critical_failures,
        "category_rows": _category_rows(run.category_scores or {}),
        "category_scores": run.category_scores or {},
        "is_baseline": run.is_baseline,
        "baseline_run_id": run.baseline_run_id,
        "regression_status": run.regression_status,
        "regressions": run.regressions,
        "improvements": run.improvements,
        "started_at": run.started_at.isoformat() + "Z" if run.started_at else None,
        "completed_at": run.completed_at.isoformat() + "Z" if run.completed_at else None,
        "created_at": run.created_at.isoformat() + "Z",
    }


def _case_view(result: AIEvalCaseResult) -> dict[str, Any]:
    return {
        "case_id": result.case_id,
        "dataset_id": result.dataset_id,
        "category": result.case_category,
        "status": result.status.value if hasattr(result.status, "value") else str(result.status),
        "blocked_reason": result.blocked_reason,
        "actual_agent": result.actual_agent,
        "actual_path": result.actual_path,
        "actual_success": result.actual_success,
        "actual_error": result.actual_error,
        "tools": result.tools,
        "tool_error": result.tool_error,
        "groq_calls": result.groq_calls,
        "steps": result.steps,
        "tokens": result.tokens,
        "latency_ms": result.latency_ms,
        "grader_results": result.grader_results or {},
        "failure_reasons": result.failure_reasons or [],
        "query": (result.expected or {}).get("query", ""),
        "expected": result.expected or {},
        "answer_excerpt": result.sanitized_answer_excerpt or "",
        "critical": bool((result.expected or {}).get("critical", False)),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/datasets")
async def get_eval_datasets(current_user: User = Depends(require_eval_admin)):
    """List versioned eval datasets with their current baseline run."""
    datasets = list_datasets()
    demo = await _demo_tenant()
    baseline_by_dataset: dict[str, str] = {}
    if demo:
        _, tenant_id = demo
        for dataset in datasets:
            baseline = await latest_baseline_run(tenant_id=tenant_id, dataset_id=dataset["dataset_id"])
            if baseline:
                baseline_by_dataset[dataset["dataset_id"]] = baseline.run_id
    for dataset in datasets:
        dataset["baseline_run_id"] = baseline_by_dataset.get(dataset["dataset_id"])
    return {"datasets": datasets}


class CreateRunRequest(BaseModel):
    dataset_id: str = Field(..., min_length=1, max_length=120)


@router.post("/runs", status_code=status.HTTP_201_CREATED)
async def create_eval_run(payload: CreateRunRequest, current_user: User = Depends(require_eval_admin)):
    """Queue a new evaluation run for a versioned dataset."""
    demo_actor, tenant_id = await _require_demo_scope(current_user)

    dataset = load_dataset(payload.dataset_id)
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Dataset '{payload.dataset_id}' not found")

    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BLOCKED_PROVIDER", "message": "GROQ_API_KEY is not configured — evaluation cannot run."},
        )

    baseline = await latest_baseline_run(tenant_id=tenant_id, dataset_id=dataset.dataset_id)
    run = new_run_record(
        tenant_id=tenant_id,
        requested_by=current_user,
        dataset=dataset,
        baseline_run_id=baseline.run_id if baseline else None,
    )
    await run.insert()
    await _dispatch_run(run.run_id)
    return _run_view(run)


async def _dispatch_run(run_id: str) -> None:
    """Dispatch a run to Celery (or an in-process background task in eager/dev)."""
    if settings.CELERY_ALWAYS_EAGER or settings.DISABLE_CELERY:
        # Never block an HTTP request on a full dataset — run in background.
        async def _inline() -> None:
            from app.agents.evaluation.runner import execute_run

            await execute_run(run_id)

        asyncio.get_running_loop().create_task(_inline())
        return

    from app.worker.tasks.ai_eval_tasks import run_ai_eval_dataset

    run_ai_eval_dataset.delay(run_id=run_id)


@router.get("/runs")
async def list_eval_runs(
    dataset_id: Optional[str] = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_eval_admin),
):
    """List evaluation runs (evaluation data is admin-only)."""
    demo = await _demo_tenant()
    if not demo:
        return {"runs": [], "total": 0}
    _, tenant_id = demo
    query: dict[str, Any] = {"tenant_id": tenant_id}
    if dataset_id:
        query["dataset_id"] = dataset_id
    total = await AIEvalRun.find(query).count()
    runs = (
        await AIEvalRun.find(query)
        .sort([("created_at", -1)])
        .skip(offset)
        .limit(limit)
        .to_list()
    )
    return {"runs": [_run_view(run) for run in runs], "total": total, "limit": limit, "offset": offset}


@router.get("/runs/{run_id}")
async def get_eval_run(run_id: str, current_user: User = Depends(require_eval_admin)):
    """Run detail with per-category scores and graded case results."""
    demo = await _demo_tenant()
    if not demo:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Demo tenant not found")
    _, tenant_id = demo
    run = await AIEvalRun.find_one({"run_id": run_id, "tenant_id": tenant_id})
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation run not found")

    cases = (
        await AIEvalCaseResult.find({"run_id": run_id})
        .sort([("case_id", 1)])
        .to_list()
    )
    return {
        "run": _run_view(run),
        "cases": [_case_view(case) for case in cases],
        "failed_cases": [
            _case_view(case) for case in cases if case.status == AIEvalCaseStatus.FAIL
        ],
    }


@router.post("/runs/{run_id}/baseline")
async def set_eval_baseline(run_id: str, current_user: User = Depends(require_eval_admin)):
    """Mark a COMPLETED run as the BASELINE for its dataset version."""
    demo_actor, tenant_id = await _require_demo_scope(current_user)
    run = await AIEvalRun.find_one({"run_id": run_id, "tenant_id": tenant_id})
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation run not found")
    if run.status != AIEvalRunStatus.COMPLETED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only COMPLETED runs can become baselines")
    await mark_run_as_baseline(run)
    return _run_view(run)
