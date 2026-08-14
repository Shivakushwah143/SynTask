"""
Phase 5 — Salary Structure API endpoints.

Salary components CRUD, employee salary assignment/revision,
history, and payroll-ready snapshot.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status

from app.api.dependencies import get_current_user, require_capability
from app.models.user import User, UserRole
from app.services.salary_component_service import (
    create_component,
    deactivate_component,
    ensure_default_components,
    get_component,
    list_components,
    serialize_component,
    update_component,
)
from app.services.salary_structure_service import (
    create_initial_salary,
    create_salary_revision,
    get_current_salary,
    get_effective_salary_structure,
    get_salary_history,
    get_salary_snapshot_for_payroll,
    get_upcoming_salary,
    serialize_structure,
)

router = APIRouter()


# =============================================================================
# Salary Components
# =============================================================================

@router.get("/components")
async def list_salary_components(
    include_inactive: bool = Query(False),
    component_type: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """List salary components for the company."""
    if not current_user.company_id:
        return {"success": True, "data": []}
    await ensure_default_components(current_user.company_id, actor_id=str(current_user.id))
    components = await list_components(
        current_user.company_id,
        include_inactive=include_inactive,
        component_type=component_type,
    )
    return {"success": True, "data": [serialize_component(c) for c in components]}


@router.post("/components", status_code=http_status.HTTP_201_CREATED)
async def create_salary_component(
    payload: dict,
    current_user: User = Depends(require_capability("salary_management.manage")),
):
    """Create a new salary component."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    comp = await create_component(current_user.company_id, str(current_user.id), payload)
    return {"success": True, "data": serialize_component(comp)}


@router.patch("/components/{component_id}")
async def update_salary_component(
    component_id: str,
    payload: dict,
    current_user: User = Depends(require_capability("salary_management.manage")),
):
    """Update a salary component."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    comp = await update_component(current_user.company_id, component_id, payload)
    return {"success": True, "data": serialize_component(comp)}


@router.delete("/components/{component_id}")
async def deactivate_salary_component(
    component_id: str,
    current_user: User = Depends(require_capability("salary_management.manage")),
):
    """Soft-deactivate a salary component."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    comp = await deactivate_component(current_user.company_id, component_id)
    return {"success": True, "data": serialize_component(comp)}


# =============================================================================
# Employee Salary — self-service (Phase 8)
# =============================================================================

@router.get("/me")
async def get_my_salary(
    current_user: User = Depends(get_current_user),
):
    """The current user's own salary structure (current + upcoming).

    Self-only: the employee id is resolved server-side from the authenticated
    user — never from the request path. Same read-only shape as the existing
    employee salary endpoint.
    """
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")

    employee_id = str(current_user.id)  # Salary structures are keyed by user id.
    current = await get_current_salary(current_user.company_id, employee_id)
    upcoming = await get_upcoming_salary(current_user.company_id, employee_id)

    return {
        "success": True,
        "data": {
            "current": serialize_structure(current, "current") if current else None,
            "upcoming": serialize_structure(upcoming, "upcoming") if upcoming else None,
        },
    }


# =============================================================================
# Employee Salary — current, upcoming, history
# =============================================================================

@router.get("/employees/{employee_id}/salary")
async def get_employee_salary(
    employee_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get current and upcoming salary for an employee."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")

    # Permission check: only salary_management.view, own profile, or admin
    _assert_salary_view_permission(current_user, employee_id)

    current = await get_current_salary(current_user.company_id, employee_id)
    upcoming = await get_upcoming_salary(current_user.company_id, employee_id)

    return {
        "success": True,
        "data": {
            "current": serialize_structure(current, "current") if current else None,
            "upcoming": serialize_structure(upcoming, "upcoming") if upcoming else None,
        },
    }


@router.get("/employees/{employee_id}/salary/history")
async def get_employee_salary_history(
    employee_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get salary history for an employee."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")

    _assert_salary_view_permission(current_user, employee_id)

    structures = await get_salary_history(current_user.company_id, employee_id)
    return {
        "success": True,
        "data": [serialize_structure(s) for s in structures],
    }


# =============================================================================
# Employee Salary — create / revise
# =============================================================================

@router.post("/employees/{employee_id}/salary", status_code=http_status.HTTP_201_CREATED)
async def assign_employee_salary(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_capability("salary_management.manage")),
):
    """Create the initial salary structure for an employee."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")

    structure = await create_initial_salary(
        current_user.company_id, employee_id, current_user, payload,
    )
    return {"success": True, "data": serialize_structure(structure)}


@router.post("/employees/{employee_id}/salary/revisions", status_code=http_status.HTTP_201_CREATED)
async def revise_employee_salary(
    employee_id: str,
    payload: dict,
    current_user: User = Depends(require_capability("salary_management.manage")),
):
    """Create a salary revision (new effective version)."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")

    structure = await create_salary_revision(
        current_user.company_id, employee_id, current_user, payload,
    )
    return {"success": True, "data": serialize_structure(structure)}


# =============================================================================
# Payroll snapshot
# =============================================================================

@router.get("/employees/{employee_id}/salary/payroll-snapshot")
async def get_payroll_salary_snapshot(
    employee_id: str,
    effective_date: str = Query(..., description="YYYY-MM-DD"),
    current_user: User = Depends(require_capability("salary_management.view")),
):
    """Get payroll-ready salary snapshot for a specific date."""
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")

    try:
        target_date = datetime.strptime(effective_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Expected YYYY-MM-DD.")

    snapshot = await get_salary_snapshot_for_payroll(
        current_user.company_id, employee_id, target_date,
    )
    if not snapshot:
        return {"success": True, "data": None, "message": "No salary structure found for this date"}

    return {"success": True, "data": snapshot}


# =============================================================================
# Permission helpers
# =============================================================================


def _assert_salary_view_permission(current_user: User, employee_id: str) -> None:
    """Assert the current user can view the target employee's salary."""
    role = current_user.role

    # Super admin can see all
    if role == UserRole.SUPER_ADMIN:
        return

    # Admin / Sub-admin with salary_management.view capability
    if role in (UserRole.ADMIN, UserRole.SUB_ADMIN):
        # Company admin — check company scope (done at API level)
        return

    # Own salary (employee viewing own profile)
    if str(current_user.id) == employee_id:
        return

    # HR department with salary_management.view
    if role in (UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE):
        # Check capability — but for now, managers/leads/employees cannot see others' salary
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You do not have permission to view this employee's salary")

    raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You do not have permission to view salary")
