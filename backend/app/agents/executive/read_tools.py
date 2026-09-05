"""
Executive Read Tools — company-wide bounded READ capabilities.

These tools extend the Executive Operations Agent with company-wide read
coverage for real SynTask modules.  Every tool:

- is scoped by ``company_id`` (tenant isolation),
- returns compact, summary-first payloads (never hundreds of records to the LLM),
- is bounded via ``limit`` + ``has_more``,
- delegates to canonical SynTask services where a service-level read exists
  (employee directory, payroll periods), and otherwise reads models directly
  with the same business rules the SynTask services use.

HR capabilities themselves stay in the HR domain (``app.agents.hr.tools``);
Executive only surfaces *new* cross-company read shapes here.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared helpers (used by every tool below)
# ---------------------------------------------------------------------------

def _enum_value(enum_cls: Any, raw: Optional[str]) -> Optional[str]:
    """Map a user-provided status string to an enum's stored value.

    Accepts either the enum member name ("ACTIVE") or its value ("active"),
    case-insensitively.  Returns None when unrecognised (callers skip filter).
    """
    if raw is None:
        return None
    s = str(raw).strip().lower()
    for member in enum_cls:
        if member.name.lower() == s or str(member.value).lower() == s:
            return member.value
    return None


def _iso(value: Any) -> Optional[str]:
    """ISO-format a datetime/date for JSON, returning None for empty values."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _dt(value: Any) -> Optional[datetime]:
    """Normalize a stored datetime or date to a naive datetime for sorting."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, TypeError):
            return None
    return None


async def _user_name_map(company_id: str, user_ids: list[str]) -> dict[str, str]:
    """Batch-resolve user ids to display names (bounded, company-scoped)."""
    from bson import ObjectId

    from app.models.user import User

    ids: list[str] = []
    for uid in user_ids:
        if not uid or uid in ids:
            continue
        if ObjectId.is_valid(uid):
            ids.append(uid)
    if not ids:
        return {}
    try:
        users = await User.find({
            "company_id": company_id,
            "_id": {"$in": [ObjectId(uid) for uid in ids]},
        }).to_list()
    except Exception:
        return {}
    return {
        str(u.id): (f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email or str(u.id))
        for u in users
    }


async def _active_profiles(company_id: str) -> list[Any]:
    """All active + probation employee profiles for the company."""
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus

    return await EmployeeProfile.find({
        "company_id": company_id,
        "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
    }).to_list()


def _client_row(client: Any) -> dict[str, Any]:
    """Compact client row used by list + health payloads."""
    return {
        "id": str(client.id),
        "name": client.name,
        "company_name": client.company_name,
        "email": client.email,
        "status": client.status.value if hasattr(client.status, "value") else str(client.status),
        "client_type": client.client_type.value if hasattr(client.client_type, "value") else (str(client.client_type) if client.client_type else None),
        "assigned_to": client.assigned_to,
        "start_date": _iso(client.start_date),
        "delivery_date": _iso(client.delivery_date),
        "budget": client.budget,
    }


# ---------------------------------------------------------------------------
# Tool argument schemas
# ---------------------------------------------------------------------------

class ListClientsArgs(BaseModel):
    status: Optional[str] = Field(default=None, description="Filter by client status (new, onboarding, active, at_risk, on_hold, churned, archived)")
    limit: int = Field(default=10, ge=1, le=30)


class GetClientHealthArgs(BaseModel):
    client_id: str = Field(..., min_length=1, description="Client _id")


class GetClientTimelineArgs(BaseModel):
    client_id: str = Field(..., min_length=1, description="Client _id")
    limit: int = Field(default=15, ge=1, le=30)


class ListTasksArgs(BaseModel):
    query: Optional[str] = Field(default=None, description="Optional text search on task title or task id")
    status: Optional[str] = Field(default=None, description="Filter: todo, in_progress, in_review, completed, cancelled")
    project_id: Optional[str] = Field(default=None, description="Project key (e.g. PROJ-001) or project _id")
    assignee: Optional[str] = Field(default=None, description="User id or employee/user name")
    priority: Optional[str] = Field(default=None, description="Filter: low, medium, high, critical")
    limit: int = Field(default=15, ge=1, le=30)


class GetTaskDetailArgs(BaseModel):
    task_id: str = Field(..., min_length=1, description="Task _id")


class ListProjectsArgs(BaseModel):
    status: Optional[str] = Field(default=None, description="Filter by project status (active, execution, review, completed, on_hold, cancelled)")
    client_id: Optional[str] = Field(default=None, description="Only projects linked to this client _id")
    limit: int = Field(default=15, ge=1, le=30)


class GetProjectTimelineArgs(BaseModel):
    project_id: str = Field(..., min_length=1, description="Project key (e.g. PROJ-001) or _id")
    limit: int = Field(default=15, ge=1, le=30)


class ListLeadsArgs(BaseModel):
    query: Optional[str] = Field(default=None, description="Optional search by lead/company name or email")
    stage: Optional[str] = Field(default=None, description="Pipeline stage name")
    status: Optional[str] = Field(default=None, description="Filter: active, won, lost")
    assigned_to: Optional[str] = Field(default=None, description="Owner user id or name")
    limit: int = Field(default=15, ge=1, le=30)


class GetLeadActivityArgs(BaseModel):
    lead_id: str = Field(..., min_length=1, description="Lead (SalesProspect) _id")
    limit: int = Field(default=15, ge=1, le=30)


class ListCandidatesArgs(BaseModel):
    query: Optional[str] = Field(default=None, description="Optional search by name or email")
    status: Optional[str] = Field(default=None, description="Filter by candidate status (new, screening, shortlisted, interview_1/2, offer_sent, joined, rejected, ...)")
    job_id: Optional[str] = Field(default=None, description="Only candidates applied to this job")
    limit: int = Field(default=15, ge=1, le=30)


class ListJobsArgs(BaseModel):
    query: Optional[str] = Field(default=None, description="Optional search by title or id")
    status: Optional[str] = Field(default=None, description="Filter by lifecycle status (draft, pending_approval, approved, published, paused, closed, archived)")
    limit: int = Field(default=15, ge=1, le=30)


class ListInvoicesArgs(BaseModel):
    client: Optional[str] = Field(default=None, description="Client _id, name, or company name to filter invoices")
    status: Optional[str] = Field(default=None, description="Filter: draft, sent, paid, cancelled, or overdue")
    limit: int = Field(default=15, ge=1, le=30)


class GetInvoiceDetailArgs(BaseModel):
    invoice_id: str = Field(..., min_length=1, description="Invoice _id")


class ListMeetingsArgs(BaseModel):
    from_date: Optional[str] = Field(default=None, description="YYYY-MM-DD inclusive start")
    to_date: Optional[str] = Field(default=None, description="YYYY-MM-DD inclusive end")
    status: Optional[str] = Field(default=None, description="Filter: scheduled, ongoing, completed, cancelled")
    client_id: Optional[str] = Field(default=None, description="Only meetings with this client")
    project_id: Optional[str] = Field(default=None, description="Only meetings for this project")
    limit: int = Field(default=15, ge=1, le=30)


class GetMeetingDetailArgs(BaseModel):
    meeting_id: str = Field(..., min_length=1, description="Meeting _id")


class GetAttendanceRosterArgs(BaseModel):
    date_str: Optional[str] = Field(default=None, description="YYYY-MM-DD, defaults to today")
    limit: int = Field(default=15, ge=1, le=30)


class ListLeaveRequestsArgs(BaseModel):
    status: Optional[str] = Field(default=None, description="Filter: pending, forwarded, approved, rejected, cancelled")
    from_date: Optional[str] = Field(default=None, description="YYYY-MM-DD: only leaves starting on/after this date")
    to_date: Optional[str] = Field(default=None, description="YYYY-MM-DD: only leaves starting on/before this date")
    limit: int = Field(default=15, ge=1, le=30)


class GetPayrollHistoryArgs(BaseModel):
    status: Optional[str] = Field(default=None, description="Optional filter by payroll period status")
    limit: int = Field(default=12, ge=1, le=24)


class GetCompanyDocumentsArgs(BaseModel):
    expiring_days: Optional[int] = Field(default=None, ge=1, le=180, description="Only documents expiring within this many days")
    limit: int = Field(default=15, ge=1, le=30)


class ListEmployeesArgs(BaseModel):
    department_id: Optional[str] = Field(default=None, description="Department _id filter")
    employment_status: Optional[str] = Field(default=None, description="active, probation, onboarding, etc.")
    limit: int = Field(default=15, ge=1, le=50)


class GetOrgSummaryArgs(BaseModel):
    pass


class ListSprintsArgs(BaseModel):
    project_id: Optional[str] = Field(default=None, description="Project key (e.g. PROJ-001) or _id")
    state: Optional[str] = Field(default=None, description="Filter: future, active, closed")
    limit: int = Field(default=10, ge=1, le=25)


class ListEpicsArgs(BaseModel):
    project_id: Optional[str] = Field(default=None, description="Project key (e.g. PROJ-001) or _id")
    status: Optional[str] = Field(default=None, description="Filter: todo, in_progress, done")
    limit: int = Field(default=10, ge=1, le=25)


class GetEodSummaryArgs(BaseModel):
    report_date: Optional[str] = Field(default=None, description="YYYY-MM-DD, defaults to today")
    limit: int = Field(default=15, ge=1, le=30)


class GetClientDeliverablesArgs(BaseModel):
    client_id: Optional[str] = Field(default=None, description="Optional client _id; otherwise company-wide")
    status: Optional[str] = Field(default=None, description="Filter by deliverable status (planned, in_progress, delivered, ...)")
    limit: int = Field(default=15, ge=1, le=30)


class GetClientOnboardingArgs(BaseModel):
    client_id: Optional[str] = Field(default=None, description="Optional client _id; otherwise company-wide")
    limit: int = Field(default=15, ge=1, le=30)


class GetTimesheetSummaryArgs(BaseModel):
    from_date: Optional[str] = Field(default=None, description="YYYY-MM-DD inclusive start (defaults to 7 days ago)")
    to_date: Optional[str] = Field(default=None, description="YYYY-MM-DD inclusive end (defaults to today)")
    limit: int = Field(default=10, ge=1, le=20)


class GetTimeLogSummaryArgs(BaseModel):
    from_date: Optional[str] = Field(default=None, description="YYYY-MM-DD inclusive start (defaults to 7 days ago)")
    to_date: Optional[str] = Field(default=None, description="YYYY-MM-DD inclusive end (defaults to today)")
    limit: int = Field(default=10, ge=1, le=20)


class ListCrmCompaniesArgs(BaseModel):
    query: Optional[str] = Field(default=None, description="Optional search by name, email, or industry")
    limit: int = Field(default=15, ge=1, le=30)


class ListCrmContactsArgs(BaseModel):
    query: Optional[str] = Field(default=None, description="Optional search by name, email, or company name")
    company_id: Optional[str] = Field(default=None, description="Only contacts linked to this CRM company")
    limit: int = Field(default=15, ge=1, le=30)


class ListCrmDealsArgs(BaseModel):
    query: Optional[str] = Field(default=None, description="Optional search text")
    stage: Optional[str] = Field(default=None, description="Deal stage filter")
    limit: int = Field(default=15, ge=1, le=30)


class GetCrmDeal360Args(BaseModel):
    deal_id: str = Field(..., min_length=1, description="CRMDeal _id")


class ListTicketsArgs(BaseModel):
    status: Optional[str] = Field(default=None, description="Filter by ticket status")
    priority: Optional[str] = Field(default=None, description="Filter: low, medium, high, urgent")
    limit: int = Field(default=15, ge=1, le=30)


class ListContentItemsArgs(BaseModel):
    status: Optional[str] = Field(default=None, description="Filter by content status")
    project_id: Optional[str] = Field(default=None, description="Only items for this project")
    limit: int = Field(default=15, ge=1, le=30)


class ListKnowledgeArgs(BaseModel):
    query: Optional[str] = Field(default=None, description="Optional text search on title/summary/tags")
    limit: int = Field(default=15, ge=1, le=30)


# ---------------------------------------------------------------------------
# Implementations
# ---------------------------------------------------------------------------

async def execute_list_clients(company_id: str, args: ListClientsArgs) -> dict:
    """Company client directory (name/company/status) — bounded."""
    from app.models.client import Client, ClientStatus

    query: dict[str, Any] = {"company_id": company_id}
    if args.status:
        value = _enum_value(ClientStatus, args.status)
        if value is not None:
            query["status"] = value

    total = await Client.find(query).count()
    clients = await Client.find(query).sort("+name").limit(args.limit).to_list()

    status_counts: dict[str, int] = {}
    for client in clients:
        key = client.status.value if hasattr(client.status, "value") else str(client.status)
        status_counts[key] = status_counts.get(key, 0) + 1

    return {
        "total": total,
        "status_counts": status_counts,
        "has_more": len(clients) < total,
        "clients": [_client_row(c) for c in clients],
    }


async def execute_get_client_health(company_id: str, args: GetClientHealthArgs) -> dict:
    """Compact client health: projects, tasks, invoices, meetings, deliverables, onboarding."""
    from app.models.client import Client
    from app.models.invoice import Invoice
    from app.models.meeting import Meeting
    from app.models.project import Project
    from app.models.task import Task, TaskStatus
    from app.models.client_deliverable import ClientDeliverable
    from app.models.client_onboarding import ClientOnboarding

    client = await Client.get(args.client_id)
    if not client or client.company_id != company_id:
        return {"error": "Client not found."}

    now = datetime.utcnow()
    project_ids = client.project_ids or []

    projects = []
    for pid in project_ids[:20]:
        project = await Project.get(pid)
        if not project:
            project = await Project.find_one({"company_id": company_id, "project_id": pid})
        if project:
            projects.append({
                "id": str(project.id),
                "name": project.name,
                "project_id": project.project_id,
                "status": project.status.value if hasattr(project.status, "value") else str(project.status),
                "delivery_date": _iso(project.delivery_date),
                "delayed": bool(project.delivery_date and _dt(project.delivery_date) < now),
            })

    open_tasks = 0
    overdue_tasks = 0
    if project_ids:
        all_tasks = await Task.find({
            "company_id": company_id,
            "project_id": {"$in": project_ids},
            "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
        }).to_list()
        open_tasks = len(all_tasks)
        overdue_tasks = sum(1 for t in all_tasks if t.due_date and _dt(t.due_date) < now)

    invoices = await Invoice.find({"company_id": company_id, "client_id": str(client.id)}).to_list()
    outstanding = round(sum(inv.outstanding_amount or 0.0 for inv in invoices), 2)
    overdue_invoices = [
        inv for inv in invoices
        if inv.status.value == "sent" and inv.due_date and _dt(inv.due_date) < now
    ]

    meetings = await Meeting.find({"company_id": company_id, "client_id": str(client.id)}).to_list()
    recent_meetings = [m for m in meetings if m.meeting_date and _dt(m.meeting_date) >= now - timedelta(days=30)]
    last_meeting = max((m for m in meetings if m.meeting_date), key=lambda m: _dt(m.meeting_date), default=None)

    deliverables = await ClientDeliverable.find({"company_id": company_id, "client_id": str(client.id)}).to_list()
    onboarding = await ClientOnboarding.find_one({"company_id": company_id, "client_id": str(client.id)})

    flags: list[str] = []
    if overdue_tasks:
        flags.append(f"{overdue_tasks} overdue task(s)")
    if overdue_invoices:
        flags.append(f"{len(overdue_invoices)} overdue invoice(s)")
    if any(p.get("delayed") for p in projects):
        flags.append("delayed project(s)")
    if client.status.value == "at_risk":
        flags.append("client flagged at_risk")
    if not last_meeting:
        flags.append("no meetings recorded")
    elif (_dt(last_meeting.meeting_date) or now) < now - timedelta(days=30):
        flags.append("no client meeting in 30+ days")

    return {
        "client": _client_row(client),
        "projects": {"count": len(projects), "delayed": sum(1 for p in projects if p.get("delayed")), "items": projects[:10]},
        "tasks": {"open": open_tasks, "overdue": overdue_tasks},
        "finance": {
            "invoices": len(invoices),
            "total_outstanding": outstanding,
            "overdue_count": len(overdue_invoices),
        },
        "meetings": {
            "last_meeting": last_meeting.title if last_meeting else None,
            "last_meeting_date": _iso(last_meeting.meeting_date) if last_meeting else None,
            "last_30_days": len(recent_meetings),
        },
        "deliverables": {
            "total": len(deliverables),
            "pending_approval": sum(1 for d in deliverables if d.approval_status and d.approval_status.value not in ("approved", "not_sent")),
            "overdue": sum(1 for d in deliverables if d.due_date and _dt(d.due_date) < now and d.status.value != "delivered"),
        },
        "onboarding": {
            "status": onboarding.status.value if onboarding and hasattr(onboarding.status, "value") else (str(onboarding.status) if onboarding else None),
            "progress_percent": onboarding.progress_percent if onboarding else None,
            "blockers": (onboarding.blocking_item_keys or []) if onboarding else [],
        },
        "risk_flags": flags,
    }


async def execute_get_client_timeline(company_id: str, args: GetClientTimelineArgs) -> dict:
    """Recent client activity: invoices, meetings, deliverables, onboarding and task movement."""
    from app.models.client import Client
    from app.models.client_deliverable import ClientDeliverable
    from app.models.invoice import Invoice
    from app.models.meeting import Meeting
    from app.models.task import Task

    client = await Client.get(args.client_id)
    if not client or client.company_id != company_id:
        return {"error": "Client not found."}

    events: list[dict[str, Any]] = []
    project_ids = client.project_ids or []

    invoices = await Invoice.find({"company_id": company_id, "client_id": str(client.id)}).to_list()
    for inv in invoices[:50]:
        events.append({
            "ts": _iso(inv.created_at or inv.invoice_date),
            "type": "invoice",
            "title": f"Invoice {inv.invoice_number} {inv.status.value if hasattr(inv.status, 'value') else inv.status}",
            "detail": f"{inv.total_amount or 0:,.2f} · outstanding {inv.outstanding_amount or 0:,.2f}",
            "id": str(inv.id),
        })

    meetings = await Meeting.find({"company_id": company_id, "client_id": str(client.id)}).to_list()
    for m in meetings[:50]:
        events.append({
            "ts": _iso(m.meeting_date),
            "type": "meeting",
            "title": f"Meeting: {m.title}",
            "detail": m.status.value if hasattr(m.status, "value") else str(m.status),
            "id": str(m.id),
        })

    deliverables = await ClientDeliverable.find({"company_id": company_id, "client_id": str(client.id)}).to_list()
    for d in deliverables[:50]:
        events.append({
            "ts": _iso(d.updated_at or d.created_at),
            "type": "deliverable",
            "title": f"Deliverable: {d.title}",
            "detail": f"{d.status.value if hasattr(d.status, 'value') else d.status} · approval {d.approval_status.value if hasattr(d.approval_status, 'value') else d.approval_status}",
            "id": str(d.id),
        })

    if project_ids:
        recent_tasks = await Task.find({
            "company_id": company_id,
            "project_id": {"$in": project_ids},
        }).sort("-updated_at").limit(50).to_list()
        for t in recent_tasks:
            events.append({
                "ts": _iso(t.updated_at or t.created_at),
                "type": "task",
                "title": f"Task: {t.title}",
                "detail": f"status {t.status.value if hasattr(t.status, 'value') else t.status}",
                "id": str(t.id),
            })

    events.sort(key=lambda e: _dt(e.get("ts")) or datetime.min, reverse=True)
    events = events[: args.limit]
    return {
        "client_id": str(client.id),
        "client_name": client.name,
        "total_events_found": len(events),
        "events": events,
    }


async def execute_list_tasks(company_id: str, args: ListTasksArgs) -> dict:
    """Company open/closed task list with optional filters, bounded."""
    from app.models.task import Task, TaskPriority, TaskStatus

    query: dict[str, Any] = {"company_id": company_id}

    if args.query:
        term = args.query.strip()
        query["$or"] = [
            {"title": {"$regex": term, "$options": "i"}},
            {"description": {"$regex": term, "$options": "i"}},
        ]
    if args.status:
        value = _enum_value(TaskStatus, args.status)
        if value is not None:
            query["status"] = value
    if args.priority:
        pvalue = _enum_value(TaskPriority, args.priority)
        if pvalue is not None:
            query["priority"] = pvalue
    if args.project_id:
        from bson import ObjectId

        if ObjectId.is_valid(args.project_id):
            query["$or"] = query.get("$or", []) + [
                {"project_object_id": args.project_id},
                {"project_id": args.project_id},
            ]
        else:
            query["$or"] = query.get("$or", []) + [{"project_id": args.project_id}]
    if args.assignee:
        from app.agents.executive.tools import _resolve_user_by_name

        uid = await _resolve_user_by_name(company_id, args.assignee) or args.assignee
        query["assigned_to"] = uid

    total = await Task.find(query).count()
    tasks = await Task.find(query).sort("-updated_at").limit(args.limit).to_list()

    items = []
    for t in tasks:
        items.append({
            "id": str(t.id),
            "title": t.title,
            "project_id": t.project_id,
            "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            "priority": t.priority.value if hasattr(t.priority, "value") else str(t.priority),
            "assigned_to": t.assigned_to,
            "due_date": _iso(t.due_date),
            "health": t.health_status.value if hasattr(t.health_status, "value") else str(t.health_status),
        })

    return {"total": total, "has_more": len(tasks) < total, "tasks": items}


async def execute_get_task_detail(company_id: str, args: GetTaskDetailArgs) -> dict:
    """Single task detail with assignee + project context."""
    from app.models.task import Task

    task = await Task.get(args.task_id)
    if not task or task.company_id != company_id:
        return {"error": "Task not found."}

    assignee_name = None
    if task.assigned_to:
        assignee_name = (await _user_name_map(company_id, [task.assigned_to])).get(task.assigned_to)

    project_info = None
    if task.project_id or task.project_object_id:
        from app.models.project import Project

        project = None
        if task.project_object_id:
            project = await Project.get(task.project_object_id)
        if not project and task.project_id:
            project = await Project.find_one({"company_id": company_id, "project_id": task.project_id})
        if project:
            project_info = {
                "id": str(project.id),
                "name": project.name,
                "project_id": project.project_id,
                "status": project.status.value if hasattr(project.status, "value") else str(project.status),
            }

    return {
        "task": {
            "id": str(task.id),
            "title": task.title,
            "description": (task.description or "")[:2000],
            "status": task.status.value if hasattr(task.status, "value") else str(task.status),
            "priority": task.priority.value if hasattr(task.priority, "value") else str(task.priority),
            "progress_percentage": task.progress_percentage,
            "health_status": task.health_status.value if hasattr(task.health_status, "value") else str(task.health_status),
            "assigned_to": task.assigned_to,
            "assignee_name": assignee_name,
            "start_date": _iso(task.start_date),
            "due_date": _iso(task.due_date),
            "completed_at": _iso(task.completed_at),
            "created_at": _iso(task.created_at),
            "tags": task.tags or [],
            "estimated_hours": task.estimated_hours,
            "actual_hours": task.actual_hours,
            "story_points": task.story_points,
            "epic_id": task.epic_id,
            "sprint_id": task.sprint_id,
            "parent_task_id": task.parent_task_id,
        },
        "project": project_info,
    }


async def execute_list_projects(company_id: str, args: ListProjectsArgs) -> dict:
    """Company project directory, bounded."""
    from app.models.project import Project, ProjectStatus

    query: dict[str, Any] = {"company_id": company_id}
    if args.status:
        value = _enum_value(ProjectStatus, args.status)
        if value is not None:
            query["status"] = value
    if args.client_id:
        query["client_id"] = args.client_id

    total = await Project.find(query).count()
    projects = await Project.find(query).sort("-created_at").limit(args.limit).to_list()

    return {
        "total": total,
        "has_more": len(projects) < total,
        "projects": [
            {
                "id": str(p.id),
                "name": p.name,
                "key": p.key,
                "project_id": p.project_id,
                "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                "client_id": p.client_id,
                "lead_id": p.lead_id,
                "start_date": _iso(p.start_date),
                "delivery_date": _iso(p.delivery_date),
            }
            for p in projects
        ],
    }


async def execute_get_project_timeline(company_id: str, args: GetProjectTimelineArgs) -> dict:
    """Recent project activity: task movement, meetings and invoices linked to the project."""
    from app.models.invoice import Invoice
    from app.models.meeting import Meeting
    from app.models.project import Project
    from app.models.task import Task

    project = await Project.get(args.project_id)
    if not project or project.company_id != company_id:
        project = await Project.find_one({"company_id": company_id, "project_id": args.project_id})
    if not project:
        return {"error": "Project not found."}

    logical_id = project.project_id
    object_id = str(project.id)
    events: list[dict[str, Any]] = []

    recent_tasks = await Task.find({
        "company_id": company_id,
        "$or": [{"project_id": logical_id}, {"project_object_id": object_id}],
    }).sort("-updated_at").limit(50).to_list()
    for t in recent_tasks:
        events.append({
            "ts": _iso(t.updated_at or t.created_at),
            "type": "task",
            "title": f"Task: {t.title}",
            "detail": f"status {t.status.value if hasattr(t.status, 'value') else t.status}",
            "id": str(t.id),
        })

    meetings = await Meeting.find({
        "company_id": company_id,
        "$or": [{"project_id": logical_id}, {"project_id": object_id}],
    }).to_list()
    for m in meetings[:50]:
        events.append({
            "ts": _iso(m.meeting_date),
            "type": "meeting",
            "title": f"Meeting: {m.title}",
            "detail": m.status.value if hasattr(m.status, "value") else str(m.status),
            "id": str(m.id),
        })

    invoices = await Invoice.find({
        "company_id": company_id,
        "$or": [{"project_id": logical_id}, {"project_id": object_id}],
    }).to_list()
    for inv in invoices[:50]:
        events.append({
            "ts": _iso(inv.created_at or inv.invoice_date),
            "type": "invoice",
            "title": f"Invoice {inv.invoice_number}",
            "detail": f"{inv.total_amount or 0:,.2f} · {inv.status.value if hasattr(inv.status, 'value') else inv.status}",
            "id": str(inv.id),
        })

    events.sort(key=lambda e: _dt(e.get("ts")) or datetime.min, reverse=True)
    events = events[: args.limit]
    return {
        "project_id": project.project_id,
        "project_name": project.name,
        "total_events_found": len(events),
        "events": events,
    }


async def execute_list_leads(company_id: str, args: ListLeadsArgs) -> dict:
    """Sales pipeline directory (leads/prospects), bounded."""
    from app.models.sales_prospect import SalesProspect, ProspectStatus

    query: dict[str, Any] = {"company_id": company_id, "deleted": False}

    if args.query:
        term = args.query.strip()
        query["$or"] = [
            {"prospect_name": {"$regex": term, "$options": "i"}},
            {"first_name": {"$regex": term, "$options": "i"}},
            {"last_name": {"$regex": term, "$options": "i"}},
            {"company_name": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
        ]
    if args.stage:
        query["current_stage"] = {"$regex": f"^{args.stage.strip()}$", "$options": "i"}
    if args.status:
        value = _enum_value(ProspectStatus, args.status)
        if value is not None:
            query["status"] = value
    if args.assigned_to:
        from app.agents.executive.tools import _resolve_user_by_name

        uid = await _resolve_user_by_name(company_id, args.assigned_to) or args.assigned_to
        query["assigned_to"] = uid

    total = await SalesProspect.find(query).count()
    leads = await SalesProspect.find(query).sort("-created_at").limit(args.limit).to_list()

    stage_counts: dict[str, int] = {}
    for lead in leads:
        stage = lead.current_stage or "unknown"
        stage_counts[stage] = stage_counts.get(stage, 0) + 1

    return {
        "total": total,
        "has_more": len(leads) < total,
        "stage_counts": stage_counts,
        "leads": [
            {
                "id": str(l.id),
                "name": l.prospect_name or f"{l.first_name or ''} {l.last_name or ''}".strip(),
                "email": l.email,
                "company": l.company_name,
                "stage": l.current_stage,
                "status": l.status.value if hasattr(l.status, "value") else str(l.status),
                "assigned_to": l.assigned_to,
                "next_follow_up": _iso(l.next_follow_up_at),
                "value": l.budget,
            }
            for l in leads
        ],
    }


async def execute_get_lead_activity(company_id: str, args: GetLeadActivityArgs) -> dict:
    """Recent CRM activity + follow-up trail for one lead, bounded."""
    from app.models.crm_activity import CRMActivity
    from app.models.sales_prospect import SalesProspect

    lead = await SalesProspect.get(args.lead_id)
    if not lead or lead.company_id != company_id:
        return {"error": "Lead not found."}

    activities = await CRMActivity.find({
        "company_id": company_id,
        "entity_id": args.lead_id,
        "deleted": False,
    }).sort("-created_at").limit(args.limit).to_list()

    return {
        "lead_id": str(lead.id),
        "lead_name": lead.prospect_name or f"{lead.first_name or ''} {lead.last_name or ''}".strip(),
        "current_stage": lead.current_stage,
        "next_follow_up": _iso(lead.next_follow_up_at),
        "last_contacted": _iso(lead.last_contacted_at),
        "activity_total_found": len(activities),
        "activities": [
            {
                "id": str(a.id),
                "type": a.activity_type,
                "title": a.title,
                "status": a.status.value if hasattr(a.status, "value") else str(a.status),
                "due_date": _iso(a.due_date),
                "completed_at": _iso(a.completed_at),
                "created_at": _iso(a.created_at),
                "owner_name": a.owner_name,
            }
            for a in activities
        ],
    }


async def execute_list_candidates(company_id: str, args: ListCandidatesArgs) -> dict:
    """Company candidate directory, bounded."""
    from app.recruitment.models import Candidate, CandidateStatus

    query: dict[str, Any] = {"company_id": company_id, "deleted_at": None}
    if args.query:
        term = args.query.strip()
        query["$or"] = [
            {"full_name": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
            {"current_company": {"$regex": term, "$options": "i"}},
        ]
    if args.status:
        value = _enum_value(CandidateStatus, args.status)
        if value is not None:
            query["status"] = value
    if args.job_id:
        query["job_id"] = args.job_id

    total = await Candidate.find(query).count()
    candidates = await Candidate.find(query).sort("-created_at").limit(args.limit).to_list()

    return {
        "total": total,
        "has_more": len(candidates) < total,
        "candidates": [
            {
                "id": str(c.id),
                "full_name": c.full_name,
                "email": c.email,
                "status": c.status.value if hasattr(c.status, "value") else str(c.status),
                "job_id": c.job_id,
                "current_company": c.current_company,
                "experience_years": c.experience_years,
                "expected_salary": c.expected_salary,
                "created_at": _iso(c.created_at),
            }
            for c in candidates
        ],
    }


async def execute_list_jobs(company_id: str, args: ListJobsArgs) -> dict:
    """Company job openings directory (all lifecycle states), bounded."""
    from app.recruitment.models import JobLifecycleStatus, RecruitmentJob

    query: dict[str, Any] = {"company_id": company_id, "deleted_at": None}
    if args.query:
        term = args.query.strip()
        query["$or"] = [
            {"title": {"$regex": term, "$options": "i"}},
            {"slug": {"$regex": term, "$options": "i"}},
        ]
    if args.status:
        value = _enum_value(JobLifecycleStatus, args.status)
        if value is not None:
            query["lifecycle_status"] = value

    total = await RecruitmentJob.find(query).count()
    jobs = await RecruitmentJob.find(query).sort("-created_at").limit(args.limit).to_list()

    return {
        "total": total,
        "has_more": len(jobs) < total,
        "jobs": [
            {
                "id": str(j.id),
                "title": j.title,
                "department_id": j.department_id,
                "status": j.lifecycle_status.value if hasattr(j.lifecycle_status, "value") else str(j.lifecycle_status),
                "openings": j.openings,
                "location": j.location,
                "experience_min": j.experience_min,
                "experience_max": j.experience_max,
                "salary_min": j.salary_min,
                "salary_max": j.salary_max,
                "application_deadline": _iso(j.application_deadline),
                "applications": (j.analytics_counters.total_applications if j.analytics_counters else 0),
                "created_at": _iso(j.created_at),
            }
            for j in jobs
        ],
    }


async def execute_list_invoices(company_id: str, args: ListInvoicesArgs) -> dict:
    """Invoice list with filters and compact financial summary."""
    from app.models.invoice import Invoice, InvoiceStatus

    query: dict[str, Any] = {"company_id": company_id}

    if args.client:
        term = args.client.strip()
        from bson import ObjectId

        if ObjectId.is_valid(term):
            query["client_id"] = term
        else:
            query["$or"] = [
                {"client_name": {"$regex": term, "$options": "i"}},
                {"client_company_name": {"$regex": term, "$options": "i"}},
            ]

    overdue_only = False
    if args.status:
        if args.status.strip().lower() == "overdue":
            overdue_only = True
        else:
            value = _enum_value(InvoiceStatus, args.status)
            if value is not None:
                query["status"] = value

    now = datetime.utcnow()
    invoices = await Invoice.find(query).sort("-invoice_date").limit(200).to_list()
    total = await Invoice.find(query).count()

    if overdue_only:
        invoices = [inv for inv in invoices if inv.status.value == "sent" and inv.due_date and _dt(inv.due_date) < now]

    total_invoiced = round(sum(inv.total_amount or 0.0 for inv in invoices), 2)
    total_outstanding = round(sum(inv.outstanding_amount or 0.0 for inv in invoices), 2)
    paid = round(sum(inv.total_received or 0.0 for inv in invoices), 2)
    overdue_count = sum(
        1 for inv in invoices
        if inv.status.value == "sent" and inv.due_date and _dt(inv.due_date) < now
    )

    rows = invoices[: args.limit]
    return {
        "total": total,
        "overdue_only": overdue_only,
        "summary": {
            "invoiced": total_invoiced,
            "received": paid,
            "outstanding": total_outstanding,
            "overdue_count": overdue_count,
        },
        "has_more": len(rows) < len(invoices) or len(invoices) < total,
        "invoices": [
            {
                "id": str(inv.id),
                "invoice_number": inv.invoice_number,
                "client_id": inv.client_id,
                "client_name": inv.client_name,
                "status": inv.status.value if hasattr(inv.status, "value") else str(inv.status),
                "invoice_date": _iso(inv.invoice_date),
                "due_date": _iso(inv.due_date),
                "total_amount": inv.total_amount,
                "outstanding_amount": inv.outstanding_amount,
                "overdue": bool(inv.status.value == "sent" and inv.due_date and _dt(inv.due_date) < now),
            }
            for inv in rows
        ],
    }


async def execute_get_invoice_detail(company_id: str, args: GetInvoiceDetailArgs) -> dict:
    """Full invoice detail incl. line items and payment history."""
    from app.models.invoice import Invoice

    invoice = await Invoice.get(args.invoice_id)
    if not invoice or invoice.company_id != company_id:
        return {"error": "Invoice not found."}

    return {
        "invoice": {
            "id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "invoice_type": invoice.invoice_type.value if hasattr(invoice.invoice_type, "value") else str(invoice.invoice_type),
            "status": invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status),
            "client_id": invoice.client_id,
            "client_name": invoice.client_name,
            "client_company_name": invoice.client_company_name,
            "project_id": invoice.project_id,
            "invoice_date": _iso(invoice.invoice_date),
            "due_date": _iso(invoice.due_date),
            "subtotal": invoice.subtotal,
            "tax_rate": invoice.tax_rate,
            "tax_amount": invoice.tax_amount,
            "total_amount": invoice.total_amount,
            "total_received": invoice.total_received,
            "outstanding_amount": invoice.outstanding_amount,
            "currency": invoice.currency,
            "notes": invoice.notes,
            "items": (invoice.items or [])[:50],
        },
        "payments": [
            {
                "date": _iso(p.get("date")),
                "amount": p.get("amount"),
                "method": p.get("method"),
                "reference": p.get("reference"),
                "received_by": p.get("received_by"),
            }
            for p in (invoice.payments or [])[-20:]
        ],
    }


async def execute_list_meetings(company_id: str, args: ListMeetingsArgs) -> dict:
    """Meeting list within an optional window, bounded."""
    from app.models.meeting import Meeting, MeetingStatus

    query: dict[str, Any] = {"company_id": company_id}

    if args.from_date:
        try:
            start = datetime.combine(date.fromisoformat(args.from_date), datetime.min.time())
            query["meeting_date"] = {"$gte": start}
        except ValueError:
            return {"error": "Invalid from_date. Use YYYY-MM-DD."}
    if args.to_date:
        try:
            end = datetime.combine(date.fromisoformat(args.to_date) + timedelta(days=1), datetime.min.time())
            query.setdefault("meeting_date", {})
            query["meeting_date"]["$lt"] = end
        except ValueError:
            return {"error": "Invalid to_date. Use YYYY-MM-DD."}
    if args.status:
        value = _enum_value(MeetingStatus, args.status)
        if value is not None:
            query["status"] = value
    if args.client_id:
        query["client_id"] = args.client_id
    if args.project_id:
        query["project_id"] = args.project_id

    total = await Meeting.find(query).count()
    meetings = await Meeting.find(query).sort("-meeting_date").limit(args.limit).to_list()

    return {
        "total": total,
        "has_more": len(meetings) < total,
        "meetings": [
            {
                "id": str(m.id),
                "title": m.title,
                "meeting_date": _iso(m.meeting_date),
                "meeting_time": m.meeting_time,
                "duration": m.duration,
                "status": m.status.value if hasattr(m.status, "value") else str(m.status),
                "client_id": m.client_id,
                "project_id": m.project_id,
                "participants": len(m.participant_ids or []),
            }
            for m in meetings
        ],
    }


async def execute_get_meeting_detail(company_id: str, args: GetMeetingDetailArgs) -> dict:
    """Single meeting detail with participant names."""
    from app.models.meeting import Meeting

    meeting = await Meeting.get(args.meeting_id)
    if not meeting or meeting.company_id != company_id:
        return {"error": "Meeting not found."}

    participant_names = await _user_name_map(company_id, list(meeting.participant_ids or []))
    client_name = None
    if meeting.client_id:
        from app.models.client import Client

        client = await Client.get(meeting.client_id)
        client_name = client.name if client and client.company_id == company_id else None

    return {
        "meeting": {
            "id": str(meeting.id),
            "title": meeting.title,
            "description": meeting.description,
            "meeting_date": _iso(meeting.meeting_date),
            "meeting_time": meeting.meeting_time,
            "duration": meeting.duration,
            "status": meeting.status.value if hasattr(meeting.status, "value") else str(meeting.status),
            "host_id": meeting.host_id,
            "client_id": meeting.client_id,
            "client_name": client_name,
            "project_id": meeting.project_id,
            "contact_id": meeting.contact_id,
            "participant_count": len(meeting.participant_ids or []),
            "participants": participant_names,
            "meeting_url": getattr(meeting, "zoom_meeting_url", None),
        }
    }


async def execute_get_attendance_roster(company_id: str, args: GetAttendanceRosterArgs) -> dict:
    """Company attendance roster for a date: status counts + absent names."""
    from app.models.attendance import Attendance, AttendanceStatus

    try:
        target = date.fromisoformat(args.date_str) if args.date_str else datetime.utcnow().date()
    except ValueError:
        return {"error": "Invalid date. Use YYYY-MM-DD."}

    profiles = await _active_profiles(company_id)
    user_ids = {p.user_id for p in profiles if p.user_id}

    day_records = await Attendance.find({
        "company_id": company_id,
        "date": target.isoformat(),
    }).to_list()

    present_statuses = {
        AttendanceStatus.PRESENT.value,
        AttendanceStatus.LATE.value,
        AttendanceStatus.WORKING.value,
        AttendanceStatus.ON_BREAK.value,
        AttendanceStatus.CHECKED_OUT.value,
    }
    present_ids: set[str] = set()
    status_counts: dict[str, int] = {}
    late_ids: set[str] = set()
    on_leave_ids: set[str] = set()
    for rec in day_records:
        status = rec.status.value if hasattr(rec.status, "value") else str(rec.status)
        status_counts[status] = status_counts.get(status, 0) + 1
        if status in present_statuses:
            present_ids.add(rec.employee_id)
        if getattr(rec, "is_late", False):
            late_ids.add(rec.employee_id)
        if getattr(rec, "leave_status", None):
            on_leave_ids.add(rec.employee_id)
    if AttendanceStatus.LATE.value in status_counts:
        present_ids.update(late_ids)

    absent_ids = sorted(user_ids - present_ids - on_leave_ids)
    names = await _user_name_map(company_id, absent_ids[:50])

    return {
        "date": target.isoformat(),
        "summary": {
            "total_active_employees": len(user_ids),
            "present": len(present_ids),
            "absent": len(absent_ids),
            "on_leave": len(on_leave_ids),
            "late": len(late_ids),
            "status_counts": status_counts,
        },
        "absent_employees": [
            {"user_id": uid, "name": names.get(uid, uid)} for uid in absent_ids[: args.limit]
        ],
        "has_more_absent": len(absent_ids) > args.limit,
    }


async def execute_list_leave_requests(company_id: str, args: ListLeaveRequestsArgs) -> dict:
    """Company leave-request list, bounded, with employee names."""
    from app.models.leave import LeaveRequest, LeaveStatus

    query: dict[str, Any] = {"company_id": company_id}
    if args.status:
        value = _enum_value(LeaveStatus, args.status)
        if value is not None:
            query["status"] = value
    if args.from_date:
        try:
            query["start_date"] = {"$gte": datetime.combine(date.fromisoformat(args.from_date), datetime.min.time())}
        except ValueError:
            return {"error": "Invalid from_date. Use YYYY-MM-DD."}
    if args.to_date:
        try:
            bound = datetime.combine(date.fromisoformat(args.to_date) + timedelta(days=1), datetime.min.time())
            query.setdefault("start_date", {})
            query["start_date"]["$lt"] = bound
        except ValueError:
            return {"error": "Invalid to_date. Use YYYY-MM-DD."}

    total = await LeaveRequest.find(query).count()
    requests = await LeaveRequest.find(query).sort("+start_date").limit(args.limit).to_list()
    names = await _user_name_map(company_id, [r.employee_id for r in requests])

    return {
        "total": total,
        "has_more": len(requests) < total,
        "leave_requests": [
            {
                "id": str(r.id),
                "employee_id": r.employee_id,
                "employee_name": names.get(r.employee_id, r.employee_id),
                "leave_type": (r.leave_type.value if hasattr(r.leave_type, "value") else (str(r.leave_type) if r.leave_type else r.leave_type_id)),
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "start_date": _iso(r.start_date),
                "end_date": _iso(r.end_date),
                "duration": r.duration.value if hasattr(r.duration, "value") else (str(r.duration) if r.duration else None),
                "requested_units": r.requested_units,
                "reason": (r.reason or "")[:200],
                "created_at": _iso(r.created_at),
            }
            for r in requests
        ],
    }


async def execute_get_payroll_history(company_id: str, args: GetPayrollHistoryArgs) -> dict:
    """Payroll run history — reuses the canonical payroll service."""
    from app.services.payroll_service import list_payroll_periods, serialize_period

    periods = await list_payroll_periods(company_id, status_filter=args.status)
    rows = [serialize_period(p) for p in periods[: args.limit]]

    return {
        "total_periods": len(periods),
        "has_more": len(periods) > args.limit,
        "periods": [
            {
                "id": r["id"],
                "year": r["year"],
                "month": r["month"],
                "period_start": _iso(r["period_start"]),
                "period_end": _iso(r["period_end"]),
                "status": r["status"],
                "employee_count": r["employee_count"],
                "ready_count": r["ready_count"],
                "warning_count": r["warning_count"],
                "blocked_count": r["blocked_count"],
                "total_net": r["total_net"],
                "approved_at": _iso(r["approved_at"]),
                "processed_at": _iso(r["processed_at"]),
            }
            for r in rows
        ],
    }


async def execute_get_company_documents(company_id: str, args: GetCompanyDocumentsArgs) -> dict:
    """Company HR-document register with optional expiry horizon."""
    from app.models.hr_document import HRDocument

    query: dict[str, Any] = {
        "company_id": company_id,
        "archived_at": None,
    }
    now = datetime.utcnow()

    docs = await HRDocument.find(query).to_list()

    if args.expiring_days:
        horizon = now + timedelta(days=args.expiring_days)
        docs = [d for d in docs if d.expiry_date and now <= d.expiry_date <= horizon]

    def _owner_name(doc: Any) -> Optional[str]:
        if doc.employee_id:
            return (employee_names.get(doc.employee_id)) or doc.employee_id
        if doc.candidate_id:
            return f"candidate:{doc.candidate_id}"
        return None

    employee_ids = [d.employee_id for d in docs if d.employee_id]
    employee_names = await _user_name_map(company_id, list(employee_ids))

    total_all = await HRDocument.find({"company_id": company_id, "archived_at": None}).count()
    expiring_soon = sum(
        1 for d in docs
        if d.expiry_date and now <= d.expiry_date <= now + timedelta(days=30)
    )

    rows = docs[: args.limit]
    return {
        "total_documents": total_all,
        "filtered_count": len(docs),
        "expiring_within_30_days": expiring_soon,
        "has_more": len(docs) > args.limit,
        "documents": [
            {
                "id": str(d.id),
                "owner": _owner_name(d),
                "document_type": getattr(d, "document_type", None) or d.document_type_id,
                "status": d.status.value if hasattr(d.status, "value") else str(d.status),
                "expiry_date": _iso(d.expiry_date),
                "description": (d.description or "")[:160],
            }
            for d in rows
        ],
    }


async def execute_list_employees(company_id: str, args: ListEmployeesArgs) -> dict:
    """Employee directory (company-wide LIST) — reuses employee_profile_service."""
    from app.services.employee_profile_service import list_employees

    items, total = await list_employees(
        company_id,
        department_id=args.department_id,
        employment_status=args.employment_status,
        page_size=max(1, min(args.limit, 50)),
    )

    return {
        "total": total,
        "has_more": total > args.limit,
        "employees": [
            {
                "id": item.get("id"),
                "employee_number": item.get("employee_number"),
                "full_name": item.get("full_name"),
                "email": item.get("email"),
                "department": item.get("department_name"),
                "designation": item.get("designation"),
                "status": item.get("employment_status"),
            }
            for item in items[: args.limit]
        ],
    }


async def execute_get_org_summary(company_id: str, args: GetOrgSummaryArgs) -> dict:
    """Org structure summary: departments, headcount and managers."""
    from app.models.department import Department
    from app.models.employee_profile import EmployeeProfile

    departments = await Department.find({"company_id": company_id, "deleted_at": None}).to_list()

    headcount: dict[str, int] = {}
    for profile in await _active_profiles(company_id):
        if profile.department_id:
            headcount[profile.department_id] = headcount.get(profile.department_id, 0) + 1

    manager_ids = [d.manager_id for d in departments if d.manager_id]
    manager_names = await _user_name_map(company_id, list(manager_ids))

    total_employees = await EmployeeProfile.find({"company_id": company_id}).count()

    return {
        "total_employees": total_employees,
        "total_departments": len(departments),
        "departments": [
            {
                "id": str(d.id),
                "name": d.name,
                "department_type": d.department_type.value if hasattr(d.department_type, "value") else str(d.department_type),
                "manager_id": d.manager_id,
                "manager_name": manager_names.get(d.manager_id) if d.manager_id else None,
                "headcount": headcount.get(str(d.id), 0),
            }
            for d in departments
        ],
    }


async def execute_list_sprints(company_id: str, args: ListSprintsArgs) -> dict:
    """Sprint list (across projects) with open-task counts."""
    from app.models.project import Sprint

    query: dict[str, Any] = {"company_id": company_id}
    if args.state:
        query["state"] = args.state
    if args.project_id:
        from bson import ObjectId

        if ObjectId.is_valid(args.project_id):
            query["project_id"] = args.project_id
        else:
            query["project_id"] = args.project_id

    sprints = await Sprint.find(query).sort("-start_date").limit(args.limit).to_list()
    total = await Sprint.find(query).count()

    rows = []
    for sprint in sprints:
        from app.models.task import Task, TaskStatus

        open_tasks = await Task.find({
            "company_id": company_id,
            "sprint_id": str(sprint.id),
            "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
        }).count()
        rows.append({
            "id": str(sprint.id),
            "name": sprint.name,
            "project_id": sprint.project_id,
            "state": sprint.state,
            "goal": (sprint.goal or "")[:160],
            "start_date": _iso(sprint.start_date),
            "end_date": _iso(sprint.end_date),
            "completed_at": _iso(sprint.completed_at),
            "open_tasks": open_tasks,
        })

    return {"total": total, "has_more": total > len(rows), "sprints": rows}


async def execute_list_epics(company_id: str, args: ListEpicsArgs) -> dict:
    """Epic list (across projects), bounded."""
    from app.models.project import Epic

    query: dict[str, Any] = {"company_id": company_id}
    if args.status:
        query["status"] = args.status
    if args.project_id:
        query["project_id"] = args.project_id

    epics = await Epic.find(query).sort("-updated_at").limit(args.limit).to_list()
    total = await Epic.find(query).count()

    project_ids = {e.project_id for e in epics}
    project_names: dict[str, str] = {}
    if project_ids:
        from app.models.project import Project

        for pid in project_ids:
            project = await Project.find_one({"company_id": company_id, "project_id": pid})
            if project:
                project_names[pid] = project.name

    return {
        "total": total,
        "has_more": total > len(epics),
        "epics": [
            {
                "id": str(e.id),
                "name": e.name,
                "project_id": e.project_id,
                "project_name": project_names.get(e.project_id),
                "status": e.status,
                "progress_percentage": e.progress_percentage,
                "owner_id": e.owner_id,
                "start_date": _iso(e.start_date),
                "due_date": _iso(e.due_date),
            }
            for e in epics
        ],
    }


async def execute_get_eod_summary(company_id: str, args: GetEodSummaryArgs) -> dict:
    """EOD coverage for a date: who submitted and who is missing."""
    from app.models.eod import EODReport

    try:
        target = date.fromisoformat(args.report_date) if args.report_date else datetime.utcnow().date()
    except ValueError:
        return {"error": "Invalid report_date. Use YYYY-MM-DD."}

    reports = await EODReport.find({
        "company_id": company_id,
        "report_date": target,
    }).to_list()

    submitted_user_ids = [r.employee_id for r in reports]
    names = await _user_name_map(company_id, submitted_user_ids)

    active_profiles = await _active_profiles(company_id)
    active_ids = {p.user_id for p in active_profiles if p.user_id}
    missing_ids = sorted(active_ids - set(submitted_user_ids))
    missing_names = await _user_name_map(company_id, missing_ids[:50])

    reports.sort(key=lambda r: getattr(r, "total_working_seconds", 0) or 0, reverse=True)
    rows = reports[: args.limit]

    return {
        "date": target.isoformat(),
        "summary": {
            "active_employees": len(active_ids),
            "submitted": len(reports),
            "missing": len(missing_ids),
        },
        "submitted_reports": [
            {
                "employee_id": r.employee_id,
                "employee_name": names.get(r.employee_id, r.employee_id),
                "worked_on": (r.worked_on or "")[:200],
                "blockers": (r.blockers or "")[:200],
                "total_working_seconds": getattr(r, "total_working_seconds", 0) or 0,
            }
            for r in rows
        ],
        "missing_employees": [
            {"user_id": uid, "name": missing_names.get(uid, uid)} for uid in missing_ids[: args.limit]
        ],
        "has_more_missing": len(missing_ids) > args.limit,
    }


async def execute_get_client_deliverables(company_id: str, args: GetClientDeliverablesArgs) -> dict:
    """Client deliverables register: status/approval view, bounded."""
    from app.models.client_deliverable import ClientDeliverable

    query: dict[str, Any] = {"company_id": company_id}
    if args.client_id:
        query["client_id"] = args.client_id
    if args.status:
        query["status"] = args.status

    deliverables = await ClientDeliverable.find(query).sort("+due_date").to_list()
    total = len(deliverables)

    status_counts: dict[str, int] = {}
    approval_counts: dict[str, int] = {}
    overdue = 0
    now = datetime.utcnow()
    for d in deliverables:
        key = d.status.value if hasattr(d.status, "value") else str(d.status)
        status_counts[key] = status_counts.get(key, 0) + 1
        akey = d.approval_status.value if hasattr(d.approval_status, "value") else str(d.approval_status)
        approval_counts[akey] = approval_counts.get(akey, 0) + 1
        if d.due_date and _dt(d.due_date) < now and d.status.value != "delivered":
            overdue += 1

    client_ids = list({d.client_id for d in deliverables[: args.limit] if d.client_id})
    client_names: dict[str, str] = {}
    if client_ids:
        from app.models.client import Client

        for cid in client_ids:
            client = await Client.get(cid)
            if client and client.company_id == company_id:
                client_names[cid] = client.name

    rows = deliverables[: args.limit]
    return {
        "total": total,
        "overdue": overdue,
        "status_counts": status_counts,
        "approval_counts": approval_counts,
        "has_more": total > len(rows),
        "deliverables": [
            {
                "id": str(d.id),
                "client_id": d.client_id,
                "client_name": client_names.get(d.client_id),
                "title": d.title,
                "status": d.status.value if hasattr(d.status, "value") else str(d.status),
                "approval_status": d.approval_status.value if hasattr(d.approval_status, "value") else str(d.approval_status),
                "due_date": _iso(d.due_date),
                "delivered_at": _iso(d.delivered_at),
                "revision_count": d.revision_count,
            }
            for d in rows
        ],
    }


async def execute_get_client_onboarding(company_id: str, args: GetClientOnboardingArgs) -> dict:
    """Client onboarding progress view, bounded."""
    from app.models.client_onboarding import ClientOnboarding

    query: dict[str, Any] = {"company_id": company_id}
    if args.client_id:
        query["client_id"] = args.client_id

    records = await ClientOnboarding.find(query).to_list()
    total = len(records)

    client_ids = list({r.client_id for r in records[: args.limit] if r.client_id})
    client_names: dict[str, str] = {}
    if client_ids:
        from app.models.client import Client

        for cid in client_ids:
            client = await Client.get(cid)
            if client and client.company_id == company_id:
                client_names[cid] = client.name

    rows = records[: args.limit]
    return {
        "total": total,
        "has_more": total > len(rows),
        "onboarding": [
            {
                "client_id": r.client_id,
                "client_name": client_names.get(r.client_id),
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "progress_percent": r.progress_percent,
                "required_total": r.required_total,
                "required_completed": r.required_completed,
                "blocking_items": (r.blocking_item_keys or [])[:10],
                "next_action": r.next_action,
                "completed_at": _iso(r.completed_at),
            }
            for r in rows
        ],
    }


async def execute_get_timesheet_summary(company_id: str, args: GetTimesheetSummaryArgs) -> dict:
    """Team timesheet hours across a window (submitted/approved view)."""
    from app.models.timesheet import TimesheetEntry

    today = datetime.utcnow().date()
    try:
        start = date.fromisoformat(args.from_date) if args.from_date else today - timedelta(days=6)
        end = date.fromisoformat(args.to_date) if args.to_date else today
    except ValueError:
        return {"error": "Invalid date. Use YYYY-MM-DD."}
    if start > end:
        start, end = end, start
    if (end - start).days > 31:
        start = end - timedelta(days=31)

    entries = await TimesheetEntry.find({
        "company_id": company_id,
        "date": {"$gte": start, "$lte": end},
    }).to_list()

    total_hours = round(sum(e.hours_spent_today or 0.0 for e in entries), 2)
    status_counts: dict[str, int] = {}
    user_hours: dict[str, float] = {}
    for e in entries:
        status = e.status.value if hasattr(e.status, "value") else str(e.status)
        status_counts[status] = status_counts.get(status, 0) + 1
        user_hours[e.user_id] = user_hours.get(e.user_id, 0.0) + (e.hours_spent_today or 0.0)

    names = await _user_name_map(company_id, list(user_hours.keys()))
    top_users = sorted(user_hours.items(), key=lambda kv: kv[1], reverse=True)[: args.limit]

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "summary": {
            "total_entries": len(entries),
            "total_hours": total_hours,
            "status_counts": status_counts,
        },
        "top_users": [
            {"user_id": uid, "name": names.get(uid, uid), "hours": round(hours, 2)}
            for uid, hours in top_users
        ],
    }


async def execute_get_time_log_summary(company_id: str, args: GetTimeLogSummaryArgs) -> dict:
    """Tracked time-log hours across a window (billable/non-billable)."""
    from app.models.time_tracking import TimeLog

    today = datetime.utcnow().date()
    try:
        start = date.fromisoformat(args.from_date) if args.from_date else today - timedelta(days=6)
        end = date.fromisoformat(args.to_date) if args.to_date else today
    except ValueError:
        return {"error": "Invalid date. Use YYYY-MM-DD."}

    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end + timedelta(days=1), datetime.min.time())

    logs = await TimeLog.find({
        "company_id": company_id,
        "date": {"$gte": start_dt, "$lt": end_dt},
    }).to_list()

    total_hours = round(sum((l.hours or 0.0) + (l.minutes or 0) / 60.0 for l in logs), 2)
    billable = round(sum((l.hours or 0.0) + (l.minutes or 0) / 60.0 for l in logs if l.is_billable), 2)
    user_hours: dict[str, float] = {}
    task_hours: dict[str, float] = {}
    for l in logs:
        hours = (l.hours or 0.0) + (l.minutes or 0) / 60.0
        user_hours[l.user_id] = user_hours.get(l.user_id, 0.0) + hours
        if l.task_id:
            task_hours[l.task_id] = task_hours.get(l.task_id, 0.0) + hours

    names = await _user_name_map(company_id, list(user_hours.keys()))
    top_users = sorted(user_hours.items(), key=lambda kv: kv[1], reverse=True)[: args.limit]

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "summary": {
            "total_entries": len(logs),
            "total_hours": total_hours,
            "billable_hours": billable,
            "non_billable_hours": round(max(total_hours - billable, 0.0), 2),
        },
        "top_users": [
            {"user_id": uid, "name": names.get(uid, uid), "hours": round(hours, 2)}
            for uid, hours in top_users
        ],
    }


async def execute_list_crm_companies(company_id: str, args: ListCrmCompaniesArgs) -> dict:
    """CRM company/account directory, bounded."""
    from app.models.crm_company import CRMCompany

    query: dict[str, Any] = {"company_id": company_id, "deleted": False}
    if args.query:
        term = args.query.strip()
        query["$or"] = [
            {"name": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
            {"industry": {"$regex": term, "$options": "i"}},
        ]

    total = await CRMCompany.find(query).count()
    rows = await CRMCompany.find(query).sort("+name").limit(args.limit).to_list()

    return {
        "total": total,
        "has_more": total > len(rows),
        "companies": [
            {
                "id": str(c.id),
                "name": c.name,
                "email": c.email,
                "phone": c.phone,
                "website": c.website,
                "industry": c.industry,
                "company_size": c.company_size,
                "primary_contact_id": c.primary_contact_id,
                "created_at": _iso(c.created_at),
            }
            for c in rows
        ],
    }


async def execute_list_crm_contacts(company_id: str, args: ListCrmContactsArgs) -> dict:
    """CRM contact directory, bounded."""
    from app.models.sales_contact import SalesContact

    query: dict[str, Any] = {"company_id": company_id, "deleted": False}
    if args.query:
        term = args.query.strip()
        query["$or"] = [
            {"first_name": {"$regex": term, "$options": "i"}},
            {"last_name": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
            {"company_name": {"$regex": term, "$options": "i"}},
        ]
    if args.company_id:
        query["crm_company_id"] = args.company_id

    total = await SalesContact.find(query).count()
    rows = await SalesContact.find(query).sort("+first_name").limit(args.limit).to_list()

    return {
        "total": total,
        "has_more": total > len(rows),
        "contacts": [
            {
                "id": str(c.id),
                "full_name": f"{c.first_name or ''} {c.last_name or ''}".strip(),
                "email": c.email,
                "phone": c.phone,
                "designation": c.designation,
                "company_name": c.company_name,
                "crm_company_id": c.crm_company_id,
                "owner_name": c.owner_name,
            }
            for c in rows
        ],
    }


async def execute_list_crm_deals(company_id: str, args: ListCrmDealsArgs) -> dict:
    """CRM deals directory with lead context, bounded."""
    from app.models.crm_deal import CRMDeal
    from app.models.sales_prospect import SalesProspect

    query: dict[str, Any] = {"company_id": company_id, "archived": False}
    if args.stage:
        query["stage"] = args.stage
    if args.query:
        term = args.query.strip()
        leads = await SalesProspect.find({
            "company_id": company_id,
            "deleted": False,
            "$or": [
                {"prospect_name": {"$regex": term, "$options": "i"}},
                {"company_name": {"$regex": term, "$options": "i"}},
            ],
        }).limit(25).to_list()
        lead_ids = [str(l.id) for l in leads]
        if not lead_ids:
            return {"total": 0, "has_more": False, "deals": []}
        query["lead_id"] = {"$in": lead_ids}

    total = await CRMDeal.find(query).count()
    deals = await CRMDeal.find(query).sort("-created_at").limit(args.limit).to_list()

    lead_ids = [d.lead_id for d in deals]
    leads = await SalesProspect.find({
        "company_id": company_id,
        "_id": {"$in": [_safe_object_id(x) for x in lead_ids if _safe_object_id(x)]},
    }).to_list() if lead_ids else []
    lead_map = {str(l.id): l for l in leads}

    return {
        "total": total,
        "has_more": total > len(deals),
        "deals": [
            {
                "id": str(d.id),
                "lead_id": d.lead_id,
                "lead_name": (lead_map.get(d.lead_id).prospect_name or f"{lead_map.get(d.lead_id).first_name or ''} {lead_map.get(d.lead_id).last_name or ''}".strip()) if d.lead_id in lead_map else None,
                "company_name": lead_map.get(d.lead_id).company_name if d.lead_id in lead_map else None,
                "value": d.value,
                "stage": d.stage,
                "probability": d.probability,
                "expected_close_date": _iso(d.expected_close_date),
                "created_at": _iso(d.created_at),
            }
            for d in deals
        ],
    }


def _safe_object_id(value: str) -> Any:
    from bson import ObjectId

    try:
        return ObjectId(value) if ObjectId.is_valid(value) else None
    except Exception:
        return None


async def execute_get_crm_deal_360(company_id: str, args: GetCrmDeal360Args) -> dict:
    """Single CRM deal with proposals and lead context."""
    from app.models.crm_deal import CRMDeal
    from app.models.crm_proposal import CRMProposal
    from app.models.sales_prospect import SalesProspect

    deal = await CRMDeal.get(args.deal_id)
    if not deal or deal.company_id != company_id:
        return {"error": "Deal not found."}

    lead = None
    if deal.lead_id:
        lead = await SalesProspect.get(deal.lead_id)

    proposals = await CRMProposal.find({
        "company_id": company_id,
        "deal_id": str(deal.id),
    }).sort("-version").limit(10).to_list()

    return {
        "deal": {
            "id": str(deal.id),
            "lead_id": deal.lead_id,
            "contact_id": deal.contact_id,
            "value": deal.value,
            "stage": deal.stage,
            "probability": deal.probability,
            "expected_close_date": _iso(deal.expected_close_date),
            "decision_maker": deal.decision_maker,
            "competitors": deal.competitors or [],
            "negotiation_notes": deal.negotiation_notes,
            "archived": deal.archived,
        },
        "lead": {
            "id": str(lead.id),
            "name": lead.prospect_name or f"{lead.first_name or ''} {lead.last_name or ''}".strip(),
            "email": lead.email,
            "company": lead.company_name,
            "stage": lead.current_stage,
            "status": lead.status.value if hasattr(lead.status, "value") else str(lead.status),
        } if lead else None,
        "proposals": [
            {
                "id": str(p.id),
                "version": p.version,
                "title": p.title,
                "status": p.status.value if hasattr(p.status, "value") else str(p.status),
                "deal_value": p.deal_value,
                "created_at": _iso(p.created_at),
            }
            for p in proposals
        ],
    }


async def execute_list_tickets(company_id: str, args: ListTicketsArgs) -> dict:
    """Ticket list with status/priority counts, bounded."""
    from app.models.ticket import Ticket, TicketPriority, TicketStatus

    query: dict[str, Any] = {"company_id": company_id}
    if args.status:
        value = _enum_value(TicketStatus, args.status)
        if value is not None:
            query["status"] = value
    if args.priority:
        value = _enum_value(TicketPriority, args.priority)
        if value is not None:
            query["priority"] = value

    total = await Ticket.find(query).count()
    rows = await Ticket.find(query).sort("-created_at").limit(args.limit).to_list()

    status_counts: dict[str, int] = {}
    escalated = 0
    for t in rows:
        key = t.status.value if hasattr(t.status, "value") else str(t.status)
        status_counts[key] = status_counts.get(key, 0) + 1
        if getattr(t, "escalated", False):
            escalated += 1

    return {
        "total": total,
        "escalated_in_view": escalated,
        "status_counts": status_counts,
        "has_more": total > len(rows),
        "tickets": [
            {
                "id": str(t.id),
                "ticket_number": t.ticket_number,
                "title": t.title,
                "status": t.status.value if hasattr(t.status, "value") else str(t.status),
                "priority": t.priority.value if hasattr(t.priority, "value") else str(t.priority),
                "type": t.type.value if hasattr(t.type, "value") else str(t.type),
                "assigned_to": t.assigned_to,
                "created_by_name": t.created_by_name,
                "created_at": _iso(t.created_at),
                "escalated": getattr(t, "escalated", False),
            }
            for t in rows
        ],
    }


async def execute_list_content_items(company_id: str, args: ListContentItemsArgs) -> dict:
    """Content calendar items, bounded."""
    from app.models.content_calendar import ContentCalendarItem

    query: dict[str, Any] = {"company_id": company_id}
    if args.status:
        query["status"] = args.status
    if args.project_id:
        query["project_id"] = args.project_id

    total = await ContentCalendarItem.find(query).count()
    rows = await ContentCalendarItem.find(query).sort("+due_date").limit(args.limit).to_list()

    return {
        "total": total,
        "has_more": total > len(rows),
        "items": [
            {
                "id": str(c.id),
                "title": c.title,
                "content_type": c.content_type.value if hasattr(c.content_type, "value") else str(c.content_type),
                "status": c.status.value if hasattr(c.status, "value") else str(c.status),
                "priority": c.priority.value if hasattr(c.priority, "value") else str(c.priority),
                "project_id": c.project_id,
                "client_id": c.client_id,
                "assignee_name": c.assignee_name,
                "due_date": _iso(c.due_date),
                "publish_date": _iso(c.publish_date),
            }
            for c in rows
        ],
    }


async def execute_list_knowledge(company_id: str, args: ListKnowledgeArgs) -> dict:
    """Knowledge-base records, bounded."""
    from app.models.knowledge import KnowledgeRecord, KnowledgeStatus

    query: dict[str, Any] = {"company_id": company_id, "status": KnowledgeStatus.ACTIVE.value}
    if args.query:
        term = args.query.strip()
        query["$or"] = [
            {"title": {"$regex": term, "$options": "i"}},
            {"summary": {"$regex": term, "$options": "i"}},
            {"tags": {"$regex": term, "$options": "i"}},
        ]

    total = await KnowledgeRecord.find(query).count()
    rows = await KnowledgeRecord.find(query).sort("-created_at").limit(args.limit).to_list()

    return {
        "total": total,
        "has_more": total > len(rows),
        "records": [
            {
                "id": str(k.id),
                "knowledge_id": k.knowledge_id,
                "knowledge_type": k.knowledge_type,
                "title": k.title,
                "summary": (k.summary or "")[:300],
                "importance": k.importance,
                "tags": (k.tags or [])[:10],
                "created_at": _iso(k.created_at),
            }
            for k in rows
        ],
    }


# ---------------------------------------------------------------------------
# Registries merged into the Executive registry by executive/tools.py
# ---------------------------------------------------------------------------

READ_TOOL_SCHEMAS: list[dict[str, Any]] = [
    {"type": "function", "function": {"name": name, "description": desc, "parameters": schema_cls.model_json_schema()}}
    for name, desc, schema_cls in [
        ("list_clients", "List clients by name/company with status; company client directory. Use for 'show our clients' or 'list clients'.", ListClientsArgs),
        ("get_client_health_summary", "Compact client health: linked projects, open/overdue tasks, invoice exposure, meeting recency, deliverables and onboarding blockers.", GetClientHealthArgs),
        ("get_client_timeline", "Recent client activity: invoices, meetings, deliverables and task movement, newest first.", GetClientTimelineArgs),
        ("list_tasks", "List tasks company-wide with optional title search, status, priority, project, or assignee filters. Use for 'what tasks exist'.", ListTasksArgs),
        ("get_task_detail", "Full detail of one task: description, status, assignee, project, dates and effort fields.", GetTaskDetailArgs),
        ("list_projects", "List projects with optional status/client filter. Use for 'show our projects'.", ListProjectsArgs),
        ("get_project_timeline", "Recent project activity: task movement, meetings and invoices, newest first.", GetProjectTimelineArgs),
        ("list_leads", "List/search sales leads by name, company, stage or status. Use for 'show our leads'.", ListLeadsArgs),
        ("get_lead_activity", "Recent CRM activities and follow-up trail for one lead.", GetLeadActivityArgs),
        ("list_candidates", "List/search candidates with optional status or job filter. Use for 'show candidates'.", ListCandidatesArgs),
        ("list_jobs", "List/search job openings in any lifecycle state. Use for 'show open jobs'.", ListJobsArgs),
        ("list_invoices", "List/filter invoices by client, name, or status (incl. overdue) with a compact financial summary.", ListInvoicesArgs),
        ("get_invoice_detail", "Full invoice detail: line items, taxes, payments and outstanding amount.", GetInvoiceDetailArgs),
        ("list_meetings", "List meetings in a date window with optional status/client/project filters.", ListMeetingsArgs),
        ("get_meeting_detail", "Full detail of one meeting including participants.", GetMeetingDetailArgs),
        ("get_attendance_roster", "Company attendance roster for a date: present/absent/on-leave/late counts and the names of absent employees.", GetAttendanceRosterArgs),
        ("list_leave_requests", "Company leave requests with employee names, optional status/date filters.", ListLeaveRequestsArgs),
        ("get_payroll_history", "Payroll run history: periods with status, employee counts, blockers and net totals.", GetPayrollHistoryArgs),
        ("get_company_documents", "Company document register (HR documents across employees) with optional expiry horizon.", GetCompanyDocumentsArgs),
        ("list_employees", "Company employee directory with optional department/status filters.", ListEmployeesArgs),
        ("get_org_summary", "Organization structure summary: departments, managers and headcount.", GetOrgSummaryArgs),
        ("list_sprints", "List sprints across projects with open-task counts. Use for 'show our sprints'.", ListSprintsArgs),
        ("list_epics", "List epics across projects with progress.", ListEpicsArgs),
        ("get_eod_summary", "EOD coverage for a date: who submitted reports and which employees are missing.", GetEodSummaryArgs),
        ("get_client_deliverables", "Client deliverables register with status/approval counts and overdue items.", GetClientDeliverablesArgs),
        ("get_client_onboarding", "Client onboarding progress across clients.", GetClientOnboardingArgs),
        ("get_timesheet_summary", "Team timesheet hours across a date window with status counts and top users.", GetTimesheetSummaryArgs),
        ("get_time_log_summary", "Tracked time-log hours across a window: total, billable and top users.", GetTimeLogSummaryArgs),
        ("list_crm_companies", "CRM company/account directory with optional search.", ListCrmCompaniesArgs),
        ("list_crm_contacts", "CRM contact directory with optional search or company filter.", ListCrmContactsArgs),
        ("list_crm_deals", "CRM deals directory with lead context; optional stage/search filters.", ListCrmDealsArgs),
        ("get_crm_deal_360", "Single CRM deal detail with proposals and linked lead.", GetCrmDeal360Args),
        ("list_tickets", "Ticket list with status/priority filters and counts.", ListTicketsArgs),
        ("list_content_items", "Content calendar items with status/project filters.", ListContentItemsArgs),
        ("list_knowledge", "Knowledge-base records with optional text search.", ListKnowledgeArgs),
    ]
]

READ_TOOL_HANDLERS: dict[str, Any] = {
    "list_clients": execute_list_clients,
    "get_client_health_summary": execute_get_client_health,
    "get_client_timeline": execute_get_client_timeline,
    "list_tasks": execute_list_tasks,
    "get_task_detail": execute_get_task_detail,
    "list_projects": execute_list_projects,
    "get_project_timeline": execute_get_project_timeline,
    "list_leads": execute_list_leads,
    "get_lead_activity": execute_get_lead_activity,
    "list_candidates": execute_list_candidates,
    "list_jobs": execute_list_jobs,
    "list_invoices": execute_list_invoices,
    "get_invoice_detail": execute_get_invoice_detail,
    "list_meetings": execute_list_meetings,
    "get_meeting_detail": execute_get_meeting_detail,
    "get_attendance_roster": execute_get_attendance_roster,
    "list_leave_requests": execute_list_leave_requests,
    "get_payroll_history": execute_get_payroll_history,
    "get_company_documents": execute_get_company_documents,
    "list_employees": execute_list_employees,
    "get_org_summary": execute_get_org_summary,
    "list_sprints": execute_list_sprints,
    "list_epics": execute_list_epics,
    "get_eod_summary": execute_get_eod_summary,
    "get_client_deliverables": execute_get_client_deliverables,
    "get_client_onboarding": execute_get_client_onboarding,
    "get_timesheet_summary": execute_get_timesheet_summary,
    "get_time_log_summary": execute_get_time_log_summary,
    "list_crm_companies": execute_list_crm_companies,
    "list_crm_contacts": execute_list_crm_contacts,
    "list_crm_deals": execute_list_crm_deals,
    "get_crm_deal_360": execute_get_crm_deal_360,
    "list_tickets": execute_list_tickets,
    "list_content_items": execute_list_content_items,
    "list_knowledge": execute_list_knowledge,
}

READ_TOOL_ARG_SCHEMAS: dict[str, type[BaseModel]] = {
    "list_clients": ListClientsArgs,
    "get_client_health_summary": GetClientHealthArgs,
    "get_client_timeline": GetClientTimelineArgs,
    "list_tasks": ListTasksArgs,
    "get_task_detail": GetTaskDetailArgs,
    "list_projects": ListProjectsArgs,
    "get_project_timeline": GetProjectTimelineArgs,
    "list_leads": ListLeadsArgs,
    "get_lead_activity": GetLeadActivityArgs,
    "list_candidates": ListCandidatesArgs,
    "list_jobs": ListJobsArgs,
    "list_invoices": ListInvoicesArgs,
    "get_invoice_detail": GetInvoiceDetailArgs,
    "list_meetings": ListMeetingsArgs,
    "get_meeting_detail": GetMeetingDetailArgs,
    "get_attendance_roster": GetAttendanceRosterArgs,
    "list_leave_requests": ListLeaveRequestsArgs,
    "get_payroll_history": GetPayrollHistoryArgs,
    "get_company_documents": GetCompanyDocumentsArgs,
    "list_employees": ListEmployeesArgs,
    "get_org_summary": GetOrgSummaryArgs,
    "list_sprints": ListSprintsArgs,
    "list_epics": ListEpicsArgs,
    "get_eod_summary": GetEodSummaryArgs,
    "get_client_deliverables": GetClientDeliverablesArgs,
    "get_client_onboarding": GetClientOnboardingArgs,
    "get_timesheet_summary": GetTimesheetSummaryArgs,
    "get_time_log_summary": GetTimeLogSummaryArgs,
    "list_crm_companies": ListCrmCompaniesArgs,
    "list_crm_contacts": ListCrmContactsArgs,
    "list_crm_deals": ListCrmDealsArgs,
    "get_crm_deal_360": GetCrmDeal360Args,
    "list_tickets": ListTicketsArgs,
    "list_content_items": ListContentItemsArgs,
    "list_knowledge": ListKnowledgeArgs,
}

# Sensitive tools: HR/finance company-wide reads need manager+ role.
READ_TOOL_SENSITIVE_TOOLS: dict[str, set[str]] = {
    "get_payroll_history": {"admin", "super_admin", "manager"},
    "get_company_documents": {"admin", "super_admin", "manager", "lead"},
    "get_attendance_roster": {"admin", "super_admin", "manager", "lead"},
    "list_leave_requests": {"admin", "super_admin", "manager", "lead"},
}

# Module gates: tool -> feature/module id.  These are enforced on top of role
# gates when the caller supplies module information (see execute_executive_tool).
READ_TOOL_MODULE_GATES: dict[str, str] = {
    "get_payroll_history": "payroll",
    "get_company_documents": "hr_documents",
    "get_attendance_roster": "attendance",
    "list_leave_requests": "leave",
    "list_candidates": "recruitment",
    "list_jobs": "recruitment",
    "list_sprints": "projects",
    "list_epics": "projects",
}
