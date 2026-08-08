"""
User Management Endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, Form, Query
from fastapi import status as http_status
from typing import List, Optional
from datetime import datetime

from app.models.user import User, UserRole, UserStatus, Admin, SubAdmin, Manager, Lead, Employee, CompanyAdmin
from app.models.project import Project
from app.models.department import Department
from app.models.notification import Notification, NotificationType
from app.core.security import get_password_hash
from app.core.hierarchy import (
    validate_hierarchy_creation,
    get_available_reporting_options,
    get_creatable_roles
)
from app.api.dependencies import (
    get_current_user, get_current_super_admin,
    get_current_company_admin, get_current_company_admin_or_lead,
    check_company_access, _module_access_allowed
)
from app.services.user_service import UserService
from app.api.deps import Pagination20, PaginationParams
from app.core.assignable_users import (
    load_assignable_users_for_company,
    resolve_sales_assignment_department,
)
from app.core.clock import utc_now
from app.schemas.admin_permissions import normalize_modules

router = APIRouter()


async def _resolve_department(company_id: Optional[str], department_id: Optional[str]):
    if not department_id:
        return None

    department = await Department.get(department_id)
    if (
        not department
        or department.deleted_at is not None
        or (company_id is not None and department.company_id != company_id)
    ):
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Invalid department",
        )
    return department


async def _build_department_name_map(company_id: Optional[str], users: list[User]) -> dict[str, str]:
    department_ids = {
        str(getattr(user, "department_id", None))
        for user in users
        if getattr(user, "department_id", None)
    }
    if not department_ids or not company_id:
        return {}

    from bson import ObjectId

    department_object_ids = []
    for department_id in department_ids:
        try:
            department_object_ids.append(ObjectId(department_id))
        except Exception:
            continue

    if not department_object_ids:
        return {}

    departments = await Department.find(
        {
            "company_id": company_id,
            "deleted_at": None,
            "_id": {"$in": department_object_ids},
        }
    ).to_list()
    return {str(department.id): department.name for department in departments}


def _department_id_value(user: User) -> Optional[str]:
    department_id = getattr(user, "department_id", None)
    return str(department_id) if department_id else None


async def _notify_department_assignment(
    employee: User,
    department_name: str,
    assigned_by: User,
    previous_department_name: Optional[str] = None,
) -> None:
    action = "assigned to" if not previous_department_name else "moved to"
    message = (
        f"You were {action} the {department_name} department"
        if not previous_department_name
        else f"Your department was changed from {previous_department_name} to {department_name}"
    )
    title = "Department assigned" if not previous_department_name else "Department updated"

    notification = Notification(
        user_id=str(employee.id),
        company_id=employee.company_id,
        type=NotificationType.SYSTEM,
        title=title,
        message=message,
        related_id=str(employee.id),
        related_type="user",
        action_url="/settings",
        metadata={
            "event": "department_assignment",
            "department_id": getattr(employee, "department_id", None),
            "department_name": department_name,
            "previous_department_name": previous_department_name,
            "assigned_by_id": str(assigned_by.id),
            "assigned_by_name": assigned_by.full_name(),
        },
    )
    await notification.insert()

# ==================== NEW HIERARCHICAL RBAC ENDPOINTS ====================
# CRITICAL: These MUST be defined FIRST in the router before any /{param} routes

@router.get("/creatable-roles", name="get_creatable_roles")
async def get_creatable_roles_endpoint(
    current_user: User = Depends(get_current_user)
):
    """Get list of roles that current user can create"""
    try:
        roles = await get_creatable_roles(current_user)
        return {"roles": roles}
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error in get_creatable_roles: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching creatable roles: {str(e)}"
        )


@router.get("/reporting-options", name="get_reporting_options")
async def get_reporting_options(
    target_role: str = Query(...),
    current_user: User = Depends(get_current_user)
):
    """
    Get available reporting options for a target role
    Based on the logged-in user's access level
    """
    try:
        target_role_enum = UserRole(target_role)
    except ValueError:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {target_role}"
        )
    
    # Check if current user can create this role
    if not current_user.can_create_role(target_role_enum):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail=f"You cannot create {target_role}"
        )
    
    options = await get_available_reporting_options(current_user, target_role_enum)
    
    return {
        "options": options,
        "target_role": target_role,
        "requires_reporting": target_role_enum not in [UserRole.SUPER_ADMIN, UserRole.ADMIN]
    }


# ==================== USER LISTING AND ASSIGNMENT ENDPOINTS ====================

@router.get("/")
async def list_users(
    company_id: str = None,
    role: str = None,
    status_filter: str = Query(None, alias="status"),
    pagination: PaginationParams = Pagination20,
    current_user: User = Depends(get_current_user)
):
    """List users with hierarchical RBAC filtering."""
    skip, limit = pagination.skip, pagination.limit
    if current_user.role == UserRole.SUPER_ADMIN:
        query = {}
        if company_id:
            query["company_id"] = company_id
    elif current_user.role in [UserRole.ADMIN, UserRole.SUB_ADMIN]:
        query = {"company_id": current_user.company_id}
    elif current_user.role in [UserRole.MANAGER, UserRole.LEAD]:
        subordinates = await current_user.get_all_subordinates()
        visible_ids = {str(current_user.id), *[str(user.id) for user in subordinates]}
        # Also include users from the same department
        department_id = getattr(current_user, "department_id", None)
        if department_id:
            dept_users = await User.find({
                "company_id": current_user.company_id,
                "department_id": department_id,
            }).to_list()
            for dept_user in dept_users:
                visible_ids.add(str(dept_user.id))
        all_users = await User.find({"company_id": current_user.company_id}).to_list()
        filtered_users = [user for user in all_users if str(user.id) in visible_ids]
        if role:
            filtered_users = [user for user in filtered_users if user.role.value == role]
        if status_filter:
            filtered_users = [user for user in filtered_users if user.status.value == status_filter]
        users = filtered_users[skip:skip + limit]
        total = len(filtered_users)
        department_name_map = await _build_department_name_map(current_user.company_id, users)
        return {
            "users": [_serialize_user_for_list(user, department_name_map) for user in users],
            "total": total,
            "skip": skip,
            "limit": limit,
        }
    elif current_user.role == UserRole.EMPLOYEE:
        users = [current_user] if not status_filter or current_user.status.value == status_filter else []
        department_name_map = await _build_department_name_map(current_user.company_id, users)
        return {
            "users": [_serialize_user_for_list(user, department_name_map) for user in users],
            "total": len(users),
            "skip": skip,
            "limit": limit,
        }
    else:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Access denied")

    if role:
        query["role"] = role
    if status_filter:
        query["status"] = status_filter
    users = await User.find(query).skip(skip).limit(limit).to_list()
    total = await User.find(query).count()
    department_name_map = await _build_department_name_map(query.get("company_id"), users)
    return {
        "users": [_serialize_user_for_list(user, department_name_map) for user in users],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


def _serialize_user_for_list(user: User, department_name_map: dict[str, str]) -> dict:
    department_id = _department_id_value(user)
    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role.value,
        "status": user.status.value,
        "company_id": user.company_id,
        "reports_to": user.reports_to,
        "department_id": department_id,
        "department_name": department_name_map.get(department_id, None),
        "modules": getattr(user, "modules", []),
        "active_module": getattr(user, "active_module", None),
        "created_at": user.created_at,
    }


@router.get("/assignable")
async def get_assignable_users(
    current_user: User = Depends(get_current_user),
    for_tickets: bool = Query(False, description="If True, include broader ticket assignment options"),
    project_id: Optional[str] = Query(None, description="Filter assignable users by project"),
    context: Optional[str] = Query(None, description="Assignment context, e.g. 'sales_lead' for Sales lead ownership"),
    department_id: Optional[str] = Query(None, description="Optional department scope for the assignment context"),
):
    """Get users that can be assigned work. Project lead is assignment-level, not a user role.

    For ``context=sales_lead`` the list is scoped exactly like the Sales lead
    engine's ``validate_target_user`` (company-wide for Admin/Sub Admin/Super
    Admin, otherwise the actor's department or the explicit ``department_id``),
    so the owner dropdown always matches what lead creation will accept.
    """
    # Valid owner roles remain: UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE.
    users: list[User] = []

    if current_user.company_id:
        if context == "sales_lead":
            users = await load_assignable_users_for_company(
                current_user.company_id,
                department_id=resolve_sales_assignment_department(
                    current_user,
                    department_id=department_id,
                ),
            )
        else:
            users = await load_assignable_users_for_company(current_user.company_id)

    if project_id:
        project = await Project.get(project_id)
        if project and project.company_id == current_user.company_id:
            project_user_ids = set(getattr(project, "team_member_ids", None) or [])
            project_user_ids.update(str(item) for item in (getattr(project, "assigned_user_ids", None) or []))
            if getattr(project, "lead_id", None):
                project_user_ids.add(str(project.lead_id))
            if project_user_ids:
                users = [user for user in users if str(user.id) in project_user_ids]

    return {
        "users": [
            {
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role.value,
                "status": user.status.value,
                "isActive": True,
                "deleted": False,
                "department_id": getattr(user, "department_id", None),
                "department": getattr(user, "department", None),
            }
            for user in users
        ]
    }

@router.get("/my-team")
async def get_my_team(
    current_user: User = Depends(get_current_user)
):
    """Get team members for the current user based on hierarchy."""
    try:
        if current_user.role not in [UserRole.LEAD, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )

        team_members = []
        lead = None

        if current_user.role == UserRole.LEAD:
            lead = await Lead.get(str(current_user.id))
            if not lead:
                return {"team_members": [], "total": 0, "lead_info": {"id": str(current_user.id), "first_name": current_user.first_name, "last_name": current_user.last_name, "team_name": None}}

            managed_ids = getattr(lead, "managed_employee_ids", []) or []
            employees_by_lead = await Employee.find({
                "company_id": current_user.company_id,
                "status": UserStatus.ACTIVE,
                "lead_id": str(current_user.id)
            }).to_list()

            employees_by_managed = []
            if managed_ids:
                employees_by_managed = await Employee.find({
                    "company_id": current_user.company_id,
                    "status": UserStatus.ACTIVE,
                    "_id": {"$in": managed_ids}
                }).to_list()

            all_employee_ids = set()
            for emp in employees_by_lead + employees_by_managed:
                if str(emp.id) not in all_employee_ids:
                    all_employee_ids.add(str(emp.id))
                    team_members.append(emp)

        elif current_user.role == UserRole.MANAGER:
            subordinates = await current_user.get_all_subordinates()
            subordinate_ids = {str(sub.id) for sub in subordinates}
            subordinate_ids.add(str(current_user.id))

            all_users = await User.find({
                "company_id": current_user.company_id,
                "status": UserStatus.ACTIVE,
            }).to_list()
            team_members = [
                user for user in all_users
                if str(user.id) in subordinate_ids and str(user.id) != str(current_user.id)
            ]

        else:
            all_users = await User.find({
                "company_id": current_user.company_id,
                "status": UserStatus.ACTIVE,
            }).to_list()
            team_members = [
                user
                for user in all_users
                if getattr(user, "role", None) in [UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE]
            ]

        from app.models.task import Task
        from app.models.ticket import Ticket

        team_data = []
        for employee in team_members:
            try:
                task_count = await Task.find({
                    "assigned_to": str(employee.id),
                    "company_id": current_user.company_id
                }).count()
            except Exception:
                task_count = 0

            try:
                ticket_count = await Ticket.find({
                    "assigned_to": str(employee.id),
                    "company_id": current_user.company_id
                }).count()
            except Exception:
                ticket_count = 0

            team_data.append({
                "id": str(employee.id),
                "email": employee.email,
                "first_name": employee.first_name,
                "last_name": employee.last_name,
                "role": getattr(employee.role, "value", employee.role),
                "status": getattr(employee.status, "value", employee.status),
                "department_id": getattr(employee, "department_id", None),
                "designation": getattr(employee, "designation", None),
                "phone": getattr(employee, "phone", None),
                "created_at": getattr(employee, "created_at", None),
                "task_count": task_count,
                "ticket_count": ticket_count,
            })

        return {
            "team_members": team_data,
            "total": len(team_data),
            "lead_info": {
                "id": str(getattr(lead, "id", current_user.id)),
                "first_name": getattr(lead, "first_name", current_user.first_name),
                "last_name": getattr(lead, "last_name", current_user.last_name),
                "team_name": getattr(lead, "team_name", None),
            }
        }
    except HTTPException:
        raise
    except Exception as error:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error loading my team: {error}", exc_info=True)
        return {
            "team_members": [],
            "total": 0,
            "lead_info": {
                "id": str(current_user.id),
                "first_name": current_user.first_name,
                "last_name": current_user.last_name,
                "team_name": None,
            },
        }


# ==================== USER CRUD ENDPOINTS ====================
# NOTE: Parameterized routes come AFTER all specific routes

@router.get("/detail/{user_id}")
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get user by ID"""
    
    # SECOND: Reject non-ObjectId strings
    # ObjectId format: exactly 24 hex characters
    import re
    if not re.match(r'^[0-9a-fA-F]{24}$', user_id):
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    try:
        from bson import ObjectId
        # Validate it's a valid ObjectId before calling User.get()
        ObjectId(user_id)
        user = await User.get(user_id)
    except (ValueError, Exception) as e:
        # Invalid ObjectId format or user not found
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not user:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check access
    if current_user.role != UserRole.SUPER_ADMIN:
        if user.company_id != current_user.company_id:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    department_name = None
    department_id = getattr(user, "department_id", None)
    if department_id and user.company_id:
        department_map = await _build_department_name_map(user.company_id, [user])
        department_name = department_map.get(department_id)

    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role.value,
        "status": user.status.value,
        "company_id": user.company_id,
        "phone": user.phone,
        "avatar": user.avatar,
        "department_id": department_id,
        "department_name": department_name,
        "created_at": user.created_at,
        "last_login": user.last_login,
    }


