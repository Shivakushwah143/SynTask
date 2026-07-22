from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.models.sales_lead_file import SalesLeadFile
from app.models.crm_activity import CRMActivity
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.sales_lead_note import SalesLeadNote
from app.crm.models import SalesProspect
from app.models.user import User, UserRole
from app.core.clock import utc_now


def _user_display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


async def _can_access_lead(current_user: User, prospect: SalesProspect) -> bool:
    if current_user.role == UserRole.SUPER_ADMIN:
        return True
    if prospect.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(getattr(current_user, "id", ""))
        if prospect.assigned_to != current_user_id and prospect.assigned_by != current_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return True


async def _load_actor_map(actor_ids: set[str], company_id: str) -> Dict[str, str]:
    if not actor_ids:
        return {}

    actors = await User.find(
        {
            "_id": {"$in": list(actor_ids)},
            "company_id": company_id,
        }
    ).to_list()
    return {str(user.id): _user_display_name(user) for user in actors}


def _category_for_event(event_type: str) -> str:
    if event_type.startswith("comment_"):
        return "comments"
    if event_type in {"lead_created", "lead_updated"}:
        return "system"
    if event_type == "lead_stage_changed":
        return "sales"
    return "system"


def _build_event(
    *,
    event_id: str,
    event_type: str,
    title: str,
    description: str,
    timestamp: datetime,
    actor: str,
    metadata: Dict[str, Any],
    expanded: bool = False,
) -> Dict[str, Any]:
    return {
        "id": event_id,
        "type": event_type,
        "category": _category_for_event(event_type),
        "title": title,
        "description": description,
        "timestamp": timestamp,
        "actor": actor,
        "metadata": metadata,
        "expanded": expanded,
    }


def _build_lead_created_event(prospect: SalesProspect, actor_name: str) -> Dict[str, Any]:
    return _build_event(
        event_id=f"lead-created-{prospect.id}",
        event_type="lead_created",
        title="Lead created",
        description=f"{prospect.prospect_name} entered the CRM workspace.",
        timestamp=prospect.created_at or utc_now(),
        actor=actor_name,
        metadata={
            "company_name": prospect.company_name,
            "contact": prospect.prospect_name,
            "stage": prospect.current_stage,
            "priority": prospect.interest_level.value if getattr(prospect, "interest_level", None) else None,
            "status": prospect.status.value if getattr(prospect, "status", None) else None,
        },
        expanded=True,
    )


def _build_lead_updated_event(prospect: SalesProspect, actor_name: str) -> Optional[Dict[str, Any]]:
    updated_at = prospect.updated_at or prospect.created_at
    if not updated_at or (prospect.created_at and updated_at <= prospect.created_at):
        return None

    return _build_event(
        event_id=f"lead-updated-{prospect.id}-{int(updated_at.timestamp())}",
        event_type="lead_updated",
        title="Lead updated",
        description="Lead details were refreshed in the Sales domain.",
        timestamp=updated_at,
        actor=actor_name,
        metadata={
            "owner": prospect.owner_name or prospect.assigned_to,
            "stage": prospect.current_stage,
            "priority": prospect.interest_level.value if getattr(prospect, "interest_level", None) else None,
            "status": prospect.status.value if getattr(prospect, "status", None) else None,
            "days_in_stage": prospect.days_in_stage,
        },
    )


def _build_stage_event(item: SalesPipelineHistory, actor_name: str) -> Dict[str, Any]:
    return _build_event(
        event_id=f"lead-stage-{item.id}",
        event_type="lead_stage_changed",
        title=f"Stage changed to {item.new_stage}",
        description=(
            f"Moved from {item.previous_stage or 'Unassigned'} to {item.new_stage}."
            if item.previous_stage != item.new_stage
            else f"Stage confirmed as {item.new_stage}."
        ),
        timestamp=item.transitioned_at,
        actor=actor_name,
        metadata={
            "previous_stage": item.previous_stage,
            "new_stage": item.new_stage,
            "reason": item.reason,
            "days_in_previous_stage": item.days_in_previous_stage,
            "payload": item.payload,
        },
        expanded=bool(item.reason or item.payload),
    )


def _build_note_created_event(note: SalesLeadNote, actor_name: str) -> Dict[str, Any]:
    return _build_event(
        event_id=f"lead-note-created-{note.id}",
        event_type="comment_added",
        title="Note added",
        description=note.content,
        timestamp=note.created_at or utc_now(),
        actor=actor_name,
        metadata={
            "note_id": str(note.id),
            "content": note.content,
            "created_by": note.created_by,
            "updated_by": note.updated_by,
            "deleted": note.deleted,
        },
        expanded=True,
    )


