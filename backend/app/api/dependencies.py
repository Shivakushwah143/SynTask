"""
API Dependencies - Authentication and Authorization
"""
from fastapi import Depends, HTTPException, status
from typing import Optional

from app.core.security import get_token_from_header, decode_token
from app.models.user import User, UserRole, UserStatus


async def get_current_user(token: str = Depends(get_token_from_header)) -> User:
    """Get current authenticated user"""
    # Decode token
    payload = decode_token(token)
    user_id = payload.get("sub")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    # Get user from database
    user = await User.get(user_id)
      
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Check if user is active
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.status.value}"
        )
    
    return user


def require_module(module_name: str):
    """Dependency factory to ensure the current user has access to a specific module."""
    async def _checker(current_user: User = Depends(get_current_user)) -> User:
        modules = getattr(current_user, "modules", []) or []
        if module_name not in modules:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access to module '{module_name}' is forbidden"
            )
        return current_user
    return _checker


async def get_current_super_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require Super Admin role"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin access required"
        )
    return current_user


async def get_current_company_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require Admin role or Super Admin"""
    is_admin = current_user.role == UserRole.ADMIN
    if not is_admin and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def get_current_lead(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require Lead, Manager, Admin, or Super Admin role"""
    allowed_roles = [UserRole.LEAD, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lead access required"
        )
    return current_user


async def get_current_company_admin_or_lead(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require Admin, Manager, Lead, or Super Admin role"""
    allowed_roles = [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN]
    if current_user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin, Manager, or Lead access required"
        )
    return current_user


def check_company_access(user: User, company_id: str):
    """Check if user has access to a specific company"""
    if user.role == UserRole.SUPER_ADMIN:
        return True
    
    if user.company_id != company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this company"
        )
    
    return True


async def get_project_by_id(project_identifier: str, company_id: Optional[str] = None):
    """
    Helper function to find a project by either user-provided project_id or MongoDB _id.
    Returns the project object and the user-provided project_id (if available).
    
    Args:
        project_identifier: Can be either user-provided project_id or MongoDB _id
        company_id: Optional company_id to filter by
    
    Returns:
        tuple: (project_object, user_project_id)
        - project_object: The Project document
        - user_project_id: The user-provided project_id (or MongoDB _id as fallback)
    """
    from app.models.project import Project
    from bson import ObjectId
    
    if not project_identifier:
        return None, None
    
    project = None
    user_project_id = None
    
    # First try to find by user-defined project_id (logical identifier)
    try:
        if company_id:
            project = await Project.find_one(
                Project.project_id == project_identifier,
                Project.company_id == company_id
            )
        else:
            project = await Project.find_one(Project.project_id == project_identifier)
        if project:
            # Prefer custom project_id so tasks store it as FK, not MongoDB _id
            user_project_id = project.project_id if project.project_id else str(project.id)
    except Exception:
        pass
    
    # If not found by project_id, try MongoDB _id
    if not project:
        try:
            # Validate ObjectId format for MongoDB _id lookup
            ObjectId(project_identifier)
            project = await Project.get(project_identifier)
            if project:
                # Check company access if provided
                if company_id and project.company_id != company_id:
                    project = None
                else:
                    # Use user-provided project_id if available, otherwise use MongoDB _id
                    user_project_id = project.project_id if project.project_id else str(project.id)
        except Exception:
            pass
    
    return project, user_project_id

