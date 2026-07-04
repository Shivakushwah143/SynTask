from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence

from fastapi import HTTPException, status

from app.crm.timeline import publish_crm_timeline_event
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.crm_company import CRMCompany
from app.models.meeting import Meeting
from app.models.sales_contact import SalesContact
from app.models.sales_lead_file import SalesLeadFile
from app.models.sales_lead_note import SalesLeadNote
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.sales_prospect import SalesProspect
from app.models.task import Task
from app.models.user import User, UserRole


ENTITY_TYPES = {"lead", "company", "contact"}
DERIVED_ACTIVITY_TYPES = {"note", "file", "pipeline_change", "meeting"}


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _company_id_for_user(current_user: User) -> str:
    company_id = str(getattr(current_user, "company_id", "") or "").strip()
    if not company_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return company_id


def _can_access_company(current_user: User, company_id: str) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if not current_user.company_id or str(current_user.company_id) != str(company_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _load_user_map(user_ids: Iterable[str], company_id: str) -> Dict[str, str]:
    normalized = {str(user_id) for user_id in user_ids if user_id}
    if not normalized:
        return {}
    users = await User.find({"_id": {"$in": list(normalized)}, "company_id": company_id}).to_list()
    return {str(user.id): _display_name(user, str(user.id)) for user in users}


def _activity_status_value(value: Optional[str]) -> CRMActivityStatus:
    if not value:
        return CRMActivityStatus.DRAFT
    normalized = str(value).strip().lower()
    try:
        return CRMActivityStatus(normalized)
    except Exception:
        return CRMActivityStatus.DRAFT


def _activity_priority_value(value: Optional[str]) -> CRMActivityPriority:
    if not value:
        return CRMActivityPriority.MEDIUM
    normalized = str(value).strip().lower()
    try:
        return CRMActivityPriority(normalized)
    except Exception:
        return CRMActivityPriority.MEDIUM


def _activity_type_value(value: Optional[str]) -> CRMActivityType:
    if not value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Activity type is required")
    normalized = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "followup": CRMActivityType.FOLLOW_UP,
        "follow_up": CRMActivityType.FOLLOW_UP,
        "follow_up_call": CRMActivityType.FOLLOW_UP,
    }
    if normalized in aliases:
        return aliases[normalized]
    try:
        return CRMActivityType(normalized)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown activity type") from exc


def _entity_type_value(value: Optional[str]) -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in ENTITY_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown entity type")
    return normalized


async def _load_lead(current_user: User, lead_id: str) -> SalesProspect:
    lead = await SalesProspect.get(lead_id)
    if not lead or lead.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    if current_user.role != UserRole.SUPER_ADMIN:
        _can_access_company(current_user, str(lead.company_id))
    return lead


async def _load_company(current_user: User, company_id: str) -> CRMCompany:
    company = await CRMCompany.get(company_id)
    if not company or company.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if current_user.role != UserRole.SUPER_ADMIN:
        _can_access_company(current_user, str(company.company_id))
    return company


async def _load_contact(current_user: User, contact_id: str) -> SalesContact:
    contact = await SalesContact.get(contact_id)
    if not contact or contact.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    if current_user.role != UserRole.SUPER_ADMIN:
        _can_access_company(current_user, str(contact.company_id))
    return contact


async def _resolve_entity(current_user: User, entity_type: str, entity_id: str) -> Dict[str, Any]:
    entity_type = _entity_type_value(entity_type)
    if entity_type == "lead":
        lead = await _load_lead(current_user, entity_id)
        return {
            "company_id": str(lead.company_id),
            "entity_id": str(lead.id),
            "entity_type": "lead",
            "entity_label": lead.prospect_name or lead.company_name or str(lead.id),
            "entity_payload": lead,
        }
    if entity_type == "company":
        company = await _load_company(current_user, entity_id)
        return {
            "company_id": str(company.company_id),
            "entity_id": str(company.id),
            "entity_type": "company",
            "entity_label": company.name,
            "entity_payload": company,
        }
    contact = await _load_contact(current_user, entity_id)
    return {
        "company_id": str(contact.company_id),
        "entity_id": str(contact.id),
        "entity_type": "contact",
        "entity_label": contact.full_name(),
        "entity_payload": contact,
    }


