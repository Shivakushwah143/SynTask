"""
Content Production Lifecycle Service

Manages the full content lifecycle:
  Idea → Briefing → Script → Production → Internal Review → Client Review
  → Revision Required → Production (loop) → ... → Approved → Ready to Publish → Published

Key design principles:
  - Backend owns all transition rules (frontend never manipulates status directly)
  - Revision loops work: Internal Review ↔ Revision Required ↔ Production
  - One Content ID survives the entire lifecycle
  - Publishing is a separate boundary — Content becomes Ready to Publish, then Publishing owns execution
  - All review/approval history is preserved on the Content Item
  - Versions are immutable snapshots
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, status as http_status

from app.timeline.publisher import publish_crm_timeline_event
from app.knowledge.service import knowledge_service
from app.crm.models import Client
from app.models.client_service import ClientService
from app.models.client_deliverable import ClientDeliverable
from app.marketing.models import (
    ContentCalendarItem,
    ContentItemPriority,
    ContentItemStatus,
    ContentItemType,
    ContentReviewDecision,
    ContentPublishingStatus,
    ContentVersion,
    ContentReviewRecord,
    ContentPublishingRecord,
    ContentHistoryEntry,
    ContentTemplate,
)
from app.projects.models import Project
from app.tasks.models import Task
from app.models.user import User, UserRole
from app.services.reminder_service import calendar_due_tone
from app.core.clock import utc_now


# ── Canonical lifecycle (ordered) ──────────────────────────────────────────

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
# Key = current status, Value = set of allowed next statuses

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
    ContentItemStatus.READY_TO_PUBLISH: {ContentItemStatus.PUBLISHED},
    ContentItemStatus.PUBLISHED: set(),  # Terminal — publishing owns further state
    # Legacy statuses — allow forward movement into canonical lifecycle
    ContentItemStatus.DRAFT: {ContentItemStatus.IDEA, ContentItemStatus.BRIEFING, ContentItemStatus.PRODUCTION},
    ContentItemStatus.PLANNED: {ContentItemStatus.BRIEFING, ContentItemStatus.PRODUCTION},
    ContentItemStatus.SHOOT_SCHEDULED: {ContentItemStatus.PRODUCTION},
    ContentItemStatus.SHOT: {ContentItemStatus.PRODUCTION},
    ContentItemStatus.EDITING: {ContentItemStatus.PRODUCTION, ContentItemStatus.INTERNAL_REVIEW},
    ContentItemStatus.SCHEDULED: {ContentItemStatus.READY_TO_PUBLISH},
}


# ── Event map (status → domain event name) ─────────────────────────────────

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
    # Legacy
    ContentItemStatus.PLANNED: "ContentPlanned",
    ContentItemStatus.SHOOT_SCHEDULED: "ShootScheduled",
    ContentItemStatus.SHOT: "ShootCompleted",
    ContentItemStatus.EDITING: "EditingStarted",
    ContentItemStatus.SCHEDULED: "Scheduled",
}


# ── Status timestamp field mapping ─────────────────────────────────────────

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
    # Legacy
    ContentItemStatus.DRAFT: "draft_at",
    ContentItemStatus.PLANNED: "planned_at",
    ContentItemStatus.SHOOT_SCHEDULED: "shoot_scheduled_at",
    ContentItemStatus.SHOT: "shot_at",
    ContentItemStatus.EDITING: "editing_started_at",
    ContentItemStatus.SCHEDULED: "scheduled_at",
}


# ── Helpers ────────────────────────────────────────────────────────────────

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
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Company context required")
    return company_id


def _can_access(current_user: User, project: Project) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if str(project.company_id) != str(current_user.company_id):
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Access denied")


def _validate_transition(current: ContentItemStatus, target: ContentItemStatus) -> None:
    """Validate that a status transition is allowed by the state machine."""
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition from '{current.value}' to '{target.value}'. "
                   f"Allowed: {[s.value for s in sorted(allowed, key=lambda s: s.value)]}",
        )


def _apply_transition(item: ContentCalendarItem, next_status: ContentItemStatus, now: datetime) -> None:
    """Apply a validated status transition, setting the appropriate timestamp."""
    _validate_transition(item.status, next_status)
    old_status = item.status
    item.status = next_status

    # Set the timestamp for the new status
    ts_field = STATUS_TIMESTAMP_FIELDS.get(next_status)
    if ts_field:
        current_val = getattr(item, ts_field, None)
        if current_val is None:
            setattr(item, ts_field, now)

    # Terminal published state
    if next_status == ContentItemStatus.PUBLISHED:
        item.completed = True

    # Add history entry
    actor_name = item.updated_by or "system"
    item.history.append(ContentHistoryEntry(
        action="status_changed",
        from_status=old_status.value,
        to_status=next_status.value,
        created_at=now,
    ))


def _next_version_number(item: ContentCalendarItem) -> int:
    """Calculate the next version number."""
    if item.versions:
        return max(v.version_number for v in item.versions) + 1
    return 1


def _serialize_item(item: ContentCalendarItem) -> Dict[str, Any]:
    """Serialize a ContentCalendarItem to a JSON-safe dict."""
    reminder_status = calendar_due_tone(item.due_date)
    return {
        "id": str(item.id),
        "company_id": item.company_id,
        "project_id": item.project_id,
        "client_id": item.client_id,
        "service_id": item.service_id,
        "deliverable_id": item.deliverable_id,
        "content_id": item.content_id,
        "campaign": item.campaign,
        "platform": item.platform,
        "title": item.title,
        "content_type": item.content_type.value if item.content_type else ContentItemType.CUSTOM.value,
        "category": item.category,
        "description": item.description,
        # Briefing
        "objective": item.objective,
        "target_audience": item.target_audience,
        "key_message": item.key_message,
        "hook": item.hook,
        "cta": item.cta,
        "tone": item.tone,
        # Content body
        "caption": item.caption,
        "script": item.script,
        "creative_brief": item.creative_brief,
        # Assignment
        "assignee_id": item.assignee_id,
        "assignee_name": item.assignee_name,
        "owner_id": item.owner_id,
        "team": list(item.team or []),
        "due_date": item.due_date,
        "publish_date": item.publish_date,
        "start_date": item.start_date,
        "end_date": item.end_date,
        "time": item.time,
        "deadline": item.deadline,
        # Priority & status
        "priority": item.priority.value if item.priority else ContentItemPriority.MEDIUM.value,
        "status": item.status.value if item.status else ContentItemStatus.IDEA.value,
        "completed": item.completed,
        # Production
        "shoot_date": item.shoot_date,
        "location": item.location,
        "photographer": item.photographer,
        "assets_required": list(item.assets_required or []),
        "references": list(item.references or []),
        # Files
        "file_ids": list(item.file_ids or []),
        "file_urls": list(item.file_urls or []),
        "attachment": item.attachment,
        # Tags & metadata
        "tags": list(item.tags or []),
        "notes": item.notes,
        "assigned_person": item.assigned_person,
        "reminder": item.reminder,
        "color": reminder_status["color"],
        "reminder_status": reminder_status,
        "deliverable_target": item.deliverable_target,
        "metadata": item.metadata,
        # Versioning
        "current_version": item.current_version,
        "versions": [v.model_dump() for v in item.versions] if item.versions else [],
        # Reviews
        "internal_reviews": [r.model_dump() for r in item.internal_reviews] if item.internal_reviews else [],
        "client_approvals": [r.model_dump() for r in item.client_approvals] if item.client_approvals else [],
        # Publishing
        "publishing": item.publishing.model_dump() if item.publishing else None,
        # History
        "history": [h.model_dump() for h in item.history] if item.history else [],
        # Timestamps
        "draft_at": item.draft_at,
        "planned_at": item.planned_at,
        "idea_at": item.idea_at,
        "briefing_at": item.briefing_at,
        "script_at": item.script_at,
        "production_at": item.production_at,
        "revision_required_at": item.revision_required_at,
        "ready_to_publish_at": item.ready_to_publish_at,
        "shoot_scheduled_at": item.shoot_scheduled_at,
        "shot_at": item.shot_at,
        "editing_started_at": item.editing_started_at,
        "internal_review_at": item.internal_review_at,
        "client_review_at": item.client_review_at,
        "approved_at": item.approved_at,
        "scheduled_at": item.scheduled_at,
        "published_at": item.published_at,
        "deadline_missed_at": item.deadline_missed_at,
        "created_by": item.created_by,
        "updated_by": item.updated_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


async def _load_project(current_user: User, project_id: str) -> Project:
    project = await Project.get(project_id)
    if not project or getattr(project, "deleted", False):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Project not found")
    _can_access(current_user, project)
    return project


async def _generate_content_id(company_id: str) -> str:
    """Generate the next CNT-XXX content ID for the company."""
    count = await ContentCalendarItem.find({"company_id": company_id}).count()
    return f"CNT-{count + 1:03d}"


# ── Public Service ─────────────────────────────────────────────────────────

class ContentProductionService:
    """Handles the full content production lifecycle."""

    # ── Aggregate / List ───────────────────────────────────────────────────

    @staticmethod
    async def aggregate(
        current_user: User,
        project_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        client_id: Optional[str] = None,
        service_id: Optional[str] = None,
        platform: Optional[str] = None,
        content_type: Optional[str] = None,
        priority: Optional[str] = None,
        owner_id: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Full aggregate with lifecycle tab counts and filtered items."""
        company_id = _company_id(current_user)
        now = utc_now()

        # Build project query
        project_query: Dict[str, Any] = {"company_id": company_id, "deleted": {"$ne": True}}
        if project_id:
            project_query["_id"] = project_id
        projects = await Project.find(project_query).to_list()
        project_ids = [str(p.id) for p in projects]

        if not project_ids:
            return _empty_aggregate()

        # Build item query
        item_query: Dict[str, Any] = {
            "company_id": company_id,
            "project_id": {"$in": project_ids},
        }
        if client_id:
            item_query["client_id"] = client_id
        if service_id:
            item_query["service_id"] = service_id
        if platform:
            item_query["platform"] = platform
        if content_type:
            item_query["content_type"] = content_type
        if priority:
            item_query["priority"] = priority
        if owner_id:
            item_query["$or"] = [
                {"owner_id": owner_id},
                {"assignee_id": owner_id},
            ]

        items = await ContentCalendarItem.find(item_query).sort("-updated_at").to_list()

        # Compute lifecycle tab counts (from ALL items, before search filter)
        lifecycle_counts = _compute_lifecycle_counts(items)

        # Apply text search
        if search:
            q = search.lower().strip()
            items = [
                i for i in items
                if q in (i.title or "").lower()
                or q in (i.description or "").lower()
                or q in (i.campaign or "").lower()
                or q in (i.content_id or "").lower()
                or q in (i.notes or "").lower()
            ]

        # If status_filter is specified, filter items
        if status_filter and status_filter != "all":
            if status_filter == "published":
                # Published tab = items whose publishing record says published
                items = [i for i in items if i.status == ContentItemStatus.PUBLISHED or (i.publishing and i.publishing.status == ContentPublishingStatus.PUBLISHED)]
            else:
                items = [i for i in items if i.status.value == status_filter]

        # Compute overview metrics
        all_items_for_metrics = await ContentCalendarItem.find({
            "company_id": company_id,
            "project_id": {"$in": project_ids},
        }).to_list()

        overview = _compute_overview(all_items_for_metrics, now)

        return {
            "items": [_serialize_item(i) for i in items],
            "lifecycle_counts": lifecycle_counts,
            "overview": overview,
            "projects": [
                {"id": str(p.id), "name": p.name, "project_id": p.project_id}
                for p in projects
            ],
        }

    @staticmethod
    async def get_item(current_user: User, item_id: str) -> Dict[str, Any]:
        """Get a single content item with all details."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        project = await _load_project(current_user, str(item.project_id))
        result = _serialize_item(item)
        result["project_name"] = project.name
        result["project_key"] = project.project_id
        return {"item": result}

    # ── Create ─────────────────────────────────────────────────────────────

    @staticmethod
    async def create_item(current_user: User, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new content item. Status defaults to IDEA."""
        project = await _load_project(current_user, str(payload.get("project_id") or ""))
        now = utc_now()
        company_id = str(project.company_id)

        # Generate content ID
        content_id = await _generate_content_id(company_id)

        initial_status = _parse_enum(ContentItemStatus, payload.get("status"), ContentItemStatus.IDEA)

        item = ContentCalendarItem(
            company_id=company_id,
            project_id=str(project.id),
            content_id=content_id,
            client_id=payload.get("client_id"),
            service_id=payload.get("service_id"),
            deliverable_id=payload.get("deliverable_id"),
            campaign=payload.get("campaign"),
            platform=payload.get("platform"),
            title=str(payload.get("title") or "Untitled content").strip(),
            content_type=_parse_enum(ContentItemType, payload.get("content_type"), ContentItemType.CUSTOM),
            category=payload.get("category"),
            description=payload.get("description"),
            # Briefing
            objective=payload.get("objective"),
            target_audience=payload.get("target_audience"),
            key_message=payload.get("key_message"),
            hook=payload.get("hook"),
            cta=payload.get("cta"),
            tone=payload.get("tone"),
            # Content body
            caption=payload.get("caption"),
            script=payload.get("script"),
            creative_brief=payload.get("creative_brief"),
            # Assignment
            assignee_id=payload.get("assignee_id"),
            assignee_name=payload.get("assignee_name"),
            owner_id=payload.get("owner_id") or payload.get("assignee_id"),
            team=list(payload.get("team") or []),
            due_date=_parse_datetime(payload.get("due_date")),
            publish_date=_parse_datetime(payload.get("publish_date")),
            start_date=_parse_datetime(payload.get("start_date")),
            end_date=_parse_datetime(payload.get("end_date")),
            time=payload.get("time"),
            deadline=_parse_datetime(payload.get("deadline")),
            # Priority & status
            priority=_parse_enum(ContentItemPriority, payload.get("priority"), ContentItemPriority.MEDIUM),
            status=initial_status,
            # Production
            shoot_date=_parse_datetime(payload.get("shoot_date")),
            location=payload.get("location"),
            photographer=payload.get("photographer"),
            assets_required=list(payload.get("assets_required") or []),
            references=list(payload.get("references") or []),
            # Files
            file_ids=list(payload.get("file_ids") or []),
            file_urls=list(payload.get("file_urls") or []),
            attachment=payload.get("attachment"),
            # Tags & metadata
            tags=list(payload.get("tags") or []),
            notes=payload.get("notes"),
            assigned_person=payload.get("assigned_person"),
            reminder=payload.get("reminder"),
            color=payload.get("color"),
            deliverable_target=payload.get("deliverable_target"),
            metadata=dict(payload.get("metadata") or {}),
            # Initial version
            current_version=1,
            versions=[ContentVersion(
                version_number=1,
                caption=payload.get("caption"),
                script=payload.get("script"),
                creative_brief=payload.get("creative_brief"),
                files=list(payload.get("file_ids") or []),
                file_urls=list(payload.get("file_urls") or []),
                created_by=str(getattr(current_user, "id", "")),
                created_by_name=_display_name(current_user),
                created_at=now,
            )],
            # Set initial timestamp
            **{STATUS_TIMESTAMP_FIELDS.get(initial_status, "draft_at"): now},
            created_by=str(getattr(current_user, "id", "")),
            updated_by=str(getattr(current_user, "id", "")),
            created_at=now,
            updated_at=now,
        )
        await item.insert()

        # History
        item.history.append(ContentHistoryEntry(
            action="created",
            to_status=initial_status.value,
            actor_id=str(getattr(current_user, "id", "")),
            actor_name=_display_name(current_user),
            created_at=now,
        ))
        await item.save()

        # Domain event
        event_name = CONTENT_EVENT_MAP.get(initial_status, "ContentCreated")
        await _publish_event(event_name, item, project, current_user, now)
        await _ingest_knowledge(event_name, item, project, current_user, now)

        return {"item": _serialize_item(item)}

    # ── Update ─────────────────────────────────────────────────────────────

    @staticmethod
    async def update_item(current_user: User, item_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Update content item fields. Status transitions are handled separately."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        project = await _load_project(current_user, str(item.project_id))
        now = utc_now()

        # Update fields (not status — that goes through transition)
        field_map = {
            "title": lambda v: str(v or item.title).strip(),
            "content_type": lambda v: _parse_enum(ContentItemType, v, item.content_type),
            "priority": lambda v: _parse_enum(ContentItemPriority, v, item.priority),
            "client_id": lambda v: v,
            "service_id": lambda v: v,
            "deliverable_id": lambda v: v,
            "campaign": lambda v: v,
            "platform": lambda v: v,
            "category": lambda v: v,
            "description": lambda v: v,
            "objective": lambda v: v,
            "target_audience": lambda v: v,
            "key_message": lambda v: v,
            "hook": lambda v: v,
            "cta": lambda v: v,
            "tone": lambda v: v,
            "caption": lambda v: v,
            "script": lambda v: v,
            "creative_brief": lambda v: v,
            "assignee_id": lambda v: v,
            "assignee_name": lambda v: v,
            "owner_id": lambda v: v,
            "due_date": lambda v: _parse_datetime(v),
            "publish_date": lambda v: _parse_datetime(v),
            "start_date": lambda v: _parse_datetime(v),
            "end_date": lambda v: _parse_datetime(v),
            "time": lambda v: v,
            "deadline": lambda v: _parse_datetime(v),
            "shoot_date": lambda v: _parse_datetime(v),
            "location": lambda v: v,
            "photographer": lambda v: v,
            "notes": lambda v: v,
            "assigned_person": lambda v: v,
            "reminder": lambda v: v,
            "color": lambda v: v,
            "deliverable_target": lambda v: v,
            "attachment": lambda v: v,
            "completed": lambda v: v,
        }

        list_fields = {"tags", "team", "assets_required", "references", "file_ids", "file_urls"}

        for field, transformer in field_map.items():
            if field in payload:
                setattr(item, field, transformer(payload[field]))

        for field in list_fields:
            if field in payload and isinstance(payload[field], list):
                setattr(item, field, [str(v).strip() for v in payload[field] if str(v).strip()])

        if "metadata" in payload and isinstance(payload["metadata"], dict):
            item.metadata = dict(payload["metadata"])

        item.updated_by = str(getattr(current_user, "id", ""))
        item.updated_at = now
        await item.save()

        return {"item": _serialize_item(item)}

    # ── Status Transitions ─────────────────────────────────────────────────

    @staticmethod
    async def transition_status(
        current_user: User,
        item_id: str,
        target_status: str,
        notes: Optional[str] = None,
        feedback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Transition a content item to a new status.
        Backend owns all transition rules.
        """
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        project = await _load_project(current_user, str(item.project_id))
        now = utc_now()
        target = _parse_enum(ContentItemStatus, target_status, item.status)

        if target == item.status:
            return {"item": _serialize_item(item), "message": "Already in this status"}

        # Validate and apply transition
        _apply_transition(item, target, now)

        # If transitioning to INTERNAL_REVIEW, create a review record
        if target == ContentItemStatus.INTERNAL_REVIEW:
            item.internal_reviews.append(ContentReviewRecord(
                reviewer_id=str(getattr(current_user, "id", "")),
                reviewer_name=_display_name(current_user),
                version_number=item.current_version,
                decision=ContentReviewDecision.APPROVE,  # Placeholder — actual decision comes later
                feedback=feedback or notes,
                created_at=now,
            ))

        # If transitioning to CLIENT_REVIEW, create a client review record
        if target == ContentItemStatus.CLIENT_REVIEW:
            item.client_approvals.append(ContentReviewRecord(
                reviewer_id=str(getattr(current_user, "id", "")),
                reviewer_name=_display_name(current_user),
                version_number=item.current_version,
                decision=ContentReviewDecision.APPROVE,
                feedback=feedback or notes,
                created_at=now,
            ))

        # If transitioning to REVISION_REQUIRED, increment version
        if target == ContentItemStatus.REVISION_REQUIRED:
            new_version_num = _next_version_number(item)
            item.current_version = new_version_num
            item.versions.append(ContentVersion(
                version_number=new_version_num,
                caption=item.caption,
                script=item.script,
                creative_brief=item.creative_brief,
                files=list(item.file_ids or []),
                file_urls=list(item.file_urls or []),
                created_by=str(getattr(current_user, "id", "")),
                created_by_name=_display_name(current_user),
                created_at=now,
                review_result="revision_required",
                feedback=feedback or notes,
            ))

        # If transitioning to READY_TO_PUBLISH, create/connect publishing record
        if target == ContentItemStatus.READY_TO_PUBLISH:
            if not item.publishing:
                item.publishing = ContentPublishingRecord(
                    platform=item.platform,
                    status=ContentPublishingStatus.NOT_STARTED,
                    created_at=now,
                    updated_at=now,
                )
            else:
                item.publishing.status = ContentPublishingStatus.NOT_STARTED
                item.publishing.updated_at = now

        item.updated_by = str(getattr(current_user, "id", ""))
        item.updated_at = now
        await item.save()

        # Domain event
        event_name = CONTENT_EVENT_MAP.get(target, "ContentUpdated")
        await _publish_event(event_name, item, project, current_user, now)

        return {"item": _serialize_item(item), "message": f"Transitioned to {target.value}"}

    # ── Review Actions ─────────────────────────────────────────────────────

    @staticmethod
    async def internal_review_action(
        current_user: User,
        item_id: str,
        decision: str,
        feedback: Optional[str] = None,
        issues: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Process an internal review action: approve, request_revision, or reject."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        if item.status != ContentItemStatus.INTERNAL_REVIEW:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Item is not in internal review")

        project = await _load_project(current_user, str(item.project_id))
        now = utc_now()
        dec = _parse_enum(ContentReviewDecision, decision, ContentReviewDecision.REQUEST_REVISION)

        # Record the review
        record = ContentReviewRecord(
            reviewer_id=str(getattr(current_user, "id", "")),
            reviewer_name=_display_name(current_user),
            version_number=item.current_version,
            decision=dec,
            feedback=feedback,
            issues=issues or [],
            created_at=now,
        )
        item.internal_reviews.append(record)

        # Transition based on decision
        if dec == ContentReviewDecision.APPROVE:
            _apply_transition(item, ContentItemStatus.CLIENT_REVIEW, now)
        elif dec == ContentReviewDecision.REQUEST_REVISION:
            _apply_transition(item, ContentItemStatus.REVISION_REQUIRED, now)
            # Create new version
            new_version_num = _next_version_number(item)
            item.current_version = new_version_num
            item.versions.append(ContentVersion(
                version_number=new_version_num,
                caption=item.caption,
                script=item.script,
                creative_brief=item.creative_brief,
                files=list(item.file_ids or []),
                file_urls=list(item.file_urls or []),
                created_by=str(getattr(current_user, "id", "")),
                created_by_name=_display_name(current_user),
                created_at=now,
                review_result="revision_required",
                feedback=feedback,
            ))
        elif dec == ContentReviewDecision.REJECT:
            # Rejection goes back to production
            _apply_transition(item, ContentItemStatus.REVISION_REQUIRED, now)

        item.updated_by = str(getattr(current_user, "id", ""))
        item.updated_at = now
        await item.save()

        event_name = CONTENT_EVENT_MAP.get(item.status, "ContentReviewAction")
        await _publish_event(event_name, item, project, current_user, now)

        return {"item": _serialize_item(item), "message": f"Review recorded: {dec.value}"}

    @staticmethod
    async def client_review_action(
        current_user: User,
        item_id: str,
        decision: str,
        feedback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Process a client review action: approve or request_changes."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        if item.status != ContentItemStatus.CLIENT_REVIEW:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Item is not in client review")

        project = await _load_project(current_user, str(item.project_id))
        now = utc_now()
        dec = _parse_enum(ContentReviewDecision, decision, ContentReviewDecision.REQUEST_REVISION)

        # Record the approval
        record = ContentReviewRecord(
            reviewer_id=str(getattr(current_user, "id", "")),
            reviewer_name=_display_name(current_user),
            version_number=item.current_version,
            decision=dec,
            feedback=feedback,
            created_at=now,
        )
        item.client_approvals.append(record)

        if dec == ContentReviewDecision.APPROVE:
            _apply_transition(item, ContentItemStatus.APPROVED, now)
        elif dec in (ContentReviewDecision.REQUEST_REVISION, ContentReviewDecision.REJECT):
            _apply_transition(item, ContentItemStatus.REVISION_REQUIRED, now)
            new_version_num = _next_version_number(item)
            item.current_version = new_version_num
            item.versions.append(ContentVersion(
                version_number=new_version_num,
                caption=item.caption,
                script=item.script,
                creative_brief=item.creative_brief,
                files=list(item.file_ids or []),
                file_urls=list(item.file_urls or []),
                created_by=str(getattr(current_user, "id", "")),
                created_by_name=_display_name(current_user),
                created_at=now,
                review_result="client_revision_requested",
                feedback=feedback,
            ))

        item.updated_by = str(getattr(current_user, "id", ""))
        item.updated_at = now
        await item.save()

        event_name = CONTENT_EVENT_MAP.get(item.status, "ClientReviewAction")
        await _publish_event(event_name, item, project, current_user, now)

        return {"item": _serialize_item(item), "message": f"Client review recorded: {dec.value}"}

    # ── Versions ───────────────────────────────────────────────────────────

    @staticmethod
    async def create_version(
        current_user: User,
        item_id: str,
        caption: Optional[str] = None,
        script: Optional[str] = None,
        creative_brief: Optional[str] = None,
        file_ids: Optional[List[str]] = None,
        file_urls: Optional[List[str]] = None,
        feedback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new version of the content item."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        project = await _load_project(current_user, str(item.project_id))
        now = utc_now()

        new_version_num = _next_version_number(item)
        item.current_version = new_version_num

        version = ContentVersion(
            version_number=new_version_num,
            caption=caption or item.caption,
            script=script or item.script,
            creative_brief=creative_brief or item.creative_brief,
            files=file_ids or list(item.file_ids or []),
            file_urls=file_urls or list(item.file_urls or []),
            created_by=str(getattr(current_user, "id", "")),
            created_by_name=_display_name(current_user),
            created_at=now,
            feedback=feedback,
        )
        item.versions.append(version)

        # Update the item's current content
        if caption is not None:
            item.caption = caption
        if script is not None:
            item.script = script
        if creative_brief is not None:
            item.creative_brief = creative_brief
        if file_ids is not None:
            item.file_ids = file_ids
        if file_urls is not None:
            item.file_urls = file_urls

        item.updated_by = str(getattr(current_user, "id", ""))
        item.updated_at = now

        item.history.append(ContentHistoryEntry(
            action="version_created",
            version_number=new_version_num,
            actor_id=str(getattr(current_user, "id", "")),
            actor_name=_display_name(current_user),
            created_at=now,
        ))

        await item.save()
        return {"item": _serialize_item(item), "version": version.model_dump()}

    # ── Delete ─────────────────────────────────────────────────────────────

    @staticmethod
    async def delete_item(current_user: User, item_id: str) -> Dict[str, Any]:
        """Delete a content item."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        await _load_project(current_user, str(item.project_id))
        await item.delete()
        return {"message": "Content item deleted", "id": item_id}

    # ── Content Calendar (backward compatible) ─────────────────────────────

    @staticmethod
    async def calendar_view(
        current_user: User,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Calendar aggregate view — backward-compatible with existing frontend.
        Returns items grouped by project, with summary stats.
        """
        company_id = _company_id(current_user)

        project_query: Dict[str, Any] = {"company_id": company_id, "deleted": {"$ne": True}}
        if project_id:
            project_query["_id"] = project_id
        projects = await Project.find(project_query).to_list()
        project_ids = [str(p.id) for p in projects]

        if not project_ids:
            return {
                "items": [],
                "groups": {},
                "deliverables": {"completed": 0, "remaining": 0, "delayed": 0, "upcoming": 0, "monthly_targets": []},
                "summary": {"items": 0, "shoot_days": 0, "published": 0, "draft": 0, "tasks": 0, "meetings": 0},
                "projects": [],
            }

        items = await ContentCalendarItem.find(
            {"company_id": company_id, "project_id": {"$in": project_ids}}
        ).sort("-publish_date").to_list()

        tasks = await Task.find({"company_id": company_id, "project_id": {"$in": project_ids}}).to_list()

        grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for item in items:
            grouped[item.project_id].append(_serialize_item(item))

        published = sum(1 for i in items if i.status == ContentItemStatus.PUBLISHED)
        delayed = sum(1 for i in items if i.due_date and i.due_date < utc_now() and i.status != ContentItemStatus.PUBLISHED)

        return {
            "items": [_serialize_item(i) for i in items],
            "groups": grouped,
            "deliverables": {
                "completed": published,
                "remaining": max(len(items) - published, 0),
                "delayed": delayed,
                "upcoming": sum(1 for i in items if i.publish_date and i.publish_date >= utc_now() and i.status != ContentItemStatus.PUBLISHED),
                "monthly_targets": [],
            },
            "summary": {
                "items": len(items),
                "shoot_days": sum(1 for i in items if i.content_type == ContentItemType.SHOOT_DAY),
                "published": published,
                "draft": sum(1 for i in items if i.status in (ContentItemStatus.DRAFT, ContentItemStatus.IDEA)),
                "tasks": len(tasks),
                "meetings": 0,
            },
            "projects": [
                {"id": str(p.id), "name": p.name, "project_id": p.project_id}
                for p in projects
            ],
        }

    # ── Allowed Transitions ────────────────────────────────────────────────

    @staticmethod
    async def get_allowed_transitions(current_user: User, item_id: str) -> Dict[str, Any]:
        """Return the list of allowed next statuses for a content item."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        allowed = ALLOWED_TRANSITIONS.get(item.status, set())
        return {
            "current_status": item.status.value,
            "allowed": [s.value for s in sorted(allowed, key=lambda s: s.value)],
        }

    # ── Content Library ────────────────────────────────────────────────────

    @staticmethod
    async def content_library(
        current_user: User,
        client_id: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Content Library — historical/completed content items."""
        company_id = _company_id(current_user)
        query: Dict[str, Any] = {
            "company_id": company_id,
            "status": {"$in": [
                ContentItemStatus.APPROVED.value,
                ContentItemStatus.READY_TO_PUBLISH.value,
                ContentItemStatus.PUBLISHED.value,
            ]},
        }
        if client_id:
            query["client_id"] = client_id

        items = await ContentCalendarItem.find(query).sort("-updated_at").skip(offset).limit(limit).to_list()
        total = await ContentCalendarItem.find(query).count()

        if search:
            q = search.lower().strip()
            items = [i for i in items if q in (i.title or "").lower() or q in (i.content_id or "").lower()]

        return {
            "items": [_serialize_item(i) for i in items],
            "total": total,
            "limit": limit,
            "offset": offset,
        }


# ── Private helpers ────────────────────────────────────────────────────────

def _empty_aggregate() -> Dict[str, Any]:
    return {
        "items": [],
        "lifecycle_counts": {s.value: 0 for s in CANONICAL_LIFECYCLE},
        "overview": _empty_overview(),
        "projects": [],
    }


def _empty_overview() -> Dict[str, Any]:
    return {
        "due_today": 0,
        "overdue": 0,
        "awaiting_internal_review": 0,
        "awaiting_client_approval": 0,
        "revision_required": 0,
        "ready_to_publish": 0,
        "in_production": 0,
        "total": 0,
    }


def _compute_lifecycle_counts(items: List[ContentCalendarItem]) -> Dict[str, int]:
    """Compute counts for each lifecycle tab."""
    counts: Dict[str, int] = {s.value: 0 for s in CANONICAL_LIFECYCLE}
    for item in items:
        status_val = item.status.value if item.status else "idea"
        if status_val in counts:
            counts[status_val] += 1
        elif status_val in ("draft", "planned", "shoot_scheduled", "shot", "editing", "scheduled"):
            # Map legacy statuses to canonical
            legacy_map = {
                "draft": "idea",
                "planned": "briefing",
                "shoot_scheduled": "production",
                "shot": "production",
                "editing": "production",
                "scheduled": "ready_to_publish",
            }
            mapped = legacy_map.get(status_val, "idea")
            counts[mapped] += 1
    return counts


def _compute_overview(items: List[ContentCalendarItem], now: datetime) -> Dict[str, Any]:
    """Compute content overview dashboard metrics."""
    due_today = 0
    overdue = 0
    awaiting_internal_review = 0
    awaiting_client_approval = 0
    revision_required = 0
    ready_to_publish = 0
    in_production = 0

    for item in items:
        s = item.status
        if s == ContentItemStatus.INTERNAL_REVIEW:
            awaiting_internal_review += 1
        elif s == ContentItemStatus.CLIENT_REVIEW:
            awaiting_client_approval += 1
        elif s == ContentItemStatus.REVISION_REQUIRED:
            revision_required += 1
        elif s == ContentItemStatus.READY_TO_PUBLISH:
            ready_to_publish += 1
        elif s in (ContentItemStatus.PRODUCTION, ContentItemStatus.SCRIPT, ContentItemStatus.BRIEFING):
            in_production += 1

        if item.due_date and not item.completed:
            if item.due_date.date() == now.date():
                due_today += 1
            elif item.due_date < now:
                overdue += 1

    return {
        "due_today": due_today,
        "overdue": overdue,
        "awaiting_internal_review": awaiting_internal_review,
        "awaiting_client_approval": awaiting_client_approval,
        "revision_required": revision_required,
        "ready_to_publish": ready_to_publish,
        "in_production": in_production,
        "total": len(items),
    }


async def _publish_event(
    event_name: str,
    item: ContentCalendarItem,
    project: Project,
    user: User,
    now: datetime,
) -> None:
    """Publish a domain event to the event bus."""
    try:
        await publish_crm_timeline_event(
            event_name=event_name,
            aggregate_type="content_item",
            aggregate_id=str(item.id),
            company_id=str(item.company_id),
            actor_id=str(getattr(user, "id", "")),
            project_id=str(project.project_id or project.id),
            payload={
                "content_item_id": str(item.id),
                "content_id": item.content_id,
                "project_id": str(project.id),
                "title": item.title,
                "status": item.status.value,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "delivery", "workflow": "content_production"},
        )
    except Exception:
        pass  # Non-critical


async def _ingest_knowledge(
    event_name: str,
    item: ContentCalendarItem,
    project: Project,
    user: User,
    now: datetime,
) -> None:
    """Ingest event into the knowledge graph."""
    try:
        await knowledge_service.ingest_event(
            knowledge_service._event(
                event_name=event_name,
                aggregate_type="content_item",
                aggregate_id=str(item.id),
                company_id=str(item.company_id),
                actor_id=str(getattr(user, "id", "")),
                project_id=str(project.project_id or project.id),
                payload={
                    "title": item.title,
                    "summary": item.notes or item.title,
                    "status": item.status.value,
                    "priority": item.priority.value,
                    "content_id": item.content_id,
                    "due_date": item.due_date.isoformat() if item.due_date else None,
                    "publish_date": item.publish_date.isoformat() if item.publish_date else None,
                    "tags": list(item.tags or []),
                    "relationships": [
                        {"relationship_type": "project", "entity_type": "project", "entity_id": str(project.project_id or project.id)},
                    ],
                    "content": item.notes or item.title,
                    "version_marker": str(item.updated_at or item.created_at or utc_now()),
                },
                metadata={"module": "content_production"},
            )
        )
    except Exception:
        pass  # Non-critical
