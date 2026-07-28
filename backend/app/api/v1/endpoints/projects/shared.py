"""
Project Management Endpoints - Jira-like Projects.

Project identity:
- project_id (string): User-provided logical ID from frontend (e.g. PROJ-001). Required on create,
  unique per company. This is the FK stored in tasks and used in URLs; not MongoDB _id.
- MongoDB _id: Internal only. All project routes accept either project_id or _id in the path;
  get_project_by_id() resolves both so frontend can use the same value everywhere.
"""
from fastapi import HTTPException, status as http_status, Depends, Form, UploadFile, File
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
import logging
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

from app.models.project import Project, ProjectType, ProjectStatus, Epic, Sprint
from app.models.user import User, UserRole, Employee
from app.models.task import Task
from app.models.page import Page, PageStatus
from app.api.dependencies import (
    get_current_user,
    get_current_company_admin_or_lead,
    get_current_company_admin,
    check_company_access,
    get_project_by_id,
)
from app.core.config import settings
from app.core.cache import cache_delete_pattern, project_list_key, cache_delete, cache_get, cache_set

# Upload directory for project files
BACKEND_DIR = Path(__file__).resolve().parents[5]
PROJECT_UPLOAD_DIR = BACKEND_DIR / settings.UPLOAD_DIR / "projects"
PROJECT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def project_assignee_ids(project: Project) -> list[str]:
    ids = set(str(value) for value in (getattr(project, "assigned_user_ids", None) or []) if value)
    if getattr(project, "assigned_to", None):
        ids.add(str(project.assigned_to))
    if getattr(project, "lead_id", None):
        ids.add(str(project.lead_id))
    if getattr(project, "created_by", None):
        ids.add(str(project.created_by))
    return list(ids)


def enum_or_string_value(value, default: Optional[str] = None) -> Optional[str]:
    if value is None:
        return default
    return getattr(value, "value", value)


def normalize_project_type(value: str | None) -> str:
    normalized = (value or ProjectType.SOFTWARE.value).strip().lower().replace(" ", "_")
    return normalized or ProjectType.SOFTWARE.value


async def scoped_user_ids(current_user: User) -> list[str]:
    ids = {str(current_user.id)}
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        subordinates = await current_user.get_all_subordinates()
        ids.update(str(user.id) for user in subordinates)
    return list(ids)


async def can_manage_project(project: Project, current_user: User) -> bool:
    if current_user.role in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return True
    if current_user.company_id != project.company_id:
        return False
    if current_user.role == UserRole.MANAGER:
        return True
    return False


async def can_create_project(current_user: User) -> bool:
    return getattr(current_user, "role", UserRole.ADMIN) in {UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN}


async def validate_project_assignees(
    current_user: User,
    company_id: str,
    assignee_ids: list[str],
) -> list[User]:
    clean_ids = []
    for user_id in assignee_ids:
        user_id = str(user_id).strip()
        if user_id and user_id not in clean_ids:
            clean_ids.append(user_id)

    users = []
    for user_id in clean_ids:
        assignee = await User.get(user_id)
        if not assignee or assignee.company_id != company_id:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Invalid project assignee")
        if current_user.role in {UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN}:
            allowed_roles = {UserRole.MANAGER, UserRole.EMPLOYEE}
            if assignee.role not in allowed_roles:
                raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Project lead must be a Manager or Employee")
        else:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Cannot assign projects")
        users.append(assignee)
    return users


async def check_project_access(project: Project, current_user: User) -> bool:
    """
    Check if user has access to a project based on hierarchical visibility
    
    Returns True if user can access the project, False otherwise
    """
    # Super Admin, Admin, and Manager can access all projects in their company.
    if current_user.role == UserRole.SUPER_ADMIN:
        return True
    if current_user.company_id != project.company_id:
        return False
    if current_user.role in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUB_ADMIN]:
        return True
    
    assignee_ids = set(project_assignee_ids(project))
    if current_user.role == UserRole.LEAD:
        return str(current_user.id) in assignee_ids
    
    elif current_user.role == UserRole.EMPLOYEE:
        return str(current_user.id) in (getattr(project, "team_member_ids", None) or [])
    
    return False


async def ensure_project_access_for_user(project: Project, current_user: User):
    """
    Enforce hierarchical project visibility rules.
    Uses the new check_project_access() function for consistent access control.
    """
    check_company_access(current_user, project.company_id)
    
    # Use the new hierarchical access check
    has_access = await check_project_access(project, current_user)
    if not has_access:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )
