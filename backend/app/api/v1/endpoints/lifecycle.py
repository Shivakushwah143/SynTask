"""
Employee Lifecycle API Endpoints — Phase 9.

Explicit business actions instead of generic raw PATCHes so every lifecycle
change is controlled, effective-dated, and audited:

    GET    /employees/{id}/lifecycle            chronological history + upcoming + active separation
    GET    /employees/{id}/lifecycle/current    current state (status/probation/upcoming/separation/offboarding)
    GET    /employees/{id}/lifecycle/offboarding
    POST   /employees/{id}/lifecycle/offboarding/items/{key}/complete

    POST   /employees/{id}/confirm
    POST   /employees/{id}/extend-probation
    POST   /employees/{id}/promote
    POST   /employees/{id}/designation
    POST   /employees/{id}/transfer
    POST   /employees/{id}/change-manager
    POST   /employees/{id}/employment-type
    POST   /employees/{id}/work-details
    POST   /employees/{id}/resignations/{separation_id}/accept
    POST   /employees/{id}/resignations/{separation_id}/reject
    POST   /employees/{id}/terminate
    POST   /employees/{id}/exit
    POST   /employees/{id}/lifecycle/events/{event_id}/cancel

Self-service (My HR):
    POST   /lifecycle/me/resignations           submit resignation (never immediately exits)
    POST   /lifecycle/me/resignations/{id}/withdraw
    GET    /lifecycle/me                        own employee-visible history

Authorization: ``employee_lifecycle.view`` (view), ``employee_lifecycle.manage``
(confirm/promote/transfer/manager/type/location/offboarding), and
``employee_lifecycle.separation`` (accept/reject resignation, terminate, exit).
Company admins pass through; company scope is enforced on every operation.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user, require_capability
from app.models.user import User, UserRole
from app.services.lifecycle_service import (
    accept_resignation,
    apply_due_lifecycle_events,
    backfill_employee_lifecycle,
    change_designation,
    change_employment_type,
    change_manager,
    change_work_details,
    complete_offboarding_item,
    confirm_employee,
    exit_employee,
    extend_probation,
    get_lifecycle_current_state,
    get_my_lifecycle,
    get_offboarding,
    list_lifecycle_events,
    promote_employee,
    reject_resignation,
    serialize_offboarding,
    submit_resignation,
    terminate_employee,
    transfer_employee,
    withdraw_resignation,
)
from app.services.salary_structure_service import get_current_salary

router = APIRouter()
self_router = APIRouter()


def _role(user: User) -> UserRole:
    return user.role if isinstance(user.role, UserRole) else UserRole.from_legacy(str(user.role))


async def require_lifecycle_view(current_user: User = Depends(get_current_user)) -> User:
    """Lifecycle view: company admins + HR staff with ``employee_lifecycle.view``."""
    return await require_capability("employee_lifecycle.view")(current_user)


async def require_lifecycle_manage(current_user: User = Depends(get_current_user)) -> User:
    """Lifecycle manage: company admins + HR staff with ``employee_lifecycle.manage``."""
    return await require_capability("employee_lifecycle.manage")(current_user)


async def require_lifecycle_separation(current_user: User = Depends(get_current_user)) -> User:
    """Separation actions (accept/reject resignation, terminate, exit):
    company admins + HR staff with ``employee_lifecycle.separation``.

    Managers do not automatically gain separation rights from the reporting
    hierarchy — an explicit HR capability is required.
    """
    return await require_capability("employee_lifecycle.separation")(current_user)


def _company_id(user: User) -> str:
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    return user.company_id


async def _can_manage_salary(user: User) -> bool:
    try:
        await require_capability("salary_management.manage")(user)
        return True
    except HTTPException:
        return False


# =============================================================================
# Read APIs
# =============================================================================


@router.get("/{employee_id}/lifecycle")
async def get_employee_lifecycle(
    employee_id: str,
    current_user: User = Depends(require_lifecycle_view),
):
    """Chronological lifecycle history + upcoming changes + active separation."""
    company_id = _company_id(current_user)
    data = await list_lifecycle_events(company_id, employee_id, current_user)
    return {"success": True, "data": data}


@router.get("/{employee_id}/lifecycle/current")
async def get_employee_lifecycle_current(
    employee_id: str,
    current_user: User = Depends(require_lifecycle_view),
):
    """Current lifecycle state (status, probation, upcoming, separation, offboarding)."""
    company_id = _company_id(current_user)
    data = await get_lifecycle_current_state(company_id, employee_id, current_user)
    return {"success": True, "data": data}


@router.get("/{employee_id}/lifecycle/offboarding")
async def get_employee_offboarding(
    employee_id: str,
    current_user: User = Depends(require_lifecycle_view),
):
    company_id = _company_id(current_user)
    offboarding = await get_offboarding(company_id, employee_id)
    return {
        "success": True,
        "data": serialize_offboarding(offboarding) if offboarding else None,
    }


@router.post("/{employee_id}/lifecycle/offboarding/items/{item_key}/complete")
async def complete_employee_offboarding_item(
    employee_id: str,
    item_key: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_manage),
):
    company_id = _company_id(current_user)
    offboarding = await complete_offboarding_item(
        company_id, current_user, employee_id, item_key, payload or {}
    )
    return {"success": True, "data": serialize_offboarding(offboarding)}


@router.post("/{employee_id}/lifecycle/events/{event_id}/cancel")
async def cancel_upcoming_lifecycle_event(
    employee_id: str,
    event_id: str,
    current_user: User = Depends(require_lifecycle_manage),
):
    """Cancel a future-dated lifecycle event that has not taken effect yet."""
    from app.models.lifecycle import EmployeeLifecycleEvent, LifecycleEventStatus
    from app.services.lifecycle_service import serialize_event

    company_id = _company_id(current_user)
    event = await EmployeeLifecycleEvent.get(event_id)
    if (
        not event
        or event.company_id != company_id
        or event.employee_id != employee_id
        or event.status != LifecycleEventStatus.UPCOMING
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upcoming lifecycle event not found")
    from app.core.clock import utc_now

    event.status = LifecycleEventStatus.CANCELLED
    event.cancelled_by = str(current_user.id)
    event.cancelled_at = utc_now()
    event.updated_at = utc_now()
    await event.save()
    return {"success": True, "data": await serialize_event(event, actor=current_user)}


# =============================================================================
# Confirmation / probation
# =============================================================================


@router.post("/{employee_id}/confirm")
async def confirm_employee_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_manage),
):
    return {"success": True, "data": await confirm_employee(_company_id(current_user), current_user, employee_id, payload or {})}


@router.post("/{employee_id}/extend-probation")
async def extend_probation_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_manage),
):
    return {"success": True, "data": await extend_probation(_company_id(current_user), current_user, employee_id, payload or {})}


# =============================================================================
# Promotion / designation / transfer / manager / type / work details
# =============================================================================


@router.post("/{employee_id}/promote")
async def promote_employee_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_manage),
):
    company_id = _company_id(current_user)
    can_manage_salary = await _can_manage_salary(current_user)
    return {
        "success": True,
        "data": await promote_employee(
            company_id, current_user, employee_id, payload or {}, can_manage_salary=can_manage_salary
        ),
    }


@router.post("/{employee_id}/designation")
async def change_designation_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_manage),
):
    return {"success": True, "data": await change_designation(_company_id(current_user), current_user, employee_id, payload or {})}


@router.post("/{employee_id}/transfer")
async def transfer_employee_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_manage),
):
    return {"success": True, "data": await transfer_employee(_company_id(current_user), current_user, employee_id, payload or {})}


@router.post("/{employee_id}/change-manager")
async def change_manager_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_manage),
):
    return {"success": True, "data": await change_manager(_company_id(current_user), current_user, employee_id, payload or {})}


@router.post("/{employee_id}/employment-type")
async def change_employment_type_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_manage),
):
    return {"success": True, "data": await change_employment_type(_company_id(current_user), current_user, employee_id, payload or {})}


@router.post("/{employee_id}/work-details")
async def change_work_details_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_manage),
):
    return {"success": True, "data": await change_work_details(_company_id(current_user), current_user, employee_id, payload or {})}


# =============================================================================
# Separation — resignation review / termination / exit
# =============================================================================


@router.post("/{employee_id}/resignations/{separation_id}/accept")
async def accept_resignation_endpoint(
    employee_id: str,
    separation_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_separation),
):
    return {
        "success": True,
        "data": await accept_resignation(_company_id(current_user), current_user, employee_id, separation_id, payload or {}),
    }


@router.post("/{employee_id}/resignations/{separation_id}/reject")
async def reject_resignation_endpoint(
    employee_id: str,
    separation_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_separation),
):
    return {
        "success": True,
        "data": await reject_resignation(_company_id(current_user), current_user, employee_id, separation_id, payload or {}),
    }


@router.post("/{employee_id}/terminate")
async def terminate_employee_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_separation),
):
    return {
        "success": True,
        "data": await terminate_employee(_company_id(current_user), current_user, employee_id, payload or {}),
    }


@router.post("/{employee_id}/exit")
async def exit_employee_endpoint(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_lifecycle_separation),
):
    return {
        "success": True,
        "data": await exit_employee(_company_id(current_user), current_user, employee_id, payload or {}),
    }


# =============================================================================
# Self-service (My HR)
# =============================================================================


@self_router.post("/me/resignations")
async def submit_my_resignation(
    payload: dict,
    current_user: User = Depends(get_current_user),
):
    """Employee submits their own resignation — never immediately exits."""
    company_id = _company_id(current_user)
    from app.models.employee_profile import EmployeeProfile

    profile = await EmployeeProfile.find_one(
        {"company_id": company_id, "user_id": str(current_user.id)}
    )
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile is not available for this account.")
    return {
        "success": True,
        "data": await submit_resignation(
            company_id, str(profile.id), payload or {}, submitted_by=str(current_user.id)
        ),
    }


@self_router.post("/me/resignations/{separation_id}/withdraw")
async def withdraw_my_resignation(
    separation_id: str,
    current_user: User = Depends(get_current_user),
):
    return {
        "success": True,
        "data": await withdraw_resignation(_company_id(current_user), separation_id, actor=current_user),
    }


@self_router.get("/me")
async def get_my_lifecycle_endpoint(current_user: User = Depends(get_current_user)):
    """Own employee-visible lifecycle history (employee self-service)."""
    return {"success": True, "data": await get_my_lifecycle(current_user)}
