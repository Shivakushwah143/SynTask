from fastapi import APIRouter

from .shared import *
from app.api.deps import Pagination50, PaginationParams

router = APIRouter()


@router.get("/")
async def list_projects(
    status_filter: Optional[str] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """List projects for the company with role-based visibility"""
    skip, limit = pagination.skip, pagination.limit
    cache_key = None
    if current_user.company_id:
        cache_key = f"{project_list_key(current_user.company_id)}:{current_user.role.value}:{current_user.id}:{status_filter or 'all'}:{skip}:{limit}"
        cached = await cache_get(cache_key)
        if cached:
            return cached

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
            delta = project.delivery_date - datetime.now()
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
            "client_id": project.client_id,
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
    
    data = {
        "projects": projects_with_stats,
        "total": total,
        "skip": skip,
        "limit": limit
    }
    if cache_key:
        await cache_set(cache_key, data, ttl=180)
    return data


