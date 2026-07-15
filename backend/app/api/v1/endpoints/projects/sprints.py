from fastapi import APIRouter

from .shared import *

router = APIRouter()


@router.post("/{project_id}/sprints")
async def create_sprint(
    project_id: str,
    name: str = Form(...),
    goal: Optional[str] = Form(None),
    start_date: str = Form(...),
    end_date: str = Form(...),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a sprint in a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    try:
        parsed_start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        parsed_end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    except:
        try:
            parsed_start = datetime.strptime(start_date, '%Y-%m-%dT%H:%M')
            parsed_end = datetime.strptime(end_date, '%Y-%m-%dT%H:%M')
        except:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format"
            )
    
    if parsed_end <= parsed_start:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="End date must be after start date"
        )
    
    sprint = Sprint(
        name=name,
        project_id=project_id,
        company_id=current_user.company_id,
        goal=goal,
        start_date=parsed_start,
        end_date=parsed_end,
        created_by=str(current_user.id),
    )
    
    await sprint.insert()
    
    return {
        "message": "Sprint created successfully",
        "sprint_id": str(sprint.id)
    }


@router.get("/{project_id}/sprints")
async def list_sprints(
    project_id: str,
    state: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """List sprints in a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    query = {
        "project_id": project_id,
        "company_id": project.company_id
    }
    
    if state:
        query["state"] = state
    
    sprints = await Sprint.find(query).sort("-created_at").to_list()
    
    # Get task counts for each sprint
    sprints_with_stats = []
    for sprint in sprints:
        task_count = await Task.find({
            "sprint_id": str(sprint.id),
            "company_id": sprint.company_id
        }).count()
        
        sprints_with_stats.append({
            "id": str(sprint.id),
            "name": sprint.name,
            "goal": sprint.goal,
            "state": sprint.state,
            "start_date": sprint.start_date,
            "end_date": sprint.end_date,
            "task_count": task_count,
            "created_at": sprint.created_at,
        })
    
    return {"sprints": sprints_with_stats}


@router.patch("/{project_id}/sprints/{sprint_id}/state")
async def update_sprint_state(
    project_id: str,
    sprint_id: str,
    state: str = Form(...),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update sprint state (future, active, closed)"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    sprint = await Sprint.get(sprint_id)
    
    if not sprint or sprint.project_id != project_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Sprint not found"
        )
    
    valid_states = ["future", "active", "closed"]
    if state not in valid_states:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid state. Must be one of: {', '.join(valid_states)}"
        )
    
    sprint.state = state
    if state == "closed":
        sprint.completed_at = datetime.now()
    
    sprint.updated_at = datetime.now()
    await sprint.save()
    
    return {"message": "Sprint state updated successfully"}



