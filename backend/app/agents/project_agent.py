from __future__ import annotations

from datetime import date, datetime, timedelta

from app.core.clock import aware_utc_now
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
DEPARTMENT_SPECIALIST_VERSION = "1.0.0"
DEPARTMENT_SPECIALIST_ROUTING_RULE_VERSION = "department-specialist-routing-v1"
DEPARTMENT_SPECIALIST_INPUT_SCHEMA_VERSION = "department-specialist-input-v1"
DEPARTMENT_SPECIALIST_OUTPUT_SCHEMA_VERSION = "department-specialist-output-v1"
DEPARTMENT_SPECIALIST_EVALUATION_SET_VERSION = "department-specialist-eval-v1"
DEPARTMENT_SPECIALIST_PACK_VERSION = "1.0.0"

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


class DepartmentSpecialistId(str, Enum):
    CONTENT_SEO = "content_seo_task_specialist"
    CAMPAIGN_EXECUTION_ANALYTICS = "campaign_execution_analytics_specialist"
    SOFTWARE_IMPLEMENTATION = "software_implementation_specialist"
    QA_RELEASE = "qa_release_specialist"
    LEAD_RESEARCH_QUALIFICATION = "lead_research_qualification_task_specialist"
    PROPOSAL_FOLLOW_UP = "proposal_follow_up_task_specialist"
    RECRUITMENT_INTERVIEW = "recruitment_interview_task_specialist"
    ONBOARDING_WORKFLOW = "onboarding_workflow_task_specialist"
    PROCESS_DEPENDENCY = "process_dependency_task_specialist"
    CAPACITY_RESOURCE = "capacity_resource_task_specialist"
    BUDGET_COST_REVIEW = "budget_cost_review_task_specialist"
    BILLING_INVOICE_REVIEW = "billing_invoice_review_task_specialist"
    TICKET_TRIAGE_RESOLUTION = "ticket_triage_resolution_task_specialist"
    ESCALATION_KNOWLEDGE = "escalation_knowledge_task_specialist"


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
    task_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    operation: ProjectAgentOperation
    user_request: str = Field(min_length=1, max_length=8000)
    requested_focus: Optional[str] = Field(default=None, max_length=128)
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


class DepartmentSpecialistOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pack_id: str = Field(min_length=1, max_length=128)
    pack_version: str = DEPARTMENT_SPECIALIST_PACK_VERSION
    specialist_id: str = Field(min_length=1, max_length=128)
    specialist_version: str = DEPARTMENT_SPECIALIST_VERSION
    selection_reason: str = Field(min_length=1, max_length=1000)
    routing_rule_version: str = DEPARTMENT_SPECIALIST_ROUTING_RULE_VERSION
    summary: str = Field(min_length=1, max_length=4000)
    task_guidance: list[str] = Field(default_factory=list, max_length=50)
    checklist: list[str] = Field(default_factory=list, max_length=50)
    risks: list[ProjectRisk] = Field(default_factory=list, max_length=50)
    dependencies: list[ProjectDependency] = Field(default_factory=list, max_length=50)
    acceptance_criteria_suggestions: list[str] = Field(default_factory=list, max_length=50)
    recommendations: list[ProjectRecommendation] = Field(default_factory=list, max_length=50)
    proposed_actions: list[ProposedWorkItem] = Field(default_factory=list, max_length=20)
    evidence: list[EvidenceReference] = Field(default_factory=list, max_length=100)
    source_record_references: list[EvidenceReference] = Field(default_factory=list, max_length=100)
    assumptions: list[str] = Field(default_factory=list, max_length=50)
    missing_data: list[MissingDataItem] = Field(default_factory=list, max_length=50)
    conflicting_data: list[str] = Field(default_factory=list, max_length=50)
    confidence: float = Field(ge=0.0, le=1.0)
    risk_level: ProjectAgentRiskLevel = ProjectAgentRiskLevel.UNKNOWN
    proposal_only: Literal[True] = True
    approval_required: bool = False
    data_freshness: dict[str, str] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_proposal_boundary(self) -> "DepartmentSpecialistOutput":
        if self.proposed_actions and not self.approval_required:
            raise ValueError("Proposed actions require approval")
        for action in self.proposed_actions:
            if action.mutation_status != "proposal_only":
                raise ValueError("Specialist proposed actions must remain proposal_only")
        return self


class DepartmentSpecialistSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pack_id: str
    pack_version: str = DEPARTMENT_SPECIALIST_PACK_VERSION
    specialist_id: str
    specialist_version: str
    selection_reason: str
    routing_rule_version: str = DEPARTMENT_SPECIALIST_ROUTING_RULE_VERSION
    fallback_reason: Optional[str] = None


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
    department_specialist: Optional[DepartmentSpecialistSelection] = None
    department_specialist_output: Optional[DepartmentSpecialistOutput] = None
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
        if self.department_specialist_output and self.department_specialist_output.proposed_actions and not self.approval_required:
            raise ValueError("Specialist proposed actions require Project Agent approval")
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
    now = aware_utc_now()
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
    now = aware_utc_now()
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


DEPARTMENT_PACKS: dict[str, dict[str, object]] = {
    "digital_marketing": {"department_types": ["marketing"], "project_types": ["marketing", "business", "other"]},
    "software_technology": {"department_types": ["generic"], "project_types": ["software"]},
    "sales": {"department_types": ["sales"], "project_types": ["business", "other"]},
    "human_resources": {"department_types": ["hr"], "project_types": ["business", "operations", "other"]},
    "operations": {"department_types": ["operations"], "project_types": ["operations", "business", "other"]},
    "finance": {"department_types": ["finance"], "project_types": ["business", "operations", "other"]},
    "support": {"department_types": ["support"], "project_types": ["business", "operations", "other"]},
}


DEPARTMENT_SPECIALIST_SPECS: dict[DepartmentSpecialistId, dict[str, object]] = {
    DepartmentSpecialistId.CONTENT_SEO: {
        "pack_id": "digital_marketing",
        "categories": ["content", "copy", "blog", "landing_page", "keyword_brief", "on_page_seo", "content_review", "content_optimization"],
        "objective": "Review content and SEO task briefs, acceptance criteria, channel constraints, approved claims, risks, and missing inputs.",
    },
    DepartmentSpecialistId.CAMPAIGN_EXECUTION_ANALYTICS: {
        "pack_id": "digital_marketing",
        "categories": ["campaign_setup", "paid_media", "social_campaign", "tracking", "analytics_readiness", "campaign_qa", "reporting_preparation", "optimization_review"],
        "objective": "Review campaign execution readiness, tracking, KPI prerequisites, dependencies, reporting evidence, and campaign delivery risks.",
    },
    DepartmentSpecialistId.SOFTWARE_IMPLEMENTATION: {
        "pack_id": "software_technology",
        "categories": ["frontend", "backend", "api", "database", "integration", "bug_fix", "refactor", "technical_research", "code_review"],
        "objective": "Guide software task implementation, decomposition, dependencies, migration, rollback, compatibility, and missing technical context.",
    },
    DepartmentSpecialistId.QA_RELEASE: {
        "pack_id": "software_technology",
        "categories": ["qa", "testing", "regression", "defect_verification", "release", "deployment_review", "security_check", "performance_check"],
        "objective": "Review test scope, release readiness, edge cases, failure paths, security/performance checks, and rollback evidence.",
    },
    DepartmentSpecialistId.LEAD_RESEARCH_QUALIFICATION: {
        "pack_id": "sales",
        "categories": ["lead_research", "crm_data_completion", "qualification_review", "discovery_preparation", "sales_meeting_preparation"],
        "objective": "Plan lead research and qualification evidence checks without canonical lead scoring or CRM mutation.",
    },
    DepartmentSpecialistId.PROPOSAL_FOLLOW_UP: {
        "pack_id": "sales",
        "categories": ["proposal", "follow_up", "discovery_next_steps", "negotiation_preparation", "sales_handoff", "approval_request"],
        "objective": "Review proposal completeness, follow-up plans, next steps, handoffs, objections, and approval requirements.",
    },
    DepartmentSpecialistId.RECRUITMENT_INTERVIEW: {
        "pack_id": "human_resources",
        "categories": ["job_requirement", "candidate_process", "interview_preparation", "evaluation_rubric", "recruitment_workflow"],
        "objective": "Plan recruitment tasks, interview structure, job-related questions, rubrics, dependencies, and compliance warnings.",
    },
    DepartmentSpecialistId.ONBOARDING_WORKFLOW: {
        "pack_id": "human_resources",
        "categories": ["onboarding", "orientation", "training_plan", "documentation", "access_checklist", "probation_process_preparation"],
        "objective": "Guide onboarding checklist, documentation, training, access-request sequencing, orientation, owners, and evidence.",
    },
    DepartmentSpecialistId.PROCESS_DEPENDENCY: {
        "pack_id": "operations",
        "categories": ["process", "sop", "dependency", "handoff", "bottleneck", "workflow_review", "operational_control"],
        "objective": "Review process tasks, SOP checklists, handoffs, dependencies, sequencing, control points, and acceptance criteria.",
    },
    DepartmentSpecialistId.CAPACITY_RESOURCE: {
        "pack_id": "operations",
        "categories": ["capacity", "resource_planning", "workload", "scheduling", "coverage", "queue_balancing", "cross_team_dependency"],
        "objective": "Review workload, capacity, coverage, queues, skills, dependency risks, missing data, and proposal-only balancing options.",
    },
    DepartmentSpecialistId.BUDGET_COST_REVIEW: {
        "pack_id": "finance",
        "categories": ["budget", "cost_estimate", "vendor_cost", "expense_review", "variance_review", "financial_approval_preparation"],
        "objective": "Review budget and cost completeness, estimates, variance, approvals, missing evidence, and cost-risk clarification.",
    },
    DepartmentSpecialistId.BILLING_INVOICE_REVIEW: {
        "pack_id": "finance",
        "categories": ["billing", "invoice_review", "payment_reconciliation", "tax_document_check", "receivables", "billing_dispute_preparation"],
        "objective": "Review billing and invoice completeness, line-item evidence, payment references, anomalies, and proposal-only corrections.",
    },
    DepartmentSpecialistId.TICKET_TRIAGE_RESOLUTION: {
        "pack_id": "support",
        "categories": ["support_ticket", "incident", "troubleshooting", "resolution", "reproduction", "knowledge_lookup"],
        "objective": "Guide support triage, severity/category evidence, reproduction, troubleshooting, resolution readiness, and SLA risk.",
    },
    DepartmentSpecialistId.ESCALATION_KNOWLEDGE: {
        "pack_id": "support",
        "categories": ["escalation", "sla_risk", "root_cause_preparation", "handoff", "knowledge_gap", "knowledge_article_preparation"],
        "objective": "Review escalation readiness, evidence, ownership, impact, communication checklist, root-cause preparation, and knowledge gaps.",
    },
}