def _build_note_updated_event(note: SalesLeadNote, actor_name: str) -> Dict[str, Any]:
    return _build_event(
        event_id=f"lead-note-updated-{note.id}",
        event_type="comment_updated",
        title="Note updated",
        description=note.content,
        timestamp=note.edited_at or note.updated_at or note.created_at or utc_now(),
        actor=actor_name,
        metadata={
            "note_id": str(note.id),
            "content": note.content,
            "created_by": note.created_by,
            "updated_by": note.updated_by,
            "deleted": note.deleted,
        },
        expanded=True,
    )


def _build_note_deleted_event(note: SalesLeadNote, actor_name: str) -> Dict[str, Any]:
    return _build_event(
        event_id=f"lead-note-deleted-{note.id}",
        event_type="comment_deleted",
        title="Note deleted",
        description=note.content,
        timestamp=note.deleted_at or note.updated_at or note.created_at or utc_now(),
        actor=actor_name,
        metadata={
            "note_id": str(note.id),
            "content": note.content,
            "created_by": note.created_by,
            "updated_by": note.updated_by,
            "deleted_by": note.deleted_by,
        },
        expanded=True,
    )


def _build_file_uploaded_event(file_record: SalesLeadFile, actor_name: str) -> Dict[str, Any]:
    return _build_event(
        event_id=f"lead-file-uploaded-{file_record.id}",
        event_type="file_uploaded",
        title="File uploaded",
        description=file_record.original_name or file_record.file_name,
        timestamp=file_record.created_at or utc_now(),
        actor=actor_name,
        metadata={
            "file_id": str(file_record.id),
            "file_name": file_record.file_name,
            "original_name": file_record.original_name,
            "file_url": file_record.file_url,
            "file_size": file_record.file_size,
            "file_type": file_record.file_type,
            "mime_type": file_record.mime_type,
            "uploaded_by": file_record.uploaded_by,
            "uploaded_by_name": file_record.uploaded_by_name,
        },
        expanded=True,
    )


def _build_file_deleted_event(file_record: SalesLeadFile, actor_name: str) -> Dict[str, Any]:
    return _build_event(
        event_id=f"lead-file-deleted-{file_record.id}",
        event_type="file_deleted",
        title="File deleted",
        description=file_record.original_name or file_record.file_name,
        timestamp=file_record.deleted_at or file_record.updated_at or file_record.created_at or utc_now(),
        actor=actor_name,
        metadata={
            "file_id": str(file_record.id),
            "file_name": file_record.file_name,
            "original_name": file_record.original_name,
            "file_url": file_record.file_url,
            "file_size": file_record.file_size,
            "file_type": file_record.file_type,
            "mime_type": file_record.mime_type,
            "deleted_by": file_record.deleted_by,
            "deleted_by_name": file_record.deleted_by_name,
        },
        expanded=True,
    )


def _activity_category(activity_type: str) -> str:
    normalized = str(activity_type or "").lower()
    if normalized == "meeting":
        return "meetings"
    if normalized in {"note"}:
        return "comments"
    if normalized in {"file"}:
        return "files"
    if normalized in {"pipeline_change"}:
        return "sales"
    return "sales"


def _build_activity_event(activity: CRMActivity, actor_name: str) -> Dict[str, Any]:
    timestamp = activity.scheduled_at or activity.due_date or activity.completed_at or activity.updated_at or activity.created_at
    return _build_event(
        event_id=f"lead-activity-{activity.id}",
        event_type=f"crm_activity_{activity.activity_type}",
        title=activity.title,
        description=activity.description or activity.title,
        timestamp=timestamp,
        actor=actor_name,
        metadata={
            "activity_id": str(activity.id),
            "activity_type": activity.activity_type,
            "status": activity.status.value if getattr(activity, "status", None) else None,
            "priority": activity.priority.value if getattr(activity, "priority", None) else None,
            "owner_id": activity.owner_id,
            "owner_name": activity.owner_name,
            "due_date": activity.due_date,
            "scheduled_at": activity.scheduled_at,
            "completed_at": activity.completed_at,
            "metadata": activity.metadata,
        },
        expanded=True,
    )


