"""
Phase 10 — HR Dashboard & Reports schemas.

These Pydantic models define the API contracts for the HR Dashboard and
Reporting endpoints. They are presentation-only DTOs — no business logic.

All metrics are computed backend-side from existing domain services.
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# =============================================================================
# Dashboard Schemas
# =============================================================================

class AttentionItem(BaseModel):
    """One actionable attention item on the dashboard."""
    type: str  # e.g. "leave_pending", "correction_pending", "document_review_pending", "document_expiring", "probation_due", "payroll_blocked"
    label: str
    count: int
    severity: str = "info"  # info | warning | critical
    route: str  # frontend route for navigation


class EmployeeSummary(BaseModel):
    """Employee headcount summary for dashboard."""
    total: int = 0
    active: int = 0
    probation: int = 0
    notice_period: int = 0
    onboarding: int = 0
    exited: int = 0
    department_distribution: List[Dict[str, Any]] = Field(default_factory=list)
    employment_type_distribution: List[Dict[str, Any]] = Field(default_factory=list)


class AttendanceTodaySummary(BaseModel):
    """Today's attendance summary across the company."""
    date: str
    total_employees: int = 0
    present: int = 0
    absent: int = 0
    on_leave: int = 0
    half_day: int = 0
    holiday: int = 0
    week_off: int = 0
    in_progress: int = 0
    no_record: int = 0


class LeaveSummary(BaseModel):
    """Leave summary for dashboard."""
    pending_requests: int = 0
    approved_this_month: int = 0
    rejected_this_month: int = 0
    on_leave_today: int = 0
    leave_by_type: List[Dict[str, Any]] = Field(default_factory=list)


class DocumentSummary(BaseModel):
    """Document expiry summary for dashboard."""
    total_active: int = 0
    expired: int = 0
    expiring_soon: int = 0
    valid: int = 0


class LifecycleSummary(BaseModel):
    """Employee lifecycle summary for dashboard."""
    probation_count: int = 0
    confirmations_due: int = 0
    notice_period_count: int = 0
    upcoming_joinings: int = 0
    upcoming_exits: int = 0


class RecruitmentSummary(BaseModel):
    """Recruitment summary for dashboard (compact)."""
    open_jobs: int = 0
    total_candidates: int = 0
    shortlisted: int = 0
    interviewing: int = 0
    offers_sent: int = 0
    hired: int = 0


class PayrollSummary(BaseModel):
    """Payroll summary for dashboard."""
    latest_period_label: Optional[str] = None
    latest_period_status: Optional[str] = None
    employee_count: int = 0
    total_earnings: float = 0.0
    total_deductions: float = 0.0
    total_net: float = 0.0
    currency: str = "INR"
    processed_at: Optional[datetime] = None


class HRDashboardResponse(BaseModel):
    """Complete HR Dashboard response."""
    employee_summary: Optional[EmployeeSummary] = None
    attendance_today: Optional[AttendanceTodaySummary] = None
    leave_summary: Optional[LeaveSummary] = None
    document_summary: Optional[DocumentSummary] = None
    lifecycle_summary: Optional[LifecycleSummary] = None
    recruitment_summary: Optional[RecruitmentSummary] = None  # Only if user has recruitment access
    payroll_summary: Optional[PayrollSummary] = None  # Only if user has payroll access
    attention_items: List[AttentionItem] = Field(default_factory=list)


# =============================================================================
# Report Schemas — Employee Reports
# =============================================================================

class EmployeeReportRow(BaseModel):
    employee_id: str
    employee_number: Optional[str] = None
    full_name: str
    department: Optional[str] = None
    designation: Optional[str] = None
    manager_name: Optional[str] = None
    employment_type: Optional[str] = None
    joining_date: Optional[datetime] = None
    employment_status: str


class HeadcountReportItem(BaseModel):
    department: Optional[str] = None
    count: int = 0


class JoiningExitTrendItem(BaseModel):
    month: str  # YYYY-MM
    joiners: int = 0
    exits: int = 0


class EmployeeReportResponse(BaseModel):
    items: List[EmployeeReportRow] = Field(default_factory=list)
    total: int = 0
    skip: int = 0
    limit: int = 0


class HeadcountReportResponse(BaseModel):
    items: List[HeadcountReportItem] = Field(default_factory=list)
    total: int = 0
    summary: EmployeeSummary = Field(default_factory=EmployeeSummary)


