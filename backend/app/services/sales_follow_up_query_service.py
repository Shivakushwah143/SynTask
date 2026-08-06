from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from app.models.crm_activity import CRMActivity
from app.models.sales_prospect import SalesProspect
from app.models.user import User
from app.core.clock import utc_now
from app.core.rbac_visibility import build_visibility_query


def _format_phone(country: Optional[str], phone: Optional[str]) -> Dict[str, Optional[str]]:
    phone_val = phone or None
    country_val = country or None
    if not phone_val:
        return {"phone": None, "country_code": country_val, "formatted_phone": None}
    formatted = f"{country_val or ''} {phone_val}".strip()
    return {"phone": phone_val, "country_code": country_val, "formatted_phone": formatted}


async def query_follow_ups(
    current_user: User,
    *,
    start_at: datetime,
    end_at: datetime,
    owner_ids: Optional[Iterable[str]] = None,
    statuses: Optional[Iterable[str]] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Query CRM follow_up activities within a date range respecting RBAC.

    Returns normalized follow-up DTOs suitable for calendar and dashboard.
    """
    base_query: Dict[str, Any] = {
        "company_id": current_user.company_id,
        "activity_type": "follow_up",
        "deleted": False,
        "$or": [
            {"scheduled_at": {"$gte": start_at, "$lte": end_at}},
            {"due_date": {"$gte": start_at, "$lte": end_at}},
        ],
    }

    if owner_ids:
        base_query["owner_id"] = {"$in": [str(o) for o in owner_ids if o]}

    if statuses:
        base_query["status"] = {"$in": [s for s in statuses if s]}

    # Enforce RBAC + tenant visibility using shared helper
    query = await build_visibility_query(
        current_user,
        ownership_fields=("owner_id",),
        base_query=base_query,
        company_field="company_id",
        include_self=True,
    )

    cursor = CRMActivity.find(query).sort("scheduled_at")
    if limit:
        cursor = cursor.limit(limit)
    activities = await cursor.to_list()

    # Batch-load leads and owners
    lead_ids = {a.entity_id for a in activities if a.entity_type == "lead" and a.entity_id}
    leads_map: Dict[str, SalesProspect] = {}
    if lead_ids:
        db_leads = await SalesProspect.find({"_id": {"$in": list(lead_ids)}, "company_id": current_user.company_id, "deleted": False}).to_list()
        leads_map = {str(l.id): l for l in db_leads}

    owner_ids_set = {a.owner_id for a in activities if a.owner_id}
    owners_map: Dict[str, str] = {}
    if owner_ids_set:
        owner_objs = await User.find({"_id": {"$in": list(owner_ids_set)}, "company_id": current_user.company_id}).to_list()
        for u in owner_objs:
            owners_map[str(u.id)] = f"{getattr(u,'first_name','') or ''} {getattr(u,'last_name','') or ''}".strip() or getattr(u, 'email', str(u.id))

    results: List[Dict[str, Any]] = []
    for a in activities:
        lead = leads_map.get(a.entity_id) if a.entity_type == "lead" else None
        if a.entity_type == "lead" and not lead:
            # skip follow-ups whose lead was deleted / missing / different company
            continue

        phone_info = _format_phone(getattr(lead, "country_code", None) if lead else None, getattr(lead, "phone", None) if lead else None)

        dto = {
            "id": str(a.id),
            "type": "lead_follow_up",
            "activity_type": a.activity_type,
            "title": a.title,
            "description": a.description,
            "scheduled_at": a.scheduled_at.isoformat() if getattr(a, "scheduled_at", None) else None,
            "due_date": a.due_date.isoformat() if getattr(a, "due_date", None) else None,
            "status": getattr(a, "status", None).value if getattr(a, "status", None) else None,
            "priority": getattr(a, "priority", None).value if getattr(a, "priority", None) else None,

            "lead_id": str(lead.id) if lead else (a.entity_id if a.entity_type == "lead" else None),
            "lead_name": (lead.prospect_name or lead.company_name) if lead else None,
            "company_name": getattr(lead, "company_name", None) if lead else None,
            "current_stage": getattr(lead, "current_stage", None) if lead else None,
            "current_stage_status": getattr(lead, "current_stage_status", None) if lead else None,

            "phone": phone_info["phone"],
            "country_code": phone_info["country_code"],
            "formatted_phone": phone_info["formatted_phone"],

            "owner_id": a.owner_id,
            "owner_name": owners_map.get(a.owner_id) if a.owner_id else a.owner_name,
            "scheduled_job_id": a.metadata.get("scheduled_job_id") if getattr(a, "metadata", None) else None,
            "generated_task_id": a.metadata.get("generated_task_id") if getattr(a, "metadata", None) else None,
            "route": f"/crm/leads/{lead.id}" if lead else (f"/crm/leads/{a.entity_id}" if a.entity_type == "lead" else None),
        }
        results.append(dto)

    return results
