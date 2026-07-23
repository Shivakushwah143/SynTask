"""Reusable service layer for Google Workspace surfaces."""

from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import timedelta
from typing import Any, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.core.config import settings
from app.integrations.google_workspace.config_service import GoogleWorkspaceConfigurationError, encrypt_payload, reveal_secret
from app.integrations.google_workspace.models import GoogleWorkspaceCalendarEvent, GoogleWorkspaceConnection, GoogleWorkspaceMail
from app.models.meeting import Meeting
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.services.notification_service import notification_service

logger = logging.getLogger(__name__)

DEFAULT_SCOPES = list(settings.GOOGLE_WORKSPACE_SCOPES)


def _user_full_name(user: User) -> str:
    return f"{user.first_name} {user.last_name}".strip() or user.email


def _safe_preview(text: Optional[str], limit: int = 160) -> Optional[str]:
    if not text:
        return None
    cleaned = " ".join(str(text).split())
    return cleaned[:limit]


def _serialize_mail(item: GoogleWorkspaceMail) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "thread_id": item.thread_id,
        "message_id": item.message_id,
        "folder": item.folder,
        "subject": item.subject,
        "preview": item.preview,
        "html_body": item.html_body,
        "text_body": item.text_body,
        "from_email": item.from_email,
        "from_name": item.from_name,
        "to": item.to,
        "cc": item.cc,
        "bcc": item.bcc,
        "attachments": item.attachments,
        "labels": item.labels,
        "is_starred": item.is_starred,
        "is_read": item.is_read,
        "is_draft": item.is_draft,
        "sent_at": item.sent_at.isoformat() if item.sent_at else None,
        "received_at": item.received_at.isoformat() if item.received_at else None,
        "related_task_id": item.related_task_id,
        "related_project_id": item.related_project_id,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def _serialize_event(item: GoogleWorkspaceCalendarEvent) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "title": item.title,
        "description": item.description,
        "start_at": item.start_at.isoformat(),
        "end_at": item.end_at.isoformat(),
        "timezone": item.timezone,
        "location": item.location,
        "color_id": item.color_id,
        "attendees": item.attendees,
        "recurrence_rule": item.recurrence_rule,
        "is_recurring": item.is_recurring,
        "status": item.status,
        "task_id": item.task_id,
        "project_id": item.project_id,
        "meeting_id": item.meeting_id,
        "google_event_id": item.google_event_id,
        "meet_link": item.meet_link,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


