"""
API Dependencies - Authentication and Authorization
"""
from fastapi import Depends, HTTPException, status
from typing import Any, Optional

from app.core.security import get_token_from_header, decode_token_with_blacklist_check
from app.models.department import Department
from app.models.capability import get_capabilities_for_role
from app.models.user import User, UserRole, UserStatus

WORK_MODULES = {
    "projects",
    "tasks",
    "scheduled_work",
    "time_tracking",
    "daily_updates",
    "content_calendar",
    "automation_rules",
}

CRM_MODULES = {
    "sales_overview",
    "leads",
    "sales_pipeline",
    "import_leads",
    "sales_reports",
    "clients",
    "companies",
    "contacts",
    "client_calendar",
    "client_insights",
    "meta_messages",
    "meta_settings",
    "publishing_centre",
    "social_accounts",
    "publishing_analytics",
    "integrations",
}

WORKFORCE_MODULES = {
    "attendance",
    "live_attendance",
    "attendance_reports",
    "leave_management",
}

FINANCE_MODULES = {"invoices", "transactions"}
AI_MODULES = {"ai_assistant", "ai_content_assistant"}

def _normalize_role(role: Any) -> UserRole:
    if isinstance(role, UserRole):
        return role
    if role is None:
        return UserRole.EMPLOYEE
    try:
        return UserRole.from_legacy(str(role))
    except Exception:
        normalized = str(role).strip().lower().replace(" ", "_").replace("-", "_")
        try:
            return UserRole(normalized)
        except ValueError:
            return UserRole.EMPLOYEE



async def get_current_user(token: str = Depends(get_token_from_header)) -> User:
    """Get current authenticated user"""
    # Decode token
    payload = await decode_token_with_blacklist_check(token)
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

    # Normalize user role values so downstream guards work consistently.
    if not isinstance(user.role, UserRole):
        user.role = _normalize_role(getattr(user, "role", None))
    if not isinstance(getattr(user, "previous_role", None), UserRole) and getattr(user, "previous_role", None) is not None:
        user.previous_role = _normalize_role(user.previous_role)

    if _normalize_role(getattr(user, "role", None)) != UserRole.SUPER_ADMIN and getattr(user, "company_id", None):
        from app.models.company import Company, CompanyStatus

        company = await Company.get(user.company_id)
        if company and company.status == CompanyStatus.SUSPENDED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "detail": "account_suspended",
                    "code": "account_suspended",
                    "reason": getattr(company, "notes", None) or "manual",
                },
            )
    
    return user


def _module_access_allowed(module_name: str, user_modules: list[str]) -> bool:
    normalized_modules = set(user_modules or [])
    if module_name == "task":
        return "task" in normalized_modules or "tasks_projects" in normalized_modules
    if module_name == "tasks_projects":
        return "tasks_projects" in normalized_modules or "task" in normalized_modules
    if module_name in WORK_MODULES:
        return module_name in normalized_modules or "task" in normalized_modules or "tasks_projects" in normalized_modules
    if module_name == "chat":
        return (
            "chat" in normalized_modules
            or "task" in normalized_modules
            or "tasks_projects" in normalized_modules
        )
    if module_name == "sales_crm":
        return (
            "sales_crm" in normalized_modules
            or "sales" in normalized_modules
            or any(module in normalized_modules for module in CRM_MODULES)
        )
    if module_name == "sales":
        return "sales" in normalized_modules or "sales_crm" in normalized_modules
    if module_name in CRM_MODULES:
        return module_name in normalized_modules or "sales_crm" in normalized_modules or "sales" in normalized_modules
    if module_name == "attendance_leaves":
        return (
            "attendance_leaves" in normalized_modules
            or any(module in normalized_modules for module in WORKFORCE_MODULES)
        )
    if module_name in WORKFORCE_MODULES:
        return module_name in normalized_modules or "attendance_leaves" in normalized_modules
    if module_name == "invoicing_ledger":
        return (
            "invoicing_ledger" in normalized_modules
            or any(module in normalized_modules for module in FINANCE_MODULES)
        )
    if module_name in FINANCE_MODULES:
        return module_name in normalized_modules or "invoicing_ledger" in normalized_modules
    if module_name == "ai_agents":
        return (
            "ai_agents" in normalized_modules
            or any(module in normalized_modules for module in AI_MODULES)
        )
    if module_name in AI_MODULES:
        return module_name in normalized_modules or "ai_agents" in normalized_modules
    return module_name in normalized_modules


# The exact module lists that every pre-permission-system user creation flow
# wrote. Members whose list matches one of these are treated as legacy and keep
# the role-based auto-grants below; members with any other (explicit) list are
# governed strictly by what the admin selected in the Permissions selector.
_LEGACY_MODULE_SETS = {
    frozenset(),
    frozenset({"task"}),
    frozenset({"task", "attendance_leaves"}),
    # NOTE: frozenset({"tasks_projects"}) is deliberately excluded. `tasks_projects`
    # is a NEW id written only by the permission-system flows, so a member created
    # with just "Tasks & Projects" selected must be treated as explicit, not
    # legacy (which would auto-grant Sales/Tickets/Recruitment). Kept in sync with
    # `isLegacyModules` in frontend/src/config/modulePermissions.js.
}


