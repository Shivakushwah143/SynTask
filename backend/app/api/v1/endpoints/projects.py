"""
Project Management Endpoints - Jira-like Projects.

Project identity:
- project_id (string): User-provided logical ID from frontend (e.g. PROJ-001). Required on create,
  unique per company. This is the FK stored in tasks and used in URLs; not MongoDB _id.
- MongoDB _id: Internal only. All project routes accept either project_id or _id in the path;
  get_project_by_id() resolves both so frontend can use the same value everywhere.
"""
from fastapi import APIRouter, HTTPException, status as http_status, Depends, Form, UploadFile, File
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

router = APIRouter()

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


@router.post("/")
async def create_project(
    name: str = Form(...),
    key: str = Form(...),
    description: Optional[str] = Form(None),
    type: str = Form("software"),
    lead_id: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    delivery_date: Optional[str] = Form(None),
    project_id: str = Form(...),  # MANDATORY - User-provided unique project ID
    current_user: User = Depends(get_current_company_admin),
):
    """Create a new project (Company Admin only)"""
    # Validate project_id is provided and not empty
    project_id = project_id.strip() if project_id else ""
    if not project_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Project ID is required. Please enter a unique Project ID."
        )
    
    # Uniqueness per company: no other project in this company may use this project_id
    existing_by_id = await Project.find_one(
        Project.project_id == project_id,
        Project.company_id == current_user.company_id
    )
    if existing_by_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Project ID '{project_id}' already exists in your company. Please use a different ID."
        )
    
    # Validate project key (must be unique per company)
    existing = await Project.find_one(
        Project.key == key.upper(),
        Project.company_id == current_user.company_id
    )
    if existing:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Project key already exists"
        )
    
    # CRITICAL: Store user-provided project_id - DO NOT CHANGE THIS VALUE
    final_project_id = project_id
    logger.info(f"User provided project_id: {final_project_id} - This will be used throughout")
    
    # Validate project type
    try:
        project_type = ProjectType(type.lower())
    except:
        project_type = ProjectType.SOFTWARE
    
    # Validate lead if provided
    if lead_id:
        lead = await User.get(lead_id)
        if not lead or lead.company_id != current_user.company_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid lead"
            )
    
    # Validate assigned user if provided
    assigned_user = None
    if assigned_to:
        assigned_user = await User.get(assigned_to)
        if not assigned_user or assigned_user.company_id != current_user.company_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid assigned user"
            )
        # Allow assigning to Manager, Lead, or Employee (hierarchical assignment)
        if assigned_user.role not in [UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE]:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Can only assign projects to Managers, Leads, or Employees"
            )
    
    # Parse dates
    start_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid start date format"
            )
    
    delivery_date_obj = None
    if delivery_date:
        try:
            delivery_date_obj = datetime.fromisoformat(delivery_date.replace('Z', '+00:00'))
        except:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid delivery date format"
            )
    
    # Validate dates
    if start_date_obj and delivery_date_obj and start_date_obj > delivery_date_obj:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Start date cannot be after delivery date"
        )
    
    # Create project with user-provided project_id
    project_data = {
        "name": name,
        "key": key.upper(),
        "project_id": final_project_id,  # User द्वारा enter किया गया unique project_id store करें
        "description": description,
        "company_id": current_user.company_id,
        "type": project_type,
        "lead_id": lead_id,
        "assigned_to": assigned_to,
        "assigned_by": str(current_user.id) if assigned_to else None,
        "assigned_at": datetime.utcnow() if assigned_to else None,
        "start_date": start_date_obj,
        "delivery_date": delivery_date_obj,
        "created_by": str(current_user.id),
    }
    
    # Create project with user-provided project_id (MANDATORY - NO AUTO-GENERATION)
    # IMPORTANT: Ensure project_id is set before insert
    project = Project(**project_data)
    
    # Explicitly set project_id to ensure it's not None
    project.project_id = final_project_id
    
    # Double-check project_id is set correctly before insert
    if not project.project_id or project.project_id != final_project_id:
        project.project_id = final_project_id
        logger.warning(f"Project_id mismatch before insert: expected={final_project_id}, got={project.project_id}")
    
    # Insert project
    await project.insert()
    
    # Force-write project_id to MongoDB so the field always exists in the document.
    # Use direct database access to ensure project_id is saved
    try:
        from app.core.database import get_database
        from bson import ObjectId
        db = get_database()
        # Use ObjectId conversion for _id
        project_oid = project.id if isinstance(project.id, ObjectId) else ObjectId(project.id)
        result = await db["projects"].update_one(
            {"_id": project_oid},
            {"$set": {"project_id": final_project_id}}
        )
        logger.info(
            f"project_id $set: matched={result.matched_count} modified={result.modified_count} id={project.id} value={final_project_id}"
        )
        if result.matched_count == 0:
            logger.error(f"project_id NOT saved: no document matched for _id={project.id}")
        # Verify: read back from DB
        doc = await db["projects"].find_one({"_id": project_oid}, {"project_id": 1})
        if doc and doc.get("project_id") == final_project_id:
            logger.info(f"Verified project_id in DB: {final_project_id}")
        else:
            logger.error(f"After $set, project_id in DB: {doc.get('project_id') if doc else 'doc not found'}")
    except Exception as e:
        logger.exception(f"project_id raw $set failed: {e}")
        # Fallback: set on model and save
        project.project_id = final_project_id
        await project.save()
    else:
        # Also set on model so Beanie state is correct
        project.project_id = final_project_id
        await project.save()
    
    # Immediately refresh and verify user-provided project_id was saved correctly
    project_refreshed = await Project.get(project.id)
    
    # If project_id wasn't saved, force update it
    if not project_refreshed.project_id or project_refreshed.project_id != final_project_id:
        logger.error(f"CRITICAL: Project_id was not saved correctly after insert! Expected={final_project_id}, Got={project_refreshed.project_id}")
        # Force update if project_id wasn't saved correctly
        project_refreshed.project_id = final_project_id
        await project_refreshed.save()
        # Verify again after save
        project_refreshed = await Project.get(project.id)
        if project_refreshed.project_id != final_project_id:
            logger.error(f"FATAL: Failed to save project_id even after force update! Expected={final_project_id}, Got={project_refreshed.project_id}")
        else:
            logger.info(f"Successfully saved project_id after force update: {final_project_id}")
        project = project_refreshed
    else:
        logger.info(f"Project created successfully: MongoDB _id={project.id}, user project_id={final_project_id}, saved={project_refreshed.project_id}")
        project = project_refreshed
    
    # CRITICAL: final_project_id MUST be the user-provided one (NO FALLBACK TO MongoDB _id)
    # Do NOT overwrite final_project_id - it contains the user-provided value
    # Verify final_project_id is still the user-provided value
    if final_project_id != project_id:
        logger.error(f"CRITICAL ERROR: final_project_id was overwritten! Original={project_id}, Current={final_project_id}")
        final_project_id = project_id  # Restore user-provided value
    
    if project.project_id and project.project_id != final_project_id:
        logger.error(f"CRITICAL: Project.project_id mismatch! User provided={final_project_id}, Saved={project.project_id}")
        # Force update to user-provided value
        project.project_id = final_project_id
        await project.save()
    
    # Ensure we return the user-provided project_id (NOT MongoDB _id)
    # final_project_id contains the user-provided value - DO NOT CHANGE IT
    logger.info(f"Before return: final_project_id={final_project_id}, project.project_id={project.project_id}, project.id={project.id}")
    
    # Send notification to assigned user
    if assigned_to and assigned_user:
        from app.models.notification import Notification, NotificationType
        notification = Notification(
            company_id=current_user.company_id,
            user_id=assigned_to,
            type=NotificationType.PROJECT_ASSIGNED,
            title="New Project Assigned",
            message=f"You have been assigned to project: {name}",
            related_id=final_project_id,  # Use the project_id we're using
            related_type="project",
        )
        await notification.insert()
    
    # Return ONLY user-provided project_id. Never return MongoDB _id as project_id.
    # Build response from final_project_id only (set from form at start of handler).
    out_project_id = (project_id.strip() if project_id else "") or final_project_id
    # Reject if we somehow ended up with an ObjectId-shaped value (24 hex chars)
    if len(out_project_id) == 24 and all(c in "0123456789abcdef" for c in out_project_id.lower()):
        logger.error(f"Would have returned ObjectId as project_id; using user value instead: {final_project_id}")
        out_project_id = final_project_id
    if not out_project_id:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User project_id was lost. Please try again."
        )
    logger.info(f"Returning project_id: {out_project_id} (user-provided), MongoDB _id: {project.id}")
    
    return {
        "message": "Project created successfully",
        "project_id": out_project_id,
        "id": str(project.id),
        "key": project.key
    }


