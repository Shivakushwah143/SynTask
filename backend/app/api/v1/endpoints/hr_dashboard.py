"""
Phase 10 — HR Dashboard & Reports API endpoints.

Security model (Phase 11 closure):

- Every REPORT endpoint enforces the relevant company capability server-side
  (``require_capability``) — a normal authenticated employee can never call
  company-wide HR reports; frontend hiding is not authorization.
- Manager/Lead users with the required capability are restricted server-side to
  their team scope (``_report_scope_user_ids``) for employee/attendance/leave/
  document/lifecycle reports. Salary/Payroll/confidential data is never auto-
  granted to managers — those endpoints keep their own ``payroll.view`` gate.
- The dashboard returns only the sections the user is authorized to view;
  unauthorized sections are ``None`` (the frontend renders empty states).
- Attention items are permission-filtered so an HR user without payroll access
  never receives payroll blocker counts.
- Company scope is enforced on every query.
"""

from __future__ import annotations

import io
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_current_user, require_capability
from app.models.capability import get_capabilities_for_role
from app.models.department import Department
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter()


def _is_company_admin(user: User) -> bool:
    """Check if user has company admin access (admin, sub_admin, or super_admin)."""
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return role in {UserRole.ADMIN.value, UserRole.SUB_ADMIN.value, UserRole.SUPER_ADMIN.value}


def _role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _role_enum(user: User) -> UserRole:
    role = getattr(user, "role", None)
    if isinstance(role, UserRole):
        return role
    try:
        return UserRole.from_legacy(str(role))
    except Exception:
        return UserRole.EMPLOYEE


async def _has_capability(user: User, capability: str) -> bool:
    """Return dashboard section access from authoritative department capabilities."""
    role = _role_enum(user)
    if role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        return True

    department_id = getattr(user, "department_id", None)
    if not department_id:
        return False
    department = await Department.get(department_id)
    if not department or department.company_id != user.company_id or department.deleted_at is not None:
        return False

    allowed = await get_capabilities_for_role(
        department.department_type,
        role,
        user.company_id,
    )
    return capability in set(allowed or [])


async def _report_scope_user_ids(current_user: User) -> Optional[List[str]]:
    """Resolve the report scope for the current user.

    - Company admins / super admins: ``None`` → company-wide.
    - Managers / leads: their monitorable team (User ids), computed server-side
      through the existing attendance reporting hierarchy — never a frontend filter.
    - Everyone else (reports are additionally capability-gated): ``[]`` → nothing.
    """
    role = _role(current_user)
    if role in {UserRole.ADMIN.value, UserRole.SUB_ADMIN.value, UserRole.SUPER_ADMIN.value}:
        return None
    if role in {UserRole.MANAGER.value, UserRole.LEAD.value}:
        from app.api.v1.endpoints.attendance import get_monitorable_users

        try:
            users = await get_monitorable_users(current_user)
        except Exception:
            logger.exception("Failed to resolve manager report scope for user %s", current_user.id)
            users = []
        return [str(u.id) for u in users]
    return []


def _require_company(user: User) -> str:
    if not user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return user.company_id


# =============================================================================
# Dashboard
# =============================================================================

