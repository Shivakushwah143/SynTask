from fastapi import APIRouter

from .shared import *
from app.models.scheduled_job import ScheduledJob, ScheduledJobActionType, ScheduledJobStatus
from app.api.deps import Pagination50, PaginationParams
from app.api.v1.endpoints.tasks import build_employee_project_visibility_query
from app.api.v1.endpoints.tasks import serialize_utc_datetime
from app.core.clock import utc_now
from app.models.client import Client
from app.services.project_health_service import calculate_project_health, project_task_identity_filter, serialize_project_health

router = APIRouter()


def serialize_scheduled_project_placeholder(job: ScheduledJob) -> dict:
    payload = job.payload or {}
    return {
        "id": f"scheduled-{job.id}",
        "project_id": payload.get("project_id") or f"scheduled-{job.id}",
        "name": payload.get("name") or "Scheduled project",
        "key": payload.get("key") or payload.get("project_id") or "SCHEDULED",
        "description": payload.get("description"),
        "type": payload.get("type") or ProjectType.SOFTWARE.value,
        "status": "scheduled",
        "client_id": payload.get("client_id"),
        "lead_id": payload.get("lead_id"),
        "assigned_to": payload.get("assigned_to") or payload.get("lead_id"),
        "assigned_user_ids": [],
        "assigned_users": [],
        "assigned_to_name": None,
        "start_date": payload.get("start_date"),
        "delivery_date": payload.get("delivery_date"),
        "days_until_delivery": None,
        "priority": payload.get("priority") or "medium",
        "deadline_urgency": "scheduled",
        "project_health": {"level": "healthy", "reasons": [], "overdue_task_count": 0, "total_open_tasks": 0, "completion_percentage": 0, "days_until_deadline": None, "last_activity_at": None},
        "progress_percentage": 0,
        "task_count": 0,
        "completed_task_count": 0,
        "created_at": serialize_utc_datetime(job.created_at),
        "is_scheduled_placeholder": True,
        "scheduled_job_id": str(job.id),
        "scheduled_run_at": job.run_at,
        "scheduled_status": job.status.value if hasattr(job.status, "value") else job.status,
        "created_by": job.created_by,
    }


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
            {"lead_id": str(current_user.id)},
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
        project_tasks = await Task.find(project_task_identity_filter(project)).to_list()
        task_count = len(project_tasks)
        health = calculate_project_health(project, project_tasks)
        
        assigned_ids = project_assignee_ids(project)
        assigned_users = []
        for user_id in assigned_ids:
            assigned_user = await User.get(user_id)
            if assigned_user:
                assigned_users.append({"id": str(assigned_user.id), "name": assigned_user.full_name(), "role": assigned_user.role.value})
        owner = await User.get(project.lead_id) if getattr(project, "lead_id", None) and ObjectId.is_valid(str(project.lead_id)) else None
        client = await Client.get(project.client_id) if getattr(project, "client_id", None) and ObjectId.is_valid(str(project.client_id)) else None
        
        # Calculate days until delivery
        days_until_delivery = None
        deadline_urgency = "none"
        if project.delivery_date:
            delta = project.delivery_date - utc_now()
            days_until_delivery = delta.days
            if days_until_delivery < 0:
                deadline_urgency = "overdue"
            elif days_until_delivery <= 2:
                deadline_urgency = "urgent"
            elif days_until_delivery <= 7:
                deadline_urgency = "soon"
            elif days_until_delivery <= 14:
                deadline_urgency = "upcoming"
            else:
                deadline_urgency = "normal"
        
        projects_with_stats.append({
            "id": str(project.id),
            "project_id": project.project_id if project.project_id else str(project.id),  # User-provided project_id
            "name": project.name,
            "key": project.key,
            "description": project.description,
            "type": enum_or_string_value(project.type, ProjectType.SOFTWARE.value),
            "status": enum_or_string_value(project.status),
            "client_id": project.client_id,
            "client": {"id": str(client.id), "name": client.name} if client and str(client.company_id) == str(project.company_id) else None,
            "lead_id": project.lead_id,
            "owner": {"id": str(owner.id), "name": owner.full_name(), "role": owner.role.value} if owner else None,
            "owner_name": owner.full_name() if owner else "Owner not assigned",
            "assigned_to": project.assigned_to,
            "assigned_user_ids": getattr(project, "assigned_user_ids", []) or ([project.assigned_to] if project.assigned_to else []),
            "assigned_users": assigned_users,
            "assigned_to_name": assigned_users[0]["name"] if assigned_users else None,
            "start_date": project.start_date,
            "delivery_date": project.delivery_date,
            "days_until_delivery": days_until_delivery,
            "priority": enum_or_string_value(getattr(project, "priority", None), "medium"),
            "deadline_urgency": deadline_urgency,
            "project_health": serialize_project_health(health),
            "health": health.level,
            "progress_percentage": health.completion_percentage,
            "completed_task_count": health.completed_task_count,
            "overdue_task_count": health.overdue_task_count,
            "task_count": task_count,
            "created_at": project.created_at,
        })
    
    # Sort by delivery date (nearest deadline first, then by priority)
    projects_with_stats.sort(key=lambda x: (
        x["deadline_urgency"] == "overdue" and 0 or
        x["deadline_urgency"] == "urgent" and 1 or
        x["deadline_urgency"] == "soon" and 2 or
        x["deadline_urgency"] == "upcoming" and 3 or 4,
        x["delivery_date"] if x["delivery_date"] else datetime.max
    ))

    if not status_filter or status_filter.lower() == "scheduled":
        scheduled_query = {
            "action_type": ScheduledJobActionType.CREATE_PROJECT.value,
            "status": ScheduledJobStatus.PENDING.value,
            "created_by": str(current_user.id),
        }
        if current_user.company_id:
            scheduled_query["company_id"] = current_user.company_id
        scheduled_jobs = await ScheduledJob.find(scheduled_query).sort("run_at").to_list()
        scheduled_placeholders = [
            serialize_scheduled_project_placeholder(job)
            for job in scheduled_jobs
        ]
        if status_filter and status_filter.lower() == "scheduled":
            projects_with_stats = scheduled_placeholders
            total = len(scheduled_placeholders)
        else:
            projects_with_stats = scheduled_placeholders + projects_with_stats
            total += len(scheduled_placeholders)
    
    data = {
        "projects": projects_with_stats,
        "total": total,
        "skip": skip,
        "limit": limit
    }
    if cache_key:
        await cache_set(cache_key, data, ttl=180)
    return data


