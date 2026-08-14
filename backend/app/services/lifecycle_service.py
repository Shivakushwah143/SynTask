"""
Employee Lifecycle Service — Phase 9.

Phase 9 turns the EmployeeProfile's mutable employment fields into a
controlled, effective-dated, fully-audited lifecycle:

    EmployeeProfile           = current effective employment state
    EmployeeLifecycleEvent    = how the employee reached that state

Central invariants:

- **No silent overwrites** — every lifecycle-sensitive change records a
  before/after snapshot event. History is never reconstructed from current
  records.
- **Effective dates** — ``effective_date`` may be today (applied immediately),
  in the future (stored ``UPCOMING`` and applied safely when due via
  ``apply_due_lifecycle_events``), or backdated (allowed for HR ``manage``,
  audited; processed Payroll snapshots are never touched).
- **Separations never instantly exit** — resignation submission changes no
  employment status; accept starts the notice period; a separate exit action
  marks the employee EXITED.
- **Salary is never stored in lifecycle events** — promotion may optionally
  trigger a Phase 5 Salary Revision through ``create_salary_revision``; the
  salary structure remains the single source of salary truth.
- **Company isolation** — every operation validates the employee, department,
  and manager against the actor's company. Identifiers from the frontend are
  never trusted.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.models.department import Department
from app.models.employee_profile import (
    EmployeeProfile,
    EmploymentStatus,
    EmploymentType,
    EmployeeWorkMode,
    ExitInfo,
    ProbationInfo,
)
from app.models.lifecycle import (
    DEFAULT_OFFBOARDING_ITEMS,
    EmployeeLifecycleEvent,
    EmployeeOffboarding,
    EmployeeSeparationRequest,
    LifecycleEventSource,
    LifecycleEventStatus,
    LifecycleEventType,
    OffboardingItem,
    SeparationStatus,
    SeparationType,
)
from app.models.notification import Notification, NotificationType
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole, UserStatus
from app.services.timeline_service import create_timeline_event

logger = logging.getLogger(__name__)

# =============================================================================
# Company-scoped helpers
# =============================================================================


async def _require_profile(company_id: str, employee_id: str) -> EmployeeProfile:
    profile = await EmployeeProfile.get(employee_id)
    if not profile or profile.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return profile


async def _require_user(company_id: str, user_id: str) -> User:
    user = await User.get(user_id)
    if not user or user.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def _validate_department(company_id: str, department_id: Optional[str]) -> Optional[Department]:
    if not department_id:
        return None
    department = await Department.get(department_id)
    if not department or department.deleted_at is not None or department.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department not found")
    return department


async def _validate_manager(
    company_id: str,
    manager_id: Optional[str],
    *,
    employee_user_id: str,
) -> Optional[User]:
    if not manager_id:
        return None
    manager = await User.get(manager_id)
    if not manager or manager.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manager must belong to the same company")
    if str(manager.id) == str(employee_user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee cannot report to themselves")
    await _assert_no_reporting_cycle(employee_user_id, manager_id, company_id)
    return manager


async def _assert_no_reporting_cycle(employee_user_id: str, manager_user_id: str, company_id: str) -> None:
    """Walk the proposed manager's chain — if it ever reaches the employee, reject."""
    visited: set[str] = set()
    current: Optional[str] = manager_user_id
    while current:
        if current == employee_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The selected reporting manager would create an invalid reporting hierarchy.",
            )
        if current in visited:
            break
        visited.add(current)
        manager = await User.get(current)
        if not manager or manager.company_id != company_id:
            break
        current = manager.reports_to
    # Also verify the employee is not currently an ancestor of the new manager
    # via the denormalized ancestors chain on the manager's User record.
    manager_user = await User.get(manager_user_id)
    if manager_user and employee_user_id in (manager_user.ancestors or []):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected reporting manager would create an invalid reporting hierarchy.",
        )


def _profile_employment_state(profile: EmployeeProfile) -> dict:
    """Snapshot of all lifecycle-relevant employment fields."""
    return {
        "employment_status": profile.employment_status.value,
        "employment_type": profile.employment_type.value if profile.employment_type else None,
        "department_id": profile.department_id,
        "designation": profile.designation,
        "reports_to": profile.reports_to,
        "work_location": profile.work_location,
        "work_mode": profile.work_mode.value if profile.work_mode else None,
        "joining_date": profile.joining_date.isoformat() if profile.joining_date else None,
        "probation": profile.probation.model_dump() if profile.probation else None,
        "exit_info": profile.exit_info.model_dump() if profile.exit_info else None,
    }


def _parse_effective_date(value: Any) -> datetime:
    if value is None:
        return utc_now()
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(str(value), "%Y-%m-%d")
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="effective_date must be a valid date (YYYY-MM-DD or ISO datetime).",
            )


def _is_future(effective_date: datetime) -> bool:
    return effective_date.date() > utc_now().date()


# =============================================================================
# State transitions
# =============================================================================

# Employment statuses that count as "actively employed" for structural changes.
_ACTIVE_STATUSES = {
    EmploymentStatus.ONBOARDING,
    EmploymentStatus.PROBATION,
    EmploymentStatus.ACTIVE,
    EmploymentStatus.NOTICE_PERIOD,
}

# Confirmation requires an active (non-exited) employee who is not already confirmed.
# Promotion / transfer / manager / type / location changes require non-exited status.


def _require_not_exited(profile: EmployeeProfile, action: str) -> None:
    if profile.employment_status == EmploymentStatus.EXITED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This employee has already exited the company and cannot be {action}.",
        )


async def _ensure_no_conflicting_upcoming(company_id: str, employee_id: str, event_type: LifecycleEventType) -> None:
    """One UPCOMING event per type; an UPCOMING exit/termination blocks new structural changes."""
    conflicts = {
        LifecycleEventType.DEPARTMENT_TRANSFERRED,
        LifecycleEventType.PROMOTED,
        LifecycleEventType.DESIGNATION_CHANGED,
        LifecycleEventType.MANAGER_CHANGED,
        LifecycleEventType.EMPLOYMENT_TYPE_CHANGED,
        LifecycleEventType.WORK_LOCATION_CHANGED,
        LifecycleEventType.WORK_MODE_CHANGED,
        LifecycleEventType.CONFIRMED,
    }
    existing = await EmployeeLifecycleEvent.find_one(
        {
            "company_id": company_id,
            "employee_id": employee_id,
            "status": LifecycleEventStatus.UPCOMING.value,
            "event_type": event_type.value,
        }
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A future-dated lifecycle change of this type already exists for this employee.",
        )
    if event_type in conflicts:
        blocking = await EmployeeLifecycleEvent.find_one(
            {
                "company_id": company_id,
                "employee_id": employee_id,
                "status": LifecycleEventStatus.UPCOMING.value,
                "event_type": {
                    "$in": [
                        LifecycleEventType.EXITED.value,
                        LifecycleEventType.TERMINATED.value,
                    ]
                },
            }
        )
        if blocking:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A future-dated exit is already scheduled for this employee and conflicts with this request.",
            )


# =============================================================================
# Event recording
# =============================================================================


