"""
Work Overview API — Phase 3

Role-aware endpoint for the Work Overview experience.
Backend determines visibility scope based on the authenticated user's role.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_current_user
from app.models.user import User
from app.services.work_overview_service import build_work_overview
from app.services.work_monitoring_service import (
    get_employee_monitoring_detail,
    get_employee_monitoring_timeline,
    get_monitoring_filters,
    get_monitoring_overview,
)

router = APIRouter()


@router.get("/overview")
async def get_work_overview(current_user: User = Depends(get_current_user)):
    """
    Return the role-aware Work Overview.

    Employee → My Work (personal execution view)
    Manager/Lead → Team Work (team operational view)
    Admin/Super Admin → Business Work (company scope)

    The backend determines scope — no arbitrary user_id/company_id query params.
    """
    return await build_work_overview(current_user)


@router.get("/overview/monitoring")
async def get_work_monitoring_overview(
    date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    department_id: Optional[str] = None,
    designation: Optional[str] = None,
    employee_id: Optional[str] = None,
    manager_id: Optional[str] = None,
    attendance_status: Optional[str] = None,
    work_status: Optional[str] = None,
    task_health: Optional[str] = None,
    project_id: Optional[str] = None,
    search: Optional[str] = Query(None, max_length=100),
    current_user: User = Depends(get_current_user),
):
    """Compact, department-first monitoring projection scoped by the server."""
    return await get_monitoring_overview(
        current_user,
        date=date,
        start_date=start_date,
        end_date=end_date,
        department_id=department_id,
        designation=designation,
        employee_id=employee_id,
        manager_id=manager_id,
        attendance_status=attendance_status,
        work_status=work_status,
        task_health=task_health,
        project_id=project_id,
        search=search,
    )


@router.get("/overview/monitoring/filters")
async def get_work_monitoring_filters(current_user: User = Depends(get_current_user)):
    """Return only filter values available in the caller's monitoring scope."""
    return await get_monitoring_filters(current_user)


@router.get("/overview/monitoring/employees/{employee_id}")
async def get_employee_monitoring(
    employee_id: str,
    date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    return await get_employee_monitoring_detail(current_user, employee_id, date_value=date, start_date=start_date, end_date=end_date)


@router.get("/overview/monitoring/employees/{employee_id}/timeline")
async def get_employee_monitoring_timeline_endpoint(
    employee_id: str,
    date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    return await get_employee_monitoring_timeline(
        current_user, employee_id, date_value=date, start_date=start_date, end_date=end_date,
        event_type=event_type, page=page, page_size=page_size,
    )
