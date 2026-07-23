"""HTTP endpoints for the Google Workspace module."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.integrations.google_workspace.models import GoogleWorkspaceMail
from app.integrations.google_workspace.services import GoogleWorkspaceService
from app.models.user import User


router = APIRouter()


class WorkspaceMailPayload(BaseModel):
    to: list[dict[str, Any]] = Field(default_factory=list)
    cc: list[dict[str, Any]] = Field(default_factory=list)
    bcc: list[dict[str, Any]] = Field(default_factory=list)
    subject: str
    html: Optional[str] = None
    text: Optional[str] = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    thread_id: Optional[str] = None
    draft: bool = False
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None


class WorkspaceCalendarPayload(BaseModel):
    title: str
    description: Optional[str] = None
    start_at: datetime
    end_at: datetime
    timezone: Optional[str] = None
    location: Optional[str] = None
    color_id: Optional[str] = None
    attendees: list[dict[str, Any]] = Field(default_factory=list)
    recurrence_rule: Optional[str] = None
    is_recurring: bool = False
    status: str = "confirmed"
    task_id: Optional[str] = None
    project_id: Optional[str] = None
    meeting_id: Optional[str] = None
    meet_link: Optional[str] = None


class WorkspaceConnectionPayload(BaseModel):
    account_name: Optional[str] = None
    account_email: Optional[str] = None
    account_avatar: Optional[str] = None
    granted_scopes: list[str] = Field(default_factory=list)
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    token_expires_at: Optional[datetime] = None


@router.get("/dashboard")
async def dashboard(current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.get_dashboard(current_user)}


@router.get("/connection")
async def connection(current_user: User = Depends(get_current_user)):
    item = await GoogleWorkspaceService.get_connection(current_user)
    return {
        "success": True,
        "data": {
            "connected": bool(item.connected) if item else False,
            "account_name": item.account_name if item else None,
            "account_email": item.account_email if item else current_user.email,
            "account_avatar": item.account_avatar if item else current_user.avatar,
            "granted_scopes": item.granted_scopes if item else [],
            "last_connection_status": item.last_connection_status if item else "disconnected",
            "last_sync_at": item.last_sync_at.isoformat() if item and item.last_sync_at else None,
            "last_refresh_at": item.last_refresh_at.isoformat() if item and item.last_refresh_at else None,
            "last_error_message": item.last_error_message if item else None,
        },
    }


@router.get("/gmail")
async def gmail(
    folder: str = Query("inbox"),
    query: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    return {"success": True, "data": await GoogleWorkspaceService.list_gmail(current_user, folder=folder, query=query, page=page, page_size=page_size)}


@router.post("/gmail/send")
async def gmail_send(payload: WorkspaceMailPayload, current_user: User = Depends(get_current_user)):
    if payload.draft:
        return {"success": True, "data": await GoogleWorkspaceService.save_draft(current_user, payload.model_dump())}
    return {"success": True, "data": await GoogleWorkspaceService.send_mail(current_user, payload.model_dump())}


@router.post("/gmail/drafts")
async def gmail_draft(payload: WorkspaceMailPayload, current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.save_draft(current_user, payload.model_dump())}


@router.post("/gmail/{mail_id}/star")
async def gmail_star(mail_id: str, payload: dict[str, Any], current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.toggle_star(current_user, mail_id, bool(payload.get("starred", True)))}


@router.get("/calendar")
async def calendar(view: str = Query("month"), current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.list_calendar(current_user, view=view)}


@router.post("/calendar/events")
async def create_calendar_event(payload: WorkspaceCalendarPayload, current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.create_calendar_event(current_user, payload.model_dump())}


@router.patch("/calendar/events/{event_id}")
async def update_calendar_event(event_id: str, payload: WorkspaceCalendarPayload, current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.update_calendar_event(current_user, event_id, payload.model_dump())}


@router.delete("/calendar/events/{event_id}")
async def delete_calendar_event(event_id: str, current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.delete_calendar_event(current_user, event_id)}


@router.post("/calendar/events/{event_id}/task")
async def create_task_from_event(event_id: str, current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.create_task_from_event(current_user, event_id)}


@router.post("/tasks/{task_id}/calendar-event")
async def create_event_from_task(task_id: str, current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.create_event_from_task(current_user, task_id)}


@router.post("/meet")
async def create_meet(payload: dict[str, Any], current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.create_meet_session(current_user, payload)}


@router.get("/settings")
async def settings_view(current_user: User = Depends(get_current_user)):
    connection = await GoogleWorkspaceService.get_connection(current_user)
    diagnostics = await GoogleWorkspaceService.diagnostics(current_user)
    return {
        "success": True,
        "data": {
            "connection": {
                "connected": bool(connection.connected) if connection else False,
                "account_name": connection.account_name if connection else current_user.full_name(),
                "account_email": connection.account_email if connection else current_user.email,
                "account_avatar": connection.account_avatar if connection else current_user.avatar,
                "granted_scopes": connection.granted_scopes if connection else [],
                "last_connection_status": connection.last_connection_status if connection else "disconnected",
                "last_sync_at": connection.last_sync_at.isoformat() if connection and connection.last_sync_at else None,
                "last_refresh_at": connection.last_refresh_at.isoformat() if connection and connection.last_refresh_at else None,
                "last_error_message": connection.last_error_message if connection else None,
                "last_error_at": connection.last_error_at.isoformat() if connection and connection.last_error_at else None,
            },
            "diagnostics": diagnostics,
        },
    }


@router.post("/settings/reconnect")
async def reconnect_connection(payload: WorkspaceConnectionPayload, current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.upsert_connection(current_user, payload.model_dump())}


@router.post("/settings/disconnect")
async def disconnect_connection(current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.disconnect(current_user)}


@router.post("/settings/refresh-tokens")
async def refresh_tokens(current_user: User = Depends(get_current_user)):
    try:
        return {"success": True, "data": await GoogleWorkspaceService.refresh_tokens(current_user)}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("/settings/diagnostics")
async def diagnostics(current_user: User = Depends(get_current_user)):
    return {"success": True, "data": await GoogleWorkspaceService.diagnostics(current_user)}
