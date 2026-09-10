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
from datetime import datetime, timedelta
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
    ContentComment,
    ContentPublishingRecordDoc,
)
from app.projects.models import Project
from app.tasks.models import Task
from app.models.user import User, UserRole
from app.services.reminder_service import calendar_due_tone
from app.core.clock import utc_now

# Action-level capabilities reused from the existing capability system
# (require_capability / has_capability). Content adds a "content." family so
# companies can grant review/approval/publishing visibility independently of
# generic edit rights. The module gate ("content_calendar") still applies.
CAP_CONTENT_VIEW = "content.view"
CAP_CONTENT_CREATE = "content.create"
CAP_CONTENT_EDIT = "content.edit"
CAP_CONTENT_DELETE = "content.delete"
CAP_CONTENT_TRANSITION = "content.transition"
CAP_CONTENT_INTERNAL_REVIEW = "content.internal_review"
CAP_CONTENT_CLIENT_REVIEW = "content.client_review"
CAP_CONTENT_MANAGE_TEMPLATES = "content.manage_templates"
CAP_CONTENT_VIEW_PUBLISHING = "content.view_publishing"
CAP_CONTENT_UPDATE_PUBLISHING = "content.update_publishing"
CAP_CONTENT_COMMENTS = "content.comment"

# ── Backend-owned lifecycle metadata ───────────────────────────────────────
# Next Action per canonical lifecycle stage. The frontend renders this label
# verbatim — there is NO second lifecycle map in the UI, so the workspace list,
# item detail, and overview can never disagree about what happens next.
NEXT_ACTION_BY_STATUS: Dict[ContentItemStatus, str] = {
    ContentItemStatus.IDEA: "Complete content brief",
    ContentItemStatus.BRIEFING: "Complete script",
    ContentItemStatus.SCRIPT: "Begin production",
    ContentItemStatus.PRODUCTION: "Submit for internal review",
    ContentItemStatus.INTERNAL_REVIEW: "Reviewer decision required",
    ContentItemStatus.REVISION_REQUIRED: "Upload revised version",
    ContentItemStatus.CLIENT_REVIEW: "Waiting for client approval",
    ContentItemStatus.APPROVED: "Prepare publishing handoff",
    ContentItemStatus.READY_TO_PUBLISH: "Waiting for Publishing",
    ContentItemStatus.PUBLISHED: "Published",
}

# Fields considered essential for a complete content brief (used by the
# deterministic brief-completeness check; surfaced to AI as context only).
BRIEF_REQUIRED_FIELDS = [
    "objective", "target_audience", "key_message", "cta", "tone",
]


def next_action_for(item: ContentCalendarItem) -> str:
    """Backend-derived Next Action label for a content item."""
    status = item.status if item.status else ContentItemStatus.IDEA
    return NEXT_ACTION_BY_STATUS.get(status, "Review")


def brief_completeness(item: ContentCalendarItem) -> Dict[str, Any]:
    """Deterministic brief-completeness check (percentage + missing fields).

    Rule-based only — never blocks users; lifecycle rules decide whether a
    transition is allowed. Missing fields are surfaced as guidance and given
    to AI as context so generated work fits the brief.
    """
    missing = [
        field for field in BRIEF_REQUIRED_FIELDS
        if not str(getattr(item, field, None) or "").strip()
    ]
    total = len(BRIEF_REQUIRED_FIELDS)
    complete = total - len(missing)
    return {
        "score": round((complete / total) * 100) if total else 100,
        "missing": missing,
        "complete": complete,
        "total": total,
    }


def build_ai_context(item: ContentCalendarItem, project: Optional[Project] = None) -> Dict[str, Any]:
    """Build the canonical AI context for a Content Item from its own fields.

    AI never receives a second copy of business context — client/service/project
    stay references resolved by the caller; everything else comes from the
    canonical Content Item itself (brief, body, previous versions, feedback).
    """
    latest_feedback = None
    for review in reversed(item.internal_reviews or []):
        if getattr(review, "feedback", None):
            latest_feedback = review.feedback
            break
    if not latest_feedback:
        for review in reversed(item.client_approvals or []):
            if getattr(review, "feedback", None):
                latest_feedback = review.feedback
                break
    previous_versions = [
        {"version_number": v.version_number, "caption": v.caption, "script": v.script}
        for v in (item.versions or [])
    ]
    return {
        "content_id": item.content_id,
        "title": item.title,
        "platform": item.platform,
        "content_type": item.content_type.value if item.content_type else None,
        "client_id": item.client_id,
        "service_id": item.service_id,
        "project_id": item.project_id,
        "project_name": project.name if project else None,
        "objective": item.objective,
        "target_audience": item.target_audience,
        "key_message": item.key_message,
        "tone": item.tone,
        "brief": item.creative_brief,
        "existing_script": item.script,
        "existing_caption": item.caption,
        "existing_hook": item.hook,
        "existing_cta": item.cta,
        "notes": item.notes,
        "latest_feedback": latest_feedback,
        "previous_versions": previous_versions[-3:],
        "brief_missing_fields": brief_completeness(item)["missing"],
        "status": item.status.value if item.status else None,
    }


