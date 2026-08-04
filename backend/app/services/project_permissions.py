from enum import Enum
from typing import Optional

from fastapi import HTTPException, status

from app.api.dependencies import get_project_by_id
from app.models.project import Project
from app.models.task import Task
from app.models.user import User, UserRole


class EffectiveProjectRole(str, Enum):
    ORG_MANAGER = "org_manager"
    PROJECT_LEAD = "project_lead"
    PROJECT_MEMBER = "project_member"
    NONE = "none"


class ProjectPermission(str, Enum):
    VIEW_PROJECT = "view_project"
    MANAGE_PROJECT = "manage_project"
    CREATE_TASK = "create_task"
    MANAGE_TASK = "manage_task"
    ASSIGN_TASK = "assign_task"
    MANAGE_BOARD = "manage_board"
    MANAGE_SPRINT = "manage_sprint"
    MANAGE_EPIC = "manage_epic"
    MANAGE_PAGE = "manage_page"


ORG_MANAGEMENT_ROLES = {
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.SUB_ADMIN,
    UserRole.MANAGER,
}

PROJECT_LEAD_PERMISSIONS = {
    ProjectPermission.VIEW_PROJECT,
    ProjectPermission.CREATE_TASK,
    ProjectPermission.MANAGE_TASK,
    ProjectPermission.ASSIGN_TASK,
    ProjectPermission.MANAGE_BOARD,
    ProjectPermission.MANAGE_SPRINT,
    ProjectPermission.MANAGE_EPIC,
    ProjectPermission.MANAGE_PAGE,
}

PROJECT_MEMBER_PERMISSIONS = {
    ProjectPermission.VIEW_PROJECT,
}


def _string_set(values) -> set[str]:
    return {str(value) for value in (values or []) if value}


def _project_member_ids(project: Project) -> set[str]:
    ids = _string_set(getattr(project, "team_member_ids", None))
    ids.update(_string_set(getattr(project, "assigned_user_ids", None)))
    for field in ("assigned_to", "created_by"):
        value = getattr(project, field, None)
        if value:
            ids.add(str(value))
    return ids


def get_effective_project_role(current_user: User, project: Project) -> EffectiveProjectRole:
    if current_user.role == UserRole.SUPER_ADMIN:
        return EffectiveProjectRole.ORG_MANAGER

    if not getattr(current_user, "company_id", None) or str(current_user.company_id) != str(project.company_id):
        return EffectiveProjectRole.NONE

    if current_user.role in ORG_MANAGEMENT_ROLES:
        return EffectiveProjectRole.ORG_MANAGER

    user_id = str(current_user.id)
    if getattr(project, "lead_id", None) and str(project.lead_id) == user_id:
        return EffectiveProjectRole.PROJECT_LEAD

    if current_user.role == UserRole.LEAD:
        lead_ids = _project_member_ids(project)
        if user_id in lead_ids:
            return EffectiveProjectRole.PROJECT_LEAD

    if user_id in _project_member_ids(project):
        return EffectiveProjectRole.PROJECT_MEMBER

    return EffectiveProjectRole.NONE


def has_project_permission(current_user: User, project: Project, permission: ProjectPermission | str) -> bool:
    if isinstance(permission, str):
        permission = ProjectPermission(permission)
    effective_role = get_effective_project_role(current_user, project)
    if effective_role == EffectiveProjectRole.ORG_MANAGER:
        return True
    if effective_role == EffectiveProjectRole.PROJECT_LEAD:
        return permission in PROJECT_LEAD_PERMISSIONS
    if effective_role == EffectiveProjectRole.PROJECT_MEMBER:
        return permission in PROJECT_MEMBER_PERMISSIONS
    return False


def serialize_project_permissions(current_user: User, project: Project) -> dict:
    effective_role = get_effective_project_role(current_user, project)
    return {
        "effective_project_role": effective_role.value,
        "permissions": {
            permission.value: has_project_permission(current_user, project, permission)
            for permission in ProjectPermission
        },
    }


async def load_project_for_permission(project_identifier: str, current_user: User) -> Project:
    project, _ = await get_project_by_id(project_identifier, None if current_user.role == UserRole.SUPER_ADMIN else current_user.company_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if current_user.role != UserRole.SUPER_ADMIN and str(project.company_id) != str(current_user.company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def require_project_permission(
    current_user: User,
    project_identifier: str,
    permission: ProjectPermission | str,
) -> Project:
    project = await load_project_for_permission(project_identifier, current_user)
    if not has_project_permission(current_user, project, permission):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission for this project")
    return project


async def load_task_project(task: Task, current_user: User) -> Optional[Project]:
    if not getattr(task, "project_id", None):
        return None
    project, _ = await get_project_by_id(str(task.project_id), None if current_user.role == UserRole.SUPER_ADMIN else current_user.company_id)
    if not project:
        return None
    if current_user.role != UserRole.SUPER_ADMIN and str(project.company_id) != str(task.company_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task does not belong to this project")
    return project


async def require_task_project_permission(
    current_user: User,
    task: Task,
    permission: ProjectPermission | str,
) -> Optional[Project]:
    project = await load_task_project(task, current_user)
    if project and has_project_permission(current_user, project, permission):
        return project
    if project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission for this project")
    return None
