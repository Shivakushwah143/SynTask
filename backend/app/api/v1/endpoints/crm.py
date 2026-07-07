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
from app.models.sales_prospect import SalesProspect
from app.models.user import User, UserRole

router = APIRouter()


@router.get("/dashboard")
async def crm_dashboard(current_user: User = Depends(get_current_user)):
    return await build_crm_dashboard(current_user)


@router.get("/leads")
async def crm_leads(
    search: Optional[str] = None,
    assigned_to: Optional[str] = None,
    current_stage: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    query = {"deleted": False, "company_id": current_user.company_id}
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(current_user.id)
        query["$or"] = [{"assigned_to": current_user_id}, {"assigned_by": current_user_id}]
    if assigned_to:
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
    prospects = await SalesProspect.find(query).skip(skip).limit(limit).sort(-SalesProspect.created_at).to_list()
    return {
        "total": total,
        "prospects": [
            {
                "id": str(p.id),
                "prospect_name": p.prospect_name,
                "phone": p.phone,
                "country_code": p.country_code,
                "email": p.email,
                "assigned_to": p.assigned_to,
                "assigned_by": p.assigned_by,
                "category_id": p.category_id,
                "product_ids": p.product_ids,
                "crm_company_id": p.crm_company_id,
                "current_stage": p.current_stage,
                "status": p.status.value,
                "interest_level": p.interest_level.value,
                "estimated_close_date": p.estimated_close_date.isoformat() if p.estimated_close_date else None,
                "tag": p.tag or [],
                "remark": p.remark,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "custom_fields": getattr(p, "custom_fields", {}) or {},
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
