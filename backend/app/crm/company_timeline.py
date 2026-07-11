from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import re
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.models.crm_company import CRMCompany
from app.models.crm_activity import CRMActivity
from app.models.sales_contact import SalesContact
from app.models.sales_lead_file import SalesLeadFile
from app.models.sales_lead_note import SalesLeadNote
from app.crm.models import SalesProspect
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.task import Task
from app.models.user import User, UserRole


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


async def _can_access(current_user: User, company: CRMCompany) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if company.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _load_user_map(user_ids: set[str], company_id: str) -> Dict[str, str]:
    if not user_ids:
        return {}
    users = await User.find({"_id": {"$in": list(user_ids)}, "company_id": company_id}).to_list()
    return {str(user.id): _display_name(user) for user in users}


def _event(
    *,
    event_id: str,
    event_type: str,
    title: str,
    description: str,
    timestamp: datetime,
    actor: str,
    metadata: Dict[str, Any],
    category: str = "system",
    expanded: bool = False,
) -> Dict[str, Any]:
    return {
        "id": event_id,
        "type": event_type,
        "category": category,
        "title": title,
        "description": description,
        "timestamp": timestamp,
        "actor": actor,
        "metadata": metadata,
        "expanded": expanded,
    }


def _contact_name(contact: SalesContact) -> str:
    return f"{contact.first_name} {contact.last_name}".strip()


def _lead_name(lead: SalesProspect) -> str:
    return lead.prospect_name or f"{lead.first_name} {lead.last_name}".strip()


def _build_activity_event(activity: CRMActivity, actor_name: str, entity_name: str) -> Dict[str, Any]:
    timestamp = activity.scheduled_at or activity.due_date or activity.completed_at or activity.updated_at or activity.created_at
    category = "sales"
    if activity.activity_type == "meeting":
        category = "meetings"
    elif activity.activity_type == "note":
        category = "comments"
    elif activity.activity_type == "file":
        category = "files"
    return _event(
        event_id=f"activity-{activity.id}",
        event_type=f"crm_activity_{activity.activity_type}",
        title=activity.title,
        description=activity.description or activity.title,
        timestamp=timestamp,
        actor=actor_name,
        metadata={
            "activity_id": str(activity.id),
            "activity_type": activity.activity_type,
            "entity_type": activity.entity_type,
            "entity_id": activity.entity_id,
            "entity_name": entity_name,
            "status": activity.status.value if getattr(activity, "status", None) else None,
            "priority": activity.priority.value if getattr(activity, "priority", None) else None,
            "owner_id": activity.owner_id,
            "owner_name": activity.owner_name,
            "due_date": activity.due_date,
            "scheduled_at": activity.scheduled_at,
            "completed_at": activity.completed_at,
            "metadata": activity.metadata,
        },
        category=category,
        expanded=True,
    )


def _build_task_event(task: Task, actor_name: str) -> Dict[str, Any]:
    timestamp = task.completed_at or task.updated_at or task.due_date or task.created_at
    return _event(
        event_id=f"task-{task.id}",
        event_type="task_activity",
        title=task.title,
        description=task.description or task.title,
        timestamp=timestamp,
        actor=actor_name,
        metadata={
            "task_id": str(task.id),
            "task_status": task.status.value if getattr(task, "status", None) else None,
            "task_priority": task.priority.value if getattr(task, "priority", None) else None,
            "assigned_to": task.assigned_to,
            "due_date": task.due_date,
            "completed_at": task.completed_at,
        },
        category="sales",
        expanded=True,
    )


