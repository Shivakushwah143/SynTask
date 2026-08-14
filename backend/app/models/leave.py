"""
Leave management models.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class LeaveType(str, Enum):
    """LEGACY leave type enum (Phase 3 keeps this for historical requests).

    Phase 3 separates Leave Category (configurable ``LeaveTypeConfig``) from
    Leave Duration (``LeaveDuration``). The old enum mixed both concepts; it is
    preserved so legacy LeaveRequests remain readable, and new requests use
    ``leave_type_id`` + ``duration`` instead.
    """

    FULL_DAY = "full_day"
    HALF_DAY = "half_day"
    SICK_LEAVE = "sick_leave"
    CASUAL_LEAVE = "casual_leave"
    EMERGENCY_LEAVE = "emergency_leave"
    WORK_FROM_HOME = "work_from_home"


class LeaveDuration(str, Enum):
    """How much of a day a leave consumes."""

    FULL_DAY = "full_day"
    HALF_DAY = "half_day"


class LeaveStatus(str, Enum):
    PENDING = "pending"
    FORWARDED = "forwarded"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class LeaveTypeConfig(Document):
    """Company-scoped, configurable Leave Type (Phase 3).

    Separation of concerns: the leave CATEGORY (e.g. "Sick Leave") is a
    LeaveTypeConfig; the amount consumed per day is the LeaveDuration on each
    request. Deactivated types are never physically deleted (history keeps the
    reference).
    """

    company_id: Indexed(str)
    name: str
    code: Indexed(str)
    description: Optional[str] = None
    is_paid: bool = True
    default_annual_allocation: float = Field(default=0.0, ge=0.0)
    allow_half_day: bool = True
    requires_approval: bool = True
    carry_forward_allowed: bool = False
    max_carry_forward: Optional[float] = None
    active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "leave_types"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("active", ASCENDING)], name="leave_types_company_active"),
            IndexModel([("company_id", ASCENDING), ("code", ASCENDING)], unique=True, name="leave_types_company_code_uniq"),
            "created_at",
        ]


class LeaveBalance(Document):
    """Cached per-employee leave balance (Phase 3).

    ``allocated`` is the HR-managed entitlement; ``used`` and ``pending`` are
    derived from requests and kept in sync through atomic optimistic-lock
    updates (``version``) plus explicit reconciliation, so concurrent requests
    cannot over-allocate. ``available = allocated - used - pending``.
    """

    company_id: Indexed(str)
    employee_id: Indexed(str)
    leave_type_id: Indexed(str)
    period: str = Field(default="", description="Calendar year e.g. 2026")
    allocated: float = Field(default=0.0, ge=0.0)
    used: float = Field(default=0.0)
    pending: float = Field(default=0.0)
    version: int = 0
    adjustments: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "leave_balances"
        indexes = [
            IndexModel(
                [("company_id", ASCENDING), ("employee_id", ASCENDING), ("leave_type_id", ASCENDING)],
                unique=True,
                name="leave_balances_company_employee_type_uniq",
            ),
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("period", ASCENDING)]),
        ]


class LeaveRequest(Document):
    employee_id: Indexed(str)
    employee_role: Optional[str] = None
    company_id: Indexed(str)
    # Legacy value (category + duration mixed) — kept for historical requests.
    leave_type: Optional[LeaveType] = None
    # Phase 3 normalized fields: configurable category + duration + computed units.
    leave_type_id: Optional[str] = None
    duration: Optional[LeaveDuration] = None
    requested_units: float = Field(default=1.0, ge=0.0)
    start_date: datetime
    end_date: datetime
    reason: str
    attachment_url: Optional[str] = None
    attachment_public_id: Optional[str] = None
    status: LeaveStatus = LeaveStatus.PENDING
    requested_by: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_comment: Optional[str] = None
    pending_with_user_ids: List[str] = Field(default_factory=list)
    forwarded_to_user_id: Optional[str] = None
    forwarded_to_user_ids: List[str] = Field(default_factory=list)
    forwarded_by: Optional[str] = None
    forwarded_at: Optional[datetime] = None
    forwarded_to_admin: bool = False
    approval_history: List[Dict[str, Any]] = Field(default_factory=list)
    forward_comment: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "leave_requests"
        indexes = [
            "employee_id",
            "company_id",
            "employee_role",
            "status",
            "leave_type",
            "leave_type_id",
            "start_date",
            "end_date",
            "pending_with_user_ids",
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("start_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("start_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("pending_with_user_ids", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("start_date", ASCENDING), ("end_date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("leave_type_id", ASCENDING), ("status", ASCENDING)], name="leave_requests_company_employee_type_status"),
        ]
