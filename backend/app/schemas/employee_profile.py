"""
Employee Profile API Schemas — Phase 1 HRMS.

Request/response DTOs for the canonical ``/employees`` endpoints. Responses are
explicit DTOs only — raw ``User`` documents are never serialized so internal
properties (password hash, tokens, 2FA secrets, ...) can never leak.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.models.employee_profile import (
    EmploymentStatus,
    EmploymentType,
    EmployeeWorkMode,
    Gender,
)


class AddressSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    line1: Optional[str] = None
    line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None


class EmergencyContactSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    relationship: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None


class ProbationSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    applicable: bool = False
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    confirmation_date: Optional[datetime] = None


class ExitInfoSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    resignation_date: Optional[datetime] = None
    last_working_day: Optional[datetime] = None
    exit_date: Optional[datetime] = None
    exit_reason: Optional[str] = None


class EmployeeProfileCreate(BaseModel):
    """Create an Employee Profile for an existing company User.

    ``employee_number`` is optional — when omitted the backend generates a
    company-scoped number. Employee numbers are never generated on the frontend.
    """

    user_id: str
    employee_number: Optional[str] = None

    # Personal
    date_of_birth: Optional[datetime] = None
    gender: Optional[Gender] = None
    personal_email: Optional[EmailStr] = None
    personal_phone: Optional[str] = None
    address: Optional[AddressSchema] = None
    emergency_contact: Optional[EmergencyContactSchema] = None

    # Employment
    employment_type: Optional[EmploymentType] = None
    joining_date: Optional[datetime] = None
    department_id: Optional[str] = None
    designation: Optional[str] = None
    reports_to: Optional[str] = None
    work_location: Optional[str] = None
    work_mode: Optional[EmployeeWorkMode] = None
    employment_status: EmploymentStatus = EmploymentStatus.ONBOARDING
    probation: Optional[ProbationSchema] = None
    exit_info: Optional[ExitInfoSchema] = None


class EmployeeProfileUpdate(BaseModel):
    """Partial update — only provided fields change."""

    model_config = ConfigDict(extra="ignore")

    employee_number: Optional[str] = None

    date_of_birth: Optional[datetime] = None
    gender: Optional[Gender] = None
    personal_email: Optional[EmailStr] = None
    personal_phone: Optional[str] = None
    address: Optional[AddressSchema] = None
    emergency_contact: Optional[EmergencyContactSchema] = None

    employment_type: Optional[EmploymentType] = None
    joining_date: Optional[datetime] = None
    department_id: Optional[str] = None
    designation: Optional[str] = None
    reports_to: Optional[str] = None
    work_location: Optional[str] = None
    work_mode: Optional[EmployeeWorkMode] = None
    employment_status: Optional[EmploymentStatus] = None
    probation: Optional[ProbationSchema] = None
    exit_info: Optional[ExitInfoSchema] = None


class EmployeeListItem(BaseModel):
    """Row DTO for the employee list endpoint."""

    id: str
    employee_number: Optional[str] = None
    user_id: str
    full_name: str
    email: str
    avatar: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation: Optional[str] = None
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
    employment_type: Optional[str] = None
    joining_date: Optional[datetime] = None
    employment_status: str
    work_mode: Optional[str] = None
    work_location: Optional[str] = None
    candidate_id: Optional[str] = None
    user_status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class EmployeeListResponse(BaseModel):
    """Pagination shape consistent with the rest of the repository."""

    items: list[EmployeeListItem]
    total: int
    page: int
    page_size: int
    has_next: bool


class EmployeeDetail(BaseModel):
    """Normalized employee detail DTO.

    Deliberately explicit — never derived from raw ``User`` serialization.
    Future-phase HR data (payroll, documents) is not exposed here.
    """

    id: str
    employee_number: Optional[str] = None
    user_id: str
    company_id: str
    candidate_id: Optional[str] = None

    # Identity (read from User — not duplicated in the profile)
    first_name: str
    last_name: str
    full_name: str
    email: str
    avatar: Optional[str] = None
    phone: Optional[str] = None
    user_status: str
    role: str

    # Personal
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None
    personal_email: Optional[str] = None
    personal_phone: Optional[str] = None
    address: Optional[AddressSchema] = None
    emergency_contact: Optional[EmergencyContactSchema] = None

    # Employment
    employment_type: Optional[str] = None
    joining_date: Optional[datetime] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation: Optional[str] = None
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
    work_location: Optional[str] = None
    work_mode: Optional[str] = None
    employment_status: str
    probation: Optional[ProbationSchema] = None
    exit_info: Optional[ExitInfoSchema] = None

    created_at: datetime
    updated_at: datetime

    # Capabilities for the acting user (drives UI edit affordances)
    can_edit: bool = False
