"""
Fast-fact handlers — answer simple factual questions without Groq.

These are deterministic handlers for common CEO questions that don't
need LLM reasoning. Each handler queries SynTask services/models directly
and returns a structured answer.  HR-specific handlers are included so
the CEO can ask simple HR count questions without burning Groq tokens.

Entity scoping: every handler accepts an optional ``FastFactScope``
(resolved employee/project/client/lead/job ids). When an entity is
mentioned in the question, the handler applies the resolved id to the
same canonical model query — it never silently widens the query to the
whole company. If the scope is unresolved, the caller must route to
Executive reasoning instead of executing a fast fact.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from app.core.clock import utc_now

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Query scoping helpers
# ---------------------------------------------------------------------------

def _scoped_task_query(
    company_id: str,
    statuses: list[str],
    scope: Any = None,
) -> dict[str, Any]:
    """Build a canonical Task query scoped by employee/project when present.

    ``scope`` is a ``FastFactScope`` (or None). Employee scoping filters on
    the canonical ``assigned_to`` user id; project scoping matches either the
    logical ``project_id`` or the Mongo ``project_object_id`` link.
    """
    query: dict[str, Any] = {"company_id": company_id, "status": {"$in": statuses}}
    extras: list[dict[str, Any]] = []
    if scope is not None and getattr(scope, "employee_user_id", None):
        extras.append({"assigned_to": scope.employee_user_id})
    if scope is not None and getattr(scope, "project_object_id", None):
        extras.append({
            "$or": [
                {"project_id": scope.project_id},
                {"project_object_id": scope.project_object_id},
            ]
        })
    if extras:
        return {"$and": [query, *extras]}
    return query


def _entity_label(scope: Any) -> Optional[str]:
    """Human label of the primary scoped entity, e.g. 'Gaurav' / 'Project Alpha'."""
    if scope is None:
        return None
    if getattr(scope, "employee_name", None):
        return scope.employee_name
    if getattr(scope, "project_name", None):
        return scope.project_name
    if getattr(scope, "project_id", None) or getattr(scope, "project_object_id", None):
        return getattr(scope, "project_id", None) or getattr(scope, "project_object_id", None)
    if getattr(scope, "client_name", None):
        return scope.client_name
    if getattr(scope, "lead_name", None):
        return scope.lead_name
    if getattr(scope, "job_title", None):
        return scope.job_title
    return None


def _count_phrase(count: int, noun: str, scope: Any = None) -> str:
    """Concise count phrase; mentions the scoped entity when present."""
    entity = _entity_label(scope)
    if entity:
        return f"{entity} has {count} {noun}{'s' if count != 1 else ''}."
    return f"There {'is' if count == 1 else 'are'} {count} {noun}{'s' if count != 1 else ''}."


# ---------------------------------------------------------------------------
# Employee fast facts
# ---------------------------------------------------------------------------

async def handle_employee_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many employees do we have?"""
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus

    query: dict[str, Any] = {
        "company_id": company_id,
        "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
    }
    if scope is not None and getattr(scope, "employee_user_id", None):
        query["user_id"] = scope.employee_user_id
    total = await EmployeeProfile.find(query).count()

    return {
        "answer": _count_phrase(total, "employee", scope) if scope is not None and getattr(scope, "employee_user_id", None)
        else f"There {'is' if total == 1 else 'are'} {total} active {'employee' if total == 1 else 'employees'} in the company.",
        "facts": [{"metric": "employee.active", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_employee_names(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: Give me their names / list all employees."""
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.user import User

    query: dict[str, Any] = {
        "company_id": company_id,
        "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
    }
    if scope is not None and getattr(scope, "employee_user_id", None):
        query["user_id"] = scope.employee_user_id
    profiles = await EmployeeProfile.find(query).to_list()

    if not profiles:
        return {
            "answer": "There are no active employees in the company.",
            "facts": [],
            "path_used": "FAST_FACT",
            "groq_calls": 0,
        }

    user_ids = [p.user_id for p in profiles if p.user_id]
    users = await User.find({"_id": {"$in": user_ids}, "company_id": company_id}).to_list()
    user_map = {str(u.id): u for u in users}

    names = []
    for p in profiles:
        user = user_map.get(p.user_id)
        if user:
            name = f"{user.first_name or ''} {user.last_name or ''}".strip()
            names.append(name or user.email or "Unknown")
        else:
            names.append("Unknown")

    names.sort()
    count = len(names)
    name_list = ", ".join(names[:20])
    if count > 20:
        name_list += f", and {count - 20} more"

    return {
        "answer": f"There {'is' if count == 1 else 'are'} {count} active {'employee' if count == 1 else 'employees'}: {name_list}.",
        "facts": [{"metric": "employee.names", "value": names}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


# ---------------------------------------------------------------------------
# Task fast facts
# ---------------------------------------------------------------------------

async def handle_task_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many tasks do we have? (open tasks, entity-scoped)."""
    from app.models.task import Task, TaskStatus

    query = _scoped_task_query(
        company_id,
        [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value],
        scope,
    )
    total = await Task.find(query).count()

    return {
        "answer": _count_phrase(total, "open task", scope),
        "facts": [{"metric": "task.open", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_pending_task_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many tasks are pending? (entity-scoped)."""
    from app.models.task import Task, TaskStatus

    query = _scoped_task_query(company_id, [TaskStatus.TODO.value], scope)
    total = await Task.find(query).count()

    return {
        "answer": _count_phrase(total, "pending task", scope),
        "facts": [{"metric": "task.pending", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_overdue_task_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many tasks are overdue? (entity-scoped)."""
    from app.models.task import Task, TaskStatus

    query = _scoped_task_query(
        company_id,
        [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value],
        scope,
    )
    base = query["$and"][0] if "$and" in query else query
    base["due_date"] = {"$lt": utc_now(), "$ne": None}

    total = await Task.find(query).count()

    return {
        "answer": _count_phrase(total, "overdue task", scope),
        "facts": [{"metric": "task.overdue", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_completed_today_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many tasks were completed today? (entity-scoped)."""
    from datetime import timedelta
    from app.models.task import Task, TaskStatus

    today = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)

    query = _scoped_task_query(company_id, [TaskStatus.COMPLETED.value], scope)
    base = query["$and"][0] if "$and" in query else query
    base["completed_at"] = {"$gte": today, "$lt": tomorrow}

    total = await Task.find(query).count()

    entity = _entity_label(scope)
    if entity:
        return {
            "answer": f"{entity} completed {total} {'task' if total == 1 else 'tasks'} today.",
            "facts": [{"metric": "task.completed_today", "value": total}],
            "path_used": "FAST_FACT",
            "groq_calls": 0,
        }
    return {
        "answer": f"{total} {'task was' if total == 1 else 'tasks were'} completed today.",
        "facts": [{"metric": "task.completed_today", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


# ---------------------------------------------------------------------------
# Project fast facts
# ---------------------------------------------------------------------------

async def handle_project_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many projects do we have? (client-scoped when client mentioned)."""
    from app.models.project import Project, ProjectStatus

    query: dict[str, Any] = {
        "company_id": company_id,
        "status": {"$in": [ProjectStatus.ACTIVE.value, ProjectStatus.EXECUTION.value, ProjectStatus.REVIEW.value]},
    }
    if scope is not None and getattr(scope, "client_id", None):
        query["client_id"] = scope.client_id
    total = await Project.find(query).count()

    entity = _entity_label(scope)
    if entity:
        return {
            "answer": f"{entity} has {total} active {'project' if total == 1 else 'projects'}.",
            "facts": [{"metric": "project.active", "value": total}],
            "path_used": "FAST_FACT",
            "groq_calls": 0,
        }
    return {
        "answer": f"There {'is' if total == 1 else 'are'} {total} active {'project' if total == 1 else 'projects'}.",
        "facts": [{"metric": "project.active", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


# ---------------------------------------------------------------------------
# Client fast facts
# ---------------------------------------------------------------------------

async def handle_client_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many clients do we have?"""
    from app.models.client import Client, ClientStatus

    query: dict[str, Any] = {
        "company_id": company_id,
        "status": {"$in": [ClientStatus.ACTIVE.value, ClientStatus.ONBOARDING.value]},
    }
    if scope is not None and getattr(scope, "client_id", None):
        query["_id"] = scope.client_id
    total = await Client.find(query).count()

    return {
        "answer": _count_phrase(total, "active client", scope) if scope is not None and getattr(scope, "client_id", None)
        else f"There {'is' if total == 1 else 'are'} {total} active {'client' if total == 1 else 'clients'}.",
        "facts": [{"metric": "client.active", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


# ---------------------------------------------------------------------------
# Sales fast facts
# ---------------------------------------------------------------------------

async def handle_sales_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many leads / sales pipeline count (owner/lead-scoped)."""
    from app.models.sales_prospect import SalesProspect, ProspectStatus

    active_query: dict[str, Any] = {
        "company_id": company_id,
        "status": ProspectStatus.ACTIVE.value,
    }
    won_query: dict[str, Any] = {
        "company_id": company_id,
        "status": ProspectStatus.WON.value,
    }
    if scope is not None and getattr(scope, "employee_user_id", None):
        active_query["assigned_to"] = scope.employee_user_id
        won_query["assigned_to"] = scope.employee_user_id
    if scope is not None and getattr(scope, "lead_id", None):
        active_query["_id"] = scope.lead_id
        won_query["_id"] = scope.lead_id

    active = await SalesProspect.find(active_query).count()
    won = await SalesProspect.find(won_query).count()

    entity = _entity_label(scope)
    if entity:
        return {
            "answer": f"{entity} has {active} active lead{'s' if active != 1 else ''} and {won} won deal{'s' if won != 1 else ''}.",
            "facts": [
                {"metric": "sales.active_leads", "value": active},
                {"metric": "sales.won_deals", "value": won},
            ],
            "path_used": "FAST_FACT",
            "groq_calls": 0,
        }
    return {
        "answer": f"There {'is' if active == 1 else 'are'} {active} active lead{'s' if active != 1 else ''} and {won} won deal{'s' if won != 1 else ''}.",
        "facts": [
            {"metric": "sales.active_leads", "value": active},
            {"metric": "sales.won_deals", "value": won},
        ],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


# ---------------------------------------------------------------------------
# Finance fast facts
# ---------------------------------------------------------------------------

async def handle_invoice_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many overdue invoices? (client-scoped)."""
    from app.models.invoice import Invoice, InvoiceStatus

    query: dict[str, Any] = {
        "company_id": company_id,
        "status": InvoiceStatus.SENT.value,
        "due_date": {"$lt": utc_now()},
    }
    if scope is not None and getattr(scope, "client_id", None):
        query["client_id"] = scope.client_id
    total = await Invoice.find(query).count()

    return {
        "answer": _count_phrase(total, "overdue invoice", scope) if scope is not None and getattr(scope, "client_id", None)
        else f"There {'is' if total == 1 else 'are'} {total} overdue {'invoice' if total == 1 else 'invoices'}.",
        "facts": [{"metric": "invoice.overdue", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


# ---------------------------------------------------------------------------
# Recruitment fast facts
# ---------------------------------------------------------------------------

async def handle_recruitment_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: open jobs / pending interviews / offers pending."""
    try:
        from app.models.jobOpening import JobOpening, JobStatus
        open_query: dict[str, Any] = {
            "company_id": company_id,
            "status": {"$in": [JobStatus.OPEN.value, JobStatus.ON_HOLD.value]},
        }
        if scope is not None and getattr(scope, "job_id", None):
            open_query["_id"] = scope.job_id
        open_jobs = await JobOpening.find(open_query).count()
    except Exception:
        open_jobs = 0

    try:
        from app.models.interview import Interview, InterviewStatus
        interview_query: dict[str, Any] = {
            "company_id": company_id,
            "status": {"$in": [InterviewStatus.SCHEDULED.value, InterviewStatus.RESCHEDULED.value]},
        }
        if scope is not None and getattr(scope, "job_id", None):
            interview_query["job_id"] = scope.job_id
        pending_interviews = await Interview.find(interview_query).count()
    except Exception:
        pending_interviews = 0

    return {
        "answer": f"There {'is' if open_jobs == 1 else 'are'} {open_jobs} open {'job' if open_jobs == 1 else 'jobs'} and {pending_interviews} pending {'interview' if pending_interviews != 1 else 'interviews'}.",
        "facts": [
            {"metric": "recruitment.open_jobs", "value": open_jobs},
            {"metric": "recruitment.pending_interviews", "value": pending_interviews},
        ],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


# ---------------------------------------------------------------------------
# HR-specific fast facts (new)
# ---------------------------------------------------------------------------

async def handle_absent_today_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many employees are absent today? (employee-scoped)."""
    from datetime import timedelta
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus

    today = utc_now().date()
    today_str = today.isoformat()
    tomorrow = (today + timedelta(days=1)).isoformat()

    employee_user_id = getattr(scope, "employee_user_id", None) if scope is not None else None

    # Total active employees (or the single scoped employee)
    profile_query: dict[str, Any] = {
        "company_id": company_id,
        "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
    }
    if employee_user_id:
        profile_query["user_id"] = employee_user_id
    total_active = await EmployeeProfile.find(profile_query).count()

    # Employees who checked in today
    try:
        from app.models.attendance import Attendance, AttendanceStatus
        present_query: dict[str, Any] = {
            "company_id": company_id,
            "date": {"$gte": today_str, "$lt": tomorrow},
            "status": {"$in": [AttendanceStatus.WORKING.value, AttendanceStatus.ON_BREAK.value]},
        }
        if employee_user_id:
            present_query["employee_id"] = employee_user_id
        present_count = await Attendance.find(present_query).count()
    except Exception:
        present_count = 0

    if employee_user_id:
        # Single-employee question: "Is Gaurav absent today?"
        is_absent = present_count == 0
        return {
            "answer": f"{getattr(scope, 'employee_name', 'This employee')} {'is' if is_absent else 'is not'} absent today.",
            "facts": [
                {"metric": "hr.absent_today", "value": 1 if is_absent else 0},
            ],
            "path_used": "FAST_FACT",
            "groq_calls": 0,
        }

    absent_count = max(0, total_active - present_count)
    return {
        "answer": f"{absent_count} {'employee is' if absent_count == 1 else 'employees are'} absent today out of {total_active} active employees.",
        "facts": [
            {"metric": "hr.absent_today", "value": absent_count},
            {"metric": "hr.total_active", "value": total_active},
        ],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_pending_leave_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many leave requests are pending? (employee-scoped)."""
    try:
        from app.models.leave import LeaveRequest, LeaveStatus
        query: dict[str, Any] = {
            "company_id": company_id,
            "status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.FORWARDED.value]},
        }
        if scope is not None and getattr(scope, "employee_user_id", None):
            query["employee_id"] = scope.employee_user_id
        total = await LeaveRequest.find(query).count()
    except Exception:
        total = 0

    return {
        "answer": _count_phrase(total, "pending leave request", scope) if scope is not None and getattr(scope, "employee_user_id", None)
        else f"There {'is' if total == 1 else 'are'} {total} pending leave {'request' if total == 1 else 'requests'}.",
        "facts": [{"metric": "hr.pending_leaves", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_open_jobs_count(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: How many open job openings are there? (job-scoped)."""
    try:
        from app.models.jobOpening import JobOpening, JobStatus
        query: dict[str, Any] = {
            "company_id": company_id,
            "status": {"$in": [JobStatus.OPEN.value, JobStatus.ON_HOLD.value]},
        }
        if scope is not None and getattr(scope, "job_id", None):
            query["_id"] = scope.job_id
        total = await JobOpening.find(query).count()
    except Exception:
        total = 0

    return {
        "answer": _count_phrase(total, "open job opening", scope) if scope is not None and getattr(scope, "job_id", None)
        else f"There {'is' if total == 1 else 'are'} {total} open {'job opening' if total == 1 else 'job openings'}.",
        "facts": [{"metric": "recruitment.open_jobs", "value": total}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


# ---------------------------------------------------------------------------
# Bounded company LIST / name fast facts (0 Groq calls)
# ---------------------------------------------------------------------------

async def handle_client_names(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: show / list our clients (names + status, bounded)."""
    from app.models.client import Client, ClientStatus

    query: dict[str, Any] = {
        "company_id": company_id,
        "status": {"$in": [ClientStatus.NEW.value, ClientStatus.ONBOARDING.value, ClientStatus.ACTIVE.value, ClientStatus.AT_RISK.value]},
    }
    if scope is not None and getattr(scope, "client_id", None):
        query["_id"] = scope.client_id
    clients = await Client.find(query).sort("+name").limit(25).to_list()

    if not clients:
        return {"answer": "There are no active clients yet.", "facts": [], "path_used": "FAST_FACT", "groq_calls": 0}

    lines = [
        f"{c.name}" + (f" ({c.company_name})" if c.company_name and c.company_name != c.name else "")
        for c in clients[:20]
    ]
    count = len(clients)
    body = ", ".join(lines)
    if count > 20:
        body += f", and {count - 20} more"

    return {
        "answer": f"There {'is' if count == 1 else 'are'} {count} active/new client{'s' if count != 1 else ''}: {body}.",
        "facts": [{"metric": "client.names", "value": lines}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_open_task_list(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: what tasks exist (open tasks, bounded, entity-scoped)."""
    from app.models.task import Task, TaskStatus

    query = _scoped_task_query(
        company_id,
        [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value],
        scope,
    )
    tasks = await Task.find(query).sort("-updated_at").limit(25).to_list()

    total = len(tasks)
    if not tasks:
        return {"answer": "There are no open tasks right now.", "facts": [], "path_used": "FAST_FACT", "groq_calls": 0}

    lines = [f"{t.title} ({t.status.value if hasattr(t.status, 'value') else t.status})" for t in tasks[:15]]
    body = ", ".join(lines)
    if total > 15:
        body += f", and {total - 15} more"

    entity = _entity_label(scope)
    prefix = f"{entity} has" if entity else f"There are"
    return {
        "answer": f"{prefix} {total} open task{'s' if total != 1 else ''}: {body}.",
        "facts": [{"metric": "task.open_titles", "value": lines}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_today_meetings(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: what meetings are scheduled today (participant-scoped)."""
    from datetime import datetime, timedelta
    from app.models.meeting import Meeting, MeetingStatus

    today = utc_now().date()
    start = datetime.combine(today, datetime.min.time())
    end = start + timedelta(days=1)

    query: dict[str, Any] = {
        "company_id": company_id,
        "meeting_date": {"$gte": start, "$lt": end},
        "status": {"$in": [MeetingStatus.SCHEDULED.value, MeetingStatus.ONGOING.value]},
    }
    if scope is not None and getattr(scope, "employee_user_id", None):
        query["participant_ids"] = scope.employee_user_id
    meetings = await Meeting.find(query).to_list()
    meetings.sort(key=lambda m: (m.meeting_time or ""))

    if not meetings:
        return {"answer": "No meetings are scheduled today.", "facts": [], "path_used": "FAST_FACT", "groq_calls": 0}

    lines = [f"{m.title} at {m.meeting_time or 'TBD'}" for m in meetings[:15]]
    body = "; ".join(lines)
    if len(meetings) > 15:
        body += f"; and {len(meetings) - 15} more"

    entity = _entity_label(scope)
    prefix = f"{entity} has" if entity else f"You have"
    return {
        "answer": f"{prefix} {len(meetings)} meeting{'s' if len(meetings) != 1 else ''} today: {body}.",
        "facts": [{"metric": "meeting.today", "value": lines}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_open_jobs_list(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: show open job openings (bounded list)."""
    try:
        from app.recruitment.models import JobLifecycleStatus, RecruitmentJob
    except Exception:
        return {"answer": "No job openings module is available.", "facts": [], "path_used": "FAST_FACT", "groq_calls": 0}

    query: dict[str, Any] = {
        "company_id": company_id,
        "deleted_at": None,
        "lifecycle_status": {"$in": [JobLifecycleStatus.APPROVED.value, JobLifecycleStatus.PUBLISHED.value]},
    }
    if scope is not None and getattr(scope, "job_id", None):
        query["_id"] = scope.job_id
    jobs = await RecruitmentJob.find(query).limit(25).to_list()

    if not jobs:
        return {"answer": "There are no open job openings right now.", "facts": [], "path_used": "FAST_FACT", "groq_calls": 0}

    lines = [f"{j.title}" + (f" ({j.location})" if getattr(j, "location", None) else "") for j in jobs[:15]]
    body = ", ".join(lines)
    if len(jobs) > 15:
        body += f", and {len(jobs) - 15} more"

    return {
        "answer": f"There {'is' if len(jobs) == 1 else 'are'} {len(jobs)} open job opening{'s' if len(jobs) != 1 else ''}: {body}.",
        "facts": [{"metric": "recruitment.open_jobs_titles", "value": lines}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


async def handle_pending_leave_names(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: who has pending leave requests (bounded, employee-scoped)."""
    from bson import ObjectId

    from app.models.leave import LeaveRequest, LeaveStatus
    from app.models.user import User

    try:
        query: dict[str, Any] = {
            "company_id": company_id,
            "status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.FORWARDED.value]},
        }
        if scope is not None and getattr(scope, "employee_user_id", None):
            query["employee_id"] = scope.employee_user_id
        leaves = await LeaveRequest.find(query).sort("+created_at").limit(20).to_list()
    except Exception:
        leaves = []

    if not leaves:
        return {"answer": "There are no pending leave requests.", "facts": [], "path_used": "FAST_FACT", "groq_calls": 0}

    user_ids = [l.employee_id for l in leaves if l.employee_id]
    ids = [ObjectId(u) for u in user_ids if ObjectId.is_valid(u)]
    users = await User.find({"company_id": company_id, "_id": {"$in": ids}}).to_list() if ids else []
    name_map = {str(u.id): (f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email) for u in users}

    lines = [
        f"{name_map.get(l.employee_id, l.employee_id)}: {_leave_label(l)} from {l.start_date.date() if hasattr(l.start_date, 'date') else l.start_date}"
        for l in leaves[:10]
    ]
    body = "; ".join(lines)
    if len(leaves) > 10:
        body += f"; and {len(leaves) - 10} more"

    return {
        "answer": f"There {'is' if len(leaves) == 1 else 'are'} {len(leaves)} pending leave request{'s' if len(leaves) != 1 else ''}: {body}.",
        "facts": [{"metric": "hr.pending_leave_names", "value": lines}],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


def _leave_label(leave: Any) -> str:
    leave_type = getattr(leave, "leave_type", None)
    if leave_type is not None:
        return leave_type.value if hasattr(leave_type, "value") else str(leave_type)
    return str(getattr(leave, "leave_type_id", "leave"))


async def handle_absent_employees_today(company_id: str, scope: Any = None) -> dict[str, Any]:
    """Answer: how many / who is absent today (count + names, employee-scoped)."""
    from datetime import timedelta
    from bson import ObjectId

    from app.models.attendance import Attendance, AttendanceStatus
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.user import User

    today = utc_now().date()
    today_str = today.isoformat()
    tomorrow = (today + timedelta(days=1)).isoformat()

    employee_user_id = getattr(scope, "employee_user_id", None) if scope is not None else None

    profile_query: dict[str, Any] = {
        "company_id": company_id,
        "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
    }
    if employee_user_id:
        profile_query["user_id"] = employee_user_id
    profiles = await EmployeeProfile.find(profile_query).to_list()
    total_active = len(profiles)
    active_ids = {p.user_id for p in profiles if p.user_id}

    try:
        day_query: dict[str, Any] = {
            "company_id": company_id,
            "date": {"$gte": today_str, "$lt": tomorrow},
        }
        if employee_user_id:
            day_query["employee_id"] = employee_user_id
        day_records = await Attendance.find(day_query).to_list()
        present_statuses = {
            AttendanceStatus.PRESENT.value, AttendanceStatus.LATE.value,
            AttendanceStatus.WORKING.value, AttendanceStatus.ON_BREAK.value,
            AttendanceStatus.CHECKED_OUT.value,
        }
        present_ids = {r.employee_id for r in day_records if (r.status.value if hasattr(r.status, "value") else str(r.status)) in present_statuses}
    except Exception:
        present_ids = set()

    absent_ids = sorted(active_ids - present_ids)
    absent_count = len(absent_ids)

    if employee_user_id:
        is_absent = employee_user_id in absent_ids
        return {
            "answer": f"{getattr(scope, 'employee_name', 'This employee')} {'is' if is_absent else 'is not'} absent today.",
            "facts": [
                {"metric": "hr.absent_today", "value": 1 if is_absent else 0},
            ],
            "path_used": "FAST_FACT",
            "groq_calls": 0,
        }

    names = []
    if absent_ids:
        oids = [ObjectId(u) for u in absent_ids if ObjectId.is_valid(u)]
        users = await User.find({
            "company_id": company_id,
            "_id": {"$in": oids},
        }).to_list()
        name_map = {str(u.id): (f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email) for u in users}
        names = [name_map.get(uid, uid) for uid in absent_ids[:10]]

    count_phrase = f"{absent_count} {'employee is' if absent_count == 1 else 'employees are'} absent today out of {total_active} active employees"
    if names:
        count_phrase += f": {', '.join(names)}" + ("..." if absent_count > 10 else ".")
    else:
        count_phrase += "."

    return {
        "answer": count_phrase,
        "facts": [
            {"metric": "hr.absent_today", "value": absent_count},
            {"metric": "hr.absent_today_names", "value": names},
            {"metric": "hr.total_active", "value": total_active},
        ],
        "path_used": "FAST_FACT",
        "groq_calls": 0,
    }


# ---------------------------------------------------------------------------
# Handler registry
# ---------------------------------------------------------------------------

FAST_FACT_HANDLERS: dict[str, callable] = {
    "employee_count": handle_employee_count,
    "employee_names": handle_employee_names,
    "task_count": handle_task_count,
    "pending_task_count": handle_pending_task_count,
    "overdue_task_count": handle_overdue_task_count,
    "completed_today_count": handle_completed_today_count,
    "project_count": handle_project_count,
    "client_count": handle_client_count,
    "sales_count": handle_sales_count,
    "invoice_count": handle_invoice_count,
    "recruitment_count": handle_recruitment_count,
    "absent_today_count": handle_absent_employees_today,
    "pending_leave_count": handle_pending_leave_count,
    "open_jobs_count": handle_open_jobs_count,
    # Bounded LIST/name answers
    "client_names": handle_client_names,
    "open_task_list": handle_open_task_list,
    "today_meetings": handle_today_meetings,
    "open_jobs_list": handle_open_jobs_list,
    "pending_leave_names": handle_pending_leave_names,
}


async def execute_fast_fact(
    handler_name: str,
    company_id: str,
    scope: Any = None,
) -> dict[str, Any]:
    """Execute a fast-fact handler by name, applying entity scope when present."""
    handler = FAST_FACT_HANDLERS.get(handler_name)
    if not handler:
        return {
            "answer": f"I don't have a fast-fact handler for '{handler_name}'.",
            "facts": [],
            "path_used": "FAST_FACT",
            "groq_calls": 0,
            "error": f"Unknown handler: {handler_name}",
        }
    try:
        return await handler(company_id, scope=scope)
    except Exception as exc:
        logger.exception("Fast-fact handler %s failed", handler_name)
        return {
            "answer": f"I was unable to retrieve that information: {exc}",
            "facts": [],
            "path_used": "FAST_FACT",
            "groq_calls": 0,
            "error": str(exc),
        }