def _activity_effective_timestamp(record: CRMActivity) -> datetime:
    return record.scheduled_at or record.due_date or record.completed_at or record.updated_at or record.created_at


def _derived_effective_timestamp(item: Dict[str, Any]) -> datetime:
    return item["timestamp"]


def _derive_category(activity_type: str, source: str = "direct") -> str:
    normalized = str(activity_type or "").lower()
    if normalized in {"meeting"}:
        return "meetings"
    if normalized in {"note", "comment_added", "comment_updated", "comment_deleted"}:
        return "comments"
    if normalized in {"file", "file_uploaded", "file_deleted"}:
        return "files"
    if normalized in {"pipeline_change", "lead_stage_changed"}:
        return "sales"
    if source == "derived" and normalized in {"meeting_scheduled", "meeting_completed"}:
        return "meetings"
    return "sales"


def _activity_item_from_record(
    activity: CRMActivity,
    owner_map: Dict[str, str],
    entity_label: Optional[str] = None,
) -> Dict[str, Any]:
    timestamp = _activity_effective_timestamp(activity)
    return {
        "id": str(activity.id),
        "source": "direct",
        "entity_type": activity.entity_type,
        "entity_id": activity.entity_id,
        "entity_label": entity_label or activity.metadata.get("entity_label") or activity.entity_id,
        "activity_type": activity.activity_type,
        "title": activity.title,
        "description": activity.description,
        "status": activity.status.value if activity.status else CRMActivityStatus.DRAFT.value,
        "priority": activity.priority.value if activity.priority else CRMActivityPriority.MEDIUM.value,
        "owner_id": activity.owner_id,
        "owner_name": owner_map.get(str(activity.owner_id), activity.owner_name or "Unassigned"),
        "due_date": activity.due_date,
        "scheduled_at": activity.scheduled_at,
        "completed_at": activity.completed_at,
        "completed_by": activity.completed_by,
        "completed_by_name": activity.completed_by_name,
        "metadata": activity.metadata or {},
        "created_by": activity.created_by,
        "created_by_name": activity.created_by_name,
        "updated_by": activity.updated_by,
        "updated_by_name": activity.updated_by_name,
        "deleted": bool(activity.deleted),
        "created_at": activity.created_at,
        "updated_at": activity.updated_at,
        "timestamp": timestamp,
        "category": _derive_category(activity.activity_type),
    }


def _derived_item(
    *,
    source_id: str,
    entity_type: str,
    entity_id: str,
    entity_label: str,
    activity_type: str,
    title: str,
    description: Optional[str],
    timestamp: datetime,
    actor_name: str,
    owner_name: Optional[str] = None,
    owner_id: Optional[str] = None,
    status: str = "completed",
    priority: str = "medium",
    due_date: Optional[datetime] = None,
    scheduled_at: Optional[datetime] = None,
    completed_at: Optional[datetime] = None,
    metadata: Optional[Dict[str, Any]] = None,
    source: str = "derived",
) -> Dict[str, Any]:
    return {
        "id": source_id,
        "source": source,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_label": entity_label,
        "activity_type": activity_type,
        "title": title,
        "description": description,
        "status": status,
        "priority": priority,
        "owner_id": owner_id,
        "owner_name": owner_name or actor_name,
        "due_date": due_date,
        "scheduled_at": scheduled_at,
        "completed_at": completed_at or (timestamp if status == "completed" else None),
        "completed_by": owner_id,
        "completed_by_name": owner_name or actor_name,
        "metadata": metadata or {},
        "created_by": owner_id,
        "created_by_name": owner_name or actor_name,
        "updated_by": owner_id,
        "updated_by_name": owner_name or actor_name,
        "deleted": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        "timestamp": timestamp,
        "category": _derive_category(activity_type, source=source),
    }


