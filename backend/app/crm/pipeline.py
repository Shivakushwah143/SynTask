from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.crm.timeline import publish_crm_timeline_event
from app.crm.deal_automation import handle_won_deal_automation
from app.crm.lost_workflow import handle_lost_workflow
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.crm_deal import CRMDeal
from app.models.sales_prospect import ProspectStatus, SalesProspect
from app.models.crm_company import CRMCompany
from app.models.user import User, UserRole


APPROVED_PIPELINE_STAGES: List[Dict[str, Any]] = [
    {"name": "New", "order": 0, "category": "intake", "description": "Fresh lead awaiting outreach.", "aliases": ["lead", "new"]},
    {"name": "Contacted", "order": 1, "category": "qualification", "description": "Initial contact has been made.", "aliases": ["contacted", "follow up", "follow up call"]},
    {"name": "Qualified", "order": 2, "category": "qualification", "description": "Lead fits the target criteria.", "aliases": ["qualified"]},
    {"name": "Discovery", "order": 3, "category": "evaluation", "description": "Needs analysis or discovery is underway.", "aliases": ["discovery", "discovery scheduled", "discovery completed", "discovery done", "meeting completed"]},
    {"name": "Proposal", "order": 4, "category": "proposal", "description": "Proposal or quote has been delivered.", "aliases": ["proposal", "proposal sent"]},
    {"name": "Negotiation", "order": 5, "category": "proposal", "description": "Commercial terms are under discussion.", "aliases": ["negotiation"]},
    {"name": "Won", "order": 6, "category": "closed", "description": "Opportunity closed successfully.", "aliases": ["won", "closed won"], "is_terminal": True},
    {"name": "Lost", "order": 7, "category": "closed", "description": "Opportunity closed without conversion.", "aliases": ["lost", "closed lost"], "is_terminal": True},
]

# Backward-compatible export expected by package imports and older call sites.
DEFAULT_PIPELINE_STAGES = APPROVED_PIPELINE_STAGES

DEFAULT_STAGE_LOOKUP: Dict[str, str] = {
    "new": "New",
    "lead": "New",
    "contacted": "Contacted",
    "follow up": "Contacted",
    "follow up call": "Contacted",
    "qualified": "Qualified",
    "discovery": "Discovery",
    "discovery scheduled": "Discovery",
    "discovery completed": "Discovery",
    "discovery done": "Discovery",
    "meeting completed": "Discovery",
    "proposal": "Proposal",
    "proposal sent": "Proposal",
    "negotiation": "Negotiation",
    "won": "Won",
    "closed won": "Won",
    "lost": "Lost",
    "closed lost": "Lost",
}


class PipelineStage(str, Enum):
    NEW = "New"
    CONTACTED = "Contacted"
    QUALIFIED = "Qualified"
    DISCOVERY = "Discovery"
    PROPOSAL = "Proposal"
    NEGOTIATION = "Negotiation"
    WON = "Won"
    LOST = "Lost"


