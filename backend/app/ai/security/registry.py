"""
Policy definitions for every AI-callable business capability.

This is the single source of truth for AI tool governance metadata.
Each policy maps to an existing tool in HR/Executive/FAST_FACT systems.

CRITICAL: If a tool exists in TOOL_DISPATCH but has NO policy here,
          it MUST be denied (fail closed).
"""
from __future__ import annotations

from app.ai.security.policy import (
    CapabilityPolicy,
    RiskLevel,
    SensitiveDataClass,
    policy_registry,
)

# Agent IDs (from existing codebase)
HR_AGENT = "hr_operations"
EXECUTIVE_AGENT = "executive_operations"
# FAST_FACT tools are accessible via the executive agent path
FAST_FACT_AGENT = "fast_fact"

# ---------------------------------------------------------------------------
# HR Tool Policies
# ---------------------------------------------------------------------------

_HR_TOOL_POLICIES = [
    CapabilityPolicy(
        tool_id="search_employees",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("employee_management.view",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_employee_360",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("employee_management.view",),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.EMPLOYEE_PII,),
    ),
    CapabilityPolicy(
        tool_id="search_candidates",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view", "recruitment.candidates.view"),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_candidate_360",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view", "recruitment.candidates.view"),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.CANDIDATE_PII,),
    ),
    CapabilityPolicy(
        tool_id="search_jobs",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view", "recruitment.jobs.view"),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_job_360",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view", "recruitment.jobs.view"),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_employee_attendance",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("attendance", "attendance_policy.view", "employee_management.view"),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.EMPLOYEE_PII,),
    ),
    CapabilityPolicy(
        tool_id="get_employee_leave",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("leave_management.view", "employee_management.view"),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.EMPLOYEE_PII,),
    ),
    CapabilityPolicy(
        tool_id="get_employee_documents",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("employee_management.view",),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.EMPLOYEE_PII,),
    ),
    CapabilityPolicy(
        tool_id="get_recruitment_overview",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_interviews",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view", "recruitment.interviews.view"),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_interview_feedback_status",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view", "recruitment.interviews.view"),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_offer_status",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view", "recruitment.offers.manage"),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_hr_attention_summary",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("employee_management.view",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_employee_salary",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("salary_management.view", "employee_management.view"),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.SALARY, SensitiveDataClass.EMPLOYEE_PII),
    ),
    CapabilityPolicy(
        tool_id="get_payroll_status",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("payroll.view", "employee_management.view"),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.PAYROLL, SensitiveDataClass.SALARY),
    ),
    CapabilityPolicy(
        tool_id="get_payroll_blockers",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("payroll.view",),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.PAYROLL,),
    ),
    CapabilityPolicy(
        tool_id="get_employee_payslip_status",
        agent_ids=(HR_AGENT, EXECUTIVE_AGENT),
        domain="hr",
        required_capabilities=("payroll.view", "employee_management.view"),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.PAYROLL, SensitiveDataClass.SALARY),
    ),
]

# ---------------------------------------------------------------------------
# Executive Tool Policies (project/task/client/sales/finance/meeting tools)
# ---------------------------------------------------------------------------

_EXECUTIVE_TOOL_POLICIES = [
    CapabilityPolicy(
        tool_id="get_company_summary",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="company",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_company_attention_summary",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="company",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="search_projects",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="projects",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_project_360",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="projects",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_project_risks",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="projects",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="list_projects",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="projects",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_project_timeline",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="projects",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_overdue_tasks",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="tasks",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_user_tasks",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="tasks",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_user_task_activity",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="tasks",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_team_workload",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="tasks",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="list_tasks",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="tasks",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_task_detail",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="tasks",
        required_modules=("tasks_projects",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="search_clients",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="clients",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_client_360",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="clients",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_client_risks",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="clients",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="list_clients",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="clients",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_client_health_summary",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="clients",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_client_timeline",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="clients",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_sales_summary",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="sales_crm",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_followup_risks",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="sales_crm",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_lead_360",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="sales_crm",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="list_leads",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="sales_crm",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_lead_activity",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="sales_crm",
        required_modules=("sales_crm",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_finance_summary",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="finance",
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.FINANCE,),
    ),
    CapabilityPolicy(
        tool_id="get_overdue_invoices",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="finance",
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.FINANCE,),
    ),
    CapabilityPolicy(
        tool_id="list_invoices",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="finance",
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.FINANCE,),
    ),
    CapabilityPolicy(
        tool_id="get_invoice_detail",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="finance",
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.FINANCE,),
    ),
    CapabilityPolicy(
        tool_id="get_meeting_summary",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="meetings",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_pending_meeting_followups",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="meetings",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="list_meetings",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="meetings",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_meeting_detail",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="meetings",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_entity_documents",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="documents",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="get_company_documents",
        agent_ids=(EXECUTIVE_AGENT,),
        domain="documents",
        risk_level=RiskLevel.READ,
    ),
]

# ---------------------------------------------------------------------------
# FAST_FACT Handler Policies
# ---------------------------------------------------------------------------
# FAST_FACT handlers don't have their own tool schemas but must have
# governance metadata. They map to existing domain capabilities.

_FAST_FACT_POLICIES = [
    CapabilityPolicy(
        tool_id="fast_fact:employee_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="hr",
        required_capabilities=("employee_management.view",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:employee_names",
        agent_ids=(FAST_FACT_AGENT,),
        domain="hr",
        required_capabilities=("employee_management.view",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:task_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="tasks",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:pending_task_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="tasks",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:overdue_task_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="tasks",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:completed_today_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="tasks",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:project_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="projects",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:client_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="clients",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:sales_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="sales_crm",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:invoice_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="finance",
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.FINANCE,),
    ),
    CapabilityPolicy(
        tool_id="fast_fact:recruitment_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:absent_today_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="hr",
        required_capabilities=("employee_management.view", "attendance"),
        risk_level=RiskLevel.SENSITIVE_READ,
        sensitive_data_classes=(SensitiveDataClass.EMPLOYEE_PII,),
    ),
    CapabilityPolicy(
        tool_id="fast_fact:pending_leave_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="hr",
        required_capabilities=("leave_management.view",),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:open_jobs_count",
        agent_ids=(FAST_FACT_AGENT,),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view", "recruitment.jobs.view"),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:client_names",
        agent_ids=(FAST_FACT_AGENT,),
        domain="clients",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:open_task_list",
        agent_ids=(FAST_FACT_AGENT,),
        domain="tasks",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:today_meetings",
        agent_ids=(FAST_FACT_AGENT,),
        domain="meetings",
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:open_jobs_list",
        agent_ids=(FAST_FACT_AGENT,),
        domain="hr_recruitment",
        required_capabilities=("recruitment.view", "recruitment.jobs.view"),
        risk_level=RiskLevel.READ,
    ),
    CapabilityPolicy(
        tool_id="fast_fact:pending_leave_names",
        agent_ids=(FAST_FACT_AGENT,),
        domain="hr",
        required_capabilities=("leave_management.view",),
        risk_level=RiskLevel.READ,
    ),
]


def register_all_policies() -> None:
    """Register all capability policies in the global registry.

    Called once at module import / application startup.
    """
    for policy in _HR_TOOL_POLICIES:
        policy_registry.register(policy)
    for policy in _EXECUTIVE_TOOL_POLICIES:
        policy_registry.register(policy)
    for policy in _FAST_FACT_POLICIES:
        policy_registry.register(policy)


# Auto-register on import
register_all_policies()
