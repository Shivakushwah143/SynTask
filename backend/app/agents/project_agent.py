from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.agent import AgentDefinition, SpecialistDefinition


PROJECT_AGENT_ID = "project_agent"
PROJECT_AGENT_VERSION = "1.0.0"
PROJECT_AGENT_INPUT_SCHEMA_VERSION = "project-agent-input-v1"
PROJECT_AGENT_OUTPUT_SCHEMA_VERSION = "project-agent-output-v1"
PROJECT_AGENT_RETRIEVAL_PROFILE_ID = "project_read_only"
PROJECT_AGENT_RETRIEVAL_PROFILE_VERSION = "project-read-only-v1"
PROJECT_AGENT_PROMPT_ID = "project_agent_read_only"
PROJECT_AGENT_PROMPT_VERSION = "project-agent-read-only-v1"
PROJECT_AGENT_PROVIDER_POLICY_ID = "project-agent-read-only"
PROJECT_AGENT_EVALUATION_SET_VERSION = "project-agent-eval-v1"

SPECIALIST_VERSION = "1.0.0"
SPECIALIST_INPUT_SCHEMA_VERSION = "project-specialist-input-v1"
SPECIALIST_OUTPUT_SCHEMA_VERSION = "project-specialist-output-v1"
SPECIALIST_EVALUATION_SET_VERSION = "project-specialist-eval-v1"

PROJECT_AGENT_FORBIDDEN_TOOL_IDS = [
    "create_project",
    "update_project",
    "delete_project",
    "create_task",
    "update_task",
    "delete_task",
    "assign_task",
    "change_task_status",
    "send_email",
    "send_connector_message",
]

SPECIALIST_FORBIDDEN_ACTIONS = [
    "create_project",
    "update_project",
    "delete_project",
    "create_task",
    "update_task",
    "delete_task",
    "assign_user",
    "change_status",
    "send_message",
    "call_connector",
]


class ProjectAgentOperation(str, Enum):
    PROJECT_SUMMARY = "project_summary"
    DECOMPOSE_SCOPE = "decompose_scope"
    IDENTIFY_RISKS = "identify_risks"
    EXECUTION_GUIDANCE = "execution_guidance"
    REVIEW_PLAN = "review_plan"
    ESTIMATE_WORK = "estimate_work"
    COMPREHENSIVE_PROJECT_REVIEW = "comprehensive_project_review"


class ProjectSpecialistId(str, Enum):
    TASK_DECOMPOSITION = "task_decomposition_specialist"
    RISK_DEPENDENCY = "risk_dependency_specialist"
    EXECUTION_GUIDANCE = "execution_guidance_specialist"
    QUALITY_REVIEW = "quality_review_specialist"
    ESTIMATE_CAPACITY = "estimate_capacity_specialist"


class ProjectAgentDetailLevel(str, Enum):
    CONCISE = "concise"
    STANDARD = "standard"
    DETAILED = "detailed"


class ProjectAgentRiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class SelectedProjectRecordIds(BaseModel):
    model_config = ConfigDict(extra="forbid")

    milestone_ids: list[str] = Field(default_factory=list, max_length=50)
    task_ids: list[str] = Field(default_factory=list, max_length=100)
    dependency_ids: list[str] = Field(default_factory=list, max_length=100)
    document_ids: list[str] = Field(default_factory=list, max_length=50)


class ProjectPlanningInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scope: Optional[str] = Field(default=None, max_length=4000)
    deliverables: list[str] = Field(default_factory=list, max_length=50)
    constraints: list[str] = Field(default_factory=list, max_length=50)
    assumptions: list[str] = Field(default_factory=list, max_length=50)
    target_date: Optional[date] = None

    @field_validator("deliverables", "constraints", "assumptions")
    @classmethod
    def reject_blank_items(cls, values: list[str]) -> list[str]:
        if any(not item.strip() for item in values):
            raise ValueError("List items cannot be blank")
        return values


class ProjectAgentPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str = Field(default="en", min_length=2, max_length=16)
    tone: str = Field(default="professional", min_length=1, max_length=64)
    detail_level: ProjectAgentDetailLevel = ProjectAgentDetailLevel.STANDARD


class ProjectAgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    project_id: str = Field(min_length=1, max_length=128)
    operation: ProjectAgentOperation
    user_request: str = Field(min_length=1, max_length=8000)
    selected_record_ids: SelectedProjectRecordIds = Field(default_factory=SelectedProjectRecordIds)
    planning_input: ProjectPlanningInput = Field(default_factory=ProjectPlanningInput)
    preferences: ProjectAgentPreferences = Field(default_factory=ProjectAgentPreferences)
    session_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    conversation_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    idempotency_key: str = Field(min_length=8, max_length=128)


class EvidenceReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: str = Field(min_length=1, max_length=64)
    source_id: str = Field(min_length=1, max_length=128)
    title: Optional[str] = Field(default=None, max_length=256)
    field_path: Optional[str] = Field(default=None, max_length=256)
    retrieved_at: Optional[datetime] = None
    permission_status: Literal["allowed", "permission_restricted"] = "allowed"


class SpecialistAttribution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    specialist_id: str = Field(min_length=1, max_length=128)
    specialist_version: str = Field(min_length=1, max_length=32)
    confidence: float = Field(ge=0.0, le=1.0)


class ProjectObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    finding: str = Field(min_length=1, max_length=2000)
    evidence: list[EvidenceReference] = Field(default_factory=list, max_length=20)
    confidence: float = Field(ge=0.0, le=1.0)
    specialist: Optional[SpecialistAttribution] = None


class ProjectRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommendation: str = Field(min_length=1, max_length=2000)
    rationale: str = Field(min_length=1, max_length=2000)
    evidence: list[EvidenceReference] = Field(default_factory=list, max_length=20)
    specialist: Optional[SpecialistAttribution] = None
    confidence: float = Field(ge=0.0, le=1.0)


class ProposedWorkItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    acceptance_criteria: list[str] = Field(default_factory=list, max_length=20)
    dependencies: list[str] = Field(default_factory=list, max_length=20)
    estimate_range: Optional[str] = Field(default=None, max_length=64)
    priority_suggestion: Optional[str] = Field(default=None, max_length=64)
    mutation_status: Literal["proposal_only"] = "proposal_only"
    evidence: list[EvidenceReference] = Field(default_factory=list, max_length=20)


class ProjectRisk(BaseModel):
    model_config = ConfigDict(extra="forbid")

    risk: str = Field(min_length=1, max_length=1000)
    risk_level: ProjectAgentRiskLevel = ProjectAgentRiskLevel.UNKNOWN
    mitigation: Optional[str] = Field(default=None, max_length=1000)
    evidence: list[EvidenceReference] = Field(default_factory=list, max_length=20)
    confidence: float = Field(ge=0.0, le=1.0)


class ProjectDependency(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dependency: str = Field(min_length=1, max_length=1000)
    source_record_id: Optional[str] = Field(default=None, max_length=128)
    target_record_id: Optional[str] = Field(default=None, max_length=128)
    status: Literal["known", "suspected", "missing"] = "known"
    evidence: list[EvidenceReference] = Field(default_factory=list, max_length=20)


class MissingDataItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=1000)
    permission_status: Literal["unknown", "permission_restricted"] = "unknown"


class ProjectAgentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    agent_id: Literal["project_agent"] = PROJECT_AGENT_ID
    agent_version: str = PROJECT_AGENT_VERSION
    project_id: str = Field(min_length=1, max_length=128)
    operation: ProjectAgentOperation
    context_timestamp: datetime
    summary: str = Field(min_length=1, max_length=4000)
    observations: list[ProjectObservation] = Field(default_factory=list, max_length=50)
    recommendations: list[ProjectRecommendation] = Field(default_factory=list, max_length=50)
    proposed_work_items: list[ProposedWorkItem] = Field(default_factory=list, max_length=50)
    risks: list[ProjectRisk] = Field(default_factory=list, max_length=50)
    dependencies: list[ProjectDependency] = Field(default_factory=list, max_length=100)
    missing_data: list[MissingDataItem] = Field(default_factory=list, max_length=50)
    evidence: list[EvidenceReference] = Field(default_factory=list, max_length=100)
    overall_confidence: float = Field(ge=0.0, le=1.0)
    risk_level: ProjectAgentRiskLevel = ProjectAgentRiskLevel.UNKNOWN
    warnings: list[str] = Field(default_factory=list, max_length=20)
    expires_at: datetime
    read_only: Literal[True] = True
    approval_required: bool = False

    @model_validator(mode="after")
    def validate_read_only_output(self) -> "ProjectAgentOutput":
        if self.proposed_work_items and not self.approval_required:
            raise ValueError("Proposed work items require approval")
        if self.expires_at <= self.context_timestamp:
            raise ValueError("expires_at must be after context_timestamp")
        return self


class SpecialistSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    specialist_id: str
    specialist_version: str
    reason: str


class SpecialistSelectionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operation: ProjectAgentOperation
    selected: list[SpecialistSelection] = Field(default_factory=list)
    unavailable_reason: Optional[Literal["no_matching_evaluated_specialist", "no_matching_enabled_specialist"]] = None


