"""
Components Endpoints - Manage project components
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form
from typing import Optional
from datetime import datetime

from app.models.components import Component
from app.models.project import Project
from app.models.user import User
from app.api.dependencies import get_current_user, get_current_company_admin_or_lead, check_company_access, get_project_by_id

router = APIRouter()


@router.post("/projects/{project_id}/components")
async def create_component(
    project_id: str,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    lead_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a component for a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    component = Component(
        name=name,
        description=description,
        project_id=project_id,
        company_id=current_user.company_id,
        lead_id=lead_id,
        created_by=str(current_user.id),
    )
    
    await component.insert()
    
    return {
        "message": "Component created successfully",
        "component_id": str(component.id)
    }


@router.get("/projects/{project_id}/components")
async def list_components(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """List components for a project"""
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    components = await Component.find({
        "project_id": project_id,
        "company_id": project.company_id,
        "is_active": True
    }).sort("-created_at").to_list()
    
    return {
        "components": [
            {
                "id": str(c.id),
                "name": c.name,
                "description": c.description,
                "lead_id": c.lead_id,
            }
            for c in components
        ]
    }