async def _record_event(
    company_id: str,
    profile: EmployeeProfile,
    event_type: LifecycleEventType,
    previous_state: dict,
    new_state: dict,
    *,
    effective_date: datetime,
    reason: Optional[str] = None,
    notes: Optional[str] = None,
    source: LifecycleEventSource = LifecycleEventSource.MANUAL,
    source_reference_id: Optional[str] = None,
    initiated_by: Optional[str] = None,
    status_value: LifecycleEventStatus = LifecycleEventStatus.APPLIED,
) -> EmployeeLifecycleEvent:
    event = EmployeeLifecycleEvent(
        company_id=company_id,
        employee_id=str(profile.id),
        user_id=profile.user_id,
        event_type=event_type,
        status=status_value,
        effective_date=effective_date,
        applied_at=utc_now() if status_value == LifecycleEventStatus.APPLIED else None,
        previous_state=previous_state,
        new_state=new_state,
        reason=reason,
        notes=notes,
        source=source,
        source_reference_id=source_reference_id,
        initiated_by=initiated_by,
    )
    await event.insert()
    await _emit_timeline_event(company_id, profile, event, actor_id=initiated_by)
    return event


async def _emit_timeline_event(
    company_id: str,
    profile: EmployeeProfile,
    event: EmployeeLifecycleEvent,
    *,
    actor_id: Optional[str] = None,
) -> None:
    mapping = {
        LifecycleEventType.JOINED: (TimelineEventType.LIFECYCLE_JOINED, "Joined"),
        LifecycleEventType.CONFIRMED: (TimelineEventType.LIFECYCLE_CONFIRMED, "Employment Confirmed"),
        LifecycleEventType.PROMOTED: (TimelineEventType.LIFECYCLE_PROMOTED, "Promoted"),
        LifecycleEventType.DEPARTMENT_TRANSFERRED: (TimelineEventType.LIFECYCLE_TRANSFERRED, "Department Transfer"),
        LifecycleEventType.MANAGER_CHANGED: (TimelineEventType.LIFECYCLE_MANAGER_CHANGED, "Manager Changed"),
        LifecycleEventType.EMPLOYMENT_TYPE_CHANGED: (TimelineEventType.LIFECYCLE_EMPLOYMENT_TYPE_CHANGED, "Employment Type Changed"),
        LifecycleEventType.RESIGNATION_SUBMITTED: (TimelineEventType.LIFECYCLE_RESIGNATION_SUBMITTED, "Resignation Submitted"),
        LifecycleEventType.RESIGNATION_WITHDRAWN: (TimelineEventType.LIFECYCLE_RESIGNATION_WITHDRAWN, "Resignation Withdrawn"),
        LifecycleEventType.RESIGNATION_ACCEPTED: (TimelineEventType.LIFECYCLE_RESIGNATION_ACCEPTED, "Resignation Accepted"),
        LifecycleEventType.RESIGNATION_REJECTED: (TimelineEventType.LIFECYCLE_RESIGNATION_REJECTED, "Resignation Rejected"),
        LifecycleEventType.TERMINATED: (TimelineEventType.LIFECYCLE_TERMINATED, "Terminated"),
        LifecycleEventType.EXITED: (TimelineEventType.LIFECYCLE_EXITED, "Exited"),
    }
    timeline_type, title = mapping.get(event.event_type, (TimelineEventType.LIFECYCLE_JOINED, "Lifecycle Update"))
    description = _describe_event(event)
    try:
        await create_timeline_event(
            user_id=profile.user_id,
            company_id=company_id,
            event_type=timeline_type,
            title=title,
            description=description,
            related_module=TimelineModule.LIFECYCLE,
            related_record_id=str(event.id),
            actor_id=actor_id,
            timestamp=event.created_at,
            metadata={
                "event_type": event.event_type.value,
                "effective_date": event.effective_date.isoformat(),
                "status": event.status.value,
            },
            idempotency_key=f"lifecycle:{event.id}",
        )
    except Exception:
        logger.exception("Failed to publish lifecycle timeline event")


def _describe_event(event: EmployeeLifecycleEvent) -> Optional[str]:
    before = event.previous_state or {}
    after = event.new_state or {}
    if event.event_type == LifecycleEventType.PROMOTED:
        return f"{before.get('designation') or '—'} → {after.get('designation') or '—'}"
    if event.event_type == LifecycleEventType.DEPARTMENT_TRANSFERRED:
        return f"{before.get('department_id') or '—'} → {after.get('department_id') or '—'}"
    if event.event_type == LifecycleEventType.MANAGER_CHANGED:
        return f"{before.get('reports_to') or '—'} → {after.get('reports_to') or '—'}"
    if event.event_type == LifecycleEventType.EMPLOYMENT_TYPE_CHANGED:
        return f"{before.get('employment_type') or '—'} → {after.get('employment_type') or '—'}"
    return None


# =============================================================================
# Notifications
# =============================================================================


async def _notify_user(
    user_id: str,
    company_id: Optional[str],
    notification_type: NotificationType,
    title: str,
    message: str,
    related_id: Optional[str] = None,
    action_url: Optional[str] = None,
) -> None:
    try:
        await Notification(
            user_id=user_id,
            company_id=company_id,
            type=notification_type,
            title=title,
            message=message,
            related_id=related_id,
            related_type="lifecycle",
            action_url=action_url or "/hr/employees",
        ).insert()
    except Exception:
        logger.exception("Failed to create lifecycle notification")


async def _notify_hr_separation(company_id: str, title: str, message: str, related_id: Optional[str] = None) -> None:
    """Notify company admins + HR department staff about a separation request."""
    if not company_id:
        return
    admins = await User.find(
        {"company_id": company_id, "role": {"$in": [UserRole.ADMIN.value, UserRole.SUB_ADMIN.value]}}
    ).to_list()
    hr_users = await User.find({"company_id": company_id, "department_id": {"$ne": None}}).to_list()
    from app.models.department import DepartmentType

    hr_ids = set()
    for user in hr_users:
        department = await Department.get(user.department_id)
        if department and department.company_id == company_id and department.deleted_at is None:
            if department.department_type == DepartmentType.HR:
                hr_ids.add(str(user.id))
    for admin in admins:
        hr_ids.add(str(admin.id))
    for user_id in hr_ids:
        await _notify_user(
            user_id,
            company_id,
            NotificationType.LIFECYCLE_RESIGNATION_SUBMITTED,
            title,
            message,
            related_id=related_id,
            action_url="/hr/employees",
        )


# =============================================================================
# Core apply mechanism
# =============================================================================


async def _apply_event_to_profile(
    company_id: str,
    profile: EmployeeProfile,
    event: EmployeeLifecycleEvent,
) -> None:
    """Apply an event's new_state to the EmployeeProfile (used for future events)."""
    new_state = event.new_state or {}
    # Keep a fresh before-snapshot (honest history at application time).
    before = _profile_employment_state(profile)

    profile.employment_status = EmploymentStatus(new_state.get("employment_status", profile.employment_status.value))
    if new_state.get("employment_type"):
        profile.employment_type = EmploymentType(new_state["employment_type"])
    if new_state.get("department_id") is not None:
        profile.department_id = new_state["department_id"]
    if new_state.get("designation") is not None:
        profile.designation = new_state["designation"]
    if new_state.get("reports_to") is not None:
        profile.reports_to = new_state["reports_to"]
    if new_state.get("work_location") is not None:
        profile.work_location = new_state["work_location"]
    if new_state.get("work_mode"):
        profile.work_mode = EmployeeWorkMode(new_state["work_mode"])
    if new_state.get("joining_date"):
        profile.joining_date = _parse_effective_date(new_state["joining_date"])
    if new_state.get("probation") is not None:
        profile.probation = ProbationInfo(**new_state["probation"])
    if new_state.get("exit_info") is not None:
        profile.exit_info = ExitInfo(**new_state["exit_info"])

    profile.updated_at = utc_now()
    await profile.save()
    await _sync_user_employment(profile, changed_fields=set(new_state.keys()))

    event.previous_state = before
    event.new_state = _profile_employment_state(profile)
    event.status = LifecycleEventStatus.APPLIED
    event.applied_at = utc_now()
    event.updated_at = utc_now()
    await event.save()
    await _emit_timeline_event(company_id, profile, event, actor_id=event.initiated_by)


