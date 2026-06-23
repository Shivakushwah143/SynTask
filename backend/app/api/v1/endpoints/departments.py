"""
Department Management Endpoints
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_current_user
from app.models.department import Department
from app.models.task import Task
from app.models.user import User, UserRole, UserStatus
from app.schemas.departments import DepartmentCreateRequest, DepartmentUpdateRequest

router = APIRouter()


def _is_company_admin(user: User) -> bool:
    return user.role == UserRole.ADMIN or user.role.value == "company_admin"


async def _require_company_admin_only(current_user: User = Depends(get_current_user)) -> User:
    if not _is_company_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company admin access required",
        )
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company",
        )
    return current_user


async def _resolve_manager(company_id: str, manager_id: str | None) -> User | None:
    if not manager_id:
        
        return None
    manager = await User.get(manager_id)
    if not manager or manager.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Manager must belong to the same company",
        )
    return manager


def _serialize_department(department: Department, manager_name: str | None = None) -> dict:
    return {
        "id": str(department.id),
        "name": department.name,
        "manager_id": department.manager_id,
        "manager_name": manager_name,
        "created_at": department.created_at,
        "updated_at": department.updated_at,
    }


@router.get("/")
async def list_departments(current_user: User = Depends(_require_company_admin_only)):
    departments = await Department.find(
        Department.company_id == current_user.company_id,
        Department.deleted_at == None,  # noqa: E711
    ).sort("-created_at").to_list()

    manager_ids = [department.manager_id for department in departments if department.manager_id]
    managers_by_id = {}
    if manager_ids:
        managers = await User.find({"_id": {"$in": manager_ids}}).to_list()
        managers_by_id = {
            str(manager.id): manager.full_name()
            for manager in managers
            if manager.company_id == current_user.company_id
        }

    return [
        _serialize_department(
            department,
            managers_by_id.get(department.manager_id) if department.manager_id else None,
        )
        for department in departments
    ]


@router.post("/")
async def create_department(
    payload: DepartmentCreateRequest,
    current_user: User = Depends(_require_company_admin_only),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department name is required")

    manager = await _resolve_manager(current_user.company_id, payload.manager_id)

    department = Department(
        name=name,
        company_id=current_user.company_id,
        manager_id=str(manager.id) if manager else None,
    )
    await department.insert()
    return _serialize_department(department)


@router.put("/{department_id}")
async def update_department(
    department_id: str,
    payload: DepartmentUpdateRequest,
    current_user: User = Depends(_require_company_admin_only),
):
    department = await Department.get(department_id)
    if not department or department.company_id != current_user.company_id or department.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department name is required")

    manager = await _resolve_manager(current_user.company_id, payload.manager_id)

    department.name = name
    department.manager_id = str(manager.id) if manager else None
    department.updated_at = datetime.utcnow()
    await department.save()

    return _serialize_department(department)


@router.delete("/{department_id}")
async def delete_department(
    department_id: str,
    current_user: User = Depends(_require_company_admin_only),
):
    department = await Department.get(department_id)
    if not department or department.company_id != current_user.company_id or department.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    active_users = await User.find(
        User.company_id == current_user.company_id,
        User.status == UserStatus.ACTIVE,
        User.department_id == department_id,
    ).to_list()
    legacy_users = await User.find(
        User.company_id == current_user.company_id,
        User.status == UserStatus.ACTIVE,
        User.department == department.name,
    ).to_list()
    user_names = []
    seen_users = set()
    for user in active_users + legacy_users:
        user_key = str(user.id)
        if user_key not in seen_users:
            seen_users.add(user_key)
            user_names.append(user.full_name())

    department_tasks = await Task.find(
        Task.company_id == current_user.company_id,
        Task.department_id == department_id,
    ).to_list()
    legacy_tasks = await Task.find(
        Task.company_id == current_user.company_id,
        Task.department == department.name,
    ).to_list()
    task_titles = []
    seen_tasks = set()
    for task in department_tasks + legacy_tasks:
        task_key = str(task.id)
        if task_key not in seen_tasks:
            seen_tasks.add(task_key)
            task_titles.append(task.title)

    if user_names or task_titles:
        parts = []
        if user_names:
            parts.append(f"active users: {', '.join(user_names)}")
        if task_titles:
            parts.append(f"tasks: {', '.join(task_titles)}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete department because it is still assigned to {', '.join(parts)}.",
        )

    department.deleted_at = datetime.utcnow()
    department.updated_at = datetime.utcnow()
    await department.save()

    return {"message": "Department deleted successfully"}
