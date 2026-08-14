"""
Phase 10 — HR Dashboard & Reports API endpoints.

All endpoints enforce company scoping and permission-aware section omission.
The dashboard returns only sections the user is authorized to see.
"""
from __future__ import annotations

import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_current_user, require_capability
from app.models.user import User, UserRole


def _is_company_admin(user: User) -> bool:
    """Check if user has company admin access (admin, sub_admin, or super_admin)."""
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return role in {UserRole.ADMIN.value, UserRole.SUB_ADMIN.value, UserRole.SUPER_ADMIN.value}

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# Dashboard
# =============================================================================

@router.get("/dashboard")
async def get_hr_dashboard(
    current_user: User = Depends(get_current_user),
):
    """HR Dashboard — aggregated summary from all HR modules.

    Returns only sections the user is authorized to view.
    Payroll sections are omitted for users without payroll.view permission.
    Recruitment sections are omitted for users without recruitment access.
    """
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

    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company",
        )

    company_id = current_user.company_id

    # Non-employee users (platform super admins) cannot see HR Dashboard
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role == UserRole.SUPER_ADMIN.value and not _is_company_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR Dashboard is not available for platform super-admin accounts.",
        )

    # Always available sections
    employee_summary = EmployeeSummary(**await get_employee_summary(company_id))
    attendance_today = AttendanceTodaySummary(**await get_attendance_today_summary(company_id))
    leave_summary = LeaveSummary(**await get_leave_summary(company_id))
    document_summary = DocumentSummary(**await get_document_summary(company_id))
    lifecycle_summary = LifecycleSummary(**await get_lifecycle_summary(company_id))
    attention_items = await get_attention_items(company_id)

    # Permission-gated sections
    recruitment_summary = None
    payroll_summary = None

    # Check recruitment access (admins/managers/HR see it)
    if _is_company_admin(current_user) or role in (
        UserRole.MANAGER.value, UserRole.LEAD.value,
    ):
        try:
            recruitment_summary = RecruitmentSummary(**await get_recruitment_summary(company_id))
        except Exception as e:
            logger.warning("Recruitment summary failed (non-critical): %s", e)

    # Check payroll access
    capabilities = set(current_user.capabilities or [])
    has_payroll_view = (
        "payroll.view" in capabilities
        or _is_company_admin(current_user)
    )
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
# Employee Reports
# =============================================================================