@router.post("/create-lead")
async def create_lead_disabled(current_user: User = Depends(get_current_user)):
    raise HTTPException(
        status_code=http_status.HTTP_410_GONE,
        detail="Lead is a project assignment, not a user role"
    )


@router.post("/create-employee")
async def create_employee(
    email: str = Form(...),
    password: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    lead_id: Optional[str] = Form(None),
    reports_to: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    designation: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    modules: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead)
):

    print("\n========== CREATE EMPLOYEE API ==========")
    print(f"[DEBUG] Email          : {email}")
    print(f"[DEBUG] Password       : {password}")
    print(f"[DEBUG] First Name     : {first_name}")
    print(f"[DEBUG] Last Name      : {last_name}")
    print(f"[DEBUG] Lead ID        : {lead_id}")
    print(f"[DEBUG] Department ID  : {department_id}")
    print(f"[DEBUG] Designation    : {designation}")
    print(f"[DEBUG] Phone          : {phone}")
    print(f"[DEBUG] Current User ID: {current_user.id}")
    print(f"[DEBUG] Current User Email: {current_user.email}")
    print(f"[DEBUG] Current User Role : {current_user.role}")
    print("=========================================\n")
    """Create an Employee (Company Admin or Lead)"""
    # Check if email already exists
    existing = await User.find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    department_doc = await _resolve_department(current_user.company_id, department_id)

    # Reporting manager: explicit selection wins, otherwise default to the
    # creator for Manager/Lead. Legacy lead_id stays in sync when the chosen
    # reporting manager is a Lead.
    final_lead_id = None
    reports_to_id = reports_to or (str(current_user.id) if current_user.role in [UserRole.MANAGER, UserRole.LEAD] else None)
    if reports_to:
        reports_to_user = await User.get(reports_to)
        if not reports_to_user or reports_to_user.company_id != current_user.company_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid reporting manager",
            )
        if reports_to_user.role == UserRole.LEAD:
            final_lead_id = reports_to

    # Create Employee
    # Permissions: normalize + privilege-limit the requested modules. When the
    # creator sends none, the legacy employee defaults are preserved.
    parsed_modules = _resolve_new_user_modules(current_user, _form_or_none(modules))
    employee = Employee(
        email=email,
        password_hash=get_password_hash(password),
        first_name=first_name,
        last_name=last_name,
        company_id=current_user.company_id,
        lead_id=final_lead_id,
        reports_to=reports_to_id,
        department_id=department_id if department_doc else None,
        designation=designation,
        phone=phone,
        status=UserStatus.ACTIVE,
        modules=parsed_modules,
        active_module=parsed_modules[0] if parsed_modules else "task"
    )
    await UserService.update_hierarchy_ancestors(employee)
    await employee.insert()
    
    if department_doc:
        await _notify_department_assignment(
            employee=employee,
            department_name=department_doc.name,
            assigned_by=current_user,
        )
    
    # Queue welcome email to the new Employee
    try:
        from app.worker.tasks.email_tasks import send_welcome_email_task
        send_welcome_email_task.delay(
            email,
            password,
            first_name,
            last_name,
            "EMPLOYEE",
            f"{current_user.first_name} {current_user.last_name}",
        )
    except Exception as e:
        # Log error but don't fail the request
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send welcome email to {email}: {str(e)}")
    
    return {
        "message": "Employee created successfully",
        "user_id": str(employee.id),
        "assigned_to_lead": final_lead_id
    }


