from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.timeline.publisher import publish_crm_timeline_event
from app.knowledge.service import knowledge_service
from app.crm.models import Client
from app.marketing.models import ContentCalendarItem, ContentItemPriority, ContentItemStatus, ContentItemType
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.meeting import Meeting
from app.projects.models import Project
from app.tasks.models import Task
from app.models.user import User, UserRole
from app.services.reminder_service import calendar_due_tone


CONTENT_STATUS_FLOW = [
    ContentItemStatus.DRAFT,
    ContentItemStatus.PLANNED,
    ContentItemStatus.SHOOT_SCHEDULED,
    ContentItemStatus.SHOT,
    ContentItemStatus.EDITING,
    ContentItemStatus.INTERNAL_REVIEW,
    ContentItemStatus.CLIENT_REVIEW,
    ContentItemStatus.APPROVED,
    ContentItemStatus.SCHEDULED,
    ContentItemStatus.PUBLISHED,
]

CONTENT_EVENT_MAP = {
    ContentItemStatus.PLANNED: "ContentPlanned",
    ContentItemStatus.SHOOT_SCHEDULED: "ShootScheduled",
    ContentItemStatus.SHOT: "ShootCompleted",
    ContentItemStatus.EDITING: "EditingStarted",
    ContentItemStatus.INTERNAL_REVIEW: "ReadyForReview",
    ContentItemStatus.CLIENT_REVIEW: "ReadyForReview",
    ContentItemStatus.APPROVED: "Approved",
    ContentItemStatus.SCHEDULED: "Scheduled",
    ContentItemStatus.PUBLISHED: "Published",
}


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _parse_enum(enum_cls, value: Any, default):
    if value in (None, ""):
        return default
    try:
        return enum_cls(str(value))
    except Exception:
        return default


def _company_id(current_user: User) -> str:
    company_id = str(getattr(current_user, "company_id", "") or "").strip()
    if not company_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return company_id