@router.get("/")
async def list_projects(
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    """List projects for the company with role-based visibility"""
    # Super Admin can see all projects, others need company_id
    if current_user.role == UserRole.SUPER_ADMIN:
        query = {}
    else:
        if not current_user.company_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="User must belong to a company"
            )
        query = {"company_id": current_user.company_id}
    
    # Apply role-based filtering with hierarchical visibility
    # Super Admin and Admin see all projects in their scope
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        # For Manager, Lead, Employee - show projects assigned to anyone in their hierarchy
        if current_user.role == UserRole.MANAGER:
            # Manager sees projects assigned to:
            # 1. Themselves
            # 2. Any of their subordinates (Managers, Leads, Employees under them)
            subordinates = await current_user.get_all_subordinates()
            subordinate_ids = [str(sub.id) for sub in subordinates]
            subordinate_ids.append(str(current_user.id))  # Include self
            query["assigned_to"] = {"$in": subordinate_ids}
        elif current_user.role == UserRole.LEAD:
            # Lead sees projects assigned to:
            # 1. Themselves
            # 2. Their manager(s) - upward hierarchy
            # 3. Their employees - downward hierarchy
            managers = await current_user.get_all_managers()
            manager_ids = [str(mgr.id) for mgr in managers]
            
            subordinates = await current_user.get_all_subordinates()
            subordinate_ids = [str(sub.id) for sub in subordinates]
            
            # Combine: self + managers + subordinates
            visible_ids = [str(current_user.id)] + manager_ids + subordinate_ids
            query["assigned_to"] = {"$in": visible_ids}
        elif current_user.role == UserRole.EMPLOYEE:
            # Employee sees projects assigned to:
            # 1. Themselves
            # 2. Their manager(s) - upward hierarchy (Lead, Manager)
            managers = await current_user.get_all_managers()
            manager_ids = [str(mgr.id) for mgr in managers]
            
            # Combine: self + managers
            visible_ids = [str(current_user.id)] + manager_ids
            query["assigned_to"] = {"$in": visible_ids}
    
    if status_filter:
        try:
            query["status"] = ProjectStatus(status_filter.lower())
        except:
            pass
    
    projects = await Project.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
    total = await Project.find(query).count()
    
    # Get task counts for each project
    projects_with_stats = []
    for project in projects:
        # Use user-provided project_id for querying tasks, fallback to MongoDB _id for backward compatibility
        project_id_for_query = project.project_id if project.project_id else str(project.id)
        # Query tasks by both user-provided project_id and MongoDB _id (for backward compatibility)
        task_count = await Task.find({
            "$or": [
                {"project_id": project_id_for_query},
                {"project_id": str(project.id)}  # Also check MongoDB _id for old tasks
            ],
            "company_id": project.company_id
        }).count()
        
        # Get assigned user info
        assigned_to_name = None
        if project.assigned_to:
            assigned_user = await User.get(project.assigned_to)
            if assigned_user:
                assigned_to_name = assigned_user.full_name()
        
        # Calculate days until delivery
        days_until_delivery = None
        priority = "normal"
        if project.delivery_date:
            delta = project.delivery_date - datetime.utcnow()
            days_until_delivery = delta.days
            if days_until_delivery < 0:
                priority = "overdue"
            elif days_until_delivery <= 2:
                priority = "urgent"
            elif days_until_delivery <= 7:
                priority = "high"
            elif days_until_delivery <= 14:
                priority = "medium"
        
        projects_with_stats.append({
            "id": str(project.id),
            "project_id": project.project_id if project.project_id else str(project.id),  # User-provided project_id
            "name": project.name,
            "key": project.key,
            "description": project.description,
            "type": project.type.value,
            "status": project.status.value,
            "lead_id": project.lead_id,
            "assigned_to": project.assigned_to,
            "assigned_to_name": assigned_to_name,
            "start_date": project.start_date,
            "delivery_date": project.delivery_date,
            "days_until_delivery": days_until_delivery,
            "priority": priority,
            "task_count": task_count,
            "created_at": project.created_at,
        })
    
    # Sort by delivery date (nearest deadline first, then by priority)
    projects_with_stats.sort(key=lambda x: (
        x["priority"] == "overdue" and 0 or
        x["priority"] == "urgent" and 1 or
        x["priority"] == "high" and 2 or
        x["priority"] == "medium" and 3 or 4,
        x["delivery_date"] if x["delivery_date"] else datetime.max
    ))
    
    return {
        "projects": projects_with_stats,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    include_tasks: bool = False,
    current_user: User = Depends(get_current_user),
):
    """Get project details by custom project_id or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Get project statistics. Match tasks by path param, project.project_id, or MongoDB _id
    project_id_for_query = project.project_id if project.project_id else str(project.id)
    or_conditions = [
        {"project_id": project_id_for_query},
        {"project_id": str(project.id)},
    ]
    if project_id and project_id not in (str(project.id), project_id_for_query):
        or_conditions.append({"project_id": project_id})
    task_query = {"$or": or_conditions, "company_id": project.company_id}
    if current_user.role == UserRole.EMPLOYEE:
        task_query["assigned_to"] = str(current_user.id)
    all_tasks = await Task.find(task_query).to_list()
    
    task_count = len(all_tasks)
    
    # Calculate task statistics
    tasks_by_status = {
        "todo": 0,
        "in_progress": 0,
        "in_review": 0,
        "completed": 0,
        "cancelled": 0,
        "on_hold": 0,
    }
    
    tasks_by_priority = {
        "low": 0,
        "medium": 0,
        "high": 0,
        "critical": 0,
    }
    
    # Get user details for assigned tasks
    assigned_tasks_by_user = {}
    
    for task in all_tasks:
        # Count by status
        if task.status.value in tasks_by_status:
            tasks_by_status[task.status.value] += 1
        
        # Count by priority
        if task.priority.value in tasks_by_priority:
            tasks_by_priority[task.priority.value] += 1
        
        # Group by assignee
        if task.assigned_to:
            if task.assigned_to not in assigned_tasks_by_user:
                assigned_tasks_by_user[task.assigned_to] = {
                    "user_id": task.assigned_to,
                    "task_count": 0,
                    "tasks": []
                }
            assigned_tasks_by_user[task.assigned_to]["task_count"] += 1
            if include_tasks:
                assigned_tasks_by_user[task.assigned_to]["tasks"].append({
                    "id": str(task.id),
                    "title": task.title,
                    "status": task.status.value,
                    "priority": task.priority.value,
                })
    
    # Get user names for assigned tasks
    if assigned_tasks_by_user:
        user_ids = list(assigned_tasks_by_user.keys())
        # Convert string IDs to ObjectId for query
        try:
            user_object_ids = [ObjectId(uid) for uid in user_ids]
            users = await User.find({"_id": {"$in": user_object_ids}}).to_list()
            user_map = {str(u.id): u for u in users}
        except Exception:
            # If conversion fails, try direct string comparison
            users = await User.find({"_id": {"$in": user_ids}}).to_list()
            user_map = {str(u.id): u for u in users}
        
        for user_id, data in assigned_tasks_by_user.items():
            user = user_map.get(user_id)
            if user:
                data["user_name"] = user.full_name()
                data["user_email"] = user.email
                data["user_role"] = user.role.value
    
    response = {
        "id": str(project.id),
        "project_id": project.project_id if project.project_id else str(project.id),  # User-provided project_id
        "name": project.name,
        "key": project.key,
        "description": project.description,
        "type": project.type.value,
        "status": project.status.value,
        "lead_id": project.lead_id,
        "team_member_ids": project.team_member_ids,
        "task_count": task_count,
        "statistics": {
            "tasks_by_status": tasks_by_status,
            "tasks_by_priority": tasks_by_priority,
            "completed_count": tasks_by_status["completed"],
            "in_progress_count": tasks_by_status["in_progress"],
            "todo_count": tasks_by_status["todo"],
            "in_review_count": tasks_by_status["in_review"],
            "completion_percentage": round((tasks_by_status["completed"] / task_count * 100) if task_count > 0 else 0, 1),
        },
        "assigned_tasks_by_user": list(assigned_tasks_by_user.values()),
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }
    
    # Include task list if requested
    if include_tasks:
        response["tasks"] = [
            {
                "id": str(task.id),
                "title": task.title,
                "description": task.description,
                "status": task.status.value,
                "priority": task.priority.value,
                "assigned_to": task.assigned_to,
                "assigned_to_name": None,  # Will be filled below
                "due_date": task.due_date,
                "created_at": task.created_at,
            }
            for task in all_tasks
        ]
        
        # Fill in assigned_to_name
        for task_data in response["tasks"]:
            if task_data["assigned_to"]:
                user = user_map.get(task_data["assigned_to"])
                if user:
                    task_data["assigned_to_name"] = user.full_name()
    
    return response


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    status_filter: Optional[str] = Form(None, alias="status"),
    lead_id: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    delivery_date: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin),
):
    """Update project (Company Admin only). Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    check_company_access(current_user, project.company_id)
    
    if name:
        project.name = name
    if description is not None:
        project.description = description
    if status_filter:
        try:
            project.status = ProjectStatus(status_filter.lower())
        except:
            pass
    # Handle lead change and team transfer
    if lead_id is not None:
        old_lead_id = project.lead_id
        new_lead_id = lead_id
        
        # Validate new lead if provided
        if new_lead_id:
            new_lead = await User.get(new_lead_id)
            if not new_lead or new_lead.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Invalid lead"
                )
            if new_lead.role != UserRole.LEAD:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Lead must be a Lead role"
                )
        
        # If lead is being changed, transfer the old lead's team to new lead
        if old_lead_id and new_lead_id and old_lead_id != new_lead_id:
            from app.models.user import Lead, Employee, UserStatus
            from bson import ObjectId
            
            logger.info(f"Starting team transfer: Project {project_id}, Old Lead: {old_lead_id}, New Lead: {new_lead_id}")
            
            # Get old lead
            old_lead = await Lead.get(old_lead_id)
            
            if old_lead:
                # Get all employees under the old lead
                # Method 1: Employees with lead_id pointing to old lead
                # Try both string and ObjectId format to handle different storage formats
                old_lead_id_str = str(old_lead_id)
                
                # Query 1: Try with string format
                employees_by_lead_id_str = await Employee.find({
                    "company_id": current_user.company_id,
                    "status": UserStatus.ACTIVE,
                    "lead_id": old_lead_id_str
                }).to_list()
                
                # Query 2: Try with ObjectId format if it's a valid ObjectId
                employees_by_lead_id_obj = []
                try:
                    if ObjectId.is_valid(old_lead_id):
                        old_lead_obj_id = ObjectId(old_lead_id)
                        employees_by_lead_id_obj = await Employee.find({
                            "company_id": current_user.company_id,
                            "status": UserStatus.ACTIVE,
                            "lead_id": old_lead_obj_id
                        }).to_list()
                except:
                    pass
                
                # Combine results and remove duplicates
                employees_by_lead_id = []
                seen_ids = set()
                for emp in employees_by_lead_id_str + employees_by_lead_id_obj:
                    emp_id_str = str(emp.id)
                    if emp_id_str not in seen_ids:
                        seen_ids.add(emp_id_str)
                        employees_by_lead_id.append(emp)
                
                logger.info(f"Found {len(employees_by_lead_id)} employees by lead_id={old_lead_id_str}")
                
                # Method 2: Employees in managed_employee_ids
                managed_ids = getattr(old_lead, "managed_employee_ids", []) or []
                employees_by_managed = []
                if managed_ids:
                    # Convert managed_ids to ObjectId if needed
                    try:
                        managed_object_ids = []
                        for mid in managed_ids:
                            if isinstance(mid, str):
                                managed_object_ids.append(ObjectId(mid))
                            else:
                                managed_object_ids.append(mid)
                        
                        employees_by_managed = await Employee.find({
                            "company_id": current_user.company_id,
                            "status": UserStatus.ACTIVE,
                            "_id": {"$in": managed_object_ids}
                        }).to_list()
                    except Exception as e:
                        logger.error(f"Error fetching employees by managed_ids: {str(e)}")
                
                logger.info(f"Found {len(employees_by_managed)} employees by managed_employee_ids")
                
                # Combine and remove duplicates (all employees under this lead)
                all_employee_ids = set()
                team_employees = []
                for emp in employees_by_lead_id + employees_by_managed:
                    emp_id_str = str(emp.id)
                    if emp_id_str not in all_employee_ids:
                        all_employee_ids.add(emp_id_str)
                        team_employees.append(emp)
                
                logger.info(f"Total unique employees under old lead {old_lead_id}: {len(team_employees)}")

                # IMPORTANT: Limit transfer to employees who are ACTUALLY working on this project.
                # Example:
                #   - Lead Shimayla has employees A, B, C
                #   - A, B work on Project 'CRM', C works on Project 'Teen Patti'
                #   - When CRM lead changes, only A and B should transfer; C stays with Shimayla
                if team_employees:
                    employee_ids_str = [str(emp.id) for emp in team_employees]
                    project_employee_ids = set()
                    try:
                        # Use user-provided project_id for querying tasks
                        project_id_for_query = project.project_id if project.project_id else str(project.id)
                        project_tasks = await Task.find({
                            "company_id": current_user.company_id,
                            "$or": [
                                {"project_id": project_id_for_query},
                                {"project_id": str(project.id)}  # Also check MongoDB _id for old tasks
                            ],
                            "assigned_to": {"$in": employee_ids_str},
                        }).to_list()
                        for t in project_tasks:
                            if t.assigned_to:
                                project_employee_ids.add(str(t.assigned_to))
                    except Exception as e:
                        logger.error(f"Error fetching project tasks for team transfer: {str(e)}")
                    
                    if project_employee_ids:
                        team_employees = [emp for emp in team_employees if str(emp.id) in project_employee_ids]
                        all_employee_ids = set(str(emp.id) for emp in team_employees)
                    
                    logger.info(
                        f"Employees working on project {project_id} to transfer: {len(team_employees)} / "
                        f"{len(employee_ids_str)} total under old lead"
                    )
                
                # Transfer all employees to new lead
                new_lead_obj = await Lead.get(new_lead_id)
                if new_lead_obj and team_employees:
                    new_managed_ids = getattr(new_lead_obj, "managed_employee_ids", []) or []
                    if not isinstance(new_managed_ids, list):
                        new_managed_ids = []
                    
                    logger.info(f"Transferring {len(team_employees)} employees from lead {old_lead_id} to lead {new_lead_id} for project {project_id}")
                    
                    # Update each employee's lead_id and add to new lead's managed list
                    transferred_count = 0
                    new_lead_id_str = str(new_lead_id)
                    for employee in team_employees:
                        # Update employee's lead_id (ensure it's string format)
                        employee.lead_id = new_lead_id_str
                        await employee.save()
                        
                        # Add to new lead's managed_employee_ids if not already there
                        emp_id_str = str(employee.id)
                        if emp_id_str not in new_managed_ids:
                            new_managed_ids.append(emp_id_str)
                        transferred_count += 1
                    
                    # Update new lead's managed_employee_ids
                    new_lead_obj.managed_employee_ids = new_managed_ids
                    await new_lead_obj.save()
                    
                    # Remove employees from old lead's managed_employee_ids
                    old_managed_ids = getattr(old_lead, "managed_employee_ids", []) or []
                    if isinstance(old_managed_ids, list):
                        old_managed_ids = [eid for eid in old_managed_ids if eid not in all_employee_ids]
                        old_lead.managed_employee_ids = old_managed_ids
                        await old_lead.save()
                    
                    logger.info(f"Successfully transferred {transferred_count} employees from lead {old_lead_id} to lead {new_lead_id}")
                elif team_employees:
                    logger.warning(f"New lead {new_lead_id} not found, cannot transfer team members")
        
        # Update project lead_id
        project.lead_id = lead_id
    
    # Handle assigned_to reassignment - Also transfer team if assigned to a Lead
    if assigned_to is not None:
        old_assigned_to = project.assigned_to
        if assigned_to:
            # Validate assigned user
            assigned_user = await User.get(assigned_to)
            if not assigned_user or assigned_user.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Invalid assigned user"
                )
            # Allow assigning to Manager, Lead, or Employee (hierarchical assignment)
            if assigned_user.role not in [UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE]:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail="Can only assign projects to Managers, Leads, or Employees"
                )
            
            # If assigning to a Lead, and old assigned_to was also a Lead, transfer the team
            if assigned_user.role == UserRole.LEAD and old_assigned_to and old_assigned_to != assigned_to:
                old_assigned_user = await User.get(old_assigned_to)
                if old_assigned_user and old_assigned_user.role == UserRole.LEAD:
                    # Transfer team from old lead to new lead
                    from app.models.user import Lead, Employee, UserStatus
                    from bson import ObjectId
                    
                    logger.info(f"Transferring team: Old Lead (assigned_to)={old_assigned_to}, New Lead (assigned_to)={assigned_to}")
                    
                    old_lead_obj = await Lead.get(old_assigned_to)
                    new_lead_obj = await Lead.get(assigned_to)
                    
                    if old_lead_obj and new_lead_obj:
                        # Get all employees under the old lead
                        old_lead_id_str = str(old_assigned_to)
                        
                        # Query employees with lead_id pointing to old lead
                        employees_by_lead_id = await Employee.find({
                            "company_id": current_user.company_id,
                            "status": UserStatus.ACTIVE,
                            "lead_id": old_lead_id_str
                        }).to_list()
                        
                        # Get employees from managed_employee_ids
                        managed_ids = getattr(old_lead_obj, "managed_employee_ids", []) or []
                        employees_by_managed = []
                        if managed_ids:
                            try:
                                managed_object_ids = []
                                for mid in managed_ids:
                                    if isinstance(mid, str):
                                        managed_object_ids.append(ObjectId(mid))
                                    else:
                                        managed_object_ids.append(mid)
                                
                                employees_by_managed = await Employee.find({
                                    "company_id": current_user.company_id,
                                    "status": UserStatus.ACTIVE,
                                    "_id": {"$in": managed_object_ids}
                                }).to_list()
                            except Exception as e:
                                logger.error(f"Error fetching employees by managed_ids: {str(e)}")
                        
                        # Combine and remove duplicates (all employees under this lead)
                        all_employee_ids = set()
                        team_employees = []
                        for emp in employees_by_lead_id + employees_by_managed:
                            emp_id_str = str(emp.id)
                            if emp_id_str not in all_employee_ids:
                                all_employee_ids.add(emp_id_str)
                                team_employees.append(emp)
                        
                        logger.info(
                            f"Found {len(team_employees)} employees under old lead {old_assigned_to} "
                            f"while reassigning project {project_id}"
                        )

                        # IMPORTANT: Limit transfer to employees who are actually working on THIS project only
                        # so that employees on other projects remain with the old lead.
                        if team_employees:
                            employee_ids_str = [str(emp.id) for emp in team_employees]
                            project_employee_ids = set()
                            try:
                                # Use user-provided project_id for querying tasks
                                project_id_for_query = project.project_id if project.project_id else str(project.id)
                                project_tasks = await Task.find({
                                    "company_id": current_user.company_id,
                                    "$or": [
                                        {"project_id": project_id_for_query},
                                        {"project_id": str(project.id)}  # Also check MongoDB _id for old tasks
                                    ],
                                    "assigned_to": {"$in": employee_ids_str},
                                }).to_list()
                                for t in project_tasks:
                                    if t.assigned_to:
                                        project_employee_ids.add(str(t.assigned_to))
                            except Exception as e:
                                logger.error(f"Error fetching project tasks for assigned_to team transfer: {str(e)}")
                            
                            if project_employee_ids:
                                team_employees = [emp for emp in team_employees if str(emp.id) in project_employee_ids]
                                all_employee_ids = set(str(emp.id) for emp in team_employees)
                            
                            logger.info(
                                f"Employees on project {project_id} to transfer (assigned_to change): "
                                f"{len(team_employees)} / {len(employee_ids_str)} total under old lead"
                            )
                        
                        # Transfer employees to new lead
                        if team_employees:
                            new_managed_ids = getattr(new_lead_obj, "managed_employee_ids", []) or []
                            if not isinstance(new_managed_ids, list):
                                new_managed_ids = []
                            
                            new_lead_id_str = str(assigned_to)
                            for employee in team_employees:
                                employee.lead_id = new_lead_id_str
                                await employee.save()
                                
                                emp_id_str = str(employee.id)
                                if emp_id_str not in new_managed_ids:
                                    new_managed_ids.append(emp_id_str)
                            
                            # Update new lead's managed_employee_ids
                            new_lead_obj.managed_employee_ids = new_managed_ids
                            await new_lead_obj.save()
                            
                            # Remove employees from old lead's managed_employee_ids
                            old_managed_ids = getattr(old_lead_obj, "managed_employee_ids", []) or []
                            if isinstance(old_managed_ids, list):
                                old_managed_ids = [eid for eid in old_managed_ids if eid not in all_employee_ids]
                                old_lead_obj.managed_employee_ids = old_managed_ids
                                await old_lead_obj.save()
                            
                            logger.info(f"Successfully transferred {len(team_employees)} employees from lead {old_assigned_to} to lead {assigned_to}")
            
            project.assigned_to = assigned_to
            project.assigned_by = str(current_user.id)
            project.assigned_at = datetime.utcnow()
            
            # If assigned_to is a Lead, also update lead_id
            if assigned_user.role == UserRole.LEAD:
                project.lead_id = assigned_to
            
            # Send notification if assignment changed
            if old_assigned_to != assigned_to:
                from app.models.notification import Notification, NotificationType
                notification = Notification(
                    company_id=current_user.company_id,
                    user_id=assigned_to,
                    type=NotificationType.PROJECT_ASSIGNED,
                    title="Project Assigned",
                    message=f"You have been assigned to project: {project.name}",
                    related_id=str(project.id),
                    related_type="project",
                )
                await notification.insert()
        else:
            # Unassign project
            project.assigned_to = None
            project.assigned_by = None
            project.assigned_at = None
    
    # Handle dates
    if start_date:
        try:
            project.start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid start date format"
            )
    
    if delivery_date:
        try:
            project.delivery_date = datetime.fromisoformat(delivery_date.replace('Z', '+00:00'))
        except:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid delivery date format"
            )
    
    # Validate dates
    if project.start_date and project.delivery_date and project.start_date > project.delivery_date:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Start date cannot be after delivery date"
        )
    
    project.updated_at = datetime.utcnow()
    await project.save()
    
    return {"message": "Project updated successfully"}


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    """Delete project (only Company Admin). Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    check_company_access(current_user, project.company_id)
    
    # Check if project has tasks - use user-provided project_id, fallback to MongoDB _id
    project_id_for_query = project.project_id if project.project_id else str(project.id)
    task_count = await Task.find({
        "$or": [
            {"project_id": project_id_for_query},
            {"project_id": str(project.id)}  # Also check MongoDB _id for old tasks
        ],
        "company_id": project.company_id
    }).count()
    
    if task_count > 0:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete project with existing tasks"
        )
    
    await project.delete()
    
    return {"message": "Project deleted successfully"}


# Epic Endpoints
@router.post("/{project_id}/epics")
async def create_epic(
    project_id: str,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    owner_id: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create an epic in a project. Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    check_company_access(current_user, project.company_id)
    
    parsed_due_date = None
    if due_date:
        try:
            parsed_due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
        except:
            try:
                parsed_due_date = datetime.strptime(due_date, '%Y-%m-%dT%H:%M')
            except:
                pass
    
    epic = Epic(
        name=name,
        description=description,
        project_id=project_id,
        company_id=current_user.company_id,
        created_by=str(current_user.id),
        owner_id=owner_id,
        due_date=parsed_due_date,
        color=color or "#0052CC",
    )
    
    await epic.insert()
    
    return {
        "message": "Epic created successfully",
        "epic_id": str(epic.id)
    }


@router.get("/{project_id}/epics")
async def list_epics(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """List epics in a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    epics = await Epic.find({
        "project_id": project_id,
        "company_id": project.company_id
    }).sort("-created_at").to_list()
    
    # Get task counts for each epic
    epics_with_stats = []
    for epic in epics:
        task_count = await Task.find({
            "epic_id": str(epic.id),
            "company_id": epic.company_id
        }).count()
        
        epics_with_stats.append({
            "id": str(epic.id),
            "name": epic.name,
            "description": epic.description,
            "status": epic.status,
            "owner_id": epic.owner_id,
            "task_count": task_count,
            "progress_percentage": epic.progress_percentage,
            "color": epic.color,
            "due_date": epic.due_date,
            "created_at": epic.created_at,
        })
    
    return {"epics": epics_with_stats}


