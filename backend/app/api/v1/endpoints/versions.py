"""
Versions/Releases Endpoints - Manage project versions
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form
from typing import Optional
from datetime import datetime

from app.models.versions import Version, VersionStatus
from app.models.project import Project
from app.models.user import User
from app.api.dependencies import get_current_user, get_current_company_admin_or_lead, check_company_access
from app.core.clock import utc_now

router = APIRouter()


@router.post("/projects/{project_id}/versions")
async def create_version(
    project_id: str,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    release_date: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a version for a project"""
    project = await Project.get(project_id)
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    parsed_start = None
    parsed_release = None
    
    if start_date:
        try:
            parsed_start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except:
            pass
    
    if release_date:
        try:
            parsed_release = datetime.fromisoformat(release_date.replace('Z', '+00:00'))
        except:
            pass
    
    version = Version(
        name=name,
        description=description,
        project_id=project_id,
        company_id=current_user.company_id,
        start_date=parsed_start,
        release_date=parsed_release,
        created_by=str(current_user.id),
    )
    
    await version.insert()
    
    return {
        "message": "Version created successfully",
        "version_id": str(version.id)
    }


@router.get("/projects/{project_id}/versions")
async def list_versions(
    project_id: str,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """List versions for a project"""
    project = await Project.get(project_id)
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    query = {
        "project_id": project_id,
        "company_id": project.company_id
    }
    
    if status:
        try:
            query["status"] = VersionStatus(status.lower())
        except:
            pass
    
    versions = await Version.find(query).sort("-created_at").to_list()
    
    return {
        "versions": [
            {
                "id": str(v.id),
                "name": v.name,
                "description": v.description,
                "status": v.status.value,
                "released": v.released,
                "start_date": v.start_date,
                "release_date": v.release_date,
            }
            for v in versions
        ]
    }


@router.patch("/{version_id}/release")
@router.patch("/versions/{version_id}/release")
async def release_version(
    version_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Release a version"""
    version = await Version.get(version_id)
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    check_company_access(current_user, version.company_id)
    
    version.released = True
    version.status = VersionStatus.RELEASED
    if not version.release_date:
        version.release_date = utc_now()
    version.updated_at = utc_now()
    await version.save()
    
    return {"message": "Version released successfully"}


