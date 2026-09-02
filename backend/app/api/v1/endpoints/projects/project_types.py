from fastapi import APIRouter, Form

from .shared import *
from app.models.project import ProjectTypeConfiguration
from app.services.project_service import ProjectService

router = APIRouter()

DEFAULT_PROJECT_TYPES = [
    ("social_media", "Social Media"),
    ("website", "Website"),
    ("software_development", "Software Development"),
    ("recruitment", "Recruitment"),
    ("branding", "Branding"),
    ("seo", "SEO"),
    ("performance_marketing", "Performance Marketing"),
    ("content", "Content"),
    ("design", "Design"),
    ("video_production", "Video Production"),
    ("consulting", "Consulting"),
    ("internal", "Internal"),
    ("other", "Other"),
    ("software", "Software"),
    ("business", "Business"),
    ("marketing", "Marketing"),
    ("operations", "Operations"),
]


async def _seed_default_project_types(company_id: str, current_user: User) -> None:
    for value, label in DEFAULT_PROJECT_TYPES:
        existing = await ProjectTypeConfiguration.find_one(
            ProjectTypeConfiguration.company_id == company_id,
            ProjectTypeConfiguration.value == value,
        )
        if not existing:
            await ProjectTypeConfiguration(
                company_id=company_id,
                value=value,
                label=label,
                is_default=True,
                created_by=str(current_user.id),
            ).insert()


@router.get("/types")
async def list_project_types(current_user: User = Depends(get_current_user)):
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    await _seed_default_project_types(current_user.company_id, current_user)
    items = await ProjectTypeConfiguration.find(
        ProjectTypeConfiguration.company_id == current_user.company_id,
        ProjectTypeConfiguration.active == True,
    ).sort("label").to_list()
    return {
        "project_types": [
            {
                "id": str(item.id),
                "value": item.value,
                "label": item.label,
                "is_default": item.is_default,
            }
            for item in items
        ]
    }


@router.post("/types")
async def create_project_type(
    label: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    if not await can_create_project(current_user):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Only Admins and Managers can manage project types")
    if not current_user.company_id:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    value = await ProjectService.ensure_project_type(current_user.company_id, label, current_user)
    item = await ProjectTypeConfiguration.find_one(
        ProjectTypeConfiguration.company_id == current_user.company_id,
        ProjectTypeConfiguration.value == value,
    )
    return {
        "project_type": {
            "id": str(item.id),
            "value": item.value,
            "label": item.label,
            "is_default": item.is_default,
        }
    }