async def _load_related_context(
    current_user: User,
    company_id: str,
    entity_type: Optional[str],
    entity_id: Optional[str],
) -> Dict[str, Any]:
    entity_filters: Dict[str, Any] = {}
    entity_context: Optional[Dict[str, Any]] = None
    if entity_type and entity_id:
        entity_context = await _resolve_entity(current_user, entity_type, entity_id)
        company_id = entity_context["company_id"]
        entity_filters = {"entity_type": entity_context["entity_type"], "entity_id": entity_context["entity_id"]}

    lead_ids: List[str] = []
    if not entity_context or entity_context["entity_type"] == "company":
        leads = await SalesProspect.find(
            {
                "company_id": company_id,
                "deleted": False,
            }
        ).to_list()
        lead_ids = [str(lead.id) for lead in leads]
    elif entity_context["entity_type"] == "lead":
        lead_ids = [entity_context["entity_id"]]

    contact_ids: List[str] = []
    if entity_context and entity_context["entity_type"] == "contact":
        contact_ids = [entity_context["entity_id"]]

    company_name = entity_context["entity_label"] if entity_context and entity_context["entity_type"] == "company" else None
    return {
        "company_id": company_id,
        "entity_context": entity_context,
        "entity_filters": entity_filters,
        "lead_ids": lead_ids,
        "contact_ids": contact_ids,
        "company_name": company_name,
    }


async def _load_activity_entities(
    company_id: str,
    activities: Sequence[CRMActivity],
    derived_items: Sequence[Dict[str, Any]],
) -> Dict[str, str]:
    lead_ids = {item.entity_id for item in activities if item.entity_type == "lead"}
    company_ids = {item.entity_id for item in activities if item.entity_type == "company"}
    contact_ids = {item.entity_id for item in activities if item.entity_type == "contact"}
    lead_ids.update({item["entity_id"] for item in derived_items if item["entity_type"] == "lead"})
    company_ids.update({item["entity_id"] for item in derived_items if item["entity_type"] == "company"})
    contact_ids.update({item["entity_id"] for item in derived_items if item["entity_type"] == "contact"})

    entity_map: Dict[str, str] = {}
    if lead_ids:
        leads = await SalesProspect.find({"_id": {"$in": list(lead_ids)}, "company_id": company_id}).to_list()
        entity_map.update({str(lead.id): lead.prospect_name or lead.company_name or str(lead.id) for lead in leads})
    if company_ids:
        companies = await CRMCompany.find({"_id": {"$in": list(company_ids)}, "company_id": company_id}).to_list()
        entity_map.update({str(company.id): company.name for company in companies})
    if contact_ids:
        contacts = await SalesContact.find({"_id": {"$in": list(contact_ids)}, "company_id": company_id}).to_list()
        entity_map.update({str(contact.id): contact.full_name() for contact in contacts})
    return entity_map


async def _load_company_lead_ids(company_id: str) -> List[str]:
    leads = await SalesProspect.find({"company_id": company_id, "deleted": False}).to_list()
    return [str(lead.id) for lead in leads]


async def _load_meeting_items(company_id: str, owner_map: Dict[str, str]) -> List[Dict[str, Any]]:
    meetings = await Meeting.find({"company_id": company_id}).sort("-updated_at").to_list()
    items: List[Dict[str, Any]] = []
    for meeting in meetings:
        actor_name = owner_map.get(str(meeting.created_by), "System")
        items.append(
            _derived_item(
                source_id=f"meeting-{meeting.id}",
                entity_type="company",
                entity_id=str(meeting.company_id),
                entity_label="Company meeting",
                activity_type="meeting",
                title=meeting.title or "Meeting scheduled",
                description=meeting.description or meeting.title,
                timestamp=meeting.updated_at or meeting.created_at or meeting.meeting_date,
                actor_name=actor_name,
                owner_name=actor_name,
                owner_id=str(meeting.created_by),
                status=meeting.status.value if getattr(meeting, "status", None) else "scheduled",
                priority="medium",
                metadata={
                    "meeting_date": meeting.meeting_date,
                    "meeting_time": meeting.meeting_time,
                    "duration": meeting.duration,
                    "host_id": meeting.host_id,
                    "participant_ids": meeting.participant_ids,
                },
                source="derived",
            )
        )
    return items


