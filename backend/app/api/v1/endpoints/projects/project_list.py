from fastapi import APIRouter

from .shared import *
from app.api.deps import Pagination50, PaginationParams
from app.api.v1.endpoints.tasks import build_employee_project_visibility_query
from app.core.clock import utc_now

router = APIRouter()


async def build_project_list_query(current_user: User) -> dict:
    """Build the project list query for the current user.

    Visibility matches ``shared.check_project_access``:
    - SUPER_ADMIN: all projects (no company scope)
    - ADMIN / SUB_ADMIN / MANAGER: all projects in their company
    - LEAD: projects they are assigned to / lead / team member of
    - EMPLOYEE: projects they are assigned to, team member of, or that
      contain a task assigned to them
    """
    if current_user.role == UserRole.SUPER_ADMIN:
        return {}

    if not current_user.company_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )

    # Admins and managers see every project in the company.
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER}:
        return {"company_id": current_user.company_id}

    query = {"company_id": current_user.company_id}
    if current_user.role == UserRole.LEAD:
        query["$or"] = [
            {"assigned_to": str(current_user.id)},
            {"assigned_user_ids": str(current_user.id)},
            {"team_member_ids": str(current_user.id)},
        ]
    elif current_user.role == UserRole.EMPLOYEE:
        assigned_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": str(current_user.id),
        }).to_list()
        query.update(build_employee_project_visibility_query(
            current_user,
            [task.project_id for task in assigned_tasks if getattr(task, "project_id", None)],
        ))
    return query


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

    query = await build_project_list_query(current_user)

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
        
        assigned_ids = project_assignee_ids(project)
        assigned_users = []
        for user_id in assigned_ids:
            assigned_user = await User.get(user_id)
            if assigned_user:
                assigned_users.append({"id": str(assigned_user.id), "name": assigned_user.full_name(), "role": assigned_user.role.value})
        
        # Calculate days until delivery
        days_until_delivery = None
        priority = "normal"
        if project.delivery_date:
            delta = project.delivery_date - utc_now()
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
            "type": enum_or_string_value(project.type, ProjectType.SOFTWARE.value),
            "status": enum_or_string_value(project.status),
            "client_id": project.client_id,
            "lead_id": project.lead_id,
            "assigned_to": project.assigned_to,
            "assigned_user_ids": getattr(project, "assigned_user_ids", []) or ([project.assigned_to] if project.assigned_to else []),
            "assigned_users": assigned_users,
            "assigned_to_name": assigned_users[0]["name"] if assigned_users else None,
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


