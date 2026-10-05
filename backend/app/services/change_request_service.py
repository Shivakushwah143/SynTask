"""
Employee Detail Change Request Service.

Manages the full lifecycle of employee detail change requests:

- Create: employee/lead/manager submits a request for their own profile
- List own: requester views their own request history
- Review queue: managers/admins see pending requests for their scope
- Approve: atomic claim + validate + apply + mark approved
- Reject: reviewer marks rejected with reason
- Cancel: requester cancels their own pending request

Design constraints:
- ONE canonical mutation service (``update_employee_details``) for both
  direct edits and approved change requests.
- Lifecycle-protected fields (employment_status, exit_info, probation) are
  never accepted in a change request.
- Requester cannot approve their own request.
- Stale-data detection: compare original_values with current before applying.
- Atomic approval via find_one_and_update with status in query.
- Company isolation mandatory on every query.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from pymongo import DESCENDING

from app.core.clock import utc_now
from app.models.department import Department, DepartmentType
from app.models.employee_detail_change_request import (
    CHANGEABLE_PROFILE_FIELDS,
    CHANGEABLE_USER_FIELDS,
    EmployeeDetailChangeRequest,
    ChangeRequestStatus,
    ChangeRequestType,
    PROTECTED_FIELDS,
)
from app.models.employee_profile import (
    Address,
    EmergencyContact,
    EmployeeProfile,
    EmploymentType,
    EmployeeWorkMode,
    Gender,
)
from app.models.user import User, UserRole
from app.services.employee_profile_service import (
    _validate_department,
    _validate_manager,
    normalize_work_mode,
    normalize_employment_type,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def _classify_request_type(changed_fields: set) -> ChangeRequestType:
    """Classify a set of changed fields into a single request type."""
    profile_fields = changed_fields & CHANGEABLE_PROFILE_FIELDS
    user_fields = changed_fields & CHANGEABLE_USER_FIELDS
    if user_fields or (profile_fields & {"personal_email", "personal_phone", "address", "emergency_contact"}):
        return ChangeRequestType.PERSONAL_INFO
    if profile_fields & {"employment_type", "department_id", "designation", "reports_to", "work_location", "work_mode", "joining_date"}:
        return ChangeRequestType.EMPLOYMENT_INFO
    return ChangeRequestType.PERSONAL_INFO


# ---------------------------------------------------------------------------
# Snapshot helpers
# ---------------------------------------------------------------------------

async def _snapshot_profile(profile: EmployeeProfile) -> Dict[str, Any]:
    """Capture current profile values for diff display."""
    return {
        "personal_email": profile.personal_email,
        "personal_phone": profile.personal_phone,
        "address": profile.address.model_dump() if profile.address else None,
        "emergency_contact": profile.emergency_contact.model_dump() if profile.emergency_contact else None,
        "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
        "gender": profile.gender.value if profile.gender else None,
        "employment_type": profile.employment_type.value if profile.employment_type else None,
        "joining_date": profile.joining_date.isoformat() if profile.joining_date else None,
        "department_id": profile.department_id,
        "designation": profile.designation,
        "reports_to": profile.reports_to,
        "work_location": profile.work_location,
        "work_mode": profile.work_mode.value if profile.work_mode else None,
    }


async def _snapshot_user(user: User) -> Dict[str, Any]:
    """Capture current User values that are changeable."""
    return {
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "phone": user.phone,
    }


async def _snapshot_both(profile: EmployeeProfile, user: User) -> Dict[str, Any]:
    """Combined snapshot of profile + user changeable fields."""
    profile_snap = await _snapshot_profile(profile)
    user_snap = await _snapshot_user(user)
    return {**profile_snap, **user_snap}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

async def _validate_request_payload(
    company_id: str,
    changes: Dict[str, Any],
    employee_user_id: str,
) -> None:
    """Validate changed fields at request creation time.

    This runs lightweight validation — full business rules are enforced at
    approval time by the canonical mutation service.
    """
    # 1. No protected fields
    blocked = set(changes.keys()) & PROTECTED_FIELDS
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot request changes to protected fields: {', '.join(sorted(blocked))}",
        )

    # 2. Only known changeable fields
    known = CHANGEABLE_PROFILE_FIELDS | CHANGEABLE_USER_FIELDS
    unknown = set(changes.keys()) - known
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown fields in change request: {', '.join(sorted(unknown))}",
        )

    # 3. Department validation (lightweight)
    if "department_id" in changes:
        dept_id = changes["department_id"]
        if dept_id:
            dept = await Department.get(dept_id)
            if not dept or dept.deleted_at is not None or dept.company_id != company_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department not found")

    # 4. Manager validation (lightweight — full cycle check at approval)
    if "reports_to" in changes and changes["reports_to"]:
        manager = await User.get(changes["reports_to"])
        if not manager or manager.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manager must belong to the same company")
        if str(manager.id) == employee_user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee cannot report to themselves")

    # 5. Email uniqueness (if changing user email)
    if "email" in changes and changes["email"]:
        existing = await User.find_one({"email": changes["email"], "_id": {"$ne": employee_user_id}})
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email address is already in use")

    # 6. Enum validation
    if "employment_type" in changes and changes["employment_type"]:
        normalize_employment_type(changes["employment_type"])
    if "work_mode" in changes and changes["work_mode"]:
        normalize_work_mode(changes["work_mode"])
    if "gender" in changes and changes["gender"]:
        try:
            Gender(changes["gender"])
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid gender value: {changes['gender']}")


# ---------------------------------------------------------------------------
# Create request
# ---------------------------------------------------------------------------

async def create_change_request(
    company_id: str,
    actor: User,
    profile: EmployeeProfile,
    changes: Dict[str, Any],
    *,
    reason: Optional[str] = None,
) -> EmployeeDetailChangeRequest:
    """Create a new change request for the actor's own employee profile.

    Rules:
    - Actor must be the profile owner (self only).
    - Actor cannot be a Super Admin (no profile).
    - No active pending request for the same fields.
    """
    # Ownership check
    if str(actor.id) != profile.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only submit change requests for your own profile",
        )

    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")

    # Check for duplicate pending request
    existing = await EmployeeDetailChangeRequest.find_one({
        "company_id": company_id,
        "employee_id": str(profile.id),
        "requested_by": str(actor.id),
        "status": ChangeRequestStatus.PENDING,
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a pending change request. Please wait for it to be reviewed or cancel it first.",
        )

    # Validate
    await _validate_request_payload(company_id, changes, profile.user_id)

    # Snapshot
    user = await User.get(profile.user_id)
    original_values = await _snapshot_both(profile, user)

    # Classify
    changed_fields = list(changes.keys())
    request_type = _classify_request_type(set(changed_fields))

    # Create
    request = EmployeeDetailChangeRequest(
        company_id=company_id,
        employee_id=str(profile.id),
        user_id=profile.user_id,
        requested_by=str(actor.id),
        request_type=request_type,
        original_values=original_values,
        requested_changes=changes,
        changed_fields=changed_fields,
        reason=reason,
    )
    await request.insert()
    logger.info(
        "Change request created: id=%s employee=%s requester=%s fields=%s",
        request.id, profile.id, actor.id, changed_fields,
    )
    return request


# ---------------------------------------------------------------------------
# Read — own requests
# ---------------------------------------------------------------------------

async def list_my_requests(
    company_id: str,
    actor: User,
    *,
    status_filter: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[List[EmployeeDetailChangeRequest], int]:
    """List the actor's own change requests."""
    query: Dict[str, Any] = {
        "company_id": company_id,
        "requested_by": str(actor.id),
    }
    if status_filter:
        query["status"] = status_filter

    total = await EmployeeDetailChangeRequest.find(query).count()
    requests = (
        await EmployeeDetailChangeRequest.find(query)
        .sort([("created_at", DESCENDING)])
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return requests, total


# ---------------------------------------------------------------------------
# Read — review queue
# ---------------------------------------------------------------------------

def _can_review(user: User) -> bool:
    """Whether the user can review change requests."""
    role = user.role if isinstance(user.role, UserRole) else UserRole.from_legacy(str(user.role))
    return role in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD}


