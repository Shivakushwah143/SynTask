from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

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
from app.core.clock import utc_now


# ── Canonical lifecycle (same as ContentProductionService) ──────────────────
CANONICAL_LIFECYCLE = [
    ContentItemStatus.IDEA,
    ContentItemStatus.BRIEFING,
    ContentItemStatus.SCRIPT,
    ContentItemStatus.PRODUCTION,
    ContentItemStatus.INTERNAL_REVIEW,
    ContentItemStatus.CLIENT_REVIEW,
    ContentItemStatus.REVISION_REQUIRED,
    ContentItemStatus.APPROVED,
    ContentItemStatus.READY_TO_PUBLISH,
    ContentItemStatus.PUBLISHED,
]

# ── Allowed transitions (bidirectional where revision loops exist) ──────────
ALLOWED_TRANSITIONS: Dict[ContentItemStatus, Set[ContentItemStatus]] = {
    ContentItemStatus.IDEA: {ContentItemStatus.BRIEFING},
    ContentItemStatus.BRIEFING: {ContentItemStatus.SCRIPT, ContentItemStatus.IDEA},
    ContentItemStatus.SCRIPT: {ContentItemStatus.PRODUCTION, ContentItemStatus.BRIEFING},
    ContentItemStatus.PRODUCTION: {ContentItemStatus.INTERNAL_REVIEW},
    ContentItemStatus.INTERNAL_REVIEW: {
        ContentItemStatus.CLIENT_REVIEW,
        ContentItemStatus.REVISION_REQUIRED,
    },
    ContentItemStatus.CLIENT_REVIEW: {
        ContentItemStatus.APPROVED,
        ContentItemStatus.REVISION_REQUIRED,
    },
    ContentItemStatus.REVISION_REQUIRED: {ContentItemStatus.PRODUCTION},
    ContentItemStatus.APPROVED: {ContentItemStatus.READY_TO_PUBLISH},
    # Publishing boundary: Content stops at Ready to Publish. The published
    # state is DERIVED from the canonical Publishing record — Content never
    # executes scheduled/published business transitions itself.
    ContentItemStatus.READY_TO_PUBLISH: set(),
    ContentItemStatus.PUBLISHED: set(),  # Terminal — derived from PublishingRecord
    # Legacy statuses — allow forward movement into canonical lifecycle
    ContentItemStatus.DRAFT: {ContentItemStatus.IDEA, ContentItemStatus.BRIEFING, ContentItemStatus.PRODUCTION},
    ContentItemStatus.PLANNED: {ContentItemStatus.BRIEFING, ContentItemStatus.PRODUCTION},
    ContentItemStatus.SHOOT_SCHEDULED: {ContentItemStatus.PRODUCTION},
    ContentItemStatus.SHOT: {ContentItemStatus.PRODUCTION},
    ContentItemStatus.EDITING: {ContentItemStatus.PRODUCTION, ContentItemStatus.INTERNAL_REVIEW},
    ContentItemStatus.SCHEDULED: {ContentItemStatus.READY_TO_PUBLISH},
}

# ── Legacy status → canonical status mapping ────────────────────────────────
LEGACY_STATUS_MAP = {
    ContentItemStatus.DRAFT: ContentItemStatus.IDEA,
    ContentItemStatus.PLANNED: ContentItemStatus.BRIEFING,
    ContentItemStatus.SHOOT_SCHEDULED: ContentItemStatus.PRODUCTION,
    ContentItemStatus.SHOT: ContentItemStatus.PRODUCTION,
    ContentItemStatus.EDITING: ContentItemStatus.PRODUCTION,
    ContentItemStatus.SCHEDULED: ContentItemStatus.READY_TO_PUBLISH,
}

# ── Status timestamp field mapping ──────────────────────────────────────────
STATUS_TIMESTAMP_FIELDS = {
    ContentItemStatus.IDEA: "idea_at",
    ContentItemStatus.BRIEFING: "briefing_at",
    ContentItemStatus.SCRIPT: "script_at",
    ContentItemStatus.PRODUCTION: "production_at",
    ContentItemStatus.INTERNAL_REVIEW: "internal_review_at",
    ContentItemStatus.CLIENT_REVIEW: "client_review_at",
    ContentItemStatus.REVISION_REQUIRED: "revision_required_at",
    ContentItemStatus.APPROVED: "approved_at",
    ContentItemStatus.READY_TO_PUBLISH: "ready_to_publish_at",
    ContentItemStatus.PUBLISHED: "published_at",
    ContentItemStatus.DRAFT: "draft_at",
    ContentItemStatus.PLANNED: "planned_at",
    ContentItemStatus.SHOOT_SCHEDULED: "shoot_scheduled_at",
    ContentItemStatus.SHOT: "shot_at",
    ContentItemStatus.EDITING: "editing_started_at",
    ContentItemStatus.SCHEDULED: "scheduled_at",
}

