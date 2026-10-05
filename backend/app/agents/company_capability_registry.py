"""
Company Capability Registry — single source of truth for all SynTask domains.

Every domain registered here is automatically available to the Executive Agent.
New SynTask modules are added by calling ``register_domain()``; no changes to the
Executive Agent, capability selector, or tool schemas are needed.

Design goals
------------
- CEO never manually selects an agent — the Executive Agent owns every domain.
- New modules register once; tool selection, system prompt, and capability packs
  are derived from this registry.
- Token optimization: only 2-5 relevant tools are exposed to Groq per request.
- The LLM is never the source of truth; tools fetch live SynTask data.
- HR is split into fine-grained sub-packs so a payroll query does not pull
  recruitment tools.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class DomainCapability:
    """One registered SynTask domain exposed to the Executive Agent."""

    domain_id: str
    label: str
    description: str
    tool_names: list[str]
    keyword_pattern: re.Pattern[str] | None = None
    keyword_scores: dict[str, float] = field(default_factory=dict)
    priority: int = 0  # higher = selected first when packs tie
    operations: tuple[str, ...] = ()  # applicable READ ops: LIST|SEARCH|COUNT|DETAIL|STATUS|SUMMARY|HISTORY|ANALYTICS


# ── Built-in domain registrations ──────────────────────────────────────────

_BUILTIN_DOMAINS: list[DomainCapability] = [
    # ── Company ────────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="company_overview",
        label="Company Overview",
        description="High-level company summary and daily attention brief.",
        tool_names=["get_company_summary", "get_company_attention_summary"],
        keyword_pattern=re.compile(
            r"\b(company|overall|summary|attention|health|brief|today|overview)\b", re.I
        ),
        keyword_scores={"company_overview": 3.0},
    ),
    # ── Projects ───────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="projects",
        label="Projects",
        description="Project list/search, 360 view, risks, timeline.",
        tool_names=["search_projects", "get_project_360", "get_project_risks", "list_projects", "get_project_timeline"],
        keyword_pattern=re.compile(
            r"\b(project|delivery|milestone)s?\b", re.I
        ),
        keyword_scores={"projects": 4.0, "tasks": 0.5},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY", "ANALYTICS"),
    ),
    # ── Tasks ──────────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="tasks",
        label="Tasks",
        description="Task list/search/detail, overdue tasks, user tasks, activity, workload.",
        tool_names=[
            "get_overdue_tasks",
            "get_user_tasks",
            "get_user_task_activity",
            "get_team_workload",
            "list_tasks",
            "get_task_detail",
        ],
        keyword_pattern=re.compile(
            r"\b(task|overdue|todo|in.progress|completed|blocked|workload|assignee)s?\b", re.I
        ),
        keyword_scores={"tasks": 3.5, "projects": 0.5},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY", "ANALYTICS"),
    ),
    # ── Clients ────────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="clients",
        label="Clients",
        description="Client list/search, 360 view, health, risks, timeline.",
        tool_names=[
            "search_clients",
            "get_client_360",
            "get_client_risks",
            "list_clients",
            "get_client_health_summary",
            "get_client_timeline",
        ],
        keyword_pattern=re.compile(
            r"\b(client|customer|account|relationship|at.risk|portfolio|health|timeline)s?\b", re.I
        ),
        keyword_scores={"clients": 4.0, "projects": 0.3, "finance": 0.3},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY", "ANALYTICS"),
    ),
    # ── Sales / CRM ────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="sales_crm",
        label="Sales / CRM",
        description="Sales pipeline, leads, CRM companies/contacts/deals, proposals, follow-up risks.",
        tool_names=[
            "get_sales_summary",
            "get_followup_risks",
            "get_lead_360",
            "list_leads",
            "get_lead_activity",
            "list_crm_companies",
            "list_crm_contacts",
            "list_crm_deals",
            "get_crm_deal_360",
        ],
        keyword_pattern=re.compile(
            r"\b(sales|lead|prospect|pipeline|deal|won|lost|crm|follow.up|funnel|conversion|account|company|contact)s?\b",
            re.I,
        ),
        keyword_scores={"sales_crm": 4.0},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY", "ANALYTICS"),
    ),
    # ── Finance ────────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="finance",
        label="Finance",
        description="Finance summary, invoice list/detail, overdue invoices, receivables.",
        tool_names=["get_finance_summary", "get_overdue_invoices", "list_invoices", "get_invoice_detail"],
        keyword_pattern=re.compile(
            r"\b(invoice|finance|revenue|outstanding|receivable|payment|billing|money|overdue)s?\b",
            re.I,
        ),
        keyword_scores={"finance": 4.0},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY", "ANALYTICS"),
    ),
    # ── Meetings ───────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="meetings",
        label="Meetings",
        description="Meeting list/detail, summary, pending follow-ups.",
        tool_names=["get_meeting_summary", "get_pending_meeting_followups", "list_meetings", "get_meeting_detail"],
        keyword_pattern=re.compile(
            r"\b(meeting|calendar|schedule|upcoming|conference|call|agenda)s?\b", re.I
        ),
        keyword_scores={"meetings": 4.0},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY"),
    ),
    # ── Documents ──────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="documents",
        label="Documents",
        description="Entity + company-wide document register (employees, clients).",
        tool_names=["get_entity_documents", "get_company_documents"],
        keyword_pattern=re.compile(
            r"\b(document|file|attachment|upload|handbook|policy|expiry|compliance)\b", re.I
        ),
        keyword_scores={"documents": 3.0, "hr_documents": 1.0},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "HISTORY"),
    ),
    # ── People & HR: Core (employee search + 360 + attention) ──────────────
    DomainCapability(
        domain_id="hr_employees",
        label="HR: Employees",
        description="Employee directory/search, 360 view, HR attention summary.",
        tool_names=[
            "search_employees",
            "get_employee_360",
            "get_hr_attention_summary",
            "list_employees",
        ],
        keyword_pattern=re.compile(
            r"\b(employee|team|hr|people|staff|person|member|absent|onboarding|probation)s?\b",
            re.I,
        ),
        keyword_scores={"hr_employees": 4.0},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY", "ANALYTICS"),
    ),
    # ── HR: Attendance & Leave ─────────────────────────────────────────────
    DomainCapability(
        domain_id="hr_attendance_leave",
        label="HR: Attendance & Leave",
        description="Attendance roster, per-employee records, company leave requests and balances.",
        tool_names=[
            "get_employee_attendance",
            "get_employee_leave",
            "get_attendance_roster",
            "list_leave_requests",
        ],
        keyword_pattern=re.compile(
            r"\b(attendance|leave|absent|check.in|check.out|time.off|leave.balance|leave.request)s?\b",
            re.I,
        ),
        keyword_scores={"hr_attendance_leave": 5.0, "hr_employees": 1.0},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY", "ANALYTICS"),
    ),
    # ── HR: Salary / Payroll / Payslips ────────────────────────────────────
    DomainCapability(
        domain_id="hr_payroll",
        label="HR: Payroll & Salary",
        description="Salary structure, payroll run history/status/blockers, payslip generation.",
        tool_names=[
            "get_employee_salary",
            "get_payroll_status",
            "get_payroll_blockers",
            "get_employee_payslip_status",
            "get_payroll_history",
        ],
        keyword_pattern=re.compile(
            r"\b(payroll|payslip|salary|compensation|ctc|take.home|pay slip|pay slip)s?\b",
            re.I,
        ),
        keyword_scores={"hr_payroll": 5.0, "hr_employees": 1.0},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY", "ANALYTICS"),
    ),
    # ── HR: Recruitment ────────────────────────────────────────────────────
    DomainCapability(
        domain_id="hr_recruitment",
        label="HR: Recruitment",
        description="Candidate/job lists, search, 360 views, interviews, offers, pipeline.",
        tool_names=[
            "search_candidates",
            "get_candidate_360",
            "search_jobs",
            "get_job_360",
            "get_recruitment_overview",
            "get_interviews",
            "get_interview_feedback_status",
            "get_offer_status",
            "list_candidates",
            "list_jobs",
        ],
        keyword_pattern=re.compile(
            r"\b(candidate|recruit|job.opening|jobs?|interview|offer|hiring|resume|sourcing|pipeline|feedback|jd|job.description)s?\b",
            re.I,
        ),
        keyword_scores={"hr_recruitment": 5.0, "hr_employees": 0.5},
        operations=("LIST", "SEARCH", "COUNT", "DETAIL", "STATUS", "SUMMARY", "HISTORY", "ANALYTICS"),
    ),
    # ── HR: Documents ──────────────────────────────────────────────────────
    DomainCapability(
        domain_id="hr_documents",
        label="HR: Employee Documents",
        description="HR documents, compliance status, expiring documents.",
        tool_names=[
            "get_employee_documents",
        ],
        keyword_pattern=re.compile(
            r"\b(hr.document|employee.document|compliance|expiring.document)\b", re.I
        ),
        keyword_scores={"hr_documents": 4.0, "hr_employees": 1.0},
        operations=("LIST", "COUNT", "DETAIL", "STATUS", "HISTORY"),
    ),
    # ── Cross-domain risk / investigation ──────────────────────────────────
    DomainCapability(
        domain_id="cross_domain",
        label="Cross-Domain Investigation",
        description="Why/how/risk patterns that span multiple domains.",
        tool_names=[],  # no dedicated tools; boosts other packs
        keyword_pattern=re.compile(
            r"\b(why|how|compare|risk|problem|issue|delayed|blocked|cause|reason)\b", re.I
        ),
        keyword_scores={
            "company_overview": 1.0,
            "tasks": 0.5,
            "projects": 0.5,
            "clients": 0.5,
            "sales_crm": 0.3,
        },
    ),
    # ── Sprints / Epics / Backlog ───────────────────────────────────────────
    DomainCapability(
        domain_id="sprints_epics",
        label="Sprints & Epics",
        description="Sprint and epic lists with progress and task counts.",
        tool_names=["list_sprints", "list_epics"],
        keyword_pattern=re.compile(
            r"\b(sprint|epic|backlog|iteration|milestone)\b", re.I
        ),
        keyword_scores={"sprints_epics": 5.0, "projects": 1.0, "tasks": 0.5},
        operations=("LIST", "SEARCH", "COUNT", "STATUS", "SUMMARY", "HISTORY"),
    ),
    # ── Organization / Departments ──────────────────────────────────────────
    DomainCapability(
        domain_id="organization",
        label="Organization",
        description="Org structure: departments, managers, headcount.",
        tool_names=["get_org_summary"],
        keyword_pattern=re.compile(
            r"\b(org|organization|department|headcount|reporting|structure|hierarchy)\b", re.I
        ),
        keyword_scores={"organization": 5.0, "hr_employees": 1.0},
        operations=("SUMMARY", "COUNT", "ANALYTICS"),
    ),
    # ── Time: Timesheets / Time tracking ────────────────────────────────────
    DomainCapability(
        domain_id="time_management",
        label="Time: Timesheets & Time tracking",
        description="Team timesheet and tracked time-log hours.",
        tool_names=["get_timesheet_summary", "get_time_log_summary"],
        keyword_pattern=re.compile(
            r"\b(timesheet|time.sheet|time.log|time.tracking|log.?hours|tracked\s*hours|billable)\b", re.I
        ),
        keyword_scores={"time_management": 5.0, "tasks": 0.3},
        operations=("LIST", "COUNT", "SUMMARY", "ANALYTICS", "HISTORY"),
    ),
    # ── EOD reports ─────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="eod",
        label="EOD Reports",
        description="End-of-day report coverage by date.",
        tool_names=["get_eod_summary"],
        keyword_pattern=re.compile(
            r"\b(eod|end.of.day|daily report|missed report|status report)\b", re.I
        ),
        keyword_scores={"eod": 5.0, "hr_employees": 0.5},
        operations=("LIST", "COUNT", "SUMMARY", "STATUS", "HISTORY"),
    ),
    # ── Client delivery: deliverables & onboarding ──────────────────────────
    DomainCapability(
        domain_id="client_delivery",
        label="Client Deliverables & Onboarding",
        description="Client deliverables (status/approval) and onboarding progress.",
        tool_names=["get_client_deliverables", "get_client_onboarding"],
        keyword_pattern=re.compile(
            r"\b(deliverable|onboarding|kickoff|approval|activation)\b", re.I
        ),
        keyword_scores={"client_delivery": 5.0, "clients": 1.0},
        operations=("LIST", "COUNT", "DETAIL", "STATUS", "SUMMARY"),
    ),
    # ── Tickets ─────────────────────────────────────────────────────────────
    DomainCapability(
        domain_id="support_tickets",
        label="Support Tickets",
        description="Ticket list with status/priority and escalation view.",
        tool_names=["list_tickets"],
        keyword_pattern=re.compile(
            r"\b(ticket|support|escalat|bug|defect)\b", re.I
        ),
        keyword_scores={"support_tickets": 4.0},
        operations=("LIST", "SEARCH", "COUNT", "STATUS", "SUMMARY", "HISTORY"),
    ),
    # ── Content calendar ────────────────────────────────────────────────────
    DomainCapability(
        domain_id="content_ops",
        label="Content Calendar",
        description="Content calendar items with due/publish dates.",
        tool_names=["list_content_items"],
        keyword_pattern=re.compile(
            r"\b(content|calendar|publish|shoot|social.post|campaign)\b", re.I
        ),
        keyword_scores={"content_ops": 4.0},
        operations=("LIST", "SEARCH", "COUNT", "STATUS", "SUMMARY"),
    ),
    # ── Knowledge base ──────────────────────────────────────────────────────
    DomainCapability(
        domain_id="knowledge",
        label="Knowledge Base",
        description="Knowledge records with search.",
        tool_names=["list_knowledge"],
        keyword_pattern=re.compile(
            r"\b(knowledge|wiki|handbook|insight|learnings)\b", re.I
        ),
        keyword_scores={"knowledge": 4.0},
        operations=("LIST", "SEARCH", "COUNT", "SUMMARY"),
    ),
]

# ── Runtime registry ───────────────────────────────────────────────────────

_domains: list[DomainCapability] = list(_BUILTIN_DOMAINS)
_domain_index: dict[str, DomainCapability] = {d.domain_id: d for d in _domains}


def register_domain(domain: DomainCapability) -> None:
    """Register a new SynTask domain or override an existing one.

    Calling this with a new ``domain_id`` makes the Executive Agent immediately
    aware of the new module's tools for dynamic selection.
    """
    _domains.append(domain)
    _domain_index[domain.domain_id] = domain


def get_all_domains() -> list[DomainCapability]:
    """Return all registered domains (read-only copy)."""
    return list(_domains)


def get_domain(domain_id: str) -> DomainCapability | None:
    """Look up a single domain by id."""
    return _domain_index.get(domain_id)


def get_all_tool_names() -> set[str]:
    """Union of every registered tool name across all domains."""
    names: set[str] = set()
    for d in _domains:
        names.update(d.tool_names)
    return names
