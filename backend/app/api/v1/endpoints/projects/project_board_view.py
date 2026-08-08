from fastapi import APIRouter

from .shared import *

router = APIRouter()


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
    
    # Get all tasks for this project. Match by: path param (e.g. ak-001), project.project_id,
    # MongoDB _id, or project_object_id (normalized Mongo-id link used by some integrations).
    project_id_for_query = project.project_id if project.project_id else str(project.id)
    or_conditions = [
        {"project_id": project_id_for_query},
        {"project_id": str(project.id)},
        {"project_object_id": str(project.id)},
    ]
    if project_id and project_id != str(project.id) and project_id != project_id_for_query:
        or_conditions.append({"project_id": project_id})  # path param (custom id)
    task_query = {"$or": or_conditions, "company_id": project.company_id}
    if current_user.role == UserRole.EMPLOYEE and not has_project_permission(current_user, project, ProjectPermission.MANAGE_TASK):
        # Employees who are involved in this project (a project member, or assigned to any
        # task in it) see the full project board so they can track the whole project. Only
        # unrelated employees keep the own-tasks-only view. The Tasks list page is NOT
        # affected - its visibility query (build_task_list_query) is unchanged.
        employee_id = str(current_user.id)
        involved_in_project = (
            employee_id in project_assignee_ids(project)
            or employee_id in (getattr(project, "team_member_ids", None) or [])
        )
        if not involved_in_project:
            assigned_task = await Task.find_one({
                "company_id": project.company_id,
                "$or": or_conditions,
                "assigned_to": employee_id,
            })
            if assigned_task is None:
                task_query["assigned_to"] = employee_id
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
        status_key = enum_or_string_value(task.status)
        priority_key = enum_or_string_value(task.priority)
        if status_key in tasks_by_status:
            assigned_user = user_map.get(task.assigned_to) if task.assigned_to else None
            created_user = user_map.get(task.created_by) if task.created_by else None
            
            task_data = {
                "id": str(task.id),
                "title": task.title,
                "description": task.description,
                "status": status_key,
                "priority": priority_key,
                "assigned_to": task.assigned_to,
                "assigned_to_name": assigned_user.full_name() if assigned_user else None,
                "created_by": task.created_by,
                "created_by_name": created_user.full_name() if created_user else None,
                "due_date": iso_datetime_or_string(task.due_date),
                "created_at": iso_datetime_or_string(task.created_at),
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
    assigned_ids = project_assignee_ids(project)
    assigned_users = []
    for user_id in assigned_ids:
        if not ObjectId.is_valid(str(user_id)):
            continue
        assigned_user = await User.get(user_id)
        if assigned_user:
            assigned_users.append({
                "id": str(assigned_user.id),
                "name": assigned_user.full_name(),
                "role": enum_or_string_value(assigned_user.role),
            })
    
    return {
        "project": {
            "id": str(project.id),
            "project_id": project.project_id if project.project_id else str(project.id),  # User-provided project_id
            "name": project.name,
            "key": project.key,
            "description": project.description,
            "type": enum_or_string_value(project.type, ProjectType.SOFTWARE.value),
            "status": enum_or_string_value(project.status),
            "lead_id": project.lead_id,
            "assigned_to": project.assigned_to,
            "assigned_user_ids": getattr(project, "assigned_user_ids", []) or ([project.assigned_to] if project.assigned_to else []),
            "assigned_users": assigned_users,
            "created_by": project.created_by,
            "start_date": iso_datetime_or_string(project.start_date),
            "delivery_date": iso_datetime_or_string(project.delivery_date),
            "end_date": iso_datetime_or_string(project.end_date),
            "created_at": iso_datetime_or_string(project.created_at),
            "updated_at": iso_datetime_or_string(project.updated_at),
            **serialize_project_permissions(current_user, project),
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