class JoiningExitReportResponse(BaseModel):
    items: List[JoiningExitTrendItem] = Field(default_factory=list)


# =============================================================================
# Report Schemas — Attendance Reports
# =============================================================================

class AttendanceSummaryReportRow(BaseModel):
    employee_id: str
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    working_days: int = 0
    present: int = 0
    paid_leave: int = 0
    unpaid_leave: int = 0
    absent: int = 0
    half_day: int = 0
    late_count: int = 0
    early_departure_count: int = 0
    overtime_minutes: float = 0.0


class LateArrivalReportRow(BaseModel):
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    date: str
    expected_check_in: Optional[str] = None
    actual_check_in: Optional[str] = None
    late_minutes: float = 0.0


class AbsenceReportRow(BaseModel):
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    date: str
    hr_status: str
    reason: Optional[str] = None


class AttendanceReportResponse(BaseModel):
    items: List[Any] = Field(default_factory=list)
    total: int = 0
    skip: int = 0
    limit: int = 0


# =============================================================================
# Report Schemas — Leave Reports
# =============================================================================

class LeaveBalanceReportRow(BaseModel):
    employee_id: str
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    leave_type: str
    allocated: float = 0.0
    used: float = 0.0
    pending: float = 0.0
    available: float = 0.0


class LeaveUsageReportRow(BaseModel):
    leave_type: str
    total_approved: float = 0.0
    total_pending: float = 0.0
    total_rejected: float = 0.0
    employee_count: int = 0


class LeaveReportResponse(BaseModel):
    items: List[Any] = Field(default_factory=list)
    total: int = 0
    skip: int = 0
    limit: int = 0


# =============================================================================
# Report Schemas — Document Reports
# =============================================================================

class DocumentExpiryReportRow(BaseModel):
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    document_type: Optional[str] = None
    expiry_date: Optional[datetime] = None
    status: str  # expired | expiring_soon | valid | no_expiry
    days_remaining: Optional[int] = None


class DocumentReportResponse(BaseModel):
    items: List[DocumentExpiryReportRow] = Field(default_factory=list)
    total: int = 0
    skip: int = 0
    limit: int = 0


# =============================================================================
# Report Schemas — Lifecycle Reports
# =============================================================================

class LifecycleEventReportRow(BaseModel):
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    event_type: str
    previous_summary: Optional[str] = None
    new_summary: Optional[str] = None
    effective_date: Optional[datetime] = None
    created_by_name: Optional[str] = None


class ProbationReportRow(BaseModel):
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    joining_date: Optional[datetime] = None
    probation_end: Optional[datetime] = None
    manager_name: Optional[str] = None
    status: str


class NoticePeriodReportRow(BaseModel):
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    notice_start: Optional[datetime] = None
    last_working_day: Optional[datetime] = None
    exit_type: Optional[str] = None
    manager_name: Optional[str] = None


class LifecycleReportResponse(BaseModel):
    items: List[Any] = Field(default_factory=list)
    total: int = 0
    skip: int = 0
    limit: int = 0


# =============================================================================
# Report Schemas — Payroll Reports
# =============================================================================

class PayrollSummaryReportRow(BaseModel):
    period_label: str
    employee_count: int = 0
    total_earnings: float = 0.0
    total_deductions: float = 0.0
    total_net: float = 0.0
    status: str
    processed_at: Optional[datetime] = None


class EmployeePayrollReportRow(BaseModel):
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    period_label: str
    payable_days: float = 0.0
    gross: float = 0.0
    deductions: float = 0.0
    net: float = 0.0
    currency: str = "INR"


class PayrollReportResponse(BaseModel):
    items: List[Any] = Field(default_factory=list)
    total: int = 0
    skip: int = 0
    limit: int = 0


# =============================================================================
# Report Filter Schema
# =============================================================================

class ReportFilters(BaseModel):
    """Common report filter parameters."""
    department: Optional[str] = None
    employment_status: Optional[str] = None
    employment_type: Optional[str] = None
    date_from: Optional[str] = None  # YYYY-MM-DD
    date_to: Optional[str] = None    # YYYY-MM-DD
    leave_type_id: Optional[str] = None
    status: Optional[str] = None
    payroll_period_id: Optional[str] = None
    skip: int = 0
    limit: int = 50