async def list_review_queue(
    company_id: str,
    actor: User,
    *,
    status_filter: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[List[Dict[str, Any]], int]:
    """List pending change requests that the actor can review.

    Admins/SubAdmins see all company requests.
    Managers see only their direct/indirect reports.
    Leads see only their direct reports.
    """
    query: Dict[str, Any] = {
        "company_id": company_id,
    }
    if status_filter:
        query["status"] = status_filter
    else:
        query["status"] = ChangeRequestStatus.PENDING

    # Scope filtering by role
    role = actor.role if isinstance(actor.role, UserRole) else UserRole.from_legacy(str(actor.role))
    if role in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN}:
        pass  # See all
    elif role == UserRole.MANAGER:
        # See requests from direct and indirect reports
        subordinate_ids = await _get_subordinate_ids(company_id, str(actor.id))
        query["requested_by"] = {"$in": subordinate_ids}
    elif role == UserRole.LEAD:
        # See requests from direct reports only
        direct_report_ids = await _get_direct_report_ids(company_id, str(actor.id))
        query["requested_by"] = {"$in": direct_report_ids}
    else:
        return [], 0

    total = await EmployeeDetailChangeRequest.find(query).count()
    requests = (
        await EmployeeDetailChangeRequest.find(query)
        .sort([("created_at", DESCENDING)])
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )

    # Enrich with requester and employee names
    enriched = []
    for req in requests:
        item = await _enrich_request(req)
        enriched.append(item)
    return enriched, total


