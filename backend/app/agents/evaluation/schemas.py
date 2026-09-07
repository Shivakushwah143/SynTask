"""
AI Evaluation — dataset & expectation schemas.

Versioned eval datasets live as immutable JSON files under
``app/agents/evaluation/datasets/``. This module defines the schema for those
files and the per-case ``expected`` block.

Grading is intentionally deterministic — no LLM-as-a-judge. Every assertion
below is evaluated against one of:

- the real router decision (agent/path)
- the real agent tool executions (tool names, arguments, results)
- the real agent answer string / latency / Groq usage

No dataset may carry tenant/authorization values; company context always comes
from the server-side user that executes the run.
"""
from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field

# Categories measured by the deterministic graders.
ROUTING = "routing"
TOOL_SELECTION = "tool_selection"
CORRECTNESS = "correctness"
GROUNDING = "grounding"
SAFETY = "safety"
EFFICIENCY = "efficiency"

GRADER_CATEGORIES = [
    ROUTING,
    TOOL_SELECTION,
    CORRECTNESS,
    GROUNDING,
    SAFETY,
    EFFICIENCY,
]

# Operation types supported by ``tool_result_assertions``.
ToolResultOp = Literal["equals", "contains", "count_equals", "gte", "lte", "exists"]

NO_DATA_ANSWER_MARKERS = (
    "no data", "no records", "not found", "no employee", "no candidate",
    "no leave", "no attendance", "no match", "doesn't exist", "does not exist",
    "don't have", "do not have", "couldn't find", "could not find", "unable to find",
    "no salary", "no payslip", "no payroll", "no document", "none found", "no offer",
    "no interview", "no job", "not available", "no results", "no information",
    "no such", "unknown", "cannot find", "can't find", "couldn't locate", "i couldn't",
    "no one named", "nobody named", "no profile", "hasn't been found", "haven't found",
    "isn't available", "is not available", "not on file", "empty", "zero",
)


class ToolResultAssertion(BaseModel):
    """Assert a fact about the result of one real tool execution.

    ``path`` is a JSONPath-like pointer into the tool result dict, e.g.
    ``$.total`` or ``$.employees[0].full_name``. The assertion is evaluated
    against every execution of ``tool`` during the run; it passes when at least
    one execution satisfies it.
    """

    tool: str = Field(..., min_length=1)
    path: str = Field(..., min_length=1, description='JSON-path style pointer, e.g. "$.total" or "$.employees[0].full_name"')
    op: ToolResultOp = "equals"
    value: Optional[Union[str, int, float, bool]] = Field(default=None, description="Expected value for equals/contains/count_equals/gte/lte")
    message: Optional[str] = Field(default=None, description="Optional human-readable assertion label used in failure reasons")


class SafetyExpectation(BaseModel):
    """Deterministic safety assertions for one case.

    These apply to cases that intentionally probe sensitive/mutation behavior.
    Because the Executive and HR agents are read-only by design, the expected
    behavior is: no write/sensitive tool is executed and the agent never claims
    that an action was performed.
    """

    sensitive_tools_forbidden: list[str] = Field(default_factory=list, description="Tools that must never appear in this run (e.g. payroll mutation tools)")
    refusal_expected: bool = Field(default=False, description="True when the agent is expected to refuse/explain instead of performing an action")
    must_not_claim_execution: bool = Field(default=False, description="Require the answer to never claim the action was executed")


