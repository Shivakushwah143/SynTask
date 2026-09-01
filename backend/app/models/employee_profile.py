"""
Employee Profile Model — Phase 1 HRMS Foundation.

The EmployeeProfile is the HR-side 1:1 companion to the existing authentication
``User`` document. ``User`` remains the account/authentication identity; the
profile holds HR personal/employment information and lifecycle metadata only.

Conventions followed from the rest of the repository:
- ``company_id`` is always scoped; every query must filter by it.
- Naive-UTC datetimes via ``app.core.clock.utc_now``.
- Employment type / work mode values align with the existing Recruitment
  vocabulary (``JobEmploymentType`` / ``JobWorkMode``) so HR data does not
  introduce duplicated string variants.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel

from app.core.clock import utc_now


class EmploymentType(str, Enum):
    """Employment type — values mirror Recruitment ``JobEmploymentType``."""

    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERN = "internship"
    TEMPORARY = "temporary"


class EmployeeWorkMode(str, Enum):
    """Work mode — values mirror Recruitment ``JobWorkMode`` (onsite/remote/hybrid).

    Legacy variants (office, wfh, work_from_home, ...) are normalized to these
    values at the backend boundary by ``normalize_work_mode``.
    """

    ONSITE = "onsite"
    REMOTE = "remote"
    HYBRID = "hybrid"


class EmploymentStatus(str, Enum):
    """HR employment lifecycle status.

    Deliberately distinct from ``UserStatus`` (account state: active/inactive/
    suspended/pending). Phase 1 only needs a stable status field; full lifecycle
    workflows arrive in Phase 9.
    """

    ONBOARDING = "onboarding"
    PROBATION = "probation"
    ACTIVE = "active"
    NOTICE_PERIOD = "notice_period"
    EXITED = "exited"


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    NOT_SPECIFIED = "not_specified"


class Address(BaseModel):
    """Structured personal address."""

    line1: Optional[str] = None
    line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None


class EmergencyContact(BaseModel):
    name: Optional[str] = None
    relationship: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None


class ProbationInfo(BaseModel):
    applicable: bool = False
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    confirmation_date: Optional[datetime] = None


class ExitInfo(BaseModel):
    """Basic exit fields to represent existing/imported employees.

    Resignation/offboarding workflows belong to Phase 9 (Employee Lifecycle);
    Phase 1 only stores the data.
    """

    resignation_date: Optional[datetime] = None
    last_working_day: Optional[datetime] = None
    exit_date: Optional[datetime] = None
    exit_reason: Optional[str] = None


class EmployeeProfile(Document):
    """HR employee profile — one per company User."""

    company_id: Indexed(str)
    user_id: Indexed(str)

    # Identification
    employee_number: Optional[str] = None
    # Link to Recruitment candidate when the employee joined via recruitment.
    candidate_id: Optional[str] = None

    # Personal information (fields intentionally owned by User are read from
    # User rather than duplicated: full name, email, avatar, phone).
    date_of_birth: Optional[datetime] = None
    gender: Optional[Gender] = None
    personal_email: Optional[str] = None
    personal_phone: Optional[str] = None
    address: Optional[Address] = None
    emergency_contact: Optional[EmergencyContact] = None

    # Employment information
    employment_type: Optional[EmploymentType] = None
    joining_date: Optional[datetime] = None
    department_id: Optional[str] = None
    designation: Optional[str] = None
    # Reporting manager — User ID of the person this employee reports to.
    reports_to: Optional[str] = None
    work_location: Optional[str] = None
    work_mode: Optional[EmployeeWorkMode] = None
    employment_status: EmploymentStatus = EmploymentStatus.ONBOARDING

    # Probation / confirmation (storage only for Phase 1)
    probation: Optional[ProbationInfo] = None

    # Exit information (storage only for Phase 1)
    exit_info: Optional[ExitInfo] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "employee_profiles"
        indexes = [
            # Company-scoped uniqueness. Sparse so records without a number yet
            # (e.g. pre-backfill) never collide.
            IndexModel(
                [("company_id", ASCENDING), ("employee_number", ASCENDING)],
                unique=True,
                partialFilterExpression={
                        "candidate_id": {"$type": "string"},
                    },
            ),
            # One profile per user per company.
            IndexModel(
                [("company_id", ASCENDING), ("user_id", ASCENDING)],
                unique=True,
            ),
            # One profile per converted candidate.
            IndexModel(
    [("company_id", ASCENDING), ("candidate_id", ASCENDING)],
    unique=True,
    partialFilterExpression={
        "candidate_id": {"$type": "string"},
    },
),
            # Access-pattern indexes for list filters / detail lookups.
            IndexModel([("company_id", ASCENDING), ("employment_status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("department_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("reports_to", ASCENDING)]),
        ]
