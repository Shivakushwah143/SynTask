"""
Phase 10 — HR Reporting Service.

Centralized service layer that reads from existing domain truth (Employee,
Attendance, Leave, Documents, Recruitment, Lifecycle, Payroll) and produces
normalized aggregated data for the HR Dashboard and Reports.

Key principle: this service AGGREGATES — it never owns business logic like
leave balance calculation, attendance status resolution, or payroll computation.
It delegates to the source-of-truth domain services.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.core.cache import DASHBOARD_KEY_PREFIX, cache_get, cache_set
from app.core.clock import utc_now, ClockService
from app.core.config import settings

logger = logging.getLogger(__name__)


def _facet_count(bucket: Optional[List[Dict[str, Any]]]) -> int:
    """Extract the count from a ``$count``-producing ``$facet`` bucket."""
    if not bucket:
        return 0
    return int(bucket[0].get("n", 0))


# =============================================================================
# Helper: batch-resolve department and manager names
# =============================================================================

async def _resolve_department_names(
    company_id: str, department_ids: List[str]
) -> Dict[str, str]:
    """Batch-resolve department_id → department name."""
    from app.models.department import Department
    if not department_ids:
        return {}
    unique_ids = list(set(department_ids))
    departments = await Department.find(
        {"_id": {"$in": unique_ids}, "company_id": company_id, "deleted_at": None}
    ).to_list()
    return {str(d.id): d.name for d in departments}


async def _resolve_user_names(user_ids: List[str]) -> Dict[str, str]:
    """Batch-resolve user_id → full name."""
    from app.models.user import User
    if not user_ids:
        return {}
    unique_ids = list(set(user_ids))
    users = await User.find({"_id": {"$in": unique_ids}}).to_list()
    return {str(u.id): u.full_name() for u in users}


async def _resolve_employee_names(
    company_id: str, employee_ids: List[str]
) -> Dict[str, str]:
    """Batch-resolve EmployeeProfile id → full name (via User)."""
    from app.models.employee_profile import EmployeeProfile
    from app.models.user import User
    if not employee_ids:
        return {}
    unique_ids = list(set(employee_ids))
    profiles = await EmployeeProfile.find(
        {"_id": {"$in": unique_ids}, "company_id": company_id}
    ).to_list()
    user_ids = [p.user_id for p in profiles if p.user_id]
    users = await User.find({"_id": {"$in": user_ids}}).to_list() if user_ids else []
    user_map = {str(u.id): u.full_name() for u in users}
    return {str(p.id): user_map.get(p.user_id, "Unknown") for p in profiles}


async def _company_business_date(company_id: str) -> date:
    """Return today's date in the company business timezone (Phase 4 policy).

    The AttendancePolicy defines the company timezone; all "today" dashboard
    metrics (Present Today / On Leave Today / Holiday Today / Week-Off Today)
    must use this business date, never ``utc_now()``.
    """
    from app.services.attendance_policy_service import get_active_policy
    from app.services.attendance_status_resolver import policy_today_str
    try:
        policy = await get_active_policy(company_id)
    except Exception:
        policy = None
    today_str = policy_today_str(policy)  # falls back to UTC when no policy
    return datetime.strptime(today_str, "%Y-%m-%d").date()


async def _resolve_employee_details(
    company_id: str, employee_ids: List[str]
) -> Dict[str, Dict[str, Any]]:
    """Batch-resolve EmployeeProfile id → {name, number, department_id}."""
    from app.models.employee_profile import EmployeeProfile
    from app.models.user import User
    if not employee_ids:
        return {}
    unique_ids = list(set(employee_ids))
    profiles = await EmployeeProfile.find(
        {"_id": {"$in": unique_ids}, "company_id": company_id}
    ).to_list()
    user_ids = [p.user_id for p in profiles if p.user_id]
    users = await User.find({"_id": {"$in": user_ids}}).to_list() if user_ids else []
    user_map = {str(u.id): u.full_name() for u in users}
    return {
        str(p.id): {
            "name": user_map.get(p.user_id, "Unknown"),
            "employee_number": p.employee_number,
            "department_id": p.department_id,
        }
        for p in profiles
    }


# =============================================================================
# Dashboard Metrics
# =============================================================================

def _hr_canvas_cache_key(company_id: str) -> str:
    """Tenant-safe cache key for the HR dashboard canvas.

    Uses the shared ``dashboard:data`` prefix and embeds the company id so the
    existing ``company_dashboard_pattern`` invalidation clears it on writes and
    a tenant can only ever read its own canvas.
    """
    return f"{DASHBOARD_KEY_PREFIX}:{company_id}:hr_canvas"


async def build_hr_dashboard_canvas(company_id: str) -> Dict[str, Any]:
    """Fetch every HR dashboard section in ONE parallel batch, cached per company.

    All eight sections run concurrently via ``asyncio.gather``; each is
    individually resilient — a failing section degrades to ``None`` exactly
    like the previous per-section ``try/except`` in the endpoint. The result is
    cached in Redis under a company-scoped, tenant-safe key with a short TTL
    (``settings.DASHBOARD_CACHE_TTL``), so every dashboard request — and every
    user in the tenant — shares one aggregation batch.
    """
    cache_key = _hr_canvas_cache_key(company_id)
    cached = await cache_get(cache_key)
    if cached:
        return cached

    async def _safe(section: str, coro):
        try:
            return await coro
        except Exception as exc:
            logger.warning("HR dashboard section %s failed (non-critical): %s", section, exc)
            return None

    (
        employee_summary,
        attendance_today,
        leave_summary,
        document_summary,
        lifecycle_summary,
        recruitment_summary,
        payroll_summary,
        attention_items,
    ) = await asyncio.gather(
        _safe("employee_summary", get_employee_summary(company_id)),
        _safe("attendance_today", get_attendance_today_summary(company_id)),
        _safe("leave_summary", get_leave_summary(company_id)),
        _safe("document_summary", get_document_summary(company_id)),
        _safe("lifecycle_summary", get_lifecycle_summary(company_id)),
        _safe("recruitment_summary", get_recruitment_summary(company_id)),
        _safe("payroll_summary", get_payroll_summary(company_id)),
        _safe("attention_items", get_attention_items(company_id)),
    )

    canvas: Dict[str, Any] = {
        "employee_summary": employee_summary,
        "attendance_today": attendance_today,
        "leave_summary": leave_summary,
        "document_summary": document_summary,
        "lifecycle_summary": lifecycle_summary,
        "recruitment_summary": recruitment_summary,
        "payroll_summary": payroll_summary,
        "attention_items": attention_items or [],
    }
    await cache_set(cache_key, canvas, ttl=settings.DASHBOARD_CACHE_TTL)
    return canvas


async def get_employee_summary(company_id: str) -> dict:
    """Employee headcount summary — uses EmployeeProfile status directly.

    One ``$facet`` aggregation replaces the previous full-collection load:
    status/department/type distributions and the headcount are computed in
    MongoDB and only the aggregate rows are transferred.
    """
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.department import Department

    pipeline = [
        {"$match": {"company_id": company_id}},
        {"$facet": {
            "total": [{"$count": "n"}],
            "by_status": [
                {"$group": {"_id": {"$ifNull": ["$employment_status", "unknown"]}, "count": {"$sum": 1}}},
            ],
            "by_dept": [
                {"$group": {"_id": {"$ifNull": ["$department_id", "unassigned"]}, "count": {"$sum": 1}}},
            ],
            "by_type": [
                {"$group": {"_id": {"$ifNull": ["$employment_type", "unknown"]}, "count": {"$sum": 1}}},
            ],
        }},
    ]
    result = await EmployeeProfile.get_pymongo_collection().aggregate(pipeline).to_list(length=1)
    facet = result[0] if result else {}

    total = _facet_count(facet.get("total"))
    status_counts = {row["_id"]: int(row["count"]) for row in (facet.get("by_status") or [])}
    dept_counts = {row["_id"]: int(row["count"]) for row in (facet.get("by_dept") or [])}
    type_counts = {row["_id"]: int(row["count"]) for row in (facet.get("by_type") or [])}

    # Resolve department names
    dept_names = await _resolve_department_names(company_id, list(dept_counts.keys()))

    department_distribution = [
        {"department": dept_names.get(did, did), "count": count}
        for did, count in sorted(dept_counts.items(), key=lambda x: -x[1])
    ]

    employment_type_distribution = [
        {"type": t, "count": count}
        for t, count in sorted(type_counts.items(), key=lambda x: -x[1])
    ]

    return {
        "total": total,
        "active": status_counts.get(EmploymentStatus.ACTIVE.value, 0),
        "probation": status_counts.get(EmploymentStatus.PROBATION.value, 0),
        "notice_period": status_counts.get(EmploymentStatus.NOTICE_PERIOD.value, 0),
        "onboarding": status_counts.get(EmploymentStatus.ONBOARDING.value, 0),
        "exited": status_counts.get(EmploymentStatus.EXITED.value, 0),
        "department_distribution": department_distribution,
        "employment_type_distribution": employment_type_distribution,
    }


async def get_attendance_today_summary(company_id: str) -> dict:
    """Today's attendance summary using Phase 4 normalized HR statuses.

    "Today" is the company business date (Phase 4 policy timezone). Two light
    round trips replace the previous full loads of every active profile and
    every attendance record: an ids-only aggregation over active employees,
    then one ``$facet`` over today's attendance for those employees that
    returns status counts plus the distinct recorded employee count.
    """
    from app.models.attendance import Attendance
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.services.attendance_status_resolver import HRAttendanceStatus

    today_str = (await _company_business_date(company_id)).strftime("%Y-%m-%d")

    # Only count active employees (not exited) — ids-only, no documents.
    active_rows = await EmployeeProfile.get_pymongo_collection().aggregate([
        {"$match": {"company_id": company_id, "employment_status": {"$in": [
            EmploymentStatus.ACTIVE.value,
            EmploymentStatus.PROBATION.value,
            EmploymentStatus.ONBOARDING.value,
        ]}}},
        {"$group": {"_id": None, "ids": {"$push": "$user_id"}}},
    ]).to_list(length=1)
    active = active_rows[0] if active_rows else {"ids": []}
    active_user_ids = [uid for uid in (active.get("ids") or []) if uid]
    total_employees = len(active_user_ids)

    if not active_user_ids:
        return {
            "date": today_str,
            "total_employees": 0,
            "present": 0, "absent": 0, "on_leave": 0, "half_day": 0,
            "holiday": 0, "week_off": 0, "in_progress": 0, "no_record": 0,
        }

    # Today's attendance for active employees: status counts + distinct
    # employees with a record, in one facet.
    facet_rows = await Attendance.get_pymongo_collection().aggregate([
        {"$match": {
            "company_id": company_id,
            "employee_id": {"$in": active_user_ids},
            "date": today_str,
        }},
        {"$facet": {
            "by_status": [
                {"$group": {"_id": {"$ifNull": ["$hr_status", HRAttendanceStatus.NO_RECORD.value]}, "count": {"$sum": 1}}},
            ],
            "recorded": [
                {"$group": {"_id": "$employee_id"}},
                {"$count": "n"},
            ],
        }},
    ]).to_list(length=1)
    facet = facet_rows[0] if facet_rows else {}

    status_counts = {row["_id"]: int(row["count"]) for row in (facet.get("by_status") or [])}
    recorded_count = _facet_count(facet.get("recorded"))

    # Employees without attendance records
    no_record = total_employees - recorded_count

    return {
        "date": today_str,
        "total_employees": total_employees,
        "present": status_counts.get(HRAttendanceStatus.PRESENT.value, 0),
        "absent": status_counts.get(HRAttendanceStatus.ABSENT.value, 0),
        "on_leave": (
            status_counts.get(HRAttendanceStatus.PAID_LEAVE.value, 0)
            + status_counts.get(HRAttendanceStatus.UNPAID_LEAVE.value, 0)
        ),
        "half_day": status_counts.get(HRAttendanceStatus.HALF_DAY.value, 0),
        "holiday": status_counts.get(HRAttendanceStatus.HOLIDAY.value, 0),
        "week_off": status_counts.get(HRAttendanceStatus.WEEK_OFF.value, 0),
        "in_progress": status_counts.get(HRAttendanceStatus.IN_PROGRESS.value, 0),
        "no_record": no_record,
    }


async def get_leave_summary(company_id: str) -> dict:
    """Leave summary — pending requests, this month's activity, on leave today.

    "On leave today" uses the company business date (Phase 4 policy timezone).
    One ``$facet`` aggregation over leave_requests produces all five buckets
    (including per-type approved units grouped by ``leave_type_id`` + legacy
    ``leave_type``) in a single round trip; leave type names come from a
    projected fetch of the small LeaveTypeConfig collection.
    """
    from app.models.leave import LeaveRequest, LeaveStatus, LeaveTypeConfig

    now = utc_now()
    today = await _company_business_date(company_id)
    today_start = datetime.combine(today, time.min)
    today_end = today_start + timedelta(days=1)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"company_id": company_id}},
        {"$facet": {
            "pending": [
                {"$match": {"status": LeaveStatus.PENDING.value}},
                {"$count": "n"},
            ],
            "approved_month": [
                {"$match": {"status": LeaveStatus.APPROVED.value, "updated_at": {"$gte": month_start}}},
                {"$count": "n"},
            ],
            "rejected_month": [
                {"$match": {"status": LeaveStatus.REJECTED.value, "updated_at": {"$gte": month_start}}},
                {"$count": "n"},
            ],
            "on_leave_today": [
                {"$match": {
                    "status": LeaveStatus.APPROVED.value,
                    "start_date": {"$lte": today_end},
                    "end_date": {"$gte": today_start},
                }},
                {"$count": "n"},
            ],
            "approved_by_type": [
                {"$match": {"status": LeaveStatus.APPROVED.value, "start_date": {"$gte": month_start}}},
                {"$group": {
                    "_id": {"ltid": "$leave_type_id", "lt": "$leave_type"},
                    "units": {"$sum": "$requested_units"},
                }},
            ],
        }},
    ]
    facet_rows, type_docs = await asyncio.gather(
        LeaveRequest.get_pymongo_collection().aggregate(pipeline).to_list(length=1),
        LeaveTypeConfig.get_pymongo_collection().find(
            {"company_id": company_id, "active": True}, {"name": 1}
        ).to_list(length=None),
    )
    facet = facet_rows[0] if facet_rows else {}
    type_map = {str(t["_id"]): t["name"] for t in type_docs}

    # Leave by type — approved units grouped by (leave_type_id, legacy leave_type).
    leave_by_type: Dict[str, float] = {}
    for row in facet.get("approved_by_type") or []:
        key = row.get("_id") or {}
        ltid = key.get("ltid")
        lt = key.get("lt")
        if ltid and ltid in type_map:
            type_name = type_map[ltid]
        elif lt:
            type_name = lt
        else:
            type_name = "Other"
        leave_by_type[type_name] = leave_by_type.get(type_name, 0.0) + float(row.get("units") or 0)

    return {
        "pending_requests": _facet_count(facet.get("pending")),
        "approved_this_month": _facet_count(facet.get("approved_month")),
        "rejected_this_month": _facet_count(facet.get("rejected_month")),
        "on_leave_today": _facet_count(facet.get("on_leave_today")),
        "leave_by_type": [
            {"type": name, "units": units}
            for name, units in sorted(leave_by_type.items(), key=lambda x: -x[1])
        ],
    }


async def get_document_summary(company_id: str) -> dict:
    """Document expiry summary — uses Phase 2 expiry states.

    One ``$facet`` aggregation mirrors ``compute_expiry_state`` (expired <
    today, expiring_soon today..today+30d, valid beyond) so no document body
    is ever loaded; documents without an expiry_date count toward
    ``total_active`` only.
    """
    from app.models.hr_document import HRDocument, HRDocumentStatus

    now = utc_now()
    today = now.date()
    day_start = datetime(today.year, today.month, today.day)
    soon_end = day_start + timedelta(days=30)

    pipeline = [
        {"$match": {"company_id": company_id, "status": HRDocumentStatus.ACTIVE.value}},
        {"$facet": {
            "total": [{"$count": "n"}],
            "expired": [{"$match": {"expiry_date": {"$lt": day_start}}}, {"$count": "n"}],
            "expiring_soon": [
                {"$match": {"expiry_date": {"$gte": day_start, "$lte": soon_end}}},
                {"$count": "n"},
            ],
            "valid": [{"$match": {"expiry_date": {"$gt": soon_end}}}, {"$count": "n"}],
        }},
    ]
    result = await HRDocument.get_pymongo_collection().aggregate(pipeline).to_list(length=1)
    facet = result[0] if result else {}

    return {
        "total_active": _facet_count(facet.get("total")),
        "expired": _facet_count(facet.get("expired")),
        "expiring_soon": _facet_count(facet.get("expiring_soon")),
        "valid": _facet_count(facet.get("valid")),
    }


async def get_lifecycle_summary(company_id: str) -> dict:
    """Lifecycle summary — probation, confirmations due, notice period.

    One ``$facet`` over employee_profiles yields all four profile counts;
    the separation-request count runs in parallel. No documents are loaded.
    """
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.lifecycle import EmployeeSeparationRequest, SeparationStatus

    now = utc_now()
    thirty_days_later = now + timedelta(days=30)

    pipeline = [
        {"$match": {"company_id": company_id}},
        {"$facet": {
            "probation": [
                {"$match": {"employment_status": EmploymentStatus.PROBATION.value}},
                {"$count": "n"},
            ],
            "confirmations_due": [
                {"$match": {
                    "employment_status": EmploymentStatus.PROBATION.value,
                    "probation.end_date": {"$lte": thirty_days_later, "$gte": now},
                }},
                {"$count": "n"},
            ],
            "notice_period": [
                {"$match": {"employment_status": EmploymentStatus.NOTICE_PERIOD.value}},
                {"$count": "n"},
            ],
            "onboarding": [
                {"$match": {"employment_status": EmploymentStatus.ONBOARDING.value}},
                {"$count": "n"},
            ],
        }},
    ]
    exits_count, facet_rows = await asyncio.gather(
        EmployeeSeparationRequest.get_pymongo_collection().count_documents({
            "company_id": company_id,
            "status": {"$in": [
                SeparationStatus.SUBMITTED.value,
                SeparationStatus.UNDER_REVIEW.value,
                SeparationStatus.ACCEPTED.value,
            ]},
        }),
        EmployeeProfile.get_pymongo_collection().aggregate(pipeline).to_list(length=1),
    )
    facet = facet_rows[0] if facet_rows else {}

    return {
        "probation_count": _facet_count(facet.get("probation")),
        "confirmations_due": _facet_count(facet.get("confirmations_due")),
        "notice_period_count": _facet_count(facet.get("notice_period")),
        "upcoming_joinings": _facet_count(facet.get("onboarding")),
        "upcoming_exits": int(exits_count or 0),
    }


async def get_recruitment_summary(company_id: str) -> dict:
    """Recruitment summary — compact hiring funnel stats.

    Two parallel aggregations return only the aggregate rows. This also fixes
    the previous implementation, which imported non-existent ``Job`` /
    ``ApplicationStatus`` names from ``app.recruitment.models`` and therefore
    always raised, silently producing ``recruitment_summary=None``. Open jobs
    follow the canonical recruitment definition
    (``lifecycle_status`` in published/approved/paused).
    """
    from app.recruitment.models import RecruitmentJob, Candidate

    job_pipeline = [
        {"$match": {"company_id": company_id}},
        {"$facet": {
            "open": [
                {"$match": {"lifecycle_status": {"$in": ["published", "approved", "paused"]}}},
                {"$count": "n"},
            ],
        }},
    ]
    candidate_pipeline = [
        {"$match": {"company_id": company_id}},
        {"$group": {"_id": {"$ifNull": ["$status", "unknown"]}, "count": {"$sum": 1}}},
    ]
    job_facet, candidate_rows = await asyncio.gather(
        RecruitmentJob.get_pymongo_collection().aggregate(job_pipeline).to_list(length=1),
        Candidate.get_pymongo_collection().aggregate(candidate_pipeline).to_list(length=None),
    )
    job_result = job_facet[0] if job_facet else {}
    status_counts = {
        str(row["_id"]): int(row["count"])
        for row in (candidate_rows or [])
    }

    def _sum(*keys: str) -> int:
        return sum(status_counts.get(k, 0) for k in keys)

    return {
        "open_jobs": _facet_count(job_result.get("open")),
        "total_candidates": sum(status_counts.values()),
        "shortlisted": _sum("shortlisted", "screening"),
        "interviewing": _sum("interview_1", "interview_2", "interviewing", "interview"),
        "offers_sent": _sum("offer_sent", "offered"),
        "hired": _sum("joined", "employee", "hired"),
    }


async def get_payroll_summary(company_id: str) -> Optional[dict]:
    """Payroll summary — latest processed period."""
    from app.models.payroll import PayrollPeriod, PayrollPeriodStatus

    periods = await PayrollPeriod.find(
        {"company_id": company_id}
    ).sort("-year", "-month").limit(1).to_list()

    if not periods:
        return None

    latest = periods[0]
    return {
        "latest_period_label": f"{latest.year}-{latest.month:02d}",
        "latest_period_status": latest.status.value,
        "employee_count": latest.employee_count,
        "total_earnings": latest.total_earnings,
        "total_deductions": latest.total_deductions,
        "total_net": latest.total_net,
        "currency": "INR",
        "processed_at": latest.processed_at.isoformat() if latest.processed_at else None,
    }


async def get_attention_items(company_id: str) -> list:
    """Build actionable attention items — only items the user can act on.

    All five probes run as parallel ``count_documents`` calls (one projected
    latest-period lookup) instead of five sequential queries plus a full
    document load for the expiring-document check.
    """
    from app.models.leave import LeaveRequest, LeaveStatus
    from app.models.attendance import AttendanceCorrectionRequest, CorrectionStatus
    from app.models.hr_document import HRDocument, HRDocumentStatus
    from app.models.payroll import PayrollPeriod, PayrollPeriodStatus, PayrollRecord, PayrollRecordStatus
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus

    now = utc_now()
    thirty_days = now + timedelta(days=30)
    today = now.date()
    day_start = datetime(today.year, today.month, today.day)
    soon_end = day_start + timedelta(days=30)

    (
        pending_leaves,
        pending_corrections,
        expiring_count,
        confirmations_due,
        latest_periods,
    ) = await asyncio.gather(
        LeaveRequest.get_pymongo_collection().count_documents({
            "company_id": company_id, "status": LeaveStatus.PENDING.value,
        }),
        AttendanceCorrectionRequest.get_pymongo_collection().count_documents({
            "company_id": company_id, "status": CorrectionStatus.PENDING.value,
        }),
        HRDocument.get_pymongo_collection().count_documents({
            "company_id": company_id,
            "status": HRDocumentStatus.ACTIVE.value,
            "expiry_date": {"$gte": day_start, "$lte": soon_end},
        }),
        EmployeeProfile.get_pymongo_collection().count_documents({
            "company_id": company_id,
            "employment_status": EmploymentStatus.PROBATION.value,
            "probation.end_date": {"$lte": thirty_days, "$gte": now},
        }),
        PayrollPeriod.get_pymongo_collection().find(
            {"company_id": company_id, "status": PayrollPeriodStatus.CALCULATED.value},
            {"_id": 1},
        ).sort([("year", -1), ("month", -1)]).limit(1).to_list(length=1),
    )

    items = []

    if pending_leaves > 0:
        items.append({
            "type": "leave_pending",
            "label": f"{pending_leaves} Leave Request{'s' if pending_leaves != 1 else ''} Pending",
            "count": pending_leaves,
            "severity": "warning",
            "route": "/leaves",
        })

    if pending_corrections > 0:
        items.append({
            "type": "correction_pending",
            "label": f"{pending_corrections} Attendance Correction{'s' if pending_corrections != 1 else ''} Pending",
            "count": pending_corrections,
            "severity": "info",
            "route": "/attendance/corrections",
        })

    if expiring_count > 0:
        items.append({
            "type": "document_expiring",
            "label": f"{expiring_count} Document{'s' if expiring_count != 1 else ''} Expiring Soon",
            "count": expiring_count,
            "severity": "warning",
            "route": "/hr/documents",
        })

    if confirmations_due > 0:
        items.append({
            "type": "probation_due",
            "label": f"{confirmations_due} Probation Confirmation{'s' if confirmations_due != 1 else ''} Due",
            "count": confirmations_due,
            "severity": "info",
            "route": "/hr/employees",
        })

    if latest_periods:
        blocked = await PayrollRecord.get_pymongo_collection().count_documents({
            "company_id": company_id,
            "payroll_period_id": str(latest_periods[0]["_id"]),
            "status": PayrollRecordStatus.BLOCKED.value,
        })
        if blocked > 0:
            items.append({
                "type": "payroll_blocked",
                "label": f"{blocked} Payroll Record{'s' if blocked != 1 else ''} Blocked",
                "count": blocked,
                "severity": "critical",
                "route": "/hr/payroll",
            })

    return items


# =============================================================================
# Report Queries
# =============================================================================

async def get_employee_directory(
    company_id: str, department: Optional[str] = None,
    employment_status: Optional[str] = None,
    employment_type: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Employee directory report — filtered, paginated.

    ``user_ids`` restricts the report to those Users (manager team scope).
    """
    from app.models.employee_profile import EmployeeProfile
    from app.models.user import User

    query: dict = {"company_id": company_id}
    if user_ids:
        query["user_id"] = {"$in": user_ids}
    if employment_status:
        query["employment_status"] = employment_status
    if employment_type:
        query["employment_type"] = employment_type
    if department:
        query["department_id"] = department

    total = await EmployeeProfile.find(query).count()
    profiles = await EmployeeProfile.find(query).sort("employee_number").skip(skip).limit(limit).to_list()

    if not profiles:
        return {"items": [], "total": total, "skip": skip, "limit": limit}

    user_ids = [p.user_id for p in profiles if p.user_id]
    users = await User.find({"_id": {"$in": user_ids}}).to_list() if user_ids else []
    user_map = {str(u.id): u for u in users}

    dept_ids = [p.department_id for p in profiles if p.department_id]
    dept_names = await _resolve_department_names(company_id, dept_ids)

    manager_ids = [p.reports_to for p in profiles if p.reports_to]
    manager_names = await _resolve_user_names(manager_ids)

    items = []
    for p in profiles:
        user = user_map.get(p.user_id)
        items.append({
            "employee_id": str(p.id),
            "employee_number": p.employee_number,
            "full_name": user.full_name() if user else "Unknown",
            "department": dept_names.get(p.department_id, None),
            "designation": p.designation,
            "manager_name": manager_names.get(p.reports_to, None),
            "employment_type": p.employment_type.value if p.employment_type else None,
            "joining_date": p.joining_date.isoformat() if p.joining_date else None,
            "employment_status": p.employment_status.value,
        })

    return {"items": items, "total": total, "skip": skip, "limit": limit}


