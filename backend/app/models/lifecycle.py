"""
Employee Lifecycle Models — Phase 9.

Phase 9 introduces controlled, effective-dated employment changes with full
history. ``EmployeeProfile`` remains the *current effective state*; these models
record *how the employee reached that state*:

    EmployeeProfile  = current employment state
    EmployeeLifecycleEvent = what changed, when it became effective, and why
    EmployeeSeparationRequest = resignation / termination workflow state
    EmployeeOffboarding = exit checklist foundation

Company scope is enforced on every operation — never trust frontend ids.
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel

from app.core.clock import utc_now


class LifecycleEventType(str, Enum):
    """Meaningful business events — not one generic ``UPDATED`` for everything."""

    JOINED = "joined"
    EMPLOYMENT_BASELINE = "employment_baseline"
    PROBATION_STARTED = "probation_started"
    PROBATION_EXTENDED = "probation_extended"
    CONFIRMED = "confirmed"
    PROMOTED = "promoted"
    DESIGNATION_CHANGED = "designation_changed"
    DEPARTMENT_TRANSFERRED = "department_transferred"
    MANAGER_CHANGED = "manager_changed"
    WORK_LOCATION_CHANGED = "work_location_changed"
    WORK_MODE_CHANGED = "work_mode_changed"
    EMPLOYMENT_TYPE_CHANGED = "employment_type_changed"
    RESIGNATION_SUBMITTED = "resignation_submitted"
    RESIGNATION_WITHDRAWN = "resignation_withdrawn"
    RESIGNATION_ACCEPTED = "resignation_accepted"
    RESIGNATION_REJECTED = "resignation_rejected"
    NOTICE_PERIOD_STARTED = "notice_period_started"
    TERMINATED = "terminated"
    EXITED = "exited"


class LifecycleEventStatus(str, Enum):
    """Lifecycle event lifecycle."""

    UPCOMING = "upcoming"  # effective_date in the future — profile NOT changed yet
    APPLIED = "applied"  # effective_date reached — profile updated
    CANCELLED = "cancelled"  # future event cancelled before it took effect


class LifecycleEventSource(str, Enum):
    MANUAL = "manual"
    ONBOARDING = "onboarding"
    MIGRATION = "migration"


class EmployeeLifecycleEvent(Document):
    """One effective-dated employment change with before/after snapshots."""

    company_id: Indexed(str)
    employee_id: Indexed(str)  # EmployeeProfile id
    user_id: str  # User id (for notifications / manager resolution)

    event_type: LifecycleEventType
    status: LifecycleEventStatus = LifecycleEventStatus.APPLIED

    effective_date: datetime
    # Optional applied-at timestamp for future-dated events.
    applied_at: Optional[datetime] = None

    # Before/after state snapshots — never reconstruct from current records.
    previous_state: dict = Field(default_factory=dict)
    new_state: dict = Field(default_factory=dict)

    reason: Optional[str] = None
    notes: Optional[str] = None

    source: LifecycleEventSource = LifecycleEventSource.MANUAL
    source_reference_id: Optional[str] = None  # e.g. separation request id

    initiated_by: Optional[str] = None  # User id
    cancelled_by: Optional[str] = None
    cancelled_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "employee_lifecycle_events"
        indexes = [
            IndexModel(
                [("company_id", ASCENDING), ("employee_id", ASCENDING), ("effective_date", ASCENDING)],
                name="lifecycle_company_employee_effective",
            ),
            IndexModel(
                [("company_id", ASCENDING), ("employee_id", ASCENDING), ("created_at", ASCENDING)],
                name="lifecycle_company_employee_created",
            ),
            IndexModel(
                [("employee_id", ASCENDING), ("event_type", ASCENDING)],
                name="lifecycle_employee_type",
            ),
            IndexModel(
                [("company_id", ASCENDING), ("status", ASCENDING), ("effective_date", ASCENDING)],
                name="lifecycle_company_status_effective",
            ),
        ]


class SeparationType(str, Enum):
    RESIGNATION = "resignation"
    TERMINATION = "termination"


class SeparationStatus(str, Enum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    COMPLETED = "completed"  # employee has exited


class EmployeeSeparationRequest(Document):
    """Resignation / termination workflow record.

    Resignation submission ≠ employee exit. The workflow is:

        SUBMITTED → (UNDER_REVIEW) → ACCEPTED → NOTICE_PERIOD → EXITED
        SUBMITTED → WITHDRAWN | REJECTED
    """

    company_id: Indexed(str)
    employee_id: Indexed(str)  # EmployeeProfile id
    user_id: str

    separation_type: SeparationType = SeparationType.RESIGNATION
    status: SeparationStatus = SeparationStatus.SUBMITTED

    submitted_date: datetime = Field(default_factory=utc_now)
    requested_last_working_day: Optional[datetime] = None

    reason: Optional[str] = None
    employee_comment: Optional[str] = None

    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_comment: Optional[str] = None

    approved_last_working_day: Optional[datetime] = None
    notice_period_days: Optional[float] = None
    notice_start_date: Optional[datetime] = None

    # Set when the employee is finally marked EXITED.
    completed_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "employee_separation_requests"
        indexes = [
            IndexModel(
                [("company_id", ASCENDING), ("employee_id", ASCENDING), ("created_at", ASCENDING)],
                name="separation_company_employee_created",
            ),
            IndexModel(
                [("company_id", ASCENDING), ("status", ASCENDING)],
                name="separation_company_status",
            ),
            IndexModel(
                [("employee_id", ASCENDING), ("status", ASCENDING)],
                name="separation_employee_status",
            ),
        ]


class OffboardingItem(BaseModel):
    """One offboarding checklist item (configurable per exit)."""

    key: str
    title: str
    notes: Optional[str] = None
    completed: bool = False
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None


DEFAULT_OFFBOARDING_ITEMS: List[dict] = [
    {"key": "knowledge_handover", "title": "Knowledge handover"},
    {"key": "project_handover", "title": "Project handover"},
    {"key": "documents_returned", "title": "Company documents returned"},
    {"key": "access_disabled", "title": "Account access disabled"},
    {"key": "attendance_reviewed", "title": "Final attendance reviewed"},
    {"key": "leave_reviewed", "title": "Leave reviewed"},
    {"key": "payroll_settlement", "title": "Final payroll / settlement pending"},
    {"key": "hr_exit_discussion", "title": "HR exit discussion"},
]


class EmployeeOffboarding(Document):
    """Offboarding checklist for one exiting employee (Phase 9 foundation).

    Deliberately a dedicated minimal checklist rather than polluting the
    project Task system — HR exit items are confidential and must not leak
    into normal project/task workflows.
    """

    company_id: Indexed(str)
    employee_id: Indexed(str)  # EmployeeProfile id (one offboarding per employee)
    user_id: str

    items: List[OffboardingItem] = Field(default_factory=list)
    notes: Optional[str] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "employee_offboarding"
        indexes = [
            IndexModel(
                [("company_id", ASCENDING), ("employee_id", ASCENDING)],
                unique=True,
                name="offboarding_company_employee",
            ),
        ]