@router.get("/dashboard")
async def get_hr_dashboard(
    current_user: User = Depends(get_current_user),
):
    """HR Dashboard — aggregated summary from all HR modules.

    Returns only the sections the user is authorized to view; unauthorized
    sections are omitted (None). Payroll sections are omitted for users without
    payroll.view. Employee/attendance/leave/document/lifecycle sections follow
    their own capability gates. Attention items are permission-filtered.
    """
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")

    company_id = current_user.company_id
    role = _role(current_user)

    if role == UserRole.SUPER_ADMIN.value and not _is_company_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR Dashboard is not available for platform super-admin accounts.",
        )

    from app.schemas.hr_reports import (
        HRDashboardResponse, EmployeeSummary, AttendanceTodaySummary,
        LeaveSummary, DocumentSummary, LifecycleSummary,
        RecruitmentSummary, PayrollSummary,
    )
    from app.services.hr_reporting_service import (
        get_employee_summary, get_attendance_today_summary,
        get_leave_summary, get_document_summary, get_lifecycle_summary,
        get_recruitment_summary, get_payroll_summary, get_attention_items,
    )

    # Each dashboard section is permission-aware (backend authoritative).
    employee_summary = None
    attendance_today = None
    leave_summary = None
    document_summary = None
    lifecycle_summary = None

    if _is_company_admin(current_user) or await _has_capability(current_user, "employee_management.view"):
        try:
            employee_summary = EmployeeSummary(**await get_employee_summary(company_id))
        except Exception as e:
            logger.warning("Employee summary failed (non-critical): %s", e)

    if _is_company_admin(current_user) or await _has_capability(current_user, "attendance_policy.view"):
        try:
            attendance_today = AttendanceTodaySummary(**await get_attendance_today_summary(company_id))
        except Exception as e:
            logger.warning("Attendance summary failed (non-critical): %s", e)

    if _is_company_admin(current_user) or await _has_capability(current_user, "leave_management.view"):
        try:
            leave_summary = LeaveSummary(**await get_leave_summary(company_id))
        except Exception as e:
            logger.warning("Leave summary failed (non-critical): %s", e)

    if _is_company_admin(current_user) or await _has_capability(current_user, "employee_lifecycle.view"):
        try:
            lifecycle_summary = LifecycleSummary(**await get_lifecycle_summary(company_id))
        except Exception as e:
            logger.warning("Lifecycle summary failed (non-critical): %s", e)

    from app.api.v1.endpoints.hr_documents import require_hr_document_view

    can_view_documents = True
    try:
        await require_hr_document_view(current_user)
    except HTTPException:
        can_view_documents = False
    if can_view_documents:
        try:
            document_summary = DocumentSummary(**await get_document_summary(company_id))
        except Exception as e:
            logger.warning("Document summary failed (non-critical): %s", e)

    # Attention items — permission-filtered so unauthorized counts never leak.
    attention_items = await get_attention_items(company_id)
    has_payroll_view = _is_company_admin(current_user) or await _has_capability(current_user, "payroll.view")
    if not has_payroll_view:
        attention_items = [item for item in attention_items if item.get("type") != "payroll_blocked"]
    # Only show attention items for modules the user can actually see.
    allowed_types = []
    if employee_summary is not None:
        allowed_types.extend(["probation_due"])
    if leave_summary is not None:
        allowed_types.append("leave_pending")
    if attendance_today is not None:
        allowed_types.append("correction_pending")
    if document_summary is not None:
        allowed_types.append("document_expiring")
    if has_payroll_view:
        allowed_types.append("payroll_blocked")
    if allowed_types:
        attention_items = [item for item in attention_items if item.get("type") in set(allowed_types)]
    else:
        attention_items = []

    recruitment_summary = None
    if _is_company_admin(current_user) or role in (UserRole.MANAGER.value, UserRole.LEAD.value):
        try:
            recruitment_summary = RecruitmentSummary(**await get_recruitment_summary(company_id))
        except Exception as e:
            logger.warning("Recruitment summary failed (non-critical): %s", e)

    payroll_summary = None
    if has_payroll_view:
        try:
            payroll_data = await get_payroll_summary(company_id)
            if payroll_data:
                payroll_summary = PayrollSummary(**payroll_data)
        except Exception as e:
            logger.warning("Payroll summary failed (non-critical): %s", e)

    return HRDashboardResponse(
        employee_summary=employee_summary,
        attendance_today=attendance_today,
        leave_summary=leave_summary,
        document_summary=document_summary,
        lifecycle_summary=lifecycle_summary,
        recruitment_summary=recruitment_summary,
        payroll_summary=payroll_summary,
        attention_items=attention_items,
    )


# =============================================================================
# Employee Reports (employee_management.view required)
# =============================================================================

@router.get("/reports/employees/directory")
async def employee_directory_report(
    department: Optional[str] = Query(None),
    employment_status: Optional[str] = Query(None),
    employment_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("employee_management.view")),
):
    """Employee directory report — requires employee_management.view."""
    from app.services.hr_reporting_service import get_employee_directory
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_employee_directory(
        company_id, department, employment_status,
        employment_type, skip, limit, user_ids=scope,
    )


@router.get("/reports/employees/headcount")
async def headcount_report(
    department: Optional[str] = Query(None),
    employment_status: Optional[str] = Query(None),
    current_user: User = Depends(require_capability("employee_management.view")),
):
    """Headcount report — aggregated by department."""
    from app.services.hr_reporting_service import get_headcount_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_headcount_report(company_id, department, employment_status, user_ids=scope)


@router.get("/reports/employees/joining-exit")
async def joining_exit_report(
    months: int = Query(6, ge=1, le=24),
    current_user: User = Depends(require_capability("employee_management.view")),
):
    """Joining/exit trend data for charts."""
    from app.services.hr_reporting_service import get_joining_exit_trend
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    items = await get_joining_exit_trend(company_id, months, user_ids=scope)
    return {"items": items}


# =============================================================================
# Attendance Reports (attendance_policy.view required)
# =============================================================================

@router.get("/reports/attendance/summary")
async def attendance_summary_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("attendance_policy.view")),
):
    """Attendance summary report — per employee for a date range."""
    from app.services.hr_reporting_service import get_attendance_summary_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_attendance_summary_report(
        company_id, date_from, date_to, department, skip, limit, user_ids=scope,
    )


@router.get("/reports/attendance/late")
async def late_arrival_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("attendance_policy.view")),
):
    """Late arrival report."""
    from app.services.hr_reporting_service import get_late_arrival_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_late_arrival_report(
        company_id, date_from, date_to, department, skip, limit, user_ids=scope,
    )


@router.get("/reports/attendance/absence")
async def absence_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("attendance_policy.view")),
):
    """Absence report — employees with absent status."""
    from app.services.hr_reporting_service import get_absence_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_absence_report(
        company_id, date_from, date_to, department, skip, limit, user_ids=scope,
    )


# =============================================================================
# Leave Reports (leave_management.view required)
# =============================================================================

@router.get("/reports/leave/balances")
async def leave_balance_report(
    department: Optional[str] = Query(None),
    leave_type_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("leave_management.view")),
):
    """Leave balance report — per employee, per leave type."""
    from app.services.hr_reporting_service import get_leave_balance_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_leave_balance_report(
        company_id, department, leave_type_id, skip, limit, user_ids=scope,
    )


@router.get("/reports/leave/usage")
async def leave_usage_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(require_capability("leave_management.view")),
):
    """Leave usage by type."""
    from app.services.hr_reporting_service import get_leave_usage_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    items = await get_leave_usage_report(company_id, date_from, date_to, user_ids=scope)
    return {"items": items}


# =============================================================================
# Document Reports (HR document view required)
# =============================================================================

@router.get("/reports/documents/expiry")
async def document_expiry_report(
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("employee_management.view")),
):
    """Document expiry report — requires HR document access."""
    from app.api.v1.endpoints.hr_documents import require_hr_document_view
    await require_hr_document_view(current_user)
    from app.services.hr_reporting_service import get_document_expiry_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_document_expiry_report(company_id, department, skip, limit, user_ids=scope)


# =============================================================================
# Lifecycle Reports (employee_lifecycle.view required)
# =============================================================================

@router.get("/reports/lifecycle/events")
async def lifecycle_events_report(
    event_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("employee_lifecycle.view")),
):
    """Lifecycle events report."""
    from app.services.hr_reporting_service import get_lifecycle_events_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_lifecycle_events_report(
        company_id, event_type, date_from, date_to, skip, limit, user_ids=scope,
    )


@router.get("/reports/lifecycle/probation")
async def probation_report(
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("employee_lifecycle.view")),
):
    """Probation/confirmation report."""
    from app.services.hr_reporting_service import get_probation_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_probation_report(company_id, department, skip, limit, user_ids=scope)


@router.get("/reports/lifecycle/notice")
async def notice_period_report(
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("employee_lifecycle.view")),
):
    """Notice period report."""
    from app.services.hr_reporting_service import get_notice_period_report
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)
    return await get_notice_period_report(company_id, department, skip, limit, user_ids=scope)


# =============================================================================
# Payroll Reports (payroll.view required)
# =============================================================================

@router.get("/reports/payroll/summary")
async def payroll_summary_report(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("payroll.view")),
):
    """Payroll summary report — requires payroll.view permission."""
    from app.services.hr_reporting_service import get_payroll_summary_report
    company_id = _require_company(current_user)
    return await get_payroll_summary_report(company_id, skip, limit)


@router.get("/reports/payroll/employees")
async def employee_payroll_report(
    payroll_period_id: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("payroll.view")),
):
    """Employee payroll report — requires payroll.view permission."""
    from app.services.hr_reporting_service import get_employee_payroll_report
    company_id = _require_company(current_user)
    return await get_employee_payroll_report(
        company_id, payroll_period_id, department, skip, limit,
    )


# =============================================================================
# CSV Export Endpoints (same permission + scope as their report)
# =============================================================================

@router.get("/reports/employees/directory/export")
async def export_employee_directory(
    department: Optional[str] = Query(None),
    employment_status: Optional[str] = Query(None),
    employment_type: Optional[str] = Query(None),
    current_user: User = Depends(require_capability("employee_management.view")),
):
    """Export employee directory as CSV."""
    from app.services.hr_reporting_service import get_employee_directory, generate_csv
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)

    result = await get_employee_directory(
        company_id, department, employment_status,
        employment_type, 0, 5000, user_ids=scope,
    )
    headers = ["Employee Number", "Name", "Department", "Designation", "Manager", "Employment Type", "Joining Date", "Status"]
    rows = [
        [
            item.get("employee_number", ""),
            item.get("full_name", ""),
            item.get("department", ""),
            item.get("designation", ""),
            item.get("manager_name", ""),
            item.get("employment_type", ""),
            item.get("joining_date", ""),
            item.get("employment_status", ""),
        ]
        for item in result["items"]
    ]
    csv_content = generate_csv(headers, rows)
    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=employee-directory.csv"},
    )