async def get_headcount_report(
    company_id: str, department: Optional[str] = None,
    employment_status: Optional[str] = None,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Headcount aggregated by department."""
    from app.models.employee_profile import EmployeeProfile

    query: dict = {"company_id": company_id}
    if user_ids:
        query["user_id"] = {"$in": user_ids}
    if employment_status:
        query["employment_status"] = employment_status
    if department:
        query["department_id"] = department

    profiles = await EmployeeProfile.find(query).to_list()

    dept_counts: Dict[str, int] = {}
    for p in profiles:
        dept_id = p.department_id or "unassigned"
        dept_counts[dept_id] = dept_counts.get(dept_id, 0) + 1

    dept_names = await _resolve_department_names(company_id, list(dept_counts.keys()))

    items = [
        {"department": dept_names.get(did, did), "count": count}
        for did, count in sorted(dept_counts.items(), key=lambda x: -x[1])
    ]

    # Overall summary
    summary = await get_employee_summary(company_id)

    return {"items": items, "total": len(profiles), "summary": summary}


async def get_joining_exit_trend(
    company_id: str, months: int = 6, user_ids: Optional[List[str]] = None
) -> list:
    """Joining/exit trend data for chart.

    ``user_ids`` restricts the lifecycle events to those Users (manager team
    scope); lifecycle events are keyed by EmployeeProfile _id, so the scoped
    User ids are resolved to profile ids first.
    """
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.lifecycle import EmployeeLifecycleEvent, LifecycleEventType

    now = utc_now()
    start_date = now - timedelta(days=months * 30)

    base_query: dict = {"company_id": company_id}
    if user_ids:
        scoped_profiles = await EmployeeProfile.find(
            {"company_id": company_id, "user_id": {"$in": user_ids}}
        ).to_list()
        allowed_profile_ids = [str(p.id) for p in scoped_profiles]
        base_query["employee_id"] = {"$in": allowed_profile_ids} if allowed_profile_ids else {"$in": []}

    # Joiners — from lifecycle JOINED events
    join_events = await EmployeeLifecycleEvent.find(
        {
            **base_query,
            "event_type": LifecycleEventType.JOINED.value,
            "effective_date": {"$gte": start_date},
        }
    ).to_list()

    # Exits — from lifecycle EXITED events
    exit_events = await EmployeeLifecycleEvent.find(
        {
            **base_query,
            "event_type": {"$in": [
                LifecycleEventType.EXITED.value,
                LifecycleEventType.RESIGNATION_ACCEPTED.value,
                LifecycleEventType.TERMINATED.value,
            ]},
            "effective_date": {"$gte": start_date},
        }
    ).to_list()

    # Build month buckets
    trend: Dict[str, dict] = {}
    for i in range(months):
        month_date = now - timedelta(days=(months - 1 - i) * 30)
        key = month_date.strftime("%Y-%m")
        trend[key] = {"month": key, "joiners": 0, "exits": 0}

    for event in join_events:
        key = event.effective_date.strftime("%Y-%m")
        if key in trend:
            trend[key]["joiners"] += 1

    for event in exit_events:
        key = event.effective_date.strftime("%Y-%m")
        if key in trend:
            trend[key]["exits"] += 1

    return list(trend.values())


async def get_attendance_summary_report(
    company_id: str, date_from: Optional[str] = None,
    date_to: Optional[str] = None, department: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Attendance summary report per employee for a date range."""
    from app.models.attendance import Attendance, HRAttendanceStatus
    from app.models.employee_profile import EmployeeProfile

    if not date_from:
        now = utc_now()
        date_from = now.replace(day=1).strftime("%Y-%m-%d")
    if not date_to:
        date_to = utc_now().strftime("%Y-%m-%d")

    # Get active employees
    emp_query: dict = {"company_id": company_id, "employment_status": {"$ne": "exited"}}
    if user_ids:
        emp_query["user_id"] = {"$in": user_ids}
    if department:
        emp_query["department_id"] = department

    profiles = await EmployeeProfile.find(emp_query).to_list()
    employee_map = {p.user_id: p for p in profiles}

    if not profiles:
        return {"items": [], "total": 0, "skip": 0, "limit": limit}

    # Get attendance records in range
    attendance_records = await Attendance.find({
        "company_id": company_id,
        "employee_id": {"$in": [p.user_id for p in profiles]},
        "date": {"$gte": date_from, "$lte": date_to},
    }).to_list()

    # Group by employee
    emp_data: Dict[str, dict] = {}
    for a in attendance_records:
        if a.employee_id not in emp_data:
            profile = employee_map.get(a.employee_id)
            emp_data[a.employee_id] = {
                "employee_id": a.employee_id,
                "employee_name": "Unknown",
                "employee_number": profile.employee_number if profile else None,
                "department_id": profile.department_id if profile else None,
                "working_days": 0,
                "present": 0, "paid_leave": 0, "unpaid_leave": 0,
                "absent": 0, "half_day": 0, "late_count": 0,
                "early_departure_count": 0, "overtime_minutes": 0.0,
            }

        d = emp_data[a.employee_id]
        d["working_days"] += 1
        hr_status = a.hr_status or "no_record"
        if hr_status in ("present", "in_progress"):
            d["present"] += 1
        elif hr_status == "paid_leave":
            d["paid_leave"] += 1
        elif hr_status == "unpaid_leave":
            d["unpaid_leave"] += 1
        elif hr_status == "absent":
            d["absent"] += 1
        elif hr_status == "half_day":
            d["half_day"] += 1
        if a.is_late:
            d["late_count"] += 1
        if a.is_early_departure:
            d["early_departure_count"] += 1
        d["overtime_minutes"] += a.overtime_minutes

    # Resolve names
    user_ids = list(emp_data.keys())
    name_map = await _resolve_user_names(user_ids)
    dept_ids = [d["department_id"] for d in emp_data.values() if d["department_id"]]
    dept_names = await _resolve_department_names(company_id, dept_ids)

    items = []
    for uid, d in emp_data.items():
        d["employee_name"] = name_map.get(uid, "Unknown")
        d["department"] = dept_names.get(d.pop("department_id"), None)
        items.append(d)

    items.sort(key=lambda x: x["employee_name"])
    total = len(items)
    items = items[skip:skip + limit]

    return {"items": items, "total": total, "skip": skip, "limit": limit}


async def get_late_arrival_report(
    company_id: str, date_from: Optional[str] = None,
    date_to: Optional[str] = None, department: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Late arrival report — employees who clocked in late."""
    from app.models.attendance import Attendance
    from app.models.employee_profile import EmployeeProfile
    from app.services.attendance_policy_service import get_active_policy

    if not date_from:
        now = utc_now()
        date_from = now.replace(day=1).strftime("%Y-%m-%d")
    if not date_to:
        date_to = utc_now().strftime("%Y-%m-%d")

    policy = await get_active_policy(company_id)
    expected_start = policy.expected_start_time if policy else "09:00"

    emp_query: dict = {"company_id": company_id, "employment_status": {"$ne": "exited"}}
    if user_ids:
        emp_query["user_id"] = {"$in": user_ids}
    if department:
        emp_query["department_id"] = department

    profiles = await EmployeeProfile.find(emp_query).to_list()
    employee_map = {p.user_id: p for p in profiles}

    late_records = await Attendance.find({
        "company_id": company_id,
        "employee_id": {"$in": [p.user_id for p in profiles]},
        "date": {"$gte": date_from, "$lte": date_to},
        "is_late": True,
    }).sort("-date").to_list()

    user_ids = list({r.employee_id for r in late_records})
    name_map = await _resolve_user_names(user_ids)
    dept_ids = [employee_map[uid].department_id for uid in user_ids if uid in employee_map and employee_map[uid].department_id]
    dept_names = await _resolve_department_names(company_id, dept_ids)

    items = []
    for r in late_records:
        profile = employee_map.get(r.employee_id)
        items.append({
            "employee_name": name_map.get(r.employee_id, "Unknown"),
            "employee_number": profile.employee_number if profile else None,
            "department": dept_names.get(profile.department_id) if profile and profile.department_id else None,
            "date": r.date,
            "expected_check_in": expected_start,
            "actual_check_in": r.login_time.strftime("%H:%M") if r.login_time else None,
            "late_minutes": r.late_minutes,
        })

    total = len(items)
    items = items[skip:skip + limit]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


async def get_absence_report(
    company_id: str, date_from: Optional[str] = None,
    date_to: Optional[str] = None, department: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Absence report — employees with absent status (not holiday/week-off/leave)."""
    from app.models.attendance import Attendance, HRAttendanceStatus

    if not date_from:
        now = utc_now()
        date_from = now.replace(day=1).strftime("%Y-%m-%d")
    if not date_to:
        date_to = utc_now().strftime("%Y-%m-%d")

    emp_query: dict = {"company_id": company_id, "employment_status": {"$ne": "exited"}}
    if user_ids:
        emp_query["user_id"] = {"$in": user_ids}
    if department:
        emp_query["department_id"] = department

    from app.models.employee_profile import EmployeeProfile
    profiles = await EmployeeProfile.find(emp_query).to_list()
    employee_map = {p.user_id: p for p in profiles}

    absent_records = await Attendance.find({
        "company_id": company_id,
        "employee_id": {"$in": [p.user_id for p in profiles]},
        "date": {"$gte": date_from, "$lte": date_to},
        "hr_status": HRAttendanceStatus.ABSENT.value,
    }).sort("-date").to_list()

    user_ids = list({r.employee_id for r in absent_records})
    name_map = await _resolve_user_names(user_ids)
    dept_ids = [employee_map[uid].department_id for uid in user_ids if uid in employee_map and employee_map[uid].department_id]
    dept_names = await _resolve_department_names(company_id, dept_ids)

    items = []
    for r in absent_records:
        profile = employee_map.get(r.employee_id)
        items.append({
            "employee_name": name_map.get(r.employee_id, "Unknown"),
            "employee_number": profile.employee_number if profile else None,
            "department": dept_names.get(profile.department_id) if profile and profile.department_id else None,
            "date": r.date,
            "hr_status": r.hr_status,
            "reason": None,
        })

    total = len(items)
    items = items[skip:skip + limit]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


async def get_leave_balance_report(
    company_id: str, department: Optional[str] = None,
    leave_type_id: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Leave balance report — per employee, per leave type.

    IDENTITY: ``LeaveBalance.employee_id`` stores the USER id (the Leave domain
    is keyed by User), while ``EmployeeProfile`` is keyed by its own ``_id``.
    This report maps balances to profiles through ``user_id`` — never by
    treating a User id as an EmployeeProfile ``_id``.
    """
    from app.models.leave import LeaveBalance, LeaveTypeConfig
    from app.models.employee_profile import EmployeeProfile

    query: dict = {"company_id": company_id}
    if leave_type_id:
        query["leave_type_id"] = leave_type_id
    if user_ids:
        query["employee_id"] = {"$in": user_ids}

    # Get leave types for names
    leave_types = await LeaveTypeConfig.find({"company_id": company_id}).to_list()
    type_map = {str(lt.id): lt.name for lt in leave_types}

    balances = await LeaveBalance.find(query).to_list()

    if not balances:
        return {"items": [], "total": 0, "skip": skip, "limit": limit}

    # Resolve the EmployeeProfile for each balance through user_id (NOT _id).
    user_ids_set = list({b.employee_id for b in balances})
    emp_profiles = await EmployeeProfile.find({
        "company_id": company_id, "user_id": {"$in": user_ids_set}
    }).to_list()
    profile_by_user = {p.user_id: p for p in emp_profiles}

    # Department filter (profile.department_id is the profile's own field).
    if department:
        balances = [
            b for b in balances
            if (profile_by_user.get(b.employee_id) or {}).department_id == department
        ]

    total = len(balances)
    balances = balances[skip:skip + limit]

    if not balances:
        return {"items": [], "total": total, "skip": skip, "limit": limit}

    name_map = await _resolve_user_names(user_ids_set)
    dept_ids = [p.department_id for p in emp_profiles if p.department_id]
    dept_names = await _resolve_department_names(company_id, dept_ids)

    items = []
    for b in balances:
        profile = profile_by_user.get(b.employee_id)
        items.append({
            "employee_id": b.employee_id,
            "employee_name": name_map.get(b.employee_id, "Unknown"),
            "employee_number": profile.employee_number if profile else None,
            "department": dept_names.get(profile.department_id) if profile and profile.department_id else None,
            "leave_type": type_map.get(b.leave_type_id, "Unknown"),
            "allocated": b.allocated,
            "used": b.used,
            "pending": b.pending,
            "available": b.allocated - b.used - b.pending,
        })

    return {"items": items, "total": total, "skip": skip, "limit": limit}


async def get_leave_usage_report(
    company_id: str, date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_ids: Optional[List[str]] = None,
) -> list:
    """Leave usage by type — approved units summary."""
    from app.models.leave import LeaveRequest, LeaveStatus, LeaveTypeConfig

    if not date_from:
        now = utc_now()
        date_from = now.replace(day=1).strftime("%Y-%m-%d")
    if not date_to:
        date_to = utc_now().strftime("%Y-%m-%d")

    leave_types = await LeaveTypeConfig.find({"company_id": company_id}).to_list()
    type_map = {str(lt.id): lt.name for lt in leave_types}

    leave_query: dict = {
        "company_id": company_id,
        "start_date": {"$gte": datetime.strptime(date_from, "%Y-%m-%d")},
        "end_date": {"$lte": datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)},
    }
    if user_ids:
        leave_query["employee_id"] = {"$in": user_ids}
    requests = await LeaveRequest.find(leave_query).to_list()

    usage: Dict[str, dict] = {}
    for req in requests:
        type_name = type_map.get(req.leave_type_id, req.leave_type.value if req.leave_type else "Other")
        if type_name not in usage:
            usage[type_name] = {
                "leave_type": type_name,
                "total_approved": 0.0,
                "total_pending": 0.0,
                "total_rejected": 0.0,
                "employee_count": set(),
            }
        u = usage[type_name]
        if req.status == LeaveStatus.APPROVED:
            u["total_approved"] += req.requested_units
            u["employee_count"].add(req.employee_id)
        elif req.status == LeaveStatus.PENDING:
            u["total_pending"] += req.requested_units
        elif req.status == LeaveStatus.REJECTED:
            u["total_rejected"] += req.requested_units

    return [
        {
            "leave_type": v["leave_type"],
            "total_approved": v["total_approved"],
            "total_pending": v["total_pending"],
            "total_rejected": v["total_rejected"],
            "employee_count": len(v["employee_count"]),
        }
        for v in sorted(usage.values(), key=lambda x: -x["total_approved"])
    ]


async def get_document_expiry_report(
    company_id: str, department: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Document expiry report — all employee documents with expiry state."""
    from app.models.hr_document import HRDocument, HRDocumentStatus, HRDocumentType
    from app.models.employee_profile import EmployeeProfile
    from app.services.hr_document_service import compute_expiry_state

    # Get document types for names
    doc_types = await HRDocumentType.find({"company_id": company_id}).to_list()
    type_map = {str(dt.id): dt.name for dt in doc_types}

    query: dict = {
        "company_id": company_id,
        "status": HRDocumentStatus.ACTIVE.value,
        "employee_id": {"$ne": None},
    }
    if user_ids:
        # HRDocuments reference EmployeeProfile _id — resolve allowed profile ids
        # from the scoped User ids first.
        scoped_profiles = await EmployeeProfile.find(
            {"company_id": company_id, "user_id": {"$in": user_ids}}
        ).to_list()
        allowed_profile_ids = [str(p.id) for p in scoped_profiles]
        query["employee_id"] = {"$in": allowed_profile_ids} if allowed_profile_ids else {"$in": []}

    documents = await HRDocument.find(query).to_list()

    # Filter by department if needed
    if department:
        employee_ids = list({d.employee_id for d in documents if d.employee_id})
        from app.models.employee_profile import EmployeeProfile
        profiles = await EmployeeProfile.find({
            "company_id": company_id,
            "_id": {"$in": employee_ids},
            "department_id": department,
        }).to_list()
        valid_ids = {str(p.id) for p in profiles}
        documents = [d for d in documents if d.employee_id in valid_ids]

    # Build rows
    employee_ids = list({d.employee_id for d in documents if d.employee_id})
    details = await _resolve_employee_details(company_id, employee_ids)
    dept_names = await _resolve_department_names(
        company_id,
        [details[eid]["department_id"] for eid in employee_ids if eid in details and details[eid].get("department_id")]
    )

    now = utc_now()
    rows = []
    for doc in documents:
        state = compute_expiry_state(doc.expiry_date)
        days_remaining = None
        if doc.expiry_date:
            delta = (doc.expiry_date - now).days
            days_remaining = max(0, delta) if delta > 0 else 0

        emp = details.get(doc.employee_id, {})
        dept_id = emp.get("department_id")
        rows.append({
            "employee_name": emp.get("name", "Unknown"),
            "employee_number": emp.get("employee_number"),
            "department": dept_names.get(dept_id) if dept_id else None,
            "document_type": type_map.get(doc.document_type_id, "Unknown"),
            "expiry_date": doc.expiry_date.isoformat() if doc.expiry_date else None,
            "status": state,
            "days_remaining": days_remaining,
        })

    # Sort: expired first, then expiring soon, then valid
    state_order = {"expired": 0, "expiring_soon": 1, "no_expiry": 2, "valid": 3}
    rows.sort(key=lambda x: (state_order.get(x["status"], 9), -(x["days_remaining"] or 9999)))

    total = len(rows)
    rows = rows[skip:skip + limit]
    return {"items": rows, "total": total, "skip": skip, "limit": limit}


async def get_lifecycle_events_report(
    company_id: str, event_type: Optional[str] = None,
    date_from: Optional[str] = None, date_to: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Lifecycle events report."""
    from app.models.lifecycle import EmployeeLifecycleEvent
    from app.models.employee_profile import EmployeeProfile

    query: dict = {"company_id": company_id}
    if user_ids:
        scoped_profiles = await EmployeeProfile.find(
            {"company_id": company_id, "user_id": {"$in": user_ids}}
        ).to_list()
        allowed_profile_ids = [str(p.id) for p in scoped_profiles]
        query["employee_id"] = {"$in": allowed_profile_ids} if allowed_profile_ids else {"$in": []}
    if event_type:
        query["event_type"] = event_type
    if date_from:
        query["effective_date"] = {"$gte": datetime.strptime(date_from, "%Y-%m-%d")}
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
        if "effective_date" in query:
            query["effective_date"]["$lte"] = end
        else:
            query["effective_date"] = {"$lte": end}

    total = await EmployeeLifecycleEvent.find(query).count()
    events = await EmployeeLifecycleEvent.find(query).sort("-effective_date").skip(skip).limit(limit).to_list()

    if not events:
        return {"items": [], "total": total, "skip": skip, "limit": limit}

    employee_ids = list({e.employee_id for e in events})
    details = await _resolve_employee_details(company_id, employee_ids)
    dept_names = await _resolve_department_names(
        company_id,
        [details[eid]["department_id"] for eid in employee_ids if eid in details and details[eid].get("department_id")]
    )
    actor_ids = list({e.initiated_by for e in events if e.initiated_by})
    actor_names = await _resolve_user_names(actor_ids)

    items = []
    for e in events:
        emp = details.get(e.employee_id, {})
        dept_id = emp.get("department_id")
        # Build summary from before/after states
        prev_summary = _summarize_state(e.previous_state)
        new_summary = _summarize_state(e.new_state)
        items.append({
            "employee_name": emp.get("name", "Unknown"),
            "employee_number": emp.get("employee_number"),
            "department": dept_names.get(dept_id) if dept_id else None,
            "event_type": e.event_type.value,
            "previous_summary": prev_summary,
            "new_summary": new_summary,
            "effective_date": e.effective_date.isoformat() if e.effective_date else None,
            "created_by_name": actor_names.get(e.initiated_by) if e.initiated_by else None,
        })

    return {"items": items, "total": total, "skip": skip, "limit": limit}


def _summarize_state(state: dict) -> Optional[str]:
    """Build a short human-readable summary from a lifecycle before/after state dict."""
    if not state:
        return None
    parts = []
    if "department_name" in state or "department_id" in state:
        parts.append(f"Dept: {state.get('department_name') or state.get('department_id', '?')}")
    if "designation" in state:
        parts.append(f"Designation: {state['designation']}")
    if "employment_status" in state:
        parts.append(f"Status: {state['employment_status']}")
    if "reports_to_name" in state or "reports_to" in state:
        parts.append(f"Manager: {state.get('reports_to_name') or state.get('reports_to', '?')}")
    if "work_mode" in state:
        parts.append(f"Mode: {state['work_mode']}")
    return "; ".join(parts) if parts else None


async def get_probation_report(
    company_id: str, department: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Employees currently on probation."""
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus

    query: dict = {
        "company_id": company_id,
        "employment_status": EmploymentStatus.PROBATION.value,
    }
    if user_ids:
        query["user_id"] = {"$in": user_ids}
    if department:
        query["department_id"] = department

    total = await EmployeeProfile.find(query).count()
    profiles = await EmployeeProfile.find(query).skip(skip).limit(limit).to_list()

    if not profiles:
        return {"items": [], "total": total, "skip": skip, "limit": limit}

    user_ids = [p.user_id for p in profiles]
    name_map = await _resolve_user_names(user_ids)
    manager_ids = [p.reports_to for p in profiles if p.reports_to]
    manager_names = await _resolve_user_names(manager_ids)
    dept_ids = [p.department_id for p in profiles if p.department_id]
    dept_names = await _resolve_department_names(company_id, dept_ids)

    now = utc_now()
    items = []
    for p in profiles:
        status = "active"
        if p.probation and p.probation.end_date:
            if p.probation.end_date < now:
                status = "overdue"
            elif (p.probation.end_date - now).days <= 7:
                status = "due_soon"
        items.append({
            "employee_name": name_map.get(p.user_id, "Unknown"),
            "employee_number": p.employee_number,
            "department": dept_names.get(p.department_id) if p.department_id else None,
            "joining_date": p.joining_date.isoformat() if p.joining_date else None,
            "probation_end": p.probation.end_date.isoformat() if p.probation and p.probation.end_date else None,
            "manager_name": manager_names.get(p.reports_to) if p.reports_to else None,
            "status": status,
        })

    return {"items": items, "total": total, "skip": skip, "limit": limit}


async def get_notice_period_report(
    company_id: str, department: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    user_ids: Optional[List[str]] = None,
) -> dict:
    """Employees currently in notice period."""
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.lifecycle import EmployeeSeparationRequest, SeparationStatus, SeparationType

    query: dict = {
        "company_id": company_id,
        "employment_status": EmploymentStatus.NOTICE_PERIOD.value,
    }
    if user_ids:
        query["user_id"] = {"$in": user_ids}
    if department:
        query["department_id"] = department

    total = await EmployeeProfile.find(query).count()
    profiles = await EmployeeProfile.find(query).skip(skip).limit(limit).to_list()

    if not profiles:
        return {"items": [], "total": total, "skip": skip, "limit": limit}

    profile_ids = [str(p.id) for p in profiles]
    user_ids = [p.user_id for p in profiles]
    name_map = await _resolve_user_names(user_ids)
    manager_ids = [p.reports_to for p in profiles if p.reports_to]
    manager_names = await _resolve_user_names(manager_ids)
    dept_ids = [p.department_id for p in profiles if p.department_id]
    dept_names = await _resolve_department_names(company_id, dept_ids)

    # Get separation requests
    separations = await EmployeeSeparationRequest.find({
        "company_id": company_id,
        "employee_id": {"$in": profile_ids},
        "status": {"$in": [
            SeparationStatus.ACCEPTED.value,
            SeparationStatus.SUBMITTED.value,
            SeparationStatus.UNDER_REVIEW.value,
        ]},
    }).to_list()
    sep_map = {s.employee_id: s for s in separations}

    items = []
    for p in profiles:
        sep = sep_map.get(str(p.id))
        exit_type = sep.separation_type.value if sep else None
        items.append({
            "employee_name": name_map.get(p.user_id, "Unknown"),
            "employee_number": p.employee_number,
            "department": dept_names.get(p.department_id) if p.department_id else None,
            "notice_start": sep.notice_start_date.isoformat() if sep and sep.notice_start_date else None,
            "last_working_day": sep.approved_last_working_day.isoformat() if sep and sep.approved_last_working_day else (p.exit_info.last_working_day.isoformat() if p.exit_info and p.exit_info.last_working_day else None),
            "exit_type": exit_type,
            "manager_name": manager_names.get(p.reports_to) if p.reports_to else None,
        })

    return {"items": items, "total": total, "skip": skip, "limit": limit}


async def get_payroll_summary_report(
    company_id: str, skip: int = 0, limit: int = 50,
) -> dict:
    """Payroll history report — periods with totals."""
    from app.models.payroll import PayrollPeriod

    total = await PayrollPeriod.find({"company_id": company_id}).count()
    periods = await PayrollPeriod.find({"company_id": company_id}).sort("-year", "-month").skip(skip).limit(limit).to_list()

    items = [
        {
            "period_label": f"{p.year}-{p.month:02d}",
            "employee_count": p.employee_count,
            "total_earnings": p.total_earnings,
            "total_deductions": p.total_deductions,
            "total_net": p.total_net,
            "status": p.status.value,
            "processed_at": p.processed_at.isoformat() if p.processed_at else None,
        }
        for p in periods
    ]

    return {"items": items, "total": total, "skip": skip, "limit": limit}


async def get_employee_payroll_report(
    company_id: str, payroll_period_id: Optional[str] = None,
    department: Optional[str] = None,
    skip: int = 0, limit: int = 50,
) -> dict:
    """Employee payroll report — per-employee records for a period. PAYROLL PERMISSION REQUIRED."""
    from app.models.payroll import PayrollRecord

    query: dict = {"company_id": company_id}
    if payroll_period_id:
        query["payroll_period_id"] = payroll_period_id
    if department:
        query["department"] = department

    total = await PayrollRecord.find(query).count()
    records = await PayrollRecord.find(query).sort("employee_name").skip(skip).limit(limit).to_list()

    items = [
        {
            "employee_name": r.employee_name,
            "employee_number": r.employee_number,
            "department": r.department,
            "period_label": "",  # resolved from period if needed
            "payable_days": r.payable_days,
            "gross": r.gross_salary,
            "deductions": r.total_deductions,
            "net": r.net_salary,
            "currency": r.currency,
        }
        for r in records
    ]

    return {"items": items, "total": total, "skip": skip, "limit": limit}


# =============================================================================
# CSV Export Helpers
# =============================================================================

def generate_csv(headers: List[str], rows: List[List[Any]]) -> str:
    """Generate a CSV string from headers and rows."""
    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return output.getvalue()
