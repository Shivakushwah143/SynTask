from fastapi import APIRouter

from app.services.project_service import ProjectService
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
    await ProjectService.update_project(
        project=project,
        current_user=current_user,
        name=name,
        description=description,
        status_filter=status_filter,
        lead_id=lead_id,
        assigned_to=assigned_to,
        start_date=start_date,
        delivery_date=delivery_date,
    )

    return {"message": "Project updated successfully"}
