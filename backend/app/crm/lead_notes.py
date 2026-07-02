from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from app.crm.timeline import publish_crm_timeline_event
from app.models.sales_lead_note import SalesLeadNote
from app.models.sales_prospect import SalesProspect
from app.models.user import User, UserRole


def _company_id_for_lead(current_user: User, prospect: SalesProspect) -> str:
    company_id = str(getattr(prospect, "company_id", None) or getattr(current_user, "company_id", None) or "").strip()
    if not company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return company_id


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _can_access_lead(current_user: User, prospect: SalesProspect) -> bool:
    if current_user.role == UserRole.SUPER_ADMIN:
        return True
    if prospect.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(getattr(current_user, "id", ""))
        if prospect.assigned_to != current_user_id and prospect.assigned_by != current_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return True


async def _load_user_map(user_ids: set[str], company_id: str) -> Dict[str, str]:
    if not user_ids:
        return {}
    users = await User.find(
        {
            "_id": {"$in": list(user_ids)},
            "company_id": company_id,
        }
    ).to_list()
    return {str(user.id): _display_name(user, str(user.id)) for user in users}


def _serialize_note(note: SalesLeadNote, user_map: Dict[str, str]) -> Dict[str, Any]:
    return {
        "id": str(note.id),
        "lead_id": note.lead_id,
        "company_id": note.company_id,
        "content": note.content,
        "created_by": note.created_by,
        "created_by_name": user_map.get(str(note.created_by), note.created_by_name or note.created_by),
        "updated_by": note.updated_by,
        "updated_by_name": user_map.get(str(note.updated_by), note.updated_by_name or note.updated_by),
        "deleted_by": note.deleted_by,
        "deleted_by_name": user_map.get(str(note.deleted_by), note.deleted_by_name or note.deleted_by),
        "is_edited": bool(note.is_edited),
        "deleted": bool(note.deleted),
        "deleted_at": note.deleted_at,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
    }


async def _load_note(current_user: User, lead_id: str, note_id: str) -> tuple[SalesProspect, SalesLeadNote, str]:
    prospect = await SalesProspect.get(lead_id)
    if not prospect or prospect.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    _can_access_lead(current_user, prospect)
    note = await SalesLeadNote.get(note_id)
    if not note or note.deleted or note.lead_id != str(prospect.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    if note.company_id != prospect.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    company_id = _company_id_for_lead(current_user, prospect)
    return prospect, note, company_id


class CRMLeadNotesService:
    @staticmethod
    async def list_notes(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        _can_access_lead(current_user, prospect)

        company_id = _company_id_for_lead(current_user, prospect)
        notes = await SalesLeadNote.find(
            {
                "company_id": company_id,
                "lead_id": str(prospect.id),
                "deleted": False,
            }
        ).sort("-updated_at").to_list()

        user_ids = {
            str(user_id)
            for note in notes
            for user_id in [note.created_by, note.updated_by]
            if user_id
        }
        user_map = await _load_user_map(user_ids, company_id)

        return {
            "lead_id": str(prospect.id),
            "lead_name": prospect.prospect_name,
            "notes": [_serialize_note(note, user_map) for note in notes],
            "total": len(notes),
        }

    @staticmethod
    async def create_note(current_user: User, lead_id: str, content: str) -> Dict[str, Any]:
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        _can_access_lead(current_user, prospect)

        content_clean = (content or "").strip()
        if not content_clean:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Note content is required")

        company_id = _company_id_for_lead(current_user, prospect)
        now = datetime.utcnow()
        note = SalesLeadNote(
            lead_id=str(prospect.id),
            company_id=company_id,
            content=content_clean,
            created_by=str(getattr(current_user, "id", "")),
            created_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
            updated_by=str(getattr(current_user, "id", "")),
            updated_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
            created_at=now,
            updated_at=now,
        )
        await note.insert()

        await publish_crm_timeline_event(
            event_name="LeadNoteCreated",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(prospect.id),
                "note_id": str(note.id),
                "content": note.content,
                "company_id": company_id,
                "created_by": note.created_by,
                "created_by_name": note.created_by_name,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "notes"},
        )

        user_map = await _load_user_map({user_id for user_id in [note.created_by, note.updated_by] if user_id}, company_id)
        return {
            "message": "Note created successfully",
            "note": _serialize_note(note, user_map),
        }

    @staticmethod
    async def update_note(current_user: User, lead_id: str, note_id: str, content: str) -> Dict[str, Any]:
        prospect, note, company_id = await _load_note(current_user, lead_id, note_id)
        content_clean = (content or "").strip()
        if not content_clean:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Note content is required")

        now = datetime.utcnow()
        note.content = content_clean
        note.is_edited = True
        note.edited_at = now
        note.updated_by = str(getattr(current_user, "id", ""))
        note.updated_by_name = _display_name(current_user, str(getattr(current_user, "id", "system")))
        note.updated_at = now
        await note.save()

        await publish_crm_timeline_event(
            event_name="LeadNoteUpdated",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(prospect.id),
                "note_id": str(note.id),
                "content": note.content,
                "company_id": company_id,
                "updated_by": note.updated_by,
                "updated_by_name": note.updated_by_name,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "notes"},
        )

        user_map = await _load_user_map({user_id for user_id in [note.created_by, note.updated_by, note.deleted_by] if user_id}, company_id)
        return {
            "message": "Note updated successfully",
            "note": _serialize_note(note, user_map),
        }

    @staticmethod
    async def delete_note(current_user: User, lead_id: str, note_id: str) -> Dict[str, Any]:
        prospect, note, company_id = await _load_note(current_user, lead_id, note_id)
        now = datetime.utcnow()
        note.deleted = True
        note.deleted_at = now
        note.deleted_by = str(getattr(current_user, "id", ""))
        note.deleted_by_name = _display_name(current_user, str(getattr(current_user, "id", "system")))
        note.updated_by = note.deleted_by
        note.updated_by_name = note.deleted_by_name
        note.updated_at = now
        await note.save()

        await publish_crm_timeline_event(
            event_name="LeadNoteDeleted",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(prospect.id),
                "note_id": str(note.id),
                "company_id": company_id,
                "deleted_by": note.deleted_by,
                "deleted_by_name": note.deleted_by_name,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "notes"},
        )

        user_map = await _load_user_map({user_id for user_id in [note.created_by, note.updated_by, note.deleted_by] if user_id}, company_id)
        return {
            "message": "Note deleted successfully",
            "note": _serialize_note(note, user_map),
        }