# Sprint Endpoints
@router.post("/{project_id}/sprints")
async def create_sprint(
    project_id: str,
    name: str = Form(...),
    goal: Optional[str] = Form(None),
    start_date: str = Form(...),
    end_date: str = Form(...),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a sprint in a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    try:
        parsed_start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        parsed_end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    except:
        try:
            parsed_start = datetime.strptime(start_date, '%Y-%m-%dT%H:%M')
            parsed_end = datetime.strptime(end_date, '%Y-%m-%dT%H:%M')
        except:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format"
            )
    
    if parsed_end <= parsed_start:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="End date must be after start date"
        )
    
    sprint = Sprint(
        name=name,
        project_id=project_id,
        company_id=current_user.company_id,
        goal=goal,
        start_date=parsed_start,
        end_date=parsed_end,
        created_by=str(current_user.id),
    )
    
    await sprint.insert()
    
    return {
        "message": "Sprint created successfully",
        "sprint_id": str(sprint.id)
    }


@router.get("/{project_id}/sprints")
async def list_sprints(
    project_id: str,
    state: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """List sprints in a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    query = {
        "project_id": project_id,
        "company_id": project.company_id
    }
    
    if state:
        query["state"] = state
    
    sprints = await Sprint.find(query).sort("-created_at").to_list()
    
    # Get task counts for each sprint
    sprints_with_stats = []
    for sprint in sprints:
        task_count = await Task.find({
            "sprint_id": str(sprint.id),
            "company_id": sprint.company_id
        }).count()
        
        sprints_with_stats.append({
            "id": str(sprint.id),
            "name": sprint.name,
            "goal": sprint.goal,
            "state": sprint.state,
            "start_date": sprint.start_date,
            "end_date": sprint.end_date,
            "task_count": task_count,
            "created_at": sprint.created_at,
        })
    
    return {"sprints": sprints_with_stats}


@router.patch("/{project_id}/sprints/{sprint_id}/state")
async def update_sprint_state(
    project_id: str,
    sprint_id: str,
    state: str = Form(...),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update sprint state (future, active, closed)"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    sprint = await Sprint.get(sprint_id)
    
    if not sprint or sprint.project_id != project_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Sprint not found"
        )
    
    valid_states = ["future", "active", "closed"]
    if state not in valid_states:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state. Must be one of: {', '.join(valid_states)}"
        )
    
    sprint.state = state
    if state == "closed":
        sprint.completed_at = datetime.utcnow()
    
    sprint.updated_at = datetime.utcnow()
    await sprint.save()
    
    return {"message": "Sprint state updated successfully"}


@router.get("/for-task-creation")
async def get_projects_for_task_creation(
    current_user: User = Depends(get_current_user),
):
    """Get projects that can be used when creating tasks (filtered by assignment)"""
    query = {"company_id": current_user.company_id, "status": ProjectStatus.ACTIVE}
    
    # Apply role-based filtering
    # Company Admin and Super Admin see all active projects
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        if current_user.role == UserRole.EMPLOYEE:
            # Employees see projects assigned to their lead
            employee = await Employee.get(current_user.id)
            if employee and employee.lead_id:
                query["assigned_to"] = employee.lead_id
            else:
                # If employee has no lead, return empty list
                return {"projects": []}
        else:
            # Leads see projects assigned to them
            query["assigned_to"] = str(current_user.id)
    
    projects = await Project.find(query).sort("-created_at").to_list()
    
    return {
        "projects": [
            {
                "id": str(project.id),
                "project_id": project.project_id if project.project_id else str(project.id),  # User-provided project_id
                "name": project.name,
                "key": project.key,
                "description": project.description,
            }
            for project in projects
        ]
    }


@router.get("/{project_id}/board")
async def get_project_board(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get project board view with tasks organized by status (Kanban style)"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Use centralized hierarchical access check
    await ensure_project_access_for_user(project, current_user)
    
    # Get all tasks for this project. Match by: path param (e.g. ak-001), project.project_id, or MongoDB _id
    project_id_for_query = project.project_id if project.project_id else str(project.id)
    or_conditions = [
        {"project_id": project_id_for_query},
        {"project_id": str(project.id)},
    ]
    if project_id and project_id != str(project.id) and project_id != project_id_for_query:
        or_conditions.append({"project_id": project_id})  # path param (custom id)
    task_query = {"$or": or_conditions, "company_id": project.company_id}
    if current_user.role == UserRole.EMPLOYEE:
        task_query["assigned_to"] = str(current_user.id)
    all_tasks = await Task.find(task_query).to_list()
    
    # Get board columns to determine which statuses to include
    board_columns = project.board_columns or [
        {"id": "todo", "label": "TO DO", "color": "bg-gray-100", "order": 0},
        {"id": "in_progress", "label": "IN PROGRESS", "color": "bg-blue-100", "order": 1},
        {"id": "in_review", "label": "IN REVIEW", "color": "bg-yellow-100", "order": 2},
        {"id": "completed", "label": "COMPLETED", "color": "bg-green-100", "order": 3},
    ]
    
    # Initialize tasks_by_status with all column IDs
    tasks_by_status = {}
    for col in board_columns:
        tasks_by_status[col.get("id")] = []
    
    # Also include default statuses for backwards compatibility
    default_statuses = ["todo", "in_progress", "in_review", "completed", "cancelled", "on_hold"]
    for status in default_statuses:
        if status not in tasks_by_status:
            tasks_by_status[status] = []
    
    # Get user details for assigned tasks
    user_ids = set()
    for task in all_tasks:
        if task.assigned_to:
            user_ids.add(task.assigned_to)
        if task.created_by:
            user_ids.add(task.created_by)
    
    user_map = {}
    if user_ids:
        try:
            user_object_ids = [ObjectId(uid) for uid in user_ids]
            users = await User.find({"_id": {"$in": user_object_ids}}).to_list()
            user_map = {str(u.id): u for u in users}
        except Exception:
            users = await User.find({"_id": {"$in": list(user_ids)}}).to_list()
            user_map = {str(u.id): u for u in users}
    
    # Organize tasks by status
    for task in all_tasks:
        status_key = task.status.value
        if status_key in tasks_by_status:
            assigned_user = user_map.get(task.assigned_to) if task.assigned_to else None
            created_user = user_map.get(task.created_by) if task.created_by else None
            
            task_data = {
                "id": str(task.id),
                "title": task.title,
                "description": task.description,
                "status": task.status.value,
                "priority": task.priority.value,
                "assigned_to": task.assigned_to,
                "assigned_to_name": assigned_user.full_name() if assigned_user else None,
                "created_by": task.created_by,
                "created_by_name": created_user.full_name() if created_user else None,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "tags": task.tags,
                "story_points": task.story_points,
                "attachments": task.attachments or [],
            }
            tasks_by_status[status_key].append(task_data)
    
    # Get project statistics
    task_count = len(all_tasks)
    completed_count = len(tasks_by_status["completed"])
    completion_percentage = round((completed_count / task_count * 100) if task_count > 0 else 0, 1)
    
    # Get board columns (custom or default)
    board_columns = project.board_columns or [
        {"id": "todo", "label": "TO DO", "color": "bg-gray-100", "order": 0},
        {"id": "in_progress", "label": "IN PROGRESS", "color": "bg-blue-100", "order": 1},
        {"id": "in_review", "label": "IN REVIEW", "color": "bg-yellow-100", "order": 2},
        {"id": "completed", "label": "COMPLETED", "color": "bg-green-100", "order": 3},
    ]
    sorted_columns = sorted(board_columns, key=lambda x: x.get("order", 0))
    
    return {
        "project": {
            "id": str(project.id),
            "project_id": project.project_id if project.project_id else str(project.id),  # User-provided project_id
            "name": project.name,
            "key": project.key,
            "description": project.description,
            "status": project.status.value,
        },
        "board_columns": sorted_columns,
        "tasks_by_status": tasks_by_status,
        "statistics": {
            "total_tasks": task_count,
            "completed": completed_count,
            "in_progress": len(tasks_by_status.get("in_progress", [])),
            "todo": len(tasks_by_status.get("todo", [])),
            "in_review": len(tasks_by_status.get("in_review", [])),
            "completion_percentage": completion_percentage,
        },
    }


@router.get("/{project_id}/summary")
async def get_project_summary(
    project_id: str,
    days: int = 7,
    current_user: User = Depends(get_current_user),
):
    """Get project summary with detailed analytics similar to Jira"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Use centralized hierarchical access check
    await ensure_project_access_for_user(project, current_user)
    
    # Get all tasks for this project
    # Get all tasks for this project (employees only see their own tasks)
    # Use user-provided project_id for querying tasks, fallback to MongoDB _id for backward compatibility
    project_id_for_query = project.project_id if project.project_id else str(project.id)
    task_query = {
        "$or": [
            {"project_id": project_id_for_query},
            {"project_id": str(project.id)}  # Also check MongoDB _id for old tasks
        ],
        "company_id": project.company_id,
    }
    if current_user.role == UserRole.EMPLOYEE:
        task_query["assigned_to"] = str(current_user.id)
    all_tasks = await Task.find(task_query).to_list()
    
    # Calculate date range
    from datetime import timedelta
    now = datetime.utcnow()
    days_ago = now - timedelta(days=days)
    days_ahead = now + timedelta(days=days)
    
    # Activity metrics (last N days)
    completed_count = 0
    updated_count = 0
    created_count = 0
    due_soon_count = 0
    
    # Status breakdown
    tasks_by_status = {
        "todo": [],
        "in_progress": [],
        "in_review": [],
        "completed": [],
        "cancelled": [],
        "on_hold": [],
    }
    
    # Priority breakdown
    tasks_by_priority = {
        "low": 0,
        "medium": 0,
        "high": 0,
        "critical": 0,
    }
    
    # Team workload
    assigned_tasks_by_user = {}
    
    # Types of work (by issue type or task type)
    tasks_by_type = {}
    
    for task in all_tasks:
        # Status breakdown
        status_key = task.status.value
        if status_key in tasks_by_status:
            tasks_by_status[status_key].append(task)
        
        # Priority breakdown
        if task.priority:
            priority_key = task.priority.value
            if priority_key in tasks_by_priority:
                tasks_by_priority[priority_key] += 1
        
        # Activity metrics
        if task.completed_at and task.completed_at >= days_ago:
            completed_count += 1
        if task.updated_at and task.updated_at >= days_ago:
            updated_count += 1
        if task.created_at and task.created_at >= days_ago:
            created_count += 1
        if task.due_date and task.due_date <= days_ahead and task.due_date >= now:
            due_soon_count += 1
        
        # Team workload
        if task.assigned_to:
            if task.assigned_to not in assigned_tasks_by_user:
                assigned_tasks_by_user[task.assigned_to] = {
                    "user_id": task.assigned_to,
                    "task_count": 0,
                    "in_progress": 0,
                    "completed": 0,
                }
            assigned_tasks_by_user[task.assigned_to]["task_count"] += 1
            if task.status.value == "in_progress":
                assigned_tasks_by_user[task.assigned_to]["in_progress"] += 1
            if task.status.value == "completed":
                assigned_tasks_by_user[task.assigned_to]["completed"] += 1
        
        # Types of work
        task_type = "Task"  # Default
        if task.issue_type_id:
            task_type = "Task"  # Can be expanded later
        if task_type not in tasks_by_type:
            tasks_by_type[task_type] = 0
        tasks_by_type[task_type] += 1
    
    # Get user details for team workload
    team_workload = []
    if assigned_tasks_by_user:
        user_ids = list(assigned_tasks_by_user.keys())
        try:
            user_object_ids = [ObjectId(uid) for uid in user_ids]
            users = await User.find({"_id": {"$in": user_object_ids}}).to_list()
            user_map = {str(u.id): u for u in users}
        except Exception:
            users = await User.find({"_id": {"$in": user_ids}}).to_list()
            user_map = {str(u.id): u for u in users}
        
        total_tasks = len(all_tasks)
        for user_id, data in assigned_tasks_by_user.items():
            user = user_map.get(user_id)
            if user:
                workload_percentage = round((data["task_count"] / total_tasks * 100) if total_tasks > 0 else 0, 0)
                team_workload.append({
                    "user_id": user_id,
                    "user_name": user.full_name(),
                    "user_email": user.email,
                    "task_count": data["task_count"],
                    "in_progress": data["in_progress"],
                    "completed": data["completed"],
                    "workload_percentage": int(workload_percentage),
                })
    
    # Calculate status breakdown counts
    status_counts = {
        "todo": len(tasks_by_status["todo"]),
        "in_progress": len(tasks_by_status["in_progress"]),
        "in_review": len(tasks_by_status["in_review"]),
        "completed": len(tasks_by_status["completed"]),
        "cancelled": len(tasks_by_status["cancelled"]),
        "on_hold": len(tasks_by_status["on_hold"]),
    }
    total_work_items = sum(status_counts.values())
    
    # Prepare types of work
    types_of_work = []
    total_type_count = sum(tasks_by_type.values())
    for work_type, count in tasks_by_type.items():
        percentage = round((count / total_type_count * 100) if total_type_count > 0 else 0, 0)
        types_of_work.append({
            "type": work_type,
            "count": count,
            "percentage": int(percentage),
        })
    
    return {
        "project": {
            "id": str(project.id),
            "project_id": project.project_id if project.project_id else str(project.id),  # User-provided project_id
            "name": project.name,
            "key": project.key,
            "description": project.description,
            "status": project.status.value,
        },
        "activity_metrics": {
            "completed": completed_count,
            "updated": updated_count,
            "created": created_count,
            "due_soon": due_soon_count,
            "days": days,
        },
        "status_overview": {
            "total": total_work_items,
            "breakdown": status_counts,
        },
        "priority_breakdown": tasks_by_priority,
        "team_workload": team_workload,
        "types_of_work": types_of_work,
        "total_tasks": len(all_tasks),
    }


# Pages Endpoints
@router.get("/{project_id}/files")
async def list_project_files(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """List files attached to a project. Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    await ensure_project_access_for_user(project, current_user)
    
    return {"files": project.files or []}


@router.post("/{project_id}/files")
async def upload_project_file(
    project_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to a project. Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    await ensure_project_access_for_user(project, current_user)
    
    file_content = await file.read()
    file_size = len(file_content)
    
    if file_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB"
        )
    
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )
    
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = PROJECT_UPLOAD_DIR / unique_filename
    
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    file_url = f"/api/v1/files/projects/{unique_filename}"
    
    file_record = {
        "id": uuid.uuid4().hex,
        "name": file.filename,
        "original_name": file.filename,
        "url": file_url,
        "type": file_ext[1:] if file_ext else "unknown",
        "size": file_size,
        "uploaded_at": datetime.utcnow().isoformat(),
        "uploaded_by": str(current_user.id),
        "uploaded_by_name": current_user.full_name(),
    }
    
    if not project.files:
        project.files = []
    project.files.append(file_record)
    project.updated_at = datetime.utcnow()
    
    await project.save()
    
    return {
        "message": "File uploaded successfully",
        "file": file_record,
    }


@router.delete("/{project_id}/files/{file_id}")
async def delete_project_file(
    project_id: str,
    file_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete a file from a project. Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    await ensure_project_access_for_user(project, current_user)
    
    file_index = None
    for idx, file_data in enumerate(project.files or []):
        if file_data.get("id") == file_id:
            file_index = idx
            break
    
    if file_index is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    removed_file = project.files.pop(file_index)
    
    try:
        filename = Path(removed_file.get("url", "")).name
        file_path = PROJECT_UPLOAD_DIR / filename
        if file_path.exists():
            file_path.unlink()
    except Exception:
        pass
    
    project.updated_at = datetime.utcnow()
    await project.save()
    
    return {
        "message": "File deleted successfully",
        "file": removed_file,
    }


@router.post("/{project_id}/pages")
async def create_page(
    project_id: str,
    title: str = Form(...),
    content: str = Form(""),
    template: Optional[str] = Form(None),
    parent_page_id: Optional[str] = Form(None),
    status: Optional[str] = Form("draft"),
    current_user: User = Depends(get_current_user),
):
    """Create a new page in a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Use centralized hierarchical access check
    await ensure_project_access_for_user(project, current_user)
    
    # Validate status
    page_status = PageStatus.DRAFT
    if status:
        try:
            page_status = PageStatus(status.lower())
        except:
            pass
    
    # Validate parent page if provided
    if parent_page_id:
        parent_page = await Page.get(parent_page_id)
        if not parent_page or parent_page.project_id != project_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid parent page"
            )
    
    page = Page(
        title=title,
        content=content,
        company_id=current_user.company_id,
        project_id=project_id,
        created_by=str(current_user.id),
        created_by_name=current_user.full_name(),
        template=template or "blank",
        parent_page_id=parent_page_id,
        status=page_status,
    )
    
    if page_status == PageStatus.PUBLISHED:
        page.published_at = datetime.utcnow()
    
    await page.insert()
    
    return {
        "message": "Page created successfully",
        "page_id": str(page.id)
    }


@router.get("/{project_id}/pages")
async def list_pages(
    project_id: str,
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    """List all pages in a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Use centralized hierarchical access check
    await ensure_project_access_for_user(project, current_user)
    
    query = {
        "project_id": project_id,
        "company_id": project.company_id
    }
    
    if status_filter:
        try:
            query["status"] = PageStatus(status_filter.lower())
        except:
            pass
    
    pages = await Page.find(query).skip(skip).limit(limit).sort("-updated_at").to_list()
    total = await Page.find(query).count()
    
    return {
        "pages": [
            {
                "id": str(page.id),
                "title": page.title,
                "content": page.content[:200] + "..." if len(page.content) > 200 else page.content,  # Preview
                "status": page.status.value,
                "template": page.template,
                "created_by": page.created_by,
                "created_by_name": page.created_by_name,
                "updated_at": page.updated_at,
                "created_at": page.created_at,
            }
            for page in pages
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/{project_id}/pages/{page_id}")
async def get_page(
    project_id: str,
    page_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a specific page"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    page = await Page.get(page_id)
    
    if not page or page.project_id != project_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Page not found"
        )
    
    return {
        "id": str(page.id),
        "title": page.title,
        "content": page.content,
        "status": page.status.value,
        "template": page.template,
        "created_by": page.created_by,
        "created_by_name": page.created_by_name,
        "updated_by": page.updated_by,
        "updated_by_name": page.updated_by_name,
        "labels": page.labels,
        "attachments": page.attachments,
        "created_at": page.created_at,
        "updated_at": page.updated_at,
        "published_at": page.published_at,
    }


@router.put("/{project_id}/pages/{page_id}")
async def update_page(
    project_id: str,
    page_id: str,
    title: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Update a page"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    page = await Page.get(page_id)
    
    if not page or page.project_id != project_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Page not found"
        )
    
    if title is not None:
        page.title = title
    if content is not None:
        page.content = content
    if status:
        try:
            page.status = PageStatus(status.lower())
            if page.status == PageStatus.PUBLISHED and not page.published_at:
                page.published_at = datetime.utcnow()
        except:
            pass
    
    page.updated_by = str(current_user.id)
    page.updated_by_name = current_user.full_name()
    page.updated_at = datetime.utcnow()
    
    await page.save()
    
    return {"message": "Page updated successfully"}


@router.delete("/{project_id}/pages/{page_id}")
async def delete_page(
    project_id: str,
    page_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete a page"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    page = await Page.get(page_id)
    
    if not page or page.project_id != project_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Page not found"
        )
    
    await page.delete()
    
    return {"message": "Page deleted successfully"}


# Board Columns Management Endpoints
@router.get("/{project_id}/board-columns")
async def get_board_columns(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get board columns for a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Ensure default columns exist if none are set
    if not project.board_columns:
        project.board_columns = [
            {"id": "todo", "label": "TO DO", "color": "bg-gray-100", "order": 0},
            {"id": "in_progress", "label": "IN PROGRESS", "color": "bg-blue-100", "order": 1},
            {"id": "in_review", "label": "IN REVIEW", "color": "bg-yellow-100", "order": 2},
            {"id": "completed", "label": "COMPLETED", "color": "bg-green-100", "order": 3},
        ]
        await project.save()
    
    # Sort by order
    sorted_columns = sorted(project.board_columns, key=lambda x: x.get("order", 0))
    
    return {"columns": sorted_columns}


@router.post("/{project_id}/board-columns")
async def create_board_column(
    project_id: str,
    label: str = Form(...),
    color: str = Form("bg-gray-100"),
    order: Optional[int] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a new board column"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Ensure board_columns exists
    if not project.board_columns:
        project.board_columns = [
            {"id": "todo", "label": "TO DO", "color": "bg-gray-100", "order": 0},
            {"id": "in_progress", "label": "IN PROGRESS", "color": "bg-blue-100", "order": 1},
            {"id": "in_review", "label": "IN REVIEW", "color": "bg-yellow-100", "order": 2},
            {"id": "completed", "label": "COMPLETED", "color": "bg-green-100", "order": 3},
        ]
    
    # Generate unique ID for the column
    import uuid
    column_id = f"col_{uuid.uuid4().hex[:8]}"
    
    # Determine order
    if order is None:
        max_order = max([col.get("order", 0) for col in project.board_columns], default=-1)
        order = max_order + 1
    
    # Create new column
    new_column = {
        "id": column_id,
        "label": label,
        "color": color,
        "order": order,
    }
    
    project.board_columns.append(new_column)
    project.updated_at = datetime.utcnow()
    await project.save()
    
    return {"message": "Column created successfully", "column": new_column}


@router.put("/{project_id}/board-columns/{column_id}")
async def update_board_column(
    project_id: str,
    column_id: str,
    label: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    order: Optional[int] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update a board column"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Ensure board_columns exists
    if not project.board_columns:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="No columns found"
        )
    
    # Find the column
    column_index = None
    for idx, col in enumerate(project.board_columns):
        if col.get("id") == column_id:
            column_index = idx
            break
    
    if column_index is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Column not found"
        )
    
    # Update column
    if label is not None:
        project.board_columns[column_index]["label"] = label
    if color is not None:
        project.board_columns[column_index]["color"] = color
    if order is not None:
        project.board_columns[column_index]["order"] = order
    
    project.updated_at = datetime.utcnow()
    await project.save()
    
    return {
        "message": "Column updated successfully",
        "column": project.board_columns[column_index]
    }


@router.delete("/{project_id}/board-columns/{column_id}")
async def delete_board_column(
    project_id: str,
    column_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete a board column"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Ensure board_columns exists
    if not project.board_columns:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="No columns found"
        )
    
    # Check if column exists
    column_exists = any(col.get("id") == column_id for col in project.board_columns)
    
    if not column_exists:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Column not found"
        )
    
    # Prevent deleting default columns (can be customized later)
    default_column_ids = ["todo", "in_progress", "in_review", "completed"]
    if column_id in default_column_ids and len(project.board_columns) <= 4:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete default columns"
        )
    
    # Check if there are tasks in this column - use user-provided project_id, fallback to MongoDB _id
    project_id_for_query = project.project_id if project.project_id else str(project.id)
    tasks_in_column = await Task.find({
        "$or": [
            {"project_id": project_id_for_query},
            {"project_id": str(project.id)}  # Also check MongoDB _id for old tasks
        ],
        "company_id": project.company_id,
        "status": column_id
    }).count()
    
    if tasks_in_column > 0:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete column with {tasks_in_column} task(s). Please move tasks first."
        )
    
    # Remove column
    project.board_columns = [col for col in project.board_columns if col.get("id") != column_id]
    project.updated_at = datetime.utcnow()
    await project.save()
    
    return {"message": "Column deleted successfully"}

