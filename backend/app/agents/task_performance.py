from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.agent import AgentDefinition
from app.services.task_performance_metrics import METRIC_DEFINITIONS


TASK_PERFORMANCE_AGENT_ID = "task_performance_insights_agent"
TASK_PERFORMANCE_AGENT_VERSION = "v1"
TASK_PERFORMANCE_INPUT_SCHEMA_VERSION = "task-performance-input-v1"
TASK_PERFORMANCE_OUTPUT_SCHEMA_VERSION = "task-performance-output-v1"
TASK_PERFORMANCE_RETRIEVAL_PROFILE_ID = "task_performance_policy"
TASK_PERFORMANCE_RETRIEVAL_PROFILE_VERSION = "task-performance-policy-v1"
TASK_PERFORMANCE_PROMPT_ID = "task_performance_insights_agent"
TASK_PERFORMANCE_PROMPT_VERSION = "task-performance-insights-v1"
TASK_PERFORMANCE_PROVIDER_POLICY_ID = "task-performance-explanation-only"
TASK_PERFORMANCE_EVALUATION_SET_VERSION = "task-performance-eval-v1"

TASK_PERFORMANCE_FORBIDDEN_TOOL_IDS = [
    "create_task",
    "update_task",
    "delete_task",
    "assign_task",
    "change_task_status",
    "update_user",
    "rank_employees",
    "score_employee",
    "send_email",
    "send_connector_message",
    "schedule_agent_run",
]

PROHIBITED_DECISION_TERMS = (
    "fire ",
    "firing",
    "terminate",
    "termination",
    "promote",
    "promotion",
    "salary",
    "bonus",
    "disciplinary",
    "discipline",
    "secret score",
    "rank employees",
    "best employee",
    "worst employee",
)


class TaskPerformanceInsightType(str, Enum):
    TEAM_SUMMARY = "team_summary"
    DEPARTMENT_SUMMARY = "department_summary"
    PROJECT_SUMMARY = "project_summary"
    INDIVIDUAL_SUMMARY = "individual_summary"
    COMPLETION_TRENDS = "completion_trends"
    OVERDUE_TRENDS = "overdue_trends"
    WORKLOAD_DISTRIBUTION = "workload_distribution"
    ESTIMATE_VARIANCE = "estimate_variance"
    BLOCKER_PATTERNS = "blocker_patterns"
    DEPENDENCY_DELAYS = "dependency_delays"
    EOD_COMPLETENESS = "eod_completeness"
    TASK_EOD_CONSISTENCY = "task_eod_consistency"
    REWORK_TRENDS = "rework_trends"
    SCOPE_CHANGE_IMPACT = "scope_change_impact"
    DATA_QUALITY = "data_quality"


class TaskPerformanceDetailLevel(str, Enum):
    CONCISE = "concise"
    STANDARD = "standard"
    DETAILED = "detailed"


class TaskPerformanceFormat(str, Enum):
    SUMMARY = "summary"
    REPORT = "report"
    DASHBOARD = "dashboard"


class TaskPerformanceScope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    department_id: Optional[str] = Field(default=None, max_length=128)
    project_id: Optional[str] = Field(default=None, max_length=128)
    team_id: Optional[str] = Field(default=None, max_length=128)
    user_id: Optional[str] = Field(default=None, max_length=128)


class TaskPerformanceDateRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: datetime
    end: datetime

    @model_validator(mode="after")
    def validate_range(self) -> "TaskPerformanceDateRange":
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self


class TaskPerformancePreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str = Field(default="en", min_length=2, max_length=32)
    detail_level: TaskPerformanceDetailLevel = TaskPerformanceDetailLevel.STANDARD
    format: TaskPerformanceFormat = TaskPerformanceFormat.SUMMARY


class TaskPerformanceAgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    insight_type: TaskPerformanceInsightType
    scope: TaskPerformanceScope = Field(default_factory=TaskPerformanceScope)
    date_range: TaskPerformanceDateRange
    comparison_period: Optional[TaskPerformanceDateRange] = None
    metric_keys: list[str] = Field(default_factory=list, max_length=20)
    user_request: Optional[str] = Field(default=None, max_length=4000)
    preferences: TaskPerformancePreferences = Field(default_factory=TaskPerformancePreferences)
    session_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    conversation_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    idempotency_key: str = Field(min_length=8, max_length=128)

    @field_validator("metric_keys")
    @classmethod
    def validate_metric_keys(cls, values: list[str]) -> list[str]:
        unsupported = sorted(set(values) - set(METRIC_DEFINITIONS))
        if unsupported:
            raise ValueError(f"Unsupported metric keys: {', '.join(unsupported)}")
        return values

    @field_validator("user_request")
    @classmethod
    def reject_prohibited_decisions(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return value
        lowered = value.lower()
        if any(term in lowered for term in PROHIBITED_DECISION_TERMS):
            raise ValueError("Employment decisions, rankings, secret scores, and discipline requests are not supported")
        return value


class TaskPerformanceAgentIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: Literal["task_performance_insights_agent"] = TASK_PERFORMANCE_AGENT_ID
    version: str = TASK_PERFORMANCE_AGENT_VERSION


class TaskPerformanceMetricOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    version: str
    status: Literal["available", "unavailable"]
    formula: str
    value: Optional[float] = None
    numerator: Optional[float] = None
    denominator: Optional[float] = None
    sample_size: int = Field(ge=0)
    excluded_record_count: int = Field(ge=0)
    missing_fields: list[str] = Field(default_factory=list, max_length=50)
    conflicts: list[str] = Field(default_factory=list, max_length=50)
    warnings: list[str] = Field(default_factory=list, max_length=50)
    confidence: float = Field(ge=0.0, le=1.0)
    source_record_references: list[dict[str, str]] = Field(default_factory=list, max_length=200)


class TaskPerformanceInsight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    fact_or_hypothesis: Literal["fact", "hypothesis"]
    severity: Literal["informational", "low", "medium", "high"] = "informational"
    metric_references: list[str] = Field(default_factory=list, max_length=20)
    record_references: list[dict[str, str]] = Field(default_factory=list, max_length=50)
    assumptions: list[str] = Field(default_factory=list, max_length=20)
    confidence: float = Field(ge=0.0, le=1.0)


class TaskPerformanceRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    owner_role_suggestion: Optional[str] = Field(default=None, max_length=128)
    expected_operational_outcome: Optional[str] = Field(default=None, max_length=500)
    metric_references: list[str] = Field(default_factory=list, max_length=20)
    evidence_references: list[dict[str, str]] = Field(default_factory=list, max_length=50)
    confidence: float = Field(ge=0.0, le=1.0)
    mutation_status: Literal["proposal_only"] = "proposal_only"


class TaskPerformanceDataQuality(BaseModel):
    model_config = ConfigDict(extra="forbid")

    missing_data: list[str] = Field(default_factory=list, max_length=100)
    conflicts: list[str] = Field(default_factory=list, max_length=100)
    stale_sources: list[str] = Field(default_factory=list, max_length=100)
    excluded_records: list[str] = Field(default_factory=list, max_length=100)
    sample_size_warnings: list[str] = Field(default_factory=list, max_length=100)


class TaskPerformanceAgentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    agent: TaskPerformanceAgentIdentity = Field(default_factory=TaskPerformanceAgentIdentity)
    agent_run_id: str = Field(min_length=1, max_length=128)
    scope: dict[str, str]
    period: dict[str, str]
    summary: str = Field(min_length=1, max_length=4000)
    metrics: list[TaskPerformanceMetricOutput] = Field(default_factory=list, max_length=50)
    verified_findings: list[str] = Field(default_factory=list, max_length=100)
    employee_reported_context: list[str] = Field(default_factory=list, max_length=100)
    data_quality: TaskPerformanceDataQuality = Field(default_factory=TaskPerformanceDataQuality)
    insights: list[TaskPerformanceInsight] = Field(default_factory=list, max_length=50)
    recommendations: list[TaskPerformanceRecommendation] = Field(default_factory=list, max_length=50)
    fairness_warnings: list[str] = Field(default_factory=list, max_length=50)
    limitations: list[str] = Field(default_factory=list, max_length=50)
    approval_required: bool = True
    read_only: Literal[True] = True
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @model_validator(mode="after")
    def validate_fairness_invariants(self) -> "TaskPerformanceAgentOutput":
        text = " ".join(
            [
                self.summary,
                *self.verified_findings,
                *self.employee_reported_context,
                *self.fairness_warnings,
                *self.limitations,
                *[insight.title + " " + insight.description for insight in self.insights],
                *[item.title + " " + item.description for item in self.recommendations],
            ]
        ).lower()
        if any(term in text for term in PROHIBITED_DECISION_TERMS):
            raise ValueError("Output contains prohibited employment-decision, ranking, or secret-score language")
        return self


def task_performance_agent_definition(created_by: str = "system") -> AgentDefinition:
    now = datetime.now(UTC)
    return AgentDefinition.model_construct(
        agent_id=TASK_PERFORMANCE_AGENT_ID,
        version=TASK_PERFORMANCE_AGENT_VERSION,
        name="Task Performance Insights Agent",
        description="Read-only operational metric explanations from deterministic task, EOD, workload, project, and leave data.",
        department="operations",
        objective=(
            "Explain deterministic task and operational metrics for authorized managers and administrators without ranking "
            "employees, generating secret scores, making employment decisions, or mutating business records."
        ),
        allowed_trigger_types=["manual"],
        allowed_roles=["super_admin", "admin", "manager", "lead"],
        required_scopes=["tenant_id", "date_range"],
        required_structured_domains=["task", "project", "user", "department", "eod", "time_tracking", "leave"],
        retrieval_profile_id=TASK_PERFORMANCE_RETRIEVAL_PROFILE_ID,
        retrieval_profile_version=TASK_PERFORMANCE_RETRIEVAL_PROFILE_VERSION,
        allowed_tool_ids=[],
        forbidden_tool_ids=TASK_PERFORMANCE_FORBIDDEN_TOOL_IDS,
        input_schema_version=TASK_PERFORMANCE_INPUT_SCHEMA_VERSION,
        output_schema_version=TASK_PERFORMANCE_OUTPUT_SCHEMA_VERSION,
        prompt_id=TASK_PERFORMANCE_PROMPT_ID,
        prompt_version=TASK_PERFORMANCE_PROMPT_VERSION,
        provider_policy_id=TASK_PERFORMANCE_PROVIDER_POLICY_ID,
        memory_policy={
            "working_memory": "resolve_scope_and_date_references_only",
            "structured_memory": "authoritative_current_business_facts",
            "rag": "approved_metric_policy_and_management_guidance_only",
        },
        personalization_policy={
            "allowed": ["language", "detail_level", "format"],
            "forbidden": ["facts", "permissions", "metric_values", "confidence", "warnings", "policy"],
        },
        approval_policy={"read_only": True, "proposal_only": True, "mutations_allowed": False, "employment_decisions_allowed": False},
        budget_policy={"max_repair_attempts": 1, "max_tokens_per_run": 5000},
        timeout_seconds=30,
        maximum_retries=0,
        evaluation_set_version=TASK_PERFORMANCE_EVALUATION_SET_VERSION,
        enabled=False,
        published=False,
        created_at=now,
        created_by=created_by,
        retired_at=None,
    )