@router.patch("/detail/{user_id}/status")
async def update_user_status(
    user_id: str,
    new_status: UserStatus,
    current_user: User = Depends(get_current_company_admin)
):
    """Update user status"""
    user = await User.get(user_id)
    
    if not user:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check access
    check_company_access(current_user, user.company_id)
    
    user.status = new_status
    user.updated_at = utc_now()
    await user.save()
    
    return {"message": "User status updated successfully"}


@router.delete("/detail/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead)
):
    """Delete user (soft delete by setting status to inactive)"""
    user = await User.get(user_id)
    
    if not user:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check access
    check_company_access(current_user, user.company_id)
    
    # Prevent all users from deleting themselves
    if str(user.id) == str(current_user.id):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You cannot delete yourself"
        )
    
    # Team Leader (Lead) restrictions
    if current_user.role == UserRole.LEAD:
        # Cannot delete admins
        is_user_admin = user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
        if is_user_admin or user.role == UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Team leaders cannot delete admins"
            )
        
        # Cannot delete other leads
        if user.role == UserRole.LEAD:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Team leaders cannot delete other leads"
            )
        
        # Can only delete employees in their team
        if user.role != UserRole.EMPLOYEE:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Team leaders can only delete team members (employees)"
            )
        
        # Check if employee is in the lead's team
        is_team_member = False
        
        # Check by lead_id
        if hasattr(user, 'lead_id') and user.lead_id == str(current_user.id):
            is_team_member = True
        
        # Check by managed_employee_ids
        if not is_team_member:
            lead = await Lead.get(str(current_user.id))
            if lead:
                managed_ids = getattr(lead, "managed_employee_ids", []) or []
                if str(user.id) in managed_ids:
                    is_team_member = True
        
        if not is_team_member:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="You can only delete employees in your team"
            )
    
    # Handle Cleanup before deletion
    # If Employee, remove from Lead's managed list
    if user.role == UserRole.EMPLOYEE and getattr(user, 'lead_id', None):
        lead = await Lead.get(user.lead_id)
        if lead and lead.managed_employee_ids and str(user.id) in lead.managed_employee_ids:
            lead.managed_employee_ids.remove(str(user.id))
            await lead.save()
            
    # If Lead, clear lead_id from assigned employees
    if user.role == UserRole.LEAD:
        employees = await Employee.find(Employee.lead_id == str(user.id)).to_list()
        for emp in employees:
            emp.lead_id = None
            await emp.save()

    # Hard delete the user
    await user.delete()
    
    return {"message": "User permanently deleted"}


