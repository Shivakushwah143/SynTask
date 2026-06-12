from fastapi import APIRouter

from .shared import *

router = APIRouter()


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    """Delete project (only Company Admin). Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    check_company_access(current_user, project.company_id)
    
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
    
    await project.delete()
    
    return {"message": "Project deleted successfully"}


# Epic Endpoints


