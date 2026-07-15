from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from app.crm.lead_files import CRMLeadFilesService
from app.crm.lead_notes import CRMLeadNotesService
from app.crm.lead_timeline import CRMLeadTimelineService
from app.crm.models import Client
from app.models.crm_activity import CRMActivity, CRMActivityStatus, CRMActivityType
from app.models.crm_company import CRMCompany
from app.models.crm_deal import CRMDeal
from app.models.crm_proposal import CRMProposal
from app.models.meeting import Meeting
from app.models.sales_contact import SalesContact
from app.crm.models import SalesProspect
from app.models.task import Task
from app.models.user import User, UserRole


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _now() -> datetime:
    return datetime.now()


def _normalize_depth(depth: str) -> str:
    normalized = str(depth or "standard").strip().lower()
    if normalized not in {"minimal", "standard", "full"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid context depth")
    return normalized


def _tenant_company_id(current_user: User) -> str:
    company_id = str(getattr(current_user, "company_id", "") or "").strip()
    if current_user.role != UserRole.SUPER_ADMIN and not company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return company_id


def _context_company_id(current_user: User, prospect: SalesProspect) -> str:
    if current_user.role == UserRole.SUPER_ADMIN:
        return str(prospect.company_id or getattr(current_user, "company_id", "") or "")
    return _tenant_company_id(current_user)


def _can_access_lead(current_user: User, prospect: SalesProspect) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if prospect.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(getattr(current_user, "id", ""))
        if prospect.assigned_to != current_user_id and prospect.assigned_by != current_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


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


async def _load_company_map(company_ids: set[str], company_id: str, current_user: User) -> Dict[str, CRMCompany]:
    if not company_ids:
        return {}
    query: Dict[str, Any] = {"_id": {"$in": list(company_ids)}, "deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = company_id
    companies = await CRMCompany.find(query).to_list()
    return {str(company.id): company for company in companies}


async def _load_contact_map(contact_ids: set[str], company_id: str, current_user: User) -> Dict[str, SalesContact]:
    if not contact_ids:
        return {}
    query: Dict[str, Any] = {"_id": {"$in": list(contact_ids)}, "deleted": False}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = company_id
    contacts = await SalesContact.find(query).to_list()
    return {str(contact.id): contact for contact in contacts}


async def _load_related_contacts(current_user: User, prospect: SalesProspect, tenant_id: str, *, limit: int) -> List[Dict[str, Any]]:
    if not prospect.crm_company_id:
        return []
    contacts = await SalesContact.find(
        {
            "company_id": tenant_id,
            "crm_company_id": str(prospect.crm_company_id),
            "deleted": False,
        }
    ).sort("-updated_at").limit(limit).to_list()
    return [
        {
            "id": str(contact.id),
            "first_name": contact.first_name,
            "last_name": contact.last_name,
            "full_name": f"{contact.first_name} {contact.last_name}".strip(),
            "email": contact.email,
            "country_code": contact.country_code,
            "phone": contact.phone,
            "designation": contact.designation,
            "channel": contact.channel,
            "relationship_type": contact.relationship_type,
            "owner_name": contact.owner_name,
            "owner_contact_no": contact.owner_contact_no,
            "tag": contact.tag or [],
            "crm_company_id": contact.crm_company_id,
            "is_primary_contact": contact.is_primary_contact,
            "created_at": contact.created_at,
            "updated_at": contact.updated_at,
        }
        for contact in contacts
    ]


async def _load_deal_context(current_user: User, prospect: SalesProspect, tenant_id: str) -> Dict[str, Any]:
    company_id = tenant_id
    deal = await CRMDeal.find_one({"company_id": company_id, "lead_id": str(prospect.id)})
    if not deal:
        return {"deal": None, "proposals": []}

    proposals = await CRMProposal.find(
        {
            "company_id": company_id,
            "lead_id": str(prospect.id),
        }
    ).sort("-version").to_list()
    return {
        "deal": {
            "id": str(deal.id),
            "company_id": deal.company_id,
            "lead_id": deal.lead_id,
            "contact_id": deal.contact_id,
            "value": deal.value,
            "stage": deal.stage,
            "probability": deal.probability,
            "expected_close_date": deal.expected_close_date,
            "decision_maker": deal.decision_maker,
            "competitors": deal.competitors,
            "negotiation_notes": deal.negotiation_notes,
            "archived": deal.archived,
            "archived_at": deal.archived_at,
            "archived_by": deal.archived_by,
            "created_by": deal.created_by,
            "created_by_name": deal.created_by_name,
            "updated_by": deal.updated_by,
            "updated_by_name": deal.updated_by_name,
            "created_at": deal.created_at,
            "updated_at": deal.updated_at,
        },
        "proposals": [
            {
                "id": str(proposal.id),
                "company_id": proposal.company_id,
                "deal_id": proposal.deal_id,
                "lead_id": proposal.lead_id,
                "contact_id": proposal.contact_id,
                "version": proposal.version,
                "title": proposal.title,
                "summary": proposal.summary,
                "status": proposal.status.value if proposal.status else None,
                "draft_at": proposal.draft_at,
                "sent_at": proposal.sent_at,
                "viewed_at": proposal.viewed_at,
                "accepted_at": proposal.accepted_at,
                "rejected_at": proposal.rejected_at,
                "expired_at": proposal.expired_at,
                "deal_value": proposal.deal_value,
                "expected_close_date": proposal.expected_close_date,
                "probability": proposal.probability,
                "negotiation_notes": proposal.negotiation_notes,
                "competitors": proposal.competitors,
                "decision_maker": proposal.decision_maker,
                "archived": proposal.archived,
                "archived_at": proposal.archived_at,
                "archived_by": proposal.archived_by,
                "created_by": proposal.created_by,
                "created_by_name": proposal.created_by_name,
                "updated_by": proposal.updated_by,
                "updated_by_name": proposal.updated_by_name,
                "created_at": proposal.created_at,
                "updated_at": proposal.updated_at,
            }
            for proposal in proposals
        ],
    }


async def _load_recent_activity_rows(current_user: User, lead_id: str, tenant_id: str, *, limit: int) -> List[Dict[str, Any]]:
    activities = await CRMActivity.find(
        {
            "company_id": tenant_id,
            "entity_type": "lead",
            "entity_id": lead_id,
            "deleted": False,
        }
    ).sort("-updated_at").limit(limit).to_list()
    rows: List[Dict[str, Any]] = []
    for activity in activities:
        rows.append(
            {
                "id": str(activity.id),
                "company_id": activity.company_id,
                "entity_type": activity.entity_type,
                "entity_id": activity.entity_id,
                "activity_type": activity.activity_type,
                "title": activity.title,
                "description": activity.description,
                "status": activity.status.value if getattr(activity, "status", None) else None,
                "priority": activity.priority.value if getattr(activity, "priority", None) else None,
                "owner_id": activity.owner_id,
                "owner_name": activity.owner_name,
                "due_date": activity.due_date,
                "scheduled_at": activity.scheduled_at,
                "completed_at": activity.completed_at,
                "completed_by": activity.completed_by,
                "completed_by_name": activity.completed_by_name,
                "metadata": activity.metadata,
                "created_by": activity.created_by,
                "created_by_name": activity.created_by_name,
                "updated_by": activity.updated_by,
                "updated_by_name": activity.updated_by_name,
                "created_at": activity.created_at,
                "updated_at": activity.updated_at,
            }
        )
    return rows


async def _load_recent_followups(current_user: User, lead_id: str, tenant_id: str, *, limit: int) -> List[Dict[str, Any]]:
    activities = await CRMActivity.find(
        {
            "company_id": tenant_id,
            "entity_type": "lead",
            "entity_id": lead_id,
            "activity_type": CRMActivityType.FOLLOW_UP.value,
            "deleted": False,
        }
    ).sort("-updated_at").limit(limit).to_list()
    return [
        {
            "id": str(activity.id),
            "title": activity.title,
            "description": activity.description,
            "status": activity.status.value if getattr(activity, "status", None) else None,
            "priority": activity.priority.value if getattr(activity, "priority", None) else None,
            "owner_id": activity.owner_id,
            "owner_name": activity.owner_name,
            "due_date": activity.due_date,
            "scheduled_at": activity.scheduled_at,
            "completed_at": activity.completed_at,
            "metadata": activity.metadata,
            "created_at": activity.created_at,
            "updated_at": activity.updated_at,
        }
        for activity in activities
    ]


async def _load_recent_tasks(current_user: User, lead: SalesProspect, tenant_id: str, *, limit: int) -> List[Dict[str, Any]]:
    or_filters: List[Dict[str, Any]] = []
    for field_name in ["assigned_to", "assigned_by", "created_by"]:
        value = getattr(lead, field_name, None)
        if value:
            or_filters.append({field_name: str(value)})
    query: Dict[str, Any] = {"company_id": tenant_id, "deleted": False}
    if or_filters:
        query["$or"] = or_filters
    tasks = await Task.find(query).sort("-updated_at").limit(limit).to_list()
    return [
        {
            "id": str(task.id),
            "title": task.title,
            "description": task.description,
            "company_id": task.company_id,
            "project_id": task.project_id,
            "project_object_id": task.project_object_id,
            "created_by": task.created_by,
            "assigned_to": task.assigned_to,
            "assigned_by": task.assigned_by,
            "status": task.status.value if getattr(task, "status", None) else None,
            "priority": task.priority.value if getattr(task, "priority", None) else None,
            "due_date": task.due_date,
            "completed_at": task.completed_at,
            "tags": task.tags or [],
            "created_at": task.created_at,
            "updated_at": task.updated_at,
        }
        for task in tasks
    ]


async def _load_related_meetings(current_user: User, prospect: SalesProspect, tenant_id: str, *, limit: int) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"company_id": tenant_id}
    if prospect.contact_id:
        query["$or"] = [
            {"participant_ids": prospect.contact_id},
            {"created_by": str(prospect.assigned_to or prospect.created_by or "")},
            {"host_id": str(prospect.assigned_to or prospect.created_by or "")},
        ]
    meetings = await Meeting.find(query).sort("-meeting_date").limit(limit).to_list()
    return [
        {
            "id": str(meeting.id),
            "title": meeting.title,
            "description": meeting.description,
            "meeting_date": meeting.meeting_date,
            "meeting_time": meeting.meeting_time,
            "duration": meeting.duration,
            "status": meeting.status.value if getattr(meeting, "status", None) else None,
            "created_by": meeting.created_by,
            "host_id": meeting.host_id,
            "participant_ids": meeting.participant_ids or [],
            "created_at": meeting.created_at,
            "updated_at": meeting.updated_at,
        }
        for meeting in meetings
    ]


async def _load_client_context(current_user: User, prospect: SalesProspect, tenant_id: str) -> Optional[Dict[str, Any]]:
    if not prospect.crm_company_id:
        return None
    client = await Client.find_one(
        {
            "company_id": tenant_id,
            "company_name": {"$regex": f"^{prospect.company_name or ''}$", "$options": "i"},
        }
    )
    if not client:
        return None
    return {
        "id": str(client.id),
        "name": client.name,
        "company_name": client.company_name,
        "status": client.status.value if getattr(client, "status", None) else None,
        "email": client.email,
        "contact": client.contact,
        "assigned_to": client.assigned_to,
        "project_ids": list(client.project_ids or []),
        "tags": list(client.tags or []),
        "created_at": client.created_at,
        "updated_at": client.updated_at,
    }


class CRMContextBuilder:
    _cache: Dict[Tuple[str, str, str], tuple[datetime, Dict[str, Any]]] = {}
    _cache_ttl = timedelta(seconds=30)

    @classmethod
    def _cache_key(cls, current_user: User, lead_id: str, depth: str) -> Tuple[str, str, str]:
        return (str(getattr(current_user, "id", "")), str(lead_id), depth)

    @classmethod
    def _read_cache(cls, key: Tuple[str, str, str]) -> Optional[Dict[str, Any]]:
        cached = cls._cache.get(key)
        if not cached:
            return None
        expires_at, payload = cached
        if expires_at < _now():
            cls._cache.pop(key, None)
            return None
        return payload

    @classmethod
    def _write_cache(cls, key: Tuple[str, str, str], payload: Dict[str, Any]) -> None:
        cls._cache[key] = (_now() + cls._cache_ttl, payload)

    @staticmethod
    def _deterministic_context(payload: Dict[str, Any]) -> Dict[str, Any]:
        return {
            key: payload[key]
            for key in sorted(payload.keys())
        }

    @staticmethod
    def _lead_identity(prospect: SalesProspect) -> Dict[str, Any]:
        return {
            "id": str(prospect.id),
            "company_id": prospect.company_id,
            "contact_id": prospect.contact_id,
            "company_name": prospect.company_name,
            "crm_company_id": prospect.crm_company_id,
            "prospect_name": prospect.prospect_name,
            "first_name": prospect.first_name,
            "last_name": prospect.last_name,
            "phone": prospect.phone,
            "country_code": prospect.country_code,
            "email": prospect.email,
            "status": prospect.status.value if getattr(prospect, "status", None) else None,
            "current_stage": prospect.current_stage,
            "source": prospect.source,
            "assigned_to": prospect.assigned_to,
            "assigned_by": prospect.assigned_by,
            "owner_name": prospect.owner_name,
            "owner_contact_no": prospect.owner_contact_no,
            "interest_level": prospect.interest_level.value if getattr(prospect, "interest_level", None) else None,
            "created_at": prospect.created_at,
            "updated_at": prospect.updated_at,
            "stage_entered_at": prospect.stage_entered_at,
            "stage_last_changed_at": prospect.stage_last_changed_at,
            "days_in_stage": prospect.days_in_stage,
            "closed_date": prospect.closed_date,
            "closed_by": prospect.closed_by,
            "reason_for_lost": prospect.reason_for_lost,
            "won_amount": prospect.won_amount,
        }

    @classmethod
    async def build_lead_context(
        cls,
        current_user: User,
        lead_id: str,
        *,
        depth: str = "standard",
    ) -> Dict[str, Any]:
        depth = _normalize_depth(depth)
        cache_key = cls._cache_key(current_user, lead_id, depth)
        cached = cls._read_cache(cache_key)
        if cached:
            return cached

        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        _can_access_lead(current_user, prospect)

        lead_company_id = str(prospect.crm_company_id) if prospect.crm_company_id else ""
        tenant_id = _context_company_id(current_user, prospect)

        company = None
        contact = None
        client = None
        if lead_company_id:
            company = await CRMCompany.get(lead_company_id)
            if company and company.deleted:
                company = None
            if company and current_user.role != UserRole.SUPER_ADMIN and company.company_id != tenant_id:
                company = None
        if prospect.contact_id:
            contact = await SalesContact.get(prospect.contact_id)
            if contact and contact.deleted:
                contact = None
            if contact and current_user.role != UserRole.SUPER_ADMIN and contact.company_id != tenant_id:
                contact = None
        if prospect.crm_company_id:
            client = await _load_client_context(current_user, prospect, tenant_id)

        company_map = await _load_company_map({lead_company_id} if lead_company_id else set(), tenant_id, current_user)
        contact_map = await _load_contact_map({str(prospect.contact_id)} if prospect.contact_id else set(), tenant_id, current_user)
        user_ids = {
            str(candidate)
            for candidate in [
                prospect.assigned_to,
                prospect.assigned_by,
                prospect.created_by,
                prospect.closed_by,
                getattr(contact, "created_by", None) if contact else None,
                getattr(contact, "updated_by", None) if contact else None,
            ]
            if candidate
        }
        user_map = await _load_user_map(user_ids, tenant_id)

        timeline_depth = 25 if depth == "minimal" else 75 if depth == "standard" else 250
        notes_depth = 5 if depth == "minimal" else 20 if depth == "standard" else 100
        files_depth = 5 if depth == "minimal" else 20 if depth == "standard" else 100
        activities_depth = 5 if depth == "minimal" else 20 if depth == "standard" else 100
        tasks_depth = 5 if depth == "minimal" else 20 if depth == "standard" else 100
        meetings_depth = 3 if depth == "minimal" else 10 if depth == "standard" else 50

        lead_context = cls._lead_identity(prospect)
        lead_context["owner_name"] = user_map.get(str(prospect.assigned_to), prospect.owner_name or prospect.assigned_to)
        lead_context["assigned_by_name"] = user_map.get(str(prospect.assigned_by), prospect.assigned_by)
        lead_context["created_by_name"] = user_map.get(str(prospect.created_by), prospect.created_by)
        lead_context["closed_by_name"] = user_map.get(str(prospect.closed_by), prospect.closed_by)

        notes = await CRMLeadNotesService.list_notes(current_user, lead_id)
        files = await CRMLeadFilesService.list_files(current_user, lead_id)
        timeline = await CRMLeadTimelineService.load_timeline(current_user, lead_id)
        deal_context = await _load_deal_context(current_user, prospect, tenant_id)
        related_contacts = await _load_related_contacts(current_user, prospect, tenant_id, limit=timeline_depth if depth == "full" else 10)
        recent_activities = await _load_recent_activity_rows(current_user, lead_id, tenant_id, limit=activities_depth)
        recent_followups = await _load_recent_followups(current_user, lead_id, tenant_id, limit=tasks_depth)
        recent_tasks = await _load_recent_tasks(current_user, prospect, tenant_id, limit=tasks_depth)
        related_meetings = await _load_related_meetings(current_user, prospect, tenant_id, limit=meetings_depth)

        company_payload = None
        if company:
            primary_contact_name = None
            if company.primary_contact_id:
                company_primary_contact = contact_map.get(str(company.primary_contact_id))
                if company_primary_contact:
                    primary_contact_name = f"{company_primary_contact.first_name} {company_primary_contact.last_name}".strip()
            company_payload = {
                "id": str(company.id),
                "name": company.name,
                "email": company.email,
                "phone": company.phone,
                "website": company.website,
                "industry": company.industry,
                "company_size": company.company_size,
                "notes": company.notes,
                "primary_contact_id": company.primary_contact_id,
                "primary_contact_name": primary_contact_name,
                "created_by": company.created_by,
                "updated_by": company.updated_by,
                "created_at": company.created_at,
                "updated_at": company.updated_at,
            }

        contact_payload = None
        if contact:
            contact_payload = {
                "id": str(contact.id),
                "first_name": contact.first_name,
                "last_name": contact.last_name,
                "full_name": f"{contact.first_name} {contact.last_name}".strip(),
                "country_code": contact.country_code,
                "phone": contact.phone,
                "email": contact.email,
                "designation": contact.designation,
                "channel": contact.channel,
                "relationship_type": contact.relationship_type,
                "owner_name": contact.owner_name,
                "owner_contact_no": contact.owner_contact_no,
                "tag": contact.tag or [],
                "crm_company_id": contact.crm_company_id,
                "company_name": contact.company_name,
                "is_primary_contact": contact.is_primary_contact,
                "created_by": contact.created_by,
                "updated_by": contact.updated_by,
                "created_at": contact.created_at,
                "updated_at": contact.updated_at,
            }

        context = {
            "schema_version": "1.0",
            "generated_at": _now(),
            "tenant": {
                "company_id": tenant_id,
                "user_id": str(getattr(current_user, "id", "")),
                "user_role": current_user.role.value if getattr(current_user, "role", None) else None,
                "permissions": {
                    "can_view": True,
                    "can_write": current_user.role in {UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}
                    or prospect.assigned_to == str(getattr(current_user, "id", "")),
                },
            },
            "lead": lead_context,
            "source_information": {
                "source": prospect.source,
                "channel": prospect.channel,
                "relationship_type": prospect.relationship_type,
                "category_id": prospect.category_id,
                "contact_id": prospect.contact_id,
                "crm_company_id": prospect.crm_company_id,
            },
            "assignment_information": {
                "assigned_to": prospect.assigned_to,
                "assigned_to_name": lead_context["owner_name"],
                "assigned_by": prospect.assigned_by,
                "assigned_by_name": lead_context["assigned_by_name"],
                "current_stage": prospect.current_stage,
                "days_in_stage": prospect.days_in_stage,
            },
            "company": company_payload,
            "contact": contact_payload,
            "related_contacts": related_contacts if depth != "minimal" else related_contacts[:3],
            "deal": deal_context["deal"],
            "proposals": deal_context["proposals"],
            "notes": notes,
            "files": files,
            "recent_activities": recent_activities,
            "recent_follow_ups": recent_followups,
            "recent_tasks": recent_tasks,
            "recent_meetings": related_meetings,
            "timeline": timeline if depth != "minimal" else {
                "lead_id": timeline["lead_id"],
                "lead_name": timeline["lead_name"],
                "summary": timeline["summary"],
                "grouped_by_day": timeline["grouped_by_day"][:3],
                "items": timeline["items"][:timeline_depth],
            },
        }

        if depth == "minimal":
            context["notes"] = {"lead_id": lead_id, "lead_name": prospect.prospect_name, "notes": notes.get("notes", [])[:3], "total": notes.get("total", 0)}
            context["files"] = {"lead_id": lead_id, "lead_name": prospect.prospect_name, "files": files.get("files", [])[:3], "total": files.get("total", 0)}

        normalized_context = cls._deterministic_context(context)
        cls._write_cache(cache_key, normalized_context)
        return normalized_context

    @staticmethod
    async def invalidate_lead_context(lead_id: str) -> None:
        stale_keys = [key for key in CRMContextBuilder._cache if key[1] == str(lead_id)]
        for key in stale_keys:
            CRMContextBuilder._cache.pop(key, None)

