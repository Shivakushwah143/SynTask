from fastapi import APIRouter

from .shared import *
from app.models.client import Client
from app.services.project_health_service import calculate_project_health, project_task_identity_filter, serialize_project_health

router = APIRouter()


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
    await ensure_project_access_for_user(project, current_user)
    
    # Get project statistics. Match tasks by path param, project.project_id, or MongoDB _id
    project_id_for_query = project.project_id if project.project_id else str(project.id)
    or_conditions = [
        {"project_id": project_id_for_query},
        {"project_id": str(project.id)},
    ]
    if project_id and project_id not in (str(project.id), project_id_for_query):
        or_conditions.append({"project_id": project_id})
    task_query = {"$or": or_conditions, "company_id": project.company_id}
    if current_user.role == UserRole.EMPLOYEE and not has_project_permission(current_user, project, ProjectPermission.MANAGE_TASK):
        task_query["assigned_to"] = str(current_user.id)
    all_tasks = await Task.find(task_query).to_list()
    health = calculate_project_health(project, all_tasks)
    owner = None
    if getattr(project, "lead_id", None) and ObjectId.is_valid(str(project.lead_id)):
        owner = await User.get(project.lead_id)
    client = await Client.get(project.client_id) if getattr(project, "client_id", None) else None
    
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
        task_status = enum_or_string_value(task.status)
        task_priority = enum_or_string_value(task.priority)
        # Count by status
        if task_status in tasks_by_status:
            tasks_by_status[task_status] += 1
        
        # Count by priority
        if task_priority in tasks_by_priority:
            tasks_by_priority[task_priority] += 1
        
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
                    "status": task_status,
                    "priority": task_priority,
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
        "type": enum_or_string_value(project.type, ProjectType.SOFTWARE.value),
        "status": enum_or_string_value(project.status),
        "priority": enum_or_string_value(getattr(project, "priority", None), "medium"),
        "client_id": project.client_id,
        "client": {"id": str(client.id), "name": client.name} if client and str(client.company_id) == str(project.company_id) else None,
        "lead_id": project.lead_id,
        "owner": {"id": str(owner.id), "name": owner.full_name(), "role": owner.role.value} if owner else None,
        "owner_name": owner.full_name() if owner else "Owner not assigned",
        "assigned_to": project.assigned_to,
        "assigned_user_ids": getattr(project, "assigned_user_ids", []) or ([project.assigned_to] if project.assigned_to else []),
        "assignment_history": getattr(project, "assignment_history", []) or [],
        "assigned_by": project.assigned_by,
        "assigned_at": project.assigned_at,
        "team_member_ids": project.team_member_ids,
        "start_date": project.start_date,
        "delivery_date": project.delivery_date,
        "end_date": project.end_date,
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
        "project_health": serialize_project_health(health),
        "health": health.level,
        "progress_percentage": health.completion_percentage,
        "completed_task_count": health.completed_task_count,
        "open_task_count": health.total_open_tasks,
        "overdue_task_count": health.overdue_task_count,
        "deadline_urgency": health.deadline_urgency,
        "assigned_tasks_by_user": list(assigned_tasks_by_user.values()),
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        **serialize_project_permissions(current_user, project),
    }
    
    # Include task list if requested
    if include_tasks:
        response["tasks"] = [
            {
                "id": str(task.id),
                "title": task.title,
                "description": task.description,
                "status": enum_or_string_value(task.status),
                "priority": enum_or_string_value(task.priority),
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