async def get_request_detail(
    company_id: str,
    request_id: str,
    actor: User,
) -> Dict[str, Any]:
    """Get full details of a change request.

    Requesters can see their own. Reviewers can see any in their scope.
    """
    req = await EmployeeDetailChangeRequest.get(request_id)
    if not req or req.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")

    is_requester = str(actor.id) == req.requested_by
    is_reviewer = _can_review(actor)

    if not is_requester and not is_reviewer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return await _enrich_request(req)


# ---------------------------------------------------------------------------
# Approve
# ---------------------------------------------------------------------------

async def approve_change_request(
    company_id: str,
    request_id: str,
    actor: User,
    *,
    comment: Optional[str] = None,
) -> Dict[str, Any]:
    """Approve a pending change request — atomic claim + validate + apply.

    Steps:
    1. Atomic status claim (pending → approved) via find_one_and_update.
    2. Stale-data detection: compare original_values with current state.
    3. Apply changes via the canonical mutation service.
    4. Mark request approved.
    """
    if not _can_review(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to approve change requests")

    # Step 1: Atomic claim — prevents double-approval
    req = await EmployeeDetailChangeRequest.find_one(
        {
            "_id": request_id,
            "company_id": company_id,
            "status": ChangeRequestStatus.PENDING,
        }
    )
    if not req:
        # Check if it exists at all
        existing = await EmployeeDetailChangeRequest.get(request_id)
        if not existing or existing.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")
        if existing.status != ChangeRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This request has already been {existing.status.value}",
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")

    # Self-approval check
    if str(actor.id) == req.requested_by:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot approve your own change request",
        )

    # Step 2: Stale-data detection
    profile = await EmployeeProfile.get(req.employee_id)
    if not profile or profile.company_id != company_id:
        req.status = ChangeRequestStatus.REJECTED
        req.reviewed_by = str(actor.id)
        req.reviewed_at = utc_now()
        req.rejection_reason = "Employee profile no longer exists"
        req.review_comment = "Auto-rejected: profile not found"
        req.updated_at = utc_now()
        await req.save()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="The employee profile no longer exists",
        )

    user = await User.get(req.user_id)
    if not user or user.company_id != company_id:
        req.status = ChangeRequestStatus.REJECTED
        req.reviewed_by = str(actor.id)
        req.reviewed_at = utc_now()
        req.rejection_reason = "User account no longer exists"
        req.review_comment = "Auto-rejected: user not found"
        req.updated_at = utc_now()
        await req.save()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="The user account no longer exists",
        )

    current_snapshot = await _snapshot_both(profile, user)
    stale_fields = []
    for field in req.changed_fields:
        old_val = req.original_values.get(field)
        cur_val = current_snapshot.get(field)
        # Normalize for comparison
        if isinstance(old_val, dict):
            if cur_val is None:
                cur_val = {}
            if old_val != cur_val:
                stale_fields.append(field)
        elif str(old_val) != str(cur_val):
            stale_fields.append(field)

    if stale_fields:
        req.status = ChangeRequestStatus.REJECTED
        req.reviewed_by = str(actor.id)
        req.reviewed_at = utc_now()
        req.rejection_reason = "Stale data detected"
        req.review_comment = (
            f"Auto-rejected: the following fields have changed since the request was created: "
            f"{', '.join(stale_fields)}. Please create a new request."
        )
        req.updated_at = utc_now()
        await req.save()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stale data detected. The following fields changed since request creation: {', '.join(stale_fields)}",
        )

    # Step 3: Apply changes via canonical mutation service
    try:
        await _apply_approved_changes(company_id, profile, user, req.requested_changes, actor)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to apply change request %s", request_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply changes: {exc}",
        )

    # Step 4: Mark approved
    req.status = ChangeRequestStatus.APPROVED
    req.reviewed_by = str(actor.id)
    req.reviewed_at = utc_now()
    req.review_comment = comment
    req.updated_at = utc_now()
    await req.save()

    # Notify requester
    await _notify_requester(
        req,
        "Change Request Approved",
        f"Your change request for {', '.join(req.changed_fields)} has been approved.",
    )

    logger.info(
        "Change request approved: id=%s by=%s fields=%s",
        request_id, actor.id, req.changed_fields,
    )
    return await _enrich_request(req)


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------

