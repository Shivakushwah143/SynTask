from fastapi import APIRouter

from .shared import *
from app.models.client import Client
from app.events import publish_event
from app.events.factories import build_domain_event

router = APIRouter()


@router.post("/")
async def create_project(
    name: str = Form(...),
    key: str = Form(...),
    description: Optional[str] = Form(None),
    type: str = Form("software"),
    client_id: Optional[str] = Form(None),
    lead_id: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    assigned_user_ids: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    delivery_date: Optional[str] = Form(None),
    priority: Optional[str] = Form("medium"),
    project_id: str = Form(...),  # MANDATORY - User-provided unique project ID
    current_user: User = Depends(get_current_user),
):
    """Create a new project. Admins and Managers may create within scope."""
    from app.services.project_service import ProjectService
    return await ProjectService.create_project_core(
        name=name,
        key=key,
        description=description,
        type=type,
        client_id=client_id,
        lead_id=lead_id,
        assigned_to=assigned_to,
        assigned_user_ids=assigned_user_ids,
        start_date=start_date,
        delivery_date=delivery_date,
        priority=priority,
        project_id=project_id,
        current_user=current_user
    )

