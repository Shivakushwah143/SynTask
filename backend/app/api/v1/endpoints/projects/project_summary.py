from fastapi import APIRouter

from .shared import *
from app.core.clock import utc_now

router = APIRouter()


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
    if current_user.role == UserRole.EMPLOYEE and not has_project_permission(current_user, project, ProjectPermission.MANAGE_TASK):
        task_query["assigned_to"] = str(current_user.id)
    all_tasks = await Task.find(task_query).to_list()
    
    # Calculate date range
    from datetime import timedelta
    now = utc_now()
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
        task_status = enum_or_string_value(task.status)
        task_priority = enum_or_string_value(task.priority)
        # Status breakdown
        status_key = task_status
        if status_key in tasks_by_status:
            tasks_by_status[status_key].append(task)
        
        # Priority breakdown
        if task.priority:
            priority_key = task_priority
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
            if task_status == "in_progress":
                assigned_tasks_by_user[task.assigned_to]["in_progress"] += 1
            if task_status == "completed":
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
            **serialize_project_permissions(current_user, project),
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