DEPARTMENT_SPECIALIST_FORBIDDEN_ACTIONS = SPECIALIST_FORBIDDEN_ACTIONS + [
    "publish_content",
    "launch_campaign",
    "change_ad_spend",
    "send_email",
    "send_whatsapp",
    "change_crm_stage",
    "score_lead",
    "rank_candidate",
    "reject_candidate",
    "grant_access",
    "assign_user",
    "change_deadline",
    "change_budget",
    "approve_invoice",
    "pay_invoice",
    "close_ticket",
    "deploy_code",
    "run_command",
]


def department_specialist_definitions(created_by: str = "system") -> list[SpecialistDefinition]:
    now = aware_utc_now()
    definitions: list[SpecialistDefinition] = []
    for specialist_id, spec in DEPARTMENT_SPECIALIST_SPECS.items():
        pack = DEPARTMENT_PACKS[str(spec["pack_id"])]
        definitions.append(
            SpecialistDefinition.model_construct(
                specialist_id=specialist_id.value,
                version=DEPARTMENT_SPECIALIST_VERSION,
                supported_agent_ids=[PROJECT_AGENT_ID],
                supported_task_categories=list(spec["categories"]),
                department_types=list(pack["department_types"]),
                project_types=list(pack["project_types"]),
                applicable_industries=["generic"],
                objective=str(spec["objective"]),
                required_context=["project", "task", "department", "authorized_documents", "domain_records_minimized"],
                retrieval_profile={"profile_id": PROJECT_AGENT_RETRIEVAL_PROFILE_ID, "version": PROJECT_AGENT_RETRIEVAL_PROFILE_VERSION},
                allowed_tools=[],
                forbidden_actions=DEPARTMENT_SPECIALIST_FORBIDDEN_ACTIONS,
                input_schema_version=DEPARTMENT_SPECIALIST_INPUT_SCHEMA_VERSION,
                output_schema_version=DEPARTMENT_SPECIALIST_OUTPUT_SCHEMA_VERSION,
                prompt_version=f"{specialist_id.value}-v1",
                provider_policy={"policy_id": PROJECT_AGENT_PROVIDER_POLICY_ID, "read_only": True, "proposal_only": True},
                evidence_requirements={"record_references_required": True, "minimize_sensitive_domain_records": True, "no_unverified_metrics": True},
                evaluation_set_version=DEPARTMENT_SPECIALIST_EVALUATION_SET_VERSION,
                maximum_fan_out=1,
                budget={"max_tool_calls": 0, "max_tokens": 1200},
                enabled=False,
                evaluated=False,
                published=False,
                created_at=now,
                created_by=created_by,
                retired_at=None,
            )
        )
    return definitions


