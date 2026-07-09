from fastapi import APIRouter

from app.services.project_service import ProjectService
from app.services.project_workflow import advance_project
from app.events import publish_event
from app.events.factories import build_domain_event
from .shared import *

router = APIRouter()


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
            detail="Project not found",
        )

    check_company_access(current_user, project.company_id)
    if status_filter:
        await advance_project(
            project=project,
            current_user=current_user,
            target_status=status_filter,
        )
    await ProjectService.update_project(
        project=project,
        current_user=current_user,
        name=name,
        description=description,
        status_filter=None,
        lead_id=lead_id,
        assigned_to=assigned_to,
        start_date=start_date,
        delivery_date=delivery_date,
    )

    await publish_event(
        build_domain_event(
            event_name="ProjectUpdated",
            aggregate_type="project",
            aggregate_id=str(project.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload={
                "project_id": project.project_id,
                "name": project.name,
                "description": project.description,
                "status": project.status.value if getattr(project, "status", None) else None,
                "completed_at": project.completed_at.isoformat() if getattr(project, "completed_at", None) else None,
                "updated_at": project.updated_at.isoformat() if getattr(project, "updated_at", None) else None,
            },
            project_id=str(project.project_id or project.id),
            metadata={"source": "project_update"},
        )
    )

    return {"message": "Project updated successfully"}