async def _load_note_items(
    company_id: str,
    lead_ids: Sequence[str],
    owner_map: Dict[str, str],
) -> List[Dict[str, Any]]:
    if not lead_ids:
        return []
    notes = await SalesLeadNote.find(
        {
            "company_id": company_id,
            "lead_id": {"$in": list(lead_ids)},
        }
    ).sort("-updated_at").to_list()
    items: List[Dict[str, Any]] = []
    for note in notes:
        actor_name = owner_map.get(str(note.created_by), note.created_by_name or "System")
        items.append(
            _derived_item(
                source_id=f"note-{note.id}",
                entity_type="lead",
                entity_id=str(note.lead_id),
                entity_label=str(note.lead_id),
                activity_type="note",
                title="Note added" if not note.deleted else "Note deleted",
                description=note.content,
                timestamp=note.updated_at or note.created_at,
                actor_name=actor_name,
                owner_name=actor_name,
                owner_id=str(note.created_by),
                status="completed",
                priority="medium",
                metadata={
                    "note_id": str(note.id),
                    "created_by": note.created_by,
                    "updated_by": note.updated_by,
                    "deleted_by": note.deleted_by,
                    "deleted": note.deleted,
                },
            )
        )
    return items


async def _load_file_items(
    company_id: str,
    lead_ids: Sequence[str],
    owner_map: Dict[str, str],
) -> List[Dict[str, Any]]:
    if not lead_ids:
        return []
    files = await SalesLeadFile.find(
        {
            "company_id": company_id,
            "lead_id": {"$in": list(lead_ids)},
        }
    ).sort("-updated_at").to_list()
    items: List[Dict[str, Any]] = []
    for file_record in files:
        actor_name = owner_map.get(str(file_record.uploaded_by), file_record.uploaded_by_name or "System")
        items.append(
            _derived_item(
                source_id=f"file-{file_record.id}",
                entity_type="lead",
                entity_id=str(file_record.lead_id),
                entity_label=str(file_record.lead_id),
                activity_type="file",
                title="File uploaded" if not file_record.deleted else "File deleted",
                description=file_record.original_name or file_record.file_name,
                timestamp=file_record.updated_at or file_record.created_at,
                actor_name=actor_name,
                owner_name=actor_name,
                owner_id=str(file_record.uploaded_by),
                status="completed",
                priority="medium",
                metadata={
                    "file_id": str(file_record.id),
                    "file_name": file_record.file_name,
                    "original_name": file_record.original_name,
                    "file_size": file_record.file_size,
                    "file_type": file_record.file_type,
                    "mime_type": file_record.mime_type,
                    "deleted": file_record.deleted,
                },
            )
        )
    return items


async def _load_pipeline_items(
    company_id: str,
    lead_ids: Sequence[str],
    owner_map: Dict[str, str],
) -> List[Dict[str, Any]]:
    if not lead_ids:
        return []
    histories = await SalesPipelineHistory.find(
        {
            "company_id": company_id,
            "lead_id": {"$in": list(lead_ids)},
        }
    ).sort("-transitioned_at").to_list()
    items: List[Dict[str, Any]] = []
    for history in histories:
        actor_name = owner_map.get(str(history.user_id), history.user_name or "System")
        items.append(
            _derived_item(
                source_id=f"pipeline-{history.id}",
                entity_type="lead",
                entity_id=str(history.lead_id),
                entity_label=str(history.lead_id),
                activity_type="pipeline_change",
                title=f"Stage changed to {history.new_stage}",
                description=(
                    f"Moved from {history.previous_stage or 'Unassigned'} to {history.new_stage}."
                    if history.previous_stage != history.new_stage
                    else f"Stage confirmed as {history.new_stage}."
                ),
                timestamp=history.transitioned_at,
                actor_name=actor_name,
                owner_name=actor_name,
                owner_id=str(history.user_id),
                status="completed",
                priority="medium",
                metadata={
                    "previous_stage": history.previous_stage,
                    "new_stage": history.new_stage,
                    "reason": history.reason,
                    "days_in_previous_stage": history.days_in_previous_stage,
                    "payload": history.payload,
                },
            )
        )
    return items


