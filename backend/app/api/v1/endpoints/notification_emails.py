from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.api.dependencies import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.services.notification_service import notification_service
from app.api.deps import Pagination20, PaginationParams

router = APIRouter()


class EmailRecipient(BaseModel):
    email: EmailStr
    name: Optional[str] = None


class EmailNotificationRequest(BaseModel):
    to: list[EmailRecipient] = Field(default_factory=list)
    cc: list[EmailRecipient] = Field(default_factory=list)
    bcc: list[EmailRecipient] = Field(default_factory=list)
    subject: str
    html: str
    text: str = ""
    template_id: Optional[str] = None
    template_name: Optional[str] = None
    template_variables: dict[str, Any] = Field(default_factory=dict)
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None
    related_module: Optional[str] = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    draft: bool = False


class EmailTemplateResponse(BaseModel):
    id: str
    name: str
    category: str
    subject: str
    body_html: str
    variables: list[str]


def _recipient_payload(items: list[EmailRecipient]) -> list[dict[str, str]]:
    return [{"email": item.email, "name": item.name or ""} for item in items]


def _notification_to_dict(notification: Notification) -> dict[str, Any]:
    return {
        "id": str(notification.id),
        "user_id": notification.user_id,
        "company_id": notification.company_id,
        "type": notification.type.value if hasattr(notification.type, "value") else notification.type,
        "title": notification.title,
        "message": notification.message,
        "related_id": notification.related_id,
        "related_type": notification.related_type,
        "action_url": notification.action_url,
        "metadata": notification.metadata or {},
        "is_read": notification.is_read,
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
        "email_sent": notification.email_sent,
        "email_sent_at": notification.email_sent_at.isoformat() if notification.email_sent_at else None,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


@router.post("/email/preview")
async def preview_email(
    payload: EmailNotificationRequest,
    current_user: User = Depends(get_current_user),
):
    if not current_user.company_id and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")
    preview = await notification_service.preview_email(
        payload={
            **payload.model_dump(),
            "to": _recipient_payload(payload.to),
            "cc": _recipient_payload(payload.cc),
            "bcc": _recipient_payload(payload.bcc),
        },
        actor_id=str(current_user.id),
        company_id=current_user.company_id or "platform",
    )
    return {"success": True, "data": preview}


@router.post("/email/send")
async def send_email(
    payload: EmailNotificationRequest,
    current_user: User = Depends(get_current_user),
):
    if not current_user.company_id and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")
    if not payload.to:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one recipient is required")
    if payload.draft:
        return {"success": True, "data": {"draft": True}}
    try:
        result = await notification_service.send_notification_email(
            payload={
                **payload.model_dump(),
                "to": _recipient_payload(payload.to),
                "cc": _recipient_payload(payload.cc),
                "bcc": _recipient_payload(payload.bcc),
            },
            actor_id=str(current_user.id),
            actor_name=current_user.full_name(),
            company_id=current_user.company_id or "platform",
            sender_email=current_user.email,
            sender_name=current_user.full_name(),
            related_entity_type=payload.related_entity_type,
            related_entity_id=payload.related_entity_id,
            related_module=payload.related_module or "notifications",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return {"success": True, "data": result}


@router.get("/templates")
async def list_templates(current_user: User = Depends(get_current_user)):
    if not current_user.company_id and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")
    templates = [
        {
            "id": "lead_assignment",
            "name": "Lead Assignment",
            "category": "Sales",
            "subject": "New lead assigned: {{lead_name}}",
            "body_html": "<p>Hello {{owner}},</p><p>A new lead {{lead_name}} has been assigned.</p>",
            "variables": ["lead_name", "owner", "company", "pipeline"],
        },
        {
            "id": "follow_up",
            "name": "Follow-up",
            "category": "Sales",
            "subject": "Following up on {{lead_name}}",
            "body_html": "<p>Hi {{lead_name}},</p><p>Checking in on our last conversation.</p>",
            "variables": ["lead_name", "company", "owner"],
        },
        {
            "id": "proposal",
            "name": "Proposal",
            "category": "Sales",
            "subject": "Proposal for {{company}}",
            "body_html": "<p>Please review the proposal here: {{proposal_link}}</p>",
            "variables": ["company", "proposal_link", "owner"],
        },
        {
            "id": "meeting_invitation",
            "name": "Meeting Invitation",
            "category": "Sales",
            "subject": "Meeting invitation for {{lead_name}}",
            "body_html": "<p>You're invited to a meeting with {{owner}}.</p>",
            "variables": ["lead_name", "owner", "meeting_link"],
        },
        {
            "id": "closed_won",
            "name": "Closed Won",
            "category": "Sales",
            "subject": "Welcome aboard, {{company}}",
            "body_html": "<p>We are excited to get started.</p>",
            "variables": ["company", "owner"],
        },
        {
            "id": "welcome",
            "name": "Welcome",
            "category": "General",
            "subject": "Welcome to SynTask",
            "body_html": "<p>Thanks for joining us.</p>",
            "variables": ["company", "owner"],
        },
    ]
    return {"success": True, "data": templates}


@router.get("/history")
async def history(
    pagination: PaginationParams = Pagination20,
    current_user: User = Depends(get_current_user),
):
    skip, limit = pagination.skip, pagination.limit
    query = {"company_id": current_user.company_id, "type": "mention"}
    if current_user.role.value == "super_admin":
        query = {}
    items = await Notification.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
    total = await Notification.find(query).count()
    return {
        "success": True,
        "data": {
            "items": [_notification_to_dict(item) for item in items],
            "total": total,
            "skip": skip,
            "limit": limit,
        },
    }


@router.post("/test")
async def test_email(current_user: User = Depends(get_current_user)):
    if not current_user.company_id and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")
    result = await notification_service.preview_email(
        payload={
            "subject": "SynTask notification test",
            "html": "<p>This is a notification system test.</p>",
            "text": "This is a notification system test.",
            "template_variables": {},
        },
        actor_id=str(current_user.id),
        company_id=current_user.company_id or "platform",
    )
    return {"success": True, "data": result, "tested_at": datetime.utcnow().isoformat()}
