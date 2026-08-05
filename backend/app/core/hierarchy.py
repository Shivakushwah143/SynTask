"""
Hierarchical RBAC Validation and Helper Functions
"""
from typing import List, Optional
from app.models.user import User, UserRole


def _can_role_report_to_role(target_role: UserRole, manager_role: UserRole) -> bool:
    """Check if target_role can report to manager_role without creating a User object"""
    # Super Admin doesn't report to anyone
    if target_role == UserRole.SUPER_ADMIN:
        return False
    
    # Admin doesn't report to anyone
    if target_role == UserRole.ADMIN:
        return False
    
    # Manager can report to Admin or another Manager
    if target_role == UserRole.MANAGER:
        return manager_role in [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER]
    
    # Lead can report only to Manager
    if target_role == UserRole.LEAD:
        return manager_role == UserRole.MANAGER
    
    # Employee can report only to Lead
    if target_role == UserRole.EMPLOYEE:
        return manager_role in [UserRole.MANAGER, UserRole.SUB_ADMIN, UserRole.ADMIN]
    
    return False


async def validate_hierarchy_creation(
    creator: User,
    target_role: UserRole,
    reports_to_id: Optional[str] = None
) -> tuple[bool, Optional[str]]:
    """
    Validate if creator can create a user with target_role reporting to reports_to_id
    
    Returns: (is_valid, error_message)
    """
    # Check if creator can create this role
    if not creator.can_create_role(target_role):
        return False, f"{creator.role.value} cannot create {target_role.value}"
    
    # Super Admin and Admin don't report to anyone
    if target_role in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN]:
        if reports_to_id:
            return False, f"{target_role.value} cannot report to anyone"
        return True, None
    
    # For other roles, reports_to is required
    if not reports_to_id:
        return False, f"{target_role.value} must report to someone"
    
    # Validate reports_to user exists and has correct role
    reports_to_user = await User.get(reports_to_id)
    if not reports_to_user:
        return False, "Reporting manager not found"
    
    # Check if target_role can report to reports_to_user's role
    # Instead of creating a User object, validate directly based on role hierarchy rules
    if not _can_role_report_to_role(target_role, reports_to_user.role):
        return False, f"{target_role.value} cannot report to {reports_to_user.role.value}"
    
    # Ensure reports_to_user is in the same company (if applicable)
    if creator.company_id and reports_to_user.company_id != creator.company_id:
        return False, "Reporting manager must be in the same company"
    
    # Note: For NEW user creation, circular reference checks are not needed because:
    # - The new user doesn't exist yet
    # - No one can report to a user that doesn't exist
    # - Therefore, it's impossible to create a circular reference with a new user
    # 
    # Valid hierarchies that should be allowed:
    # - Admin creates Lead → Lead reports to Manager (who reports to Admin) ✓
    # - Admin creates Employee → Employee reports to Lead (who reports to Manager who reports to Admin) ✓
    #
    # Circular reference checks are only relevant when UPDATING existing users' reporting relationships
    
    return True, None


async def _would_create_circular_reference(creator: User, reports_to_id: str) -> bool:
    """Check if assigning reports_to_id would create a circular reference"""
    # Get all subordinates of creator
    creator_subordinates = await creator.get_all_subordinates()
    creator_subordinate_ids = {str(sub.id) for sub in creator_subordinates}
    
    # If reports_to_id is a subordinate of creator, it's circular
    if reports_to_id in creator_subordinate_ids:
        return True
    
    # Check if reports_to_user reports to creator or creator's subordinates
    reports_to_user = await User.get(reports_to_id)
    if reports_to_user:
        reports_to_managers = await reports_to_user.get_all_managers()
        reports_to_manager_ids = {str(mgr.id) for mgr in reports_to_managers}
        
        if str(creator.id) in reports_to_manager_ids:
            return True
    
    return False