class DepartmentSpecialistSelector:
    def select(
        self,
        *,
        department_type: Optional[str],
        project_type: Optional[str],
        task_category: Optional[str],
        specialists: list[SpecialistDefinition],
        generic_specialists: list[SpecialistDefinition] | None = None,
        operation: ProjectAgentOperation = ProjectAgentOperation.EXECUTION_GUIDANCE,
        require_enabled: bool = True,
        require_evaluated: bool = True,
    ) -> DepartmentSpecialistSelection | SpecialistSelectionResult:
        normalized_department = self._normalize(department_type)
        normalized_project = self._normalize(project_type)
        normalized_category = self._normalize(task_category)
        if not normalized_category:
            return self._generic_fallback(generic_specialists or [], operation, "missing_task_category", require_enabled, require_evaluated)
        matching = [
            specialist
            for specialist in specialists
            if normalized_category in specialist.supported_task_categories
            and PROJECT_AGENT_ID in specialist.supported_agent_ids
            and self._matches_authoritative_scope(specialist, normalized_department, normalized_project)
        ]
        if len(matching) > 1:
            raise ValueError("Conflicting department specialist routing data")
        if not matching:
            return self._generic_fallback(generic_specialists or [], operation, "no_department_specialist_match", require_enabled, require_evaluated)
        specialist = matching[0]
        if require_enabled and not specialist.enabled:
            return self._generic_fallback(generic_specialists or [], operation, "department_specialist_disabled", require_enabled, require_evaluated)
        if require_evaluated and (not specialist.evaluated or not specialist.published or specialist.retired_at is not None):
            return self._generic_fallback(generic_specialists or [], operation, "department_specialist_not_release_ready", require_enabled, require_evaluated)
        pack_id = str(DEPARTMENT_SPECIALIST_SPECS[DepartmentSpecialistId(specialist.specialist_id)]["pack_id"])
        return DepartmentSpecialistSelection(
            pack_id=pack_id,
            specialist_id=specialist.specialist_id,
            specialist_version=specialist.version,
            selection_reason=f"Exact server-resolved category match: {normalized_category}",
        )

    def _matches_authoritative_scope(self, specialist: SpecialistDefinition, department_type: Optional[str], project_type: Optional[str]) -> bool:
        departments = set(specialist.department_types or [])
        projects = set(specialist.project_types or [])
        if department_type and department_type in departments:
            return True
        if project_type == "software" and "software" in projects:
            return True
        if not department_type and project_type and project_type in projects:
            return True
        return False

    def _generic_fallback(
        self,
        generic_specialists: list[SpecialistDefinition],
        operation: ProjectAgentOperation,
        reason: str,
        require_enabled: bool,
        require_evaluated: bool,
    ) -> SpecialistSelectionResult:
        result = ProjectSpecialistSelector().select(operation, generic_specialists, max_specialists=1, require_enabled=require_enabled, require_evaluated=require_evaluated)
        if result.selected:
            result.selected[0].reason = f"Generic fallback: {reason}"
        return result

    def _normalize(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        return str(value).strip().lower().replace("-", "_").replace(" ", "_")


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
    now = aware_utc_now()
    return ProjectAgentOutput(
        project_id=project_id,
        operation=operation,
        context_timestamp=now,
        summary="Project guidance placeholder.",
        overall_confidence=0.0,
        expires_at=now + timedelta(minutes=30),
    )
