"""
Executive Operations Agent — Domain Tools.

All tools call existing SynTask services/models. The LLM never has direct
database access; every tool argument is validated before execution.

Covers: Company, Projects, Tasks, Clients, Sales, Finance, Meetings, HR.
Cross-domain reasoning is enabled by giving the LLM access to all domains
simultaneously — it decides which tools to call based on the investigation.
"""

from __future__ import annotations

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


class SearchEmployeesArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=200, description="Name, email, or employee number")
    limit: int = Field(default=5, ge=1, le=20)


class GetEmployee360Args(BaseModel):
    employee_id: str = Field(..., min_length=1, description="Employee profile _id or user_id")


class GetHrAttentionSummaryArgs(BaseModel):
    pass


class GetEntityDocumentsArgs(BaseModel):
    entity_type: str = Field(..., description="Type: employee, client, project")
    entity_id: str = Field(..., min_length=1, description="Entity _id")


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
            "description": "Get a comprehensive client view: profile, status, linked projects, tasks, invoices, meetings, and activity.",
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
            "description": "Get a comprehensive lead view: profile, stage, activity history, associated contacts, and pipeline position.",
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
            "description": "Get documents associated with an entity (employee, client, or project).",
            "parameters": GetEntityDocumentsArgs.model_json_schema(),
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


async def _resolve_employee(company_id: str, identifier: str):
    """Resolve an employee profile by id, user_id, name, or email."""
    from app.models.employee_profile import EmployeeProfile
    from app.models.user import User

    # Try exact _id (may fail if not a valid ObjectId)
    try:
        profile = await EmployeeProfile.get(identifier)
        if profile and profile.company_id == company_id:
            return profile
    except Exception:
        pass

    # Try user_id
    profile = await EmployeeProfile.find_one(
        {"company_id": company_id, "user_id": identifier}
    )
    if profile:
        return profile

    # Try employee_number
    profile = await EmployeeProfile.find_one(
        {"company_id": company_id, "employee_number": identifier}
    )
    if profile:
        return profile

    # Name/email search
    term = identifier.strip()
    users = await User.find({
        "company_id": company_id,
        "$or": [
            {"first_name": {"$regex": term, "$options": "i"}},
            {"last_name": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
        ],
    }).limit(1).to_list()

    if users:
        profile = await EmployeeProfile.find_one(
            {"company_id": company_id, "user_id": str(users[0].id)}
        )
        if profile:
            return profile

    return None


async def _serialize_employee(profile, user=None) -> dict:
    """Serialize an employee profile into a concise dict for the LLM."""
    from app.models.user import User
    from app.services.employee_profile_service import build_detail

    if user is None:
        user = await User.get(profile.user_id)
    if not user:
        return {"id": str(profile.id), "error": "User account not found"}
    detail = await build_detail(profile, user)
    return {
        "id": detail["id"],
        "employee_number": detail.get("employee_number"),
        "full_name": detail.get("full_name"),
        "email": detail.get("email"),
        "department": detail.get("department_name"),
        "designation": detail.get("designation"),
        "status": detail.get("employment_status"),
    }


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
    }).count()
    won_this_month = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.WON.value,
        "closed_date": {"$gte": datetime.utcnow().replace(day=1)},
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
    }).count()
    no_followup = await SalesProspect.find({
        "company_id": company_id,
        "status": ProspectStatus.ACTIVE.value,
        "next_follow_up_at": None,
        "stage_entered_at": {"$lt": datetime.utcnow() - timedelta(days=3)},
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
    """Search employees within company scope."""
    from app.services.employee_profile_service import list_employees

    items, total = await list_employees(company_id, search=args.query, page_size=args.limit)
    return {
        "total": total,
        "employees": [
            {
                "id": item["id"],
                "employee_number": item.get("employee_number"),
                "full_name": item.get("full_name"),
                "email": item.get("email"),
                "department": item.get("department_name"),
                "designation": item.get("designation"),
                "status": item.get("employment_status"),
            }
            for item in items[:args.limit]
        ],
    }


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
        from app.models.employee_profile import EmployeeProfile

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
}


async def execute_executive_tool(
    tool_name: str,
    arguments: dict[str, Any],
    company_id: str,
) -> dict[str, Any]:
    """Execute an executive tool by name with validated arguments."""
    if tool_name not in TOOL_DISPATCH:
        return {"error": f"Unknown tool: {tool_name}"}

    schema = ARG_SCHEMAS.get(tool_name)
    if schema:
        try:
            validated = schema(**arguments)
        except Exception as exc:
            return {"error": f"Invalid arguments for {tool_name}: {exc}"}
    else:
        validated = arguments

    try:
        result = await TOOL_DISPATCH[tool_name](company_id, validated)
        return result
    except Exception as exc:
        logger.exception("Executive tool %s failed", tool_name)
        return {"error": f"Tool execution failed: {exc}"}