async def _load_task_items(company_id: str, owner_map: Dict[str, str]) -> List[Dict[str, Any]]:
    tasks = await Task.find({"company_id": company_id}).sort("-updated_at").to_list()
    items: List[Dict[str, Any]] = []
    for task in tasks:
        actor_name = owner_map.get(str(task.created_by), "System")
        timestamp = task.completed_at or task.updated_at or task.due_date or task.created_at
        items.append(
            _derived_item(
                source_id=f"task-{task.id}",
                entity_type="company",
                entity_id=str(task.company_id),
                entity_label=task.title,
                activity_type="task",
                title=task.title,
                description=task.description or task.title,
                timestamp=timestamp,
                actor_name=actor_name,
                owner_name=owner_map.get(str(task.assigned_to), actor_name) if task.assigned_to else actor_name,
                owner_id=str(task.assigned_to or task.created_by),
                status=task.status.value if getattr(task, "status", None) else "todo",
                priority=task.priority.value if getattr(task, "priority", None) else "medium",
                due_date=task.due_date,
                completed_at=task.completed_at,
                metadata={
                    "task_id": str(task.id),
                    "project_id": task.project_id,
                    "project_object_id": task.project_object_id,
                    "assigned_to": task.assigned_to,
                    "assigned_by": task.assigned_by,
                    "tags": task.tags,
                },
            )
        )
    return items