def _is_legacy_module_config(modules) -> bool:
    """True when the module list is one of the pre-member-permissions defaults.

    Kept in sync with `isLegacyModules` in frontend/src/config/modulePermissions.js.
    """
    return frozenset(modules or []) in _LEGACY_MODULE_SETS


def require_module(module_name: str):
    """Dependency factory to ensure the current user has access to a specific module.

    Module access = role auto-grants (legacy members only) OR the member's own
    explicit module list. Once a member has an explicit list (set through the
    Permissions selector at create/edit time), that list is authoritative.
    """
    async def _checker(current_user: User = Depends(get_current_user)) -> User:
        current_role = _normalize_role(getattr(current_user, "role", None))
        # Super Admin, Admin, and Sub Admin have full access to all modules
        if current_role == UserRole.SUPER_ADMIN or current_role == UserRole.ADMIN or current_role == UserRole.SUB_ADMIN:
            return current_user
        # Legacy members (pre-permission-system module lists) keep the role
        # auto-grants so they never lose access after this change ships.
        legacy_config = _is_legacy_module_config(getattr(current_user, "modules", []) or [])
        if (
            legacy_config
            and module_name in {"sales", "sales_crm", "tickets", "task", "tasks_projects", *WORK_MODULES, *CRM_MODULES}
            and current_role in {UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}
        ):
            return current_user
        if (
            legacy_config
            and module_name == "recruitment"
            and current_role in {UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}
        ):
            return current_user
        modules = getattr(current_user, "modules", []) or []
        if not _module_access_allowed(module_name, modules):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access to module '{module_name}' is forbidden"
            )
        return current_user
    return _checker


def require_capability(capability: str):
    """Dependency factory to ensure the current user has a department capability."""
    async def _checker(current_user: User = Depends(get_current_user)) -> User:
        current_role = _normalize_role(getattr(current_user, "role", None))
        if current_role == UserRole.SUPER_ADMIN:
            return current_user
        if current_role == UserRole.ADMIN:
            return current_user
        if current_role == UserRole.SUB_ADMIN:
            return current_user
        department_id = getattr(current_user, "department_id", None)
        if not department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing capability: {capability}",
            )
        department = await Department.get(department_id)
        if not department or department.company_id != current_user.company_id or department.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing capability: {capability}",
            )
        allowed = await get_capabilities_for_role(
            department.department_type,
            current_user.role,
            current_user.company_id,
        )
        if capability not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing capability: {capability}",
            )
        return current_user
    return _checker


async def get_current_super_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require Super Admin role"""
    current_role = _normalize_role(getattr(current_user, "role", None))
    if current_role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin access required"
        )
    return current_user


async def get_current_company_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require Admin role or Super Admin"""
    current_role = _normalize_role(getattr(current_user, "role", None))
    if current_role not in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def get_current_lead(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require Lead, Manager, Admin, or Super Admin role"""
    allowed_roles = {UserRole.LEAD, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN}
    current_role = _normalize_role(getattr(current_user, "role", None))
    if current_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lead access required"
        )
    return current_user


async def get_current_company_admin_or_lead(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require Admin, Manager, Lead, or Super Admin role"""
    allowed_roles = {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}
    current_role = _normalize_role(getattr(current_user, "role", None))
    if current_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin, Manager, or Lead access required"
        )
    return current_user


async def get_current_company_admin_or_manager(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require a company admin, sub-admin, manager, or super admin.

    This intentionally excludes Leads: biometric employee mapping is a
    company-level attendance administration action, not a reporting-line
    action.
    """
    allowed_roles = {
        UserRole.ADMIN,
        UserRole.SUB_ADMIN,
        UserRole.MANAGER,
        UserRole.SUPER_ADMIN,
    }
    current_role = _normalize_role(getattr(current_user, "role", None))
    if current_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Manager access required",
        )
    return current_user


def check_company_access(user: User, company_id: str):
    """Check if user has access to a specific company"""
    current_role = _normalize_role(getattr(user, "role", None))
    if current_role == UserRole.SUPER_ADMIN:
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
                # Check company access if provided (compare normalized strings so
                # ObjectId-vs-str company_id representations never cause a false
                # "Project not found" for a project the user can actually see).
                if company_id and str(project.company_id) != str(company_id):
                    project = None
                else:
                    # Use user-provided project_id if available, otherwise use MongoDB _id
                    user_project_id = project.project_id if project.project_id else str(project.id)
        except Exception:
            pass
    
    return project, user_project_id