class CRMCompanyTimelineService:
    @staticmethod
    async def load_timeline(current_user: User, company: CRMCompany) -> Dict[str, Any]:
        await _can_access(current_user, company)

        contacts = await SalesContact.find(
            {
                "company_id": company.company_id,
                "$or": [
                    {"crm_company_id": str(company.id)},
                    {"company_name": {"$regex": f"^{re.escape(company.name)}$", "$options": "i"}},
                ],
            }
        ).sort("-updated_at").to_list()

        leads = await SalesProspect.find(
            {
                "company_id": company.company_id,
                "deleted": False,
                "$or": [
                    {"crm_company_id": str(company.id)},
                    {"company_name": {"$regex": f"^{re.escape(company.name)}$", "$options": "i"}},
                ],
            }
        ).sort("-updated_at").to_list()

        lead_ids = [str(lead.id) for lead in leads]
        histories = await SalesPipelineHistory.find(
            {
                "company_id": company.company_id,
                "lead_id": {"$in": lead_ids},
            }
        ).sort("-transitioned_at").to_list() if lead_ids else []

        notes = await SalesLeadNote.find(
            {
                "company_id": company.company_id,
                "lead_id": {"$in": lead_ids},
                "deleted": False,
            }
        ).sort("-updated_at").to_list() if lead_ids else []

        files = await SalesLeadFile.find(
            {
                "company_id": company.company_id,
                "lead_id": {"$in": lead_ids},
                "deleted": False,
            }
        ).sort("-updated_at").to_list() if lead_ids else []
        tasks = await Task.find(
            {
                "company_id": company.company_id,
            }
        ).sort("-updated_at").to_list()

        actor_ids: set[str] = set()
        for candidate in [company.created_by, company.updated_by, company.deleted_by]:
            if candidate:
                actor_ids.add(str(candidate))
        for contact in contacts:
            for candidate in [contact.created_by, contact.updated_by, contact.deleted_by]:
                if candidate:
                    actor_ids.add(str(candidate))
        for lead in leads:
            for candidate in [lead.created_by, lead.assigned_by, lead.closed_by]:
                if candidate:
                    actor_ids.add(str(candidate))
        for history in histories:
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
        for task in tasks:
            for candidate in [task.created_by, task.assigned_to, task.assigned_by, task.resolved_by]:
                if candidate:
                    actor_ids.add(str(candidate))
        activities = await CRMActivity.find(
            {
                "company_id": company.company_id,
                "deleted": False,
            }
        ).sort("-updated_at").to_list()
        for activity in activities:
            for candidate in [activity.owner_id, activity.created_by, activity.updated_by, activity.completed_by, activity.deleted_by]:
                if candidate:
                    actor_ids.add(str(candidate))

        actor_map = await _load_user_map(actor_ids, company.company_id)
        items: List[Dict[str, Any]] = []

        items.append(
            _event(
                event_id=f"company-created-{company.id}",
                event_type="company_created",
                title="Company created",
                description=f"{company.name} was added to the CRM.",
                timestamp=company.created_at,
                actor=actor_map.get(str(company.created_by), "System"),
                metadata={
                    "company_id": str(company.id),
                    "company_name": company.name,
                    "primary_contact_id": company.primary_contact_id,
                },
                category="system",
                expanded=True,
            )
        )

        if company.updated_at and company.updated_at > company.created_at:
            items.append(
                _event(
                    event_id=f"company-updated-{company.id}-{int(company.updated_at.timestamp())}",
                    event_type="company_updated",
                    title="Company updated",
                    description=f"{company.name} details were updated.",
                    timestamp=company.updated_at,
                    actor=actor_map.get(str(company.updated_by), actor_map.get(str(company.created_by), "System")),
                    metadata={
                        "company_id": str(company.id),
                        "company_name": company.name,
                        "primary_contact_id": company.primary_contact_id,
                    },
                    category="system",
                )
            )

        for contact in contacts:
            created_actor = actor_map.get(str(contact.created_by), "System")
            items.append(
                _event(
                    event_id=f"contact-created-{contact.id}",
                    event_type="contact_created",
                    title="Contact added",
                    description=_contact_name(contact),
                    timestamp=contact.created_at,
                    actor=created_actor,
                    metadata={
                        "contact_id": str(contact.id),
                        "contact_name": _contact_name(contact),
                        "company_id": str(company.id),
                        "is_primary_contact": contact.is_primary_contact,
                        "email": contact.email,
                        "phone": contact.phone,
                    },
                    category="contacts",
                    expanded=True,
                )
            )
            if contact.updated_at and contact.updated_at > contact.created_at:
                items.append(
                    _event(
                        event_id=f"contact-updated-{contact.id}-{int(contact.updated_at.timestamp())}",
                        event_type="contact_updated",
                        title="Contact updated",
                        description=_contact_name(contact),
                        timestamp=contact.updated_at,
                        actor=actor_map.get(str(contact.updated_by), created_actor),
                        metadata={
                            "contact_id": str(contact.id),
                            "contact_name": _contact_name(contact),
                            "company_id": str(company.id),
                            "is_primary_contact": contact.is_primary_contact,
                        },
                        category="contacts",
                    )
                )
            if contact.deleted and contact.deleted_at:
                items.append(
                    _event(
                        event_id=f"contact-deleted-{contact.id}",
                        event_type="contact_deleted",
                        title="Contact deleted",
                        description=_contact_name(contact),
                        timestamp=contact.deleted_at,
                        actor=actor_map.get(str(contact.deleted_by), created_actor),
                        metadata={
                            "contact_id": str(contact.id),
                            "contact_name": _contact_name(contact),
                            "company_id": str(company.id),
                        },
                        category="contacts",
                    )
                )

        for lead in leads:
            lead_name = _lead_name(lead)
            items.append(
                _event(
                    event_id=f"lead-created-{lead.id}",
                    event_type="lead_created",
                    title="Lead created",
                    description=lead_name,
                    timestamp=lead.created_at,
                    actor=actor_map.get(str(lead.created_by), "System"),
                    metadata={
                        "lead_id": str(lead.id),
                        "lead_name": lead_name,
                        "stage": lead.current_stage,
                        "status": lead.status.value if getattr(lead, "status", None) else None,
                    },
                    category="sales",
                    expanded=True,
                )
            )
            if lead.updated_at and lead.updated_at > lead.created_at:
                items.append(
                    _event(
                        event_id=f"lead-updated-{lead.id}-{int(lead.updated_at.timestamp())}",
                        event_type="lead_updated",
                        title="Lead updated",
                        description=lead_name,
                        timestamp=lead.updated_at,
                        actor=actor_map.get(str(lead.assigned_by), actor_map.get(str(lead.created_by), "System")),
                        metadata={
                            "lead_id": str(lead.id),
                            "lead_name": lead_name,
                            "stage": lead.current_stage,
                            "status": lead.status.value if getattr(lead, "status", None) else None,
                            "days_in_stage": lead.days_in_stage,
                        },
                        category="sales",
                    )
                )

        for history in histories:
            items.append(
                _event(
                    event_id=f"lead-stage-{history.id}",
                    event_type="lead_stage_changed",
                    title=f"Stage changed to {history.new_stage}",
                    description=(
                        f"Moved from {history.previous_stage or 'Unassigned'} to {history.new_stage}."
                        if history.previous_stage != history.new_stage
                        else f"Stage confirmed as {history.new_stage}."
                    ),
                    timestamp=history.transitioned_at,
                    actor=actor_map.get(str(history.user_id), history.user_name or "System"),
                    metadata={
                        "lead_id": history.lead_id,
                        "previous_stage": history.previous_stage,
                        "new_stage": history.new_stage,
                        "reason": history.reason,
                        "days_in_previous_stage": history.days_in_previous_stage,
                    },
                    category="sales",
                    expanded=bool(history.reason or history.payload),
                )
            )

        for note in notes:
            items.append(
                _event(
                    event_id=f"lead-note-created-{note.id}",
                    event_type="comment_added",
                    title="Note added",
                    description=note.content,
                    timestamp=note.created_at,
                    actor=actor_map.get(str(note.created_by), note.created_by_name or "System"),
                    metadata={
                        "lead_id": note.lead_id,
                        "note_id": str(note.id),
                        "content": note.content,
                    },
                    category="comments",
                    expanded=True,
                )
            )
            if note.updated_at and note.updated_at > note.created_at:
                items.append(
                    _event(
                        event_id=f"lead-note-updated-{note.id}",
                        event_type="comment_updated",
                        title="Note updated",
                        description=note.content,
                        timestamp=note.edited_at or note.updated_at,
                        actor=actor_map.get(str(note.updated_by), note.updated_by_name or "System"),
                        metadata={
                            "lead_id": note.lead_id,
                            "note_id": str(note.id),
                            "content": note.content,
                        },
                        category="comments",
                    )
                )
            if note.deleted and note.deleted_at:
                items.append(
                    _event(
                        event_id=f"lead-note-deleted-{note.id}",
                        event_type="comment_deleted",
                        title="Note deleted",
                        description=note.content,
                        timestamp=note.deleted_at,
                        actor=actor_map.get(str(note.deleted_by), note.deleted_by_name or "System"),
                        metadata={
                            "lead_id": note.lead_id,
                            "note_id": str(note.id),
                            "content": note.content,
                        },
                        category="comments",
                    )
                )

        for file_record in files:
            items.append(
                _event(
                    event_id=f"lead-file-uploaded-{file_record.id}",
                    event_type="file_uploaded",
                    title="File uploaded",
                    description=file_record.original_name or file_record.file_name,
                    timestamp=file_record.created_at,
                    actor=actor_map.get(str(file_record.uploaded_by), file_record.uploaded_by_name or "System"),
                    metadata={
                        "lead_id": file_record.lead_id,
                        "file_id": str(file_record.id),
                        "file_name": file_record.file_name,
                        "original_name": file_record.original_name,
                        "file_size": file_record.file_size,
                        "file_type": file_record.file_type,
                    },
                    category="files",
                    expanded=True,
                )
            )
            if file_record.deleted and file_record.deleted_at:
                items.append(
                    _event(
                        event_id=f"lead-file-deleted-{file_record.id}",
                        event_type="file_deleted",
                        title="File deleted",
                        description=file_record.original_name or file_record.file_name,
                        timestamp=file_record.deleted_at,
                        actor=actor_map.get(str(file_record.deleted_by), file_record.deleted_by_name or "System"),
                        metadata={
                            "lead_id": file_record.lead_id,
                            "file_id": str(file_record.id),
                            "file_name": file_record.file_name,
                            "original_name": file_record.original_name,
                            "file_size": file_record.file_size,
                            "file_type": file_record.file_type,
                        },
                    category="files",
                )
            )

        for task in tasks:
            items.append(
                _build_task_event(task, actor_map.get(str(task.assigned_to), actor_map.get(str(task.created_by), "System")))
            )

        for activity in activities:
            entity_name = company.name
            if activity.entity_type == "lead":
                match = next((lead for lead in leads if str(lead.id) == activity.entity_id), None)
                entity_name = _lead_name(match) if match else activity.entity_id
            elif activity.entity_type == "contact":
                match_contact = next((contact for contact in contacts if str(contact.id) == activity.entity_id), None)
                entity_name = _contact_name(match_contact) if match_contact else activity.entity_id
            items.append(
                _build_activity_event(
                    activity,
                    actor_map.get(str(activity.created_by), activity.created_by_name or actor_map.get(str(activity.owner_id), "System")),
                    entity_name,
                )
            )

        items.sort(key=lambda item: item["timestamp"], reverse=True)
        grouped_by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for item in items:
            grouped_by_day[item["timestamp"].date().isoformat()].append(item)

        summary = {
            "total": len(items),
            "sales": sum(1 for item in items if item["category"] == "sales"),
            "contacts": sum(1 for item in items if item["category"] == "contacts"),
            "files": sum(1 for item in items if item["category"] == "files"),
            "comments": sum(1 for item in items if item["category"] == "comments"),
            "system": sum(1 for item in items if item["category"] == "system"),
            "last_activity_at": items[0]["timestamp"] if items else None,
        }

        return {
            "company_id": str(company.id),
            "company_name": company.name,
            "items": items,
            "grouped_by_day": [
                {"date": day, "items": day_items}
                for day, day_items in sorted(grouped_by_day.items(), key=lambda entry: entry[0], reverse=True)
            ],
            "summary": summary,
        }
