"""
AI Evaluation & Regression — persistence models.

Two documents only:

- ``AIEvalRun`` — one evaluation run over a versioned dataset.
- ``AIEvalCaseResult`` — one deterministic-graded case inside a run.

The full internal evaluation trace (tool arguments/results) is graded in
memory by the runner and is never persisted. Only safe summaries are stored —
no payroll/HR/tool payloads.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.core.clock import utc_now

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AIEvalRunStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"


class AIEvalCaseStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    BLOCKED = "BLOCKED"


class AIEvalBlockedReason(str, Enum):
    """Machine-readable reason why a run/case could not execute."""

    BLOCKED_PROVIDER = "BLOCKED_PROVIDER"
    BLOCKED_DATASET_PRECONDITION = "BLOCKED_DATASET_PRECONDITION"


class AIEvalRegressionStatus(str, Enum):
    """Release verdict of a candidate run vs its baseline."""

    PASS = "PASS"
    REGRESSION = "REGRESSION"
    FAIL = "FAIL"
    BLOCKED = "BLOCKED"
    # No baseline exists yet for this dataset version.
    NEW = "NEW"


# Grading categories shown in the eval UI / category table.
GRADER_CATEGORY_LABELS = {
    "routing": "Routing",
    "tool_selection": "Tool Selection",
    "correctness": "Correctness",
    "grounding": "Grounding",
    "safety": "Safety",
    "efficiency": "Efficiency",
}


def empty_category_scores() -> dict[str, dict[str, Any]]:
    return {category: {} for category in GRADER_CATEGORY_LABELS}


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


class AIEvalRun(Document):
    """One evaluation run over a versioned dataset."""

    run_id: Indexed(str)
    tenant_id: Indexed(str)
    dataset_id: Indexed(str)
    dataset_version: str = "v1"
    agent_id: str
    agent_version: str
    requested_by: Indexed(str)
    requested_by_name: Optional[str] = None
    actor_user_id: Optional[str] = None  # server-side user the cases ran as

    status: AIEvalRunStatus = AIEvalRunStatus.QUEUED
    blocked_reason: Optional[str] = None

    # Provider / model / prompt snapshots (informational).
    provider: Optional[str] = None
    model: Optional[str] = None
    prompt_version: Optional[str] = None
    agent_versions: dict[str, str] = Field(default_factory=dict)

    # Case counts
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    blocked_cases: int = 0
    critical_cases: int = 0
    critical_passed: int = 0
    critical_failed: int = 0
    critical_blocked: int = 0

    # Per-grader-category scores: {"routing": {"passed": n, "total": n, "percent": float}}
    category_scores: dict[str, dict[str, Any]] = Field(default_factory=dict)

    # Baseline / regression
    is_baseline: bool = False
    baseline_run_id: Optional[str] = None
    baseline_set_at: Optional[datetime] = None
    regression_status: Optional[str] = None  # AIEvalRegressionStatus value
    regressions: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    critical_failures: list[str] = Field(default_factory=list)

    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "ai_eval_runs"
        indexes = [
            "run_id",
            "tenant_id",
            "dataset_id",
            "requested_by",
            "status",
            "is_baseline",
            IndexModel([("tenant_id", ASCENDING), ("run_id", ASCENDING)], unique=True),
            IndexModel([("tenant_id", ASCENDING), ("dataset_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("dataset_id", ASCENDING), ("is_baseline", ASCENDING)]),
        ]


class AIEvalCaseResult(Document):
    """Deterministic-graded result for a single eval case."""

    run_id: Indexed(str)
    tenant_id: Indexed(str)
    case_id: Indexed(str)
    dataset_id: str
    case_category: str = "correctness"
    status: AIEvalCaseStatus = AIEvalCaseStatus.BLOCKED
    blocked_reason: Optional[str] = None

    # What actually happened (real router + real agent service).
    actual_agent: Optional[str] = None
    actual_path: Optional[str] = None
    actual_success: Optional[bool] = None
    actual_error: Optional[str] = None

    # Tool summary — names + counts only, never payloads.
    tools: list[dict[str, Any]] = Field(default_factory=list)
    tool_error: bool = False

    groq_calls: int = 0
    steps: int = 0
    tokens: int = 0
    latency_ms: float = 0.0

    # Per-grader-category outcomes + flattened failure reasons.
    grader_results: dict[str, dict[str, Any]] = Field(default_factory=dict)
    failure_reasons: list[str] = Field(default_factory=list)

    # Sanitized dataset expectation (query + expected assertions only).
    expected: dict[str, Any] = Field(default_factory=dict)
    sanitized_answer_excerpt: str = Field(default="", max_length=2000)

    created_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "ai_eval_case_results"
        indexes = [
            "run_id",
            "tenant_id",
            "case_id",
            "dataset_id",
            "status",
            IndexModel([("run_id", ASCENDING), ("case_id", ASCENDING)], unique=True),
            IndexModel([("tenant_id", ASCENDING), ("dataset_id", ASCENDING), ("case_id", ASCENDING)]),
        ]


async def latest_baseline_run(tenant_id: str, dataset_id: str) -> Optional[AIEvalRun]:
    """Return the most recently completed baseline for a dataset version."""
    return await AIEvalRun.find(
        {
            "tenant_id": tenant_id,
            "dataset_id": dataset_id,
            "is_baseline": True,
            "status": AIEvalRunStatus.COMPLETED.value,
        }
    ).sort([("completed_at", DESCENDING)]).first()
