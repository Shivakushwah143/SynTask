"""MongoDB documents for the Google Workspace module."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class GoogleWorkspaceConnection(Document):
    company_id: Indexed(str)
    user_id: Indexed(str)
    connected: bool = False
    account_name: Optional[str] = None
    account_email: Optional[str] = None
    account_avatar: Optional[str] = None
    granted_scopes: list[str] = Field(default_factory=list)
    access_token_encrypted: Optional[str] = None
    refresh_token_encrypted: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    last_connection_status: str = "disconnected"
    last_sync_at: Optional[datetime] = None
    last_refresh_at: Optional[datetime] = None
    last_error_message: Optional[str] = None
    last_error_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "google_workspace_connections"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("connected", ASCENDING)]),
        ]


class GoogleWorkspaceMail(Document):
    company_id: Indexed(str)
    user_id: Indexed(str)
    thread_id: Optional[str] = None
    message_id: Optional[str] = None
    folder: str = "inbox"
    subject: str
    preview: Optional[str] = None
    html_body: Optional[str] = None
    text_body: Optional[str] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    to: list[dict[str, Any]] = Field(default_factory=list)
    cc: list[dict[str, Any]] = Field(default_factory=list)
    bcc: list[dict[str, Any]] = Field(default_factory=list)
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    is_starred: bool = False
    is_read: bool = False
    is_draft: bool = False
    sent_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    related_task_id: Optional[str] = None
    related_project_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "google_workspace_mail"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING), ("folder", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING), ("thread_id", ASCENDING)]),
        ]


class GoogleWorkspaceCalendarEvent(Document):
    company_id: Indexed(str)
    user_id: Indexed(str)
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
    google_event_id: Optional[str] = None
    meet_link: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "google_workspace_calendar_events"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("user_id", ASCENDING), ("start_at", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("task_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("meeting_id", ASCENDING)]),
        ]