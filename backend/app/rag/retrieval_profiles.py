from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class RetrievalProfile(BaseModel):
    profile_id: str
    profile_version: str = "v1"
    objective: str
    allowed_source_types: list[str]
    allowed_structured_domains: list[str]
    forbidden_source_types: list[str] = Field(default_factory=list)
    scope_requirements: list[str] = Field(default_factory=list)
    mandatory_policies: list[str] = Field(default_factory=list)
    confidentiality_ceiling: str = "internal"
    dense_limit: int = 20
    sparse_limit: int = 20
    fusion_policy_version: str = "rrf-v1"
    reranking_policy_version: str = "policy-rerank-v1"
    minimum_evidence_threshold: float = 0.2
    token_budget: int = 6000
    rewriting_enabled: bool = True
    decomposition_enabled: bool = True
    freshness_required: bool = False
    requires_citations: bool = True
    approval_required_for_actions: bool = True
    enabled: bool = True

    @field_validator("scope_requirements")
    @classmethod
    def reject_broad_project_profile(cls, value: list[str], info):
        if info.data.get("profile_id") == "project_planning" and "project_id" not in value:
            raise ValueError("Project profile requires selected project scope")
        return value


DEFAULT_RETRIEVAL_PROFILES: dict[str, RetrievalProfile] = {
    "project_planning": RetrievalProfile(
        profile_id="project_planning",
        objective="Project planning and delivery policy retrieval",
        allowed_source_types=["project_doc", "delivery_policy", "meeting_note"],
        allowed_structured_domains=["project", "task", "meeting", "user"],
        forbidden_source_types=["protected_hr", "payroll", "finance"],
        scope_requirements=["tenant_id", "project_id"],
        mandatory_policies=["delivery_policy"],
        freshness_required=True,
    ),
    "sales": RetrievalProfile(
        profile_id="sales",
        objective="Sales CRM and approved sales knowledge retrieval",
        allowed_source_types=["sales_policy", "crm_note", "proposal"],
        allowed_structured_domains=["lead", "contact", "company", "user"],
        forbidden_source_types=["protected_hr", "payroll"],
        scope_requirements=["tenant_id"],
    ),
    "hr_recruitment": RetrievalProfile(
        profile_id="hr_recruitment",
        objective="Recruitment retrieval excluding protected characteristics",
        allowed_source_types=["recruitment_policy", "job_description"],
        allowed_structured_domains=[],
        forbidden_source_types=["protected_characteristics", "attendance", "payroll"],
        scope_requirements=["tenant_id", "department_id"],
        confidentiality_ceiling="restricted",
    ),
    "marketing": RetrievalProfile(
        profile_id="marketing",
        objective="Digital marketing and content retrieval",
        allowed_source_types=["brand_guideline", "content_policy", "campaign_brief"],
        allowed_structured_domains=["client", "project", "user"],
        forbidden_source_types=["protected_hr", "payroll", "finance"],
        scope_requirements=["tenant_id", "client_id"],
    ),
}


class RetrievalProfileRegistry:
    def __init__(self, profiles: dict[str, RetrievalProfile] | None = None) -> None:
        self.profiles = profiles or DEFAULT_RETRIEVAL_PROFILES

    def get(self, profile_id: str) -> RetrievalProfile:
        profile = self.profiles[profile_id]
        if not profile.enabled:
            raise ValueError("Retrieval profile is disabled")
        return profile
