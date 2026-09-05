from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.agents.email_draft import EMAIL_DRAFT_AGENT_ID
from app.agents.project_agent import PROJECT_AGENT_ID
from app.agents.task_performance import TASK_PERFORMANCE_AGENT_ID


HR_AGENT_ID = "hr_operations_agent"
EXECUTIVE_AGENT_ID = "executive_operations_agent"


GENERAL_ASSISTANT_CAPABILITY = "general_personal_assistant"
SAFE_READ_TOOLS = ["current_user_summary", "authorized_workspace_summary", "approved_rag_lookup"]
PROHIBITED_OPERATIONS = [
    "send_email",
    "schedule_email",
    "create_task",
    "update_task",
    "assign_task",
    "delete_record",
    "change_crm_stage",
    "rank_employees",
    "employment_decision",
    "salary_or_discipline_decision",
]


@dataclass(frozen=True)
class RoleCapabilityPack:
    role: str
    accessible_agents: list[str]
    default_context_scope: str
    allowed_read_tools: list[str] = field(default_factory=list)
    proposal_only_actions: list[str] = field(default_factory=list)
    forbidden_operations: list[str] = field(default_factory=list)
    approval_requirements: list[str] = field(default_factory=list)
    sensitive_data_restrictions: list[str] = field(default_factory=list)
    default_response_behavior: dict[str, Any] = field(default_factory=dict)

    def model_context(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "accessible_agents": self.accessible_agents,
            "default_context_scope": self.default_context_scope,
            "allowed_read_tools": self.allowed_read_tools,
            "proposal_only_actions": self.proposal_only_actions,
            "forbidden_operations": self.forbidden_operations,
            "approval_requirements": self.approval_requirements,
            "sensitive_data_restrictions": self.sensitive_data_restrictions,
            "default_response_behavior": self.default_response_behavior,
            "authority": "server_role_capability_pack",
        }


def role_capability_pack(role: str, *, modules: list[str] | None = None) -> RoleCapabilityPack:
    normalized = str(role or "employee").strip().lower()
    module_set = set(modules or [])
    base_agents = [GENERAL_ASSISTANT_CAPABILITY, PROJECT_AGENT_ID, EMAIL_DRAFT_AGENT_ID]
    manager_agents = [*base_agents, TASK_PERFORMANCE_AGENT_ID]
    hr_agents = [*manager_agents, HR_AGENT_ID]
    executive_agents = [*hr_agents, EXECUTIVE_AGENT_ID]
    common = {
        "allowed_read_tools": SAFE_READ_TOOLS,
        "proposal_only_actions": ["draft_message", "propose_task_plan", "propose_follow_up"],
        "forbidden_operations": PROHIBITED_OPERATIONS,
        "approval_requirements": ["all_business_mutations", "external_communication", "sensitive_context_use"],
        "sensitive_data_restrictions": ["secrets", "credentials", "payroll", "protected_hr", "cross_tenant", "unauthorized_records"],
        "default_response_behavior": {"detail_level": "standard", "tone": "professional", "cite_sources": True},
    }
    if normalized == "employee":
        return RoleCapabilityPack(
            role="employee",
            accessible_agents=base_agents,
            # Employees do not get executive-level access
            default_context_scope="own_work_and_authorized_projects",
            **common,
        )
    if normalized == "lead":
        return RoleCapabilityPack(
            role="lead",
            accessible_agents=hr_agents,
            # Leads get HR but not executive-level access
            default_context_scope="own_work_direct_reports_and_authorized_projects",
            **common,
        )
    if normalized == "manager":
        return RoleCapabilityPack(
            role="manager",
            accessible_agents=executive_agents,
            default_context_scope="department_hierarchy_and_authorized_projects",
            **common,
        )
    if normalized == "admin":
        return RoleCapabilityPack(
            role="admin",
            accessible_agents=executive_agents,
            default_context_scope="tenant_administration_and_authorized_records",
            **common,
        )
    if normalized == "super_admin":
        return RoleCapabilityPack(
            role="super_admin",
            accessible_agents=executive_agents,
            default_context_scope="platform_admin_with_explicit_tenant_scope_required",
            **common,
        )
    if "sales_crm" in module_set:
        return RoleCapabilityPack(
            role=normalized,
            accessible_agents=base_agents,
            default_context_scope="authorized_sales_records",
            **common,
        )
    if "recruitment" in module_set:
        return RoleCapabilityPack(
            role=normalized,
            accessible_agents=base_agents,
            default_context_scope="authorized_hr_recruitment_records",
            **common,
        )
    return RoleCapabilityPack(
        role=normalized,
        accessible_agents=base_agents,
        default_context_scope="own_work_and_authorized_records",
        **common,
    )