@router.put("/detail/{user_id}")
async def update_user(
    user_id: str,
    first_name: Optional[str] = Form(None),
    last_name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    designation: Optional[str] = Form(None),
    reports_to: Optional[str] = Form(None),
    modules: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead)
):
    """Update basic user profile fields (and module permissions when provided)"""
    user = await User.get(user_id)

    if not user:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Access control: company-scoped roles (Admin/Sub Admin/Manager/Lead per
    # get_current_company_admin_or_lead) may update any user in their company.
    # No creator/department/team restriction - a manager (or lead) can edit an
    # employee regardless of who created them or which department they belong to.
    check_company_access(current_user, user.company_id)

    # Update fields if provided
    if first_name:
        user.first_name = first_name
    if last_name:
        user.last_name = last_name
    if email:
        normalized_email = email.lower()
        # Only check uniqueness if changing email
        if normalized_email != user.email:
            existing = await User.find_one({"email": normalized_email})
            if existing and existing.id != user.id:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use"
                )
        user.email = normalized_email
    if phone is not None:
        user.phone = phone
    if department_id is not None:
        previous_department_name = None
        current_department_id = getattr(user, "department_id", None)
        if current_department_id and current_department_id != department_id:
            current_department_map = await _build_department_name_map(current_user.company_id, [user])
            previous_department_name = current_department_map.get(current_department_id)
        department_doc = await _resolve_department(current_user.company_id, department_id)
        user.department_id = department_id if department_doc else None
        if department_doc and department_id != current_department_id:
            await _notify_department_assignment(
                employee=user,
                department_name=department_doc.name,
                assigned_by=current_user,
                previous_department_name=previous_department_name,
            )
    if reports_to is not None:
        reports_to_value = reports_to or None
        if reports_to_value:
            reports_to_user = await User.get(reports_to_value)
            if not reports_to_user or reports_to_user.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Invalid reporting manager",
                )
            user.reports_to = reports_to_value
            # Legacy: keep lead_id in sync when the reporting manager is a Lead.
            # lead_id only exists on the Employee subclass, so guard for it.
            if hasattr(user, "lead_id"):
                user.lead_id = reports_to_value if reports_to_user.role == UserRole.LEAD else None
        else:
            user.reports_to = None
            if hasattr(user, "lead_id"):
                user.lead_id = None
        await UserService.update_hierarchy_ancestors(user)
    modules = _form_or_none(modules)
    if modules is not None:
        parsed_modules = normalize_modules(modules, require_tasks_projects=True)
        user.modules = _restrict_modules_for_creator(current_user, parsed_modules)
        user.active_module = user.modules[0] if user.modules else "task"
    user.updated_at = utc_now()
    await user.save()

    return {"message": "User updated successfully"}



