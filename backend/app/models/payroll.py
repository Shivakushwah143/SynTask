"""
Phase 6 — Payroll Models.

PayrollPeriod (company-scoped monthly payroll run) and PayrollRecord
(employee-level calculation with full input snapshots for historical stability).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel


class PayrollPeriodStatus(str, Enum):
    DRAFT = "draft"
    CALCULATING = "calculating"
    CALCULATED = "calculated"
    REVIEW = "review"
    APPROVED = "approved"
    PROCESSED = "processed"


class PayrollRecordStatus(str, Enum):
    READY = "ready"
    WARNING = "warning"
    BLOCKED = "blocked"


# =============================================================================
# Payroll Period
# =============================================================================


class PayrollPeriod(Document):
    """Company-scoped monthly payroll run."""

    company_id: Indexed(str)
    year: int
    month: int  # 1-12
    period_start: datetime
    period_end: datetime

    status: PayrollPeriodStatus = PayrollPeriodStatus.DRAFT

    # Lifecycle actors
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    calculated_by: Optional[str] = None
    calculated_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    processed_by: Optional[str] = None
    processed_at: Optional[datetime] = None

    notes: Optional[str] = None
    calculation_version: int = 1

    # Aggregated totals (recalculated on each calculation pass)
    employee_count: int = 0
    ready_count: int = 0
    warning_count: int = 0
    blocked_count: int = 0
    total_earnings: float = 0.0
    total_deductions: float = 0.0
    total_net: float = 0.0

    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "payroll_periods"
        indexes = [
            IndexModel(
                [("company_id", ASCENDING), ("year", ASCENDING), ("month", ASCENDING)],
                unique=True,
                name="payroll_periods_company_year_month_uniq",
            ),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("year", ASCENDING), ("month", ASCENDING)]),
        ]


# =============================================================================
# Payroll Earning / Deduction Item (embedded)
# =============================================================================


class PayrollEarningItem(BaseModel):
    """One earning line in a payroll record."""

    component_code: str
    component_name: str
    component_type: str = "earning"
    calculation_type: str = "fixed"
    configured_amount: float = 0.0
    proration_factor: float = 1.0
    calculated_amount: float = 0.0
    source: str = "salary_structure"  # salary_structure | manual_adjustment


class PayrollDeductionItem(BaseModel):
    """One deduction line in a payroll record."""

    component_code: str
    component_name: str
    component_type: str = "deduction"
    configured_amount: float = 0.0
    calculated_amount: float = 0.0
    source: str = "salary_structure"  # salary_structure | attendance | manual_adjustment


# =============================================================================
# Payroll Record
# =============================================================================


class PayrollRecord(Document):
    """One employee's payroll calculation for a payroll period."""

    company_id: Indexed(str)
    payroll_period_id: Indexed(str)
    employee_id: Indexed(str)

    # Employee snapshot
    employee_name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None

    # Salary snapshot
    salary_structure_id: Optional[str] = None
    salary_effective_from: Optional[datetime] = None
    currency: str = "INR"
    configured_earnings: float = 0.0
    configured_deductions: float = 0.0

    # Attendance snapshot
    attendance_snapshot: Dict[str, Any] = Field(default_factory=dict)
    # Keys: calendar_days, working_days, present_days, paid_leave_days,
    # unpaid_leave_days, absent_days, half_days, holiday_days, week_off_days,
    # payable_days, total_work_minutes, overtime_minutes, late_count, early_departure_count

    # Working / payable
    working_days: int = 0
    payable_days: float = 0.0

    # Calculated financials
    earnings: List[PayrollEarningItem] = Field(default_factory=list)
    deductions: List[PayrollDeductionItem] = Field(default_factory=list)
    gross_salary: float = 0.0
    total_deductions: float = 0.0
    net_salary: float = 0.0

    # Status
    status: PayrollRecordStatus = PayrollRecordStatus.READY
    warnings: List[str] = Field(default_factory=list)
    blockers: List[str] = Field(default_factory=list)

    # Lifecycle
    calculated_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None
    calculation_notes: Optional[str] = None
    calculation_version: int = 1

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "payroll_records"
        indexes = [
            IndexModel(
                [("payroll_period_id", ASCENDING), ("employee_id", ASCENDING)],
                unique=True,
                name="payroll_records_period_employee_uniq",
            ),
            IndexModel([("company_id", ASCENDING), ("payroll_period_id", ASCENDING)]),
            IndexModel([("employee_id", ASCENDING), ("payroll_period_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING)]),
        ]