@router.get("/reports/employees/directory")
async def employee_directory_report(
    department: Optional[str] = Query(None),
    employment_status: Optional[str] = Query(None),
    employment_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Employee directory report."""
    from app.services.hr_reporting_service import get_employee_directory
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_employee_directory(
        current_user.company_id, department, employment_status,
        employment_type, skip, limit,
    )


@router.get("/reports/employees/headcount")
async def headcount_report(
    department: Optional[str] = Query(None),
    employment_status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Headcount report — aggregated by department."""
    from app.services.hr_reporting_service import get_headcount_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_headcount_report(current_user.company_id, department, employment_status)


@router.get("/reports/employees/joining-exit")
async def joining_exit_report(
    months: int = Query(6, ge=1, le=24),
    current_user: User = Depends(get_current_user),
):
    """Joining/exit trend data for charts."""
    from app.services.hr_reporting_service import get_joining_exit_trend
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    items = await get_joining_exit_trend(current_user.company_id, months)
    return {"items": items}


# =============================================================================
# Attendance Reports
# =============================================================================

@router.get("/reports/attendance/summary")
async def attendance_summary_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Attendance summary report — per employee for a date range."""
    from app.services.hr_reporting_service import get_attendance_summary_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_attendance_summary_report(
        current_user.company_id, date_from, date_to, department, skip, limit,
    )


@router.get("/reports/attendance/late")
async def late_arrival_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Late arrival report."""
    from app.services.hr_reporting_service import get_late_arrival_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_late_arrival_report(
        current_user.company_id, date_from, date_to, department, skip, limit,
    )


@router.get("/reports/attendance/absence")
async def absence_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Absence report — employees with absent status."""
    from app.services.hr_reporting_service import get_absence_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_absence_report(
        current_user.company_id, date_from, date_to, department, skip, limit,
    )


# =============================================================================
# Leave Reports
# =============================================================================

@router.get("/reports/leave/balances")
async def leave_balance_report(
    department: Optional[str] = Query(None),
    leave_type_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Leave balance report — per employee, per leave type."""
    from app.services.hr_reporting_service import get_leave_balance_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_leave_balance_report(
        current_user.company_id, department, leave_type_id, skip, limit,
    )


@router.get("/reports/leave/usage")
async def leave_usage_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Leave usage by type."""
    from app.services.hr_reporting_service import get_leave_usage_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    items = await get_leave_usage_report(current_user.company_id, date_from, date_to)
    return {"items": items}


# =============================================================================
# Document Reports
# =============================================================================

@router.get("/reports/documents/expiry")
async def document_expiry_report(
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Document expiry report."""
    from app.services.hr_reporting_service import get_document_expiry_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_document_expiry_report(
        current_user.company_id, department, skip, limit,
    )


# =============================================================================
# Lifecycle Reports
# =============================================================================

@router.get("/reports/lifecycle/events")
async def lifecycle_events_report(
    event_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Lifecycle events report."""
    from app.services.hr_reporting_service import get_lifecycle_events_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_lifecycle_events_report(
        current_user.company_id, event_type, date_from, date_to, skip, limit,
    )


@router.get("/reports/lifecycle/probation")
async def probation_report(
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Probation/confirmation report."""
    from app.services.hr_reporting_service import get_probation_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_probation_report(current_user.company_id, department, skip, limit)


@router.get("/reports/lifecycle/notice")
async def notice_period_report(
    department: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Notice period report."""
    from app.services.hr_reporting_service import get_notice_period_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_notice_period_report(current_user.company_id, department, skip, limit)


# =============================================================================
# Payroll Reports (PAYROLL PERMISSION REQUIRED)
# =============================================================================

@router.get("/reports/payroll/summary")
async def payroll_summary_report(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_capability("payroll.view")),
):
    """Payroll summary report — requires payroll.view permission."""
    from app.services.hr_reporting_service import get_payroll_summary_report
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_payroll_summary_report(current_user.company_id, skip, limit)


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
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return await get_employee_payroll_report(
        current_user.company_id, payroll_period_id, department, skip, limit,
    )


# =============================================================================
# CSV Export Endpoints
# =============================================================================

@router.get("/reports/employees/directory/export")
async def export_employee_directory(
    department: Optional[str] = Query(None),
    employment_status: Optional[str] = Query(None),
    employment_type: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Export employee directory as CSV."""
    from app.services.hr_reporting_service import get_employee_directory, generate_csv
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")

    result = await get_employee_directory(
        current_user.company_id, department, employment_status,
        employment_type, 0, 5000,
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
    current_user: User = Depends(get_current_user),
):
    """Export attendance summary as CSV."""
    from app.services.hr_reporting_service import get_attendance_summary_report, generate_csv
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")

    result = await get_attendance_summary_report(
        current_user.company_id, date_from, date_to, department, 0, 5000,
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
    current_user: User = Depends(get_current_user),
):
    """Export leave balance report as CSV."""
    from app.services.hr_reporting_service import get_leave_balance_report, generate_csv
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")

    result = await get_leave_balance_report(
        current_user.company_id, department, leave_type_id, 0, 5000,
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
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")

    result = await get_payroll_summary_report(current_user.company_id, 0, 5000)
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
    current_user: User = Depends(get_current_user),
):
    """Export document expiry report as CSV."""
    from app.services.hr_reporting_service import get_document_expiry_report, generate_csv
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")

    result = await get_document_expiry_report(current_user.company_id, department, 0, 5000)
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