async def get_available_reporting_options(
    creator: User,
    target_role: UserRole
) -> List[dict]:
    """
    Get list of users that target_role can report to, based on creator's access
    
    Returns: List of {id, name, role, email} dicts
    """
    options = []
    
    # Super Admin and Admin don't report to anyone
    if target_role in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN]:
        return []
    
    # Manager can report to Admin or Manager
    if target_role == UserRole.MANAGER:
        # Get all Admins and Managers under creator
        if creator.role == UserRole.SUPER_ADMIN:
            # Super Admin can see all Admins
            admins = await User.find(User.role == UserRole.ADMIN).to_list()
            options.extend([{
                "id": str(admin.id),
                "name": admin.full_name(),
                "role": admin.role.value,
                "email": admin.email
            } for admin in admins])
            
            # Get all Managers
            managers = await User.find(User.role == UserRole.MANAGER).to_list()
            options.extend([{
                "id": str(mgr.id),
                "name": mgr.full_name(),
                "role": mgr.role.value,
                "email": mgr.email
            } for mgr in managers])
        elif creator.role == UserRole.ADMIN:
            # Admin can see themselves (optional) and all Managers under them
            options.append({
                "id": str(creator.id),
                "name": creator.full_name(),
                "role": creator.role.value,
                "email": creator.email
            })
            
            # Get all Managers in the same company
            managers = await User.find(
                User.role == UserRole.MANAGER,
                User.company_id == creator.company_id
            ).to_list()
            options.extend([{
                "id": str(mgr.id),
                "name": mgr.full_name(),
                "role": mgr.role.value,
                "email": mgr.email
            } for mgr in managers])
        elif creator.role == UserRole.MANAGER:
            # Manager can see their manager and all Managers in their hierarchy
            if creator.reports_to:
                manager = await User.get(creator.reports_to)
                if manager:
                    options.append({
                        "id": str(manager.id),
                        "name": manager.full_name(),
                        "role": manager.role.value,
                        "email": manager.email
                    })
            
            # Get all Managers in same company (or under same Admin)
            managers = await User.find(
                User.role == UserRole.MANAGER,
                User.company_id == creator.company_id
            ).to_list()
            options.extend([{
                "id": str(mgr.id),
                "name": mgr.full_name(),
                "role": mgr.role.value,
                "email": mgr.email
            } for mgr in managers])
    
    # Lead can report only to Manager
    elif target_role == UserRole.LEAD:
        if creator.role == UserRole.ADMIN:
            # Admin can see all Managers under them
            managers = await User.find(
                User.role == UserRole.MANAGER,
                User.company_id == creator.company_id
            ).to_list()
            options.extend([{
                "id": str(mgr.id),
                "name": mgr.full_name(),
                "role": mgr.role.value,
                "email": mgr.email
            } for mgr in managers])
        elif creator.role == UserRole.MANAGER:
            # Manager can see themselves and other Managers
            options.append({
                "id": str(creator.id),
                "name": creator.full_name(),
                "role": creator.role.value,
                "email": creator.email
            })
            
            # Get other Managers in same company
            managers = await User.find(
                User.role == UserRole.MANAGER,
                User.company_id == creator.company_id,
                User.id != creator.id
            ).to_list()
            options.extend([{
                "id": str(mgr.id),
                "name": mgr.full_name(),
                "role": mgr.role.value,
                "email": mgr.email
            } for mgr in managers])
    
    # Employee can report only to Lead
    elif target_role == UserRole.EMPLOYEE:
        if creator.role == UserRole.ADMIN:
            # Admin can see all Leads under all Managers
            leads = await User.find(
                User.role == UserRole.LEAD,
                User.company_id == creator.company_id
            ).to_list()
            options.extend([{
                "id": str(lead.id),
                "name": lead.full_name(),
                "role": lead.role.value,
                "email": lead.email
            } for lead in leads])
        elif creator.role == UserRole.MANAGER:
            # Manager can see all Leads under them and other Managers
            # Get all Leads that report to Managers in same company
            managers = await User.find(
                User.role == UserRole.MANAGER,
                User.company_id == creator.company_id
            ).to_list()
            manager_ids = [str(m.id) for m in managers]
            manager_ids.append(str(creator.id))
            
            # Use MongoDB $in operator with raw query
            leads = await User.find({
                "role": UserRole.LEAD.value,
                "reports_to": {"$in": manager_ids}
            }).to_list()
            options.extend([{
                "id": str(lead.id),
                "name": lead.full_name(),
                "role": lead.role.value,
                "email": lead.email
            } for lead in leads])
        elif creator.role == UserRole.LEAD:
            # Lead can see themselves
            options.append({
                "id": str(creator.id),
                "name": creator.full_name(),
                "role": creator.role.value,
                "email": creator.email
            })
    
    return options


async def get_creatable_roles(creator: User) -> List[str]:
    """Get list of roles that creator can create"""
    roles = []
    
    if creator.role == UserRole.SUPER_ADMIN:
        roles.append(UserRole.ADMIN.value)
    elif creator.role == UserRole.ADMIN:
        roles.extend([UserRole.SUB_ADMIN.value, UserRole.MANAGER.value, UserRole.EMPLOYEE.value])
    elif creator.role == UserRole.SUB_ADMIN:
        roles.extend([UserRole.MANAGER.value, UserRole.EMPLOYEE.value])
    elif creator.role == UserRole.MANAGER:
        roles.extend([UserRole.LEAD.value, UserRole.EMPLOYEE.value])
    elif creator.role == UserRole.LEAD:
        roles.append(UserRole.EMPLOYEE.value)
    
    return roles


async def get_team_member_ids(user: User) -> List[str]:
    """
    Get list of team member IDs (subordinates) for a user.
    Returns list of user IDs that report directly or indirectly to this user.
    """
    from app.services.user_service import UserService
    return await UserService.get_all_subordinates_ids(str(user.id), user.company_id)



