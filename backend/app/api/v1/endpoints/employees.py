"""
Employee Profile API Endpoints — Phase 1 HRMS.

Canonical HR employee management surface:

    GET    /employees                list (search/filter/pagination)
    GET    /employees/{id}           normalized detail DTO
    POST   /employees                create profile for an existing company User
    PATCH  /employees/{id}           partial HR update

Authorization reuses the existing platform permission architecture (global
roles + department capabilities). No parallel HR role system is introduced.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user, has_capability
from app.models.department import Department, DepartmentType
from app.models.user import User, UserRole
from app.schemas.employee_profile import (
    EmployeeDetail,
    EmployeeListResponse,
    EmployeeListItem,
    EmployeeProfileCreate,
    EmployeeProfileUpdate,
)
from app.services.employee_profile_service import (
    can_view_employee_directory,
    create_profile,
    get_employee,
    list_employees,
    update_profile,
)

router = APIRouter()


def _role(user: User) -> UserRole:
    return user.role if isinstance(user.role, UserRole) else UserRole.from_legacy(str(user.role))


async def require_employee_view(current_user: User = Depends(get_current_user)) -> User:
    """View access: company admins/managers + HR department staff.

    Delegates to the shared service check so the employee-detail service and
    this dependency can never disagree about who may open a profile.
    """
    if not await can_view_employee_directory(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Employee directory access required")
    return current_user


async def _has_employee_manage_access(user: User) -> bool:
    """Boolean manage check — company admins + HR department staff with the capability."""
    if _role(user) in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN):
        return True
    return bool(user.company_id) and await has_capability(user, "employee_management.manage")


async def require_employee_manage(current_user: User = Depends(get_current_user)) -> User:
    """Manage access: company admins + HR department staff with the capability."""
    if not await _has_employee_manage_access(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Employee management access required")
    return current_user


def _company_id(user: User) -> str:
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    return user.company_id


@router.get("", response_model=EmployeeListResponse)
async def list_employees_endpoint(
    search: Optional[str] = Query(None, description="Search employee name, employee number, or work email"),
    department_id: Optional[str] = None,
    designation: Optional[str] = None,
    employment_status: Optional[str] = None,
    employment_type: Optional[str] = None,
    work_mode: Optional[str] = None,
    sort_by: str = Query("created_at", alias="sort_by"),
    sort_order: str = Query("desc", alias="sort_order"),
    page: int = 1,
    page_size: int = 50,
    current_user: User = Depends(require_employee_view),
):
    """List employees with backend search, filters, sorting, and pagination."""
    items, total = await list_employees(
        _company_id(current_user),
        search=search,
        department_id=department_id,
        designation=designation,
        employment_status=employment_status,
        employment_type=employment_type,
        work_mode=work_mode,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        page_size=page_size,
    )
    return EmployeeListResponse(
        items=[EmployeeListItem.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/me", response_model=EmployeeDetail)
async def my_employee_profile(current_user: User = Depends(get_current_user)):
    """The current user's own employee profile (self-service)."""
    from app.models.employee_profile import EmployeeProfile

    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile not found")
    profile = await EmployeeProfile.find_one(
        {"company_id": current_user.company_id, "user_id": str(current_user.id)}
    )
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile not found")
    can_edit = await _has_employee_manage_access(current_user)
    return await get_employee(
        current_user.company_id, str(profile.id), current_user, can_edit=can_edit
    )


@router.patch("/me", response_model=EmployeeDetail)
async def update_my_employee_profile(
    payload: dict,
    current_user: User = Depends(get_current_user),
):
    """Employee self-service profile update — whitelisted personal fields only.

    Backend rejects any HR-controlled field (department, designation, manager,
    employee number, employment status, salary-affecting fields, ...) with an
    explicit error; it is never silently ignored.
    """
    from app.services.ess_service import update_my_profile

    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee profile not found")
    return await update_my_profile(current_user, payload)


@router.get("/{employee_id}", response_model=EmployeeDetail)
async def get_employee_endpoint(
    employee_id: str,
    current_user: User = Depends(require_employee_view),
):
    """Normalized employee detail. Regular staff may only open their own profile."""
    can_edit = await _has_employee_manage_access(current_user)
    return await get_employee(_company_id(current_user), employee_id, current_user, can_edit=can_edit)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=EmployeeDetail)
async def create_employee_endpoint(
    payload: EmployeeProfileCreate,
    current_user: User = Depends(require_employee_manage),
):
    """Create an Employee Profile for an existing company User (HR/Admin only)."""
    return await create_profile(_company_id(current_user), current_user, payload.model_dump())


@router.patch("/{employee_id}", response_model=EmployeeDetail)
async def update_employee_endpoint(
    employee_id: str,
    payload: EmployeeProfileUpdate,
    current_user: User = Depends(require_employee_manage),
):
    """Partial update of employee HR information (HR/Admin only)."""
    return await update_profile(
        _company_id(current_user), employee_id, current_user, payload.model_dump(exclude_unset=True)
    )
