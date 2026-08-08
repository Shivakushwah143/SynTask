from fastapi import APIRouter

from app.events import publish_event
from app.events.factories import build_domain_event
from .shared import *
from app.core.clock import utc_now
from app.services.project_service import ProjectService

router = APIRouter()


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Delete a project and everything it owns (all tasks, epics, sprints, etc.).

    Thin endpoint: authorization + delegation to the centralized cascade
    service. Deleting a project no longer requires the project to be empty -
    all tasks belonging to it are cascade-deleted atomically.

    Outcomes:
      404 - project does not exist in the caller's organization
      403 - caller lacks delete permission (org managers only)
      200 - project and its tasks/dependent records deleted
    """
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    check_company_access(current_user, project.company_id)
    if not await can_manage_project(project, current_user):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this project",
        )

    summary = await ProjectService.delete_project_cascade(
        project=project,
        current_user=current_user,
    )

    # Downstream notification is best-effort: the delete already succeeded, so
    # a failing event must not turn a successful delete into an error response.
    try:
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
    except Exception as exc:
        logger.warning(
            "PROJECT_DELETE_EVENT_FAILED project_id=%s error=%s",
            project.project_id or project.id, exc,
        )

    return {
        "message": "Project deleted successfully",
        "deleted_tasks": summary.get("deleted_tasks", 0),
        "deleted_records": summary.get("deleted_records", {}),
    }


# Epic Endpoints