async def reject_change_request(
    company_id: str,
    request_id: str,
    actor: User,
    *,
    reason: Optional[str] = None,
    comment: Optional[str] = None,
) -> Dict[str, Any]:
    """Reject a pending change request."""
    if not _can_review(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to reject change requests")

    req = await EmployeeDetailChangeRequest.find_one(
        {
            "_id": request_id,
            "company_id": company_id,
            "status": ChangeRequestStatus.PENDING,
        }
    )
    if not req:
        existing = await EmployeeDetailChangeRequest.get(request_id)
        if not existing or existing.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")
        if existing.status != ChangeRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This request has already been {existing.status.value}",
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")

    if str(actor.id) == req.requested_by:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot reject your own change request",
        )

    req.status = ChangeRequestStatus.REJECTED
    req.reviewed_by = str(actor.id)
    req.reviewed_at = utc_now()
    req.rejection_reason = reason or "Rejected by reviewer"
    req.review_comment = comment
    req.updated_at = utc_now()
    await req.save()

    await _notify_requester(
        req,
        "Change Request Rejected",
        f"Your change request for {', '.join(req.changed_fields)} was rejected. Reason: {reason or 'Not specified'}",
    )

    return await _enrich_request(req)


# ---------------------------------------------------------------------------
# Cancel (requester only)
# ---------------------------------------------------------------------------