class CRMActivitiesService:
    @staticmethod
    async def list_activities(
        current_user: User,
        *,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        activity_type: Optional[str] = None,
        status_value: Optional[str] = None,
        priority: Optional[str] = None,
        owner_id: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Dict[str, Any]:
        company_id = _company_id_for_user(current_user)
        context = await _load_related_context(current_user, company_id, entity_type, entity_id)
        company_id = context["company_id"]
        entity_context = context["entity_context"]
        lead_ids = context["lead_ids"]

        direct_query: Dict[str, Any] = {
            "company_id": company_id,
            "deleted": False,
        }
        if entity_context and entity_context["entity_type"] in {"lead", "contact"}:
            direct_query["entity_type"] = entity_context["entity_type"]
            direct_query["entity_id"] = entity_context["entity_id"]
        elif entity_type:
            normalized_entity_type = _entity_type_value(entity_type)
            if normalized_entity_type in {"lead", "contact"}:
                direct_query["entity_type"] = normalized_entity_type
                if entity_id:
                    direct_query["entity_id"] = entity_id

        if activity_type:
            direct_query["activity_type"] = _activity_type_value(activity_type).value
        if status_value:
            direct_query["status"] = _activity_status_value(status_value)
        if priority:
            direct_query["priority"] = _activity_priority_value(priority)
        if owner_id:
            direct_query["owner_id"] = owner_id

        direct_activities = await CRMActivity.find(direct_query).sort("-updated_at").to_list()

        owner_ids = {
            str(activity.owner_id)
            for activity in direct_activities
            if getattr(activity, "owner_id", None)
        }
        owner_ids.update(
            {
                str(candidate)
                for activity in direct_activities
                for candidate in [activity.created_by, activity.updated_by, activity.completed_by]
                if candidate
            }
        )

        meeting_records: List[Meeting] = []
        task_records: List[Task] = []
        if not entity_context or entity_context["entity_type"] == "company":
            meeting_records = await Meeting.find({"company_id": company_id}).to_list()
            task_records = await Task.find({"company_id": company_id}).to_list()
            owner_ids.update(
                {
                    str(candidate)
                    for meeting in meeting_records
                    for candidate in [meeting.created_by, meeting.host_id]
                    if candidate
                }
            )
            owner_ids.update(
                {
                    str(candidate)
                    for task in task_records
                    for candidate in [task.created_by, task.assigned_to, task.assigned_by, task.resolved_by]
                    if candidate
                }
            )

        derived_items: List[Dict[str, Any]] = []
        if not entity_context or entity_context["entity_type"] == "company":
            owner_map = await _load_user_map(owner_ids, company_id)
            derived_items.extend(await _load_meeting_items(company_id, owner_map))
            derived_items.extend(await _load_task_items(company_id, owner_map))
            derived_items.extend(await _load_pipeline_items(company_id, lead_ids, owner_map))
            derived_items.extend(await _load_note_items(company_id, lead_ids, owner_map))
            derived_items.extend(await _load_file_items(company_id, lead_ids, owner_map))
        elif entity_context["entity_type"] == "lead":
            owner_map = await _load_user_map(owner_ids, company_id)
            derived_items.extend(await _load_pipeline_items(company_id, lead_ids, owner_map))
            derived_items.extend(await _load_note_items(company_id, lead_ids, owner_map))
            derived_items.extend(await _load_file_items(company_id, lead_ids, owner_map))
        else:
            owner_map = await _load_user_map(owner_ids, company_id)

        entity_map = await _load_activity_entities(company_id, direct_activities, derived_items)

        feed_items: List[Dict[str, Any]] = []
        for activity in direct_activities:
            feed_items.append(_activity_item_from_record(activity, owner_map, entity_map.get(activity.entity_id)))
        for item in derived_items:
            item["entity_label"] = entity_map.get(item["entity_id"], item["entity_label"])
            feed_items.append(item)

        if search:
            query = str(search).strip().lower()
            if query:
                feed_items = [
                    item for item in feed_items
                    if query in str(item.get("title", "")).lower()
                    or query in str(item.get("description", "")).lower()
                    or query in str(item.get("entity_label", "")).lower()
                    or query in str(item.get("owner_name", "")).lower()
                ]

        if date_from or date_to:
            filtered: List[Dict[str, Any]] = []
            for item in feed_items:
                timestamp = item["timestamp"]
                if date_from and timestamp < date_from:
                    continue
                if date_to and timestamp > date_to:
                    continue
                filtered.append(item)
            feed_items = filtered

        feed_items.sort(key=lambda item: item["timestamp"], reverse=True)

        total = len(feed_items)
        page_items = feed_items[skip: skip + limit] if limit else feed_items[skip:]

        summary = {
            "total": total,
            "call": sum(1 for item in feed_items if item["activity_type"] == "call"),
            "meeting": sum(1 for item in feed_items if item["activity_type"] == "meeting"),
            "task": sum(1 for item in feed_items if item["activity_type"] == "task"),
            "email": sum(1 for item in feed_items if item["activity_type"] == "email"),
            "reminder": sum(1 for item in feed_items if item["activity_type"] == "reminder"),
            "follow_up": sum(1 for item in feed_items if item["activity_type"] == "follow_up"),
            "note": sum(1 for item in feed_items if item["activity_type"] == "note"),
            "file": sum(1 for item in feed_items if item["activity_type"] == "file"),
            "pipeline_change": sum(1 for item in feed_items if item["activity_type"] == "pipeline_change"),
            "overdue": sum(
                1
                for item in feed_items
                if item.get("due_date") and item.get("status") != CRMActivityStatus.COMPLETED.value and item["due_date"] < datetime.utcnow()
            ),
            "completed": sum(1 for item in feed_items if item.get("status") == CRMActivityStatus.COMPLETED.value),
            "scheduled": sum(1 for item in feed_items if item.get("status") == CRMActivityStatus.SCHEDULED.value),
            "last_activity_at": feed_items[0]["timestamp"] if feed_items else None,
        }

        grouped_by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for item in page_items:
            grouped_by_day[item["timestamp"].date().isoformat()].append(item)

        return {
            "activities": page_items,
            "total": total,
            "summary": summary,
            "grouped_by_day": [
                {"date": date, "items": items}
                for date, items in sorted(grouped_by_day.items(), key=lambda entry: entry[0], reverse=True)
            ],
            "filters": {
                "entity_type": entity_context["entity_type"] if entity_context else entity_type,
                "entity_id": entity_context["entity_id"] if entity_context else entity_id,
                "company_id": company_id,
                "entity_label": entity_context["entity_label"] if entity_context else None,
            },
        }

    @staticmethod
    async def create_activity(current_user: User, payload: Dict[str, Any]) -> Dict[str, Any]:
        company_id = _company_id_for_user(current_user)
        entity_type = _entity_type_value(payload.get("entity_type"))
        entity_id = str(payload.get("entity_id") or "").strip()
        if not entity_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Entity id is required")

        entity_context = await _resolve_entity(current_user, entity_type, entity_id)
        if entity_context["company_id"] != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        activity_type = _activity_type_value(payload.get("activity_type"))
        now = datetime.utcnow()
        owner_id = str(payload.get("owner_id") or "").strip() or None
        owner_name = None
        if owner_id:
            owner = await User.get(owner_id)
            if owner and (current_user.role == UserRole.SUPER_ADMIN or owner.company_id == company_id):
                owner_name = _display_name(owner, owner_id)
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown owner")

        status_value = _activity_status_value(payload.get("status"))
        priority_value = _activity_priority_value(payload.get("priority"))
        due_date = payload.get("due_date")
        scheduled_at = payload.get("scheduled_at")
        metadata = payload.get("metadata") or {}
        if not isinstance(metadata, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Metadata must be an object")

        activity = CRMActivity(
            company_id=company_id,
            entity_type=entity_type,
            entity_id=str(entity_id),
            activity_type=activity_type.value,
            title=str(payload.get("title") or "").strip() or f"{activity_type.value.replace('_', ' ').title()} activity",
            description=str(payload.get("description") or "").strip() or None,
            status=status_value,
            priority=priority_value,
            owner_id=owner_id,
            owner_name=owner_name,
            due_date=due_date,
            scheduled_at=scheduled_at,
            completed_at=now if status_value == CRMActivityStatus.COMPLETED else None,
            completed_by=str(getattr(current_user, "id", "")) if status_value == CRMActivityStatus.COMPLETED else None,
            completed_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))) if status_value == CRMActivityStatus.COMPLETED else None,
            metadata={
                **metadata,
                "entity_label": entity_context["entity_label"],
            },
            created_by=str(getattr(current_user, "id", "")),
            created_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
            updated_by=str(getattr(current_user, "id", "")),
            updated_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
            created_at=now,
            updated_at=now,
        )
        await activity.insert()

        await publish_crm_timeline_event(
            event_name="CRMActivityCreated",
            aggregate_type=f"crm_{entity_type}",
            aggregate_id=str(entity_id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "activity_id": str(activity.id),
                "company_id": company_id,
                "entity_type": entity_type,
                "entity_id": str(entity_id),
                "activity_type": activity.activity_type,
                "title": activity.title,
                "status": activity.status.value,
                "priority": activity.priority.value,
                "owner_id": activity.owner_id,
                "owner_name": activity.owner_name,
                "due_date": activity.due_date.isoformat() if activity.due_date else None,
                "scheduled_at": activity.scheduled_at.isoformat() if activity.scheduled_at else None,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "activities"},
        )

        owner_map = await _load_user_map([owner_id] if owner_id else [], company_id)
        entity_map = await _load_activity_entities(company_id, [activity], [])
        return {
            "message": "Activity created successfully",
            "activity": _activity_item_from_record(activity, owner_map, entity_map.get(activity.entity_id)),
        }

    @staticmethod
    async def update_activity(current_user: User, activity_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        company_id = _company_id_for_user(current_user)
        activity = await CRMActivity.get(activity_id)
        if not activity or activity.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
        if activity.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        entity_context = await _resolve_entity(current_user, activity.entity_type, activity.entity_id)
        now = datetime.utcnow()

        if "title" in payload:
            title = str(payload.get("title") or "").strip()
            if not title:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
            activity.title = title
        if "description" in payload:
            activity.description = str(payload.get("description") or "").strip() or None
        if "owner_id" in payload:
            owner_id = str(payload.get("owner_id") or "").strip() or None
            owner_name = None
            if owner_id:
                owner = await User.get(owner_id)
                if owner and (current_user.role == UserRole.SUPER_ADMIN or owner.company_id == company_id):
                    owner_name = _display_name(owner, owner_id)
                else:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown owner")
            activity.owner_id = owner_id
            activity.owner_name = owner_name
        if "priority" in payload:
            activity.priority = _activity_priority_value(payload.get("priority"))
        if "status" in payload:
            activity.status = _activity_status_value(payload.get("status"))
        if "due_date" in payload:
            activity.due_date = payload.get("due_date")
        if "scheduled_at" in payload:
            activity.scheduled_at = payload.get("scheduled_at")
        if "snooze_until" in payload:
            snooze_until = payload.get("snooze_until")
            activity.due_date = snooze_until
            activity.scheduled_at = snooze_until
            if snooze_until:
                activity.status = CRMActivityStatus.SCHEDULED
        if "metadata" in payload:
            metadata = payload.get("metadata") or {}
            if not isinstance(metadata, dict):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Metadata must be an object")
            activity.metadata = {**activity.metadata, **metadata}

        if payload.get("complete") is False:
            if activity.status == CRMActivityStatus.COMPLETED:
                activity.status = CRMActivityStatus.SCHEDULED
                activity.completed_at = None
                activity.completed_by = None
                activity.completed_by_name = None
        elif payload.get("complete") is True or activity.status == CRMActivityStatus.COMPLETED:
            activity.status = CRMActivityStatus.COMPLETED
            activity.completed_at = now
            activity.completed_by = str(getattr(current_user, "id", ""))
            activity.completed_by_name = _display_name(current_user, str(getattr(current_user, "id", "system")))

        activity.updated_by = str(getattr(current_user, "id", ""))
        activity.updated_by_name = _display_name(current_user, str(getattr(current_user, "id", "system")))
        activity.updated_at = now
        await activity.save()

        await publish_crm_timeline_event(
            event_name="CRMActivityUpdated",
            aggregate_type=f"crm_{activity.entity_type}",
            aggregate_id=str(activity.entity_id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "activity_id": str(activity.id),
                "company_id": company_id,
                "entity_type": activity.entity_type,
                "entity_id": activity.entity_id,
                "activity_type": activity.activity_type,
                "title": activity.title,
                "status": activity.status.value,
                "priority": activity.priority.value,
                "owner_id": activity.owner_id,
                "owner_name": activity.owner_name,
                "due_date": activity.due_date.isoformat() if activity.due_date else None,
                "scheduled_at": activity.scheduled_at.isoformat() if activity.scheduled_at else None,
                "completed_at": activity.completed_at.isoformat() if activity.completed_at else None,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "activities"},
        )

        owner_map = await _load_user_map([activity.owner_id] if activity.owner_id else [], company_id)
        entity_map = await _load_activity_entities(company_id, [activity], [])
        return {
            "message": "Activity updated successfully",
            "activity": _activity_item_from_record(activity, owner_map, entity_map.get(activity.entity_id)),
        }

    @staticmethod
    async def delete_activity(current_user: User, activity_id: str) -> Dict[str, Any]:
        company_id = _company_id_for_user(current_user)
        activity = await CRMActivity.get(activity_id)
        if not activity or activity.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
        if activity.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        now = datetime.utcnow()
        activity.deleted = True
        activity.deleted_at = now
        activity.deleted_by = str(getattr(current_user, "id", ""))
        activity.deleted_by_name = _display_name(current_user, str(getattr(current_user, "id", "system")))
        activity.updated_by = activity.deleted_by
        activity.updated_by_name = activity.deleted_by_name
        activity.updated_at = now
        await activity.save()

        await publish_crm_timeline_event(
            event_name="CRMActivityDeleted",
            aggregate_type=f"crm_{activity.entity_type}",
            aggregate_id=str(activity.entity_id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "activity_id": str(activity.id),
                "company_id": company_id,
                "entity_type": activity.entity_type,
                "entity_id": activity.entity_id,
                "activity_type": activity.activity_type,
                "title": activity.title,
                "deleted_by": activity.deleted_by,
                "deleted_by_name": activity.deleted_by_name,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "activities"},
        )
        return {
            "message": "Activity deleted successfully",
            "activity_id": str(activity.id),
        }
