"""
Company Operational Snapshot — compact executive overview with Redis caching.

Provides a pre-computed snapshot of key company metrics across ALL domains
(business + HR) for frequent 'company health' and 'what needs attention'
queries. Built from SynTask services, cached in Redis with a short TTL,
and refreshed on demand.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.core.clock import utc_now

logger = logging.getLogger(__name__)

SNAPSHOT_CACHE_PREFIX = "exec:snapshot:"
SNAPSHOT_DEFAULT_TTL = 60  # seconds — short enough for freshness


async def get_company_snapshot(company_id: str, *, force_refresh: bool = False) -> dict[str, Any]:
    """Get the company operational snapshot, using Redis cache when available.

    Returns a compact dict with counts across all business + HR domains.
    """
    cache_key = f"{SNAPSHOT_CACHE_PREFIX}{company_id}"

    # Try Redis cache first
    if not force_refresh:
        try:
            from app.core.redis_client import get_redis
            redis = await get_redis()
            if redis:
                cached = await redis.get(cache_key)
                if cached:
                    return json.loads(cached)
        except Exception:
            pass  # Redis unavailable — compute fresh

    # Build snapshot from SynTask services
    snapshot = await _build_snapshot(company_id)

    # Cache in Redis
    try:
        from app.core.redis_client import get_redis
        redis = await get_redis()
        if redis:
            await redis.setex(cache_key, SNAPSHOT_DEFAULT_TTL, json.dumps(snapshot, default=str))
    except Exception:
        pass  # Redis unavailable — return fresh snapshot

    return snapshot


async def _build_snapshot(company_id: str) -> dict[str, Any]:
    """Build the snapshot from SynTask models and services."""
    import asyncio
    from datetime import timedelta

    today = utc_now()
    today_start = today.replace(hour=0, minute=0, second=0, microsecond=0)
    today_str = today_start.date().isoformat()
    tomorrow_str = (today_start + timedelta(days=1)).date().isoformat()

    # Parallelize all independent count queries
    results = await asyncio.gather(
        _count_employees(company_id, "active"),
        _count_employees_absent_today(company_id, today_str, tomorrow_str),
        _count_tasks(company_id, "open"),
        _count_tasks(company_id, "overdue"),
        _count_tasks(company_id, "completed_today"),
        _count_projects(company_id, "active"),
        _count_projects(company_id, "at_risk"),
        _count_projects(company_id, "delayed"),
        _count_clients(company_id, "active"),
        _count_clients(company_id, "at_risk"),
        _count_sales(company_id, "active_leads"),
        _count_sales(company_id, "won_period"),
        _count_sales(company_id, "followups_overdue"),
        _count_invoices(company_id, "overdue"),
        _sum_invoices(company_id, "receivables"),
        _count_hr_pending_leaves(company_id),
        _count_recruitment(company_id, "open_jobs"),
        _count_recruitment(company_id, "pending_interviews"),
        _count_recruitment(company_id, "offers_pending"),
    )

    (
        employee_active, employee_absent_today,
        task_open, task_overdue, task_completed_today,
        project_active, project_at_risk, project_delayed,
        client_active, client_at_risk,
        sales_active_leads, sales_won_period, sales_followups_overdue,
        invoice_overdue_count, invoice_receivables,
        hr_pending_leaves,
        recruitment_open_jobs, recruitment_pending_interviews, recruitment_offers_pending,
    ) = results

    return {
        "generated_at": today.isoformat(),
        "employees": {
            "active": employee_active,
            "absent_today": employee_absent_today,
        },
        "tasks": {
            "open": task_open,
            "overdue": task_overdue,
            "completed_today": task_completed_today,
        },
        "projects": {
            "active": project_active,
            "at_risk": project_at_risk,
            "delayed": project_delayed,
        },
        "clients": {
            "active": client_active,
            "at_risk": client_at_risk,
        },
        "sales": {
            "active_leads": sales_active_leads,
            "won_period": sales_won_period,
            "followups_overdue": sales_followups_overdue,
        },
        "finance": {
            "overdue_invoices": invoice_overdue_count,
            "receivables": invoice_receivables,
        },
        "hr": {
            "pending_leaves": hr_pending_leaves,
        },
        "recruitment": {
            "open_jobs": recruitment_open_jobs,
            "pending_interviews": recruitment_pending_interviews,
            "offers_pending": recruitment_offers_pending,
        },
    }


# ---------------------------------------------------------------------------
# Individual count helpers — each is a small focused query
# ---------------------------------------------------------------------------

async def _count_employees(company_id: str, scope: str) -> int:
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    if scope == "active":
        return await EmployeeProfile.find({
            "company_id": company_id,
            "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
        }).count()
    return 0


async def _count_employees_absent_today(company_id: str, today_str: str, tomorrow_str: str) -> int:
    """Count employees absent today (no attendance record or checked out)."""
    try:
        from app.attendance_domain.models import Attendance, AttendanceStatus
        records = await Attendance.find({
            "company_id": company_id,
            "date": {"$gte": today_str, "$lt": tomorrow_str},
            "status": {"$in": [AttendanceStatus.WORKING.value, AttendanceStatus.ON_BREAK.value]},
        }).count()
        # Total active employees
        from app.models.employee_profile import EmployeeProfile, EmploymentStatus
        total = await EmployeeProfile.find({
            "company_id": company_id,
            "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
        }).count()
        return max(0, total - records)
    except Exception:
        return 0


async def _count_tasks(company_id: str, scope: str) -> int:
    from app.models.task import Task, TaskStatus
    from app.core.clock import utc_now as _now

    if scope == "open":
        return await Task.find({
            "company_id": company_id,
            "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
        }).count()
    elif scope == "overdue":
        return await Task.find({
            "company_id": company_id,
            "status": {"$in": [TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value, TaskStatus.IN_REVIEW.value]},
            "due_date": {"$lt": _now(), "$ne": None},
        }).count()
    elif scope == "completed_today":
        today = _now().replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = today + timedelta(days=1)
        return await Task.find({
            "company_id": company_id,
            "status": TaskStatus.COMPLETED.value,
            "completed_at": {"$gte": today, "$lt": tomorrow},
        }).count()
    return 0


async def _count_projects(company_id: str, scope: str) -> int:
    from app.models.project import Project, ProjectStatus
    if scope == "active":
        return await Project.find({
            "company_id": company_id,
            "status": {"$in": [ProjectStatus.ACTIVE.value, ProjectStatus.EXECUTION.value, ProjectStatus.REVIEW.value]},
        }).count()
    elif scope == "at_risk":
        return await Project.find({
            "company_id": company_id,
            "status": ProjectStatus.ON_HOLD.value,
        }).count()
    elif scope == "delayed":
        now = utc_now()
        return await Project.find({
            "company_id": company_id,
            "status": {"$in": [ProjectStatus.ACTIVE.value, ProjectStatus.EXECUTION.value]},
            "delivery_date": {"$lt": now, "$ne": None},
        }).count()
    return 0


async def _count_clients(company_id: str, scope: str) -> int:
    from app.models.client import Client, ClientStatus
    if scope == "active":
        return await Client.find({
            "company_id": company_id,
            "status": {"$in": [ClientStatus.ACTIVE.value, ClientStatus.ONBOARDING.value]},
        }).count()
    elif scope == "at_risk":
        return await Client.find({
            "company_id": company_id,
            "status": ClientStatus.AT_RISK.value,
        }).count()
    return 0


async def _count_sales(company_id: str, scope: str) -> int:
    from app.models.sales_prospect import SalesProspect, ProspectStatus
    now = utc_now()
    if scope == "active_leads":
        return await SalesProspect.find({
            "company_id": company_id,
            "status": ProspectStatus.ACTIVE.value,
            "deleted": False,
        }).count()
    elif scope == "won_period":
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return await SalesProspect.find({
            "company_id": company_id,
            "status": ProspectStatus.WON.value,
            "closed_date": {"$gte": month_start},
            "deleted": False,
        }).count()
    elif scope == "followups_overdue":
        return await SalesProspect.find({
            "company_id": company_id,
            "status": ProspectStatus.ACTIVE.value,
            "next_follow_up_at": {"$lt": now, "$ne": None},
            "deleted": False,
        }).count()
    return 0


async def _count_invoices(company_id: str, scope: str) -> int:
    from app.models.invoice import Invoice, InvoiceStatus
    if scope == "overdue":
        return await Invoice.find({
            "company_id": company_id,
            "status": InvoiceStatus.SENT.value,
            "due_date": {"$lt": utc_now()},
        }).count()
    return 0


async def _sum_invoices(company_id: str, scope: str) -> float:
    from app.models.invoice import Invoice
    if scope == "receivables":
        invoices = await Invoice.find({
            "company_id": company_id,
            "outstanding_amount": {"$gt": 0},
        }).to_list()
        return round(sum(inv.outstanding_amount or 0.0 for inv in invoices), 2)
    return 0.0


async def _count_hr_pending_leaves(company_id: str) -> int:
    """Count pending leave requests."""
    try:
        from app.models.leave import LeaveRequest, LeaveStatus
        return await LeaveRequest.find({
            "company_id": company_id,
            "status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.FORWARDED.value]},
        }).count()
    except Exception:
        return 0


async def _count_recruitment(company_id: str, scope: str) -> int:
    try:
        if scope == "open_jobs":
            from app.models.jobOpening import JobOpening, JobStatus
            return await JobOpening.find({
                "company_id": company_id,
                "status": {"$in": [JobStatus.OPEN.value, JobStatus.ON_HOLD.value]},
            }).count()
        elif scope == "pending_interviews":
            from app.models.interview import Interview, InterviewStatus
            return await Interview.find({
                "company_id": company_id,
                "status": {"$in": [InterviewStatus.SCHEDULED.value, InterviewStatus.RESCHEDULED.value]},
            }).count()
        elif scope == "offers_pending":
            from app.models.offer import Offer, OfferStatus
            return await Offer.find({
                "company_id": company_id,
                "status": {"$in": [OfferStatus.SENT.value, OfferStatus.PENDING.value]},
            }).count()
    except Exception:
        return 0
    return 0
