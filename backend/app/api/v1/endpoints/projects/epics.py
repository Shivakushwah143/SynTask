from fastapi import APIRouter

from .shared import *

router = APIRouter()


@router.post("/{project_id}/epics")
async def create_epic(
    project_id: str,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    owner_id: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Create an epic in a project. Path project_id can be custom ID or MongoDB _id."""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    if not has_project_permission(current_user, project, ProjectPermission.MANAGE_EPIC):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="You do not have permission to manage epics")
    
    parsed_due_date = None
    if due_date:
        try:
            parsed_due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
        except:
            try:
                parsed_due_date = datetime.strptime(due_date, '%Y-%m-%dT%H:%M')
            except:
                pass
    
    epic = Epic(
        name=name,
        description=description,
        project_id=project_id,
        company_id=current_user.company_id,
        created_by=str(current_user.id),
        owner_id=owner_id,
        due_date=parsed_due_date,
        color=color or "#0052CC",
    )
    
    await epic.insert()
    
    return {
        "message": "Epic created successfully",
        "epic_id": str(epic.id)
    }


@router.get("/{project_id}/epics")
async def list_epics(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """List epics in a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    await ensure_project_access_for_user(project, current_user)
    
    epics = await Epic.find({
        "project_id": project_id,
        "company_id": project.company_id
    }).sort("-created_at").to_list()
    
    # Get task counts for each epic
    epics_with_stats = []
    for epic in epics:
        task_count = await Task.find({
            "epic_id": str(epic.id),
            "company_id": epic.company_id
        }).count()
        
        epics_with_stats.append({
            "id": str(epic.id),
            "name": epic.name,
            "description": epic.description,
            "status": epic.status,
            "owner_id": epic.owner_id,
            "task_count": task_count,
            "progress_percentage": epic.progress_percentage,
            "color": epic.color,
            "due_date": epic.due_date,
            "created_at": epic.created_at,
        })
    
    return {"epics": epics_with_stats}


# Sprint Endpoints
