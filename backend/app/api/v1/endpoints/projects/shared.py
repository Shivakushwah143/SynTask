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
BACKEND_DIR = Path(__file__).parent.parent.parent.parent
PROJECT_UPLOAD_DIR = BACKEND_DIR / settings.UPLOAD_DIR / "projects"
PROJECT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def check_project_access(project: Project, current_user: User) -> bool:
    """
    Check if user has access to a project based on hierarchical visibility
    
    Returns True if user can access the project, False otherwise
    """
    # Super Admin and Admin can access all projects in their company
    if current_user.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN]:
        return True
    
    # For Manager, Lead, Employee - check hierarchical access
    if current_user.role == UserRole.MANAGER:
        # Manager can access if project is assigned to them or their subordinates
        subordinates = await current_user.get_all_subordinates()
        subordinate_ids = [str(sub.id) for sub in subordinates]
        subordinate_ids.append(str(current_user.id))
        return project.assigned_to in subordinate_ids
    
    elif current_user.role == UserRole.LEAD:
        # Lead can access if project is assigned to them, their managers, or their employees
        managers = await current_user.get_all_managers()
        manager_ids = [str(mgr.id) for mgr in managers]
        
        subordinates = await current_user.get_all_subordinates()
        subordinate_ids = [str(sub.id) for sub in subordinates]
        
        visible_ids = [str(current_user.id)] + manager_ids + subordinate_ids
        return project.assigned_to in visible_ids
    
    elif current_user.role == UserRole.EMPLOYEE:
        # Employee can access if project is assigned to them or their managers
        managers = await current_user.get_all_managers()
        manager_ids = [str(mgr.id) for mgr in managers]
        
        visible_ids = [str(current_user.id)] + manager_ids
        return project.assigned_to in visible_ids
    
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