async def _sync_user_employment(profile: EmployeeProfile, changed_fields: set) -> None:
    """Keep the platform ``User`` reporting/department fields consistent (not permission changes)."""
    if not changed_fields:
        return
    try:
        user = await User.get(profile.user_id)
        if not user:
            return
        if "reports_to" in changed_fields and profile.reports_to != user.reports_to:
            user.reports_to = profile.reports_to
        if "department_id" in changed_fields and profile.department_id != user.department_id:
            user.department_id = profile.department_id
        user.updated_at = utc_now()
        await user.save()
    except Exception:
        logger.exception("Failed to sync User employment fields for profile %s", profile.id)


# =============================================================================
# Apply due future events
# =============================================================================


async def apply_due_lifecycle_events(company_id: str, employee_id: str) -> List[EmployeeLifecycleEvent]:
    """Apply all UPCOMING events whose effective_date has arrived.

    This is the safe future-event strategy: no fragile scheduler. Whenever the
    lifecycle/current profile is accessed, due changes are applied in effective
    date order so current state always reflects reality.
    """
    profile = await _require_profile(company_id, employee_id)
    now = utc_now()
    due = (
        await EmployeeLifecycleEvent.find(
            {
                "company_id": company_id,
                "employee_id": employee_id,
                "status": LifecycleEventStatus.UPCOMING.value,
                "effective_date": {"$lte": now},
            }
        )
        .sort("effective_date")
        .to_list()
    )
    applied: List[EmployeeLifecycleEvent] = []
    for event in due:
        if profile.employment_status == EmploymentStatus.EXITED and event.event_type not in {
            LifecycleEventType.EXITED,
            LifecycleEventType.TERMINATED,
        }:
            # Exited already — cancel remaining future structural events.
            event.status = LifecycleEventStatus.CANCELLED
            event.updated_at = utc_now()
            await event.save()
            continue
        await _apply_event_to_profile(company_id, profile, event)
        applied.append(event)
    return applied


async def ensure_no_due_conflicts(company_id: str, employee_id: str) -> None:
    await apply_due_lifecycle_events(company_id, employee_id)


# =============================================================================
# Confirmation / probation
# =============================================================================


async def confirm_employee(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
) -> dict:
    """Confirm an employee (probation → active). Idempotent-safe."""
    profile = await _require_profile(company_id, employee_id)
    await apply_due_lifecycle_events(company_id, employee_id)

    if profile.employment_status == EmploymentStatus.EXITED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This employee has already exited the company.")
    already_confirmed = (
        profile.probation
        and profile.probation.confirmation_date is not None
    ) or await EmployeeLifecycleEvent.find_one(
        {
            "company_id": company_id,
            "employee_id": employee_id,
            "event_type": LifecycleEventType.CONFIRMED.value,
            "status": LifecycleEventStatus.APPLIED.value,
        }
    )
    if already_confirmed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This employee is already confirmed.")

    effective_date = _parse_effective_date(payload.get("effective_date") or payload.get("confirmation_date"))
    notes = payload.get("notes")
    reason = payload.get("reason", "Employment confirmed")

    before = _profile_employment_state(profile)
    new_state = dict(before)
    confirmation_date = _parse_effective_date(payload.get("confirmation_date")) or effective_date
    probation = profile.probation or ProbationInfo()
    probation.applicable = True
    probation.confirmation_date = confirmation_date
    new_state["probation"] = probation.model_dump()
    new_state["employment_status"] = EmploymentStatus.ACTIVE.value

    if _is_future(effective_date):
        await _ensure_no_conflicting_upcoming(company_id, employee_id, LifecycleEventType.CONFIRMED)
        event = await _record_event(
            company_id,
            profile,
            LifecycleEventType.CONFIRMED,
            before,
            new_state,
            effective_date=effective_date,
            reason=reason,
            notes=notes,
            initiated_by=str(actor.id),
            status_value=LifecycleEventStatus.UPCOMING,
        )
    else:
        profile.probation = ProbationInfo(**new_state["probation"])
        profile.employment_status = EmploymentStatus.ACTIVE
        profile.updated_at = utc_now()
        await profile.save()
        event = await _record_event(
            company_id,
            profile,
            LifecycleEventType.CONFIRMED,
            before,
            _profile_employment_state(profile),
            effective_date=effective_date,
            reason=reason,
            notes=notes,
            initiated_by=str(actor.id),
        )

    await _notify_user(
        profile.user_id,
        company_id,
        NotificationType.LIFECYCLE_CONFIRMED,
        "Employment Confirmed",
        "Your employment has been confirmed.",
        related_id=str(event.id),
        action_url="/hr/me",
    )
    return {"event": await serialize_event(event, actor=actor), "employment_status": profile.employment_status.value}


async def extend_probation(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
) -> dict:
    """Extend probation — records a PROBATION_EXTENDED event with history."""
    profile = await _require_profile(company_id, employee_id)
    _require_not_exited(profile, "updated")
    new_end = _parse_effective_date(payload.get("new_probation_end") or payload.get("probation_end"))
    reason = payload.get("reason", "Probation extended")
    notes = payload.get("notes")

    before = _profile_employment_state(profile)
    probation = profile.probation or ProbationInfo()
    probation.applicable = True
    probation.end_date = new_end
    new_state = dict(before)
    new_state["probation"] = probation.model_dump()

    profile.probation = probation
    profile.updated_at = utc_now()
    await profile.save()
    event = await _record_event(
        company_id,
        profile,
        LifecycleEventType.PROBATION_EXTENDED,
        before,
        _profile_employment_state(profile),
        effective_date=new_end,
        reason=reason,
        notes=notes,
        initiated_by=str(actor.id),
    )
    return {"event": await serialize_event(event, actor=actor)}


# =============================================================================
# Promotion / designation / department / manager / type / location
# =============================================================================


async def promote_employee(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
    *,
    can_manage_salary: bool = False,
) -> dict:
    """Promote an employee: new designation (+ optional department, optional salary revision)."""
    profile = await _require_profile(company_id, employee_id)
    await apply_due_lifecycle_events(company_id, employee_id)
    _require_not_exited(profile, "promoted")

    new_designation = (payload.get("new_designation") or "").strip()
    if not new_designation:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New designation is required.")
    if new_designation == profile.designation and not payload.get("department_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New designation must differ from the current designation.",
        )

    new_department = await _validate_department(company_id, payload.get("department_id"))
    effective_date = _parse_effective_date(payload.get("effective_date"))
    reason = payload.get("reason", "Promotion")
    notes = payload.get("notes")

    before = _profile_employment_state(profile)
    new_state = dict(before)
    new_state["designation"] = new_designation
    if new_department:
        new_state["department_id"] = str(new_department.id)

    # Optional salary revision — delegated to Phase 5 service, never stored in the event.
    salary_revision = None
    if payload.get("create_salary_revision") and can_manage_salary:
        from app.services.salary_structure_service import create_salary_revision

        revision_payload = {
            "effective_from": effective_date.strftime("%Y-%m-%d"),
            "currency": payload.get("currency", "INR"),
            "pay_frequency": payload.get("pay_frequency", "monthly"),
            "items": payload.get("salary_items") or [],
            "notes": payload.get("salary_notes") or notes,
        }
        try:
            salary_revision = await create_salary_revision(company_id, profile.user_id, actor, revision_payload)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Salary revision could not be created: {exc}",
            )

    if _is_future(effective_date):
        await _ensure_no_conflicting_upcoming(company_id, employee_id, LifecycleEventType.PROMOTED)
        event = await _record_event(
            company_id,
            profile,
            LifecycleEventType.PROMOTED,
            before,
            new_state,
            effective_date=effective_date,
            reason=reason,
            notes=notes,
            initiated_by=str(actor.id),
            status_value=LifecycleEventStatus.UPCOMING,
        )
    else:
        profile.designation = new_designation
        if new_department:
            profile.department_id = str(new_department.id)
        profile.updated_at = utc_now()
        await profile.save()
        await _sync_user_employment(profile, {"designation", "department_id"})
        event = await _record_event(
            company_id,
            profile,
            LifecycleEventType.PROMOTED,
            before,
            _profile_employment_state(profile),
            effective_date=effective_date,
            reason=reason,
            notes=notes,
            initiated_by=str(actor.id),
        )

    await _notify_user(
        profile.user_id,
        company_id,
        NotificationType.LIFECYCLE_PROMOTED,
        "You Were Promoted",
        f"Your designation is now {new_designation}.",
        related_id=str(event.id),
        action_url="/hr/me",
    )
    result: dict = {
        "event": await serialize_event(event, actor=actor),
        "designation": profile.designation,
    }
    if salary_revision:
        from app.services.salary_structure_service import serialize_structure

        result["salary_revision"] = serialize_structure(salary_revision)
    return result


async def change_designation(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
) -> dict:
    """Designation change without promotion semantics."""
    profile = await _require_profile(company_id, employee_id)
    _require_not_exited(profile, "updated")
    new_designation = (payload.get("new_designation") or "").strip()
    if not new_designation:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New designation is required.")
    if new_designation == profile.designation:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New designation must differ from the current designation.")
    effective_date = _parse_effective_date(payload.get("effective_date"))
    before = _profile_employment_state(profile)
    new_state = dict(before)
    new_state["designation"] = new_designation

    if _is_future(effective_date):
        await _ensure_no_conflicting_upcoming(company_id, employee_id, LifecycleEventType.DESIGNATION_CHANGED)
        event = await _record_event(
            company_id, profile, LifecycleEventType.DESIGNATION_CHANGED, before, new_state,
            effective_date=effective_date, reason=payload.get("reason", "Designation change"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
            status_value=LifecycleEventStatus.UPCOMING,
        )
    else:
        profile.designation = new_designation
        profile.updated_at = utc_now()
        await profile.save()
        event = await _record_event(
            company_id, profile, LifecycleEventType.DESIGNATION_CHANGED, before,
            _profile_employment_state(profile),
            effective_date=effective_date, reason=payload.get("reason", "Designation change"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
        )
    return {"event": await serialize_event(event, actor=actor), "designation": profile.designation}


async def transfer_employee(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
) -> dict:
    """Department transfer (+ optional new manager)."""
    profile = await _require_profile(company_id, employee_id)
    await apply_due_lifecycle_events(company_id, employee_id)
    _require_not_exited(profile, "transferred")

    new_department = await _validate_department(company_id, payload.get("new_department_id") or payload.get("department_id"))
    if not new_department:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New department is required.")
    if str(new_department.id) == profile.department_id and not payload.get("new_manager_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New department must differ from the current department.",
        )

    new_manager = None
    if payload.get("new_manager_id"):
        new_manager = await _validate_manager(
            company_id, payload["new_manager_id"], employee_user_id=profile.user_id
        )
        if str(new_manager.id) == profile.reports_to:
            new_manager = None  # no-op manager — keep current

    effective_date = _parse_effective_date(payload.get("effective_date"))
    before = _profile_employment_state(profile)
    new_state = dict(before)
    new_state["department_id"] = str(new_department.id)
    if new_manager:
        new_state["reports_to"] = str(new_manager.id)

    if _is_future(effective_date):
        await _ensure_no_conflicting_upcoming(company_id, employee_id, LifecycleEventType.DEPARTMENT_TRANSFERRED)
        event = await _record_event(
            company_id, profile, LifecycleEventType.DEPARTMENT_TRANSFERRED, before, new_state,
            effective_date=effective_date, reason=payload.get("reason", "Department transfer"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
            status_value=LifecycleEventStatus.UPCOMING,
        )
    else:
        profile.department_id = str(new_department.id)
        if new_manager:
            profile.reports_to = str(new_manager.id)
        profile.updated_at = utc_now()
        await profile.save()
        await _sync_user_employment(profile, {"department_id", "reports_to"})
        event = await _record_event(
            company_id, profile, LifecycleEventType.DEPARTMENT_TRANSFERRED, before,
            _profile_employment_state(profile),
            effective_date=effective_date, reason=payload.get("reason", "Department transfer"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
        )

    await _notify_user(
        profile.user_id,
        company_id,
        NotificationType.LIFECYCLE_TRANSFERRED,
        "Department Transfer",
        f"You have been transferred to {new_department.name}.",
        related_id=str(event.id),
        action_url="/hr/me",
    )
    return {"event": await serialize_event(event, actor=actor), "department_id": profile.department_id}


async def change_manager(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
) -> dict:
    """Change reporting manager (explicit action, not raw profile edit)."""
    profile = await _require_profile(company_id, employee_id)
    await apply_due_lifecycle_events(company_id, employee_id)
    _require_not_exited(profile, "updated")

    new_manager_id = payload.get("new_manager_id")
    if not new_manager_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New manager is required.")
    if new_manager_id == profile.reports_to:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New manager must differ from the current manager.")
    new_manager = await _validate_manager(company_id, new_manager_id, employee_user_id=profile.user_id)

    effective_date = _parse_effective_date(payload.get("effective_date"))
    before = _profile_employment_state(profile)
    new_state = dict(before)
    new_state["reports_to"] = str(new_manager.id)

    if _is_future(effective_date):
        await _ensure_no_conflicting_upcoming(company_id, employee_id, LifecycleEventType.MANAGER_CHANGED)
        event = await _record_event(
            company_id, profile, LifecycleEventType.MANAGER_CHANGED, before, new_state,
            effective_date=effective_date, reason=payload.get("reason", "Manager change"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
            status_value=LifecycleEventStatus.UPCOMING,
        )
    else:
        profile.reports_to = str(new_manager.id)
        profile.updated_at = utc_now()
        await profile.save()
        await _sync_user_employment(profile, {"reports_to"})
        event = await _record_event(
            company_id, profile, LifecycleEventType.MANAGER_CHANGED, before,
            _profile_employment_state(profile),
            effective_date=effective_date, reason=payload.get("reason", "Manager change"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
        )

    await _notify_user(
        profile.user_id,
        company_id,
        NotificationType.LIFECYCLE_MANAGER_CHANGED,
        "Reporting Manager Changed",
        f"Your reporting manager is now {new_manager.full_name()}.",
        related_id=str(event.id),
        action_url="/hr/me",
    )
    return {"event": await serialize_event(event, actor=actor), "reports_to": profile.reports_to}


async def change_employment_type(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
) -> dict:
    profile = await _require_profile(company_id, employee_id)
    _require_not_exited(profile, "updated")
    new_type_raw = payload.get("new_employment_type") or payload.get("employment_type")
    if not new_type_raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New employment type is required.")
    new_type = new_type_raw if isinstance(new_type_raw, EmploymentType) else EmploymentType(str(new_type_raw))
    if new_type == profile.employment_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New employment type must differ from the current type.")
    effective_date = _parse_effective_date(payload.get("effective_date"))
    before = _profile_employment_state(profile)
    new_state = dict(before)
    new_state["employment_type"] = new_type.value

    if _is_future(effective_date):
        await _ensure_no_conflicting_upcoming(company_id, employee_id, LifecycleEventType.EMPLOYMENT_TYPE_CHANGED)
        event = await _record_event(
            company_id, profile, LifecycleEventType.EMPLOYMENT_TYPE_CHANGED, before, new_state,
            effective_date=effective_date, reason=payload.get("reason", "Employment type change"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
            status_value=LifecycleEventStatus.UPCOMING,
        )
    else:
        profile.employment_type = new_type
        profile.updated_at = utc_now()
        await profile.save()
        event = await _record_event(
            company_id, profile, LifecycleEventType.EMPLOYMENT_TYPE_CHANGED, before,
            _profile_employment_state(profile),
            effective_date=effective_date, reason=payload.get("reason", "Employment type change"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
        )
    return {"event": await serialize_event(event, actor=actor), "employment_type": profile.employment_type.value if profile.employment_type else None}


async def change_work_details(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
) -> dict:
    """Work location / work mode change."""
    profile = await _require_profile(company_id, employee_id)
    _require_not_exited(profile, "updated")

    effective_date = _parse_effective_date(payload.get("effective_date"))
    before = _profile_employment_state(profile)
    new_state = dict(before)
    event_type: Optional[LifecycleEventType] = None
    if payload.get("work_location") is not None and str(payload.get("work_location")) != (profile.work_location or ""):
        new_state["work_location"] = str(payload["work_location"])
        event_type = LifecycleEventType.WORK_LOCATION_CHANGED
    if payload.get("work_mode"):
        new_mode = payload["work_mode"] if isinstance(payload["work_mode"], EmployeeWorkMode) else EmployeeWorkMode(str(payload["work_mode"]))
        if new_mode != profile.work_mode:
            new_state["work_mode"] = new_mode.value
            event_type = LifecycleEventType.WORK_MODE_CHANGED
    if event_type is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to change — provide a different work location or work mode.")

    if _is_future(effective_date):
        await _ensure_no_conflicting_upcoming(company_id, employee_id, event_type)
        event = await _record_event(
            company_id, profile, event_type, before, new_state,
            effective_date=effective_date, reason=payload.get("reason", "Work details change"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
            status_value=LifecycleEventStatus.UPCOMING,
        )
    else:
        if new_state.get("work_location") is not None:
            profile.work_location = new_state["work_location"]
        if new_state.get("work_mode"):
            profile.work_mode = EmployeeWorkMode(new_state["work_mode"])
        profile.updated_at = utc_now()
        await profile.save()
        event = await _record_event(
            company_id, profile, event_type, before, _profile_employment_state(profile),
            effective_date=effective_date, reason=payload.get("reason", "Work details change"),
            notes=payload.get("notes"), initiated_by=str(actor.id),
        )
    return {"event": await serialize_event(event, actor=actor)}


# =============================================================================
# Separation — resignation / termination / exit
# =============================================================================


async def _active_separation(company_id: str, employee_id: str) -> Optional[EmployeeSeparationRequest]:
    return await EmployeeSeparationRequest.find_one(
        {
            "company_id": company_id,
            "employee_id": employee_id,
            "status": {"$in": [SeparationStatus.SUBMITTED.value, SeparationStatus.UNDER_REVIEW.value, SeparationStatus.ACCEPTED.value]},
        }
    )


async def submit_resignation(
    company_id: str,
    employee_id: str,
    payload: dict,
    *,
    submitted_by: str,
) -> dict:
    """Employee self-service resignation submission. Never immediately exits."""
    profile = await _require_profile(company_id, employee_id)
    if profile.employment_status == EmploymentStatus.EXITED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This employee has already exited the company.")
    if await _active_separation(company_id, employee_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An active separation process already exists for this employee.")

    requested_lwd = _parse_effective_date(payload.get("requested_last_working_day")) if payload.get("requested_last_working_day") else None
    reason = (payload.get("reason") or "").strip() or None
    employee_comment = (payload.get("comments") or payload.get("employee_comment") or "").strip() or None

    separation = EmployeeSeparationRequest(
        company_id=company_id,
        employee_id=str(profile.id),
        user_id=profile.user_id,
        separation_type=SeparationType.RESIGNATION,
        status=SeparationStatus.SUBMITTED,
        submitted_date=utc_now(),
        requested_last_working_day=requested_lwd,
        reason=reason,
        employee_comment=employee_comment,
    )
    await separation.insert()

    before = _profile_employment_state(profile)
    event = await _record_event(
        company_id,
        profile,
        LifecycleEventType.RESIGNATION_SUBMITTED,
        before,
        before,  # no employment state change
        effective_date=utc_now(),
        reason=reason,
        notes=employee_comment,
        initiated_by=submitted_by,
        source_reference_id=str(separation.id),
    )
    await _notify_hr_separation(
        company_id,
        "Resignation Submitted",
        f"{profile.user_id} has submitted a resignation request.",
        related_id=str(separation.id),
    )
    return {"separation": await serialize_separation(separation), "event": await serialize_event(event, actor=None)}


async def withdraw_resignation(
    company_id: str,
    separation_id: str,
    *,
    actor: User,
) -> dict:
    """Employee withdraws their own pending resignation (SUBMITTED/UNDER_REVIEW only)."""
    separation = await EmployeeSeparationRequest.get(separation_id)
    if not separation or separation.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Separation request not found")
    if separation.user_id != str(actor.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only withdraw your own resignation request.")
    if separation.status not in {SeparationStatus.SUBMITTED, SeparationStatus.UNDER_REVIEW}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This resignation can no longer be withdrawn.")

    separation.status = SeparationStatus.WITHDRAWN
    separation.updated_at = utc_now()
    await separation.save()

    profile = await _require_profile(company_id, separation.employee_id)
    before = _profile_employment_state(profile)
    event = await _record_event(
        company_id,
        profile,
        LifecycleEventType.RESIGNATION_WITHDRAWN,
        before,
        before,
        effective_date=utc_now(),
        reason="Resignation withdrawn by employee",
        initiated_by=str(actor.id),
        source_reference_id=str(separation.id),
    )
    return {"separation": await serialize_separation(separation), "event": await serialize_event(event, actor=None)}


async def accept_resignation(
    company_id: str,
    actor: User,
    employee_id: str,
    separation_id: str,
    payload: dict,
) -> dict:
    """HR accepts a resignation → notice period starts. Does NOT exit the employee."""
    profile = await _require_profile(company_id, employee_id)
    separation = await EmployeeSeparationRequest.get(separation_id)
    if not separation or separation.company_id != company_id or separation.employee_id != str(profile.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Separation request not found")
    if separation.status not in {SeparationStatus.SUBMITTED, SeparationStatus.UNDER_REVIEW}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only submitted resignations can be accepted.")

    approved_lwd = _parse_effective_date(payload.get("approved_last_working_day") or separation.requested_last_working_day)
    notice_days = payload.get("notice_period_days")
    review_comment = payload.get("review_comment") or payload.get("comment")

    separation.status = SeparationStatus.ACCEPTED
    separation.approved_last_working_day = approved_lwd
    separation.notice_start_date = utc_now()
    if notice_days is not None:
        try:
            separation.notice_period_days = float(notice_days)
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="notice_period_days must be a number.")
    separation.reviewed_by = str(actor.id)
    separation.reviewed_at = utc_now()
    separation.review_comment = review_comment
    separation.updated_at = utc_now()
    await separation.save()

    before = _profile_employment_state(profile)
    new_state = dict(before)
    new_state["employment_status"] = EmploymentStatus.NOTICE_PERIOD.value
    exit_info = profile.exit_info or ExitInfo()
    exit_info.resignation_date = separation.submitted_date
    exit_info.last_working_day = approved_lwd
    new_state["exit_info"] = exit_info.model_dump()

    profile.employment_status = EmploymentStatus.NOTICE_PERIOD
    profile.exit_info = exit_info
    profile.updated_at = utc_now()
    await profile.save()

    event = await _record_event(
        company_id,
        profile,
        LifecycleEventType.RESIGNATION_ACCEPTED,
        before,
        _profile_employment_state(profile),
        effective_date=approved_lwd,
        reason=review_comment or "Resignation accepted",
        initiated_by=str(actor.id),
        source_reference_id=str(separation.id),
    )
    await _record_event(
        company_id,
        profile,
        LifecycleEventType.NOTICE_PERIOD_STARTED,
        before,
        _profile_employment_state(profile),
        effective_date=utc_now(),
        reason=f"Notice period started. Last working day: {approved_lwd.strftime('%Y-%m-%d')}",
        initiated_by=str(actor.id),
        source_reference_id=str(separation.id),
    )
    await _notify_user(
        profile.user_id,
        company_id,
        NotificationType.LIFECYCLE_RESIGNATION_ACCEPTED,
        "Resignation Accepted",
        f"Your resignation has been accepted. Your last working day is {approved_lwd.strftime('%Y-%m-%d')}.",
        related_id=str(separation.id),
        action_url="/hr/me",
    )
    return {"separation": await serialize_separation(separation), "event": await serialize_event(event, actor=actor)}


async def reject_resignation(
    company_id: str,
    actor: User,
    employee_id: str,
    separation_id: str,
    payload: dict,
) -> dict:
    profile = await _require_profile(company_id, employee_id)
    separation = await EmployeeSeparationRequest.get(separation_id)
    if not separation or separation.company_id != company_id or separation.employee_id != str(profile.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Separation request not found")
    if separation.status not in {SeparationStatus.SUBMITTED, SeparationStatus.UNDER_REVIEW}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only submitted resignations can be rejected.")

    comment = (payload.get("review_comment") or payload.get("comment") or "").strip()
    if not comment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A rejection reason is required.")

    separation.status = SeparationStatus.REJECTED
    separation.reviewed_by = str(actor.id)
    separation.reviewed_at = utc_now()
    separation.review_comment = comment
    separation.updated_at = utc_now()
    await separation.save()

    before = _profile_employment_state(profile)
    event = await _record_event(
        company_id,
        profile,
        LifecycleEventType.RESIGNATION_REJECTED,
        before,
        before,
        effective_date=utc_now(),
        reason=comment,
        initiated_by=str(actor.id),
        source_reference_id=str(separation.id),
    )
    await _notify_user(
        profile.user_id,
        company_id,
        NotificationType.LIFECYCLE_RESIGNATION_REJECTED,
        "Resignation Not Accepted",
        "Your resignation request was not accepted. Please speak with HR for details.",
        related_id=str(separation.id),
        action_url="/hr/me",
    )
    return {"separation": await serialize_separation(separation), "event": await serialize_event(event, actor=actor)}


async def terminate_employee(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
) -> dict:
    """HR-controlled termination. Requires separation permission (enforced at endpoint)."""
    profile = await _require_profile(company_id, employee_id)
    await apply_due_lifecycle_events(company_id, employee_id)
    if profile.employment_status == EmploymentStatus.EXITED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This employee has already exited the company.")

    effective_date = _parse_effective_date(payload.get("effective_date") or payload.get("termination_date"))
    last_working_day = _parse_effective_date(payload.get("last_working_day")) if payload.get("last_working_day") else effective_date
    reason_category = (payload.get("reason_category") or payload.get("reason") or "").strip() or "Termination"
    confidential_notes = payload.get("confidential_notes") or payload.get("notes")
    employee_visible_note = payload.get("employee_visible_note")

    # Termination immediately places the employee in notice period (or exits if LWD already reached).
    before = _profile_employment_state(profile)
    new_state = dict(before)
    exit_info = profile.exit_info or ExitInfo()
    exit_info.exit_reason = reason_category
    exit_info.last_working_day = last_working_day
    if effective_date.date() <= utc_now().date() and last_working_day.date() <= utc_now().date():
        new_state["employment_status"] = EmploymentStatus.EXITED.value
        exit_info.exit_date = last_working_day
    else:
        new_state["employment_status"] = EmploymentStatus.NOTICE_PERIOD.value
    new_state["exit_info"] = exit_info.model_dump()

    profile.exit_info = exit_info
    profile.employment_status = EmploymentStatus(new_state["employment_status"])
    profile.updated_at = utc_now()
    await profile.save()

    separation = EmployeeSeparationRequest(
        company_id=company_id,
        employee_id=str(profile.id),
        user_id=profile.user_id,
        separation_type=SeparationType.TERMINATION,
        status=SeparationStatus.COMPLETED,
        submitted_date=utc_now(),
        approved_last_working_day=last_working_day,
        reason=reason_category,
        review_comment=confidential_notes,
        reviewed_by=str(actor.id),
        reviewed_at=utc_now(),
        completed_at=utc_now() if profile.employment_status == EmploymentStatus.EXITED else None,
    )
    await separation.insert()

    event = await _record_event(
        company_id,
        profile,
        LifecycleEventType.TERMINATED,
        before,
        _profile_employment_state(profile),
        effective_date=effective_date,
        reason=reason_category,
        notes=confidential_notes,
        initiated_by=str(actor.id),
        source_reference_id=str(separation.id),
    )
    if profile.employment_status == EmploymentStatus.EXITED:
        await _ensure_offboarding(company_id, profile)
        await _notify_user(
            profile.user_id,
            company_id,
            NotificationType.LIFECYCLE_TERMINATED,
            "Employment Ended",
            employee_visible_note or "Your employment has ended. Please contact HR for details.",
            related_id=str(separation.id),
            action_url="/hr/me",
        )
    return {
        "separation": await serialize_separation(separation),
        "event": await serialize_event(event, actor=actor),
        "employment_status": profile.employment_status.value,
    }


async def exit_employee(
    company_id: str,
    actor: User,
    employee_id: str,
    payload: dict,
) -> dict:
    """Mark an employee EXITED (notice period or active). Preserves all history."""
    profile = await _require_profile(company_id, employee_id)
    await apply_due_lifecycle_events(company_id, employee_id)
    if profile.employment_status == EmploymentStatus.EXITED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This employee has already exited the company.")

    last_working_day = _parse_effective_date(payload.get("last_working_day")) if payload.get("last_working_day") else utc_now()
    exit_date = _parse_effective_date(payload.get("exit_date")) if payload.get("exit_date") else last_working_day

    before = _profile_employment_state(profile)
    exit_info = profile.exit_info or ExitInfo()
    exit_info.last_working_day = last_working_day
    exit_info.exit_date = exit_date
    exit_info.exit_reason = exit_info.exit_reason or payload.get("reason")

    profile.exit_info = exit_info
    profile.employment_status = EmploymentStatus.EXITED
    profile.updated_at = utc_now()
    await profile.save()

    # Complete any active separation.
    separation = await _active_separation(company_id, employee_id)
    if separation:
        separation.status = SeparationStatus.COMPLETED
        separation.approved_last_working_day = separation.approved_last_working_day or last_working_day
        separation.completed_at = utc_now()
        separation.updated_at = utc_now()
        await separation.save()

    event = await _record_event(
        company_id,
        profile,
        LifecycleEventType.EXITED,
        before,
        _profile_employment_state(profile),
        effective_date=last_working_day,
        reason=payload.get("reason") or "Employment ended",
        notes=payload.get("notes"),
        initiated_by=str(actor.id),
        source_reference_id=str(separation.id) if separation else None,
    )
    await _ensure_offboarding(company_id, profile)
    await _notify_user(
        profile.user_id,
        company_id,
        NotificationType.LIFECYCLE_EXITED,
        "Employment Ended",
        "Your exit has been completed. Historical records remain available.",
        related_id=str(event.id),
        action_url="/hr/me",
    )
    return {"event": await serialize_event(event, actor=actor), "employment_status": profile.employment_status.value}


# =============================================================================
# Offboarding
# =============================================================================


async def _ensure_offboarding(company_id: str, profile: EmployeeProfile) -> EmployeeOffboarding:
    existing = await EmployeeOffboarding.find_one(
        {"company_id": company_id, "employee_id": str(profile.id)}
    )
    if existing:
        return existing
    offboarding = EmployeeOffboarding(
        company_id=company_id,
        employee_id=str(profile.id),
        user_id=profile.user_id,
        items=[OffboardingItem(**item) for item in DEFAULT_OFFBOARDING_ITEMS],
    )
    await offboarding.insert()
    return offboarding


async def get_offboarding(company_id: str, employee_id: str) -> Optional[EmployeeOffboarding]:
    profile = await _require_profile(company_id, employee_id)
    existing = await EmployeeOffboarding.find_one(
        {"company_id": company_id, "employee_id": str(profile.id)}
    )
    if existing:
        return existing
    if profile.employment_status == EmploymentStatus.EXITED:
        return await _ensure_offboarding(company_id, profile)
    return None


async def complete_offboarding_item(
    company_id: str,
    actor: User,
    employee_id: str,
    item_key: str,
    payload: dict,
) -> EmployeeOffboarding:
    offboarding = await _ensure_offboarding(company_id, await _require_profile(company_id, employee_id))
    found = False
    for item in offboarding.items:
        if item.key == item_key:
            item.completed = True
            item.completed_at = utc_now()
            item.completed_by = str(actor.id)
            if payload.get("notes"):
                item.notes = payload["notes"]
            found = True
            break
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offboarding item not found")
    offboarding.updated_at = utc_now()
    await offboarding.save()
    return offboarding


# =============================================================================
# Serialization
# =============================================================================

_EVENT_EMPLOYEE_VISIBLE_TYPES = {
    LifecycleEventType.JOINED,
    LifecycleEventType.EMPLOYMENT_BASELINE,
    LifecycleEventType.PROBATION_STARTED,
    LifecycleEventType.PROBATION_EXTENDED,
    LifecycleEventType.CONFIRMED,
    LifecycleEventType.PROMOTED,
    LifecycleEventType.DESIGNATION_CHANGED,
    LifecycleEventType.DEPARTMENT_TRANSFERRED,
    LifecycleEventType.MANAGER_CHANGED,
    LifecycleEventType.WORK_LOCATION_CHANGED,
    LifecycleEventType.WORK_MODE_CHANGED,
    LifecycleEventType.EMPLOYMENT_TYPE_CHANGED,
    LifecycleEventType.RESIGNATION_SUBMITTED,
    LifecycleEventType.RESIGNATION_WITHDRAWN,
    LifecycleEventType.RESIGNATION_ACCEPTED,
    LifecycleEventType.RESIGNATION_REJECTED,
    LifecycleEventType.NOTICE_PERIOD_STARTED,
    LifecycleEventType.EXITED,
}
# Termination details are confidential — HR-only.
_CONFIDENTIAL_EVENT_TYPES = {LifecycleEventType.TERMINATED}


async def serialize_event(event: EmployeeLifecycleEvent, *, actor: Optional[User]) -> dict:
    is_hr = actor is None or await _is_lifecycle_viewer(actor)
    if event.event_type in _CONFIDENTIAL_EVENT_TYPES and not is_hr:
        reason = None
        notes = None
    else:
        reason = event.reason
        notes = event.notes
    return {
        "id": str(event.id),
        "event_type": event.event_type.value,
        "status": event.status.value,
        "effective_date": event.effective_date,
        "applied_at": event.applied_at,
        "previous_state": event.previous_state,
        "new_state": event.new_state,
        "reason": reason,
        "notes": notes,
        "source": event.source.value,
        "source_reference_id": event.source_reference_id,
        "initiated_by": event.initiated_by,
        "created_at": event.created_at,
    }


async def serialize_separation(separation: EmployeeSeparationRequest) -> dict:
    return {
        "id": str(separation.id),
        "employee_id": separation.employee_id,
        "user_id": separation.user_id,
        "separation_type": separation.separation_type.value,
        "status": separation.status.value,
        "submitted_date": separation.submitted_date,
        "requested_last_working_day": separation.requested_last_working_day,
        "reason": separation.reason,
        "employee_comment": separation.employee_comment,
        "reviewed_by": separation.reviewed_by,
        "reviewed_at": separation.reviewed_at,
        "review_comment": separation.review_comment,
        "approved_last_working_day": separation.approved_last_working_day,
        "notice_period_days": separation.notice_period_days,
        "notice_start_date": separation.notice_start_date,
        "completed_at": separation.completed_at,
        "created_at": separation.created_at,
    }


def serialize_offboarding(offboarding: EmployeeOffboarding) -> dict:
    return {
        "id": str(offboarding.id),
        "employee_id": offboarding.employee_id,
        "items": [item.model_dump() for item in offboarding.items],
        "notes": offboarding.notes,
        "created_at": offboarding.created_at,
        "updated_at": offboarding.updated_at,
    }


# =============================================================================
# Lifecycle read APIs
# =============================================================================

async def _is_lifecycle_viewer(user: User) -> bool:
    from app.models.capability import get_capabilities_for_role
    from app.models.department import Department, DepartmentType

    role = user.role if isinstance(user.role, UserRole) else UserRole.from_legacy(str(user.role))
    if role in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return True
    if not user.department_id:
        return False
    department = await Department.get(user.department_id)
    if (
        not department
        or department.company_id != user.company_id
        or department.deleted_at is not None
        or department.department_type != DepartmentType.HR
    ):
        return False
    capabilities = await get_capabilities_for_role(department.department_type, user.role, user.company_id)
    return "employee_lifecycle.view" in capabilities


async def list_lifecycle_events(
    company_id: str,
    employee_id: str,
    actor: User,
    *,
    employee_view: bool = False,
) -> dict:
    """Chronological lifecycle history (newest first).

    ``employee_view=True`` filters to employee-visible events and redacts
    confidential termination details server-side — the frontend never sees
    data it is not allowed to see.
    """
    profile = await _require_profile(company_id, employee_id)
    await apply_due_lifecycle_events(company_id, employee_id)
    events = (
        await EmployeeLifecycleEvent.find(
            {"company_id": company_id, "employee_id": str(profile.id)}
        )
        .sort("-effective_date")
        .to_list()
    )
    if employee_view:
        events = [event for event in events if event.event_type in _EVENT_EMPLOYEE_VISIBLE_TYPES]
    serialized = [await serialize_event(event, actor=actor) for event in events]

    upcoming = [
        event
        for event in events
        if event.status == LifecycleEventStatus.UPCOMING
    ]
    active_separation = await _active_separation(company_id, str(profile.id))

    return {
        "employee_id": str(profile.id),
        "employment_status": profile.employment_status.value,
        "events": serialized,
        "upcoming": [await serialize_event(event, actor=actor) for event in upcoming],
        "active_separation": await serialize_separation(active_separation) if active_separation else None,
    }


async def get_lifecycle_current_state(company_id: str, employee_id: str, actor: User) -> dict:
    """Current lifecycle state: status, probation, upcoming changes, separation, offboarding."""
    profile = await _require_profile(company_id, employee_id)
    await apply_due_lifecycle_events(company_id, employee_id)

    from app.services.employee_profile_service import build_detail

    user = await _require_user(company_id, profile.user_id)
    detail = await build_detail(profile, user, can_edit=True)

    events = (
        await EmployeeLifecycleEvent.find(
            {"company_id": company_id, "employee_id": str(profile.id)}
        )
        .sort("-effective_date")
        .to_list()
    )
    upcoming = [
        await serialize_event(event, actor=actor)
        for event in events
        if event.status == LifecycleEventStatus.UPCOMING
    ]
    active_separation = await _active_separation(company_id, str(profile.id))
    offboarding = await get_offboarding(company_id, str(profile.id))

    return {
        "employee": detail,
        "employment_status": profile.employment_status.value,
        "probation": profile.probation.model_dump() if profile.probation else None,
        "exit_info": profile.exit_info.model_dump() if profile.exit_info else None,
        "upcoming": upcoming,
        "active_separation": await serialize_separation(active_separation) if active_separation else None,
        "offboarding": serialize_offboarding(offboarding) if offboarding else None,
        "can_view": True,
    }


async def get_my_lifecycle(user: User) -> dict:
    """Employee self-service lifecycle — own events only, employee-visible filtered."""
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile is not available for this account.")
    profile = await EmployeeProfile.find_one(
        {"company_id": user.company_id, "user_id": str(user.id)}
    )
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile is not available for this account.")
    return await list_lifecycle_events(user.company_id, str(profile.id), user, employee_view=True)


# =============================================================================
# Legacy PATCH integration — record history without breaking the edit UI
# =============================================================================

# Map raw EmployeeProfile fields that changed to lifecycle event types.
_CHANGE_EVENT_MAP = {
    "department_id": LifecycleEventType.DEPARTMENT_TRANSFERRED,
    "designation": LifecycleEventType.DESIGNATION_CHANGED,
    "reports_to": LifecycleEventType.MANAGER_CHANGED,
    "employment_type": LifecycleEventType.EMPLOYMENT_TYPE_CHANGED,
    "work_location": LifecycleEventType.WORK_LOCATION_CHANGED,
    "work_mode": LifecycleEventType.WORK_MODE_CHANGED,
}

_STATUS_EVENT_MAP = {
    EmploymentStatus.PROBATION.value: LifecycleEventType.PROBATION_STARTED,
    EmploymentStatus.ACTIVE.value: LifecycleEventType.CONFIRMED,
    EmploymentStatus.NOTICE_PERIOD.value: LifecycleEventType.NOTICE_PERIOD_STARTED,
    EmploymentStatus.EXITED.value: LifecycleEventType.EXITED,
}


async def record_profile_changes(
    company_id: str,
    actor: User,
    profile: EmployeeProfile,
    changes: dict,
) -> List[EmployeeLifecycleEvent]:
    """Record lifecycle events for direct HR profile edits (legacy PATCH).

    The modern lifecycle endpoints are the preferred path, but the existing
    Employee edit form still updates ``EmployeeProfile`` directly. To preserve
    history, this hook maps raw changed fields to lifecycle events with
    before/after snapshots — it never blocks the profile update.
    """
    recorded: List[EmployeeLifecycleEvent] = []
    if not changes:
        return recorded

    try:
        current = _profile_employment_state(profile)
        # Reconstruct the before-state from the change payload where possible;
        # otherwise the previous snapshot is the current state minus this change.
        for field, event_type in _CHANGE_EVENT_MAP.items():
            if field in changes:
                before = dict(current)
                before[field] = _change_before_value(profile, field, changes[field])
                after = dict(current)
                event = await _record_event(
                    company_id,
                    profile,
                    event_type,
                    before,
                    after,
                    effective_date=utc_now(),
                    reason="Updated via employee profile edit",
                    source=LifecycleEventSource.MANUAL,
                    initiated_by=str(actor.id),
                )
                recorded.append(event)

        if "employment_status" in changes:
            status_value = changes["employment_status"]
            status_value = status_value.value if hasattr(status_value, "value") else str(status_value)
            event_type = _STATUS_EVENT_MAP.get(status_value)
            if event_type and event_type not in {e.event_type for e in recorded}:
                before = dict(current)
                before["employment_status"] = (
                    profile.employment_status.value if profile.employment_status else None
                )
                after = dict(current)
                event = await _record_event(
                    company_id,
                    profile,
                    event_type,
                    before,
                    after,
                    effective_date=utc_now(),
                    reason="Employment status updated via employee profile edit",
                    source=LifecycleEventSource.MANUAL,
                    initiated_by=str(actor.id),
                )
                recorded.append(event)
    except Exception:
        # History recording must never break the profile update.
        logger.exception("Failed to record lifecycle events for profile %s", profile.id)
    return recorded


def _change_before_value(profile: EmployeeProfile, field: str, new_value: Any) -> Any:
    """Best-effort previous value for a changed field."""
    if field == "reports_to":
        return profile.reports_to
    if field == "department_id":
        return profile.department_id
    if field == "designation":
        return profile.designation
    if field == "work_location":
        return profile.work_location
    if field == "work_mode":
        return profile.work_mode.value if profile.work_mode else None
    if field == "employment_type":
        return profile.employment_type.value if profile.employment_type else None
    return None


# =============================================================================
# JOINED event + backfill — idempotent baseline for existing employees
# =============================================================================


async def record_joined_event(
    company_id: str,
    profile: EmployeeProfile,
    actor_id: Optional[str] = None,
) -> Optional[EmployeeLifecycleEvent]:
    """Record the JOINED foundation event for a new employee.

    Idempotent — a JOINED/EMPLOYMENT_BASELINE event is only created when the
    employee has no lifecycle history yet.
    """
    existing = await EmployeeLifecycleEvent.find_one(
        {"company_id": company_id, "employee_id": str(profile.id)}
    )
    if existing:
        return None
    state = _profile_employment_state(profile)
    return await _record_event(
        company_id,
        profile,
        LifecycleEventType.JOINED,
        {},
        state,
        effective_date=profile.joining_date or profile.created_at,
        reason="Employee joined the company",
        source=LifecycleEventSource.ONBOARDING,
        initiated_by=actor_id,
    )


async def backfill_employee_lifecycle(company_id: str, employee_id: str, actor_id: Optional[str] = None) -> Optional[EmployeeLifecycleEvent]:
    """Create a single EMPLOYMENT_BASELINE event for an existing employee that
    has no lifecycle history. Idempotent — never duplicates on rerun.

    Honest history: the baseline simply records the current known state
    (imported from the existing EmployeeProfile); it never fabricates detailed
    promotion/transfer history the database does not contain.
    """
    profile = await EmployeeProfile.get(employee_id)
    if not profile or profile.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    existing = await EmployeeLifecycleEvent.find_one(
        {"company_id": company_id, "employee_id": str(profile.id)}
    )
    if existing:
        return None
    state = _profile_employment_state(profile)
    event = await _record_event(
        company_id,
        profile,
        LifecycleEventType.EMPLOYMENT_BASELINE,
        {},
        state,
        effective_date=profile.joining_date or profile.created_at,
        reason="Baseline imported from existing EmployeeProfile",
        source=LifecycleEventSource.MIGRATION,
        initiated_by=actor_id,
    )
    return event


async def backfill_company_lifecycle(company_id: str, actor_id: Optional[str] = None) -> dict:
    profiles = await EmployeeProfile.find({"company_id": company_id}).to_list()
    created = 0
    for profile in profiles:
        if await backfill_employee_lifecycle(company_id, str(profile.id), actor_id=actor_id):
            created += 1
    return {"company_id": company_id, "employees": len(profiles), "baselines_created": created}