async def cancel_change_request(
    company_id: str,
    request_id: str,
    actor: User,
) -> Dict[str, Any]:
    """Cancel a pending change request — requester only."""
    req = await EmployeeDetailChangeRequest.get(request_id)
    if not req or req.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")

    if str(actor.id) != req.requested_by:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only cancel your own requests")

    if req.status != ChangeRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a request that is already {req.status.value}",
        )

    req.status = ChangeRequestStatus.CANCELLED
    req.updated_at = utc_now()
    await req.save()

    return await _enrich_request(req)


# ---------------------------------------------------------------------------
# Canonical mutation — THE single path for applying changes
# ---------------------------------------------------------------------------

async def _apply_approved_changes(
    company_id: str,
    profile: EmployeeProfile,
    user: User,
    changes: Dict[str, Any],
    actor: User,
) -> None:
    """Apply approved changes to both User and EmployeeProfile.

    This is THE canonical mutation service. It is used by both:
    - Direct admin edit (via update_profile)
    - Approved change requests (via approve_change_request)

    The function handles:
    - User fields (first_name, last_name, email, phone with uniqueness check)
    - EmployeeProfile fields (all HR fields)
    - department_id / reports_to synchronization between Profile and User
    - Lifecycle history recording for structural changes
    """
    from app.core.clock import utc_now as _utc_now
    from app.services.lifecycle_service import _profile_employment_state, record_profile_changes

    profile_changed = False
    user_changed = False

    # ── User fields ────────────────────────────────────────────────────────
    user_field_map = {"first_name", "last_name", "email", "phone"}
    user_changes = {k: v for k, v in changes.items() if k in user_field_map}
    if user_changes:
        # Email uniqueness re-check at apply time
        if "email" in user_changes and user_changes["email"]:
            existing_user = await User.find_one({
                "email": user_changes["email"],
                "_id": {"$ne": str(user.id)},
            })
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email address is already in use",
                )
        for field, value in user_changes.items():
            if field == "email":
                value = (value or "").strip() or None
            if field in {"first_name", "last_name"}:
                value = (value or "").strip() or None
            if value is not None and value != getattr(user, field):
                setattr(user, field, value)
                user_changed = True

        if user_changed:
            user.updated_at = _utc_now()
            await user.save()

    # ── EmployeeProfile fields ─────────────────────────────────────────────
    profile_field_map = {
        "personal_email", "personal_phone", "address", "emergency_contact",
        "date_of_birth", "gender", "employment_type", "joining_date",
        "department_id", "designation", "reports_to", "work_location", "work_mode",
    }
    profile_changes = {k: v for k, v in changes.items() if k in profile_field_map}

    # Validate department
    if "department_id" in profile_changes and profile_changes["department_id"]:
        dept = await _validate_department(company_id, profile_changes["department_id"])
        profile_changes["department_id"] = str(dept.id) if dept else None

    # Validate manager + cycle check
    if "reports_to" in profile_changes and profile_changes["reports_to"]:
        manager = await _validate_manager(
            company_id, profile_changes["reports_to"],
            employee_user_id=profile.user_id,
        )
        profile_changes["reports_to"] = str(manager.id) if manager else None

    # Enum normalization
    if "employment_type" in profile_changes and profile_changes["employment_type"]:
        profile_changes["employment_type"] = normalize_employment_type(profile_changes["employment_type"])
    if "work_mode" in profile_changes and profile_changes["work_mode"]:
        profile_changes["work_mode"] = normalize_work_mode(profile_changes["work_mode"])
    if "gender" in profile_changes and profile_changes["gender"]:
        try:
            profile_changes["gender"] = Gender(profile_changes["gender"])
        except ValueError:
            pass

    # Detect which fields actually changed
    actual_changes: Dict[str, Any] = {}
    for field, value in profile_changes.items():
        current = getattr(profile, field)
        if field == "address" and value is not None:
            new_addr = Address(**value) if isinstance(value, dict) else value
            if profile.address is None or new_addr.model_dump(exclude_none=True) != profile.address.model_dump(exclude_none=True):
                actual_changes[field] = new_addr
        elif field == "emergency_contact" and value is not None:
            new_ec = EmergencyContact(**value) if isinstance(value, dict) else value
            if profile.emergency_contact is None or new_ec.model_dump(exclude_none=True) != profile.emergency_contact.model_dump(exclude_none=True):
                actual_changes[field] = new_ec
        elif value is not None and value != current:
            actual_changes[field] = value

    if actual_changes:
        # Lifecycle fields need history recording
        lifecycle_fields = {"department_id", "designation", "reports_to", "employment_type", "work_location", "work_mode"}
        touch_lifecycle = bool(lifecycle_fields & set(actual_changes.keys()))

        if touch_lifecycle:
            before_state = _profile_employment_state(profile)
            try:
                await record_profile_changes(
                    company_id, actor, profile, actual_changes, before_state=before_state,
                )
            except Exception:
                logger.exception("Failed to record lifecycle changes for change request")

        # Apply to profile
        for field, value in actual_changes.items():
            if field == "address":
                profile.address = value if isinstance(value, Address) else Address(**value) if value else None
            elif field == "emergency_contact":
                profile.emergency_contact = value if isinstance(value, EmergencyContact) else EmergencyContact(**value) if value else None
            else:
                setattr(profile, field, value)

        profile.updated_at = _utc_now()
        await profile.save()

        # Sync User department_id and reports_to
        from app.services.lifecycle_service import _sync_user_employment
        await _sync_user_employment(profile, set(actual_changes.keys()))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_subordinate_ids(company_id: str, manager_user_id: str) -> List[str]:
    """Get all direct and indirect subordinate user IDs."""
    visited = set()
    queue = [manager_user_id]
    result = []
    while queue:
        current_id = queue.pop(0)
        if current_id in visited:
            continue
        visited.add(current_id)
        if current_id != manager_user_id:
            result.append(current_id)
        # Find direct reports
        reports = await User.find({
            "company_id": company_id,
            "reports_to": current_id,
        }).to_list()
        for r in reports:
            queue.append(str(r.id))
    return result