SPECIALIST_OPERATION_MAP: dict[ProjectAgentOperation, tuple[ProjectSpecialistId, ...]] = {
    ProjectAgentOperation.PROJECT_SUMMARY: (
        ProjectSpecialistId.EXECUTION_GUIDANCE,
        ProjectSpecialistId.RISK_DEPENDENCY,
    ),
    ProjectAgentOperation.DECOMPOSE_SCOPE: (ProjectSpecialistId.TASK_DECOMPOSITION,),
    ProjectAgentOperation.IDENTIFY_RISKS: (ProjectSpecialistId.RISK_DEPENDENCY,),
    ProjectAgentOperation.EXECUTION_GUIDANCE: (ProjectSpecialistId.EXECUTION_GUIDANCE,),
    ProjectAgentOperation.REVIEW_PLAN: (
        ProjectSpecialistId.QUALITY_REVIEW,
        ProjectSpecialistId.RISK_DEPENDENCY,
    ),
    ProjectAgentOperation.ESTIMATE_WORK: (ProjectSpecialistId.ESTIMATE_CAPACITY,),
    ProjectAgentOperation.COMPREHENSIVE_PROJECT_REVIEW: (
        ProjectSpecialistId.TASK_DECOMPOSITION,
        ProjectSpecialistId.RISK_DEPENDENCY,
        ProjectSpecialistId.EXECUTION_GUIDANCE,
        ProjectSpecialistId.QUALITY_REVIEW,
        ProjectSpecialistId.ESTIMATE_CAPACITY,
    ),
}


def project_agent_definition(created_by: str = "system") -> AgentDefinition:
    now = datetime.now(UTC)
    return AgentDefinition.model_construct(
        agent_id=PROJECT_AGENT_ID,
        version=PROJECT_AGENT_VERSION,
        name="Read-Only Project Agent",
        description="Project-scoped planning guidance and proposal-only work breakdown.",
        department="projects",
        objective=(
            "Help authorized users understand one project, identify risks, break approved scope into proposed work, "
            "and provide evidence-linked planning guidance without mutating records."
        ),
        allowed_trigger_types=["manual"],
        allowed_roles=["super_admin", "admin", "manager", "lead", "employee"],
        required_scopes=["project_id"],
        required_structured_domains=["project", "task", "milestone", "dependency", "user", "department"],
        retrieval_profile_id=PROJECT_AGENT_RETRIEVAL_PROFILE_ID,
        retrieval_profile_version=PROJECT_AGENT_RETRIEVAL_PROFILE_VERSION,
        allowed_tool_ids=[],
        forbidden_tool_ids=PROJECT_AGENT_FORBIDDEN_TOOL_IDS,
        input_schema_version=PROJECT_AGENT_INPUT_SCHEMA_VERSION,
        output_schema_version=PROJECT_AGENT_OUTPUT_SCHEMA_VERSION,
        prompt_id=PROJECT_AGENT_PROMPT_ID,
        prompt_version=PROJECT_AGENT_PROMPT_VERSION,
        provider_policy_id=PROJECT_AGENT_PROVIDER_POLICY_ID,
        memory_policy={
            "working_memory": "resolve_current_references_only",
            "structured_memory": "authoritative_current_business_facts",
            "rag": "approved_supporting_documents_only",
        },
        personalization_policy={"allowed": ["language", "tone", "detail_level"], "forbidden": ["facts", "permissions"]},
        approval_policy={"read_only": True, "proposal_only": True, "mutations_allowed": False},
        budget_policy={"max_specialists_per_run": 5, "max_repair_attempts": 1},
        timeout_seconds=30,
        maximum_retries=0,
        evaluation_set_version=PROJECT_AGENT_EVALUATION_SET_VERSION,
        enabled=False,
        published=False,
        created_at=now,
        created_by=created_by,
        retired_at=None,
    )


