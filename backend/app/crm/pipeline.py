from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.crm.timeline import publish_crm_timeline_event
from app.models.sales_masters import SalesStage
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.sales_prospect import ProspectStatus, SalesProspect
from app.models.crm_company import CRMCompany
from app.models.user import User, UserRole


DEFAULT_PIPELINE_STAGES: List[Dict[str, Any]] = [
    {"name": "Lead", "order": 0, "aliases": ["new"]},
    {"name": "Contacted", "order": 1, "aliases": ["contacted", "follow up", "follow up call"]},
    {"name": "Discovery Scheduled", "order": 2, "aliases": ["discovery", "discovery scheduled"]},
    {"name": "Discovery Completed", "order": 3, "aliases": ["discovery completed", "discovery done", "meeting completed"]},
    {"name": "Qualified", "order": 4, "aliases": ["qualified"]},
    {"name": "Proposal Sent", "order": 5, "aliases": ["proposal", "proposal sent"]},
    {"name": "Negotiation", "order": 6, "aliases": ["negotiation"]},
    {"name": "Won", "order": 7, "aliases": ["won", "closed won"]},
    {"name": "Lost", "order": 8, "aliases": ["lost", "closed lost"]},
]

DEFAULT_STAGE_LOOKUP: Dict[str, str] = {
    "new": "Lead",
    "lead": "Lead",
    "contacted": "Contacted",
    "follow up": "Contacted",
    "follow up call": "Contacted",
    "discovery": "Discovery Scheduled",
    "discovery scheduled": "Discovery Scheduled",
    "discovery completed": "Discovery Completed",
    "discovery done": "Discovery Completed",
    "meeting completed": "Discovery Completed",
    "qualified": "Qualified",
    "proposal": "Proposal Sent",
    "proposal sent": "Proposal Sent",
    "negotiation": "Negotiation",
    "won": "Won",
    "closed won": "Won",
    "lost": "Lost",
    "closed lost": "Lost",
}


