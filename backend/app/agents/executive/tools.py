"""
Executive Operations Agent — Domain Tools.

All tools call existing SynTask services/models. The LLM never has direct
database access; every tool argument is validated before execution.

Covers: Company, Projects, Tasks, Clients, Sales, Finance, Meetings, HR.
Cross-domain reasoning is enabled by giving the LLM access to all domains
simultaneously — it decides which tools to call based on the investigation.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.core.clock import utc_now

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tool argument schemas (Pydantic — validated before execution)
# ---------------------------------------------------------------------------

class GetCompanySummaryArgs(BaseModel):
    pass


class GetCompanyAttentionSummaryArgs(BaseModel):
    pass


class SearchProjectsArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=200, description="Project name, key, or id")
    limit: int = Field(default=10, ge=1, le=30)
    status: Optional[str] = Field(default=None, description="Filter by status: active, on_hold, completed, etc.")


class GetProject360Args(BaseModel):
    project_id: str = Field(..., min_length=1, description="Project _id or project_id (e.g. PROJ-001)")


class GetOverdueTasksArgs(BaseModel):
    project_id: Optional[str] = Field(default=None, description="Optional project filter")
    limit: int = Field(default=20, ge=1, le=50)


class GetUserTasksArgs(BaseModel):
    user_id: str = Field(..., min_length=1, description="User ID or employee identifier")
    status: Optional[str] = Field(default=None, description="Filter: todo, in_progress, in_review, completed")
    limit: int = Field(default=20, ge=1, le=50)


class GetUserTaskActivityArgs(BaseModel):
    user_id: str = Field(..., min_length=1, description="User ID")
    date_str: Optional[str] = Field(default=None, description="YYYY-MM-DD, defaults to today")


class GetTeamWorkloadArgs(BaseModel):
    project_id: Optional[str] = Field(default=None, description="Optional project filter")
    limit: int = Field(default=20, ge=1, le=50)


class GetProjectRisksArgs(BaseModel):
    project_id: str = Field(..., min_length=1, description="Project _id or project_id")


class SearchClientsArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=200, description="Client name, email, or company")
    limit: int = Field(default=10, ge=1, le=30)


class GetClient360Args(BaseModel):
    client_id: str = Field(..., min_length=1, description="Client _id")


class GetClientRisksArgs(BaseModel):
    client_id: str = Field(..., min_length=1, description="Client _id")


class GetSalesSummaryArgs(BaseModel):
    days: int = Field(default=30, ge=1, le=90)


class GetFollowupRisksArgs(BaseModel):
    days: int = Field(default=14, ge=1, le=60)
    limit: int = Field(default=20, ge=1, le=50)


class GetLead360Args(BaseModel):
    lead_id: str = Field(..., min_length=1, description="SalesProspect _id")


class GetFinanceSummaryArgs(BaseModel):
    days: int = Field(default=30, ge=1, le=90)


class GetOverdueInvoicesArgs(BaseModel):
    limit: int = Field(default=20, ge=1, le=50)


class GetMeetingSummaryArgs(BaseModel):
    days: int = Field(default=7, ge=1, le=30)


class GetPendingMeetingFollowupsArgs(BaseModel):
    days: int = Field(default=14, ge=1, le=60)


class GetEntityDocumentsArgs(BaseModel):
    entity_type: str = Field(..., description="Type: employee or client")
    entity_id: str = Field(..., min_length=1, description="Entity _id")


# ---------------------------------------------------------------------------
# HR Specialist tool schemas — imported from HR domain, not duplicated.
# Executive owns the final response; HR tools are implementation-only.
# ---------------------------------------------------------------------------
from app.agents.hr.tools import (
    GetEmployee360Args,
    GetHrAttentionSummaryArgs,
    SearchEmployeesArgs,
    SearchCandidatesArgs,
    GetCandidate360Args,
    SearchJobsArgs,
    GetJob360Args,
    GetEmployeeAttendanceArgs,
    GetEmployeeLeaveArgs,
    GetEmployeeDocumentsArgs,
    GetRecruitmentOverviewArgs,
    GetInterviewsArgs,
    GetInterviewFeedbackStatusArgs,
    GetOfferStatusArgs,
    GetEmployeeSalaryArgs,
    GetPayrollStatusArgs,
    GetPayrollBlockersArgs,
    GetEmployeePayslipStatusArgs,
)


# ---------------------------------------------------------------------------
# Tool registry: schema + metadata
# ---------------------------------------------------------------------------

EXECUTIVE_TOOL_SCHEMAS: list[dict[str, Any]] = [
    # ── Company ────────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_company_summary",
            "description": "Get a high-level company summary: employee count, active projects, active clients, pending tasks, and sales pipeline overview.",
            "parameters": GetCompanySummaryArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_company_attention_summary",
            "description": "Get a prioritized daily attention summary across all domains: overdue tasks, project risks, client risks, sales follow-ups, HR issues, overdue invoices. Use this for 'what needs attention today' questions.",
            "parameters": GetCompanyAttentionSummaryArgs.model_json_schema(),
        },
    },
    # ── Projects ───────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "search_projects",
            "description": "Search projects by name, key, or id. Returns matching projects with status and delivery dates.",
            "parameters": SearchProjectsArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_project_360",
            "description": "Get a comprehensive project view: details, tasks by status, overdue tasks, team members, risks, and client linkage.",
            "parameters": GetProject360Args.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_project_risks",
            "description": "Analyze project risks: overdue tasks, blocked work, team workload, deadline proximity, and delivery concerns.",
            "parameters": GetProjectRisksArgs.model_json_schema(),
        },
    },
    # ── Tasks ──────────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_overdue_tasks",
            "description": "Get all overdue tasks, optionally filtered by project. Returns task details, assignees, and how many days overdue.",
            "parameters": GetOverdueTasksArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_tasks",
            "description": "Get tasks assigned to a specific user, grouped by status. Useful for workload and assignment questions.",
            "parameters": GetUserTasksArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_task_activity",
            "description": "Get task completion activity for a user on a specific date. Shows tasks completed, updated, or created that day.",
            "parameters": GetUserTaskActivityArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_team_workload",
            "description": "Get workload distribution across team members: task counts by priority and status. Optionally filter by project.",
            "parameters": GetTeamWorkloadArgs.model_json_schema(),
        },
    },
    # ── Clients ────────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "search_clients",
            "description": "Search clients by name, email, or company name.",
            "parameters": SearchClientsArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_client_360",
            "description": "Get a comprehensive client view: profile, status, linked projects, tasks, invoices, and meetings.",
            "parameters": GetClient360Args.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_client_risks",
            "description": "Analyze client risk: overdue tasks in client projects, unpaid invoices, missed meetings, project delays.",
            "parameters": GetClientRisksArgs.model_json_schema(),
        },
    },
    # ── Sales / CRM ────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_sales_summary",
            "description": "Get sales pipeline summary: lead counts by stage, won/lost counts, conversion rates for the specified period.",
            "parameters": GetSalesSummaryArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_followup_risks",
            "description": "Get leads that need follow-up attention: leads with overdue follow-ups, no scheduled follow-up, or stale in stage.",
            "parameters": GetFollowupRisksArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_lead_360",
            "description": "Get a comprehensive lead view: profile, stage, qualification status, follow-up schedule, and pipeline position.",
            "parameters": GetLead360Args.model_json_schema(),
        },
    },
    # ── Finance ────────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_finance_summary",
            "description": "Get finance summary: total invoiced, total received, outstanding, overdue count and amount for the period.",
            "parameters": GetFinanceSummaryArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_overdue_invoices",
            "description": "Get overdue invoices with client names, amounts, and how many days overdue.",
            "parameters": GetOverdueInvoicesArgs.model_json_schema(),
        },
    },
    # ── Meetings ───────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_meeting_summary",
            "description": "Get meeting summary for a period: upcoming meetings, completed meetings, and participant counts.",
            "parameters": GetMeetingSummaryArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pending_meeting_followups",
            "description": "Get meetings with pending follow-ups or decisions that haven't been acted on.",
            "parameters": GetPendingMeetingFollowupsArgs.model_json_schema(),
        },
    },
    # ── HR (delegated) ────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "search_employees",
            "description": "Search employees by name, email, or employee number within the company.",
            "parameters": SearchEmployeesArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_employee_360",
            "description": "Get a comprehensive employee view: profile, attendance, leave, documents, onboarding status.",
            "parameters": GetEmployee360Args.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_hr_attention_summary",
            "description": "Get HR attention items: absent employees, pending leaves, missing interview feedback, onboarding blockers.",
            "parameters": GetHrAttentionSummaryArgs.model_json_schema(),
        },
    },
    # ── Documents ──────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_entity_documents",
            "description": "Get documents associated with an entity (employee or client).",
            "parameters": GetEntityDocumentsArgs.model_json_schema(),
        },
    },
    # ── HR Deep: Recruitment ───────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "search_candidates",
            "description": "Search for candidates by name, email, or id. Optionally filter by job.",
            "parameters": SearchCandidatesArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_candidate_360",
            "description": "Get a comprehensive view of a candidate: profile, applications, resume, scores, interviews, feedback, offers, and timeline.",
            "parameters": GetCandidate360Args.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_jobs",
            "description": "Search for job openings by title, id, or slug.",
            "parameters": SearchJobsArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_job_360",
            "description": "Get a comprehensive view of a job opening: details, pipeline counts, candidates by stage, interviews, offers, and bottlenecks.",
            "parameters": GetJob360Args.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recruitment_overview",
            "description": "Get an overview of the recruitment pipeline: open jobs, candidate counts by stage, recent activity, and bottlenecks.",
            "parameters": GetRecruitmentOverviewArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_interviews",
            "description": "Get interviews filtered by job, candidate, or status.",
            "parameters": GetInterviewsArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_interview_feedback_status",
            "description": "Get interviews that are completed but missing interviewer feedback.",
            "parameters": GetInterviewFeedbackStatusArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_offer_status",
            "description": "Get offers filtered by candidate, job, or status.",
            "parameters": GetOfferStatusArgs.model_json_schema(),
        },
    },
    # ── HR Deep: Attendance, Leave, Salary, Payroll ────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_employee_attendance",
            "description": "Get attendance records for an employee within a date range.",
            "parameters": GetEmployeeAttendanceArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_employee_leave",
            "description": "Get leave requests and balances for an employee.",
            "parameters": GetEmployeeLeaveArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_employee_documents",
            "description": "Get HR documents (uploaded docs, compliance status) for an employee.",
            "parameters": GetEmployeeDocumentsArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_employee_salary",
            "description": "Get salary structure for an employee. Only available when payroll module exists in the branch.",
            "parameters": GetEmployeeSalaryArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_payroll_status",
            "description": "Get payroll status overview. Only available when payroll module exists.",
            "parameters": GetPayrollStatusArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_payroll_blockers",
            "description": "Get payroll blockers (missing salary structures, incomplete data). Only available when payroll module exists.",
            "parameters": GetPayrollBlockersArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_employee_payslip_status",
            "description": "Get payslip generation status for an employee. Only available when payroll module exists.",
            "parameters": GetEmployeePayslipStatusArgs.model_json_schema(),
        },
    },
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

async def _resolve_user_by_name(company_id: str, identifier: str) -> Optional[str]:
    """Resolve a user name/email/number to a user_id.

    Resolution order:
    1. Exact email match
    2. Exact first/last name match
    3. Prefix match (e.g., "gaur" → "Gaurav")
    4. Combined full-name match
    5. Partial / contains match
    6. Direct user_id lookup

    Returns None if not found or if multiple ambiguous matches exist.
    """
    from app.models.user import User

    term = identifier.strip()
    if not term:
        return None

    # 1. Exact email
    user = await User.find_one({
        "company_id": company_id,
        "email": {"$regex": f"^{term}$", "$options": "i"},
    })
    if user:
        return str(user.id)

    # 2. Exact first/last name
    users = await User.find({
        "company_id": company_id,
        "$or": [
            {"first_name": {"$regex": f"^{term}$", "$options": "i"}},
            {"last_name": {"$regex": f"^{term}$", "$options": "i"}},
        ],
    }).to_list()
    if len(users) == 1:
        return str(users[0].id)
    if len(users) > 1:
        # Multiple exact matches — ambiguous, but still return first if names differ
        return str(users[0].id)

    # 3. Prefix match ("gaur" → "Gaurav")
    users = await User.find({
        "company_id": company_id,
        "$or": [
            {"first_name": {"$regex": f"^{term}", "$options": "i"}},
            {"last_name": {"$regex": f"^{term}", "$options": "i"}},
        ],
    }).to_list()
    if len(users) == 1:
        return str(users[0].id)
    if len(users) > 1:
        # Multiple prefix matches — return first (most likely)
        return str(users[0].id)

    # 4. Combined full name match (e.g., "riya jain")
    users = await User.find({
        "company_id": company_id,
        "$or": [
            {"first_name": {"$regex": term, "$options": "i"}},
            {"last_name": {"$regex": term, "$options": "i"}},
        ],
    }).limit(3).to_list()
    if len(users) == 1:
        return str(users[0].id)
    if len(users) > 1:
        # Try to find best match by checking if the term is a substring of full name
        term_lower = term.lower()
        for u in users:
            full_name = f"{u.first_name or ''} {u.last_name or ''}".strip().lower()
            if term_lower in full_name:
                return str(u.id)
        return str(users[0].id)

    # 5. Try as user_id directly (may fail if not a valid ObjectId)
    try:
        user = await User.get(identifier)
        if user and user.company_id == company_id:
            return str(user.id)
    except Exception:
        pass

    return None


async def _get_user_display_name(company_id: str, user_id: str) -> str:
    """Get a display name for a user_id."""
    from app.models.user import User
    user = await User.get(user_id)
    if user:
        name = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return name or user.email or user_id
    return user_id


# ---------------------------------------------------------------------------
# Safe sorting helpers (handles None datetimes)
# ---------------------------------------------------------------------------

def _sort_by_date(items: list, field: str, ascending: bool = True) -> list:
    """Sort items by a datetime field, treating None as oldest (ascending) or newest (descending)."""
    def sort_key(item):
        val = item.get(field)
        if val is None:
            return datetime.min if ascending else datetime.max
        if isinstance(val, str):
            try:
                val = datetime.fromisoformat(val.replace('Z', '+00:00')).replace(tzinfo=None)
            except (ValueError, TypeError):
                return datetime.min if ascending else datetime.max
        return val
    return sorted(items, key=sort_key, reverse=not ascending)


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

async def execute_get_company_summary(company_id: str, args: GetCompanySummaryArgs) -> dict:
    """High-level company summary across all domains."""
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.project import Project, ProjectStatus
    from app.models.task import Task, TaskStatus
    from app.models.client import Client, ClientStatus
    from app.models.sales_prospect import SalesProspect, ProspectStatus
    from app.models.invoice import Invoice, InvoiceStatus
    from app.models.meeting import Meeting, MeetingStatus

    today = utc_now().date()
    today_str = today.isoformat()

    # Employees
    total_employees = await EmployeeProfile.find({
        "company_id": company_id,
        "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
    }).count()

    # Projects
    active_projects = await Project.find({
        "company_id": company_id,
        "status": {"$in": [ProjectStatus.ACTIVE.value, ProjectStatus.EXECUTION.value, ProjectStatus.REVIEW.value]},
    }).count()

    # Tasks
    total_open_tasks = await Task.find({
        "company_id": company_id,
        "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
    }).count()
    overdue_tasks = await Task.find({
        "company_id": company_id,
        "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
        "due_date": {"$lt": datetime.utcnow()},
    }).count()

    # Clients
    active_clients = await Client.find({
        "company_id": company_id,
        "status": {"$in": [ClientStatus.ACTIVE.value, ClientStatus.ONBOARDING.value]},
    }).count()
    at_risk_clients = await Client.find({
        "company_id": company_id,
        "status": ClientStatus.AT_RISK.value,
    }).count()

    # Sales
    active_leads = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.ACTIVE.value,
        "deleted": False,
    }).count()
    won_this_month = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.WON.value,
        "closed_date": {"$gte": datetime.utcnow().replace(day=1)},
        "deleted": False,
    }).count()

    # Finance
    total_outstanding = 0.0
    overdue_invoice_count = 0
    invoices = await Invoice.find({
        "company_id": company_id,
        "status": {"$in": [InvoiceStatus.SENT.value, InvoiceStatus.DRAFT.value]},
    }).to_list()
    for inv in invoices:
        total_outstanding += inv.outstanding_amount or 0.0
        if inv.due_date and inv.due_date < datetime.utcnow():
            overdue_invoice_count += 1

    # Meetings today
    meetings_today = await Meeting.find({
        "company_id": company_id,
        "meeting_date": {"$gte": datetime.combine(today, datetime.min.time()), "$lt": datetime.combine(today + timedelta(days=1), datetime.min.time())},
        "status": {"$in": [MeetingStatus.SCHEDULED.value, MeetingStatus.ONGOING.value]},
    }).count()

    return {
        "date": today_str,
        "employees": {"active": total_employees},
        "projects": {"active": active_projects},
        "tasks": {"open": total_open_tasks, "overdue": overdue_tasks},
        "clients": {"active": active_clients, "at_risk": at_risk_clients},
        "sales": {"active_leads": active_leads, "won_this_month": won_this_month},
        "finance": {"outstanding_amount": round(total_outstanding, 2), "overdue_invoices": overdue_invoice_count},
        "meetings_today": meetings_today,
    }


async def execute_get_company_attention_summary(company_id: str, args: GetCompanyAttentionSummaryArgs) -> dict:
    """Prioritized daily attention summary across all domains."""
    from app.models.task import Task, TaskStatus, TaskPriority
    from app.models.project import Project, ProjectStatus
    from app.models.client import Client, ClientStatus
    from app.models.sales_prospect import SalesProspect, ProspectStatus
    from app.models.invoice import Invoice, InvoiceStatus
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.meeting import Meeting, MeetingStatus

    today = utc_now().date()
    items: list[dict[str, Any]] = []

    # 1. Overdue tasks
    overdue_tasks = await Task.find({
        "company_id": company_id,
        "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
        "due_date": {"$ne": None, "$lt": datetime.utcnow()},
    }).to_list()
    overdue_tasks.sort(key=lambda t: t.due_date or datetime.min)

    if overdue_tasks:
        critical_overdue = sum(1 for t in overdue_tasks if t.priority in (TaskPriority.CRITICAL.value, TaskPriority.HIGH.value))
        items.append({
            "priority": "HIGH" if critical_overdue > 0 else "MEDIUM",
            "category": "tasks",
            "title": f"{len(overdue_tasks)} overdue task(s) ({critical_overdue} critical/high)",
            "detail": f"Tasks past deadline across {len(set(t.project_id for t in overdue_tasks if t.project_id))} project(s).",
            "recommended_action": "Review overdue tasks and reassign or escalate blockers.",
        })

    # 2. At-risk clients
    at_risk = await Client.find({
        "company_id": company_id,
        "status": ClientStatus.AT_RISK.value,
    }).to_list()
    if at_risk:
        items.append({
            "priority": "HIGH",
            "category": "clients",
            "title": f"{len(at_risk)} client(s) at risk",
            "detail": f"Clients flagged at risk: {', '.join(c.name for c in at_risk[:5])}",
            "recommended_action": "Investigate client health: check projects, tasks, invoices, and recent meetings.",
        })

    # 3. Sales follow-up risks
    stale_leads = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.ACTIVE.value,
        "next_follow_up_at": {"$lt": datetime.utcnow()},
        "deleted": False,
    }).count()
    no_followup = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.ACTIVE.value,
        "next_follow_up_at": None,
        "stage_entered_at": {"$lt": datetime.utcnow() - timedelta(days=3)},
        "deleted": False,
    }).count()
    if stale_leads or no_followup:
        items.append({
            "priority": "MEDIUM",
            "category": "sales",
            "title": f"{stale_leads} lead(s) with overdue follow-up, {no_followup} with no follow-up scheduled",
            "detail": "Leads may be going cold without timely engagement.",
            "recommended_action": "Review and schedule follow-ups for stale leads.",
        })

    # 4. Overdue invoices
    overdue_invoices = await Invoice.find({
        "company_id": company_id,
        "status": InvoiceStatus.SENT.value,
        "due_date": {"$lt": datetime.utcnow()},
    }).to_list()
    if overdue_invoices:
        total_overdue = sum(inv.outstanding_amount or 0.0 for inv in overdue_invoices)
        items.append({
            "priority": "HIGH" if total_overdue > 50000 else "MEDIUM",
            "category": "finance",
            "title": f"{len(overdue_invoices)} overdue invoice(s) — {total_overdue:,.0f} outstanding",
            "detail": "Invoices past due date require follow-up.",
            "recommended_action": "Review overdue invoices and initiate payment follow-up.",
        })

    # 5. HR attention
    profiles = await EmployeeProfile.find({
        "company_id": company_id,
        "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
    }).to_list()
    onboarding = [p for p in profiles if p.employment_status in (EmploymentStatus.ONBOARDING, EmploymentStatus.PROBATION)]
    if onboarding:
        items.append({
            "priority": "LOW",
            "category": "hr",
            "title": f"{len(onboarding)} employee(s) in onboarding/probation",
            "detail": "Monitor onboarding progress and probation milestones.",
            "recommended_action": "Review onboarding checklists and probation status.",
        })

    # 6. Meetings today
    meetings_today = await Meeting.find({
        "company_id": company_id,
        "meeting_date": {"$gte": datetime.combine(today, datetime.min.time()), "$lt": datetime.combine(today + timedelta(days=1), datetime.min.time())},
        "status": {"$in": [MeetingStatus.SCHEDULED.value]},
    }).to_list()
    if meetings_today:
        items.append({
            "priority": "LOW",
            "category": "meetings",
            "title": f"{len(meetings_today)} meeting(s) scheduled today",
            "detail": f"Meetings: {', '.join(m.title for m in meetings_today[:5])}",
            "recommended_action": "Review meeting agendas and prepare.",
        })

    # Sort by priority
    priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    items.sort(key=lambda x: priority_order.get(x["priority"], 3))

    return {
        "date": today.isoformat(),
        "total_items": len(items),
        "items": items,
    }


async def execute_search_projects(company_id: str, args: SearchProjectsArgs) -> dict:
    """Search projects by name, key, or id."""
    from app.models.project import Project

    term = args.query.strip()
    query: dict[str, Any] = {
        "company_id": company_id,
        "$or": [
            {"name": {"$regex": term, "$options": "i"}},
            {"key": {"$regex": term, "$options": "i"}},
            {"project_id": {"$regex": term, "$options": "i"}},
        ],
    }
    if args.status:
        query["status"] = args.status

    projects = await Project.find(query).limit(args.limit).to_list()
    return {
        "total": len(projects),
        "projects": [
            {
                "id": str(p.id),
                "name": p.name,
                "key": p.key,
                "project_id": p.project_id,
                "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                "lead_id": p.lead_id,
                "delivery_date": str(p.delivery_date) if p.delivery_date else None,
                "client_id": p.client_id,
            }
            for p in projects
        ],
    }


async def execute_get_project_360(company_id: str, args: GetProject360Args) -> dict:
    """Comprehensive project view with tasks, team, and risks."""
    from app.models.project import Project
    from app.models.task import Task, TaskStatus

    # Find project by _id or project_id
    project = await Project.get(args.project_id)
    if not project or project.company_id != company_id:
        project = await Project.find_one({
            "company_id": company_id,
            "project_id": args.project_id,
        })
    if not project:
        return {"error": "Project not found."}

    # Tasks by status
    all_tasks = await Task.find({
        "company_id": company_id,
        "project_id": project.project_id,
    }).to_list()

    status_counts: dict[str, int] = {}
    overdue: list[dict] = []
    now = datetime.utcnow()

    for task in all_tasks:
        s = task.status.value if hasattr(task.status, "value") else str(task.status)
        status_counts[s] = status_counts.get(s, 0) + 1
        if s in ("todo", "in_progress", "in_review") and task.due_date and task.due_date < now:
            overdue.append({
                "id": str(task.id),
                "title": task.title,
                "assigned_to": task.assigned_to,
                "due_date": task.due_date.isoformat(),
                "priority": task.priority.value if hasattr(task.priority, "value") else str(task.priority),
                "days_overdue": (now - task.due_date).days,
            })

    # Team members
    team_ids = list(set(
        [t.assigned_to for t in all_tasks if t.assigned_to]
        + project.team_member_ids
        + ([project.lead_id] if project.lead_id else [])
    ))
    team_names = {}
    for uid in team_ids[:20]:
        team_names[uid] = await _get_user_display_name(company_id, uid)

    # Linked client
    client_info = None
    if project.client_id:
        from app.models.client import Client
        client = await Client.get(project.client_id)
        if client:
            client_info = {"id": str(client.id), "name": client.name, "status": client.status.value if hasattr(client.status, "value") else str(client.status)}

    return {
        "project": {
            "id": str(project.id),
            "name": project.name,
            "key": project.key,
            "project_id": project.project_id,
            "status": project.status.value if hasattr(project.status, "value") else str(project.status),
            "lead_id": project.lead_id,
            "lead_name": team_names.get(project.lead_id, project.lead_id),
            "start_date": str(project.start_date) if project.start_date else None,
            "delivery_date": str(project.delivery_date) if project.delivery_date else None,
            "client_id": project.client_id,
        },
        "client": client_info,
        "tasks": {
            "total": len(all_tasks),
            "by_status": status_counts,
            "overdue_count": len(overdue),
        },
        "overdue_tasks": overdue[:10],
        "team": [{"user_id": uid, "name": team_names.get(uid, uid)} for uid in team_ids[:20]],
    }


async def execute_get_project_risks(company_id: str, args: GetProjectRisksArgs) -> dict:
    """Analyze project risks."""
    from app.models.project import Project
    from app.models.task import Task, TaskStatus, TaskPriority
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus

    # Find project
    project = await Project.get(args.project_id)
    if not project or project.company_id != company_id:
        project = await Project.find_one({
            "company_id": company_id,
            "project_id": args.project_id,
        })
    if not project:
        return {"error": "Project not found."}

    risks: list[dict[str, Any]] = []

    # Overdue tasks
    overdue = await Task.find({
        "company_id": company_id,
        "project_id": project.project_id,
        "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
        "due_date": {"$lt": datetime.utcnow()},
    }).to_list()
    if overdue:
        risks.append({
            "risk_type": "overdue_tasks",
            "severity": "high" if any(t.priority in (TaskPriority.CRITICAL.value, TaskPriority.HIGH.value) for t in overdue) else "medium",
            "count": len(overdue),
            "detail": f"{len(overdue)} task(s) are past deadline.",
        })

    # Deadline proximity
    if project.delivery_date:
        days_left = (project.delivery_date - datetime.utcnow()).days
        if days_left < 0:
            risks.append({
                "risk_type": "deadline_exceeded",
                "severity": "critical",
                "detail": f"Project delivery date was {abs(days_left)} day(s) ago.",
            })
        elif days_left <= 7:
            risks.append({
                "risk_type": "deadline_approaching",
                "severity": "high",
                "detail": f"Only {days_left} day(s) until delivery date.",
            })

    # High-priority unfinished tasks
    high_priority = await Task.find({
        "company_id": company_id,
        "project_id": project.project_id,
        "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value]},
        "priority": {"$in": [TaskPriority.CRITICAL.value, TaskPriority.HIGH.value]},
    }).count()
    if high_priority > 0:
        risks.append({
            "risk_type": "high_priority_backlog",
            "severity": "medium",
            "count": high_priority,
            "detail": f"{high_priority} critical/high priority task(s) still open.",
        })

    # Low progress
    in_progress = await Task.find({
        "company_id": company_id,
        "project_id": project.project_id,
        "status": TaskStatus.IN_PROGRESS.value,
    }).to_list()
    zero_progress = [t for t in in_progress if (t.progress_percentage or 0) == 0]
    if len(zero_progress) > 2:
        risks.append({
            "risk_type": "stalled_progress",
            "severity": "medium",
            "count": len(zero_progress),
            "detail": f"{len(zero_progress)} in-progress task(s) have 0% progress.",
        })

    return {
        "project_id": project.project_id,
        "project_name": project.name,
        "total_risks": len(risks),
        "risks": risks,
    }


async def execute_get_overdue_tasks(company_id: str, args: GetOverdueTasksArgs) -> dict:
    """Get all overdue tasks."""
    from app.models.task import Task, TaskStatus

    query: dict[str, Any] = {
        "company_id": company_id,
        "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
        "due_date": {"$lt": datetime.utcnow()},
    }
    if args.project_id:
        query["$or"] = [
            {"project_id": args.project_id},
            {"project_object_id": args.project_id},
        ]

    tasks = await Task.find({**query, "due_date": {"$ne": None}}).limit(args.limit).to_list()
    no_due = await Task.find({**query, "due_date": None}).limit(args.limit).to_list()
    tasks = tasks + no_due
    # Oldest overdue first
    tasks.sort(key=lambda t: t.due_date or datetime.min)

    result = []
    for t in tasks:
        days_overdue = (datetime.utcnow() - t.due_date).days if t.due_date else 0
        assignee_name = await _get_user_display_name(company_id, t.assigned_to) if t.assigned_to else "Unassigned"
        result.append({
            "id": str(t.id),
            "title": t.title,
            "project_id": t.project_id,
            "assigned_to": t.assigned_to,
            "assignee_name": assignee_name,
            "priority": t.priority.value if hasattr(t.priority, "value") else str(t.priority),
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "days_overdue": days_overdue,
        })

    return {
        "total": len(result),
        "tasks": result,
    }


async def execute_get_user_tasks(company_id: str, args: GetUserTasksArgs) -> dict:
    """Get tasks assigned to a user."""
    from app.models.task import Task, TaskStatus

    # Resolve user_id if it's a name
    user_id = await _resolve_user_by_name(company_id, args.user_id) or args.user_id

    query: dict[str, Any] = {
        "company_id": company_id,
        "assigned_to": user_id,
    }
    if args.status:
        query["status"] = args.status
    else:
        query["status"] = {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]}

    tasks = await Task.find({**query, "due_date": {"$ne": None}}).limit(args.limit).to_list()
    no_due = await Task.find({**query, "due_date": None}).limit(args.limit // 2).to_list()
    tasks = tasks + no_due
    # Earliest due first
    tasks.sort(key=lambda t: t.due_date or datetime.min)

    by_status: dict[str, list] = {}
    for t in tasks:
        s = t.status.value if hasattr(t.status, "value") else str(t.status)
        if s not in by_status:
            by_status[s] = []
        by_status[s].append({
            "id": str(t.id),
            "title": t.title,
            "project_id": t.project_id,
            "priority": t.priority.value if hasattr(t.priority, "value") else str(t.priority),
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "health_status": t.health_status.value if hasattr(t.health_status, "value") else str(t.health_status),
        })

    return {
        "user_id": user_id,
        "total": len(tasks),
        "by_status": by_status,
    }


async def execute_get_user_task_activity(company_id: str, args: GetUserTaskActivityArgs) -> dict:
    """Get task activity for a user on a specific date."""
    from app.models.task import Task, TaskStatus

    user_id = await _resolve_user_by_name(company_id, args.user_id) or args.user_id

    try:
        target_date = date.fromisoformat(args.date_str) if args.date_str else utc_now().date()
    except ValueError:
        return {"error": "Invalid date format. Use YYYY-MM-DD."}

    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = datetime.combine(target_date + timedelta(days=1), datetime.min.time())

    # Tasks completed today
    completed = await Task.find({
        "company_id": company_id,
        "assigned_to": user_id,
        "status": TaskStatus.COMPLETED.value,
        "completed_at": {"$gte": day_start, "$lt": day_end},
    }).to_list()

    # Tasks updated today (but not completed)
    updated = await Task.find({
        "company_id": company_id,
        "assigned_to": user_id,
        "status": {"$ne": TaskStatus.COMPLETED.value},
        "updated_at": {"$gte": day_start, "$lt": day_end},
    }).to_list()

    # Tasks created today
    created = await Task.find({
        "company_id": company_id,
        "assigned_to": user_id,
        "created_at": {"$gte": day_start, "$lt": day_end},
    }).to_list()

    return {
        "user_id": user_id,
        "date": target_date.isoformat(),
        "completed": [
            {"id": str(t.id), "title": t.title, "project_id": t.project_id}
            for t in completed
        ],
        "completed_count": len(completed),
        "updated": [
            {"id": str(t.id), "title": t.title, "project_id": t.project_id, "status": t.status.value if hasattr(t.status, "value") else str(t.status)}
            for t in updated
        ],
        "updated_count": len(updated),
        "created": [
            {"id": str(t.id), "title": t.title, "project_id": t.project_id}
            for t in created
        ],
        "created_count": len(created),
    }


async def execute_get_team_workload(company_id: str, args: GetTeamWorkloadArgs) -> dict:
    """Get workload distribution across team members."""
    from app.models.task import Task, TaskStatus, TaskPriority

    query: dict[str, Any] = {
        "company_id": company_id,
        "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
    }
    if args.project_id:
        query["$or"] = [
            {"project_id": args.project_id},
            {"project_object_id": args.project_id},
        ]

    tasks = await Task.find(query).to_list()

    # Aggregate by assignee
    workload: dict[str, dict] = {}
    for t in tasks:
        uid = t.assigned_to or "unassigned"
        if uid not in workload:
            workload[uid] = {"total": 0, "by_priority": {}, "overdue": 0}
        workload[uid]["total"] += 1
        p = t.priority.value if hasattr(t.priority, "value") else str(t.priority)
        workload[uid]["by_priority"][p] = workload[uid]["by_priority"].get(p, 0) + 1
        if t.due_date and t.due_date < datetime.utcnow():
            workload[uid]["overdue"] += 1

    # Sort by total tasks descending
    sorted_workload = sorted(workload.items(), key=lambda x: x[1]["total"], reverse=True)[:args.limit]

    # Resolve names
    result = []
    for uid, data in sorted_workload:
        name = await _get_user_display_name(company_id, uid) if uid != "unassigned" else "Unassigned"
        result.append({
            "user_id": uid,
            "name": name,
            **data,
        })

    return {
        "total_open_tasks": len(tasks),
        "team_size": len(workload),
        "workload": result,
    }


async def execute_search_clients(company_id: str, args: SearchClientsArgs) -> dict:
    """Search clients by name, email, or company."""
    from app.models.client import Client

    term = args.query.strip()
    clients = await Client.find({
        "company_id": company_id,
        "$or": [
            {"name": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
            {"company_name": {"$regex": term, "$options": "i"}},
        ],
    }).limit(args.limit).to_list()

    return {
        "total": len(clients),
        "clients": [
            {
                "id": str(c.id),
                "name": c.name,
                "email": c.email,
                "company_name": c.company_name,
                "status": c.status.value if hasattr(c.status, "value") else str(c.status),
                "assigned_to": c.assigned_to,
            }
            for c in clients
        ],
    }


async def execute_get_client_360(company_id: str, args: GetClient360Args) -> dict:
    """Comprehensive client view: profile, projects, tasks, invoices, meetings."""
    from app.models.client import Client
    from app.models.project import Project
    from app.models.task import Task, TaskStatus
    from app.models.invoice import Invoice, InvoiceStatus
    from app.models.meeting import Meeting, MeetingStatus

    client = await Client.get(args.client_id)
    if not client or client.company_id != company_id:
        return {"error": "Client not found."}

    # Linked projects
    projects = []
    if client.project_ids:
        for pid in client.project_ids[:10]:
            project = await Project.get(pid)
            if not project:
                project = await Project.find_one({"company_id": company_id, "project_id": pid})
            if project:
                projects.append({
                    "id": str(project.id),
                    "name": project.name,
                    "project_id": project.project_id,
                    "status": project.status.value if hasattr(project.status, "value") else str(project.status),
                    "delivery_date": str(project.delivery_date) if project.delivery_date else None,
                })

    # Tasks across client projects
    project_ids = client.project_ids or []
    all_tasks = []
    overdue_tasks = []
    if project_ids:
        all_tasks = await Task.find({
            "company_id": company_id,
            "project_id": {"$in": project_ids},
            "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
        }).to_list()
        overdue_tasks = [t for t in all_tasks if t.due_date and t.due_date < datetime.utcnow()]

    # Invoices
    invoices = await Invoice.find({
        "company_id": company_id,
        "client_id": str(client.id),
    }).to_list()
    invoices.sort(key=lambda i: i.created_at or datetime.min, reverse=True)  # Most recent first
    total_outstanding = sum(inv.outstanding_amount or 0.0 for inv in invoices)
    overdue_invoices = [inv for inv in invoices if inv.status == InvoiceStatus.SENT.value and inv.due_date and inv.due_date < datetime.utcnow()]

    # Recent meetings
    recent_meetings = await Meeting.find({
        "company_id": company_id,
        "client_id": str(client.id),
    }).to_list()
    recent_meetings.sort(key=lambda m: m.meeting_date or datetime.min, reverse=True)  # Most recent first
    recent_meetings = recent_meetings[:5]

    return {
        "client": {
            "id": str(client.id),
            "name": client.name,
            "email": client.email,
            "company_name": client.company_name,
            "status": client.status.value if hasattr(client.status, "value") else str(client.status),
            "assigned_to": client.assigned_to,
            "start_date": str(client.start_date) if client.start_date else None,
            "delivery_date": str(client.delivery_date) if client.delivery_date else None,
        },
        "projects": projects,
        "tasks": {
            "open": len(all_tasks),
            "overdue": len(overdue_tasks),
        },
        "overdue_tasks": [
            {
                "id": str(t.id),
                "title": t.title,
                "project_id": t.project_id,
                "assigned_to": t.assigned_to,
                "days_overdue": (datetime.utcnow() - t.due_date).days,
            }
            for t in overdue_tasks[:10]
        ],
        "finance": {
            "total_invoices": len(invoices),
            "total_outstanding": round(total_outstanding, 2),
            "overdue_invoices": len(overdue_invoices),
        },
        "recent_meetings": [
            {
                "id": str(m.id),
                "title": m.title,
                "meeting_date": str(m.meeting_date),
                "status": m.status.value if hasattr(m.status, "value") else str(m.status),
            }
            for m in recent_meetings
        ],
    }


async def execute_get_client_risks(company_id: str, args: GetClientRisksArgs) -> dict:
    """Analyze client risk factors."""
    from app.models.client import Client
    from app.models.project import Project, ProjectStatus
    from app.models.task import Task, TaskStatus, TaskPriority
    from app.models.invoice import Invoice, InvoiceStatus
    from app.models.meeting import Meeting

    client = await Client.get(args.client_id)
    if not client or client.company_id != company_id:
        return {"error": "Client not found."}

    risks: list[dict[str, Any]] = []

    # Project delays
    project_ids = client.project_ids or []
    for pid in project_ids[:5]:
        project = await Project.get(pid)
        if not project:
            project = await Project.find_one({"company_id": company_id, "project_id": pid})
        if project and project.delivery_date and project.delivery_date < datetime.utcnow():
            risks.append({
                "risk_type": "project_delayed",
                "severity": "high",
                "detail": f"Project '{project.name}' delivery date was {(datetime.utcnow() - project.delivery_date).days} day(s) ago.",
                "entity": project.name,
            })

    # Overdue tasks
    if project_ids:
        overdue = await Task.find({
            "company_id": company_id,
            "project_id": {"$in": project_ids},
            "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
            "due_date": {"$lt": datetime.utcnow()},
        }).to_list()
        if overdue:
            critical = sum(1 for t in overdue if t.priority in (TaskPriority.CRITICAL.value, TaskPriority.HIGH.value))
            risks.append({
                "risk_type": "overdue_tasks",
                "severity": "high" if critical > 0 else "medium",
                "count": len(overdue),
                "detail": f"{len(overdue)} overdue task(s) ({critical} critical/high).",
            })

    # Overdue invoices
    invoices = await Invoice.find({
        "company_id": company_id,
        "client_id": str(client.id),
        "status": InvoiceStatus.SENT.value,
        "due_date": {"$lt": datetime.utcnow()},
    }).to_list()
    if invoices:
        total = sum(inv.outstanding_amount or 0.0 for inv in invoices)
        risks.append({
            "risk_type": "overdue_invoices",
            "severity": "high" if total > 50000 else "medium",
            "count": len(invoices),
            "detail": f"{len(invoices)} overdue invoice(s) totaling {total:,.0f}.",
        })

    # No recent meetings
    last_meeting = await Meeting.find({
        "company_id": company_id,
        "client_id": str(client.id),
    }).limit(1).to_list()
    if last_meeting:
        days_since = (datetime.utcnow() - last_meeting[0].meeting_date).days
        if days_since > 30:
            risks.append({
                "risk_type": "no_recent_contact",
                "severity": "medium",
                "detail": f"No meeting with this client for {days_since} day(s).",
            })
    elif client.project_ids:
        risks.append({
            "risk_type": "no_meetings_recorded",
            "severity": "low",
            "detail": "No meetings recorded for this client.",
        })

    # Client status flag
    if client.status and hasattr(client.status, "value") and client.status.value == "at_risk":
        risks.append({
            "risk_type": "client_flagged_at_risk",
            "severity": "high",
            "detail": "Client is explicitly flagged as AT_RISK.",
        })

    return {
        "client_id": str(client.id),
        "client_name": client.name,
        "total_risks": len(risks),
        "risks": risks,
    }


async def execute_get_sales_summary(company_id: str, args: GetSalesSummaryArgs) -> dict:
    """Sales pipeline summary."""
    from app.models.sales_prospect import SalesProspect, ProspectStatus

    cutoff = datetime.utcnow() - timedelta(days=args.days)

    # Leads by stage
    active_leads = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.ACTIVE.value,
        "deleted": False,
    }).to_list()

    by_stage: dict[str, int] = {}
    for lead in active_leads:
        stage = lead.current_stage or "unknown"
        by_stage[stage] = by_stage.get(stage, 0) + 1

    # Won/Lost in period
    won = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.WON.value,
        "closed_date": {"$gte": cutoff},
        "deleted": False,
    }).to_list()
    lost = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.LOST.value,
        "closed_date": {"$gte": cutoff},
        "deleted": False,
    }).to_list()

    total_won_amount = sum(lead.won_amount or 0.0 for lead in won)

    # New leads in period
    new_leads = await SalesProspect.find({
        "company_id": company_id,
        "created_at": {"$gte": cutoff},
        "deleted": False,
    }).count()

    return {
        "period_days": args.days,
        "active_leads": {
            "total": len(active_leads),
            "by_stage": by_stage,
        },
        "period": {
            "new_leads": new_leads,
            "won": len(won),
            "lost": len(lost),
            "won_amount": round(total_won_amount, 2),
            "conversion_rate": round(len(won) / max(len(won) + len(lost), 1) * 100, 1),
        },
    }


async def execute_get_followup_risks(company_id: str, args: GetFollowupRisksArgs) -> dict:
    """Leads needing follow-up attention."""
    from app.models.sales_prospect import SalesProspect, ProspectStatus

    now = datetime.utcnow()

    # Overdue follow-ups — most overdue first
    overdue_followups = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.ACTIVE.value,
        "next_follow_up_at": {"$lt": now, "$ne": None},
        "deleted": False,
    }).to_list()
    overdue_followups.sort(key=lambda l: l.next_follow_up_at or datetime.min)  # Oldest follow-up first
    overdue_followups = overdue_followups[:args.limit]

    # No follow-up scheduled but stale in stage — longest stale first
    stale_in_stage = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.ACTIVE.value,
        "next_follow_up_at": None,
        "stage_entered_at": {"$lt": now - timedelta(days=args.days), "$ne": None},
        "deleted": False,
    }).to_list()
    stale_in_stage.sort(key=lambda l: l.stage_entered_at or datetime.min)  # Longest in stage first
    stale_in_stage = stale_in_stage[:args.limit]

    # Active leads with no next action
    no_action = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.ACTIVE.value,
        "next_action": None,
        "next_follow_up_at": None,
        "deleted": False,
    }).count()

    result = {
        "overdue_followups": [
            {
                "id": str(l.id),
                "name": l.prospect_name or f"{l.first_name or ''} {l.last_name or ''}".strip(),
                "company": l.company_name,
                "stage": l.current_stage,
                "next_follow_up": str(l.next_follow_up_at),
                "days_overdue": (now - l.next_follow_up_at).days if l.next_follow_up_at else 0,
            }
            for l in overdue_followups
        ],
        "stale_in_stage": [
            {
                "id": str(l.id),
                "name": l.prospect_name or f"{l.first_name or ''} {l.last_name or ''}".strip(),
                "company": l.company_name,
                "stage": l.current_stage,
                "stage_entered_at": str(l.stage_entered_at),
                "days_in_stage": (now - l.stage_entered_at).days if l.stage_entered_at else 0,
            }
            for l in stale_in_stage
        ],
        "leads_with_no_action": no_action,
    }
    result["total_attention_needed"] = (
        len(result["overdue_followups"])
        + len(result["stale_in_stage"])
        + result["leads_with_no_action"]
    )

    return result


async def execute_get_lead_360(company_id: str, args: GetLead360Args) -> dict:
    """Comprehensive lead view."""
    from app.models.sales_prospect import SalesProspect

    lead = await SalesProspect.get(args.lead_id)
    if not lead or lead.company_id != company_id:
        return {"error": "Lead not found."}

    assigned_name = await _get_user_display_name(company_id, lead.assigned_to) if lead.assigned_to else None

    return {
        "lead": {
            "id": str(lead.id),
            "name": lead.prospect_name or f"{lead.first_name or ''} {lead.last_name or ''}".strip(),
            "email": lead.email,
            "phone": lead.phone,
            "company": lead.company_name,
            "stage": lead.current_stage,
            "stage_status": lead.current_stage_status,
            "status": lead.status.value if hasattr(lead.status, "value") else str(lead.status),
            "interest_level": lead.interest_level.value if hasattr(lead.interest_level, "value") else str(lead.interest_level),
            "assigned_to": lead.assigned_to,
            "assigned_to_name": assigned_name,
            "next_action": lead.next_action,
            "next_follow_up": str(lead.next_follow_up_at) if lead.next_follow_up_at else None,
            "days_in_stage": lead.days_in_stage,
            "budget": lead.budget,
            "requirement": lead.requirement,
            "source": lead.source,
        },
        "timeline": {
            "created_at": str(lead.created_at),
            "first_contact": str(lead.first_contact_at) if lead.first_contact_at else None,
            "last_contacted": str(lead.last_contacted_at) if lead.last_contacted_at else None,
            "stage_entered_at": str(lead.stage_entered_at) if lead.stage_entered_at else None,
            "closed_date": str(lead.closed_date) if lead.closed_date else None,
        },
        "qualification": {
            "qualify_status": lead.qualification_status if hasattr(lead, "qualification_status") else lead.qualify_status,
            "discovery_outcome": lead.discovery_outcome,
            "proposal_status": lead.proposal_status,
            "negotiation_status": lead.negotiation_status,
            "agreement_status": lead.agreement_status,
        },
    }


async def execute_get_finance_summary(company_id: str, args: GetFinanceSummaryArgs) -> dict:
    """Finance summary: period metrics + outstanding financial exposure.

    A. Period metrics: invoices created in the specified window.
    B. Outstanding exposure: ALL unpaid/partially paid/overdue invoices
       regardless of creation date (this is what "how much is receivable"
       means).
    """
    from app.models.invoice import Invoice, InvoiceStatus

    cutoff = datetime.utcnow() - timedelta(days=args.days)

    # A. Period metrics — invoices created in the window
    period_invoices = await Invoice.find({
        "company_id": company_id,
        "created_at": {"$gte": cutoff},
    }).to_list()

    period_invoiced = sum(inv.total_amount or 0.0 for inv in period_invoices)
    period_received = sum(inv.total_received or 0.0 for inv in period_invoices)
    period_by_status: dict[str, int] = {}
    for inv in period_invoices:
        s = inv.status.value if hasattr(inv.status, "value") else str(inv.status)
        period_by_status[s] = period_by_status.get(s, 0) + 1

    # B. Outstanding exposure — ALL invoices with outstanding balance
    all_invoices = await Invoice.find({
        "company_id": company_id,
        "outstanding_amount": {"$gt": 0},
    }).to_list()

    total_outstanding = sum(inv.outstanding_amount or 0.0 for inv in all_invoices)
    overdue = [inv for inv in all_invoices if inv.status == InvoiceStatus.SENT.value and inv.due_date and inv.due_date < datetime.utcnow()]
    overdue.sort(key=lambda i: i.due_date or datetime.min)  # Oldest overdue first
    overdue_amount = sum(inv.outstanding_amount or 0.0 for inv in overdue)

    # Clients with outstanding balances
    client_owing: dict[str, float] = {}
    for inv in all_invoices:
        name = inv.client_name or inv.client_id
        client_owing[name] = client_owing.get(name, 0.0) + (inv.outstanding_amount or 0.0)

    return {
        "period_days": args.days,
        "period": {
            "invoiced": round(period_invoiced, 2),
            "received": round(period_received, 2),
            "invoice_count": len(period_invoices),
            "by_status": period_by_status,
        },
        "outstanding": {
            "total_outstanding": round(total_outstanding, 2),
            "overdue_count": len(overdue),
            "overdue_amount": round(overdue_amount, 2),
            "total_unpaid_invoices": len(all_invoices),
        },
        "clients_owing": [
            {"client": name, "amount": round(amt, 2)}
            for name, amt in sorted(client_owing.items(), key=lambda x: x[1], reverse=True)
        ],
    }


async def execute_get_overdue_invoices(company_id: str, args: GetOverdueInvoicesArgs) -> dict:
    """Get overdue invoices."""
    from app.models.invoice import Invoice, InvoiceStatus

    invoices = await Invoice.find({
        "company_id": company_id,
        "status": InvoiceStatus.SENT.value,
        "due_date": {"$lt": datetime.utcnow()},
    }).to_list()
    # Oldest overdue first
    invoices.sort(key=lambda i: i.due_date or datetime.min)
    invoices = invoices[:args.limit]

    return {
        "total": len(invoices),
        "invoices": [
            {
                "id": str(inv.id),
                "invoice_number": inv.invoice_number,
                "client_name": inv.client_name,
                "client_id": inv.client_id,
                "total_amount": inv.total_amount,
                "outstanding_amount": inv.outstanding_amount,
                "due_date": inv.due_date.isoformat() if inv.due_date else None,
                "days_overdue": (datetime.utcnow() - inv.due_date).days if inv.due_date else 0,
            }
            for inv in invoices
        ],
    }


async def execute_get_meeting_summary(company_id: str, args: GetMeetingSummaryArgs) -> dict:
    """Meeting summary for a period."""
    from app.models.meeting import Meeting, MeetingStatus

    cutoff = datetime.utcnow() - timedelta(days=args.days)

    upcoming = await Meeting.find({
        "company_id": company_id,
        "meeting_date": {"$gte": datetime.utcnow()},
        "status": MeetingStatus.SCHEDULED.value,
    }).to_list()
    upcoming.sort(key=lambda m: m.meeting_date or datetime.max)  # Soonest first
    upcoming = upcoming[:10]

    completed = await Meeting.find({
        "company_id": company_id,
        "meeting_date": {"$gte": cutoff, "$lt": datetime.utcnow()},
        "status": {"$in": [MeetingStatus.COMPLETED.value, MeetingStatus.CANCELLED.value]},
    }).to_list()
    completed.sort(key=lambda m: m.meeting_date or datetime.min, reverse=True)  # Most recent first
    completed = completed[:10]

    return {
        "period_days": args.days,
        "upcoming_count": len(upcoming),
        "upcoming": [
            {
                "id": str(m.id),
                "title": m.title,
                "meeting_date": str(m.meeting_date),
                "meeting_time": m.meeting_time,
                "duration": m.duration,
                "participants": len(m.participant_ids),
                "client_id": m.client_id,
                "project_id": m.project_id,
            }
            for m in upcoming
        ],
        "completed_count": len(completed),
        "completed": [
            {
                "id": str(m.id),
                "title": m.title,
                "meeting_date": str(m.meeting_date),
                "status": m.status.value if hasattr(m.status, "value") else str(m.status),
                "participants": len(m.participant_ids),
            }
            for m in completed
        ],
    }


async def execute_get_pending_meeting_followups(company_id: str, args: GetPendingMeetingFollowupsArgs) -> dict:
    """Meetings with pending follow-ups."""
    from app.models.meeting import Meeting, MeetingStatus

    cutoff = datetime.utcnow() - timedelta(days=args.days)

    completed = await Meeting.find({
        "company_id": company_id,
        "meeting_date": {"$gte": cutoff, "$lt": datetime.utcnow()},
        "status": MeetingStatus.COMPLETED.value,
    }).to_list()
    completed.sort(key=lambda m: m.meeting_date or datetime.min, reverse=True)  # Most recent first
    completed = completed[:args.limit]

    # Meetings that ended recently and may need follow-up
    return {
        "total": len(completed),
        "meetings": [
            {
                "id": str(m.id),
                "title": m.title,
                "description": (m.description or "")[:200],
                "meeting_date": str(m.meeting_date),
                "participants": len(m.participant_ids),
                "client_id": m.client_id,
                "project_id": m.project_id,
                "days_ago": (datetime.utcnow() - m.meeting_date).days if m.meeting_date else 0,
            }
            for m in completed
        ],
    }


async def execute_search_employees(company_id: str, args: SearchEmployeesArgs) -> dict:
    """Search employees within company scope — delegates to the HR domain implementation."""
    from app.agents.hr.tools import execute_search_employees as hr_execute_search_employees
    return await hr_execute_search_employees(company_id, args)


async def execute_get_employee_360(company_id: str, args: GetEmployee360Args) -> dict:
    """Comprehensive employee 360 view — delegates to HR tool."""
    from app.agents.hr.tools import execute_get_employee_360 as hr_get_employee_360
    return await hr_get_employee_360(company_id, args)


async def execute_get_hr_attention_summary(company_id: str, args: GetHrAttentionSummaryArgs) -> dict:
    """HR attention summary — delegates to HR tool."""
    from app.agents.hr.tools import execute_get_hr_attention_summary as hr_attention
    return await hr_attention(company_id, args)


async def execute_get_entity_documents(company_id: str, args: GetEntityDocumentsArgs) -> dict:
    """Get documents for an entity (employee, client, or project)."""
    entity_type = args.entity_type.lower()

    if entity_type == "employee":
        from app.models.hr_document import HRDocument
        from app.agents.hr.tools import _resolve_employee

        profile = await _resolve_employee(company_id, args.entity_id)
        if not profile:
            return {"error": "Employee not found."}

        docs = await HRDocument.find({
            "company_id": company_id,
            "employee_id": profile.user_id,
        }).to_list()

        return {
            "entity_type": "employee",
            "entity_id": args.entity_id,
            "total": len(docs),
            "documents": [
                {
                    "id": str(d.id),
                    "document_type": getattr(d, "document_type", None),
                    "document_name": getattr(d, "document_name", None),
                    "status": getattr(d, "status", None),
                    "expiry_date": d.expiry_date.isoformat() if getattr(d, "expiry_date", None) else None,
                }
                for d in docs
            ],
        }

    elif entity_type == "client":
        from app.models.client import Client

        client = await Client.get(args.entity_id)
        if not client or client.company_id != company_id:
            return {"error": "Client not found."}

        return {
            "entity_type": "client",
            "entity_id": args.entity_id,
            "total": len(client.documents),
            "documents": [
                {
                    "name": doc.get("name"),
                    "type": doc.get("type"),
                    "uploaded_at": str(doc.get("uploaded_at", "")),
                }
                for doc in client.documents
            ],
        }

    return {"error": f"Unsupported entity_type: {entity_type}. Use 'employee' or 'client'."}


# ---------------------------------------------------------------------------
# HR Deep tool implementations (delegate to HR domain tools)
# ---------------------------------------------------------------------------

async def _hr_delegate(tool_name: str, company_id: str, args: Any) -> dict:
    """Delegate to the HR tools implementation for tools owned by the HR domain."""
    from app.agents.hr.tools import TOOL_DISPATCH as HR_DISPATCH, ARG_SCHEMAS as HR_SCHEMAS
    # Validate with HR-specific schema if available
    schema = HR_SCHEMAS.get(tool_name)
    if schema:
        try:
            if isinstance(args, BaseModel):
                validated = schema(**args.model_dump())
            else:
                validated = schema(**args)
        except Exception as exc:
            return {"error": f"Invalid arguments for {tool_name}: {exc}"}
    else:
        validated = args
    impl = HR_DISPATCH.get(tool_name)
    if not impl:
        return {"error": f"HR tool not found: {tool_name}"}
    return await impl(company_id, validated)


# Named wrappers so each HR tool has a clear dispatcher entry.
async def _exec_search_candidates(cid: str, a: SearchCandidatesArgs) -> dict:
    return await _hr_delegate("search_candidates", cid, a)

async def _exec_get_candidate_360(cid: str, a: GetCandidate360Args) -> dict:
    return await _hr_delegate("get_candidate_360", cid, a)

async def _exec_search_jobs(cid: str, a: SearchJobsArgs) -> dict:
    return await _hr_delegate("search_jobs", cid, a)

async def _exec_get_job_360(cid: str, a: GetJob360Args) -> dict:
    return await _hr_delegate("get_job_360", cid, a)

async def _exec_get_recruitment_overview(cid: str, a: GetRecruitmentOverviewArgs) -> dict:
    return await _hr_delegate("get_recruitment_overview", cid, a)

async def _exec_get_interviews(cid: str, a: GetInterviewsArgs) -> dict:
    return await _hr_delegate("get_interviews", cid, a)

async def _exec_get_interview_feedback_status(cid: str, a: GetInterviewFeedbackStatusArgs) -> dict:
    return await _hr_delegate("get_interview_feedback_status", cid, a)

async def _exec_get_offer_status(cid: str, a: GetOfferStatusArgs) -> dict:
    return await _hr_delegate("get_offer_status", cid, a)

async def _exec_get_employee_attendance(cid: str, a: GetEmployeeAttendanceArgs) -> dict:
    return await _hr_delegate("get_employee_attendance", cid, a)

async def _exec_get_employee_leave(cid: str, a: GetEmployeeLeaveArgs) -> dict:
    return await _hr_delegate("get_employee_leave", cid, a)

async def _exec_get_employee_documents(cid: str, a: GetEmployeeDocumentsArgs) -> dict:
    return await _hr_delegate("get_employee_documents", cid, a)

async def _exec_get_employee_salary(cid: str, a: GetEmployeeSalaryArgs) -> dict:
    return await _hr_delegate("get_employee_salary", cid, a)

async def _exec_get_payroll_status(cid: str, a: GetPayrollStatusArgs) -> dict:
    return await _hr_delegate("get_payroll_status", cid, a)

async def _exec_get_payroll_blockers(cid: str, a: GetPayrollBlockersArgs) -> dict:
    return await _hr_delegate("get_payroll_blockers", cid, a)

async def _exec_get_employee_payslip_status(cid: str, a: GetEmployeePayslipStatusArgs) -> dict:
    return await _hr_delegate("get_employee_payslip_status", cid, a)


# ---------------------------------------------------------------------------
# Tool dispatcher
# ---------------------------------------------------------------------------

TOOL_DISPATCH: dict[str, Any] = {
    "get_company_summary": execute_get_company_summary,
    "get_company_attention_summary": execute_get_company_attention_summary,
    "search_projects": execute_search_projects,
    "get_project_360": execute_get_project_360,
    "get_project_risks": execute_get_project_risks,
    "get_overdue_tasks": execute_get_overdue_tasks,
    "get_user_tasks": execute_get_user_tasks,
    "get_user_task_activity": execute_get_user_task_activity,
    "get_team_workload": execute_get_team_workload,
    "search_clients": execute_search_clients,
    "get_client_360": execute_get_client_360,
    "get_client_risks": execute_get_client_risks,
    "get_sales_summary": execute_get_sales_summary,
    "get_followup_risks": execute_get_followup_risks,
    "get_lead_360": execute_get_lead_360,
    "get_finance_summary": execute_get_finance_summary,
    "get_overdue_invoices": execute_get_overdue_invoices,
    "get_meeting_summary": execute_get_meeting_summary,
    "get_pending_meeting_followups": execute_get_pending_meeting_followups,
    "search_employees": execute_search_employees,
    "get_employee_360": execute_get_employee_360,
    "get_hr_attention_summary": execute_get_hr_attention_summary,
    "get_entity_documents": execute_get_entity_documents,
    # HR Deep tools — delegated to HR domain implementations
    "search_candidates": _exec_search_candidates,
    "get_candidate_360": _exec_get_candidate_360,
    "search_jobs": _exec_search_jobs,
    "get_job_360": _exec_get_job_360,
    "get_recruitment_overview": _exec_get_recruitment_overview,
    "get_interviews": _exec_get_interviews,
    "get_interview_feedback_status": _exec_get_interview_feedback_status,
    "get_offer_status": _exec_get_offer_status,
    "get_employee_attendance": _exec_get_employee_attendance,
    "get_employee_leave": _exec_get_employee_leave,
    "get_employee_documents": _exec_get_employee_documents,
    "get_employee_salary": _exec_get_employee_salary,
    "get_payroll_status": _exec_get_payroll_status,
    "get_payroll_blockers": _exec_get_payroll_blockers,
    "get_employee_payslip_status": _exec_get_employee_payslip_status,
}

ARG_SCHEMAS: dict[str, type[BaseModel]] = {
    "get_company_summary": GetCompanySummaryArgs,
    "get_company_attention_summary": GetCompanyAttentionSummaryArgs,
    "search_projects": SearchProjectsArgs,
    "get_project_360": GetProject360Args,
    "get_project_risks": GetProjectRisksArgs,
    "get_overdue_tasks": GetOverdueTasksArgs,
    "get_user_tasks": GetUserTasksArgs,
    "get_user_task_activity": GetUserTaskActivityArgs,
    "get_team_workload": GetTeamWorkloadArgs,
    "search_clients": SearchClientsArgs,
    "get_client_360": GetClient360Args,
    "get_client_risks": GetClientRisksArgs,
    "get_sales_summary": GetSalesSummaryArgs,
    "get_followup_risks": GetFollowupRisksArgs,
    "get_lead_360": GetLead360Args,
    "get_finance_summary": GetFinanceSummaryArgs,
    "get_overdue_invoices": GetOverdueInvoicesArgs,
    "get_meeting_summary": GetMeetingSummaryArgs,
    "get_pending_meeting_followups": GetPendingMeetingFollowupsArgs,
    "search_employees": SearchEmployeesArgs,
    "get_employee_360": GetEmployee360Args,
    "get_hr_attention_summary": GetHrAttentionSummaryArgs,
    "get_entity_documents": GetEntityDocumentsArgs,
    # HR Deep
    "search_candidates": SearchCandidatesArgs,
    "get_candidate_360": GetCandidate360Args,
    "search_jobs": SearchJobsArgs,
    "get_job_360": GetJob360Args,
    "get_recruitment_overview": GetRecruitmentOverviewArgs,
    "get_interviews": GetInterviewsArgs,
    "get_interview_feedback_status": GetInterviewFeedbackStatusArgs,
    "get_offer_status": GetOfferStatusArgs,
    "get_employee_attendance": GetEmployeeAttendanceArgs,
    "get_employee_leave": GetEmployeeLeaveArgs,
    "get_employee_documents": GetEmployeeDocumentsArgs,
    "get_employee_salary": GetEmployeeSalaryArgs,
    "get_payroll_status": GetPayrollStatusArgs,
    "get_payroll_blockers": GetPayrollBlockersArgs,
    "get_employee_payslip_status": GetEmployeePayslipStatusArgs,
}


# ---------------------------------------------------------------------------
# RBAC / Policy enforcement — sensitive tools require authorized roles
# ---------------------------------------------------------------------------

_SENSITIVE_TOOLS: dict[str, set[str]] = {
    # tool_name → set of roles allowed to call it
    "get_employee_salary": {"admin", "super_admin", "manager"},
    "get_payroll_status": {"admin", "super_admin", "manager"},
    "get_payroll_blockers": {"admin", "super_admin", "manager"},
    "get_employee_payslip_status": {"admin", "super_admin", "manager"},
    "get_employee_leave": {"admin", "super_admin", "manager", "lead"},
    "get_employee_attendance": {"admin", "super_admin", "manager", "lead"},
    "get_employee_documents": {"admin", "super_admin", "manager", "lead"},
}

# Module gates: tool_name → company module id.  Enforced in
# execute_executive_tool when the caller supplies the company's module list.
TOOL_MODULE_GATES: dict[str, str] = {}

# ---------------------------------------------------------------------------
# Tool result cache — Redis-backed for cross-worker sharing
# ---------------------------------------------------------------------------
import time as _time

# Fallback in-memory cache when Redis is unavailable
_MEM_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_MEM_CACHE_TTL: dict[str, float] = {
    "get_company_summary": 60.0,
    "get_company_attention_summary": 30.0,
    "get_sales_summary": 60.0,
    "get_finance_summary": 60.0,
    "get_team_workload": 30.0,
    "get_overdue_tasks": 15.0,
    "search_employees": 60.0,
    "get_hr_attention_summary": 30.0,
    "get_recruitment_overview": 60.0,
}

def _cache_key(
    tool_name: str,
    company_id: str,
    arguments: dict[str, Any],
    scope_fingerprint: str | None = None,
) -> str:
    """Build a cache key that includes security scope for sensitive tools.

    ``scope_fingerprint`` is a short hash of the user's effective
    capabilities + role.  When supplied, it prevents cache leakage
    across users with different authorization levels.  Tools that
    return only non-sensitive aggregate data may omit it for better
    hit rates.
    """
    base = f"exec:tool:{tool_name}:{company_id}:{json.dumps(arguments, sort_keys=True, default=str)}"
    if scope_fingerprint:
        base += f":{scope_fingerprint}"
    return base


# Tools whose cached results can contain sensitive data and therefore
# require a scope-aware cache key to prevent cross-role leakage.
_SENSITIVE_CACHE_TOOLS: set[str] = {
    "get_finance_summary",
    "get_overdue_invoices",
    "list_invoices",
    "get_invoice_detail",
    "get_employee_salary",
    "get_payroll_status",
    "get_payroll_blockers",
    "get_employee_payslip_status",
}


async def _get_cached(key: str, tool_name: str) -> dict[str, Any] | None:
    """Try Redis first, then in-memory cache."""
    ttl = _MEM_CACHE_TTL.get(tool_name, 0)
    if ttl <= 0:
        return None
    # Try Redis
    try:
        from app.core.redis_client import get_redis
        redis = await get_redis()
        if redis:
            raw = await redis.get(key)
            if raw:
                return json.loads(raw)
    except Exception:
        pass
    # Fallback to in-memory
    entry = _MEM_CACHE.get(key)
    if entry and (_time.monotonic() - entry[0]) < ttl:
        return entry[1]
    return None


async def _set_cached(key: str, tool_name: str, result: dict[str, Any]) -> None:
    """Store in Redis (preferred) and in-memory (fallback)."""
    ttl = _MEM_CACHE_TTL.get(tool_name, 0)
    if ttl <= 0 or "error" in result:
        return
    # Try Redis
    try:
        from app.core.redis_client import get_redis
        redis = await get_redis()
        if redis:
            await redis.setex(key, int(ttl), json.dumps(result, default=str))
    except Exception:
        pass
    # Also store in-memory
    _MEM_CACHE[key] = (_time.monotonic(), result)
    if len(_MEM_CACHE) > 200:
        now = _time.monotonic()
        stale = [k for k, (ts, _) in _MEM_CACHE.items() if now - ts > 120]
        for k in stale[:100]:
            _MEM_CACHE.pop(k, None)


async def execute_executive_tool(
    tool_name: str,
    arguments: dict[str, Any],
    company_id: str,
    user_role: str = "employee",
    modules: Optional[list[str]] = None,
    security_context: Any = None,
) -> dict[str, Any]:
    """Execute an executive tool by name with validated arguments.

    Includes:
    - Governance authorization (when security_context provided)
    - Pydantic argument validation
    - RBAC policy enforcement for sensitive tools
    - Module availability gates (when the company module list is supplied)
    - Redis-backed result caching for expensive reads
    - Sensitive data projection

    Observability: records a TOOL span when a trace is active (tool name,
    duration, status, safe cache/error metadata only — never payloads).
    """
    from app.ai.observability import tracer as _ai_tracer
    from app.ai.security.governance import authorize_tool_execution, GovernanceDecision
    from app.ai.security.audit import record_security_event
    from app.ai.security.result_projection import project_tool_result

    _trace = _ai_tracer.get_current_trace()
    _span = None
    if _trace is not None:
        _span = _ai_tracer.start_span("TOOL", tool_name, attrs={"tool": tool_name})
    _cache_hit = False

    def _finish(result: dict[str, Any]) -> dict[str, Any]:
        """Close the TOOL span with safe status metadata."""
        if _span is not None:
            if isinstance(result, dict) and result.get("error"):
                _ai_tracer.end_span(
                    _span,
                    status="FAILED",
                    error_type="TOOL_ERROR",
                    error_message=f"tool {tool_name}: {str(result['error'])[:300]}",
                )
            else:
                _ai_tracer.end_span(_span, attrs={"cache_hit": _cache_hit})
        return result

    if tool_name not in TOOL_DISPATCH:
        return _finish({"error": f"Unknown tool: {tool_name}"})

    # ── Governance authorization (defense in depth) ──────────────────────────
    if security_context is not None:
        auth_result = authorize_tool_execution(
            context=security_context,
            tool_name=tool_name,
            agent_id="executive_operations",
            arguments=arguments,
            company_id_from_args=company_id,
        )

        if not auth_result.allowed:
            logger.info(
                "Executive tool '%s' denied by governance: %s — %s",
                tool_name,
                auth_result.reason.value if auth_result.reason else "unknown",
                auth_result.details,
            )
            await record_security_event(
                company_id=security_context.company_id,
                user_id=security_context.user_id,
                role=security_context.role,
                agent="executive_operations",
                capability=tool_name,
                decision=auth_result.decision.value,
                decision_code=auth_result.reason.value if auth_result.reason else None,
                decision_details=auth_result.details,
                trace_id=security_context.trace_id,
            )
            return _finish({
                "error": f"Access denied: {auth_result.details}",
                "governance_denied": True,
                "decision": auth_result.decision.value,
            })

    # ── Legacy RBAC check (kept for backward compatibility) ──────────────────
    allowed_roles = _SENSITIVE_TOOLS.get(tool_name)
    if allowed_roles and user_role not in allowed_roles:
        return _finish({
            "error": f"Access denied: '{tool_name}' requires role in {sorted(allowed_roles)}.",
            "rbac_denied": True,
            "required_roles": sorted(allowed_roles),
        })

    # ── Module gate ─────────────────────────────────────────────────────────
    module_gate = TOOL_MODULE_GATES.get(tool_name)
    enabled_modules = {str(m).lower() for m in modules} if modules else None
    if module_gate and enabled_modules and module_gate not in enabled_modules:
        return _finish({
            "error": f"Access denied: '{tool_name}' requires the '{module_gate}' module.",
            "module_denied": True,
            "required_module": module_gate,
        })

    # ── Validate arguments ──────────────────────────────────────────────────
    schema = ARG_SCHEMAS.get(tool_name)
    if schema:
        try:
            validated = schema(**arguments)
        except Exception as exc:
            return _finish({"error": f"Invalid arguments for {tool_name}: {exc}"})
    else:
        validated = arguments

    # ── Check cache ─────────────────────────────────────────────────────────
    # Build scope-aware cache key for sensitive tools to prevent cross-role leakage
    _scope_fp: str | None = None
    if tool_name in _SENSITIVE_CACHE_TOOLS and security_context is not None:
        # Compact fingerprint: sorted capabilities + role + policy version
        import hashlib
        scope_seed = f"{sorted(security_context.effective_capabilities)}:{security_context.role}:{security_context.is_admin}"
        _scope_fp = hashlib.sha256(scope_seed.encode()).hexdigest()[:12]
    cache_key = _cache_key(tool_name, company_id, arguments, scope_fingerprint=_scope_fp)
    cached = await _get_cached(cache_key, tool_name)
    if cached is not None:
        _cache_hit = True
        return _finish(cached)

    # ── Execute ─────────────────────────────────────────────────────────────
    try:
        result = await TOOL_DISPATCH[tool_name](company_id, validated)
        # ── Sensitive data projection ───────────────────────────────────────
        if security_context is not None:
            result = project_tool_result(security_context, tool_name, result)
        await _set_cached(cache_key, tool_name, result)
        return _finish(result)
    except Exception as exc:
        logger.exception("Executive tool %s failed", tool_name)
        return _finish({"error": f"Tool execution failed: {exc}"})


# ---------------------------------------------------------------------------
# Read-tools registry merge — bounded company-wide read tools (one definition)
# ---------------------------------------------------------------------------
try:
    from app.agents.executive.read_tools import (  # type: ignore[import-not-found]
        READ_TOOL_ARG_SCHEMAS,
        READ_TOOL_HANDLERS,
        READ_TOOL_MODULE_GATES,
        READ_TOOL_SCHEMAS,
        READ_TOOL_SENSITIVE_TOOLS,
    )
    EXECUTIVE_TOOL_SCHEMAS = [*EXECUTIVE_TOOL_SCHEMAS, *READ_TOOL_SCHEMAS]
    TOOL_DISPATCH.update(READ_TOOL_HANDLERS)
    ARG_SCHEMAS.update(READ_TOOL_ARG_SCHEMAS)
    _SENSITIVE_TOOLS.update(READ_TOOL_SENSITIVE_TOOLS)
    TOOL_MODULE_GATES.update(READ_TOOL_MODULE_GATES)
except Exception as exc:  # pragma: no cover - defensive import guard
    logger.exception("Failed to load executive read tools: %s", exc)