def project_specialist_definitions(created_by: str = "system") -> list[SpecialistDefinition]:
    now = datetime.now(UTC)
    specs = [
        (
            ProjectSpecialistId.TASK_DECOMPOSITION,
            [ProjectAgentOperation.DECOMPOSE_SCOPE, ProjectAgentOperation.COMPREHENSIVE_PROJECT_REVIEW],
            "Break approved scope into proposed milestones, tasks, subtasks, deliverables, and acceptance criteria.",
        ),
        (
            ProjectSpecialistId.RISK_DEPENDENCY,
            [
                ProjectAgentOperation.PROJECT_SUMMARY,
                ProjectAgentOperation.IDENTIFY_RISKS,
                ProjectAgentOperation.REVIEW_PLAN,
                ProjectAgentOperation.COMPREHENSIVE_PROJECT_REVIEW,
            ],
            "Identify blockers, sequencing issues, dependency risks, conflicts, missing approvals, and uncertainty.",
        ),
        (
            ProjectSpecialistId.EXECUTION_GUIDANCE,
            [
                ProjectAgentOperation.PROJECT_SUMMARY,
                ProjectAgentOperation.EXECUTION_GUIDANCE,
                ProjectAgentOperation.COMPREHENSIVE_PROJECT_REVIEW,
            ],
            "Suggest practical next steps, handoffs, required inputs, and completion requirements.",
        ),
        (
            ProjectSpecialistId.QUALITY_REVIEW,
            [ProjectAgentOperation.REVIEW_PLAN, ProjectAgentOperation.COMPREHENSIVE_PROJECT_REVIEW],
            "Review plans for vague work, duplicate tasks, missing criteria, missing dependencies, and untestable outputs.",
        ),
        (
            ProjectSpecialistId.ESTIMATE_CAPACITY,
            [ProjectAgentOperation.ESTIMATE_WORK, ProjectAgentOperation.COMPREHENSIVE_PROJECT_REVIEW],
            "Suggest effort ranges and capacity warnings without ranking employees or assigning users.",
        ),
    ]
    return [
        SpecialistDefinition.model_construct(
            specialist_id=specialist_id.value,
            version=SPECIALIST_VERSION,
            supported_agent_ids=[PROJECT_AGENT_ID],
            supported_task_categories=[operation.value for operation in operations],
            department_types=["generic"],
            project_types=["generic"],
            applicable_industries=["generic"],
            objective=objective,
            required_context=["project", "tasks", "milestones", "dependencies", "authorized_documents"],
            retrieval_profile={"profile_id": PROJECT_AGENT_RETRIEVAL_PROFILE_ID, "version": PROJECT_AGENT_RETRIEVAL_PROFILE_VERSION},
            allowed_tools=[],
            forbidden_actions=SPECIALIST_FORBIDDEN_ACTIONS,
            input_schema_version=SPECIALIST_INPUT_SCHEMA_VERSION,
            output_schema_version=SPECIALIST_OUTPUT_SCHEMA_VERSION,
            prompt_version=f"{specialist_id.value}-v1",
            provider_policy={"policy_id": PROJECT_AGENT_PROVIDER_POLICY_ID},
            evidence_requirements={"record_references_required": True, "distinguish_facts_from_hypotheses": True},
            evaluation_set_version=SPECIALIST_EVALUATION_SET_VERSION,
            maximum_fan_out=1,
            budget={"max_tool_calls": 0},
            enabled=False,
            evaluated=False,
            published=False,
            created_at=now,
            created_by=created_by,
            retired_at=None,
        )
        for specialist_id, operations, objective in specs
    ]


class ProjectSpecialistSelector:
    def select(
        self,
        operation: ProjectAgentOperation | str,
        specialists: list[SpecialistDefinition],
        *,
        max_specialists: int = 5,
        require_enabled: bool = True,
        require_evaluated: bool = True,
    ) -> SpecialistSelectionResult:
        try:
            operation = ProjectAgentOperation(operation)
        except ValueError as exc:
            raise ValueError("Unsupported Project Agent operation") from exc

        expected_ids = [specialist_id.value for specialist_id in SPECIALIST_OPERATION_MAP[operation]][:max_specialists]
        by_id = {specialist.specialist_id: specialist for specialist in specialists}
        selected: list[SpecialistSelection] = []
        saw_disabled_match = False
        saw_unevaluated_match = False

        for specialist_id in expected_ids:
            specialist = by_id.get(specialist_id)
            if specialist is None:
                continue
            if PROJECT_AGENT_ID not in specialist.supported_agent_ids:
                continue
            if operation.value not in specialist.supported_task_categories:
                continue
            if require_enabled and not specialist.enabled:
                saw_disabled_match = True
                continue
            if require_evaluated and not specialist.evaluated:
                saw_unevaluated_match = True
                continue
            selected.append(
                SpecialistSelection(
                    specialist_id=specialist.specialist_id,
                    specialist_version=specialist.version,
                    reason=f"Exact operation match for {operation.value}",
                )
            )

        unavailable_reason = None
        if not selected:
            if saw_disabled_match:
                unavailable_reason = "no_matching_enabled_specialist"
            elif saw_unevaluated_match:
                unavailable_reason = "no_matching_evaluated_specialist"

        return SpecialistSelectionResult(
            operation=operation,
            selected=selected,
            unavailable_reason=unavailable_reason,
        )


def example_project_agent_output(project_id: str, operation: ProjectAgentOperation) -> ProjectAgentOutput:
    now = datetime.now(UTC)
    return ProjectAgentOutput(
        project_id=project_id,
        operation=operation,
        context_timestamp=now,
        summary="Project guidance placeholder.",
        overall_confidence=0.0,
        expires_at=now + timedelta(minutes=30),
    )