ALLOWED_TRANSITIONS: Dict[PipelineStage, set[PipelineStage]] = {
    PipelineStage.NEW: {PipelineStage.CONTACTED, PipelineStage.QUALIFIED, PipelineStage.LOST},
    PipelineStage.CONTACTED: {PipelineStage.QUALIFIED, PipelineStage.LOST},
    PipelineStage.QUALIFIED: {PipelineStage.DISCOVERY, PipelineStage.LOST},
    PipelineStage.DISCOVERY: {PipelineStage.PROPOSAL, PipelineStage.LOST},
    PipelineStage.PROPOSAL: {PipelineStage.NEGOTIATION, PipelineStage.LOST},
    PipelineStage.NEGOTIATION: {PipelineStage.WON, PipelineStage.LOST},
    PipelineStage.WON: set(),
    PipelineStage.LOST: {PipelineStage.NEW},
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


def _build_stage_catalog() -> List[Dict[str, Any]]:
    catalog = []
    for stage in APPROVED_PIPELINE_STAGES:
        catalog.append(
            {
                "id": None,
                "name": stage["name"],
                "key": _slugify_stage_name(stage["name"]),
                "order": stage["order"],
                "is_default": stage["order"] == 0,
                "description": stage.get("description"),
                "category": stage.get("category"),
                "is_terminal": bool(stage.get("is_terminal", False)),
                "source": "fixed",
            }
        )
    return catalog


async def _load_stage_documents(current_user: User) -> List[Dict[str, Any]]:
    # Legacy seam retained for tests and callers that monkeypatch stage loading.
    return _build_stage_catalog()


def _build_stage_index(stage_catalog: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    stage_index: Dict[str, Dict[str, Any]] = {}
    for stage in stage_catalog:
        stage_name = stage["name"] if isinstance(stage, dict) else getattr(stage, "name", None)
        stage_key = stage["key"] if isinstance(stage, dict) and "key" in stage else getattr(stage, "key", _slugify_stage_name(stage_name or ""))
        aliases = stage.get("aliases", []) if isinstance(stage, dict) else getattr(stage, "aliases", []) or []
        normalized_name = _normalize_stage_value(stage_name)
        stage_index[normalized_name] = stage
        stage_index[_normalize_stage_value(stage_key)] = stage
        if normalized_name in {"lead", "new"}:
            stage_index["lead"] = stage
            stage_index["new"] = stage
        for alias in aliases:
            stage_index[_normalize_stage_value(alias)] = stage
        for alias, canonical in DEFAULT_STAGE_LOOKUP.items():
            if canonical == stage_name:
                stage_index[_normalize_stage_value(alias)] = stage
    return stage_index


def _stage_name(stage: Any) -> str:
    return stage["name"] if isinstance(stage, dict) else getattr(stage, "name", "")


def _stage_order(stage: Any) -> int:
    return stage["order"] if isinstance(stage, dict) else int(getattr(stage, "order", 0))


def _stage_meta_value(stage: Any, key: str, default: Any = None) -> Any:
    if isinstance(stage, dict):
        return stage.get(key, default)
    return getattr(stage, key, default)


def _resolve_stage_name(value: Optional[str], stage_index: Dict[str, Dict[str, Any]]) -> Optional[str]:
    normalized = _normalize_stage_value(value)
    if not normalized:
        return None
    stage = stage_index.get(normalized)
    if stage:
        return _stage_name(stage)
    canonical = DEFAULT_STAGE_LOOKUP.get(normalized)
    if canonical and canonical in {item["name"] for item in stage_index.values()}:
        return canonical
    return None


def _resolve_pipeline_stage(value: Optional[str]) -> Optional[PipelineStage]:
    normalized = _normalize_stage_value(value)
    for stage in PipelineStage:
        if normalized in {_normalize_stage_value(stage.value), _slugify_stage_name(stage.value)}:
            return stage
    canonical = DEFAULT_STAGE_LOOKUP.get(normalized)
    if canonical:
        return PipelineStage(canonical)
    return None


def _is_allowed_transition(current_stage: str, target_stage: str) -> bool:
    current = _resolve_pipeline_stage(current_stage)
    target = _resolve_pipeline_stage(target_stage)
    if not current or not target:
        return False
    return target in ALLOWED_TRANSITIONS.get(current, set())


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
        stage_catalog = await _load_stage_documents(current_user)
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
            _stage_name(stage): {
                "id": stage["id"] if isinstance(stage, dict) else getattr(stage, "id", None),
                "name": _stage_name(stage),
                "key": stage["key"] if isinstance(stage, dict) and "key" in stage else getattr(stage, "key", _slugify_stage_name(_stage_name(stage))),
                "order": _stage_order(stage),
                "is_default": stage["is_default"] if isinstance(stage, dict) and "is_default" in stage else bool(getattr(stage, "is_default", False)),
                "description": stage["description"] if isinstance(stage, dict) and "description" in stage else getattr(stage, "description", None),
                "category": stage["category"] if isinstance(stage, dict) and "category" in stage else getattr(stage, "category", None),
                "is_terminal": stage["is_terminal"] if isinstance(stage, dict) and "is_terminal" in stage else bool(getattr(stage, "is_terminal", False)),
                "source": stage["source"] if isinstance(stage, dict) and "source" in stage else getattr(stage, "source", "fixed"),
                "lead_count": 0,
            }
            for stage in stage_catalog
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
                    "description": None,
                    "category": None,
                    "is_terminal": False,
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
                "stage_source": "fixed_state_machine",
                "approved_stages": [stage["name"] for stage in APPROVED_PIPELINE_STAGES],
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

        stage_catalog = await _load_stage_documents(current_user)
        stage_index = _build_stage_index(stage_catalog)
        resolved_stage = _resolve_stage_name(target_stage, stage_index)
        if not resolved_stage:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown stage")

        current_stage = _resolve_stage_name(prospect.current_stage, stage_index) or prospect.current_stage
        if _normalize_stage_value(current_stage) == _normalize_stage_value(resolved_stage):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid transition")
        if not _is_allowed_transition(current_stage, resolved_stage):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Illegal transition {current_stage} -> {resolved_stage}",
            )

        now = datetime.utcnow()
        previous_entered_at = prospect.stage_entered_at or prospect.created_at or now
        days_in_previous_stage = max((now - previous_entered_at).days, 0)

        prospect.current_stage = resolved_stage
        prospect.stage_last_changed_at = now
        prospect.stage_entered_at = now
        prospect.days_in_stage = 0
        prospect.updated_at = now

        normalized_stage = _normalize_stage_value(resolved_stage)
        lost_result: Optional[Dict[str, Any]] = None
        if normalized_stage == "won":
            prospect.status = ProspectStatus.WON
            prospect.closed_date = now
            prospect.closed_by = str(getattr(current_user, "id", ""))
            prospect.reason_for_lost = None
        elif normalized_stage == "lost":
            lost_result = await handle_lost_workflow(current_user, prospect, reason)
            prospect = lost_result["lead"]
        elif prospect.status in [ProspectStatus.WON, ProspectStatus.LOST]:
            prospect.status = ProspectStatus.ACTIVE
            prospect.closed_date = None
            prospect.closed_by = None

        await prospect.save()

        stage_catalog_map = {_stage_name(stage): stage for stage in stage_catalog}
        resolved_stage_meta = stage_catalog_map.get(resolved_stage, {})

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
                "stage_metadata": {
                    "name": _stage_meta_value(resolved_stage_meta, "name", resolved_stage),
                    "key": _stage_meta_value(resolved_stage_meta, "key"),
                    "order": _stage_meta_value(resolved_stage_meta, "order"),
                    "category": _stage_meta_value(resolved_stage_meta, "category"),
                    "is_terminal": _stage_meta_value(resolved_stage_meta, "is_terminal", False),
                },
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
                "stage_metadata": {
                    "name": _stage_meta_value(resolved_stage_meta, "name", resolved_stage),
                    "key": _stage_meta_value(resolved_stage_meta, "key"),
                    "order": _stage_meta_value(resolved_stage_meta, "order"),
                    "category": _stage_meta_value(resolved_stage_meta, "category"),
                    "is_terminal": _stage_meta_value(resolved_stage_meta, "is_terminal", False),
                },
            },
            metadata={
                "surface": "crm",
                "workflow": "pipeline",
            },
        )

        if normalized_stage == "won":
            deal = await CRMDeal.find_one(
                {
                    "company_id": company_id,
                    "lead_id": str(prospect.id),
                }
            )
            automation_result: Dict[str, Any] = {"status": "skipped"}
            try:
                if deal:
                    now = datetime.utcnow()
                    deal.stage = "won"
                    deal.updated_by = str(getattr(current_user, "id", ""))
                    deal.updated_by_name = _user_display_name(current_user)
                    deal.updated_at = now
                    await deal.save()
                automation_result = await handle_won_deal_automation(current_user, prospect, deal)
            except Exception as exc:
                automation_result = {
                    "status": "failed",
                    "error": str(exc),
                }

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
            "automation": automation_result if normalized_stage == "won" else (lost_result if normalized_stage == "lost" else None),
            "message": "Lead stage updated successfully",
        }

    @staticmethod
    async def reopen_lost_lead(current_user: User, lead_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
        company_id = _user_company_id(current_user)
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

        if prospect.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this company")

        if not _can_write_pipeline(current_user, prospect):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to update this lead")

        if prospect.status != ProspectStatus.LOST:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lead is not lost")

        stage_catalog = await _load_stage_documents(current_user)
        stage_index = _build_stage_index(stage_catalog)
        reopened_stage = _resolve_stage_name("New", stage_index) or "New"
        previous_stage = _resolve_stage_name(prospect.current_stage, stage_index) or prospect.current_stage or "Lost"

        now = datetime.utcnow()
        days_in_previous_stage = max((now - (prospect.stage_entered_at or prospect.created_at or now)).days, 0)

        prospect.current_stage = reopened_stage
        prospect.status = ProspectStatus.ACTIVE
        prospect.closed_date = None
        prospect.closed_by = None
        prospect.reason_for_lost = None
        prospect.stage_last_changed_at = now
        prospect.stage_entered_at = now
        prospect.days_in_stage = 0
        prospect.updated_at = now
        await prospect.save()

        stage_catalog_map = {_stage_name(stage): stage for stage in stage_catalog}
        resolved_stage_meta = stage_catalog_map.get(reopened_stage, {})

        history = SalesPipelineHistory.model_construct(
            lead_id=str(prospect.id),
            company_id=company_id,
            previous_stage=previous_stage,
            new_stage=reopened_stage,
            user_id=str(getattr(current_user, "id", "")),
            user_name=_user_display_name(current_user),
            reason=reason.strip() if reason else None,
            days_in_previous_stage=days_in_previous_stage,
            payload={
                "lead_id": str(prospect.id),
                "previous_stage": previous_stage,
                "new_stage": reopened_stage,
                "reason": reason.strip() if reason else None,
                "company_id": company_id,
                "days_in_previous_stage": days_in_previous_stage,
                "reopened_from": "lost",
                "stage_metadata": {
                    "name": _stage_meta_value(resolved_stage_meta, "name", reopened_stage),
                    "key": _stage_meta_value(resolved_stage_meta, "key"),
                    "order": _stage_meta_value(resolved_stage_meta, "order"),
                    "category": _stage_meta_value(resolved_stage_meta, "category"),
                    "is_terminal": _stage_meta_value(resolved_stage_meta, "is_terminal", False),
                },
            },
            transitioned_at=now,
        )
        await history.insert()

        await publish_crm_timeline_event(
            event_name="LeadReopened",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(prospect.id),
                "lead_name": prospect.prospect_name,
                "company_id": company_id,
                "previous_stage": previous_stage,
                "new_stage": reopened_stage,
                "reason": reason.strip() if reason else None,
                "days_in_previous_stage": days_in_previous_stage,
                "status": prospect.status.value,
                "updated_at": now.isoformat(),
                "reopened_from": "lost",
                "stage_metadata": {
                    "name": _stage_meta_value(resolved_stage_meta, "name", reopened_stage),
                    "key": _stage_meta_value(resolved_stage_meta, "key"),
                    "order": _stage_meta_value(resolved_stage_meta, "order"),
                    "category": _stage_meta_value(resolved_stage_meta, "category"),
                    "is_terminal": _stage_meta_value(resolved_stage_meta, "is_terminal", False),
                },
            },
            metadata={
                "surface": "crm",
                "workflow": "lost_lifecycle",
            },
        )

        return {
            "lead": _serialize_lead(prospect, reopened_stage),
            "history": {
                "lead_id": str(prospect.id),
                "previous_stage": previous_stage,
                "new_stage": reopened_stage,
                "timestamp": now,
                "user_id": str(getattr(current_user, "id", "")),
                "user_name": _user_display_name(current_user),
                "company_id": company_id,
                "reason": reason.strip() if reason else None,
                "days_in_previous_stage": days_in_previous_stage,
                "reopened_from": "lost",
            },
            "message": "Lost lead reopened successfully",
        }

    @staticmethod
    async def create_lost_reminder(
        current_user: User,
        lead_id: str,
        *,
        title: str,
        description: Optional[str] = None,
        due_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        company_id = _user_company_id(current_user)
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if prospect.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this company")
        if prospect.status != ProspectStatus.LOST:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reminders can only be created for lost leads")

        now = datetime.utcnow()
        activity = CRMActivity(
            company_id=company_id,
            entity_type="lead",
            entity_id=str(prospect.id),
            activity_type=CRMActivityType.REMINDER.value,
            title=title.strip() or "Lost lead reminder",
            description=description.strip() if description else f"Follow up on lost lead {prospect.prospect_name}.",
            status=CRMActivityStatus.SCHEDULED,
            priority=CRMActivityPriority.MEDIUM,
            owner_id=str(getattr(current_user, "id", "")),
            owner_name=_user_display_name(current_user),
            due_date=due_date,
            metadata={
                "lead_id": str(prospect.id),
                "lead_name": prospect.prospect_name,
                "status": prospect.status.value,
                "reason_for_lost": prospect.reason_for_lost,
                "workflow": "lost_lifecycle",
            },
            created_by=str(getattr(current_user, "id", "")),
            created_by_name=_user_display_name(current_user),
            updated_by=str(getattr(current_user, "id", "")),
            updated_by_name=_user_display_name(current_user),
            created_at=now,
            updated_at=now,
        )
        await activity.insert()

        await publish_crm_timeline_event(
            event_name="LostLeadReminderCreated",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(prospect.id),
                "lead_name": prospect.prospect_name,
                "activity_id": str(activity.id),
                "title": activity.title,
                "due_date": due_date.isoformat() if due_date else None,
                "status": "scheduled",
                "reason_for_lost": prospect.reason_for_lost,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "lost_lifecycle"},
        )

        return {
            "message": "Lost lead reminder created",
            "activity": {
                "id": str(activity.id),
                "title": activity.title,
                "description": activity.description,
                "due_date": activity.due_date,
                "status": activity.status.value,
                "priority": activity.priority.value,
                "owner_id": activity.owner_id,
                "entity_id": activity.entity_id,
                "entity_type": activity.entity_type,
            },
        }

    @staticmethod
    async def nurture_lost_lead(
        current_user: User,
        lead_id: str,
        *,
        note: Optional[str] = None,
    ) -> Dict[str, Any]:
        company_id = _user_company_id(current_user)
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if prospect.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this company")
        if prospect.status != ProspectStatus.LOST:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nurture can only be started for lost leads")

        now = datetime.utcnow()
        prospect.updated_at = now
        prospect.remark = prospect.remark if prospect.remark else None
        await prospect.save()

        await publish_crm_timeline_event(
            event_name="LostLeadNurtured",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(getattr(current_user, "id", "")),
            payload={
                "lead_id": str(prospect.id),
                "lead_name": prospect.prospect_name,
                "reason_for_lost": prospect.reason_for_lost,
                "note": note.strip() if note else None,
                "status": prospect.status.value,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "lost_lifecycle"},
        )

        return {
            "message": "Lost lead nurture recorded",
            "lead": _serialize_lead(prospect, prospect.current_stage),
        }

    @staticmethod
    async def lost_analytics(current_user: User) -> Dict[str, Any]:
        company_id = _user_company_id(current_user)
        lost_leads = await SalesProspect.find(
            {
                "company_id": company_id,
                "deleted": False,
                "status": ProspectStatus.LOST,
            }
        ).to_list()
        by_reason: Dict[str, int] = defaultdict(int)
        by_owner: Dict[str, int] = defaultdict(int)
        for lead in lost_leads:
            by_reason[(lead.reason_for_lost or "Unspecified").strip() or "Unspecified"] += 1
            by_owner[str(getattr(lead, "assigned_to", "") or "Unassigned")] += 1

        return {
            "company_id": company_id,
            "summary": {
                "total_lost": len(lost_leads),
                "with_reason": sum(1 for lead in lost_leads if lead.reason_for_lost),
                "without_reason": sum(1 for lead in lost_leads if not lead.reason_for_lost),
            },
            "by_reason": [{"reason": reason, "count": count} for reason, count in sorted(by_reason.items(), key=lambda item: (-item[1], item[0].lower()))],
            "by_owner": [{"owner_id": owner_id, "count": count} for owner_id, count in sorted(by_owner.items(), key=lambda item: (-item[1], item[0].lower()))],
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