def _form_or_none(value):
    """FastAPI Form defaults bind a ``Form()`` sentinel on direct function
    calls (e.g. unit tests); FastAPI injection always provides str or None.
    Only ``None`` / ``str`` / ``list`` are valid module values, so anything
    else (the sentinel) is treated as "not provided"."""
    if value is None or isinstance(value, (str, list)):
        return value
    return None


def _module_allowed_for_user(user: User, module_id: str) -> bool:
    if user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        return True
    return module_id in (getattr(user, "modules", []) or [])


def _restrict_modules_for_creator(creator: User, requested: List[str]) -> List[str]:
    """Privilege-escalation guard for module assignment.

    Admins and Super Admins may grant any catalog module. Every other creator
    (Sub Admin / Manager / Lead / Employee) may only grant modules they are
    allowed to access themselves (alias-aware, e.g. "task" covers
    "tasks_projects"). If nothing the creator requested survives, fall back to
    the modules the creator holds themselves, so the new account stays usable
    without ever exceeding the creator's own authority.
    """
    if creator.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return requested
    creator_modules = getattr(creator, "modules", []) or []
    restricted = [module for module in requested if _module_access_allowed(module, creator_modules)]
    if not restricted:
        restricted = list(creator_modules)
    return restricted


def _resolve_new_user_modules(creator: User, modules: Optional[str]) -> List[str]:
    """Normalize + privilege-limit the module list for a newly created user.

    ``None`` (creator did not send modules) keeps the legacy employee defaults
    so existing callers/behavior are untouched.
    """
    if modules is None:
        return ["task", "attendance_leaves"]
    parsed = normalize_modules(modules, require_tasks_projects=True)
    return _restrict_modules_for_creator(creator, parsed)
