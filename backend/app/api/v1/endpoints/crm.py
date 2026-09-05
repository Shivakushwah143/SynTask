"""
CRM workspace endpoints.

The backend business domain remains Sales, so CRM endpoints are a thin
application-layer facade over the existing sales models and permissions.
"""
from typing import Optional

from fastapi import APIRouter, Depends

from app.api.dependencies import get_current_user
from app.crm.application import build_crm_dashboard
from app.crm.lead_timeline import CRMLeadTimelineService
from app.api.v1.endpoints.sales_prospects import _get_company_prospects, _lead_identity_score, _serialize_prospect_identity
from app.core.cache import cache_get, dashboard_metrics_cache_key
from app.crm.models import SalesProspect
from app.crm.pipeline import normalize_stage_display, resolved_stage_status
from app.models.user import User
from app.api.deps import Pagination50, PaginationParams

router = APIRouter()


@router.get("/dashboard")
async def crm_dashboard(current_user: User = Depends(get_current_user)):
    # Avoid recomputing sales summaries that /dashboard/metrics already builds.
    # If the metrics cache is warm, reuse its sales data to eliminate redundant
    # database queries and Python-side aggregation.
    metrics_cache_key = dashboard_metrics_cache_key(
        str(current_user.id),
        current_user.role.value,
        current_user.company_id,
    )
    cached_metrics = await cache_get(metrics_cache_key)
    if cached_metrics:
        from app.crm.application import build_crm_dashboard_from_metrics
        return build_crm_dashboard_from_metrics(current_user, cached_metrics)
    return await build_crm_dashboard(current_user)


@router.get("/leads")
async def crm_leads(
    search: Optional[str] = None,
    assigned_to: Optional[str] = None,
    current_stage: Optional[str] = None,
    status: Optional[str] = None,
    has_follow_up: Optional[bool] = None,
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    skip, limit = pagination.skip, pagination.limit
    query = {"deleted": False, "company_id": current_user.company_id}
    if has_follow_up:
        # Only leads with a scheduled follow-up set (next_follow_up_at present and not null).
        query["next_follow_up_at"] = {"$exists": True, "$ne": None}
    if assigned_to:
        # Filter by a specific assignee (used by managers/admins viewing a specific employee's leads)
        query["assigned_to"] = assigned_to
    if current_stage:
        query["current_stage"] = current_stage
    if status:
        query["status"] = status
    if search:
        search = search.strip()
        query["$or"] = [
            {"prospect_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    total = await SalesProspect.find(query).count()
    if has_follow_up:
        # Soonest follow-up first so dashboards can show what needs attention next.
        prospects = await SalesProspect.find(query).skip(skip).limit(limit).sort(SalesProspect.next_follow_up_at).to_list()
    else:
        prospects = await SalesProspect.find(query).skip(skip).limit(limit).sort(-SalesProspect.created_at).to_list()
    return {
        "total": total,
        "prospects": [
            {
                "id": str(p.id),
                "prospect_name": p.prospect_name,
                "company_name": p.company_name,
                "phone": p.phone,
                "country_code": p.country_code,
                "email": p.email,
                "assigned_to": p.assigned_to,
                "assigned_by": p.assigned_by,
                "category_id": p.category_id,
                "product_ids": p.product_ids,
                "crm_company_id": p.crm_company_id,
                "current_stage": normalize_stage_display(p.current_stage),
                "status": p.status.value,
                "interest_level": p.interest_level.value,
                "estimated_close_date": p.estimated_close_date.isoformat() if p.estimated_close_date else None,
                "due_date": p.due_date.isoformat() if p.due_date else None,
                "won_amount": p.won_amount,
                "reason_for_lost": p.reason_for_lost,
                "tag": p.tag or [],
                "remark": p.remark,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
                "custom_fields": getattr(p, "custom_fields", {}) or {},
                "owner_name": p.owner_name,
                "source": p.source,
                "qualify_status": getattr(p, "qualify_status", None),
                "next_action": getattr(p, "next_action", None),
                "next_follow_up_at": getattr(p, "next_follow_up_at", None),
                "last_contacted_at": getattr(p, "last_contacted_at", None),
                "won_status": getattr(p, "won_status", None),
                "transferred_at": getattr(p, "transferred_at", None),
                "current_stage_status": resolved_stage_status(p),
            }
            for p in prospects
        ],
    }


@router.get("/dashboard/follow-ups")
async def crm_dashboard_follow_ups(
    limit: int = 100,
    current_user: User = Depends(get_current_user),
):
    """Compact follow-up list for the dashboard widget.

    Returns only the fields the dashboard needs (prospect name, phone,
    stage, next_follow_up_at) instead of full lead documents.  Capped at
    100 records sorted by soonest follow-up first.
    """
    query = {
        "deleted": False,
        "company_id": current_user.company_id,
        "next_follow_up_at": {"$exists": True, "$ne": None},
        "transferred_at": None,
    }
    prospects = await (
        SalesProspect.find(query)
        .sort(SalesProspect.next_follow_up_at)
        .limit(min(limit, 100))
        .to_list()
    )
    return {
        "prospects": [
            {
                "id": str(p.id),
                "prospect_name": p.prospect_name,
                "company_name": p.company_name,
                "phone": p.phone,
                "country_code": p.country_code,
                "current_stage": normalize_stage_display(p.current_stage),
                "next_follow_up_at": getattr(p, "next_follow_up_at", None),
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "next_action": getattr(p, "next_action", None),
                "owner_name": p.owner_name,
            }
            for p in prospects
        ],
    }


@router.get("/leads/{lead_id}/timeline")
async def crm_lead_timeline(lead_id: str, current_user: User = Depends(get_current_user)):
    return await CRMLeadTimelineService.load_timeline(current_user, lead_id)


@router.get("/duplicates")
async def crm_duplicate_leads(search: str | None = None, current_user: User = Depends(get_current_user)):
    prospects = await _get_company_prospects(current_user)
    duplicates = []
    seen = {}
    for prospect in prospects:
        email, phone, name = _lead_identity_score(prospect)
        keys = [key for key in [f"email:{email}" if email else "", f"phone:{phone}" if phone else "", f"name:{name}" if name else ""] if key]
        if search:
          q = search.strip().lower()
          if q not in email and q not in phone and q not in name:
              continue
        for key in keys:
            seen.setdefault(key, []).append(_serialize_prospect_identity(prospect))
    for key, items in seen.items():
        if len(items) > 1:
            duplicates.append({"match_key": key, "leads": items})
    return {"total_groups": len(duplicates), "groups": duplicates}
