"""
Employee Detail Change Request — workflow model.

Managers, Leads, and Employees submit change requests for their own employee
profile fields.  Admin / SubAdmin may approve or reject.  One canonical
mutation service (``update_employee_details``) applies approved changes.

Conventions:
- ``company_id`` scoped; every query filtered.
- ``original_values`` captures snapshot *before* request for diff display.
- ``requested_changes`` stores only the fields the requester wants changed.
- Lifecycle-protected fields (employment_status, exit_info) are never accepted.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.core.clock import utc_now


class ChangeRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ChangeRequestType(str, Enum):
    """What kind of employee detail is being changed."""

    PERSONAL_INFO = "personal_info"
    CONTACT_INFO = "contact_info"
    EMPLOYMENT_INFO = "employment_info"
    EMERGENCY_CONTACT = "emergency_contact"


# ---------------------------------------------------------------------------
# Fields the requester is allowed to change via a change request.
# These match the ESS + HR editable field set minus lifecycle-protected fields.
# ---------------------------------------------------------------------------

CHANGEABLE_PROFILE_FIELDS: set = {
    "personal_email",
    "personal_phone",
    "address",
    "emergency_contact",
    "date_of_birth",
    "gender",
    "employment_type",
    "joining_date",
    "department_id",
    "designation",
    "reports_to",
    "work_location",
    "work_mode",
}

# Fields that the requester may change on the User model.
CHANGEABLE_USER_FIELDS: set = {
    "first_name",
    "last_name",
    "email",
    "phone",
}

# Fields that are *never* allowed through a change request.
# Lifecycle fields are managed by dedicated lifecycle endpoints.
PROTECTED_FIELDS: set = {
    "employment_status",
    "exit_info",
    "probation",
    "role",
    "status",
    "modules",
    "capability_grants",
    "company_id",
    "user_id",
    "employee_number",
    "candidate_id",
    "ancestors",
}


class EmployeeDetailChangeRequest(Document):
    """A pending/approved/rejected request to modify an employee profile."""

    company_id: Indexed(str)
    employee_id: Indexed(str)  # EmployeeProfile.id
    user_id: str  # EmployeeProfile.user_id

    # Who submitted
    requested_by: str  # User.id
    request_type: ChangeRequestType

    # Snapshot of values *before* this request was created.
    original_values: Dict[str, Any] = {}

    # The fields the requester wants changed (partial).
    requested_changes: Dict[str, Any] = {}

    # Classification of which fields changed.
    changed_fields: List[str] = []

    # Optional human-readable justification.
    reason: Optional[str] = None

    # Status lifecycle
    status: ChangeRequestStatus = ChangeRequestStatus.PENDING

    # Reviewer tracking
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_comment: Optional[str] = None

    # Rejection reason
    rejection_reason: Optional[str] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    class Settings:
        name = "employee_detail_change_requests"
        indexes = [
            # Fast queue lookups: pending requests for a company, newest first.
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("status", ASCENDING),
                    ("created_at", DESCENDING),
                ],
            ),
            # Employee's own request history.
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("employee_id", ASCENDING),
                    ("created_at", DESCENDING),
                ],
            ),
            # Pending requests for a specific employee (stale-data detection).
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("employee_id", ASCENDING),
                    ("status", ASCENDING),
                ],
            ),
            # Requester's own requests.
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("requested_by", ASCENDING),
                    ("created_at", DESCENDING),
                ],
            ),
        ]