# ==================== CREATE USER ENDPOINT ====================

@router.post("/create-user")
async def create_user_hierarchical(
    email: str = Form(...),
    password: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    role: str = Form(...),
    reports_to: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    designation: Optional[str] = Form(None),
    team_name: Optional[str] = Form(None),
    modules: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """
    Unified user creation endpoint with hierarchical RBAC validation
    Supports: Super Admin, Admin, Manager, Lead, Employee
    """
    # Validate role
    try:
        target_role = UserRole(role)
    except ValueError:
        if role == "company_admin":
            target_role = UserRole.ADMIN
        else:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role: {role}"
            )
    if target_role == UserRole.LEAD:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Lead is a project assignment, not a user role"
        )
    # Validate hierarchy
    is_valid, error_msg = await validate_hierarchy_creation(
        creator=current_user,
        target_role=target_role,
        reports_to_id=reports_to
    )
    
    if not is_valid:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # Check if email already exists
    existing = await User.find_one({"email": email.lower()})
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Determine company_id
    company_id = current_user.company_id if current_user.company_id else None
    
    parsed_modules = normalize_modules(_form_or_none(modules) or [], require_tasks_projects=False)
    if target_role == UserRole.SUB_ADMIN and not parsed_modules:
        parsed_modules = normalize_modules(["tasks_projects"], require_tasks_projects=False)
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        # Privilege-escalation guard: the creator can only grant modules they
        # are allowed to access themselves (alias-aware). Admins are unrestricted.
        parsed_modules = _restrict_modules_for_creator(current_user, parsed_modules)
    if current_user.role == UserRole.SUB_ADMIN:
        if target_role == UserRole.SUB_ADMIN:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Sub-admins cannot create other sub-admins")
        if target_role == UserRole.MANAGER and not _module_allowed_for_user(current_user, "tasks_projects"):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Missing authority to create managers")
    active_module = parsed_modules[0] if parsed_modules else "task"

    department_doc = await _resolve_department(company_id, department_id) if company_id else None

    # Create user based on role
    user_data = {
        "email": email.lower(),
        "password_hash": get_password_hash(password),
        "first_name": first_name,
        "last_name": last_name,
        "role": target_role,
        "company_id": company_id,
        "reports_to": reports_to,
        "created_by": str(current_user.id),
        "phone": phone,
        "department_id": department_id if department_doc else None,
        "modules": parsed_modules,
        "active_module": active_module,
        "status": UserStatus.ACTIVE
    }
    
    # Role-specific fields
    if target_role == UserRole.SUB_ADMIN:
        user = SubAdmin(**user_data)
    elif target_role == UserRole.MANAGER:
        user = Manager(**user_data)
        if team_name:
            user.team_name = team_name
    elif target_role == UserRole.LEAD:
        user = Lead(**user_data)
        if team_name:
            user.team_name = team_name
    elif target_role == UserRole.EMPLOYEE:
        user = Employee(**user_data)
        if designation:
            user.designation = designation
        # Legacy: set lead_id if reports_to is a Lead
        if reports_to:
            reports_to_user = await User.get(reports_to)
            if reports_to_user and reports_to_user.role == UserRole.LEAD:
                user.lead_id = reports_to
    elif target_role == UserRole.ADMIN:
        user = Admin(**user_data)
    elif target_role == UserRole.SUPER_ADMIN:
        # Only one Super Admin allowed
        existing_super_admin = await User.find_one(User.role == UserRole.SUPER_ADMIN)
        if existing_super_admin:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Super Admin already exists"
            )
        user = User(**user_data)
        user.role = UserRole.SUPER_ADMIN
    else:
        user = User(**user_data)
    
    # Check plan limits before creating user (only for non-super-admin users)
    if company_id and target_role != UserRole.SUPER_ADMIN:
        from app.core.usage_tracking import track_usage_and_enforce_limits
        
        # Determine resource type based on role
        resource_type = "users"  # Default
        if target_role == UserRole.SUB_ADMIN:
            resource_type = "users"
        elif target_role == UserRole.MANAGER:
            resource_type = "managers"
        elif target_role == UserRole.LEAD:
            resource_type = "leads"
        elif target_role == UserRole.EMPLOYEE:
            resource_type = "employees"
        
        is_allowed, current_usage, limit = await track_usage_and_enforce_limits(
            company_id=company_id,
            resource_type=resource_type,
            increment=1
        )
        
        if not is_allowed:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail=f"Plan limit exceeded for {resource_type}. Current: {current_usage}, Limit: {limit}. Please upgrade your plan or contact support."
            )
    
    from app.services.user_service import UserService
    await UserService.update_hierarchy_ancestors(user)
    await user.insert()
    
    # Update Lead's managed_employee_ids if Employee reports to Lead
    if target_role == UserRole.EMPLOYEE and reports_to:
        reports_to_user = await User.get(reports_to)
        if reports_to_user and reports_to_user.role == UserRole.LEAD:
            lead = await Lead.get(reports_to)
            if lead:
                managed_ids = getattr(lead, "managed_employee_ids", []) or []
                if not isinstance(managed_ids, list):
                    managed_ids = []
                employee_id_str = str(user.id)
                if employee_id_str not in managed_ids:
                    managed_ids.append(employee_id_str)
                    lead.managed_employee_ids = managed_ids
                    await lead.save()
    
    # Queue welcome email
    try:
        from app.worker.tasks.email_tasks import send_welcome_email_task
        send_welcome_email_task.delay(
            email,
            password,
            first_name,
            last_name,
            target_role.value.upper(),
            current_user.full_name(),
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send welcome email to {email}: {str(e)}")
    
    return {
        "message": f"{target_role.value.title()} created successfully",
        "user_id": str(user.id),
        "role": target_role.value,
        "reports_to": reports_to
    }