class EvalExpectation(BaseModel):
    """Deterministic expectations for a single eval case."""

    expected_agent: Optional[Union[str, list[str]]] = Field(
        default=None, description="Agent id(s) the real router should select."
    )
    expected_path: Optional[str] = Field(
        default=None, description="Expected execution path (e.g. EXECUTIVE or FAST_FACT) when the service reports one."
    )
    required_tools: list[str] = Field(default_factory=list, description="Tools that must have been called at least once.")
    forbidden_tools: list[str] = Field(default_factory=list, description="Tools that must never have been called.")
    tool_result_assertions: list[ToolResultAssertion] = Field(default_factory=list)
    answer_contains: list[str] = Field(default_factory=list, description="Substrings the final answer must contain.")
    answer_contains_any: list[str] = Field(default_factory=list, description="At least one of these substrings must appear.")
    answer_not_contains: list[str] = Field(default_factory=list, description="Substrings that must never appear in the answer.")
    expected_success: Optional[bool] = Field(default=None, description="Expected agent run success flag when deterministic.")
    expected_error: Optional[str] = Field(default=None, description="Expected error-code substring when the agent is supposed to fail.")
    max_tool_calls: Optional[int] = Field(default=None, ge=0, description="Maximum total tool calls allowed.")
    max_groq_calls: Optional[int] = Field(default=None, ge=0, description="Maximum Groq agent-loop calls allowed.")
    max_latency_ms: Optional[int] = Field(default=None, ge=0, description="Maximum end-to-end case latency allowed.")
    no_data_expected: bool = Field(
        default=False,
        description=(
            "True for grounding cases that query a nonexistent entity or empty data: the agent must "
            "return no-data/unknown behavior instead of inventing facts. Grading requires at least one "
            "empty tool result OR a no-data answer marker, and forbids claim markers."
        ),
    )
    safety: Optional[SafetyExpectation] = Field(default=None)


class EvalCase(BaseModel):
    """One versioned eval case."""

    id: str = Field(..., min_length=1)
    category: str = Field(default="correctness", description="Semantic focus of the case (correctness/grounding/safety/efficiency/routing/tool_selection).")
    query: str = Field(..., min_length=1)
    actor_role: Optional[str] = Field(default=None, description="Server-side role the case is executed as. Defaults to the dataset actor_role.")
    expected: EvalExpectation = Field(default_factory=EvalExpectation)
    critical: bool = Field(default=False, description="Critical safety/security cases must be 100% — they cannot hide behind aggregate scores.")
    notes: Optional[str] = Field(default=None)


class EvalDataset(BaseModel):
    """Top-level schema for ``app/agents/evaluation/datasets/*.json``."""

    dataset_id: str = Field(..., min_length=1)
    dataset_version: str = Field(default="v1", min_length=1)
    agent_id: str = Field(..., min_length=1, description="Primary agent under evaluation (e.g. executive_operations_agent).")
    agent_version: str = Field(default="v1")
    actor_role: str = Field(default="admin", description="Default server-side actor role for cases.")
    description: str = ""
    cases: list[EvalCase] = Field(default_factory=list)


def case_uses_grader(case: EvalCase, grader_category: str) -> bool:
    """Return whether ``grader_category`` is applicable to ``case``.

    Only categories with explicit expectations are graded — a case never
    generates noise for assertions it did not opt into.
    """
    expected = case.expected
    if grader_category == "routing":
        return expected.expected_agent is not None or expected.expected_path is not None
    if grader_category == "tool_selection":
        return bool(expected.required_tools or expected.forbidden_tools or expected.max_tool_calls is not None)
    if grader_category == "correctness":
        return bool(
            expected.tool_result_assertions
            or expected.answer_contains
            or expected.answer_contains_any
            or expected.expected_success is not None
            or expected.expected_error is not None
        )
    if grader_category == "grounding":
        return expected.no_data_expected is True
    if grader_category == "safety":
        return expected.safety is not None or bool(expected.forbidden_tools)
    if grader_category == "efficiency":
        return expected.max_groq_calls is not None or expected.max_latency_ms is not None or expected.max_tool_calls is not None
    return False


def case_uses_any_grader(case: EvalCase) -> bool:
    return any(case_uses_grader(case, category) for category in GRADER_CATEGORIES)


def serializable_case(case: EvalCase) -> dict[str, Any]:
    """Dataset-case projection safe for persisted run/case metadata."""
    return {
        "id": case.id,
        "category": case.category,
        "query": case.query[:2000],
        "critical": case.critical,
        "expected": case.expected.model_dump(mode="json", exclude_none=True),
    }
