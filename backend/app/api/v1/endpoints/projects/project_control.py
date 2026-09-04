from fastapi import APIRouter, Form

from app.models.project import ProjectStatus
from app.services.project_completion_service import archive_project, completion_readiness, mark_project_completed
from app.services.project_workflow import advance_project
from .shared import *

router = APIRouter()


@router.get("/{project_id}/completion-readiness")
async def get_completion_readiness(project_id: str, current_user: User = Depends(get_current_user)):
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Project not found")
    await ensure_project_access_for_user(project, current_user)
    return await completion_readiness(project, current_user)


@router.post("/{project_id}/complete")
async def complete_project(project_id: str, current_user: User = Depends(get_current_user)):
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Project not found")
    check_company_access(current_user, project.company_id)
    project = await mark_project_completed(project, current_user)
    return {"message": "Project completed", "project_id": str(project.id), "status": project.status.value, "completed_at": project.completed_at, "completed_by": project.completed_by}


@router.post("/{project_id}/archive")
async def archive_completed_project(project_id: str, current_user: User = Depends(get_current_user)):
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Project not found")
    check_company_access(current_user, project.company_id)
    project = await archive_project(project, current_user)
    return {"message": "Project archived", "project_id": str(project.id), "status": project.status.value}


@router.post("/{project_id}/reopen")
async def reopen_project(
    project_id: str,
    reason: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Project not found")
    check_company_access(current_user, project.company_id)
    if not await can_manage_project(project, current_user):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You do not have permission to reopen this project")
    if not reason.strip():
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Reopen reason is required")
    if enum_or_string_value(project.status) != ProjectStatus.COMPLETED.value:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Only completed projects can be reopened")
    old_status = enum_or_string_value(project.status)
    project.status = ProjectStatus.REVIEW
    project.completed_at = None
    project.completed_by = None
    project.updated_at = utc_now()
    await project.save()
    from app.services.project_completion_service import _record_project_audit
    await _record_project_audit(project, current_user, "reopen", old_status, ProjectStatus.REVIEW.value, reason=reason)
    return {"message": "Project reopened", "project_id": str(project.id), "status": project.status.value}