def _can_access(current_user: User, project: Project) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if str(project.company_id) != str(current_user.company_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def _serialize_item(item: ContentCalendarItem) -> Dict[str, Any]:
    reminder_status = calendar_due_tone(item.due_date)
    return {
        "id": str(item.id),
        "company_id": item.company_id,
        "project_id": item.project_id,
        "client_id": item.client_id,
        "campaign": item.campaign,
        "platform": item.platform,
        "title": item.title,
        "content_type": item.content_type.value if getattr(item, "content_type", None) else ContentItemType.CUSTOM.value,
        "assignee_id": item.assignee_id,
        "assignee_name": item.assignee_name,
        "due_date": item.due_date,
        "publish_date": item.publish_date,
        "priority": item.priority.value if getattr(item, "priority", None) else ContentItemPriority.MEDIUM.value,
        "status": item.status.value if getattr(item, "status", None) else ContentItemStatus.DRAFT.value,
        "notes": item.notes,
        "tags": list(item.tags or []),
        "file_ids": list(item.file_ids or []),
        "file_urls": list(item.file_urls or []),
        "deliverable_target": item.deliverable_target,
        "completed": item.completed,
        "shoot_date": item.shoot_date,
        "location": item.location,
        "photographer": item.photographer,
        "team": list(item.team or []),
        "assets_required": list(item.assets_required or []),
        "category": getattr(item, "category", None),
        "description": getattr(item, "description", None),
        "start_date": getattr(item, "start_date", None),
        "end_date": getattr(item, "end_date", None),
        "time": getattr(item, "time", None),
        "assigned_person": getattr(item, "assigned_person", None),
        "reminder": getattr(item, "reminder", None),
        "color": reminder_status["color"],
        "reminder_status": reminder_status,
        "attachment": getattr(item, "attachment", None),
        "draft_at": item.draft_at,
        "planned_at": item.planned_at,
        "shoot_scheduled_at": item.shoot_scheduled_at,
        "shot_at": item.shot_at,
        "editing_started_at": item.editing_started_at,
        "internal_review_at": item.internal_review_at,
        "client_review_at": item.client_review_at,
        "approved_at": item.approved_at,
        "scheduled_at": item.scheduled_at,
        "published_at": item.published_at,
        "deadline_missed_at": item.deadline_missed_at,
        "metadata": item.metadata,
        "created_by": item.created_by,
        "updated_by": item.updated_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _apply_transition(item: ContentCalendarItem, next_status: ContentItemStatus, now: datetime) -> None:
    current_index = CONTENT_STATUS_FLOW.index(item.status) if item.status in CONTENT_STATUS_FLOW else 0
    next_index = CONTENT_STATUS_FLOW.index(next_status)
    if next_index < current_index:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid content status transition")
    if next_index == current_index:
        return
    item.status = next_status
    if next_status == ContentItemStatus.PLANNED:
        item.planned_at = item.planned_at or now
    elif next_status == ContentItemStatus.SHOOT_SCHEDULED:
        item.shoot_scheduled_at = item.shoot_scheduled_at or now
    elif next_status == ContentItemStatus.SHOT:
        item.shot_at = item.shot_at or now
    elif next_status == ContentItemStatus.EDITING:
        item.editing_started_at = item.editing_started_at or now
    elif next_status == ContentItemStatus.INTERNAL_REVIEW:
        item.internal_review_at = item.internal_review_at or now
    elif next_status == ContentItemStatus.CLIENT_REVIEW:
        item.client_review_at = item.client_review_at or now
    elif next_status == ContentItemStatus.APPROVED:
        item.approved_at = item.approved_at or now
    elif next_status == ContentItemStatus.SCHEDULED:
        item.scheduled_at = item.scheduled_at or now
    elif next_status == ContentItemStatus.PUBLISHED:
        item.published_at = item.published_at or now
        item.completed = True


def _event_name_for_status(status: ContentItemStatus) -> str:
    return CONTENT_EVENT_MAP.get(status, "ContentPlanned")


async def _load_project(current_user: User, project_id: str) -> Project:
    project = await Project.get(project_id)
    if not project or getattr(project, "deleted", False):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    _can_access(current_user, project)
    return project


async def _load_related_entities(project: Project) -> Dict[str, str | None]:
    client_name = None
    if getattr(project, "lead_id", None):
        client = await Client.find_one({"company_id": str(project.company_id), "assigned_to": str(project.assigned_to)}) if project.assigned_to else None
        if client:
            client_name = client.name
    return {"client_name": client_name}


class ContentCalendarService:
    @staticmethod
    async def aggregate(current_user: User, project_id: Optional[str] = None) -> Dict[str, Any]:
        company_id = _company_id(current_user)
        project_query: Dict[str, Any] = {"company_id": company_id, "deleted": {"$ne": True}}
        if project_id:
            project_query["_id"] = project_id
        projects = await Project.find(project_query).to_list()
        project_ids = [str(project.id) for project in projects]
        if not project_ids:
            return {
                "items": [],
                "groups": {},
                "deliverables": {"completed": 0, "remaining": 0, "delayed": 0, "upcoming": 0, "monthly_targets": []},
                "summary": {"items": 0, "shoot_days": 0, "published": 0, "draft": 0},
            }

        items = await ContentCalendarItem.find({"company_id": company_id, "project_id": {"$in": project_ids}}).sort("-publish_date").to_list()
        tasks = await Task.find({"company_id": company_id, "project_id": {"$in": project_ids}}).to_list()
        meetings = await Meeting.find({"company_id": company_id}).to_list()

        grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for item in items:
            grouped[item.project_id].append(_serialize_item(item))

        published = sum(1 for item in items if item.status == ContentItemStatus.PUBLISHED)
        delayed = sum(1 for item in items if item.due_date and item.due_date < datetime.now() and item.status != ContentItemStatus.PUBLISHED)
        shoot_days = sum(1 for item in items if item.content_type == ContentItemType.SHOOT_DAY)
        return {
            "items": [_serialize_item(item) for item in items],
            "groups": grouped,
            "deliverables": {
                "completed": published,
                "remaining": max(len(items) - published, 0),
                "delayed": delayed,
                "upcoming": sum(1 for item in items if item.publish_date and item.publish_date >= datetime.now() and item.status != ContentItemStatus.PUBLISHED),
                "monthly_targets": [],
            },
            "summary": {
                "items": len(items),
                "shoot_days": shoot_days,
                "published": published,
                "draft": sum(1 for item in items if item.status == ContentItemStatus.DRAFT),
                "tasks": len(tasks),
                "meetings": len(meetings),
            },
            "projects": [{"id": str(project.id), "name": project.name, "project_id": project.project_id} for project in projects],
        }

    @staticmethod
    async def list_items(current_user: User, project_id: Optional[str] = None) -> Dict[str, Any]:
        return await ContentCalendarService.aggregate(current_user, project_id)

    @staticmethod
    async def create_item(current_user: User, payload: Dict[str, Any]) -> Dict[str, Any]:
        project = await _load_project(current_user, str(payload.get("project_id") or ""))
        now = datetime.now()
        item = ContentCalendarItem(
            company_id=str(project.company_id),
            project_id=str(project.id),
            client_id=payload.get("client_id"),
            campaign=payload.get("campaign"),
            platform=payload.get("platform"),
            title=str(payload.get("title") or "Untitled content").strip(),
            content_type=_parse_enum(ContentItemType, payload.get("content_type"), ContentItemType.CUSTOM),
            assignee_id=payload.get("assignee_id"),
            assignee_name=payload.get("assignee_name"),
            due_date=_parse_datetime(payload.get("due_date")),
            publish_date=_parse_datetime(payload.get("publish_date")),
            priority=_parse_enum(ContentItemPriority, payload.get("priority"), ContentItemPriority.MEDIUM),
            notes=payload.get("notes"),
            tags=list(payload.get("tags") or []),
            file_ids=list(payload.get("file_ids") or []),
            file_urls=list(payload.get("file_urls") or []),
            deliverable_target=payload.get("deliverable_target"),
            shoot_date=_parse_datetime(payload.get("shoot_date")),
            location=payload.get("location"),
            photographer=payload.get("photographer"),
            team=list(payload.get("team") or []),
            assets_required=list(payload.get("assets_required") or []),
            category=payload.get("category"),
            description=payload.get("description"),
            start_date=_parse_datetime(payload.get("start_date")),
            end_date=_parse_datetime(payload.get("end_date")),
            time=payload.get("time"),
            assigned_person=payload.get("assigned_person"),
            reminder=payload.get("reminder"),
            color=payload.get("color"),
            attachment=payload.get("attachment"),
            metadata=dict(payload.get("metadata") or {}),
            created_by=str(getattr(current_user, "id", "")),
            updated_by=str(getattr(current_user, "id", "")),
            created_at=now,
            updated_at=now,
        )
        await item.insert()
        await publish_crm_timeline_event(
            event_name="ContentPlanned",
            aggregate_type="content_item",
            aggregate_id=str(item.id),
            company_id=str(project.company_id),
            actor_id=str(getattr(current_user, "id", "")),
            project_id=str(project.project_id or project.id),
            payload={"content_item_id": str(item.id), "project_id": str(project.id), "title": item.title, "status": item.status.value, "timestamp": now.isoformat()},
            metadata={"surface": "delivery", "workflow": "content_calendar"},
        )
        await knowledge_service.ingest_event(
            knowledge_service._event(
                event_name="ContentPlanned",
                aggregate_type="content_item",
                aggregate_id=str(item.id),
                company_id=str(project.company_id),
                actor_id=str(getattr(current_user, "id", "")),
                project_id=str(project.project_id or project.id),
                payload={
                    "title": item.title,
                    "summary": item.notes or item.title,
                    "status": item.status.value,
                    "priority": item.priority.value,
                    "due_date": item.due_date.isoformat() if item.due_date else None,
                    "publish_date": item.publish_date.isoformat() if item.publish_date else None,
                    "tags": list(item.tags or []),
                    "relationships": [
                        {"relationship_type": "project", "entity_type": "project", "entity_id": str(project.project_id or project.id)},
                    ],
                    "content": item.notes or item.title,
                    "version_marker": str(item.updated_at or item.created_at or datetime.now()),
                },
                metadata={"module": "content_calendar"},
            )
        )
        return {"item": _serialize_item(item)}

    @staticmethod
    async def update_item(current_user: User, item_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content item not found")
        project = await _load_project(current_user, str(item.project_id))
        now = datetime.now()
        if "title" in payload:
            item.title = str(payload.get("title") or item.title).strip()
        if "content_type" in payload:
            item.content_type = _parse_enum(ContentItemType, payload.get("content_type"), item.content_type)
        if "priority" in payload:
            item.priority = _parse_enum(ContentItemPriority, payload.get("priority"), item.priority)
        if "status" in payload:
            next_status = _parse_enum(ContentItemStatus, payload.get("status"), item.status)
            _apply_transition(item, next_status, now)
        if "assignee_id" in payload:
            item.assignee_id = payload.get("assignee_id")
        if "assignee_name" in payload:
            item.assignee_name = payload.get("assignee_name")
        if "due_date" in payload:
            item.due_date = _parse_datetime(payload.get("due_date"))
        if "publish_date" in payload:
            item.publish_date = _parse_datetime(payload.get("publish_date"))
        if "notes" in payload:
            item.notes = payload.get("notes")
        if "tags" in payload and isinstance(payload.get("tags"), list):
            item.tags = [str(tag).strip() for tag in payload.get("tags") if str(tag).strip()]
        if "shoot_date" in payload:
            item.shoot_date = _parse_datetime(payload.get("shoot_date"))
        if "location" in payload:
            item.location = payload.get("location")
        if "photographer" in payload:
            item.photographer = payload.get("photographer")
        if "team" in payload and isinstance(payload.get("team"), list):
            item.team = [str(member).strip() for member in payload.get("team") if str(member).strip()]
        if "assets_required" in payload and isinstance(payload.get("assets_required"), list):
            item.assets_required = [str(asset).strip() for asset in payload.get("assets_required") if str(asset).strip()]
        if "category" in payload:
            item.category = payload.get("category")
        if "description" in payload:
            item.description = payload.get("description")
        if "start_date" in payload:
            item.start_date = _parse_datetime(payload.get("start_date"))
        if "end_date" in payload:
            item.end_date = _parse_datetime(payload.get("end_date"))
        if "time" in payload:
            item.time = payload.get("time")
        if "assigned_person" in payload:
            item.assigned_person = payload.get("assigned_person")
        if "reminder" in payload:
            item.reminder = payload.get("reminder")
        if "color" in payload:
            item.color = payload.get("color")
        if "attachment" in payload:
            item.attachment = payload.get("attachment")
        if "metadata" in payload and isinstance(payload.get("metadata"), dict):
            item.metadata = dict(payload.get("metadata"))
        item.updated_by = str(getattr(current_user, "id", ""))
        item.updated_at = now
        await item.save()
        event_name = _event_name_for_status(item.status)
        await publish_crm_timeline_event(
            event_name=event_name,
            aggregate_type="content_item",
            aggregate_id=str(item.id),
            company_id=str(project.company_id),
            actor_id=str(getattr(current_user, "id", "")),
            project_id=str(project.project_id or project.id),
            payload={"content_item_id": str(item.id), "project_id": str(project.id), "title": item.title, "status": item.status.value, "timestamp": now.isoformat()},
            metadata={"surface": "delivery", "workflow": "content_calendar"},
        )
        return {"item": _serialize_item(item)}

    @staticmethod
    async def delete_item(current_user: User, item_id: str) -> Dict[str, Any]:
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content item not found")
        project = await _load_project(current_user, str(item.project_id))
        await item.delete()
        return {"message": "Content item deleted", "id": item_id, "project_id": str(project.id)}

