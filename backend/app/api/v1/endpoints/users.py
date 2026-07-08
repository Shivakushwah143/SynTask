"""
User Management Endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, Form, Query
from fastapi import status as http_status
from typing import List, Optional
from datetime import datetime

from app.models.user import User, UserRole, UserStatus, Admin, Manager, Lead, Employee, CompanyAdmin
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
    check_company_access
)
from app.services.user_service import UserService

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
        getattr(user, "department_id", None)
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
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """List users with hierarchical RBAC filtering"""
    # Super Admin can see all users
    if current_user.role == UserRole.SUPER_ADMIN:
        query = {}
        if company_id:
            query["company_id"] = company_id
        if role:
            query["role"] = role
        if status_filter:
            query["status"] = status_filter
        
        users = await User.find(query).skip(skip).limit(limit).to_list()
        total = await User.find(query).count()
    else:
        # Admin: See all users in their company
        is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
        
        if is_admin:
            query = {"company_id": current_user.company_id}
            if role:
                query["role"] = role
            if status_filter:
                query["status"] = status_filter
            
            users = await User.find(query).skip(skip).limit(limit).to_list()
            total = await User.find(query).count()
        
        # Manager: See all subordinates (recursive)
        elif current_user.role == UserRole.MANAGER:
            subordinates = await current_user.get_all_subordinates()
            subordinate_ids = [str(sub.id) for sub in subordinates]
            subordinate_ids.append(str(current_user.id))  # Include self
            
            query = {
                "company_id": current_user.company_id,
                "_id": {"$in": [sub.id for sub in subordinates] + [current_user.id]}
            }
            if role:
                query["role"] = role
            if status_filter:
                query["status"] = status_filter
            
            # Filter in Python since Beanie doesn't support $in with ObjectId easily
            all_users = await User.find({
                "company_id": current_user.company_id
            }).to_list()
            
            filtered_users = [u for u in all_users if str(u.id) in subordinate_ids]
            if role:
                filtered_users = [u for u in filtered_users if u.role.value == role]
            if status_filter:
                filtered_users = [u for u in filtered_users if u.status.value == status_filter]
            
            users = filtered_users[skip:skip+limit]
            total = len(filtered_users)
        
        # Lead: See only their employees
        elif current_user.role == UserRole.LEAD:
            # Get employees that report to this Lead
            employees = await User.find(
                User.reports_to == str(current_user.id),
                User.role == UserRole.EMPLOYEE
            ).to_list()
            
            employee_ids = [str(emp.id) for emp in employees]
            employee_ids.append(str(current_user.id))  # Include self
            
            all_users = await User.find({
                "company_id": current_user.company_id
            }).to_list()
            
            filtered_users = [u for u in all_users if str(u.id) in employee_ids]
            if role:
                filtered_users = [u for u in filtered_users if u.role.value == role]
            if status_filter:
                filtered_users = [u for u in filtered_users if u.status.value == status_filter]
            
            users = filtered_users[skip:skip+limit]
            total = len(filtered_users)
        
        # Employee: See only themselves
        elif current_user.role == UserRole.EMPLOYEE:
            query = {"_id": current_user.id}
            if status_filter:
                query["status"] = status_filter
            
            users = [current_user] if (not status_filter or current_user.status.value == status_filter) else []
            total = len(users)
        else:
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    department_name_map = await _build_department_name_map(current_user.company_id if current_user.role != UserRole.SUPER_ADMIN else (company_id or current_user.company_id), users)

    return {
        "users": [
            {
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role.value,
                "status": user.status.value,
                "company_id": user.company_id,
                "reports_to": user.reports_to,
                "department_id": getattr(user, "department_id", None),
                "department_name": department_name_map.get(getattr(user, "department_id", None), None),
                "modules": getattr(user, "modules", []),
                "active_module": getattr(user, "active_module", None),
                "created_at": user.created_at,
            }
            for user in users
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/assignable")
async def get_assignable_users(
    current_user: User = Depends(get_current_user),
    for_tickets: bool = Query(False, description="If True, Leads can assign to anyone (for ticket assignment)"),
    project_id: Optional[str] = Query(
        None,
        description="Filter assignable users by project (for admin creating tasks based on project team)",
    ),
):
    """Get users that can be assigned tasks/tickets based on current user role"""
    users = []

    # Special case: Admin filtering by project - return only that project's lead and their employees
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    if project_id and (is_admin or current_user.role == UserRole.SUPER_ADMIN):
        project = await Project.get(project_id)
        if not project or project.company_id != current_user.company_id:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # If project has an assigned Lead, return that lead + their employees
        lead_id = project.assigned_to
        if lead_id:
            lead = await Lead.get(str(lead_id))
            if lead:
                # Get employees under this Lead (both by lead_id and managed_employee_ids)
                managed_ids = getattr(lead, "managed_employee_ids", []) or []

                employees_by_lead = await Employee.find({
                    "company_id": current_user.company_id,
                    "status": UserStatus.ACTIVE,
                    "lead_id": str(lead.id),
                }).to_list()

                employees_by_managed = []
                if managed_ids:
                    employees_by_managed = await Employee.find({
                        "company_id": current_user.company_id,
                        "status": UserStatus.ACTIVE,
                        "_id": {"$in": managed_ids},
                    }).to_list()

                all_employee_ids = set()
                team_employees = []
                for emp in employees_by_lead + employees_by_managed:
                    emp_id_str = str(emp.id)
                    if emp_id_str not in all_employee_ids:
                        all_employee_ids.add(emp_id_str)
                        team_employees.append(emp)

                users = [lead] + team_employees

                return {
                    "users": [
                        {
                            "id": str(user.id),
                            "email": user.email,
                            "first_name": user.first_name,
                            "last_name": user.last_name,
                            "role": user.role.value,
                            "status": user.status.value,
                            "department_id": getattr(user, "department_id", None),
                            "department": getattr(user, "department", None),
                        }
                        for user in users
                    ]
                }
        # If no lead assigned or lead not found, fall back to default admin behaviour below

    # Admin or Super Admin
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    if is_admin or current_user.role == UserRole.SUPER_ADMIN:
        # Admin can assign to Leads and Employees
        leads = await Lead.find({
            "company_id": current_user.company_id,
            "status": UserStatus.ACTIVE
        }).to_list()
        employees = await Employee.find({
            "company_id": current_user.company_id,
            "status": UserStatus.ACTIVE
        }).to_list()
        users = leads + employees
    
    elif current_user.role == UserRole.EMPLOYEE:
        if for_tickets:
            # For tickets, Employees can assign to Leads and Admins only
            leads = await Lead.find({
                "company_id": current_user.company_id,
                "status": UserStatus.ACTIVE
            }).to_list()
            admins = await CompanyAdmin.find({
                "company_id": current_user.company_id,
                "status": UserStatus.ACTIVE
            }).to_list()
            users = leads + admins
        else:
            # Employees cannot assign tasks
            users = []
    
    elif current_user.role == UserRole.LEAD:
        if for_tickets:
            # For tickets, Leads can assign to anyone in the company (Leads and Employees)
            leads = await Lead.find({
                "company_id": current_user.company_id,
                "status": UserStatus.ACTIVE
            }).to_list()
            employees = await Employee.find({
                "company_id": current_user.company_id,
                "status": UserStatus.ACTIVE
            }).to_list()
            users = leads + employees
        else:
            # For tasks, Lead can assign to Employees (their team members)
            # Get Lead with managed_employee_ids
            lead = await Lead.get(str(current_user.id))
            if lead:
                # Get employees under this Lead
                managed_ids = getattr(lead, "managed_employee_ids", []) or []
                # Get employees by lead_id or managed_employee_ids
                employees_by_lead = await Employee.find({
                    "company_id": current_user.company_id,
                    "status": UserStatus.ACTIVE,
                    "lead_id": str(current_user.id)
                }).to_list()
                
                # Get employees by managed_employee_ids
                employees_by_managed = []
                if managed_ids:
                    employees_by_managed = await Employee.find({
                        "company_id": current_user.company_id,
                        "status": UserStatus.ACTIVE,
                        "_id": {"$in": managed_ids}
                    }).to_list()
                
                # Combine and remove duplicates
                all_employee_ids = set()
                users = []
                for emp in employees_by_lead + employees_by_managed:
                    if str(emp.id) not in all_employee_ids:
                        all_employee_ids.add(str(emp.id))
                        users.append(emp)
    
    return {
        "users": [
            {
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role.value,
                "status": user.status.value,
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
    """Get team members for current Lead"""
    if current_user.role != UserRole.LEAD:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Only Leads can access their team"
        )
    
    # Get Lead with managed_employee_ids
    lead = await Lead.get(str(current_user.id))
    if not lead:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )
    
    # Get all employees under this Lead
    managed_ids = getattr(lead, "managed_employee_ids", []) or []
    
    # Get employees by lead_id
    employees_by_lead = await Employee.find({
        "company_id": current_user.company_id,
        "status": UserStatus.ACTIVE,
        "lead_id": str(current_user.id)
    }).to_list()
    
    # Get employees by managed_employee_ids
    employees_by_managed = []
    if managed_ids:
        employees_by_managed = await Employee.find({
            "company_id": current_user.company_id,
            "status": UserStatus.ACTIVE,
            "_id": {"$in": managed_ids}
        }).to_list()
    
    # Combine and remove duplicates
    all_employee_ids = set()
    team_members = []
    for emp in employees_by_lead + employees_by_managed:
        if str(emp.id) not in all_employee_ids:
            all_employee_ids.add(str(emp.id))
            team_members.append(emp)
    
    # Get task and ticket counts for each team member
    from app.models.task import Task
    from app.models.ticket import Ticket
    
    team_data = []
    for employee in team_members:
        task_count = await Task.find({
            "assigned_to": str(employee.id),
            "company_id": current_user.company_id
        }).count()
        
        ticket_count = await Ticket.find({
            "assigned_to": str(employee.id),
            "company_id": current_user.company_id
        }).count()
        
        team_data.append({
            "id": str(employee.id),
            "email": employee.email,
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "role": employee.role.value,
            "status": employee.status.value,
            "department_id": getattr(employee, "department_id", None),
            "designation": employee.designation,
            "phone": employee.phone,
            "created_at": employee.created_at,
            "task_count": task_count,
            "ticket_count": ticket_count,
        })
    
    return {
        "team_members": team_data,
        "total": len(team_data),
        "lead_info": {
            "id": str(lead.id),
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "team_name": lead.team_name,
        }
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
async def create_lead(
    email: str = Form(...),
    password: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    team_name: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin)
):
    """Create a Lead (Company Admin only)"""
    # Check if email already exists
    existing = await User.find_one(User.email == email)
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    department_doc = await _resolve_department(current_user.company_id, department_id)
    
    # Create Lead
    lead = Lead(
        email=email,
        password_hash=get_password_hash(password),
        first_name=first_name,
        last_name=last_name,
        company_id=current_user.company_id,
        reports_to=None,
        ancestors=[],
        team_name=team_name,
        department_id=department_id if department_doc else None,
        phone=phone,
        status=UserStatus.ACTIVE
    )
    
    await lead.insert()
    
    # Queue welcome email to the new Lead
    try:
        from app.worker.tasks.email_tasks import send_welcome_email_task
        send_welcome_email_task.delay(
            email,
            password,
            first_name,
            last_name,
            "LEAD",
            f"{current_user.first_name} {current_user.last_name}",
        )
    except Exception as e:
        # Log error but don't fail the request
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send welcome email to {email}: {str(e)}")
    
    return {
        "message": "Lead created successfully",
        "user_id": str(lead.id)
    }


@router.post("/create-employee")
async def create_employee(
    email: str = Form(...),
    password: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    lead_id: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    designation: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead)
):
    """Create an Employee (Company Admin or Lead)"""
    # Check if email already exists
    existing = await User.find_one(User.email == email)
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    department_doc = await _resolve_department(current_user.company_id, department_id)
    
    # If current user is a Lead, automatically assign employee to this Lead
    final_lead_id = lead_id
    if current_user.role == UserRole.LEAD:
        final_lead_id = str(current_user.id)
    
    # Validate lead_id if provided (for Company Admin)
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    if final_lead_id and is_admin:
        lead = await User.get(final_lead_id)
        if not lead or lead.role != UserRole.LEAD or lead.company_id != current_user.company_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid Lead ID"
            )
    
    # Create Employee
    employee = Employee(
        email=email,
        password_hash=get_password_hash(password),
        first_name=first_name,
        last_name=last_name,
        company_id=current_user.company_id,
        reports_to=final_lead_id,
        lead_id=final_lead_id,
        department_id=department_id if department_doc else None,
        designation=designation,
        phone=phone,
        status=UserStatus.ACTIVE
    )
    await UserService.update_hierarchy_ancestors(employee)
    
    await employee.insert()
    
    # Add employee to Lead's managed_employee_ids if lead_id is provided
    if final_lead_id:
        lead = await Lead.get(final_lead_id)
        if lead:
            managed_ids = getattr(lead, "managed_employee_ids", []) or []
            if not isinstance(managed_ids, list):
                managed_ids = []
            
            employee_id_str = str(employee.id)
            if employee_id_str not in managed_ids:
                managed_ids.append(employee_id_str)
                lead.managed_employee_ids = managed_ids
                await lead.save()

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
    user.updated_at = datetime.utcnow()
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
    current_user: User = Depends(get_current_company_admin_or_lead)
):
    """Update basic user profile fields"""
    user = await User.get(user_id)

    if not user:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Access control
    check_company_access(current_user, user.company_id)
    if current_user.role == UserRole.LEAD:
        # Leads can only update their own team employees
        if user.role != UserRole.EMPLOYEE or user.lead_id != str(current_user.id):
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail="Leads can only edit their own team members"
            )

    # Update fields if provided
    if first_name:
        user.first_name = first_name
    if last_name:
        user.last_name = last_name
    if email:
        normalized_email = email.lower()
        # Only check uniqueness if changing email
        if normalized_email != user.email:
            existing = await User.find_one(User.email == normalized_email)
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
    user.updated_at = datetime.utcnow()
    await user.save()

    return {"message": "User updated successfully"}


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
        # Legacy support: convert company_admin to admin
        if role == "company_admin":
            target_role = UserRole.ADMIN
        else:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role: {role}"
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
    existing = await User.find_one(User.email == email.lower())
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Determine company_id
    company_id = current_user.company_id if current_user.company_id else None
    
    # Modules parsing (comma-separated); default to ["task"]
    allowed_modules = {"task", "sales"}
    parsed_modules = []
    if modules:
        parsed_modules = [
            m.strip()
            for m in modules.split(",")
            if m and m.strip() in allowed_modules
        ]
    if not parsed_modules:
        parsed_modules = ["task"]
    active_module = parsed_modules[0]

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
    if target_role == UserRole.MANAGER:
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
        if target_role == UserRole.MANAGER:
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