# ── Event map (status → domain event name) ──────────────────────────────────
CONTENT_EVENT_MAP = {
    ContentItemStatus.IDEA: "ContentIdea",
    ContentItemStatus.BRIEFING: "ContentBriefing",
    ContentItemStatus.SCRIPT: "ContentScript",
    ContentItemStatus.PRODUCTION: "ContentProduction",
    ContentItemStatus.INTERNAL_REVIEW: "ReadyForReview",
    ContentItemStatus.CLIENT_REVIEW: "SentForClientReview",
    ContentItemStatus.REVISION_REQUIRED: "RevisionRequested",
    ContentItemStatus.APPROVED: "Approved",
    ContentItemStatus.READY_TO_PUBLISH: "ReadyToPublish",
    ContentItemStatus.PUBLISHED: "Published",
    ContentItemStatus.PLANNED: "ContentPlanned",
    ContentItemStatus.SHOOT_SCHEDULED: "ShootScheduled",
    ContentItemStatus.SHOT: "ShootCompleted",
    ContentItemStatus.EDITING: "EditingStarted",
    ContentItemStatus.SCHEDULED: "Scheduled",
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
        "service_id": getattr(item, "service_id", None),
        "deliverable_id": getattr(item, "deliverable_id", None),
        "content_id": getattr(item, "content_id", None),
        "campaign": item.campaign,
        "platform": item.platform,
        "title": item.title,
        "content_type": item.content_type.value if getattr(item, "content_type", None) else ContentItemType.CUSTOM.value,
        "assignee_id": item.assignee_id,
        "assignee_name": item.assignee_name,
        "owner_id": getattr(item, "owner_id", None),
        "due_date": item.due_date,
        "publish_date": item.publish_date,
        "priority": item.priority.value if getattr(item, "priority", None) else ContentItemPriority.MEDIUM.value,
        "status": item.status.value if getattr(item, "status", None) else ContentItemStatus.IDEA.value,
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
        "deadline": getattr(item, "deadline", None),
        "assigned_person": getattr(item, "assigned_person", None),
        "reminder": getattr(item, "reminder", None),
        "color": reminder_status["color"],
        "reminder_status": reminder_status,
        "attachment": getattr(item, "attachment", None),
        # Canonical lifecycle timestamps
        "idea_at": getattr(item, "idea_at", None),
        "briefing_at": getattr(item, "briefing_at", None),
        "script_at": getattr(item, "script_at", None),
        "production_at": getattr(item, "production_at", None),
        "revision_required_at": getattr(item, "revision_required_at", None),
        "ready_to_publish_at": getattr(item, "ready_to_publish_at", None),
        # Legacy timestamps (preserved for backward compat)
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
        "current_version": getattr(item, "current_version", 1),
        "created_by": item.created_by,
        "updated_by": item.updated_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _apply_transition(item: ContentCalendarItem, next_status: ContentItemStatus, now: datetime) -> None:
    """Apply a status transition using the canonical lifecycle."""
    current_status = item.status
    # If current status is legacy, auto-migrate to canonical first
    if current_status in LEGACY_STATUS_MAP:
        current_status = LEGACY_STATUS_MAP[current_status]
        item.status = current_status
    # Check if transition is allowed
    allowed = ALLOWED_TRANSITIONS.get(current_status, set())
    if next_status not in allowed:
        # Try mapping legacy next_status to canonical
        canonical_next = LEGACY_STATUS_MAP.get(next_status, next_status)
        if canonical_next not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition from {current_status.value} to {next_status.value}",
            )
        next_status = canonical_next
    item.status = next_status
    # Set timestamp for the new status
    ts_field = STATUS_TIMESTAMP_FIELDS.get(next_status)
    if ts_field and hasattr(item, ts_field):
        current_val = getattr(item, ts_field)
        if not current_val:
            setattr(item, ts_field, now)
    if next_status == ContentItemStatus.PUBLISHED:
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
        delayed = sum(1 for item in items if item.due_date and item.due_date < utc_now() and item.status != ContentItemStatus.PUBLISHED)
        shoot_days = sum(1 for item in items if item.content_type == ContentItemType.SHOOT_DAY)
        return {
            "items": [_serialize_item(item) for item in items],
            "groups": grouped,
            "deliverables": {
                "completed": published,
                "remaining": max(len(items) - published, 0),
                "delayed": delayed,
                "upcoming": sum(1 for item in items if item.publish_date and item.publish_date >= utc_now() and item.status != ContentItemStatus.PUBLISHED),
                "monthly_targets": [],
            },
            "summary": {
                "items": len(items),
                "shoot_days": shoot_days,
                "published": published,
                "idea": sum(1 for item in items if item.status in (ContentItemStatus.IDEA, ContentItemStatus.DRAFT)),
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
        """Create content via the canonical ContentProductionService.
        This ensures Calendar-created items get a content_id, versioning,
        and use the canonical lifecycle statuses."""
        from app.services.content_production_service import ContentProductionService
        return await ContentProductionService.create_item(current_user, payload)

    @staticmethod
    async def update_item(current_user: User, item_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content item not found")
        project = await _load_project(current_user, str(item.project_id))
        now = utc_now()
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
        if "deadline" in payload:
            item.deadline = _parse_datetime(payload.get("deadline"))
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

    @staticmethod
    async def migrate_legacy_statuses(current_user: User) -> Dict[str, Any]:
        """One-time migration: convert all legacy statuses to canonical statuses."""
        legacy_statuses = list(LEGACY_STATUS_MAP.keys())
        migrated = 0
        skipped = 0
        errors = []

        for legacy_status in legacy_statuses:
            canonical = LEGACY_STATUS_MAP[legacy_status]
            items = await ContentCalendarItem.find(
                ContentCalendarItem.status == legacy_status
            ).to_list()

            for item in items:
                try:
                    item.status = canonical
                    # Set the corresponding timestamp field if not already set
                    ts_field = STATUS_TIMESTAMP_FIELDS.get(canonical)
                    if ts_field and not getattr(item, ts_field, None):
                        setattr(item, ts_field, utc_now())
                    item.updated_by = str(getattr(current_user, "id", ""))
                    item.updated_at = utc_now()
                    await item.save()
                    migrated += 1
                except Exception as e:
                    errors.append({"item_id": str(item.id), "error": str(e)})
                    skipped += 1

        return {
            "migrated": migrated,
            "skipped": skipped,
            "errors": errors,
            "legacy_statuses_processed": [s.value for s in legacy_statuses],
        }