class CRMLeadTimelineService:
    @staticmethod
    async def load_timeline(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

        await _can_access_lead(current_user, prospect)

        history_items = await SalesPipelineHistory.find(
            {
                "company_id": str(prospect.company_id),
                "lead_id": str(prospect.id),
            }
        ).sort("-transitioned_at").to_list()
        notes = await SalesLeadNote.find(
            {
                "company_id": str(prospect.company_id),
                "lead_id": str(prospect.id),
            }
        ).sort("-updated_at").to_list()
        files = await SalesLeadFile.find(
            {
                "company_id": str(prospect.company_id),
                "lead_id": str(prospect.id),
            }
        ).sort("-updated_at").to_list()
        activities = await CRMActivity.find(
            {
                "company_id": str(prospect.company_id),
                "entity_type": "lead",
                "entity_id": str(prospect.id),
                "deleted": False,
            }
        ).sort("-updated_at").to_list()

        actor_ids: set[str] = set()
        for candidate in [prospect.created_by, prospect.assigned_by, prospect.closed_by]:
            if candidate:
                actor_ids.add(str(candidate))
        for history in history_items:
            if history.user_id:
                actor_ids.add(str(history.user_id))
        for note in notes:
            for candidate in [note.created_by, note.updated_by, note.deleted_by]:
                if candidate:
                    actor_ids.add(str(candidate))
        for file_record in files:
            for candidate in [file_record.uploaded_by, file_record.deleted_by]:
                if candidate:
                    actor_ids.add(str(candidate))
        for activity in activities:
            for candidate in [activity.owner_id, activity.created_by, activity.updated_by, activity.completed_by, activity.deleted_by]:
                if candidate:
                    actor_ids.add(str(candidate))

        actor_map = await _load_actor_map(actor_ids, str(prospect.company_id))

        items: List[Dict[str, Any]] = []
        created_actor = actor_map.get(str(prospect.created_by), "System")
        items.append(_build_lead_created_event(prospect, created_actor))

        updated_event = _build_lead_updated_event(prospect, actor_map.get(str(prospect.assigned_by), created_actor))
        if updated_event:
            items.append(updated_event)

        for history in history_items:
            items.append(_build_stage_event(history, actor_map.get(str(history.user_id), history.user_name or "System")))

        for note in notes:
            note_actor = actor_map.get(str(note.created_by), note.created_by_name or "System")
            items.append(_build_note_created_event(note, note_actor))
            if note.deleted:
                if note.edited_at and note.created_at and note.edited_at > note.created_at:
                    updated_actor = actor_map.get(str(note.updated_by), note.updated_by_name or note_actor)
                    items.append(_build_note_updated_event(note, updated_actor))
                deleted_actor = actor_map.get(str(note.deleted_by), note.deleted_by_name or note_actor)
                items.append(_build_note_deleted_event(note, deleted_actor))
            elif note.updated_at and note.created_at and note.updated_at > note.created_at:
                updated_actor = actor_map.get(str(note.updated_by), note.updated_by_name or note_actor)
                items.append(_build_note_updated_event(note, updated_actor))

        for file_record in files:
            file_actor = actor_map.get(str(file_record.uploaded_by), file_record.uploaded_by_name or "System")
            items.append(_build_file_uploaded_event(file_record, file_actor))
            if file_record.deleted:
                deleted_actor = actor_map.get(str(file_record.deleted_by), file_record.deleted_by_name or file_actor)
                items.append(_build_file_deleted_event(file_record, deleted_actor))

        for activity in activities:
            activity_actor = (
                actor_map.get(str(activity.created_by))
                or actor_map.get(str(activity.updated_by))
                or actor_map.get(str(activity.owner_id))
                or activity.created_by_name
                or activity.updated_by_name
                or activity.owner_name
                or "System"
            )
            items.append(_build_activity_event(activity, activity_actor))

        items.sort(key=lambda item: item["timestamp"], reverse=True)

        grouped_by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for item in items:
            day_key = item["timestamp"].date().isoformat()
            grouped_by_day[day_key].append(item)

        summary = {
            "total": len(items),
            "sales": sum(1 for item in items if item["category"] == "sales"),
            "system": sum(1 for item in items if item["category"] == "system"),
            "meetings": 0,
            "files": sum(1 for item in items if item["category"] == "files"),
            "comments": sum(1 for item in items if item["category"] == "comments"),
            "future_ai": 0,
            "last_activity_at": items[0]["timestamp"] if items else None,
        }

        return {
            "lead_id": str(prospect.id),
            "lead_name": prospect.prospect_name,
            "items": items,
            "grouped_by_day": [
                {
                    "date": day,
                    "items": day_items,
                }
                for day, day_items in sorted(grouped_by_day.items(), key=lambda entry: entry[0], reverse=True)
            ],
            "summary": summary,
        }