# ── Contextual AI actions (reuses the existing AI provider infrastructure) ──
# Every action is SUGGEST-ONLY: the backend returns a draft bound to a target
# field. Writing happens exclusively through the normal authenticated update
# path after the user explicitly Accepts — AI can never transition status,
# approve reviews, publish, or delete.
AI_ACTIONS: Dict[str, Dict[str, Any]] = {
    "generate_hook": {
        "target_field": "hook",
        "stages": ["briefing", "script", "production", "revision_required"],
        "system": (
            "You are a senior social media copywriter inside a content production workspace. "
            "Write one scroll-stopping opening hook line for the given content item. "
            "Use ONLY the provided context; never invent client facts or metrics. "
            "Return the hook line only — no explanations, no quotes around it."
        ),
        "prompt": (
            "Content item context:\n{context_json}\n\n"
            "Write one punchy opening hook (max 15 words) that fits the objective, "
            "audience, key message and tone above."
        ),
    },
    "generate_script": {
        "target_field": "script",
        "stages": ["script", "production", "revision_required"],
        "system": (
            "You are an expert short-form video scriptwriter inside a content production workspace. "
            "Use ONLY the provided context; never invent client facts or metrics. "
            "Return the script only — scene-by-scene plain text, no preamble."
        ),
        "prompt": (
            "Content item context:\n{context_json}\n\n"
            "Write a production-ready script for this {content_type} for {platform}. "
            "Respect the objective, key message, CTA and tone. Keep the existing hook if present."
        ),
    },
    "generate_caption": {
        "target_field": "caption",
        "stages": ["production", "internal_review", "client_review", "revision_required"],
        "system": (
            "You are a social media caption writer inside a content production workspace. "
            "Use ONLY the provided context; never invent client facts or metrics. "
            "Return the caption only — no explanations."
        ),
        "prompt": (
            "Content item context:\n{context_json}\n\n"
            "Write a {platform} caption for this post, aligned with the key message, CTA and tone."
        ),
    },
    "suggest_cta": {
        "target_field": "cta",
        "stages": ["briefing", "script", "production", "revision_required"],
        "system": (
            "You are a conversion copywriter. Use ONLY the provided context. "
            "Return one short call-to-action phrase only — no explanations."
        ),
        "prompt": (
            "Content item context:\n{context_json}\n\n"
            "Suggest one clear call-to-action (max 8 words) that matches the objective and audience."
        ),
    },
    "improve_script": {
        "target_field": "script",
        "stages": ["script", "production", "revision_required"],
        "system": (
            "You are a senior script editor. Improve the existing script while preserving its intent. "
            "Use ONLY the provided context; never invent client facts or metrics. Return the improved script only."
        ),
        "prompt": (
            "Content item context:\n{context_json}\n\n"
            "Existing script:\n{existing_script}\n\n"
            "Rewrite the script to be tighter and more engaging. Address the latest feedback if present."
        ),
    },
    "generate_creative_direction": {
        "target_field": "creative_brief",
        "stages": ["idea", "briefing"],
        "system": (
            "You are a creative director. Use ONLY the provided context; never invent client facts. "
            "Return a concise creative direction outline only — sections with bullet points."
        ),
        "prompt": (
            "Content item context:\n{context_json}\n\n"
            "Draft a short creative direction (visual approach, structure, style references) for this content item."
        ),
    },
    "repurpose_content": {
        "target_field": None,
        "stages": ["approved", "ready_to_publish", "published"],
        "system": (
            "You are a content strategist. Use ONLY the provided context. "
            "Return 3 concrete repurposing ideas as a short numbered list only."
        ),
        "prompt": (
            "Content item context:\n{context_json}\n\n"
            "Suggest 3 ways to repurpose this completed content for other platforms or formats."
        ),
    },
    "client_summary": {
        "target_field": None,
        "stages": ["client_review", "approved"],
        "system": (
            "You are an account manager writing a short client-ready summary of a content deliverable. "
            "Use ONLY the provided context; never invent client facts or metrics. "
            "Return a friendly professional summary of 3-5 sentences only."
        ),
        "prompt": (
            "Content item context:\n{context_json}\n\n"
            "Write a client-ready summary the account manager can send with this deliverable."
        ),
    },
    "analyze_content": {
        "target_field": None,
        "stages": None,  # available at every stage
        "system": (
            "You are a content strategist reviewing a draft. Use ONLY the provided context. "
            "Return a short analysis: strengths, risks, and one concrete improvement, as plain text."
        ),
        "prompt": (
            "Content item context:\n{context_json}\n\n"
            "Analyze this content against its brief and audience. Be specific and practical."
        ),
    },
    "detect_missing_brief": {
        "target_field": None,
        "stages": ["idea", "briefing", "script"],
        "system": (
            "You are a content brief auditor. The context already lists deterministically-missing fields. "
            "Use ONLY the provided context; never invent requirements. "
            "Return 2-4 sentences naming what brief information is missing and why it matters for this specific item."
        ),
        "prompt": (
            "Content item context (brief_missing_fields lists deterministically-missing fields):\n{context_json}\n\n"
            "Explain what brief information is missing for this item and the impact of leaving it empty."
        ),
    },
}

# Convenience map: action -> allowed canonical lifecycle stages (None = all).
AI_ACTION_STAGES: Dict[str, Optional[List[str]]] = {
    action: spec["stages"] for action, spec in AI_ACTIONS.items()
}


async def require_content_capability(current_user: User, *capabilities: str) -> None:
    """Enforce an action-level content capability using the existing RBAC engine.

    Thin wrapper over ``app.api.dependencies.has_capability`` so the service can
    enforce authorization even when the endpoint was reached without a Depends
    chain (and so tests can call the service directly). Admin-family roles keep
    their existing blanket access.
    """
    from app.api.dependencies import has_capability

    role = current_user.role if isinstance(current_user.role, UserRole) else UserRole.from_legacy(str(getattr(current_user, "role", "")))
    if role in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return
    for capability in capabilities:
        if await has_capability(current_user, capability):
            return
    raise HTTPException(
        status_code=http_status.HTTP_403_FORBIDDEN,
        detail=f"Missing capability: {' or '.join(capabilities)}",
    )


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
    ContentItemStatus.READY_TO_PUBLISH: set(),  # Publishing owns execution; status derived from PublishingRecord
    ContentItemStatus.PUBLISHED: set(),  # Terminal — derived from PublishingRecord
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


# ── Notification helper ────────────────────────────────────────────────────

async def _send_content_notification(
    notification_type: "NotificationType",
    title: str,
    message: str,
    recipient_id: str,
    company_id: str,
    content_item: ContentCalendarItem,
    priority: str = "medium",
    dedup_key: Optional[str] = None,
) -> None:
    """Send a notification for a content event. Best-effort — failures are logged but not raised.

    When ``dedup_key`` is supplied it is stored as ``metadata.reminder_key`` so the
    existing unique partial index on notifications suppresses duplicate spam
    (same convention the reminder engine uses).
    """
    try:
        from app.models.notification import Notification, NotificationType as NT
        from app.core.clock import utc_now

        metadata: Dict[str, Any] = {
            "content_id": content_item.content_id,
            "content_title": content_item.title,
            "status": content_item.status.value if content_item.status else None,
        }
        if dedup_key:
            metadata["reminder_key"] = dedup_key

        action_url = f"/content/{str(content_item.id)}"
        notification = Notification(
            user_id=recipient_id,
            company_id=company_id,
            type=notification_type,
            title=title,
            message=message,
            related_id=str(content_item.id),
            related_type="content_item",
            action_url=action_url,
            priority=priority,
            metadata=metadata,
            created_at=utc_now(),
        )
        await notification.insert()
    except Exception:
        pass  # Notification failures (incl. dedup-index rejections) should not block content operations


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
    data = _serialize_item_base(item)
    # Backend-owned lifecycle metadata so every surface (workspace list, item
    # detail, overview) renders the SAME next action — no second frontend map.
    data["next_action"] = next_action_for(item)
    data["brief_completeness"] = brief_completeness(item)
    return data


