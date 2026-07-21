from fastapi import APIRouter

from app.events import publish_event
from app.events.factories import build_domain_event
from .shared import *
from app.core.clock import utc_now

router = APIRouter()


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete project. Admin full control; Manager only scoped projects."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    check_company_access(current_user, project.company_id)
    if not await can_manage_project(project, current_user):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this project",
        )
    
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

    await publish_event(
        build_domain_event(
            event_name="ProjectArchived",
            aggregate_type="project",
            aggregate_id=str(project.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload={
                "project_id": project.project_id,
                "name": project.name,
                "description": project.description,
                "status": project.status.value if getattr(project, "status", None) else None,
                "updated_at": utc_now().isoformat(),
            },
            project_id=str(project.project_id or project.id),
            metadata={"source": "project_delete"},
        )
    )
    
    await project.delete()
    await cache_delete(project_list_key(project.company_id))
    await cache_delete_pattern(f"dashboard:stats:{project.company_id}:*")
    
    return {"message": "Project deleted successfully"}


# Epic Endpoints

