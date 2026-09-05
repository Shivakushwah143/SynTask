from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from bson import ObjectId

from app.api.dependencies import get_current_user
from app.core.clock import utc_now
from app.models.user import User
from app.models.work_evidence import ProjectResource
from app.services.project_permissions import ProjectPermission, require_project_permission

router = APIRouter()


class ResourcePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=2048)


def serialize_resource(item: ProjectResource) -> dict:
    return {"id": str(item.id), "name": item.name, "value": item.value, "created_by": item.created_by,
            "created_at": item.created_at, "updated_at": item.updated_at}


async def scoped_resource(project, resource_id: str) -> ProjectResource:
    if not ObjectId.is_valid(resource_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project resource not found")
    item = await ProjectResource.find_one({"_id": ObjectId(resource_id), "company_id": str(project.company_id), "project_id": str(project.project_id or project.id)})
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project resource not found")
    return item


@router.get("/{project_id}/resources")
async def list_resources(project_id: str, current_user: User = Depends(get_current_user)):
    project = await require_project_permission(current_user, project_id, ProjectPermission.VIEW_PROJECT)
    items = await ProjectResource.find({"company_id": str(project.company_id), "project_id": str(project.project_id or project.id)}).sort("created_at").to_list()
    return {"resources": [serialize_resource(item) for item in items]}


@router.post("/{project_id}/resources", status_code=201)
async def create_resource(project_id: str, payload: ResourcePayload, current_user: User = Depends(get_current_user)):
    project = await require_project_permission(current_user, project_id, ProjectPermission.MANAGE_PROJECT)
    item = ProjectResource(company_id=str(project.company_id), project_id=str(project.project_id or project.id),
                           name=payload.name.strip(), value=payload.value.strip(), created_by=str(current_user.id))
    await item.insert()
    return {"resource": serialize_resource(item)}


@router.put("/{project_id}/resources/{resource_id}")
async def update_resource(project_id: str, resource_id: str, payload: ResourcePayload, current_user: User = Depends(get_current_user)):
    project = await require_project_permission(current_user, project_id, ProjectPermission.MANAGE_PROJECT)
    item = await scoped_resource(project, resource_id)
    item.name, item.value, item.updated_at = payload.name.strip(), payload.value.strip(), utc_now()
    await item.save()
    return {"resource": serialize_resource(item)}


@router.delete("/{project_id}/resources/{resource_id}")
async def delete_resource(project_id: str, resource_id: str, current_user: User = Depends(get_current_user)):
    project = await require_project_permission(current_user, project_id, ProjectPermission.MANAGE_PROJECT)
    item = await scoped_resource(project, resource_id)
    await item.delete()
    return {"message": "Project resource deleted"}
