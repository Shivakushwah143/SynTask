"""
Phase 6 — Payroll Period & Record service.

CRUD for payroll periods, lifecycle transitions (DRAFT→CALCULATED→REVIEW→APPROVED→PROCESSED),
record management, and serialization.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.models.employee_profile import EmployeeProfile, EmploymentStatus
from app.models.payroll import (
    PayrollDeductionItem,
    PayrollEarningItem,
    PayrollPeriod,
    PayrollPeriodStatus,
    PayrollRecord,
    PayrollRecordStatus,
)
from app.models.user import User, UserRole
from app.services.payroll_calculation_service import (
    calculate_employee_payroll,
    calculate_period_payroll,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Period CRUD
# =============================================================================


async def create_payroll_period(
    company_id: str, actor: User, payload: Dict[str, Any]
) -> PayrollPeriod:
    """Create a new payroll period (DRAFT)."""
    year = payload.get("year")
    month = payload.get("month")
    if not year or not month:
        raise HTTPException(status_code=400, detail="year and month are required")
    year = int(year)
    month = int(month)
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be 1-12")

    # Check duplicate
    existing = await PayrollPeriod.find_one({
        "company_id": company_id, "year": year, "month": month,
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Payroll period for {year}-{month:02d} already exists")

    # Calculate period dates
    period_start = datetime(year, month, 1)
    if month == 12:
        period_end = datetime(year + 1, 1, 1) - __import__("datetime").timedelta(seconds=1)
    else:
        period_end = datetime(year, month + 1, 1) - __import__("datetime").timedelta(seconds=1)

    period = PayrollPeriod(
        company_id=company_id,
        year=year,
        month=month,
        period_start=period_start,
        period_end=period_end,
        status=PayrollPeriodStatus.DRAFT,
        created_by=str(actor.id),
    )
    await period.insert()
    return period


async def get_payroll_period(company_id: str, period_id: str) -> Optional[PayrollPeriod]:
    try:
        period = await PayrollPeriod.get(period_id)
    except (ValueError, TypeError):
        # Non-ObjectId string used as period id (e.g. "salary-components")
        # when a route catch-all passes an unintended path segment.
        # Beanie raises ValidationError (a ValueError subclass) for invalid ids.
        return None
    if not period or period.company_id != company_id:
        return None
    return period


async def list_payroll_periods(
    company_id: str, status_filter: Optional[str] = None
) -> List[PayrollPeriod]:
    query: Dict[str, Any] = {"company_id": company_id}
    if status_filter:
        query["status"] = status_filter
    return await PayrollPeriod.find(query).sort("-year", "-month").to_list()


# =============================================================================
# Lifecycle Transitions
# =============================================================================

VALID_TRANSITIONS = {
    PayrollPeriodStatus.DRAFT: {PayrollPeriodStatus.CALCULATED, PayrollPeriodStatus.CALCULATING},
    PayrollPeriodStatus.CALCULATING: {PayrollPeriodStatus.CALCULATED},
    PayrollPeriodStatus.CALCULATED: {PayrollPeriodStatus.REVIEW, PayrollPeriodStatus.CALCULATING},
    PayrollPeriodStatus.REVIEW: {PayrollPeriodStatus.APPROVED, PayrollPeriodStatus.CALCULATING},
    PayrollPeriodStatus.APPROVED: {PayrollPeriodStatus.PROCESSED},
    PayrollPeriodStatus.PROCESSED: set(),  # Terminal
}


def _assert_transition(current: PayrollPeriodStatus, target: PayrollPeriodStatus) -> None:
    if target not in VALID_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from {current.value} to {target.value}",
        )


async def calculate_payroll(
    company_id: str, period_id: str, actor: User
) -> PayrollPeriod:
    """Calculate payroll for a period."""
    period = await get_payroll_period(company_id, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")

    _assert_transition(period.status, PayrollPeriodStatus.CALCULATING)

    now = utc_now()
    period.status = PayrollPeriodStatus.CALCULATING
    period.updated_at = now
    await period.save()

    try:
        period_start = period.period_start.date() if isinstance(period.period_start, datetime) else period.period_start
        period_end = period.period_end.date() if isinstance(period.period_end, datetime) else period.period_end

        results, summary = await calculate_period_payroll(company_id, period_start, period_end)

        # Upsert payroll records
        for result in results:
            emp_id = result.get("employee_id")
            if not emp_id:
                continue

            existing = await PayrollRecord.find_one({
                "payroll_period_id": str(period.id),
                "employee_id": emp_id,
            })

            # Convert list results back to model objects
            earnings = []
            for e in result.get("earnings", []):
                if isinstance(e, dict):
                    earnings.append(PayrollEarningItem(**e))
                else:
                    earnings.append(e)

            deductions = []
            for d in result.get("deductions", []):
                if isinstance(d, dict):
                    deductions.append(PayrollDeductionItem(**d))
                else:
                    deductions.append(d)

            if existing:
                existing.status = result.get("status", PayrollRecordStatus.READY)
                existing.warnings = result.get("warnings", [])
                existing.blockers = result.get("blockers", [])
                existing.earnings = earnings
                existing.deductions = deductions
                existing.gross_salary = result.get("gross_salary", 0.0)
                existing.total_deductions = result.get("total_deductions", 0.0)
                existing.net_salary = result.get("net_salary", 0.0)
                existing.payable_days = result.get("payable_days", 0.0)
                existing.working_days = result.get("working_days", 0)
                existing.attendance_snapshot = result.get("attendance_snapshot", {})
                existing.employee_name = result.get("employee_name")
                existing.employee_number = result.get("employee_number")
                existing.department = result.get("department")
                existing.designation = result.get("designation")
                existing.salary_structure_id = result.get("salary_structure_id")
                existing.salary_effective_from = result.get("salary_effective_from")
                existing.currency = result.get("currency", "INR")
                existing.configured_earnings = result.get("configured_earnings", 0.0)
                existing.configured_deductions = result.get("configured_deductions", 0.0)
                existing.calculation_version = period.calculation_version
                existing.calculated_at = now
                existing.updated_at = now
                await existing.save()
            else:
                record = PayrollRecord(
                    company_id=company_id,
                    payroll_period_id=str(period.id),
                    employee_id=emp_id,
                    employee_name=result.get("employee_name"),
                    employee_number=result.get("employee_number"),
                    department=result.get("department"),
                    designation=result.get("designation"),
                    salary_structure_id=result.get("salary_structure_id"),
                    salary_effective_from=result.get("salary_effective_from"),
                    currency=result.get("currency", "INR"),
                    configured_earnings=result.get("configured_earnings", 0.0),
                    configured_deductions=result.get("configured_deductions", 0.0),
                    attendance_snapshot=result.get("attendance_snapshot", {}),
                    working_days=result.get("working_days", 0),
                    payable_days=result.get("payable_days", 0.0),
                    earnings=earnings,
                    deductions=deductions,
                    gross_salary=result.get("gross_salary", 0.0),
                    total_deductions=result.get("total_deductions", 0.0),
                    net_salary=result.get("net_salary", 0.0),
                    status=result.get("status", PayrollRecordStatus.READY),
                    warnings=result.get("warnings", []),
                    blockers=result.get("blockers", []),
                    calculation_version=period.calculation_version,
                    calculated_at=now,
                )
                await record.insert()

        # Update period
        period.status = PayrollPeriodStatus.CALCULATED
        period.calculated_by = str(actor.id)
        period.calculated_at = now
        period.employee_count = summary["employee_count"]
        period.ready_count = summary["ready_count"]
        period.warning_count = summary["warning_count"]
        period.blocked_count = summary["blocked_count"]
        period.total_earnings = summary["total_earnings"]
        period.total_deductions = summary["total_deductions"]
        period.total_net = summary["total_net"]
        period.updated_at = now
        await period.save()

        return period

    except Exception as e:
        # Revert on failure
        period.status = PayrollPeriodStatus.DRAFT
        period.updated_at = utc_now()
        await period.save()
        raise HTTPException(status_code=500, detail=f"Payroll calculation failed: {str(e)}")


async def move_to_review(
    company_id: str, period_id: str, actor: User
) -> PayrollPeriod:
    period = await get_payroll_period(company_id, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    _assert_transition(period.status, PayrollPeriodStatus.REVIEW)
    now = utc_now()
    period.status = PayrollPeriodStatus.REVIEW
    period.reviewed_by = str(actor.id)
    period.reviewed_at = now
    period.updated_at = now
    await period.save()
    return period


async def approve_payroll(
    company_id: str, period_id: str, actor: User
) -> PayrollPeriod:
    period = await get_payroll_period(company_id, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    _assert_transition(period.status, PayrollPeriodStatus.APPROVED)

    # Check no blocked records
    blocked = await PayrollRecord.find({
        "payroll_period_id": str(period.id),
        "status": PayrollRecordStatus.BLOCKED.value,
    }).count()
    if blocked > 0:
        raise HTTPException(status_code=400, detail=f"Cannot approve: {blocked} employee(s) have blockers")

    now = utc_now()
    period.status = PayrollPeriodStatus.APPROVED
    period.approved_by = str(actor.id)
    period.approved_at = now
    period.updated_at = now
    await period.save()
    return period


async def process_payroll(
    company_id: str, period_id: str, actor: User
) -> PayrollPeriod:
    period = await get_payroll_period(company_id, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    _assert_transition(period.status, PayrollPeriodStatus.PROCESSED)

    now = utc_now()
    period.status = PayrollPeriodStatus.PROCESSED
    period.processed_by = str(actor.id)
    period.processed_at = now
    period.updated_at = now
    await period.save()

    # Mark all records as processed
    records = await PayrollRecord.find({
        "payroll_period_id": str(period.id),
    }).to_list()
    for record in records:
        record.processed_at = now
        record.updated_at = now
        await record.save()

    # Phase 7 closure — a processed payroll automatically backfills missing
    # payslips for eligible records so employees see them in My HR without a
    # manual HR step. Reuses the existing idempotent payslip service: records
    # that already have a current payslip are left untouched, BLOCKED records
    # are skipped, and per-record failures are isolated. Generation is
    # best-effort — the authoritative PROCESSED transition never fails because
    # of presentation work, and any failure stays recoverable via the explicit
    # bulk/manual payslip actions.
    await _auto_generate_period_payslips(company_id, period_id, actor)

    return period


async def _auto_generate_period_payslips(
    company_id: str, period_id: str, actor: User
) -> None:
    """Best-effort payslip backfill for a freshly PROCESSED payroll period.

    Reuses ``payslip_service.generate_period_payslips`` (idempotent, skips
    BLOCKED records, isolates per-record failures). Never raises: the payroll
    transition is authoritative and must not roll back because payslip
    generation failed; failures are logged and remain recoverable through the
    explicit ``POST /payroll/periods/{id}/payslips/generate`` action.
    """
    from app.services.payslip_service import generate_period_payslips

    try:
        summary = await generate_period_payslips(company_id, period_id, actor)
        failed = summary.get("failed") or []
        if failed:
            logger.warning(
                "Auto payslip generation for period %s had %d failure(s): %s",
                period_id, len(failed), failed,
            )
    except Exception:
        logger.exception(
            "Auto payslip generation failed for processed period %s", period_id
        )


# =============================================================================
# Record queries
# =============================================================================


async def get_period_records(
    company_id: str, period_id: str,
    status_filter: Optional[str] = None,
    skip: int = 0, limit: int = 100,
) -> List[PayrollRecord]:
    query: Dict[str, Any] = {"payroll_period_id": period_id, "company_id": company_id}
    if status_filter:
        query["status"] = status_filter
    return await PayrollRecord.find(query).sort("employee_name").skip(skip).limit(limit).to_list()


async def get_record(company_id: str, record_id: str) -> Optional[PayrollRecord]:
    try:
        record = await PayrollRecord.get(record_id)
    except (ValueError, TypeError):
        # Non-ObjectId string used as record id.
        return None
    if not record or record.company_id != company_id:
        return None
    return record


# =============================================================================
# Serialization
# =============================================================================


def serialize_period(period: PayrollPeriod) -> Dict[str, Any]:
    return {
        "id": str(period.id),
        "company_id": period.company_id,
        "year": period.year,
        "month": period.month,
        "period_start": period.period_start,
        "period_end": period.period_end,
        "status": period.status.value,
        "employee_count": period.employee_count,
        "ready_count": period.ready_count,
        "warning_count": period.warning_count,
        "blocked_count": period.blocked_count,
        "total_earnings": period.total_earnings,
        "total_deductions": period.total_deductions,
        "total_net": period.total_net,
        "created_by": period.created_by,
        "created_at": period.created_at,
        "calculated_by": period.calculated_by,
        "calculated_at": period.calculated_at,
        "approved_by": period.approved_by,
        "approved_at": period.approved_at,
        "processed_by": period.processed_by,
        "processed_at": period.processed_at,
        "notes": period.notes,
        "calculation_version": period.calculation_version,
        "updated_at": period.updated_at,
    }


def serialize_record(
    record: PayrollRecord,
    *,
    payslip: Optional[Dict[str, Any]] = None,
    can_generate: bool = False,
    can_preview: bool = False,
    can_download: bool = False,
    can_regenerate: bool = False,
) -> Dict[str, Any]:
    """Serialize one payroll record, optionally with Phase 7 payslip state."""
    return {
        "id": str(record.id),
        "company_id": record.company_id,
        "payroll_period_id": record.payroll_period_id,
        "employee_id": record.employee_id,
        "employee_name": record.employee_name,
        "employee_number": record.employee_number,
        "department": record.department,
        "designation": record.designation,
        "salary_structure_id": record.salary_structure_id,
        "salary_effective_from": record.salary_effective_from,
        "currency": record.currency,
        "configured_earnings": record.configured_earnings,
        "configured_deductions": record.configured_deductions,
        "attendance_snapshot": record.attendance_snapshot,
        "working_days": record.working_days,
        "payable_days": record.payable_days,
        "earnings": [
            {
                "component_code": e.component_code,
                "component_name": e.component_name,
                "component_type": e.component_type,
                "calculation_type": e.calculation_type,
                "configured_amount": e.configured_amount,
                "proration_factor": e.proration_factor,
                "calculated_amount": e.calculated_amount,
                "source": e.source,
            }
            for e in (record.earnings or [])
        ],
        "deductions": [
            {
                "component_code": d.component_code,
                "component_name": d.component_name,
                "component_type": d.component_type,
                "configured_amount": d.configured_amount,
                "calculated_amount": d.calculated_amount,
                "source": d.source,
            }
            for d in (record.deductions or [])
        ],
        "gross_salary": record.gross_salary,
        "total_deductions": record.total_deductions,
        "net_salary": record.net_salary,
        "status": record.status.value,
        "warnings": record.warnings or [],
        "blockers": record.blockers or [],
        "calculated_at": record.calculated_at,
        "processed_at": record.processed_at,
        "calculation_version": record.calculation_version,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        # Phase 7 — payslip state + permission flags (backend authoritative)
        "payslip": payslip if payslip is not None else {"generated": False},
        "can_generate": can_generate,
        "can_preview": can_preview,
        "can_download": can_download,
        "can_regenerate": can_regenerate,
    }