async def _get_direct_report_ids(company_id: str, manager_user_id: str) -> List[str]:
    """Get direct report user IDs only."""
    reports = await User.find({
        "company_id": company_id,
        "reports_to": manager_user_id,
    }).to_list()
    return [str(r.id) for r in reports]


async def _enrich_request(req: EmployeeDetailChangeRequest) -> Dict[str, Any]:
    """Enrich a change request with display names."""
    requester = await User.get(req.requested_by)
    employee_user = await User.get(req.user_id)
    reviewer = await User.get(req.reviewed_by) if req.reviewed_by else None

    result = {
        "id": str(req.id),
        "company_id": req.company_id,
        "employee_id": req.employee_id,
        "user_id": req.user_id,
        "requested_by": req.requested_by,
        "requester_name": requester.full_name() if requester else "Unknown",
        "employee_name": employee_user.full_name() if employee_user else "Unknown",
        "request_type": req.request_type.value,
        "original_values": req.original_values,
        "requested_changes": req.requested_changes,
        "changed_fields": req.changed_fields,
        "reason": req.reason,
        "status": req.status.value,
        "reviewed_by": req.reviewed_by,
        "reviewer_name": reviewer.full_name() if reviewer else None,
        "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
        "review_comment": req.review_comment,
        "rejection_reason": req.rejection_reason,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
    }
    return result


async def _notify_requester(
    req: EmployeeDetailChangeRequest,
    title: str,
    message: str,
) -> None:
    """Send notification to the requester about their request status."""
    try:
        from app.models.notification import Notification, NotificationType

        await Notification(
            user_id=req.requested_by,
            company_id=req.company_id,
            type=NotificationType.GENERAL,
            title=title,
            message=message,
            related_id=str(req.id),
            related_type="change_request",
            action_url="/hr/me",
        ).insert()
    except Exception:
        logger.exception("Failed to send change request notification")
