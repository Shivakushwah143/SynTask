"""
Content Template API — reusable templates for quick content creation.
"""
from __future__ import annotations

from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user, require_module
from app.models.user import User
from app.models.content_calendar import ContentTemplate, ContentItemType
from app.services.content_production_service import _company_id, _parse_enum, _display_name
from app.core.clock import utc_now

from fastapi import HTTPException, status as http_status


router = APIRouter(dependencies=[Depends(require_module("content_calendar"))])


class TemplateCreatePayload(BaseModel):
    name: str = Field(...)
    description: Optional[str] = None
    content_type: Optional[str] = None
    platform: Optional[str] = None
    default_objective: Optional[str] = None
    default_target_audience: Optional[str] = None
    default_key_message: Optional[str] = None
    default_tone: Optional[str] = None
    default_cta: Optional[str] = None
    default_tags: List[str] = Field(default_factory=list)
    default_assets_required: List[str] = Field(default_factory=list)


class TemplateUpdatePayload(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content_type: Optional[str] = None
    platform: Optional[str] = None
    default_objective: Optional[str] = None
    default_target_audience: Optional[str] = None
    default_key_message: Optional[str] = None
    default_tone: Optional[str] = None
    default_cta: Optional[str] = None
    default_tags: Optional[List[str]] = None
    default_assets_required: Optional[List[str]] = None
    is_active: Optional[bool] = None


def _serialize_template(t: ContentTemplate) -> dict:
    return {
        "id": str(t.id),
        "company_id": t.company_id,
        "name": t.name,
        "description": t.description,
        "content_type": t.content_type.value if t.content_type else ContentItemType.CUSTOM.value,
        "platform": t.platform,
        "default_objective": t.default_objective,
        "default_target_audience": t.default_target_audience,
        "default_key_message": t.default_key_message,
        "default_tone": t.default_tone,
        "default_cta": t.default_cta,
        "default_tags": list(t.default_tags or []),
        "default_assets_required": list(t.default_assets_required or []),
        "is_active": t.is_active,
        "created_by": t.created_by,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


@router.get("")
async def list_templates(
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    query = {"company_id": company_id, "is_active": True}
    templates = await ContentTemplate.find(query).sort("name").to_list()
    if search:
        q = search.lower().strip()
        templates = [t for t in templates if q in (t.name or "").lower() or q in (t.description or "").lower()]
    return {"templates": [_serialize_template(t) for t in templates]}


@router.post("")
async def create_template(
    payload: TemplateCreatePayload,
    current_user: User = Depends(get_current_user),
):
    company_id = _company_id(current_user)
    now = utc_now()
    template = ContentTemplate(
        company_id=company_id,
        name=payload.name.strip(),
        description=payload.description,
        content_type=_parse_enum(ContentItemType, payload.content_type, ContentItemType.CUSTOM),
        platform=payload.platform,
        default_objective=payload.default_objective,
        default_target_audience=payload.default_target_audience,
        default_key_message=payload.default_key_message,
        default_tone=payload.default_tone,
        default_cta=payload.default_cta,
        default_tags=list(payload.default_tags or []),
        default_assets_required=list(payload.default_assets_required or []),
        created_by=str(getattr(current_user, "id", "")),
        created_at=now,
        updated_at=now,
    )
    await template.insert()
    return {"template": _serialize_template(template)}


@router.patch("/{template_id}")
async def update_template(
    template_id: str,
    payload: TemplateUpdatePayload,
    current_user: User = Depends(get_current_user),
):
    template = await ContentTemplate.get(template_id)
    if not template:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Template not found")
    now = utc_now()
    if payload.name is not None:
        template.name = payload.name.strip()
    if payload.description is not None:
        template.description = payload.description
    if payload.content_type is not None:
        template.content_type = _parse_enum(ContentItemType, payload.content_type, template.content_type)
    if payload.platform is not None:
        template.platform = payload.platform
    if payload.default_objective is not None:
        template.default_objective = payload.default_objective
    if payload.default_target_audience is not None:
        template.default_target_audience = payload.default_target_audience
    if payload.default_key_message is not None:
        template.default_key_message = payload.default_key_message
    if payload.default_tone is not None:
        template.default_tone = payload.default_tone
    if payload.default_cta is not None:
        template.default_cta = payload.default_cta
    if payload.default_tags is not None:
        template.default_tags = list(payload.default_tags)
    if payload.default_assets_required is not None:
        template.default_assets_required = list(payload.default_assets_required)
    if payload.is_active is not None:
        template.is_active = payload.is_active
    template.updated_at = now
    await template.save()
    return {"template": _serialize_template(template)}


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
):
    template = await ContentTemplate.get(template_id)
    if not template:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Template not found")
    template.is_active = False
    template.updated_at = utc_now()
    await template.save()
    return {"message": "Template deactivated"}
