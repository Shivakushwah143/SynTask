"""
HR Agent Tool Definitions and Implementations.

All tools call existing SynTask services/models. The LLM never has direct
database access; every tool argument is validated before execution.

Tool names follow the SynTask agent convention: snake_case, verb_first.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.core.clock import utc_now

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tool argument schemas (Pydantic — validated before execution)
# ---------------------------------------------------------------------------


class SearchEmployeesArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=200, description="Name, email, employee number, or partial match")
    limit: int = Field(default=5, ge=1, le=20)


class GetEmployee360Args(BaseModel):
    employee_id: str = Field(..., min_length=1, description="Employee profile _id or user_id")


class SearchCandidatesArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=200, description="Candidate name, email, or id")
    job_id: Optional[str] = Field(default=None, description="Optional job_id filter")
    limit: int = Field(default=5, ge=1, le=20)


class GetCandidate360Args(BaseModel):
    candidate_id: str = Field(..., min_length=1, description="Candidate _id")


class SearchJobsArgs(BaseModel):
    query: str = Field(..., min_length=1, max_length=200, description="Job title, id, or slug")
    limit: int = Field(default=5, ge=1, le=20)


class GetJob360Args(BaseModel):
    job_id: str = Field(..., min_length=1, description="RecruitmentJob _id")


class GetEmployeeAttendanceArgs(BaseModel):
    employee_id: str = Field(..., min_length=1)
    start_date: Optional[str] = Field(default=None, description="YYYY-MM-DD, defaults to today")
    end_date: Optional[str] = Field(default=None, description="YYYY-MM-DD, defaults to start_date")


class GetEmployeeLeaveArgs(BaseModel):
    employee_id: str = Field(..., min_length=1)
    status: Optional[str] = Field(default=None, description="Filter: pending, approved, rejected, cancelled")


class GetEmployeeDocumentsArgs(BaseModel):
    employee_id: str = Field(..., min_length=1)


class GetRecruitmentOverviewArgs(BaseModel):
    job_id: Optional[str] = Field(default=None, description="Optional specific job")
    days: int = Field(default=30, ge=1, le=90)


class GetInterviewsArgs(BaseModel):
    job_id: Optional[str] = None
    candidate_id: Optional[str] = None
    status: Optional[str] = Field(default=None, description="Filter by interview lifecycle status")
    days: int = Field(default=14, ge=1, le=90)


class GetInterviewFeedbackStatusArgs(BaseModel):
    job_id: Optional[str] = None
    days: int = Field(default=14, ge=1, le=90)


class GetOfferStatusArgs(BaseModel):
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None
    status: Optional[str] = None


class GetHrAttentionSummaryArgs(BaseModel):
    """No required arguments — returns consolidated attention items."""
    pass


class GetEmployeeSalaryArgs(BaseModel):
    employee_id: str = Field(..., min_length=1)


class GetPayrollStatusArgs(BaseModel):
    job_id: Optional[str] = None
    status: Optional[str] = None


class GetPayrollBlockersArgs(BaseModel):
    pass


class GetEmployeePayslipStatusArgs(BaseModel):
    employee_id: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Tool registry: schema + metadata
# ---------------------------------------------------------------------------

HR_TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_employees",
            "description": "Search for employees by name, email, employee number, or partial match. Returns matching employee profiles with basic info.",
            "parameters": SearchEmployeesArgs.model_json_schema(),
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_employee_360",
            "description": "Get a comprehensive 360-degree view of an employee: profile, employment, attendance, leave, documents, onboarding, recruitment history, and payroll (if available).",
            "parameters": GetEmployee360Args.model_json_schema(),
        },
    },
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
    {
        "type": "function",
        "function": {
            "name": "get_hr_attention_summary",
            "description": "Get a consolidated daily HR attention summary: attendance anomalies, pending leaves, onboarding blockers, missing/expiring documents, interview pipeline issues, and payroll blockers.",
            "parameters": GetHrAttentionSummaryArgs.model_json_schema(),
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
# Tool execution helpers — these call existing SynTask services directly
# ---------------------------------------------------------------------------

async def _resolve_employee(company_id: str, identifier: str) -> Optional[dict]:
    """Resolve an employee by id, user_id, employee_number, name, or email."""
    from app.models.employee_profile import EmployeeProfile
    from app.models.user import User

    # Try exact _id match first (may fail if not a valid ObjectId)
    try:
        profile = await EmployeeProfile.get(identifier)
        if profile and profile.company_id == company_id:
            return profile
    except Exception:
        pass

    # Try user_id match
    profile = await EmployeeProfile.find_one(
        {"company_id": company_id, "user_id": identifier}
    )
    if profile:
        return profile

    # Try employee_number match
    profile = await EmployeeProfile.find_one(
        {"company_id": company_id, "employee_number": identifier}
    )
    if profile:
        return profile

    # Try name/email search via User
    term = identifier.strip()
    # If term contains a space, try splitting into first/last name
    name_parts = term.split(None, 1)  # Split on first whitespace
    if len(name_parts) == 2:
        first, last = name_parts
        users = await User.find({
            "company_id": company_id,
            "$or": [
                {"$and": [
                    {"first_name": {"$regex": f"^{first}$", "$options": "i"}},
                    {"last_name": {"$regex": f"^{last}$", "$options": "i"}},
                ]},
                {"first_name": {"$regex": f"^{term}$", "$options": "i"}},
                {"last_name": {"$regex": f"^{term}$", "$options": "i"}},
                {"email": {"$regex": f"^{term}$", "$options": "i"}},
            ],
        }).to_list()
    else:
        users = await User.find({
            "company_id": company_id,
            "$or": [
                {"first_name": {"$regex": f"^{term}$", "$options": "i"}},
                {"last_name": {"$regex": f"^{term}$", "$options": "i"}},
                {"email": {"$regex": f"^{term}$", "$options": "i"}},
            ],
        }).to_list()

    if users:
        profile = await EmployeeProfile.find_one(
            {"company_id": company_id, "user_id": str(users[0].id)}
        )
        if profile:
            return profile

    # Partial name match
    users = await User.find({
        "company_id": company_id,
        "$or": [
            {"first_name": {"$regex": term, "$options": "i"}},
            {"last_name": {"$regex": term, "$options": "i"}},
        ],
    }).to_list()

    if users:
        user = users[0]
        profile = await EmployeeProfile.find_one(
            {"company_id": company_id, "user_id": str(user.id)}
        )
        if profile:
            return profile

    return None


async def _resolve_user(company_id: str, user_id: str):
    """Get a User document scoped to company."""
    from app.models.user import User
    user = await User.get(user_id)
    if user and user.company_id == company_id:
        return user
    return None


async def _serialize_employee(profile, user=None) -> dict:
    """Serialize an employee profile into a concise dict for the LLM."""
    from app.services.employee_profile_service import build_detail
    if user is None:
        user = await _resolve_user(profile.company_id, profile.user_id)
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
        "manager": detail.get("manager_name"),
        "employment_type": detail.get("employment_type"),
        "joining_date": str(detail.get("joining_date", "")),
        "status": detail.get("employment_status"),
        "work_mode": detail.get("work_mode"),
        "employment_status": detail.get("employment_status"),
    }


# ---------------------------------------------------------------------------
# Tool implementations — called by the HR agent loop
# ---------------------------------------------------------------------------


async def execute_search_employees(company_id: str, args: SearchEmployeesArgs) -> dict:
    """Search employees within company scope."""
    from app.services.employee_profile_service import list_employees

    items, total = await list_employees(
        company_id,
        search=args.query,
        page_size=args.limit,
    )
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
    """Comprehensive employee 360 view."""
    profile = await _resolve_employee(company_id, args.employee_id)
    if not profile:
        return {"error": "No employee found matching the given identifier."}

    user = await _resolve_user(profile.company_id, profile.user_id)
    if not user:
        return {"error": "Employee user account not found."}

    # Basic profile
    employee = await _serialize_employee(profile, user)

    # Attendance (last 30 days)
    attendance = await _get_attendance_summary(profile.company_id, profile.user_id, days=30)

    # Leave
    leave = await _get_leave_summary(profile.company_id, profile.user_id)

    # Documents
    documents = await _get_documents_summary(profile.company_id, profile.user_id)

    # Onboarding / lifecycle
    onboarding = {
        "employment_status": profile.employment_status.value if hasattr(profile.employment_status, 'value') else str(profile.employment_status),
        "probation": profile.probation.model_dump() if profile.probation else None,
        "exit_info": profile.exit_info.model_dump() if profile.exit_info else None,
    }

    # Recruitment history (if linked)
    recruitment = None
    if profile.candidate_id:
        from app.recruitment.models import Candidate
        candidate = await Candidate.get(profile.candidate_id)
        if candidate and candidate.company_id == company_id:
            recruitment = {
                "candidate_id": str(candidate.id),
                "status": candidate.status.value if hasattr(candidate.status, 'value') else str(candidate.status),
                "source": candidate.source,
            }

    # Payroll (branch-dependent)
    payroll = await _get_payroll_summary(profile.company_id, profile.user_id)

    return {
        "employee": employee,
        "attendance": attendance,
        "leave": leave,
        "documents": documents,
        "onboarding": onboarding,
        "recruitment_history": recruitment,
        "payroll": payroll,
    }


async def execute_search_candidates(company_id: str, args: SearchCandidatesArgs) -> dict:
    """Search candidates within company scope."""
    from app.recruitment.models import Candidate

    query: dict[str, Any] = {"company_id": company_id}
    if args.job_id:
        query["job_id"] = args.job_id

    # Name or email search
    term = args.query.strip()
    query["$or"] = [
        {"full_name": {"$regex": term, "$options": "i"}},
        {"email": {"$regex": term, "$options": "i"}},
    ]

    candidates = await Candidate.find(query).limit(args.limit).to_list()
    return {
        "total": len(candidates),
        "candidates": [
            {
                "id": str(c.id),
                "full_name": c.full_name,
                "email": c.email,
                "status": c.status.value if hasattr(c.status, 'value') else str(c.status),
                "job_id": c.job_id,
                "experience_years": c.experience_years,
                "skills": c.skills[:10],
            }
            for c in candidates
        ],
    }


async def execute_get_candidate_360(company_id: str, args: GetCandidate360Args) -> dict:
    """Comprehensive candidate 360 view."""
    from app.recruitment.models import (
        Application, Candidate, CandidateJobScore, Interview,
        InterviewFeedback, Offer, Resume,
    )

    candidate = await Candidate.get(args.candidate_id)
    if not candidate or candidate.company_id != company_id:
        return {"error": "Candidate not found."}

    # Applications
    applications = await Application.find(
        {"company_id": company_id, "candidate_id": str(candidate.id)}
    ).to_list()
    app_list = []
    for app in applications:
        app_list.append({
            "id": str(app.id),
            "job_id": app.job_id,
            "status": app.status.value if hasattr(app.status, 'value') else str(app.status),
            "applied_at": str(app.applied_at),
        })

    # Scores
    scores = await CandidateJobScore.find(
        {"company_id": company_id, "candidate_id": str(candidate.id)}
    ).to_list()
    score_list = [
        {
            "job_id": s.job_id,
            "score": s.score,
            "scored_at": str(s.scored_at),
        }
        for s in scores
    ]

    # Interviews
    interviews = await Interview.find(
        {"company_id": company_id, "candidate_id": str(candidate.id)}
    ).to_list()
    interview_list = [
        {
            "id": str(i.id),
            "job_id": i.job_id,
            "round": i.round,
            "interview_type": i.interview_type,
            "status": i.status.value if hasattr(i.status, 'value') else str(i.status),
            "feedback_status": i.feedback_status.value if hasattr(i.feedback_status, 'value') else str(i.feedback_status),
            "decision": i.decision.value if i.decision and hasattr(i.decision, 'value') else str(i.decision) if i.decision else None,
            "schedule_at": str(i.schedule_at),
        }
        for i in interviews
    ]

    # Offers
    offers = await Offer.find(
        {"company_id": company_id, "candidate_id": str(candidate.id)}
    ).to_list()
    offer_list = [
        {
            "id": str(o.id),
            "job_id": o.job_id,
            "status": o.status,
            "offered_ctc": o.offered_ctc,
            "sent_at": str(o.sent_at) if o.sent_at else None,
            "accepted_at": str(o.accepted_at) if o.accepted_at else None,
        }
        for o in offers
    ]

    # Resumes
    resumes = await Resume.find(
        {"company_id": company_id, "candidate_id": str(candidate.id)}
    ).to_list()
    resume_list = [
        {
            "id": str(r.id),
            "original_filename": r.original_filename,
            "processing_status": r.processing_status,
        }
        for r in resumes
    ]

    return {
        "candidate": {
            "id": str(candidate.id),
            "full_name": candidate.full_name,
            "email": candidate.email,
            "phone": candidate.phone,
            "status": candidate.status.value if hasattr(candidate.status, 'value') else str(candidate.status),
            "experience_years": candidate.experience_years,
            "skills": candidate.skills,
            "current_company": candidate.current_company,
            "location": candidate.location,
            "employee_id": candidate.employee_id,
        },
        "applications": app_list,
        "scores": score_list,
        "interviews": interview_list,
        "offers": offer_list,
        "resumes": resume_list,
    }


async def execute_search_jobs(company_id: str, args: SearchJobsArgs) -> dict:
    """Search job openings within company scope."""
    from app.recruitment.models import RecruitmentJob

    term = args.query.strip()
    query: dict[str, Any] = {
        "company_id": company_id,
        "$or": [
            {"title": {"$regex": term, "$options": "i"}},
            {"slug": {"$regex": term, "$options": "i"}},
        ],
    }
    jobs = await RecruitmentJob.find(query).limit(args.limit).to_list()
    return {
        "total": len(jobs),
        "jobs": [
            {
                "id": str(j.id),
                "title": j.title,
                "slug": j.slug,
                "department_id": j.department_id,
                "lifecycle_status": j.lifecycle_status.value if hasattr(j.lifecycle_status, 'value') else str(j.lifecycle_status),
                "location": j.location,
                "employment_type": j.employment_type.value if hasattr(j.employment_type, 'value') else str(j.employment_type),
                "openings": j.openings,
                "analytics": j.analytics_counters.model_dump() if j.analytics_counters else {},
            }
            for j in jobs
        ],
    }


async def execute_get_job_360(company_id: str, args: GetJob360Args) -> dict:
    """Comprehensive job 360 view with pipeline, candidates, and bottlenecks."""
    from app.recruitment.models import (
        Application, Candidate, Interview, Offer, RecruitmentJob,
    )

    job = await RecruitmentJob.get(args.job_id)
    if not job or job.company_id != company_id:
        return {"error": "Job not found."}

    # Pipeline counts by status
    applications = await Application.find(
        {"company_id": company_id, "job_id": str(job.id)}
    ).to_list()

    pipeline: dict[str, int] = {}
    for app in applications:
        status = app.status.value if hasattr(app.status, 'value') else str(app.status)
        pipeline[status] = pipeline.get(status, 0) + 1

    # Pending interviews
    now = utc_now()
    pending_interviews = await Interview.find({
        "company_id": company_id,
        "job_id": str(job.id),
        "status": {"$in": ["scheduled", "confirmed", "in_progress"]},
    }).to_list()

    # Missing feedback
    missing_feedback = await Interview.find({
        "company_id": company_id,
        "job_id": str(job.id),
        "feedback_status": "pending",
        "status": {"$in": ["completed"]},
    }).to_list()

    # Offers
    offers = await Offer.find({
        "company_id": company_id,
        "job_id": str(job.id),
    }).to_list()
    offer_stats: dict[str, int] = {}
    for o in offers:
        offer_stats[o.status] = offer_stats.get(o.status, 0) + 1

    return {
        "job": {
            "id": str(job.id),
            "title": job.title,
            "slug": job.slug,
            "lifecycle_status": job.lifecycle_status.value if hasattr(job.lifecycle_status, 'value') else str(job.lifecycle_status),
            "location": job.location,
            "openings": job.openings,
            "required_skills": job.required_skills,
        },
        "pipeline": pipeline,
        "pending_interviews_count": len(pending_interviews),
        "missing_feedback_count": len(missing_feedback),
        "missing_feedback_interviews": [
            {
                "id": str(i.id),
                "candidate_id": i.candidate_id,
                "round": i.round,
                "interview_type": i.interview_type,
                "scheduled_at": str(i.schedule_at),
            }
            for i in missing_feedback[:5]
        ],
        "offer_stats": offer_stats,
        "analytics": job.analytics_counters.model_dump() if job.analytics_counters else {},
    }


async def execute_get_employee_attendance(company_id: str, args: GetEmployeeAttendanceArgs) -> dict:
    """Get attendance records for an employee."""
    from app.attendance_domain.models import Attendance

    # Verify employee exists in company
    profile = await _resolve_employee(company_id, args.employee_id)
    if not profile:
        return {"error": "Employee not found."}

    user_id = profile.user_id

    # Parse dates
    today = utc_now().date()
    try:
        start = date.fromisoformat(args.start_date) if args.start_date else today
    except ValueError:
        return {"error": "Invalid start_date format. Use YYYY-MM-DD."}
    try:
        end = date.fromisoformat(args.end_date) if args.end_date else start
    except ValueError:
        return {"error": "Invalid end_date format. Use YYYY-MM-DD."}

    records = await Attendance.find({
        "company_id": company_id,
        "employee_id": user_id,
        "date": {"$gte": start.isoformat(), "$lte": end.isoformat()},
    }).to_list()
    records.sort(key=lambda r: r.date or "")
    records.reverse()  # Most recent first

    return {
        "employee_id": user_id,
        "date_range": {"start": start.isoformat(), "end": end.isoformat()},
        "total_records": len(records),
        "records": [
            {
                "date": r.date,
                "status": r.status.value if hasattr(r.status, 'value') else str(r.status),
                "login_time": r.login_time.isoformat() if r.login_time else None,
                "logout_time": r.logout_time.isoformat() if r.logout_time else None,
                "total_working_hours": r.total_working_hours,
                "break_duration": r.break_duration,
                "is_late": r.is_late,
                "work_type": r.work_type,
            }
            for r in records
        ],
    }


async def execute_get_employee_leave(company_id: str, args: GetEmployeeLeaveArgs) -> dict:
    """Get leave requests and balances for an employee."""
    from app.models.leave import LeaveRequest, LeaveBalance, LeaveStatus

    profile = await _resolve_employee(company_id, args.employee_id)
    if not profile:
        return {"error": "Employee not found."}

    user_id = profile.user_id

    # Leave requests
    query: dict[str, Any] = {
        "company_id": company_id,
        "employee_id": user_id,
    }
    if args.status:
        query["status"] = args.status

    requests = await LeaveRequest.find(query).to_list()
    requests.sort(key=lambda r: r.created_at or __import__("datetime").datetime.min, reverse=True)
    leave_requests = [
        {
            "id": str(lr.id),
            "leave_type": lr.leave_type.value if hasattr(lr.leave_type, 'value') else str(lr.leave_type),
            "start_date": lr.start_date.isoformat() if lr.start_date else None,
            "end_date": lr.end_date.isoformat() if lr.end_date else None,
            "status": lr.status.value if hasattr(lr.status, 'value') else str(lr.status),
            "reason": lr.reason,
            "requested_units": getattr(lr, "requested_units", None),
        }
        for lr in requests[:10]
    ]

    # Leave balances
    balances = await LeaveBalance.find({
        "company_id": company_id,
        "employee_id": user_id,
    }).to_list()
    leave_balances = [
        {
            "leave_type_id": b.leave_type_id,
            "allocated": b.allocated,
            "used": b.used,
            "pending": b.pending,
            "available": round(b.allocated - b.used - b.pending, 4),
        }
        for b in balances
    ]

    return {
        "employee_id": user_id,
        "leave_requests": leave_requests,
        "leave_balances": leave_balances,
    }


async def execute_get_employee_documents(company_id: str, args: GetEmployeeDocumentsArgs) -> dict:
    """Get HR documents for an employee."""
    from app.models.hr_document import HRDocument

    profile = await _resolve_employee(company_id, args.employee_id)
    if not profile:
        return {"error": "Employee not found."}

    user_id = profile.user_id
    docs = await HRDocument.find({
        "company_id": company_id,
        "employee_id": user_id,
    }).to_list()

    now = utc_now()
    document_list = []
    expiring_soon = []
    for doc in docs:
        item = {
            "id": str(doc.id),
            "document_type": getattr(doc, "document_type", None),
            "document_name": getattr(doc, "document_name", None),
            "status": getattr(doc, "status", None),
            "expiry_date": doc.expiry_date.isoformat() if getattr(doc, "expiry_date", None) else None,
        }
        document_list.append(item)
        # Check expiring within 30 days
        if getattr(doc, "expiry_date", None) and doc.expiry_date <= now + timedelta(days=30):
            expiring_soon.append(item)

    return {
        "employee_id": user_id,
        "total_documents": len(document_list),
        "documents": document_list,
        "expiring_soon": expiring_soon,
    }


async def execute_get_recruitment_overview(company_id: str, args: GetRecruitmentOverviewArgs) -> dict:
    """Get recruitment pipeline overview."""
    from app.recruitment.models import (
        Application, Candidate, Interview, RecruitmentJob,
    )

    # Open jobs
    query: dict[str, Any] = {"company_id": company_id}
    if args.job_id:
        query["_id"] = args.job_id
    else:
        query["lifecycle_status"] = {"$in": ["approved", "published"]}

    jobs = await RecruitmentJob.find(query).to_list()
    cutoff = utc_now() - timedelta(days=args.days)

    job_overviews = []
    for job in jobs:
        applications = await Application.find({
            "company_id": company_id,
            "job_id": str(job.id),
            "created_at": {"$gte": cutoff},
        }).to_list()

        pipeline: dict[str, int] = {}
        for app in applications:
            status = app.status.value if hasattr(app.status, 'value') else str(app.status)
            pipeline[status] = pipeline.get(status, 0) + 1

        pending_interviews = await Interview.find({
            "company_id": company_id,
            "job_id": str(job.id),
            "feedback_status": "pending",
            "status": "completed",
        }).count()

        job_overviews.append({
            "id": str(job.id),
            "title": job.title,
            "lifecycle_status": job.lifecycle_status.value if hasattr(job.lifecycle_status, 'value') else str(job.lifecycle_status),
            "pipeline": pipeline,
            "missing_feedback": pending_interviews,
            "total_applications": len(applications),
        })

    return {
        "period_days": args.days,
        "open_jobs": len(job_overviews),
        "jobs": job_overviews,
    }


async def execute_get_interviews(company_id: str, args: GetInterviewsArgs) -> dict:
    """Get interviews filtered by job, candidate, or status."""
    from app.recruitment.models import Interview

    query: dict[str, Any] = {"company_id": company_id}
    if args.job_id:
        query["job_id"] = args.job_id
    if args.candidate_id:
        query["candidate_id"] = args.candidate_id
    if args.status:
        query["status"] = args.status

    cutoff = utc_now() - timedelta(days=args.days)
    query["created_at"] = {"$gte": cutoff}

    interviews = await Interview.find(query).to_list()
    interviews.sort(key=lambda i: i.schedule_at or __import__("datetime").datetime.min, reverse=True)

    return {
        "total": len(interviews),
        "interviews": [
            {
                "id": str(i.id),
                "candidate_id": i.candidate_id,
                "job_id": i.job_id,
                "round": i.round,
                "interview_type": i.interview_type,
                "status": i.status.value if hasattr(i.status, 'value') else str(i.status),
                "feedback_status": i.feedback_status.value if hasattr(i.feedback_status, 'value') else str(i.feedback_status),
                "decision": i.decision.value if i.decision and hasattr(i.decision, 'value') else str(i.decision) if i.decision else None,
                "schedule_at": str(i.schedule_at),
                "interviewer_ids": i.interviewer_ids,
            }
            for i in interviews[:20]
        ],
    }


async def execute_get_interview_feedback_status(company_id: str, args: GetInterviewFeedbackStatusArgs) -> dict:
    """Get interviews completed but missing feedback."""
    from app.recruitment.models import Interview

    query: dict[str, Any] = {
        "company_id": company_id,
        "feedback_status": "pending",
        "status": {"$in": ["completed", "in_progress"]},
    }
    if args.job_id:
        query["job_id"] = args.job_id

    cutoff = utc_now() - timedelta(days=args.days)
    query["created_at"] = {"$gte": cutoff}

    interviews = await Interview.find(query).to_list()

    return {
        "total_missing_feedback": len(interviews),
        "interviews": [
            {
                "id": str(i.id),
                "candidate_id": i.candidate_id,
                "job_id": i.job_id,
                "round": i.round,
                "interview_type": i.interview_type,
                "status": i.status.value if hasattr(i.status, 'value') else str(i.status),
                "schedule_at": str(i.schedule_at),
                "interviewer_ids": i.interviewer_ids,
            }
            for i in interviews[:20]
        ],
    }


async def execute_get_offer_status(company_id: str, args: GetOfferStatusArgs) -> dict:
    """Get offers filtered by candidate, job, or status."""
    from app.recruitment.models import Offer

    query: dict[str, Any] = {"company_id": company_id}
    if args.candidate_id:
        query["candidate_id"] = args.candidate_id
    if args.job_id:
        query["job_id"] = args.job_id
    if args.status:
        query["status"] = args.status

    offers = await Offer.find(query).to_list()
    offers.sort(key=lambda o: o.created_at or __import__("datetime").datetime.min, reverse=True)

    return {
        "total": len(offers),
        "offers": [
            {
                "id": str(o.id),
                "candidate_id": o.candidate_id,
                "job_id": o.job_id,
                "status": o.status,
                "offered_ctc": o.offered_ctc,
                "sent_at": str(o.sent_at) if o.sent_at else None,
                "accepted_at": str(o.accepted_at) if o.accepted_at else None,
                "rejected_at": str(o.rejected_at) if o.rejected_at else None,
                "joining_date": str(o.joining_date) if o.joining_date else None,
            }
            for o in offers[:20]
        ],
    }


async def execute_get_hr_attention_summary(company_id: str, args: GetHrAttentionSummaryArgs) -> dict:
    """Consolidated daily HR attention summary."""
    from app.attendance_domain.models import Attendance, AttendanceStatus
    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.leave import LeaveRequest, LeaveStatus
    from app.recruitment.models import Interview, Offer

    today = utc_now().date()
    today_str = today.isoformat()
    items: list[dict[str, Any]] = []

    # 1. Absent employees today
    profiles = await EmployeeProfile.find({
        "company_id": company_id,
        "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
    }).to_list()

    present_user_ids = set()
    today_attendances = await Attendance.find({
        "company_id": company_id,
        "date": today_str,
    }).to_list()
    for att in today_attendances:
        if att.status in (AttendanceStatus.WORKING, AttendanceStatus.ON_BREAK):
            present_user_ids.add(att.employee_id)

    absent_count = 0
    for p in profiles:
        if p.user_id not in present_user_ids:
            absent_count += 1

    if absent_count > 0:
        items.append({
            "priority": "HIGH",
            "category": "attendance",
            "title": f"{absent_count} employee(s) absent today",
            "detail": f"{absent_count} of {len(profiles)} active employees have not checked in today.",
            "recommended_action": "Review attendance records or contact absent employees.",
        })

    # 2. Pending leaves needing attention
    pending_leaves = await LeaveRequest.find({
        "company_id": company_id,
        "status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.FORWARDED.value]},
    }).to_list()

    if pending_leaves:
        items.append({
            "priority": "HIGH",
            "category": "leave",
            "title": f"{len(pending_leaves)} leave request(s) pending approval",
            "detail": f"Leave requests awaiting review: {', '.join(str(lr.reason or 'No reason')[:30] for lr in pending_leaves[:3])}",
            "recommended_action": "Review and approve/reject pending leave requests.",
        })

    # 3. Interviews with missing feedback
    missing_feedback = await Interview.find({
        "company_id": company_id,
        "feedback_status": "pending",
        "status": "completed",
    }).to_list()

    if missing_feedback:
        items.append({
            "priority": "MEDIUM",
            "category": "recruitment",
            "title": f"{len(missing_feedback)} interview(s) missing feedback",
            "detail": "Completed interviews where interviewer feedback has not been submitted.",
            "recommended_action": "Follow up with interviewers to submit feedback.",
        })

    # 4. Pending offers
    pending_offers = await Offer.find({
        "company_id": company_id,
        "status": {"$in": ["draft", "sent"]},
    }).to_list()

    if pending_offers:
        items.append({
            "priority": "MEDIUM",
            "category": "recruitment",
            "title": f"{len(pending_offers)} offer(s) pending action",
            "detail": f"Offers in draft or sent status: {len(pending_offers)}",
            "recommended_action": "Review offer statuses and follow up with candidates.",
        })

    # 5. Employees onboarding / probation
    onboarding = [p for p in profiles if p.employment_status in (EmploymentStatus.ONBOARDING, EmploymentStatus.PROBATION)]
    if onboarding:
        items.append({
            "priority": "LOW",
            "category": "lifecycle",
            "title": f"{len(onboarding)} employee(s) in onboarding/probation",
            "detail": "Monitor onboarding progress and probation milestones.",
            "recommended_action": "Review onboarding checklist and probation status.",
        })

    # Sort by priority
    priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    items.sort(key=lambda x: priority_order.get(x["priority"], 3))

    return {
        "date": today_str,
        "total_items": len(items),
        "items": items,
    }


# ---------------------------------------------------------------------------
# Payroll tools (branch-dependent — detect at runtime)
# ---------------------------------------------------------------------------

async def _payroll_available(company_id: str) -> bool:
    """Check if payroll module models are usable."""
    try:
        from app.models.payroll import PayrollPeriod
        count = await PayrollPeriod.find({"company_id": company_id}).count()
        return True  # model exists and query didn't crash
    except Exception:
        return False


async def execute_get_employee_salary(company_id: str, args: GetEmployeeSalaryArgs) -> dict:
    """Get salary structure for an employee."""
    if not await _payroll_available(company_id):
        return {"available": False, "message": "Payroll module is not available in the current branch."}

    from app.models.salary import SalaryStructure
    from app.models.payroll import PayrollRecord

    profile = await _resolve_employee(company_id, args.employee_id)
    if not profile:
        return {"error": "Employee not found."}

    salary = await SalaryStructure.find_one({
        "company_id": company_id,
        "employee_id": profile.user_id,
    })

    if not salary:
        return {
            "available": True,
            "has_salary_structure": False,
            "message": "No salary structure configured for this employee.",
        }

    return {
        "available": True,
        "has_salary_structure": True,
        "employee_id": profile.user_id,
        "employee_number": profile.employee_number,
        "components": salary.components.model_dump() if hasattr(salary, 'components') and salary.components else {},
        "effective_date": str(salary.effective_date) if getattr(salary, 'effective_date', None) else None,
    }


async def execute_get_payroll_status(company_id: str, args: GetPayrollStatusArgs) -> dict:
    """Get payroll status overview."""
    if not await _payroll_available(company_id):
        return {"available": False, "message": "Payroll module is not available in the current branch."}

    from app.models.payroll import PayrollPeriod

    query: dict[str, Any] = {"company_id": company_id}
    if args.status:
        query["status"] = args.status

    periods = await PayrollPeriod.find(query).to_list()

    return {
        "available": True,
        "total_periods": len(periods),
        "periods": [
            {
                "id": str(p.id),
                "name": getattr(p, "name", None),
                "status": p.status.value if hasattr(p.status, 'value') else str(p.status),
                "start_date": str(p.start_date) if getattr(p, "start_date", None) else None,
                "end_date": str(p.end_date) if getattr(p, "end_date", None) else None,
            }
            for p in periods[:10]
        ],
    }


async def execute_get_payroll_blockers(company_id: str, args: GetPayrollBlockersArgs) -> dict:
    """Get payroll blockers."""
    if not await _payroll_available(company_id):
        return {"available": False, "message": "Payroll module is not available in the current branch."}

    from app.models.employee_profile import EmployeeProfile, EmploymentStatus
    from app.models.salary import SalaryStructure

    profiles = await EmployeeProfile.find({
        "company_id": company_id,
        "employment_status": {"$in": [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION]},
    }).to_list()

    missing_salary = []
    for p in profiles:
        has_salary = await SalaryStructure.find_one({
            "company_id": company_id,
            "employee_id": p.user_id,
        })
        if not has_salary:
            missing_salary.append({
                "user_id": p.user_id,
                "employee_number": p.employee_number,
            })

    return {
        "available": True,
        "employees_without_salary_structure": missing_salary,
        "total_blockers": len(missing_salary),
    }


async def execute_get_employee_payslip_status(company_id: str, args: GetEmployeePayslipStatusArgs) -> dict:
    """Get payslip generation status for an employee."""
    if not await _payroll_available(company_id):
        return {"available": False, "message": "Payroll module is not available in the current branch."}

    from app.models.payslip import Payslip

    profile = await _resolve_employee(company_id, args.employee_id)
    if not profile:
        return {"error": "Employee not found."}

    payslips = await Payslip.find({
        "company_id": company_id,
        "employee_id": profile.user_id,
    }).to_list()

    return {
        "available": True,
        "employee_id": profile.user_id,
        "total_payslips": len(payslips),
        "payslips": [
            {
                "id": str(ps.id),
                "status": ps.status.value if hasattr(ps.status, 'value') else str(ps.status),
                "period": getattr(ps, "period", None),
                "generated_at": str(ps.generated_at) if getattr(ps, "generated_at", None) else None,
            }
            for ps in payslips[:5]
        ],
    }


# ---------------------------------------------------------------------------
# Internal summary helpers
# ---------------------------------------------------------------------------


async def _get_attendance_summary(company_id: str, user_id: str, days: int = 30) -> dict:
    """Get attendance summary for the last N days."""
    from app.attendance_domain.models import Attendance, AttendanceStatus

    today = utc_now().date()
    start = (today - timedelta(days=days)).isoformat()

    records = await Attendance.find({
        "company_id": company_id,
        "employee_id": user_id,
        "date": {"$gte": start},
    }).to_list()

    total_days = len(records)
    present_days = sum(1 for r in records if r.status in (AttendanceStatus.WORKING, AttendanceStatus.ON_BREAK))
    late_days = sum(1 for r in records if r.is_late)

    today_record = await Attendance.find_one({
        "company_id": company_id,
        "employee_id": user_id,
        "date": today.isoformat(),
    })

    return {
        "today": {
            "status": today_record.status.value if today_record and hasattr(today_record.status, 'value') else "absent",
            "login_time": today_record.login_time.isoformat() if today_record and today_record.login_time else None,
        } if today_record else {"status": "absent"},
        "period": {
            "days": days,
            "total_records": total_days,
            "present": present_days,
            "absent": max(0, days - total_days),
            "late": late_days,
        },
    }


async def _get_leave_summary(company_id: str, user_id: str) -> dict:
    """Get leave summary for an employee."""
    from app.models.leave import LeaveBalance, LeaveRequest, LeaveStatus

    # Pending requests
    pending = await LeaveRequest.find({
        "company_id": company_id,
        "employee_id": user_id,
        "status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.FORWARDED.value]},
    }).to_list()

    # Balances
    balances = await LeaveBalance.find({
        "company_id": company_id,
        "employee_id": user_id,
    }).to_list()

    return {
        "pending_requests": len(pending),
        "balances": [
            {
                "type_id": b.leave_type_id,
                "allocated": b.allocated,
                "used": b.used,
                "available": round(b.allocated - b.used - b.pending, 4),
            }
            for b in balances
        ],
    }


async def _get_documents_summary(company_id: str, user_id: str) -> dict:
    """Get HR documents summary."""
    from app.models.hr_document import HRDocument

    docs = await HRDocument.find({
        "company_id": company_id,
        "employee_id": user_id,
    }).to_list()

    now = utc_now()
    expiring = [d for d in docs if getattr(d, "expiry_date", None) and d.expiry_date <= now + timedelta(days=30)]

    return {
        "total": len(docs),
        "expiring_soon": len(expiring),
    }


async def _get_payroll_summary(company_id: str, user_id: str) -> Optional[dict]:
    """Get payroll summary if available."""
    if not await _payroll_available(company_id):
        return None

    from app.models.payslip import Payslip

    payslips = await Payslip.find({
        "company_id": company_id,
        "employee_id": user_id,
    }).limit(1).to_list()

    if not payslips:
        return {"latest_payslip": None}

    ps = payslips[0]
    return {
        "latest_payslip": {
            "status": ps.status.value if hasattr(ps.status, 'value') else str(ps.status),
            "period": getattr(ps, "period", None),
            "generated_at": str(ps.generated_at) if getattr(ps, "generated_at", None) else None,
        },
    }


# ---------------------------------------------------------------------------
# Tool dispatcher — maps tool name to implementation
# ---------------------------------------------------------------------------

TOOL_DISPATCH: dict[str, Any] = {
    "search_employees": execute_search_employees,
    "get_employee_360": execute_get_employee_360,
    "search_candidates": execute_search_candidates,
    "get_candidate_360": execute_get_candidate_360,
    "search_jobs": execute_search_jobs,
    "get_job_360": execute_get_job_360,
    "get_employee_attendance": execute_get_employee_attendance,
    "get_employee_leave": execute_get_employee_leave,
    "get_employee_documents": execute_get_employee_documents,
    "get_recruitment_overview": execute_get_recruitment_overview,
    "get_interviews": execute_get_interviews,
    "get_interview_feedback_status": execute_get_interview_feedback_status,
    "get_offer_status": execute_get_offer_status,
    "get_hr_attention_summary": execute_get_hr_attention_summary,
    "get_employee_salary": execute_get_employee_salary,
    "get_payroll_status": execute_get_payroll_status,
    "get_payroll_blockers": execute_get_payroll_blockers,
    "get_employee_payslip_status": execute_get_employee_payslip_status,
}


# Argument validation schemas
ARG_SCHEMAS: dict[str, type[BaseModel]] = {
    "search_employees": SearchEmployeesArgs,
    "get_employee_360": GetEmployee360Args,
    "search_candidates": SearchCandidatesArgs,
    "get_candidate_360": GetCandidate360Args,
    "search_jobs": SearchJobsArgs,
    "get_job_360": GetJob360Args,
    "get_employee_attendance": GetEmployeeAttendanceArgs,
    "get_employee_leave": GetEmployeeLeaveArgs,
    "get_employee_documents": GetEmployeeDocumentsArgs,
    "get_recruitment_overview": GetRecruitmentOverviewArgs,
    "get_interviews": GetInterviewsArgs,
    "get_interview_feedback_status": GetInterviewFeedbackStatusArgs,
    "get_offer_status": GetOfferStatusArgs,
    "get_hr_attention_summary": GetHrAttentionSummaryArgs,
    "get_employee_salary": GetEmployeeSalaryArgs,
    "get_payroll_status": GetPayrollStatusArgs,
    "get_payroll_blockers": GetPayrollBlockersArgs,
    "get_employee_payslip_status": GetEmployeePayslipStatusArgs,
}


async def execute_hr_tool(
    tool_name: str,
    arguments: dict[str, Any],
    company_id: str,
) -> dict[str, Any]:
    """Execute an HR tool by name with validated arguments.

    Returns structured JSON result suitable for feeding back into the LLM context.
    """
    if tool_name not in TOOL_DISPATCH:
        return {"error": f"Unknown tool: {tool_name}"}

    # Validate arguments with Pydantic
    schema = ARG_SCHEMAS.get(tool_name)
    if schema:
        try:
            validated = schema(**arguments)
        except Exception as exc:
            return {"error": f"Invalid arguments for {tool_name}: {exc}"}
    else:
        validated = arguments

    # Execute
    try:
        result = await TOOL_DISPATCH[tool_name](company_id, validated)
        return result
    except Exception as exc:
        logger.exception("HR tool %s failed", tool_name)
        return {"error": f"Tool execution failed: {exc}"}
