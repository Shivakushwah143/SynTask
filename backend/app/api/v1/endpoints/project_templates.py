"""
Project Template API — CRUD and project generation from templates.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, status as http_status
from app.api.dependencies import get_current_user
from app.models.user import User
from app.services import project_template_service

router = APIRouter(tags=["Project Templates"])


@router.get("/")
async def list_templates(
    enabled_only: bool = False,
    project_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """List project templates for the company."""
    templates = await project_template_service.list_templates(
        company_id=current_user.company_id,
        enabled_only=enabled_only,
        project_type=project_type,
    )
    return {
        "templates": [
            {
                "id": str(t.id),
                "name": t.name,
                "description": t.description,
                "project_type": t.project_type,
                "default_priority": t.default_priority,
                "estimated_duration_days": t.estimated_duration_days,
                "estimated_hours": t.estimated_hours,
                "task_count": t.task_count,
                "version": t.version,
                "enabled": t.enabled,
                "created_by": t.created_by,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in templates
        ]
    }


@router.get("/{template_id}")
async def get_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get template details including task blueprints."""
    template = await project_template_service.get_template(template_id, current_user.company_id)
    template_tasks = await project_template_service.get_template_tasks(template_id)

    return {
        "id": str(template.id),
        "name": template.name,
        "description": template.description,
        "project_type": template.project_type,
        "default_priority": template.default_priority,
        "estimated_duration_days": template.estimated_duration_days,
        "estimated_hours": template.estimated_hours,
        "task_count": template.task_count,
        "version": template.version,
        "enabled": template.enabled,
        "created_by": template.created_by,
        "created_at": template.created_at.isoformat() if template.created_at else None,
        "updated_at": template.updated_at.isoformat() if template.updated_at else None,
        "task_templates": [
            {
                "id": str(tt.id),
                "ref_id": tt.ref_id,
                "title": tt.title,
                "description": tt.description,
                "priority": tt.priority.value,
                "relative_start_day": tt.relative_start_day,
                "relative_due_day": tt.relative_due_day,
                "estimated_hours": tt.estimated_hours,
                "review_required": tt.review_required,
                "assignee_placeholder": tt.assignee_placeholder,
                "reviewer_placeholder": tt.reviewer_placeholder,
                "depends_on_refs": tt.depends_on_refs,
                "tags": tt.tags,
                "required_for_project_completion": tt.required_for_project_completion,
                "order": tt.order,
                "checklist": tt.checklist,
            }
            for tt in template_tasks
        ],
    }


@router.post("/")
async def create_template(
    name: str = Form(...),
    description: str = Form(""),
    project_type: str = Form(""),
    default_priority: str = Form("medium"),
    estimated_duration_days: int = Form(None),
    estimated_hours: float = Form(None),
    task_templates_json: str = Form("[]"),
    current_user: User = Depends(get_current_user),
):
    """Create a new project template."""
    import json
    try:
        task_templates = json.loads(task_templates_json)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Invalid task_templates_json format.",
        )

    template = await project_template_service.create_template(
        company_id=current_user.company_id,
        name=name,
        description=description or None,
        project_type=project_type or None,
        default_priority=default_priority,
        estimated_duration_days=estimated_duration_days,
        estimated_hours=estimated_hours,
        task_templates=task_templates,
        current_user=current_user,
    )

    return {
        "message": "Template created successfully",
        "template_id": str(template.id),
        "name": template.name,
        "task_count": template.task_count,
    }


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    name: str = Form(None),
    description: str = Form(None),
    project_type: str = Form(None),
    default_priority: str = Form(None),
    estimated_duration_days: int = Form(None),
    estimated_hours: float = Form(None),
    enabled: bool = Form(None),
    task_templates_json: str = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Update a template.  Does not affect existing generated projects."""
    import json

    template = await project_template_service.get_template(template_id, current_user.company_id)

    task_templates = None
    if task_templates_json:
        try:
            task_templates = json.loads(task_templates_json)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="Invalid task_templates_json format.",
            )

    updated = await project_template_service.update_template(
        template=template,
        name=name,
        description=description,
        project_type=project_type,
        default_priority=default_priority,
        estimated_duration_days=estimated_duration_days,
        estimated_hours=estimated_hours,
        enabled=enabled,
        task_templates=task_templates,
        current_user=current_user,
    )

    return {
        "message": "Template updated successfully",
        "template_id": str(updated.id),
        "version": updated.version,
        "task_count": updated.task_count,
    }


@router.post("/{template_id}/generate")
async def generate_project_from_template(
    template_id: str,
    name: str = Form(...),
    key: str = Form(...),
    project_id: str = Form(...),
    client_id: str = Form(""),
    lead_id: str = Form(...),
    start_date: str = Form(...),
    delivery_date: str = Form(""),
    priority: str = Form(""),
    assignee_map_json: str = Form("{}"),
    reviewer_map_json: str = Form("{}"),
    current_user: User = Depends(get_current_user),
):
    """Generate a real project from a template."""
    import json

    try:
        assignee_map = json.loads(assignee_map_json) if assignee_map_json else {}
    except json.JSONDecodeError:
        assignee_map = {}
    try:
        reviewer_map = json.loads(reviewer_map_json) if reviewer_map_json else {}
    except json.JSONDecodeError:
        reviewer_map = {}

    result = await project_template_service.generate_project_from_template(
        template_id=template_id,
        company_id=current_user.company_id,
        name=name,
        key=key,
        project_id=project_id,
        client_id=client_id or None,
        lead_id=lead_id,
        start_date=start_date,
        delivery_date=delivery_date or None,
        priority=priority or None,
        assignee_map=assignee_map,
        reviewer_map=reviewer_map,
        current_user=current_user,
    )

    return result
