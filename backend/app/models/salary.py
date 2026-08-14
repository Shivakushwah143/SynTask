"""
Phase 5 — Salary Structure Models.

Extensible, company-configurable salary components and versioned employee
salary structures with effective-date history.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel


class ComponentType(str, Enum):
    EARNING = "earning"
    DEDUCTION = "deduction"


class CalculationType(str, Enum):
    FIXED = "fixed"
    PERCENTAGE = "percentage"


class SalaryStatus(str, Enum):
    ACTIVE = "active"
    SUPERSEDED = "superseded"


class PayFrequency(str, Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"


# =============================================================================
# Salary Component — company-configurable building blocks
# =============================================================================


class SalaryComponent(Document):
    """Company-scoped salary component definition.

    Components are the building blocks of salary structures. Each has a
    stable code, a type (earning/deduction), and a calculation method.
    """

    company_id: Indexed(str)
    name: str
    code: Indexed(str)  # company-scoped unique via index
    component_type: ComponentType
    calculation_type: CalculationType = CalculationType.FIXED

    # For PERCENTAGE calculation: reference a base component
    percentage_rate: Optional[float] = None  # e.g. 40.0 for 40%
    base_component_id: Optional[str] = None  # must be a valid component in same company

    # Configuration
    default_value: float = 0.0
    taxable: bool = False
    payroll_enabled: bool = True
    display_order: int = 0

    active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "salary_components"
        indexes = [
            IndexModel(
                [("company_id", ASCENDING), ("code", ASCENDING)],
                unique=True,
                name="salary_components_company_code_uniq",
            ),
            IndexModel([("company_id", ASCENDING), ("active", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("component_type", ASCENDING)]),
        ]


# =============================================================================
# Salary Structure Item — embedded component assignment
# =============================================================================


class SalaryStructureItem(BaseModel):
    """One component within a salary structure. Stores snapshot data so
    historical structures remain interpretable even if components are
    renamed or deactivated later.
    """

    component_id: str
    # Snapshot fields (preserved at creation/revision time)
    component_name: str
    component_code: str
    component_type: ComponentType
    calculation_type: CalculationType

    # Value
    value: float = 0.0  # for FIXED: the amount; for PERCENTAGE: not used directly
    percentage: Optional[float] = None  # for PERCENTAGE: the rate used
    base_component_id: Optional[str] = None  # for PERCENTAGE: which component it references

    # Calculated result
    calculated_amount: float = 0.0


# =============================================================================
# Salary Structure — one effective salary configuration per employee
# =============================================================================


class SalaryStructure(Document):
    """Versioned salary structure for an employee.

    Each revision creates a new document with an effective_from date.
    effective_to is set on the previous version when a new one is created.
    """

    company_id: Indexed(str)
    employee_id: Indexed(str)

    effective_from: datetime
    effective_to: Optional[datetime] = None  # null = currently active

    currency: str = "INR"
    pay_frequency: PayFrequency = PayFrequency.MONTHLY
    status: SalaryStatus = SalaryStatus.ACTIVE

    # Items (embedded list of component assignments)
    items: List[SalaryStructureItem] = Field(default_factory=list)

    # Derived totals (calculated by backend)
    total_earnings: float = 0.0
    total_configured_deductions: float = 0.0
    configured_net: float = 0.0

    # Provenance
    source: Optional[str] = None  # "offer", "manual", "revision"
    source_reference_id: Optional[str] = None  # offer ID if created from offer
    notes: Optional[str] = None

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "salary_structures"
        indexes = [
            IndexModel(
                [("company_id", ASCENDING), ("employee_id", ASCENDING), ("effective_from", ASCENDING)],
                name="salary_structures_company_employee_from",
            ),
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("employee_id", ASCENDING), ("status", ASCENDING)]),
        ]