def _normalize_stage_value(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def _slugify_stage_name(name: str) -> str:
    return _normalize_stage_value(name).replace(" ", "-")


def _user_company_id(current_user: User) -> str:
    company_id = getattr(current_user, "company_id", None)
    if not company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return str(company_id)


def _user_display_name(current_user: User) -> str:
    first_name = getattr(current_user, "first_name", "") or ""
    last_name = getattr(current_user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or str(getattr(current_user, "id", "system"))


def _user_full_name(user: Optional[User], fallback: Optional[str] = None) -> str:
    if not user:
        return fallback or ""
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or fallback or str(getattr(user, "id", ""))


def _can_write_pipeline(current_user: User, prospect: SalesProspect) -> bool:
    if current_user.role in [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN]:
        return True
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(getattr(current_user, "id", ""))
        return prospect.assigned_to == current_user_id or prospect.assigned_by == current_user_id
    return False


async def _load_stage_documents(current_user: User) -> List[SalesStage]:
    company_id = _user_company_id(current_user)
    query: Dict[str, Any] = {"deleted": False, "company_id": company_id}
    stages = await SalesStage.find(query).sort(SalesStage.order).to_list()
    return stages


def _build_stage_catalog(stage_documents: List[SalesStage]) -> List[Dict[str, Any]]:
    if stage_documents:
        catalog = []
        for index, stage in enumerate(stage_documents):
            canonical_name = stage.name.strip()
            catalog.append(
                {
                    "id": str(stage.id),
                    "name": canonical_name,
                    "key": _slugify_stage_name(canonical_name),
                    "order": stage.order if stage.order is not None else index,
                    "is_default": bool(getattr(stage, "is_default", False)),
                    "source": "sales_stage",
                }
            )
        return sorted(catalog, key=lambda item: (item["order"], item["name"].lower()))

    catalog = []
    for stage in DEFAULT_PIPELINE_STAGES:
        catalog.append(
            {
                "id": None,
                "name": stage["name"],
                "key": _slugify_stage_name(stage["name"]),
                "order": stage["order"],
                "is_default": stage["order"] == 0,
                "source": "default",
            }
        )
    return catalog


def _build_stage_index(stage_catalog: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    stage_index: Dict[str, Dict[str, Any]] = {}
    for stage in stage_catalog:
        normalized_name = _normalize_stage_value(stage["name"])
        stage_index[normalized_name] = stage
        stage_index[_normalize_stage_value(stage["key"])] = stage
        for alias, canonical in DEFAULT_STAGE_LOOKUP.items():
            if canonical == stage["name"]:
                stage_index[_normalize_stage_value(alias)] = stage
    return stage_index


def _resolve_stage_name(value: Optional[str], stage_index: Dict[str, Dict[str, Any]]) -> Optional[str]:
    normalized = _normalize_stage_value(value)
    if not normalized:
        return None
    stage = stage_index.get(normalized)
    if stage:
        return stage["name"]
    canonical = DEFAULT_STAGE_LOOKUP.get(normalized)
    if canonical and canonical in {item["name"] for item in stage_index.values()}:
        return canonical
    return None


def _serialize_lead(
    prospect: SalesProspect,
    resolved_stage: str,
    owner_map: Optional[Dict[str, str]] = None,
    company_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    stage_entered_at = prospect.stage_entered_at or prospect.created_at
    now = datetime.utcnow()
    days_in_stage = prospect.days_in_stage
    if stage_entered_at:
        days_in_stage = max((now - stage_entered_at).days, 0)

    owner_id = getattr(prospect, "assigned_to", None)
    owner_name = getattr(prospect, "owner_name", None)
    if owner_id:
        owner_name = (owner_map or {}).get(str(owner_id)) or owner_name or str(owner_id)

    crm_company_id = getattr(prospect, "crm_company_id", None)
    crm_company_name = None
    if crm_company_id:
        crm_company_name = (company_map or {}).get(str(crm_company_id)) or getattr(prospect, "company_name", None)

    return {
        "id": str(prospect.id),
        "prospect_name": getattr(prospect, "prospect_name", None),
        "company_name": getattr(prospect, "company_name", None),
        "crm_company_id": crm_company_id,
        "crm_company_name": crm_company_name or getattr(prospect, "company_name", None),
        "contact_id": getattr(prospect, "contact_id", None),
        "assigned_to": getattr(prospect, "assigned_to", None),
        "assigned_by": getattr(prospect, "assigned_by", None),
        "owner_id": owner_id,
        "ownerId": owner_id,
        "owner_name": owner_name,
        "ownerName": owner_name,
        "current_stage": resolved_stage,
        "status": prospect.status.value if getattr(prospect, "status", None) else None,
        "phone": getattr(prospect, "phone", None),
        "country_code": getattr(prospect, "country_code", None),
        "email": getattr(prospect, "email", None),
        "tag": getattr(prospect, "tag", None) or [],
        "remark": getattr(prospect, "remark", None),
        "won_amount": getattr(prospect, "won_amount", None),
        "reason_for_lost": getattr(prospect, "reason_for_lost", None),
        "created_at": getattr(prospect, "created_at", None),
        "updated_at": getattr(prospect, "updated_at", None),
        "stage_entered_at": stage_entered_at,
        "stage_last_changed_at": getattr(prospect, "stage_last_changed_at", None),
        "days_in_stage": days_in_stage,
    }


def _build_pipeline_summary(prospects: List[SalesProspect]) -> Dict[str, Any]:
    active = 0
    won = 0
    lost = 0
    total_days = 0
    staged_count = 0
    now = datetime.utcnow()

    for prospect in prospects:
        if prospect.status == ProspectStatus.ACTIVE:
            active += 1
        elif prospect.status == ProspectStatus.WON:
            won += 1
        elif prospect.status == ProspectStatus.LOST:
            lost += 1

        stage_entered_at = prospect.stage_entered_at or prospect.created_at
        if stage_entered_at:
            total_days += max((now - stage_entered_at).days, 0)
            staged_count += 1

    average_days_in_stage = round(total_days / staged_count, 2) if staged_count else 0.0

    return {
        "total_leads": len(prospects),
        "active_leads": active,
        "won_leads": won,
        "lost_leads": lost,
        "average_days_in_stage": average_days_in_stage,
    }


class CRMPipelineService:
    @staticmethod
    async def load_pipeline(current_user: User) -> Dict[str, Any]:
        company_id = _user_company_id(current_user)
        stage_documents = await _load_stage_documents(current_user)
        stage_catalog = _build_stage_catalog(stage_documents)
        stage_index = _build_stage_index(stage_catalog)

        query: Dict[str, Any] = {
            "company_id": company_id,
            "deleted": False,
        }
        if current_user.role == UserRole.EMPLOYEE:
            current_user_id = str(getattr(current_user, "id", ""))
            query["$or"] = [
                {"assigned_to": current_user_id},
                {"assigned_by": current_user_id},
            ]

        prospects = await SalesProspect.find(query).sort("-updated_at").to_list()
        owner_ids = {
            str(prospect.assigned_to)
            for prospect in prospects
            if getattr(prospect, "assigned_to", None)
        }
        company_ids = {
            str(prospect.crm_company_id)
            for prospect in prospects
            if getattr(prospect, "crm_company_id", None)
        }
        owner_map: Dict[str, str] = {}
        if owner_ids:
            owners = await User.find(
                {
                    "_id": {"$in": list(owner_ids)},
                    "company_id": company_id,
                }
            ).to_list()
            owner_map = {str(owner.id): _user_full_name(owner, str(owner.id)) for owner in owners}

        company_map: Dict[str, str] = {}
        if company_ids:
            company_query: Dict[str, Any] = {"_id": {"$in": list(company_ids)}}
            if current_user.role != UserRole.SUPER_ADMIN:
                company_query["company_id"] = company_id
            companies = await CRMCompany.find(company_query).to_list()
            company_map = {str(company.id): company.name for company in companies}

        stage_lookup: Dict[str, Dict[str, Any]] = {
            stage["name"]: {**stage, "lead_count": 0} for stage in stage_catalog
        }
        leads_by_stage: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

        for prospect in prospects:
            resolved_stage = _resolve_stage_name(prospect.current_stage, stage_index)
            if not resolved_stage:
                resolved_stage = prospect.current_stage or "Unstaged"

            if resolved_stage not in stage_lookup:
                stage_lookup[resolved_stage] = {
                    "id": None,
                    "name": resolved_stage,
                    "key": _slugify_stage_name(resolved_stage),
                    "order": len(stage_lookup) + 100,
                    "is_default": False,
                    "source": "legacy",
                    "lead_count": 0,
                }

            stage_lookup[resolved_stage]["lead_count"] += 1
            leads_by_stage[resolved_stage].append(_serialize_lead(prospect, resolved_stage, owner_map, company_map))

        stages = sorted(stage_lookup.values(), key=lambda item: (item["order"], item["name"].lower()))
        stage_counts = [{"stage": stage["name"], "count": stage["lead_count"]} for stage in stages]

        return {
            "stages": stages,
            "stage_counts": stage_counts,
            "leads_by_stage": dict(leads_by_stage),
            "summary": _build_pipeline_summary(prospects),
            "meta": {
                "company_id": company_id,
                "stage_source": "sales_stages" if stage_documents else "default",
            },
        }

    @staticmethod
    async def move_lead(current_user: User, lead_id: str, target_stage: str, reason: Optional[str] = None) -> Dict[str, Any]:
        company_id = _user_company_id(current_user)
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

        if prospect.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this company")

        if not _can_write_pipeline(current_user, prospect):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to update this lead")

        stage_documents = await _load_stage_documents(current_user)
        stage_catalog = _build_stage_catalog(stage_documents)
        stage_index = _build_stage_index(stage_catalog)
        resolved_stage = _resolve_stage_name(target_stage, stage_index)
        if not resolved_stage:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown stage")

        current_stage = _resolve_stage_name(prospect.current_stage, stage_index) or prospect.current_stage
        if _normalize_stage_value(current_stage) == _normalize_stage_value(resolved_stage):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid transition")

        now = datetime.utcnow()
        previous_entered_at = prospect.stage_entered_at or prospect.created_at or now
        days_in_previous_stage = max((now - previous_entered_at).days, 0)

        prospect.current_stage = resolved_stage
        prospect.stage_last_changed_at = now
        prospect.stage_entered_at = now
        prospect.days_in_stage = 0
        prospect.updated_at = now

        normalized_stage = _normalize_stage_value(resolved_stage)
        if normalized_stage == "won":
            prospect.status = ProspectStatus.WON
            prospect.closed_date = now
            prospect.closed_by = str(getattr(current_user, "id", ""))
            prospect.reason_for_lost = None
        elif normalized_stage == "lost":
            prospect.status = ProspectStatus.LOST
            prospect.closed_date = now
            prospect.closed_by = str(getattr(current_user, "id", ""))
            if reason is not None:
                prospect.reason_for_lost = reason.strip() or None
        elif prospect.status in [ProspectStatus.WON, ProspectStatus.LOST]:
            prospect.status = ProspectStatus.ACTIVE
            prospect.closed_date = None
            prospect.closed_by = None

        await prospect.save()

        history = SalesPipelineHistory.model_construct(
            lead_id=str(prospect.id),
            company_id=company_id,
            previous_stage=current_stage,
            new_stage=resolved_stage,
            user_id=str(getattr(current_user, "id", "")),
            user_name=_user_display_name(current_user),
            reason=reason.strip() if reason else None,
            days_in_previous_stage=days_in_previous_stage,
            payload={
                "lead_id": str(prospect.id),
                "previous_stage": current_stage,
                "new_stage": resolved_stage,
                "reason": reason.strip() if reason else None,
                "company_id": company_id,
                "days_in_previous_stage": days_in_previous_stage,
            },
            transitioned_at=now,
        )
        await history.insert()

        await publish_crm_timeline_event(
            event_name="LeadStageChanged",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(prospect.id),
                "lead_name": prospect.prospect_name,
                "company_id": company_id,
                "previous_stage": current_stage,
                "new_stage": resolved_stage,
                "reason": reason.strip() if reason else None,
                "days_in_previous_stage": days_in_previous_stage,
                "status": prospect.status.value,
                "updated_at": now.isoformat(),
            },
            metadata={
                "surface": "crm",
                "workflow": "pipeline",
            },
        )

        return {
            "lead": _serialize_lead(prospect, resolved_stage),
            "history": {
                "lead_id": str(prospect.id),
                "previous_stage": current_stage,
                "new_stage": resolved_stage,
                "timestamp": now,
                "user_id": str(getattr(current_user, "id", "")),
                "user_name": _user_display_name(current_user),
                "company_id": company_id,
                "reason": reason.strip() if reason else None,
                "days_in_previous_stage": days_in_previous_stage,
            },
            "message": "Lead stage updated successfully",
        }

    @staticmethod
    async def get_history(current_user: User, lead_id: str) -> Dict[str, Any]:
        company_id = _user_company_id(current_user)
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if prospect.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this company")
        if not _can_write_pipeline(current_user, prospect) and current_user.role == UserRole.EMPLOYEE:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to view this lead")

        history_items = await SalesPipelineHistory.find(
            {
                "company_id": company_id,
                "lead_id": str(prospect.id),
            }
        ).sort("-transitioned_at").to_list()

        return {
            "lead_id": str(prospect.id),
            "lead_name": prospect.prospect_name,
            "history": [
                {
                    "id": str(item.id),
                    "lead_id": item.lead_id,
                    "company_id": item.company_id,
                    "previous_stage": item.previous_stage,
                    "new_stage": item.new_stage,
                    "user_id": item.user_id,
                    "user_name": item.user_name,
                    "reason": item.reason,
                    "days_in_previous_stage": item.days_in_previous_stage,
                    "timestamp": item.transitioned_at,
                    "payload": item.payload,
                }
                for item in history_items
            ],
        }
