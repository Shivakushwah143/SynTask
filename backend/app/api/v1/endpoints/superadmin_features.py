"""
Super Admin - tenant feature flags.
"""
from datetime import datetime

from app.core.clock import utc_now
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_super_admin
from app.models.audit_log import log_audit
from app.models.company import Company
from app.models.feature_flag import FeatureFlag
from app.models.user import User

router = APIRouter()

AVAILABLE_FEATURES = [
    {"key": "whatsapp_api", "label": "WhatsApp API", "description": "Meta WhatsApp Business integration"},
    {"key": "meta_ads", "label": "Meta Ads", "description": "Facebook and Instagram ads management"},
    {"key": "ai_chat", "label": "AI Assistant", "description": "AI-powered chat and task assistance"},
    {"key": "recruitment", "label": "Recruitment Module", "description": "HR recruitment and hiring"},
    {"key": "crm_advanced", "label": "Advanced CRM", "description": "CRM pipeline and automation"},
    {"key": "rag", "label": "Knowledge Base RAG", "description": "Document AI and RAG search"},
    {"key": "time_tracking", "label": "Time Tracking", "description": "Employee time tracking"},
    {"key": "custom_reports", "label": "Custom Reports", "description": "Advanced reporting and exports"},
]


class FeatureToggleRequest(BaseModel):
    feature_key: str = Field(..., min_length=1)
    is_enabled: bool
    notes: Optional[str] = None


@router.get("/available", response_model=list[dict])
async def get_available_features(current_user: User = Depends(get_current_super_admin)):
    return AVAILABLE_FEATURES


@router.get("/{company_id}", response_model=list[dict])
async def get_company_features(company_id: str, current_user: User = Depends(get_current_super_admin)):
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail={"detail": "Company not found", "code": "company_not_found"})
    flags = await FeatureFlag.find(FeatureFlag.company_id == company_id).to_list()
    flag_map = {flag.feature_key: flag for flag in flags}
    return [
        {
            **feature,
            "is_enabled": flag_map.get(feature["key"]).is_enabled if feature["key"] in flag_map else False,
            "enabled_by": flag_map.get(feature["key"]).enabled_by if feature["key"] in flag_map else None,
            "enabled_at": flag_map.get(feature["key"]).enabled_at.isoformat() if feature["key"] in flag_map and flag_map.get(feature["key"]).enabled_at else None,
            "notes": flag_map.get(feature["key"]).notes if feature["key"] in flag_map else None,
        }
        for feature in AVAILABLE_FEATURES
    ]


@router.put("/{company_id}/toggle", response_model=dict)
async def toggle_feature(
    company_id: str,
    body: FeatureToggleRequest,
    current_user: User = Depends(get_current_super_admin),
):
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail={"detail": "Company not found", "code": "company_not_found"})
    if body.feature_key not in {feature["key"] for feature in AVAILABLE_FEATURES}:
        raise HTTPException(status_code=400, detail={"detail": "Unknown feature", "code": "unknown_feature"})

    flag = await FeatureFlag.find_one(
        FeatureFlag.company_id == company_id,
        FeatureFlag.feature_key == body.feature_key,
    )
    if not flag:
        flag = FeatureFlag(company_id=company_id, feature_key=body.feature_key)
    flag.is_enabled = body.is_enabled
    flag.enabled_by = str(current_user.id)
    flag.enabled_at = utc_now()
    flag.notes = body.notes
    flag.updated_at = utc_now()
    await flag.save() if flag.id else await flag.insert()
    await log_audit(
        "toggle_feature",
        str(current_user.id),
        "company",
        company_id,
        {"feature_key": body.feature_key, "is_enabled": body.is_enabled},
    )
    return {"feature_key": body.feature_key, "is_enabled": body.is_enabled}