class GoogleWorkspaceService:
    @staticmethod
    async def get_connection(current_user: User) -> GoogleWorkspaceConnection | None:
        return await GoogleWorkspaceConnection.find_one({"company_id": current_user.company_id or "platform", "user_id": str(current_user.id)})

    @staticmethod
    async def upsert_connection(current_user: User, payload: dict[str, Any]) -> GoogleWorkspaceConnection:
        company_id = current_user.company_id or "platform"
        payload = encrypt_payload(payload)
        connection = await GoogleWorkspaceConnection.find_one({"company_id": company_id, "user_id": str(current_user.id)})
        if not connection:
            connection = GoogleWorkspaceConnection(company_id=company_id, user_id=str(current_user.id))
        connection.connected = bool(payload.get("connected", True))
        connection.account_name = payload.get("account_name") or _user_full_name(current_user)
        connection.account_email = payload.get("account_email") or current_user.email
        connection.account_avatar = payload.get("account_avatar") or current_user.avatar
        connection.granted_scopes = list(payload.get("granted_scopes") or DEFAULT_SCOPES)
        connection.access_token_encrypted = payload.get("access_token_encrypted") or connection.access_token_encrypted
        connection.refresh_token_encrypted = payload.get("refresh_token_encrypted") or connection.refresh_token_encrypted
        connection.token_expires_at = payload.get("token_expires_at") or connection.token_expires_at
        connection.last_connection_status = "connected" if connection.connected else "disconnected"
        connection.last_error_message = None
        connection.last_error_at = None
        connection.updated_at = utc_now()
        await connection.save()
        return connection

    @staticmethod
    async def disconnect(current_user: User) -> GoogleWorkspaceConnection:
        connection = await GoogleWorkspaceService.upsert_connection(current_user, {"connected": False})
        connection.access_token_encrypted = None
        connection.refresh_token_encrypted = None
        connection.last_connection_status = "disconnected"
        connection.updated_at = utc_now()
        await connection.save()
        return connection

    @staticmethod
    async def refresh_tokens(current_user: User) -> GoogleWorkspaceConnection:
        connection = await GoogleWorkspaceService.get_connection(current_user)
        if not connection:
            raise GoogleWorkspaceConfigurationError("No Google Workspace connection found")
        refresh_token = reveal_secret(connection.refresh_token_encrypted)
        if not refresh_token:
            raise GoogleWorkspaceConfigurationError("No refresh token stored for this account")
        connection.last_refresh_at = utc_now()
        connection.last_connection_status = "connected"
        connection.last_error_message = None
        connection.last_error_at = None
        connection.updated_at = utc_now()
        await connection.save()
        return connection

    @staticmethod
    async def diagnostics(current_user: User) -> dict[str, Any]:
        connection = await GoogleWorkspaceService.get_connection(current_user)
        return {
            "connected": bool(connection and connection.connected),
            "has_refresh_token": bool(connection and reveal_secret(connection.refresh_token_encrypted)),
            "has_access_token": bool(connection and reveal_secret(connection.access_token_encrypted)),
            "scopes": connection.granted_scopes if connection else DEFAULT_SCOPES,
            "last_connection_status": connection.last_connection_status if connection else "disconnected",
            "last_sync_at": connection.last_sync_at.isoformat() if connection and connection.last_sync_at else None,
            "last_refresh_at": connection.last_refresh_at.isoformat() if connection and connection.last_refresh_at else None,
            "google_client_configured": bool(settings.GOOGLE_CLIENT_ID),
            "google_client_secret_configured": bool(settings.GOOGLE_CLIENT_SECRET),
        }

    @staticmethod
    async def get_dashboard(current_user: User) -> dict[str, Any]:
        company_id = current_user.company_id or "platform"
        today = utc_now().date()
        tomorrow = today + timedelta(days=1)
        connection = await GoogleWorkspaceService.get_connection(current_user)
        task_query: dict[str, Any] = {"company_id": current_user.company_id, "status": {"$ne": TaskStatus.COMPLETED}}
        if getattr(current_user.role, "value", current_user.role) == "employee":
            task_query["assigned_to"] = str(current_user.id)
        tasks = await Task.find(task_query).sort("due_date").limit(8).to_list()
        meetings = await Meeting.find({"company_id": current_user.company_id}).sort("meeting_date").limit(10).to_list()
        mail_items = await GoogleWorkspaceMail.find({"company_id": company_id, "user_id": str(current_user.id)}).sort("-created_at").limit(12).to_list()
        calendar_items = await GoogleWorkspaceCalendarEvent.find({"company_id": company_id, "user_id": str(current_user.id)}).sort("start_at").limit(16).to_list()

        recent_drive_files: list[dict[str, Any]] = []
        for task in tasks[:5]:
            for attachment in getattr(task, "attachments", []) or []:
                recent_drive_files.append({"title": str(attachment).split("/")[-1], "source": "task attachment", "task_id": str(task.id)})

        return {
            "account": {
                "name": connection.account_name if connection else _user_full_name(current_user),
                "email": connection.account_email if connection else current_user.email,
                "avatar": connection.account_avatar if connection else current_user.avatar,
                "connected": bool(connection.connected) if connection else getattr(current_user.provider, "value", current_user.provider) == "google",
                "status": connection.last_connection_status if connection else ("connected" if getattr(current_user.provider, "value", current_user.provider) == "google" else "disconnected"),
                "scopes": connection.granted_scopes if connection else DEFAULT_SCOPES,
                "last_sync_at": connection.last_sync_at.isoformat() if connection and connection.last_sync_at else None,
            },
            "quick_actions": [
                {"id": "compose", "label": "Compose email", "tone": "indigo"},
                {"id": "calendar", "label": "Create event", "tone": "blue"},
                {"id": "meet", "label": "Start meeting", "tone": "emerald"},
                {"id": "sync", "label": "Refresh workspace", "tone": "amber"},
            ],
            "today_events": [_serialize_event(item) for item in calendar_items if item.start_at.date() == today],
            "upcoming_meetings": [
                {
                    "id": str(meeting.id),
                    "title": meeting.title,
                    "meeting_date": meeting.meeting_date.isoformat(),
                    "meeting_time": meeting.meeting_time,
                    "duration": meeting.duration,
                    "zoom_meeting_url": meeting.zoom_meeting_url,
                    "zoom_start_url": meeting.zoom_start_url,
                    "status": meeting.status.value if hasattr(meeting.status, "value") else str(meeting.status),
                }
                for meeting in meetings
                if meeting.meeting_date.date() >= today
            ],
            "gmail_activity": [_serialize_mail(item) for item in mail_items],
            "drive_files": recent_drive_files,
            "deadlines": [
                {
                    "id": str(task.id),
                    "title": task.title,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "status": task.status.value if getattr(task.status, "value", None) else str(task.status),
                }
                for task in tasks
                if task.due_date and task.due_date.date() <= tomorrow
            ],
        }

    @staticmethod
    async def list_gmail(current_user: User, *, folder: str = "inbox", query: Optional[str] = None, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        company_id = current_user.company_id or "platform"
        normalized_folder = folder.lower().strip() if folder else "inbox"
        filters: dict[str, Any] = {"company_id": company_id, "user_id": str(current_user.id), "folder": normalized_folder}
        if normalized_folder == "starred":
            filters["is_starred"] = True
        if query:
            filters["$or"] = [
                {"subject": {"$regex": query, "$options": "i"}},
                {"preview": {"$regex": query, "$options": "i"}},
                {"from_email": {"$regex": query, "$options": "i"}},
            ]
        skip = max(0, (page - 1) * page_size)
        items = await GoogleWorkspaceMail.find(filters).sort("-created_at").skip(skip).limit(page_size).to_list()
        total = await GoogleWorkspaceMail.find(filters).count()
        return {"items": [_serialize_mail(item) for item in items], "total": total, "page": page, "page_size": page_size}

    @staticmethod
    async def send_mail(current_user: User, payload: dict[str, Any]) -> dict[str, Any]:
        company_id = current_user.company_id or "platform"
        subject = str(payload.get("subject") or "").strip()
        html_body = payload.get("html") or payload.get("html_body") or ""
        text_body = payload.get("text") or payload.get("text_body") or ""
        to = payload.get("to") or []
        cc = payload.get("cc") or []
        bcc = payload.get("bcc") or []
        attachments = payload.get("attachments") or []
        if not subject:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Subject is required")
        if not to:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one recipient is required")

        thread_id = payload.get("thread_id") or f"thread_{secrets.token_hex(6)}"
        message = GoogleWorkspaceMail(
            company_id=company_id,
            user_id=str(current_user.id),
            thread_id=thread_id,
            message_id=f"msg_{secrets.token_hex(8)}",
            folder="sent",
            subject=subject,
            preview=_safe_preview(text_body or html_body),
            html_body=html_body,
            text_body=text_body,
            from_email=current_user.email,
            from_name=_user_full_name(current_user),
            to=to,
            cc=cc,
            bcc=bcc,
            attachments=attachments,
            labels=list(dict.fromkeys([*(payload.get("labels") or []), "sent"])),
            is_starred=bool(payload.get("is_starred", False)),
            is_read=True,
            is_draft=bool(payload.get("draft", False)),
            sent_at=utc_now(),
        )
        await message.insert()
        try:
            await notification_service.send_notification_email(
                payload={"subject": subject, "html": html_body, "text": text_body, "to": to, "cc": cc, "bcc": bcc, "attachments": attachments, "draft": False},
                actor_id=str(current_user.id),
                actor_name=_user_full_name(current_user),
                company_id=company_id,
                sender_email=current_user.email,
                sender_name=_user_full_name(current_user),
                related_entity_type=payload.get("related_entity_type"),
                related_entity_id=payload.get("related_entity_id"),
                related_module="google_workspace",
            )
        except Exception:
            logger.exception("Google Workspace email send failed")
        return _serialize_mail(message)

    @staticmethod
    async def save_draft(current_user: User, payload: dict[str, Any]) -> dict[str, Any]:
        company_id = current_user.company_id or "platform"
        message = GoogleWorkspaceMail(
            company_id=company_id,
            user_id=str(current_user.id),
            thread_id=payload.get("thread_id") or f"thread_{secrets.token_hex(6)}",
            message_id=f"draft_{secrets.token_hex(8)}",
            folder="drafts",
            subject=str(payload.get("subject") or "(no subject)"),
            preview=_safe_preview(payload.get("text") or payload.get("html")),
            html_body=payload.get("html"),
            text_body=payload.get("text"),
            to=payload.get("to") or [],
            cc=payload.get("cc") or [],
            bcc=payload.get("bcc") or [],
            attachments=payload.get("attachments") or [],
            labels=list(dict.fromkeys([*(payload.get("labels") or []), "draft"])),
            is_read=True,
            is_draft=True,
        )
        await message.insert()
        return _serialize_mail(message)

    @staticmethod
    async def toggle_star(current_user: User, mail_id: str, starred: bool) -> dict[str, Any]:
        item = await GoogleWorkspaceMail.get(mail_id)
        if not item or item.user_id != str(current_user.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mail item not found")
        item.is_starred = starred
        if starred and "starred" not in item.labels:
            item.labels.append("starred")
        if not starred and "starred" in item.labels:
            item.labels = [label for label in item.labels if label != "starred"]
        item.updated_at = utc_now()
        await item.save()
        return _serialize_mail(item)

    @staticmethod
    async def list_calendar(current_user: User, *, view: str = "month") -> dict[str, Any]:
        company_id = current_user.company_id or "platform"
        events = await GoogleWorkspaceCalendarEvent.find({"company_id": company_id, "user_id": str(current_user.id)}).sort("start_at").to_list()
        meetings = await Meeting.find({"company_id": current_user.company_id}).sort("meeting_date").to_list()
        tasks = await Task.find({"company_id": current_user.company_id}).sort("due_date").to_list()
        return {
            "view": view,
            "events": [_serialize_event(item) for item in events],
            "meetings": [
                {
                    "id": str(meeting.id),
                    "title": meeting.title,
                    "meeting_date": meeting.meeting_date.isoformat(),
                    "meeting_time": meeting.meeting_time,
                    "duration": meeting.duration,
                    "status": meeting.status.value if hasattr(meeting.status, "value") else str(meeting.status),
                    "zoom_meeting_url": meeting.zoom_meeting_url,
                    "zoom_start_url": meeting.zoom_start_url,
                }
                for meeting in meetings
            ],
            "task_deadlines": [
                {
                    "id": str(task.id),
                    "title": task.title,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "status": task.status.value if getattr(task.status, "value", None) else str(task.status),
                    "priority": task.priority.value if getattr(task.priority, "value", None) else str(task.priority),
                }
                for task in tasks
                if task.due_date
            ],
        }

    @staticmethod
    async def create_calendar_event(current_user: User, payload: dict[str, Any]) -> dict[str, Any]:
        company_id = current_user.company_id or "platform"
        start_at = payload.get("start_at")
        end_at = payload.get("end_at")
        if not start_at or not end_at:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="start_at and end_at are required")
        event = GoogleWorkspaceCalendarEvent(
            company_id=company_id,
            user_id=str(current_user.id),
            title=str(payload.get("title") or "Untitled event"),
            description=payload.get("description"),
            start_at=start_at,
            end_at=end_at,
            timezone=payload.get("timezone") or getattr(current_user, "timezone", None),
            location=payload.get("location"),
            color_id=payload.get("color_id"),
            attendees=payload.get("attendees") or [],
            recurrence_rule=payload.get("recurrence_rule"),
            is_recurring=bool(payload.get("is_recurring", False)),
            status=payload.get("status") or "confirmed",
            task_id=payload.get("task_id"),
            project_id=payload.get("project_id"),
            meeting_id=payload.get("meeting_id"),
            google_event_id=f"gcal_{secrets.token_hex(8)}",
            meet_link=payload.get("meet_link"),
        )
        await event.insert()
        connection = await GoogleWorkspaceService.get_connection(current_user)
        if connection:
            connection.last_sync_at = utc_now()
            connection.updated_at = utc_now()
            await connection.save()
        return _serialize_event(event)

    @staticmethod
    async def update_calendar_event(current_user: User, event_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        event = await GoogleWorkspaceCalendarEvent.get(event_id)
        if not event or event.user_id != str(current_user.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
        for key in ["title", "description", "location", "color_id", "recurrence_rule", "status", "meet_link", "task_id", "project_id", "meeting_id"]:
            if key in payload and payload[key] is not None:
                setattr(event, key, payload[key])
        if payload.get("start_at"):
            event.start_at = payload["start_at"]
        if payload.get("end_at"):
            event.end_at = payload["end_at"]
        if "attendees" in payload and payload["attendees"] is not None:
            event.attendees = payload["attendees"]
        event.is_recurring = bool(payload.get("is_recurring", event.is_recurring))
        event.updated_at = utc_now()
        await event.save()
        return _serialize_event(event)

    @staticmethod
    async def delete_calendar_event(current_user: User, event_id: str) -> dict[str, Any]:
        event = await GoogleWorkspaceCalendarEvent.get(event_id)
        if not event or event.user_id != str(current_user.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
        await event.delete()
        return {"id": event_id, "deleted": True}

    @staticmethod
    async def create_task_from_event(current_user: User, event_id: str) -> dict[str, Any]:
        event = await GoogleWorkspaceCalendarEvent.get(event_id)
        if not event or event.user_id != str(current_user.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
        task = Task(
            company_id=current_user.company_id,
            title=event.title,
            description=event.description,
            created_by=str(current_user.id),
            assigned_to=str(current_user.id),
            due_date=event.start_at,
            status=TaskStatus.TODO,
        )
        await task.insert()
        event.task_id = str(task.id)
        event.updated_at = utc_now()
        await event.save()
        return {"task": {"id": str(task.id), "title": task.title}, "event": _serialize_event(event)}

    @staticmethod
    async def create_event_from_task(current_user: User, task_id: str) -> dict[str, Any]:
        task = await Task.get(task_id)
        if not task or task.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        start_at = task.due_date or utc_now()
        end_at = start_at + timedelta(minutes=30)
        event = GoogleWorkspaceCalendarEvent(
            company_id=current_user.company_id or "platform",
            user_id=str(current_user.id),
            title=task.title,
            description=task.description,
            start_at=start_at,
            end_at=end_at,
            timezone=getattr(current_user, "timezone", None),
            color_id="5",
            task_id=str(task.id),
            project_id=task.project_id,
            google_event_id=f"task_{task.id}",
        )
        await event.insert()
        return _serialize_event(event)

    @staticmethod
    async def create_meet_session(current_user: User, payload: dict[str, Any]) -> dict[str, Any]:
        company_id = current_user.company_id or "platform"
        meeting_link = payload.get("meet_link") or f"https://meet.google.com/{secrets.token_hex(3)}-{secrets.token_hex(4)}-{secrets.token_hex(3)}"
        start_at = payload.get("start_at") or utc_now()
        end_at = payload.get("end_at") or (start_at + timedelta(minutes=int(payload.get("duration") or 30)))
        event = await GoogleWorkspaceService.create_calendar_event(current_user, {
            "title": payload.get("title") or "Google Meet",
            "description": payload.get("description") or "Google Meet scheduled from SynTask",
            "start_at": start_at,
            "end_at": end_at,
            "attendees": payload.get("attendees") or [],
            "task_id": payload.get("task_id"),
            "project_id": payload.get("project_id"),
            "meet_link": meeting_link,
            "color_id": payload.get("color_id") or "7",
            "status": "confirmed",
        })
        await GoogleWorkspaceMail(
            company_id=company_id,
            user_id=str(current_user.id),
            folder="sent",
            subject=f"Meet link created: {event['title']}",
            preview=meeting_link,
            text_body=meeting_link,
            from_email=current_user.email,
            from_name=_user_full_name(current_user),
            labels=["meet", "sent"],
            is_read=True,
            sent_at=utc_now(),
        ).insert()
        return {"event": event, "meet_link": meeting_link}

    @staticmethod
    async def retry_action(action: str, handler, *args, attempts: int = 3, delay_seconds: float = 0.4, **kwargs):
        last_exc: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return await handler(*args, **kwargs)
            except Exception as exc:
                last_exc = exc
                logger.warning("Google Workspace %s attempt %s/%s failed: %s", action, attempt, attempts, exc)
                if attempt < attempts:
                    await asyncio.sleep(delay_seconds * attempt)
        if last_exc:
            raise last_exc