@router.get("/reports/attendance/summary/export")
async def export_attendance_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    current_user: User = Depends(require_capability("attendance_policy.view")),
):
    """Export attendance summary as CSV."""
    from app.services.hr_reporting_service import get_attendance_summary_report, generate_csv
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)

    result = await get_attendance_summary_report(
        company_id, date_from, date_to, department, 0, 5000, user_ids=scope,
    )
    headers = ["Employee Name", "Employee Number", "Department", "Working Days", "Present", "Paid Leave", "Unpaid Leave", "Absent", "Half Day", "Late Count", "Overtime (min)"]
    rows = [
        [
            item.get("employee_name", ""),
            item.get("employee_number", ""),
            item.get("department", ""),
            item.get("working_days", 0),
            item.get("present", 0),
            item.get("paid_leave", 0),
            item.get("unpaid_leave", 0),
            item.get("absent", 0),
            item.get("half_day", 0),
            item.get("late_count", 0),
            item.get("overtime_minutes", 0),
        ]
        for item in result["items"]
    ]
    csv_content = generate_csv(headers, rows)
    filename = f"attendance-summary-{date_from or 'all'}-to-{date_to or 'all'}.csv"
    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/reports/leave/balances/export")
async def export_leave_balances(
    department: Optional[str] = Query(None),
    leave_type_id: Optional[str] = Query(None),
    current_user: User = Depends(require_capability("leave_management.view")),
):
    """Export leave balance report as CSV."""
    from app.services.hr_reporting_service import get_leave_balance_report, generate_csv
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)

    result = await get_leave_balance_report(
        company_id, department, leave_type_id, 0, 5000, user_ids=scope,
    )
    headers = ["Employee Name", "Employee Number", "Department", "Leave Type", "Allocated", "Used", "Pending", "Available"]
    rows = [
        [
            item.get("employee_name", ""),
            item.get("employee_number", ""),
            item.get("department", ""),
            item.get("leave_type", ""),
            item.get("allocated", 0),
            item.get("used", 0),
            item.get("pending", 0),
            item.get("available", 0),
        ]
        for item in result["items"]
    ]
    csv_content = generate_csv(headers, rows)
    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leave-balance-report.csv"},
    )


@router.get("/reports/payroll/summary/export")
async def export_payroll_summary(
    current_user: User = Depends(require_capability("payroll.view")),
):
    """Export payroll summary as CSV. Requires payroll.view."""
    from app.services.hr_reporting_service import get_payroll_summary_report, generate_csv
    company_id = _require_company(current_user)

    result = await get_payroll_summary_report(company_id, 0, 5000)
    headers = ["Period", "Employees", "Total Earnings", "Total Deductions", "Net Payroll", "Status", "Processed At"]
    rows = [
        [
            item.get("period_label", ""),
            item.get("employee_count", 0),
            item.get("total_earnings", 0),
            item.get("total_deductions", 0),
            item.get("total_net", 0),
            item.get("status", ""),
            item.get("processed_at", ""),
        ]
        for item in result["items"]
    ]
    csv_content = generate_csv(headers, rows)
    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=payroll-summary-report.csv"},
    )


@router.get("/reports/documents/expiry/export")
async def export_document_expiry(
    department: Optional[str] = Query(None),
    current_user: User = Depends(require_capability("employee_management.view")),
):
    """Export document expiry report as CSV — requires HR document access."""
    from app.api.v1.endpoints.hr_documents import require_hr_document_view
    await require_hr_document_view(current_user)
    from app.services.hr_reporting_service import get_document_expiry_report, generate_csv
    company_id = _require_company(current_user)
    scope = await _report_scope_user_ids(current_user)

    result = await get_document_expiry_report(company_id, department, 0, 5000, user_ids=scope)
    headers = ["Employee Name", "Employee Number", "Department", "Document Type", "Expiry Date", "Status", "Days Remaining"]
    rows = [
        [
            item.get("employee_name", ""),
            item.get("employee_number", ""),
            item.get("department", ""),
            item.get("document_type", ""),
            item.get("expiry_date", ""),
            item.get("status", ""),
            item.get("days_remaining", ""),
        ]
        for item in result["items"]
    ]
    csv_content = generate_csv(headers, rows)
    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=document-expiry-report.csv"},
    )