def _serialize_item_base(item: ContentCalendarItem) -> Dict[str, Any]:
    """Core serialization (fields only, no derived metadata)."""
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

        # Publishing truth: one canonical lookup of publishing records that are
        # published, used consistently for BOTH the tab count and the Published
        # tab list so the count can never disagree with the rows shown.
        published_pub_docs = await ContentPublishingRecordDoc.find(
            ContentPublishingRecordDoc.company_id == company_id,
            ContentPublishingRecordDoc.status == ContentPublishingStatus.PUBLISHED,
        ).to_list()
        published_item_ids = {str(p.content_item_id) for p in published_pub_docs}

        # Compute lifecycle tab counts (from ALL items, before search filter)
        lifecycle_counts = _compute_lifecycle_counts(items)

        # Published tab count is derived from Publishing records. An item whose
        # Content status is still ready_to_publish but whose publishing record is
        # published shows in Published; an item marked published on Content while
        # publishing has not confirmed is NOT counted.
        content_published_ids = {str(i.id) for i in items if i.status == ContentItemStatus.PUBLISHED}
        lifecycle_counts["published"] = len(published_item_ids | (content_published_ids & {str(i.id) for i in items}))

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
                # Published tab = publishing truth (same set as the count above)
                items = [i for i in items if str(i.id) in published_item_ids or i.status == ContentItemStatus.PUBLISHED]
            else:
                items = [i for i in items if i.status.value == status_filter]

        # Compute overview metrics
        all_items_for_metrics = await ContentCalendarItem.find({
            "company_id": company_id,
            "project_id": {"$in": project_ids},
        }).to_list()

        overview = _compute_overview(all_items_for_metrics, now)

        # Business context names for list/card display (batch lookups, no N+1)
        project_name_map = {str(p.id): p.name for p in projects}
        client_ids = {str(i.client_id) for i in items if i.client_id}
        client_name_map: Dict[str, str] = {}
        if client_ids:
            clients = await Client.find({"_id": {"$in": list(client_ids)}, "company_id": company_id}).to_list()
            client_name_map = {str(c.id): getattr(c, "name", None) for c in clients}

        def _with_context(item: ContentCalendarItem) -> Dict[str, Any]:
            data = _serialize_item(item)
            data["project_name"] = project_name_map.get(str(item.project_id))
            data["client_name"] = client_name_map.get(str(item.client_id or ""))
            return data

        return {
            "items": [_with_context(i) for i in items],
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
        await require_content_capability(current_user, CAP_CONTENT_VIEW)
        project = await _load_project(current_user, str(item.project_id))
        result = _serialize_item(item)
        result["project_name"] = project.name
        result["project_key"] = project.project_id

        # Business context (read-only, resolved from canonical relations)
        result["client_name"] = None
        result["service_name"] = None
        result["deliverable_name"] = None
        if item.client_id:
            client = await Client.get(item.client_id)
            if client and str(getattr(client, "company_id", "")) == str(item.company_id):
                result["client_name"] = getattr(client, "name", None)
        if item.service_id:
            service = await ClientService.get(item.service_id)
            if service and str(getattr(service, "company_id", "")) == str(item.company_id):
                result["service_name"] = getattr(service, "name", None)
        if item.deliverable_id:
            deliverable = await ClientDeliverable.get(item.deliverable_id)
            if deliverable and str(getattr(deliverable, "company_id", "")) == str(item.company_id):
                result["deliverable_name"] = getattr(deliverable, "title", None) or getattr(deliverable, "name", None)

        # Publishing truth — always resolved from the canonical publishing
        # record; Content never derives publish state on its own.
        pub = await ContentPublishingRecordDoc.find_one(
            ContentPublishingRecordDoc.content_item_id == str(item.id),
            ContentPublishingRecordDoc.company_id == str(item.company_id),
        )
        if pub:
            result["publishing_record"] = {
                "id": str(pub.id),
                "status": pub.status.value if pub.status else None,
                "platform": pub.platform,
                "account_name": pub.account_name,
                "scheduled_date": pub.scheduled_date,
                "published_date": pub.published_date,
                "external_url": pub.external_url,
                "error_message": pub.error_message,
                "owner_id": pub.owner_id,
                "owner_name": pub.owner_name,
                "approved_version": pub.approved_version,
            }
        else:
            result["publishing_record"] = None
        return {"item": result}

    # ── Create ─────────────────────────────────────────────────────────────

    @staticmethod
    async def create_item(current_user: User, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new content item. Status defaults to IDEA."""
        await require_content_capability(current_user, CAP_CONTENT_CREATE)
        project = await _load_project(current_user, str(payload.get("project_id") or ""))
        now = utc_now()
        company_id = str(project.company_id)

        # Validate relationships if provided
        client_id = payload.get("client_id")
        service_id = payload.get("service_id")
        deliverable_id = payload.get("deliverable_id")
        if client_id or service_id or deliverable_id:
            validation = await ContentProductionService.validate_relationships(
                current_user,
                client_id=client_id,
                service_id=service_id,
                project_id=str(project.id),
                deliverable_id=deliverable_id,
            )
            if not validation["valid"]:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid relationships: {'; '.join(validation['errors'])}",
                )

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
        await require_content_capability(current_user, CAP_CONTENT_EDIT)
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

        # Validate relationships if any are being changed — validation always
        # runs against the item's FINAL state (payload overrides applied).
        if any(k in payload for k in ("client_id", "service_id", "deliverable_id")):
            validation = await ContentProductionService.validate_relationships(
                current_user,
                client_id=item.client_id,
                service_id=item.service_id,
                project_id=str(item.project_id),
                deliverable_id=item.deliverable_id,
            )
            if not validation["valid"]:
                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid relationships: {'; '.join(validation['errors'])}",
                )

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

        # Action-level authorization: generic transitions need content.transition,
        # review-gate moves are additionally gated on their review capability so
        # a creator cannot push an item through someone else's review gate.
        if target == ContentItemStatus.INTERNAL_REVIEW:
            await require_content_capability(current_user, CAP_CONTENT_TRANSITION, CAP_CONTENT_INTERNAL_REVIEW)
        elif target == ContentItemStatus.CLIENT_REVIEW:
            await require_content_capability(current_user, CAP_CONTENT_TRANSITION, CAP_CONTENT_CLIENT_REVIEW)
        elif target == ContentItemStatus.APPROVED:
            await require_content_capability(current_user, CAP_CONTENT_TRANSITION, CAP_CONTENT_CLIENT_REVIEW)
        else:
            await require_content_capability(current_user, CAP_CONTENT_TRANSITION)

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
        # This creates BOTH the embedded record (for backward compat) AND the canonical Document
        if target == ContentItemStatus.READY_TO_PUBLISH:
            now_iso = now.isoformat()
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

            # Create canonical publishing record (Publishing Centre owns this).
            # References are refreshed from Content at handoff so Publishing never
            # holds stale copies; only display-level mirrors (caption/file_urls)
            # are consumed and every other field stays a reference.
            existing_pub = await ContentPublishingRecordDoc.find_one(
                ContentPublishingRecordDoc.content_item_id == str(item.id),
                ContentPublishingRecordDoc.company_id == str(item.company_id),
            )
            handoff_values = {
                "content_id": item.content_id,
                "client_id": item.client_id,
                "service_id": item.service_id,
                "project_id": item.project_id,
                "platform": item.platform,
                "content_type": item.content_type.value if item.content_type else None,
                "caption": item.caption,
                "file_urls": list(item.file_urls or []),
                "approved_version": item.current_version,
                "updated_at": now,
            }
            if not existing_pub:
                pub_record = ContentPublishingRecordDoc(
                    company_id=str(item.company_id),
                    content_item_id=str(item.id),
                    status=ContentPublishingStatus.NOT_STARTED,
                    owner_id=item.owner_id,
                    created_by=str(getattr(current_user, "id", "")),
                    created_at=now,
                    **handoff_values,
                )
                await pub_record.insert()
            else:
                # Reactivating an existing handoff: reset lifecycle, refresh
                # references from Content (single source of truth), never duplicate.
                for field, value in handoff_values.items():
                    setattr(existing_pub, field, value)
                existing_pub.status = ContentPublishingStatus.NOT_STARTED
                existing_pub.updated_at = now
                await existing_pub.save()

            # Record history
            item.history.append(ContentHistoryEntry(
                action="publishing_record_created",
                actor_id=str(getattr(current_user, "id", "")),
                actor_name=_display_name(current_user),
                from_status=None,
                to_status="ready_to_publish",
                details="Publishing record created — Publishing Centre owns execution",
                created_at=now,
            ))

        item.updated_by = str(getattr(current_user, "id", ""))
        item.updated_at = now
        await item.save()

        # Domain event
        event_name = CONTENT_EVENT_MAP.get(target, "ContentUpdated")
        await _publish_event(event_name, item, project, current_user, now)

        # Send notifications for key transitions
        try:
            from app.models.notification import NotificationType as NT

            actor_name = _display_name(current_user)
            content_label = f"{item.content_id or 'Content'}: {item.title}"

            if target == ContentItemStatus.INTERNAL_REVIEW:
                # Notify owner/assignee that review is requested
                reviewer_id = item.owner_id or item.assignee_id
                if reviewer_id and reviewer_id != str(getattr(current_user, "id", "")):
                    await _send_content_notification(
                        NT.CONTENT_REVIEW_REQUESTED,
                        f"Review requested: {content_label}",
                        f"{actor_name} has requested internal review for {content_label}",
                        reviewer_id,
                        str(item.company_id),
                        item,
                        dedup_key=f"content-event:{item.id}:{reviewer_id}:internal_review:{now.date().isoformat()}",
                    )

            elif target == ContentItemStatus.CLIENT_REVIEW:
                # Notify owner that client review is pending
                if item.owner_id and item.owner_id != str(getattr(current_user, "id", "")):
                    await _send_content_notification(
                        NT.CONTENT_REVIEW_REQUESTED,
                        f"Client review: {content_label}",
                        f"{actor_name} has sent {content_label} for client review",
                        item.owner_id,
                        str(item.company_id),
                        item,
                        dedup_key=f"content-event:{item.id}:{item.owner_id}:client_review:{now.date().isoformat()}",
                    )

            elif target == ContentItemStatus.REVISION_REQUIRED:
                # Notify creator/owner that revision is needed
                if item.owner_id and item.owner_id != str(getattr(current_user, "id", "")):
                    await _send_content_notification(
                        NT.CONTENT_REVISION_REQUESTED,
                        f"Revision requested: {content_label}",
                        f"{actor_name} has requested revisions for {content_label}",
                        item.owner_id,
                        str(item.company_id),
                        item,
                        priority="high",
                        dedup_key=f"content-event:{item.id}:{item.owner_id}:revision_required:{now.date().isoformat()}",
                    )

            elif target == ContentItemStatus.READY_TO_PUBLISH:
                # Notify publishing owner (owner of the canonical publishing record)
                pub_owner = item.owner_id
                if pub_owner and pub_owner != str(getattr(current_user, "id", "")):
                    await _send_content_notification(
                        NT.CONTENT_READY_TO_PUBLISH,
                        f"Ready to publish: {content_label}",
                        f"{content_label} is ready for publishing",
                        pub_owner,
                        str(item.company_id),
                        item,
                        dedup_key=f"content-event:{item.id}:{pub_owner}:ready_to_publish:{now.date().isoformat()}",
                    )
        except Exception:
            pass  # Notification failures should not block transitions

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

        await require_content_capability(current_user, CAP_CONTENT_INTERNAL_REVIEW)
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

        await require_content_capability(current_user, CAP_CONTENT_CLIENT_REVIEW)
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
        await require_content_capability(current_user, CAP_CONTENT_EDIT)
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
        await require_content_capability(current_user, CAP_CONTENT_DELETE)
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
        # Company isolation: transitions leak lifecycle info; scope to the item's
        # project company before revealing anything.
        await _load_project(current_user, str(item.project_id))
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

    # ── Publishing Record Management ───────────────────────────────────────

    @staticmethod
    async def get_publishing_record(
        current_user: User,
        item_id: str,
    ) -> Dict[str, Any]:
        """Get the canonical publishing record for a content item."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        await require_content_capability(current_user, CAP_CONTENT_VIEW, CAP_CONTENT_VIEW_PUBLISHING)
        _can_access(current_user, await _load_project(current_user, str(item.project_id)))

        pub = await ContentPublishingRecordDoc.find_one(
            ContentPublishingRecordDoc.content_item_id == item_id,
            ContentPublishingRecordDoc.company_id == str(item.company_id),
        )
        if not pub:
            return {"record": None, "message": "Not yet handed off to Publishing"}

        return {
            "record": {
                "id": str(pub.id),
                "content_item_id": pub.content_item_id,
                "content_id": pub.content_id,
                "platform": pub.platform,
                "account_name": pub.account_name,
                "status": pub.status.value,
                "scheduled_date": pub.scheduled_date,
                "published_date": pub.published_date,
                "external_url": pub.external_url,
                "error_message": pub.error_message,
                "owner_id": pub.owner_id,
                "owner_name": pub.owner_name,
                "created_at": pub.created_at,
                "updated_at": pub.updated_at,
            },
        }

    @staticmethod
    async def update_publishing_status(
        current_user: User,
        item_id: str,
        pub_status: str,
        scheduled_date: Optional[str] = None,
        external_post_id: Optional[str] = None,
        external_url: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Update publishing record status. Called by Publishing Centre."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        # Publishing execution ownership lives with Publishing operators; Content
        # workspace users can read state but only the publishing capability can
        # mutate it.
        await require_content_capability(current_user, CAP_CONTENT_UPDATE_PUBLISHING)
        _can_access(current_user, await _load_project(current_user, str(item.project_id)))

        pub = await ContentPublishingRecordDoc.find_one(
            ContentPublishingRecordDoc.content_item_id == item_id,
            ContentPublishingRecordDoc.company_id == str(item.company_id),
        )
        if not pub:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="No publishing record exists — transition to Ready to Publish first")

        new_status = _parse_enum(ContentPublishingStatus, pub_status, pub.status)
        now = utc_now()

        pub.status = new_status
        pub.updated_at = now
        if scheduled_date:
            pub.scheduled_date = _parse_datetime(scheduled_date)
        if external_post_id:
            pub.external_post_id = external_post_id
        if external_url:
            pub.external_url = external_url
        if error_message:
            pub.error_message = error_message
        pub.updated_by = str(getattr(current_user, "id", ""))
        await pub.save()

        # Mirror back to embedded record on content item
        if item.publishing:
            item.publishing.status = new_status
            item.publishing.updated_at = now
            if pub.scheduled_date:
                item.publishing.scheduled_date = pub.scheduled_date
            if pub.published_date:
                item.publishing.published_date = pub.published_date
            if pub.external_post_id:
                item.publishing.external_post_id = pub.external_post_id
            if pub.external_url:
                item.publishing.external_url = pub.external_url
            if pub.error_message:
                item.publishing.error_message = pub.error_message

        # If published, update content item derived status
        if new_status == ContentPublishingStatus.PUBLISHED:
            item.status = ContentItemStatus.PUBLISHED
            item.completed = True
            item.published_at = now
            item.history.append(ContentHistoryEntry(
                action="published",
                actor_id=str(getattr(current_user, "id", "")),
                actor_name=_display_name(current_user),
                from_status=ContentItemStatus.READY_TO_PUBLISH.value,
                to_status=ContentItemStatus.PUBLISHED.value,
                details=f"Published on {pub.platform or 'unknown platform'}",
                created_at=now,
            ))
        elif new_status == ContentPublishingStatus.FAILED:
            item.history.append(ContentHistoryEntry(
                action="publishing_failed",
                actor_id=str(getattr(current_user, "id", "")),
                actor_name=_display_name(current_user),
                details=f"Publishing failed: {pub.error_message or 'unknown error'}",
                created_at=now,
            ))

        item.updated_at = now
        await item.save()

        # Send notifications for publishing events
        try:
            from app.models.notification import NotificationType as NT

            content_label = f"{item.content_id or 'Content'}: {item.title}"

            if new_status == ContentPublishingStatus.PUBLISHED:
                if item.owner_id and item.owner_id != str(getattr(current_user, "id", "")):
                    await _send_content_notification(
                        NT.CONTENT_PUBLISHED,
                        f"Published: {content_label}",
                        f"{content_label} has been published on {pub.platform or 'the platform'}",
                        item.owner_id,
                        str(item.company_id),
                        item,
                    )
            elif new_status == ContentPublishingStatus.FAILED:
                if item.owner_id:
                    await _send_content_notification(
                        NT.CONTENT_PUBLISHING_FAILED,
                        f"Publishing failed: {content_label}",
                        f"Publishing failed for {content_label}: {pub.error_message or 'unknown error'}",
                        item.owner_id,
                        str(item.company_id),
                        item,
                        priority="high",
                    )
        except Exception:
            pass

        return {"item": _serialize_item(item), "publishing": pub.status.value}

    # ── Comments ───────────────────────────────────────────────────────────

    @staticmethod
    async def list_comments(
        current_user: User,
        item_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """List comments for a content item."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        await require_content_capability(current_user, CAP_CONTENT_VIEW, CAP_CONTENT_COMMENTS)
        _can_access(current_user, await _load_project(current_user, str(item.project_id)))

        company_id = _company_id(current_user)
        query = {
            "company_id": company_id,
            "content_item_id": item_id,
        }
        comments = await ContentComment.find(query).sort("-created_at").skip(offset).limit(limit).to_list()
        total = await ContentComment.find(query).count()

        return {
            "comments": [
                {
                    "id": str(c.id),
                    "content_item_id": c.content_item_id,
                    "user_id": c.user_id,
                    "user_name": c.user_name,
                    "user_role": c.user_role,
                    "text": c.text,
                    "attachments": list(c.attachments or []),
                    "created_at": c.created_at,
                    "updated_at": c.updated_at,
                }
                for c in comments
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    @staticmethod
    async def add_comment(
        current_user: User,
        item_id: str,
        text: str,
        attachments: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Add a comment to a content item."""
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        await require_content_capability(current_user, CAP_CONTENT_COMMENTS)
        _can_access(current_user, await _load_project(current_user, str(item.project_id)))

        company_id = _company_id(current_user)
        now = utc_now()

        comment = ContentComment(
            company_id=company_id,
            content_item_id=item_id,
            user_id=str(getattr(current_user, "id", "")),
            user_name=_display_name(current_user),
            user_role=getattr(current_user, "role", None),
            text=text,
            attachments=attachments or [],
            created_at=now,
        )
        await comment.insert()

        # Record in content history
        item.history.append(ContentHistoryEntry(
            action="comment_added",
            actor_id=str(getattr(current_user, "id", "")),
            actor_name=_display_name(current_user),
            details=text[:200],
            created_at=now,
        ))
        item.updated_at = now
        await item.save()

        return {
            "comment": {
                "id": str(comment.id),
                "content_item_id": comment.content_item_id,
                "user_id": comment.user_id,
                "user_name": comment.user_name,
                "user_role": comment.user_role,
                "text": comment.text,
                "attachments": list(comment.attachments or []),
                "created_at": comment.created_at,
            }
        }

    @staticmethod
    async def delete_comment(
        current_user: User,
        comment_id: str,
    ) -> Dict[str, Any]:
        """Delete a comment (author or admin only)."""
        comment = await ContentComment.get(comment_id)
        if not comment:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Comment not found")

        company_id = _company_id(current_user)
        if str(comment.company_id) != company_id:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Access denied")

        user_id = str(getattr(current_user, "id", ""))
        is_admin = getattr(current_user, "role", None) in (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN)
        if comment.user_id != user_id and not is_admin:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Can only delete your own comments")

        await comment.delete()
        return {"message": "Comment deleted", "id": comment_id}

    # ── Relationship Validation ────────────────────────────────────────────

    @staticmethod
    async def validate_relationships(
        current_user: User,
        client_id: Optional[str] = None,
        service_id: Optional[str] = None,
        project_id: Optional[str] = None,
        deliverable_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Validate that supplied relationships are consistent within the company context.

        Canonical relation: Client → ClientService → Project → ClientDeliverable → Content.
        Every supplied reference must (a) exist in the caller's company and (b) be
        consistent with the other supplied references. Content never creates its
        own copies of these entities — it references canonical records only.
        """
        company_id = _company_id(current_user)
        errors = []

        if client_id:
            client = await Client.get(client_id)
            if not client or str(getattr(client, "company_id", "")) != company_id:
                errors.append("Client not found or belongs to another company")

        if service_id:
            service = await ClientService.get(service_id)
            if not service or str(getattr(service, "company_id", "")) != company_id:
                errors.append("Service not found or belongs to another company")
            elif client_id and str(getattr(service, "client_id", "")) != client_id:
                errors.append("Service does not belong to the selected client")

        if project_id:
            project = await Project.get(project_id)
            if not project or str(getattr(project, "company_id", "")) != company_id:
                errors.append("Project not found or belongs to another company")
            elif client_id and str(getattr(project, "client_id", "")) != client_id:
                errors.append("Project does not belong to the selected client")

        if deliverable_id:
            deliverable = await ClientDeliverable.get(deliverable_id)
            if not deliverable or str(getattr(deliverable, "company_id", "")) != company_id:
                errors.append("Deliverable not found or belongs to another company")
            elif client_id and str(getattr(deliverable, "client_id", "")) != client_id:
                errors.append("Deliverable does not belong to the selected client")
            elif project_id and str(getattr(deliverable, "project_id", "")) != project_id:
                errors.append("Deliverable does not belong to the selected project")
            elif service_id and str(getattr(deliverable, "service_id", "")) != service_id:
                errors.append("Deliverable does not belong to the selected service")

        # Cross checks between non-client references — a deliverable/service pair
        # (or service/project pair) must still agree even when no client is sent.
        if not errors:
            if service_id and project_id:
                service = await ClientService.get(service_id)
                project = await Project.get(project_id)
                if service and project and str(getattr(project, "company_id", "")) == company_id \
                        and str(getattr(service, "company_id", "")) == company_id:
                    linked = [str(pid) for pid in (getattr(service, "linked_project_ids", None) or [])]
                    if linked and project_id not in linked:
                        errors.append("Project is not linked to the selected service")
            if service_id and deliverable_id and not client_id:
                deliverable = await ClientDeliverable.get(deliverable_id)
                if deliverable and str(getattr(deliverable, "company_id", "")) == company_id \
                        and str(getattr(deliverable, "service_id", "")) != service_id:
                    errors.append("Deliverable does not belong to the selected service")

        return {"valid": len(errors) == 0, "errors": errors}

    # ── Published Tab (driven by publishing truth) ─────────────────────────

    @staticmethod
    async def get_published_items(
        current_user: User,
        client_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Get content items that are published — driven by PublishingRecord truth.

        The canonical publishing record is the source of truth: an item is
        "published" when its publishing record has status=published. The Content
        status field is only a derived mirror for lifecycle display.
        """
        await require_content_capability(current_user, CAP_CONTENT_VIEW)
        company_id = _company_id(current_user)

        # Publishing records are the starting point (Publishing owns truth).
        pub_query: Dict[str, Any] = {
            "company_id": company_id,
            "status": ContentPublishingStatus.PUBLISHED.value,
        }
        if client_id:
            pub_query["client_id"] = client_id
        pub_records = await ContentPublishingRecordDoc.find(pub_query).sort("-updated_at").to_list()
        published_item_ids = [str(p.content_item_id) for p in pub_records]

        result_items: List[ContentCalendarItem] = []
        if published_item_ids:
            items = await ContentCalendarItem.find(
                {"_id": {"$in": published_item_ids}, "company_id": company_id}
            ).to_list()
            items_by_id = {str(i.id): i for i in items}
            result_items = [items_by_id[iid] for iid in published_item_ids if iid in items_by_id]

        total = len(result_items)
        page = result_items[offset:offset + limit]

        return {
            "items": [_serialize_item(i) for i in page],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    # ── Content Overview (operational command center) ──────────────────────

    @staticmethod
    async def content_overview(
        current_user: User,
        limit_per_queue: int = 8,
    ) -> Dict[str, Any]:
        """Operational overview aggregate — ONE endpoint powering /content/overview.

        Every metric, queue row, workload bucket, shoot entry, pipeline count,
        and recommendation derives from the canonical Content Items of the
        caller's company. The frontend never computes its own counters; each
        queue carries its own items so the numbers and the rows can never
        disagree, and every row is the same serialized shape the workspace
        uses (including backend next_action) so clicking through opens the
        canonical /content/:itemId detail.
        """
        await require_content_capability(current_user, CAP_CONTENT_VIEW)
        company_id = _company_id(current_user)
        now = utc_now()

        project_query: Dict[str, Any] = {"company_id": company_id, "deleted": {"$ne": True}}
        projects = await Project.find(project_query).to_list()
        project_ids = [str(p.id) for p in projects]
        if not project_ids:
            return _empty_content_overview()

        items = await ContentCalendarItem.find({
            "company_id": company_id,
            "project_id": {"$in": project_ids},
        }).to_list()

        # Batch context lookups (no per-item requests): publishing truth + names.
        pub_docs = await ContentPublishingRecordDoc.find(
            {"company_id": company_id}
        ).to_list()
        pub_by_item = {str(p.content_item_id): p for p in pub_docs}
        client_ids = {str(i.client_id) for i in items if i.client_id}
        client_name_map: Dict[str, str] = {}
        if client_ids:
            clients = await Client.find({"_id": {"$in": list(client_ids)}, "company_id": company_id}).to_list()
            client_name_map = {str(c.id): getattr(c, "name", None) for c in clients}
        project_name_map = {str(p.id): p.name for p in projects}

        def operational_due(item: ContentCalendarItem) -> Optional[datetime]:
            """The item's operational deadline: deadline, then due_date."""
            return item.deadline or item.due_date

        def not_operationally_completed(item: ContentCalendarItem) -> bool:
            """Published/terminal items are historical, never overdue."""
            return not (
                item.completed
                or item.status in (ContentItemStatus.PUBLISHED, ContentItemStatus.READY_TO_PUBLISH)
            )

        def with_context(item: ContentCalendarItem) -> Dict[str, Any]:
            data = _serialize_item(item)
            data["project_name"] = project_name_map.get(str(item.project_id))
            data["client_name"] = client_name_map.get(str(item.client_id or ""))
            return data

        # ── Queues (each carries its own rows so metrics == rows) ───────────
        due_today: List[ContentCalendarItem] = []
        overdue: List[ContentCalendarItem] = []
        for item in items:
            due = operational_due(item)
            if not due or not not_operationally_completed(item):
                continue
            if due.date() == now.date():
                due_today.append(item)
            elif due < now:
                overdue.append(item)

        def sort_by_due(seq: List[ContentCalendarItem]) -> List[ContentCalendarItem]:
            return sorted(seq, key=lambda i: (operational_due(i) or now))

        due_today = sort_by_due(due_today)
        overdue = sort_by_due(overdue)

        awaiting_internal = [
            i for i in items
            if i.status == ContentItemStatus.INTERNAL_REVIEW
        ]
        awaiting_client = [
            i for i in items
            if i.status == ContentItemStatus.CLIENT_REVIEW
        ]
        revision = [i for i in items if i.status == ContentItemStatus.REVISION_REQUIRED]
        ready_to_publish = [i for i in items if i.status == ContentItemStatus.READY_TO_PUBLISH]
        in_production = [
            i for i in items
            if i.status in (ContentItemStatus.PRODUCTION, ContentItemStatus.SCRIPT, ContentItemStatus.BRIEFING)
        ]

        def queue_payload(seq: List[ContentCalendarItem]) -> Dict[str, Any]:
            """Count + first N rows (count is always the FULL queue size)."""
            return {
                "count": len(seq),
                "items": [with_context(i) for i in seq[:limit_per_queue]],
            }

        # ── Production workload by assignee/owner (real assignments only) ──
        workload_map: Dict[str, Dict[str, Any]] = {}
        for item in items:
            if item.completed or item.status == ContentItemStatus.PUBLISHED:
                continue
            owner_key = item.assignee_id or item.owner_id
            if not owner_key:
                owner_key = "__unassigned__"
            bucket = workload_map.setdefault(owner_key, {
                "user_id": None if owner_key == "__unassigned__" else str(owner_key),
                "user_name": item.assignee_name or item.assigned_person or ("Unassigned" if owner_key == "__unassigned__" else None),
                "assigned": 0,
                "due_today": 0,
                "overdue": 0,
                "in_production": 0,
                "awaiting_revision": 0,
                "awaiting_review": 0,
            })
            bucket["assigned"] += 1
            due = operational_due(item)
            if due and not_operationally_completed(item):
                if due.date() == now.date():
                    bucket["due_today"] += 1
                elif due < now:
                    bucket["overdue"] += 1
            if item.status in (ContentItemStatus.PRODUCTION, ContentItemStatus.SCRIPT, ContentItemStatus.BRIEFING):
                bucket["in_production"] += 1
            elif item.status == ContentItemStatus.REVISION_REQUIRED:
                bucket["awaiting_revision"] += 1
            elif item.status in (ContentItemStatus.INTERNAL_REVIEW, ContentItemStatus.CLIENT_REVIEW):
                bucket["awaiting_review"] += 1
        workload = sorted(
            workload_map.values(),
            key=lambda b: (-(b["overdue"] + b["due_today"]), -b["assigned"]),
        )

        # ── Upcoming shoots (canonical production metadata, no new entity) ──
        upcoming_shoots = sorted(
            [
                i for i in items
                if i.shoot_date and i.shoot_date >= now and i.status != ContentItemStatus.PUBLISHED
            ],
            key=lambda i: i.shoot_date,
        )[:limit_per_queue]

        # ── Content pipeline (same canonical lifecycle as the workspace tabs) ─
        lifecycle_counts = _compute_lifecycle_counts(items)
        published_ids = {
            str(p.content_item_id) for p in pub_docs
            if p.status == ContentPublishingStatus.PUBLISHED
        }
        content_published_ids = {str(i.id) for i in items if i.status == ContentItemStatus.PUBLISHED}
        lifecycle_counts["published"] = len(
            published_ids | (content_published_ids & {str(i.id) for i in items})
        )

        # ── Deterministic AI recommendations (rules first — no LLM calls) ───
        recommendations: List[Dict[str, Any]] = []
        missing_cta = [
            i for i in items
            if i.status in (ContentItemStatus.BRIEFING, ContentItemStatus.SCRIPT, ContentItemStatus.PRODUCTION)
            and not str(i.cta or "").strip()
        ]
        if missing_cta:
            recommendations.append({
                "type": "missing_cta",
                "severity": "low",
                "message": f"{len(missing_cta)} item(s) in Briefing/Script/Production are missing a CTA.",
                "item_ids": [str(i.id) for i in missing_cta[:10]],
            })
        due_tomorrow_not_produced = [
            i for i in items
            if i.due_date and now < i.due_date <= now.replace(hour=23, minute=59, second=59) + timedelta(days=1)
            and i.status in (ContentItemStatus.IDEA, ContentItemStatus.BRIEFING)
            and not_operationally_completed(i)
        ]
        if due_tomorrow_not_produced:
            recommendations.append({
                "type": "due_soon_not_in_production",
                "severity": "medium",
                "message": f"{len(due_tomorrow_not_produced)} item(s) due within 48h have not entered Production.",
                "item_ids": [str(i.id) for i in due_tomorrow_not_produced[:10]],
            })
        stale_client_review = [
            i for i in awaiting_client
            if i.client_review_at and (now - i.client_review_at).total_seconds() > 48 * 3600
        ]
        if stale_client_review:
            recommendations.append({
                "type": "client_review_stale",
                "severity": "high",
                "message": f"{len(stale_client_review)} item(s) have been waiting for client approval for more than 48 hours.",
                "item_ids": [str(i.id) for i in stale_client_review[:10]],
            })
        revision_loops = [
            i for i in items
            if len(i.internal_reviews or []) + len(i.client_approvals or []) >= 3
            and i.status != ContentItemStatus.PUBLISHED
        ]
        if revision_loops:
            recommendations.append({
                "type": "revision_loop",
                "severity": "medium",
                "message": f"{len(revision_loops)} item(s) have received 3+ review rounds — consider a direct conversation.",
                "item_ids": [str(i.id) for i in revision_loops[:10]],
            })
        stale_ready = [
            i for i in ready_to_publish
            if i.ready_to_publish_at and (now - i.ready_to_publish_at).total_seconds() > 48 * 3600
        ]
        if stale_ready:
            recommendations.append({
                "type": "ready_to_publish_stale",
                "severity": "medium",
                "message": f"{len(stale_ready)} approved item(s) have been waiting for Publishing for more than 48 hours.",
                "item_ids": [str(i.id) for i in stale_ready[:10]],
            })
        unowned = [
            i for i in items
            if not (i.assignee_id or i.owner_id)
            and i.status != ContentItemStatus.PUBLISHED
            and not i.completed
        ]
        if unowned:
            recommendations.append({
                "type": "unassigned",
                "severity": "medium",
                "message": f"{len(unowned)} active item(s) have no assignee — assign an owner so work is not dropped.",
                "item_ids": [str(i.id) for i in unowned[:10]],
            })

        return {
            "metrics": {
                "total": len(items),
                "due_today": len(due_today),
                "overdue": len(overdue),
                "awaiting_internal_review": len(awaiting_internal),
                "awaiting_client_approval": len(awaiting_client),
                "revision_required": len(revision),
                "ready_to_publish": len(ready_to_publish),
                "in_production": len(in_production),
            },
            "queues": {
                "due_today": queue_payload(due_today),
                "overdue": queue_payload(overdue),
                "awaiting_internal_review": queue_payload(awaiting_internal),
                "awaiting_client_approval": queue_payload(awaiting_client),
                "revision_required": queue_payload(revision),
                "ready_to_publish": queue_payload(ready_to_publish),
            },
            "production_workload": workload,
            "upcoming_shoots": [
                {
                    **with_context(i),
                    "shoot": {
                        "date": i.shoot_date,
                        "location": i.location,
                        "team": list(i.team or []),
                        "assets_required": list(i.assets_required or []),
                        "photographer": i.photographer,
                    },
                }
                for i in upcoming_shoots
            ],
            "lifecycle_counts": lifecycle_counts,
            "recommendations": recommendations,
            "generated_at": now,
        }

    # ── Contextual AI (reuses the existing AI provider infrastructure) ─────

    @staticmethod
    async def ai_action(
        current_user: User,
        item_id: str,
        action: str,
    ) -> Dict[str, Any]:
        """Run a contextual AI action against one canonical Content Item.

        AI is advisory only: it returns a suggestion payload the user must
        explicitly Accept/Regenerate/Discard in the UI. Accepting calls the
        normal PATCH /content/{id} update path — AI itself NEVER mutates the
        Content Item, its lifecycle status, reviews, or publishing state.
        """
        item = await ContentCalendarItem.get(item_id)
        if not item:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Content item not found")
        await require_content_capability(current_user, CAP_CONTENT_VIEW, CAP_CONTENT_EDIT)
        project = await _load_project(current_user, str(item.project_id))

        instructions = AI_ACTIONS.get(action)
        if not instructions:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail=f"Unknown AI action: {action}")

        # Stage gating — show/serve only actions relevant to the lifecycle stage.
        stage = item.status.value if item.status else "idea"
        allowed_stages = AI_ACTION_STAGES.get(action)
        if allowed_stages and stage not in allowed_stages:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Action '{action}' is not available at stage '{stage}'",
            )

        context = build_ai_context(item, project)
        # Defensive relationship resolution — a deleted/invalid client or
        # service reference must never crash the AI action (names are additive
        # context; the canonical references stay on the item).
        client_name = None
        service_name = None
        if item.client_id:
            try:
                client = await Client.get(item.client_id)
                if client and str(getattr(client, "company_id", "")) == str(item.company_id):
                    client_name = getattr(client, "name", None)
            except Exception:
                client_name = None
        if item.service_id:
            try:
                service = await ClientService.get(item.service_id)
                if service and str(getattr(service, "company_id", "")) == str(item.company_id):
                    service_name = getattr(service, "name", None)
            except Exception:
                service_name = None
        context["client_name"] = client_name
        context["service_name"] = service_name

        import json as _json
        import time as _time

        from app.ai.logger import AILogger
        from app.core.config import settings
        from app.ai.providers.groq import GroqProvider
        from app.ai.providers.openai import OpenAIProvider

        provider_name = settings.AI_PROVIDER.lower().strip()
        provider = OpenAIProvider() if provider_name == "openai" else GroqProvider()

        started = _time.perf_counter()
        try:
            result = await provider.generate(
                prompt=instructions["prompt"].format(context_json=_json.dumps(context, default=str)),
                context={"content_context": context},
                options={
                    "system_prompt": instructions["system"],
                    "max_tokens": settings.AI_MAX_TOKENS,
                    "temperature": 0.7,
                },
            )
        except Exception as error:
            try:
                await AILogger.log_interaction(
                    feature=f"content_ai:{action}",
                    role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
                    provider=provider_name,
                    status="fallback",
                    company_id=str(item.company_id),
                    user_id=str(getattr(current_user, "id", "")),
                    target_user_id=None,
                    model=None,
                    prompt_version="content-ai-v1",
                    prompt_role_key="content",
                    prompt=instructions["prompt"],
                    context={"content_context": context, "safe_for_logs": True},
                    raw_response=None,
                    parsed_response=None,
                    latency_ms=round((_time.perf_counter() - started) * 1000, 2),
                    prompt_tokens=None,
                    completion_tokens=None,
                    total_tokens=None,
                    response_size_bytes=0,
                    fallback_used=True,
                    fallback_chain=[provider_name],
                    executed_actions=[],
                    error_message=str(error),
                )
            except Exception:
                pass
            raise HTTPException(
                status_code=http_status.HTTP_502_BAD_GATEWAY,
                detail="AI provider is unavailable. Try again shortly.",
            )

        latency_ms = round((_time.perf_counter() - started) * 1000, 2)
        suggestion_text = (result.content or "").strip()
        target_field = instructions.get("target_field")

        # AI audit trail (same AIInteractionLog surface as every other feature).
        try:
            await AILogger.log_interaction(
                feature=f"content_ai:{action}",
                role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
                provider=provider_name,
                status="success",
                company_id=str(item.company_id),
                user_id=str(getattr(current_user, "id", "")),
                target_user_id=None,
                model=result.model,
                prompt_version="content-ai-v1",
                prompt_role_key="content",
                prompt=instructions["prompt"],
                context={"content_context": context, "safe_for_logs": True},
                raw_response=suggestion_text[:4000],
                parsed_response={"target_field": target_field, "length": len(suggestion_text)},
                latency_ms=latency_ms,
                prompt_tokens=result.prompt_tokens,
                completion_tokens=result.completion_tokens,
                total_tokens=result.total_tokens,
                response_size_bytes=len(suggestion_text.encode("utf-8")),
                fallback_used=False,
                fallback_chain=[],
                executed_actions=[],  # AI never executes actions on Content
            )
        except Exception:
            pass

        return {
            "action": action,
            "content_item_id": str(item.id),
            "target_field": target_field,
            "suggestion": suggestion_text,
            "status": item.status.value if item.status else None,
            "provider": provider_name,
            "model": result.model,
            "note": "Suggestion only — review, edit, then Accept to write it into the Content Item.",
        }

    @staticmethod
    async def ai_suggestions_for_overview(
        current_user: User,
        limit: int = 5,
    ) -> Dict[str, Any]:
        """Deterministic Content recommendations for the overview — NO LLM calls.

        Kept as a separate lightweight endpoint because recommendations must stay
        cheap and reliable; the overview aggregate embeds the same deterministic
        signals directly, so this endpoint is only for polling/refresh.
        """
        result = await ContentProductionService.content_overview(current_user, limit_per_queue=0)
        return {
            "recommendations": result["recommendations"],
            "generated_at": result["generated_at"],
        }


# ── Private helpers ────────────────────────────────────────────────────────

def _empty_aggregate() -> Dict[str, Any]:
    return {
        "items": [],
        "lifecycle_counts": {s.value: 0 for s in CANONICAL_LIFECYCLE},
        "overview": _empty_overview(),
        "projects": [],
    }


def _empty_content_overview() -> Dict[str, Any]:
    """Empty overview payload matching the shape of content_overview()."""
    return {
        "metrics": {
            "total": 0,
            "due_today": 0,
            "overdue": 0,
            "awaiting_internal_review": 0,
            "awaiting_client_approval": 0,
            "revision_required": 0,
            "ready_to_publish": 0,
            "in_production": 0,
        },
        "queues": {
            key: {"count": 0, "items": []}
            for key in (
                "due_today", "overdue", "awaiting_internal_review",
                "awaiting_client_approval", "revision_required", "ready_to_publish",
            )
        },
        "production_workload": [],
        "upcoming_shoots": [],
        "lifecycle_counts": {s.value: 0 for s in CANONICAL_LIFECYCLE},
        "recommendations": [],
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
