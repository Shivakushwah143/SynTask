from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.timeline.publisher import publish_crm_timeline_event
from app.crm.deal_automation import handle_won_deal_automation
from app.crm.lost_workflow import handle_lost_workflow
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.crm_deal import CRMDeal
from app.models.crm_proposal import CRMProposal
from app.crm.models import ProspectStatus, SalesProspect
from app.models.crm_company import CRMCompany
from app.models.user import User, UserRole
from beanie.exceptions import CollectionWasNotInitialized
from app.core.clock import utc_now


APPROVED_PIPELINE_STAGES: List[Dict[str, Any]] = [
    {"name": "Acquire", "order": 0, "category": "intake", "description": "Collect new leads from all sources and verify them.", "aliases": ["lead", "new"]},
    {"name": "Qualify", "order": 1, "category": "qualification", "description": "Determine whether the lead is worth pursuing.", "aliases": ["contacted", "follow up", "follow up call", "qualified"]},
    {"name": "Discovery", "order": 2, "category": "evaluation", "description": "Business discussion and requirements capture.", "aliases": ["discovery", "discovery scheduled", "discovery completed", "discovery done", "meeting completed"]},
    {"name": "Proposal", "order": 3, "category": "proposal", "description": "Solution presentation including pricing details.", "aliases": ["proposal", "proposal sent"]},
    {"name": "Negotiation", "order": 4, "category": "proposal", "description": "Commercial discussions on price, scope, and terms.", "aliases": ["negotiation"]},
    {"name": "Agreement", "order": 5, "category": "contract", "description": "Legal and contractual formalities (MSA, NDA, SOW).", "aliases": ["agreement"]},
    {"name": "Won", "order": 6, "category": "closed", "description": "Deal closed; preparing onboarding and transfer to Clients.", "aliases": ["won", "closed won"], "is_terminal": True},
    {"name": "Lost", "order": 7, "category": "closed", "description": "Opportunity closed without conversion.", "aliases": ["lost", "closed lost"], "is_terminal": True},
]

# Backward-compatible export expected by package imports and older call sites.
DEFAULT_PIPELINE_STAGES = APPROVED_PIPELINE_STAGES

DEFAULT_STAGE_LOOKUP: Dict[str, str] = {
    "new": "Acquire",
    "lead": "Acquire",
    "contacted": "Qualify",
    "follow up": "Qualify",
    "follow up call": "Qualify",
    "qualified": "Qualify",
    "discovery": "Discovery",
    "discovery scheduled": "Discovery",
    "discovery completed": "Discovery",
    "discovery done": "Discovery",
    "meeting completed": "Discovery",
    "proposal": "Proposal",
    "proposal sent": "Proposal",
    "negotiation": "Negotiation",
    "agreement": "Agreement",
    "won": "Won",
    "closed won": "Won",
    "lost": "Lost",
    "closed lost": "Lost",
}


class PipelineStage(str, Enum):
    ACQUIRE = "Acquire"
    QUALIFY = "Qualify"
    DISCOVERY = "Discovery"
    PROPOSAL = "Proposal"
    NEGOTIATION = "Negotiation"
    AGREEMENT = "Agreement"
    WON = "Won"
    LOST = "Lost"


ALLOWED_TRANSITIONS: Dict[PipelineStage, set[PipelineStage]] = {
    PipelineStage.ACQUIRE: {PipelineStage.QUALIFY, PipelineStage.LOST},
    PipelineStage.QUALIFY: {PipelineStage.DISCOVERY, PipelineStage.LOST},
    PipelineStage.DISCOVERY: {PipelineStage.PROPOSAL, PipelineStage.LOST},
    PipelineStage.PROPOSAL: {PipelineStage.NEGOTIATION, PipelineStage.LOST},
    PipelineStage.NEGOTIATION: {PipelineStage.AGREEMENT, PipelineStage.LOST},
    PipelineStage.AGREEMENT: {PipelineStage.WON, PipelineStage.LOST},
    PipelineStage.WON: set(),
    PipelineStage.LOST: {PipelineStage.ACQUIRE},
}


# ── Stage entry gates (sequential journey rules) ────────────────────────────────────
# A normal user may only move a lead to the immediately next stage when the recorded
# conditions for that stage have been met. Managers/admins may force a transition past
# the gate (but never skip stages) via the `force` flag.
STAGE_ENTRY_REQUIREMENTS: Dict[PipelineStage, Dict[str, Any]] = {
    PipelineStage.QUALIFY: {
        "field": "first_contact_at",
        "message": "Record a first contact attempt before moving this lead to Qualify.",
    },
    PipelineStage.DISCOVERY: {
        "fields": ["qualify_status", "budget", "decision_maker"],
        "message": "This lead must be interested, with budget and a decision maker recorded, before moving to Discovery.",
    },
    PipelineStage.PROPOSAL: {
        "field": "discovery_outcome",
        "expected": "need_proposal",
        "message": "The Discovery outcome must be 'Need Proposal' before moving to Proposal.",
    },
    PipelineStage.NEGOTIATION: {
        "proposal_accepted": True,
        "message": "The proposal must be accepted before moving to Negotiation.",
    },
    PipelineStage.AGREEMENT: {
        "field": "negotiation_status",
        "expected": "accepted",
        "message": "Final commercial terms must be accepted before moving to Agreement.",
    },
    PipelineStage.WON: {
        "field": "agreement_status",
        "expected": "signed",
        "message": "The agreement must be signed before marking this lead Won.",
    },
}

# ── Stage inner-status configuration (single canonical source) ──────────────────
# Keys are the canonical stage slugs; values are the ONLY allowed inner statuses
# for that stage. Both the status API and the frontend consume exactly this shape.
# Repeated labels (Draft / Sent / Viewed / Accepted / Rejected / Expired / Spam)
# are always scoped by the stage the lead is currently in.
STAGE_INNER_STATUSES: Dict[str, List[str]] = {
    "acquire": ["new", "imported", "assigned", "duplicate", "spam"],
    "qualify": ["not_contacted", "contacted", "busy", "call_back", "wrong_number", "no_response", "interested", "not_interested", "spam", "qualified"],
    "discovery": ["need_proposal", "need_audit", "need_second_meeting", "follow_up_required", "not_interested", "lost", "qualified"],
    "proposal": ["draft", "generated", "sent", "viewed", "accepted", "rejected", "revision_requested", "expired"],
    "negotiation": ["negotiation_started", "waiting_client", "waiting_internal", "discount_approval", "final_offer", "accepted", "rejected"],
    "agreement": ["draft", "sent", "viewed", "signed", "rejected", "expired"],
    "won": ["payment_pending", "payment_received", "onboarding_started", "ready", "transferred"],
}

# Default inner status applied when a lead enters a stage. Discovery intentionally
# starts UNSET until the salesperson records a valid meeting outcome.
STAGE_DEFAULT_STATUS: Dict[str, Optional[str]] = {
    "acquire": "new",
    "qualify": "not_contacted",
    "discovery": None,
    "proposal": "draft",
    "negotiation": "negotiation_started",
    "agreement": "draft",
    "won": "payment_pending",
}

# The existing per-stage domain field that owns the canonical status (Proposal is
# synced from CRMProposal, Won from the conversion lifecycle, ...). The lead's
# current_stage_status is a synchronized snapshot of this field for the current
# stage — one write path (apply_stage_status_change) keeps both consistent.
STAGE_STATUS_DOMAIN_FIELD: Dict[str, Optional[str]] = {
    "acquire": None,
    "qualify": "qualify_status",
    "discovery": "discovery_outcome",
    "proposal": "proposal_status",
    "negotiation": "negotiation_status",
    "agreement": "agreement_status",
    "won": "won_status",
}

# Human-readable labels used in activity text and error messages.
STAGE_STATUS_LABELS: Dict[str, str] = {
    "new": "New", "imported": "Imported", "assigned": "Assigned", "duplicate": "Duplicate", "spam": "Spam",
    "not_contacted": "Not Contacted", "contacted": "Contacted", "busy": "Busy", "call_back": "Call Back",
    "wrong_number": "Wrong Number", "no_response": "No Response", "interested": "Interested",
    "not_interested": "Not Interested", "qualified": "Qualified",
    "need_proposal": "Need Proposal", "need_audit": "Need Audit", "need_second_meeting": "Need Second Meeting",
    "follow_up_required": "Follow-up Required", "lost": "Lost",
    "draft": "Draft", "generated": "Generated", "sent": "Sent", "viewed": "Viewed", "accepted": "Accepted",
    "rejected": "Rejected", "revision_requested": "Revision Requested", "expired": "Expired",
    "negotiation_started": "Negotiation Started", "waiting_client": "Waiting Client",
    "waiting_internal": "Waiting Internal", "discount_approval": "Discount Approval", "final_offer": "Final Offer",
    "signed": "Signed",
    "payment_pending": "Payment Pending", "payment_received": "Payment Received",
    "onboarding_started": "Onboarding Started", "ready": "Ready", "transferred": "Transferred",
}

# Legacy per-stage sets/orders derived from the canonical map (existing callers).
QUALIFY_READY_STATUSES = {"interested", "qualified"}
QUALIFY_STATUSES = set(STAGE_INNER_STATUSES["qualify"])
DISCOVERY_OUTCOMES = set(STAGE_INNER_STATUSES["discovery"])
NEGOTIATION_STATUSES = set(STAGE_INNER_STATUSES["negotiation"])
AGREEMENT_STATUSES = set(STAGE_INNER_STATUSES["agreement"])
WON_STATUSES = list(STAGE_INNER_STATUSES["won"])


def _is_override_role(current_user: User) -> bool:
    return current_user.role in [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]


async def _validate_stage_entry(current_user: User, prospect: SalesProspect, target_stage: PipelineStage) -> None:
    """Enforce the sequential journey gates for a normal user moving to `target_stage`."""
    requirements = STAGE_ENTRY_REQUIREMENTS.get(target_stage)
    if not requirements:
        return
    # The unified stage-status snapshot (current_stage_status) is accepted as a
    # source for the gates alongside the per-stage domain field — the two are kept
    # in sync by apply_stage_status_change.
    if "field" in requirements:
        field_value = getattr(prospect, requirements["field"], None)
        expected = requirements.get("expected")
        if expected is not None:
            status_ok = _normalize_status_value(field_value) == expected
            status_ok = status_ok or _normalize_status_value(getattr(prospect, "current_stage_status", None)) == expected
            if not status_ok:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=requirements["message"])
        elif not field_value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=requirements["message"])
        return
    if "fields" in requirements:
        interest_ok = _normalize_status_value(getattr(prospect, "qualify_status", None)) in QUALIFY_READY_STATUSES
        interest_ok = interest_ok or _normalize_status_value(getattr(prospect, "current_stage_status", None)) in QUALIFY_READY_STATUSES
        budget_ok = getattr(prospect, "budget", None) not in (None, "", 0)
        decision_ok = bool(getattr(prospect, "decision_maker", None))
        missing = []
        if not interest_ok:
            missing.append("an Interested/Qualified status")
        if not budget_ok:
            missing.append("a recorded budget")
        if not decision_ok:
            missing.append("an identified decision maker")
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot move to Discovery — missing {', '.join(missing)}.",
            )
        return
    if requirements.get("proposal_accepted"):
        accepted = _normalize_status_value(getattr(prospect, "proposal_status", None)) == "accepted"
        accepted = accepted or _normalize_status_value(getattr(prospect, "current_stage_status", None)) == "accepted"
        if not accepted:
            try:
                proposal = await CRMProposal.find_one(
                    {
                        "company_id": str(prospect.company_id),
                        "lead_id": str(prospect.id),
                        "archived": False,
                        "status": "accepted",
                    }
                )
                accepted = proposal is not None
            except Exception:
                accepted = False
        if not accepted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=requirements["message"])
        return


def _normalize_stage_value(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def _normalize_status_value(value: Optional[str]) -> str:
    """Canonical inner-status slug: lowercase, spaces -> underscores.

    Accepts both display labels ("Need Proposal") and stored slugs
    ("need_proposal") so the status API and gate comparisons are robust to
    either form.
    """
    return re.sub(r"\s+", "_", str(value or "").strip().lower())


def _slugify_stage_name(name: str) -> str:
    return _normalize_stage_value(name).replace(" ", "-")


# ── Stage inner-status helpers (canonical config lives above) ─────────────────
def stage_status_key(stage_value: Optional[str]) -> Optional[str]:
    """Canonical slug of the stage that owns an inner status (e.g. 'qualify')."""
    stage = _resolve_pipeline_stage(stage_value)
    if not stage:
        return None
    if stage == PipelineStage.LOST:
        return "lost"
    return _slugify_stage_name(stage.value)


def stage_status_display(stage_value: Optional[str]) -> str:
    return normalize_stage_display(stage_value) or str(stage_value or "")


def stage_status_label(status_key: Optional[str]) -> str:
    return STAGE_STATUS_LABELS.get(_normalize_status_value(status_key), status_key) if status_key else ""


def resolved_stage_status(prospect: SalesProspect) -> Optional[str]:
    """Canonical inner status for the lead's current stage (display/query value).

    Domain field wins (it is the authoritative source, e.g. CRMProposal status);
    falls back to the stored snapshot, then the stage default. Existing leads
    without the new field therefore resolve correctly without a migration.
    """
    stage_key = stage_status_key(getattr(prospect, "current_stage", None))
    if not stage_key or stage_key == "lost":
        return getattr(prospect, "current_stage_status", None)
    domain_field = STAGE_STATUS_DOMAIN_FIELD.get(stage_key)
    if domain_field:
        value = _normalize_status_value(getattr(prospect, domain_field, None))
        if value:
            return value
    value = _normalize_status_value(getattr(prospect, "current_stage_status", None))
    if value:
        return value
    return STAGE_DEFAULT_STATUS.get(stage_key)


def _append_stage_status_history(
    prospect: SalesProspect,
    *,
    stage: str,
    from_status: Optional[str],
    to_status: Optional[str],
    user: Optional[User],
    now: Optional[datetime] = None,
) -> None:
    history = list(getattr(prospect, "stage_status_history", None) or [])
    history.append(
        {
            "stage": stage,
            "from_status": from_status or None,
            "to_status": to_status or None,
            "changed_by": str(getattr(user, "id", "")) if user else None,
            "changed_by_name": _user_display_name(user) if user else "System",
            "changed_at": (now or utc_now()).isoformat(),
        }
    )
    # Cap the embedded history to avoid unbounded document growth.
    prospect.stage_status_history = history[-200:]


def apply_stage_status_change(
    prospect: SalesProspect,
    *,
    stage_key: str,
    new_status: Optional[str],
    user: Optional[User],
    now: Optional[datetime] = None,
) -> bool:
    """Write an inner-status change: domain field + snapshot + history (one path).

    Returns True when the lead's current-stage snapshot actually changed; False
    for no-op updates (the selected status is already the current one).
    """
    now = now or utc_now()
    domain_field = STAGE_STATUS_DOMAIN_FIELD.get(stage_key)
    normalized = _normalize_status_value(new_status) if new_status else None
    if domain_field:
        setattr(prospect, domain_field, normalized)
    if stage_status_key(getattr(prospect, "current_stage", None)) != stage_key:
        # Only the domain field is kept in sync when the lead is elsewhere.
        return False
    previous = _normalize_status_value(getattr(prospect, "current_stage_status", None)) or None
    if previous == normalized:
        return False
    prospect.current_stage_status = normalized
    _append_stage_status_history(
        prospect,
        stage=stage_status_display(getattr(prospect, "current_stage", "")),
        from_status=previous,
        to_status=normalized,
        user=user,
        now=now,
    )
    return True


def initialize_stage_status(prospect: SalesProspect, user: Optional[User], now: Optional[datetime] = None) -> None:
    """Initialize the current stage's default inner status after a stage entry.

    Existing domain values are preserved (safe initialization); otherwise the
    stage default is applied. Discovery stays unset until an outcome is recorded.
    """
    stage_key = stage_status_key(getattr(prospect, "current_stage", None))
    if not stage_key or stage_key == "lost":
        return
    domain_field = STAGE_STATUS_DOMAIN_FIELD.get(stage_key)
    domain_value = _normalize_status_value(getattr(prospect, domain_field, None)) if domain_field else None
    target = domain_value or STAGE_DEFAULT_STATUS.get(stage_key)
    previous = _normalize_status_value(getattr(prospect, "current_stage_status", None)) or None
    if previous == target:
        return
    if target:
        prospect.current_stage_status = target
        if domain_field:
            setattr(prospect, domain_field, target)
    else:
        prospect.current_stage_status = None
    _append_stage_status_history(
        prospect,
        stage=stage_status_display(getattr(prospect, "current_stage", "")),
        from_status=None,
        to_status=target,
        user=user,
        now=now,
    )


def normalize_stage_display(value: Optional[str]) -> str:
    """Return the canonical display name for a stored/legacy stage value."""
    normalized = _normalize_stage_value(value)
    if not normalized:
        return ""
    for stage in PipelineStage:
        if normalized in {_normalize_stage_value(stage.value), _slugify_stage_name(stage.value)}:
            return stage.value
    canonical = DEFAULT_STAGE_LOOKUP.get(normalized)
    if canonical:
        return canonical
    return str(value or "")


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
    if current_user.role in [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN]:
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


async def _resolve_won_amount(company_id: str, prospect: SalesProspect) -> float:
    if getattr(prospect, "won_amount", None):
        return float(prospect.won_amount or 0)

    deal = await CRMDeal.find_one({"company_id": company_id, "lead_id": str(prospect.id)})
    if deal and getattr(deal, "value", 0):
        return float(deal.value or 0)

    try:
        proposals = await CRMProposal.find(
            {"company_id": company_id, "lead_id": str(prospect.id), "archived": False}
        ).sort("-updated_at").to_list(20)
    except CollectionWasNotInitialized:
        return 0.0
    for proposal in proposals:
        if getattr(proposal, "deal_value", 0):
            return float(proposal.deal_value or 0)
    return 0.0


async def _run_won_automation(current_user: User, prospect: SalesProspect, company_id: str) -> Dict[str, Any]:
    """Run the existing idempotent won-deal automation and return the created refs."""
    deal = await CRMDeal.find_one({"company_id": company_id, "lead_id": str(prospect.id)})
    try:
        result = await handle_won_deal_automation(current_user, prospect, deal)
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}
    client = result.get("client")
    project = result.get("project")
    meeting = result.get("meeting")
    return {
        "status": result.get("status", "completed"),
        "client_id": str(client.id) if client else None,
        "project_id": str(project.id) if project else None,
        "meeting_id": str(meeting.id) if meeting else None,
        "template": result.get("template"),
        "steps": result.get("steps"),
    }


def _serialize_lead(
    prospect: SalesProspect,
    resolved_stage: str,
    owner_map: Optional[Dict[str, str]] = None,
    company_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    stage_entered_at = prospect.stage_entered_at or prospect.created_at
    now = utc_now()
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
        "meta_lead_id": getattr(prospect, "meta_lead_id", None),
        "meta_campaign_id": getattr(prospect, "meta_campaign_id", None),
        "meta_adset_id": getattr(prospect, "meta_adset_id", None),
        "meta_ad_id": getattr(prospect, "meta_ad_id", None),
        "meta_form_id": getattr(prospect, "meta_form_id", None),
        "meta_created_time": getattr(prospect, "meta_created_time", None),
        "meta_consent": getattr(prospect, "meta_consent", None),
        "meta_attribution": getattr(prospect, "meta_attribution", None) or {},
        # ── Sales journey fields ──
        "source": getattr(prospect, "source", None),
        "first_contact_at": getattr(prospect, "first_contact_at", None),
        "last_contacted_at": getattr(prospect, "last_contacted_at", None),
        "next_action": getattr(prospect, "next_action", None),
        "next_follow_up_at": getattr(prospect, "next_follow_up_at", None),
        "qualify_status": getattr(prospect, "qualify_status", None),
        "industry": getattr(prospect, "industry", None),
        "requirement": getattr(prospect, "requirement", None),
        "budget": getattr(prospect, "budget", None),
        "timeline": getattr(prospect, "timeline", None),
        "decision_maker": getattr(prospect, "decision_maker", None),
        "location": getattr(prospect, "location", None),
        "pain_points": getattr(prospect, "pain_points", None),
        "current_agency": getattr(prospect, "current_agency", None),
        "num_employees": getattr(prospect, "num_employees", None),
        "discovery_outcome": getattr(prospect, "discovery_outcome", None),
        "discovery_notes": getattr(prospect, "discovery_notes", None),
        "proposal_status": getattr(prospect, "proposal_status", None),
        "negotiation_status": getattr(prospect, "negotiation_status", None),
        "negotiation_notes": getattr(prospect, "negotiation_notes", None),
        "agreement_status": getattr(prospect, "agreement_status", None),
        "agreement_expiry_date": getattr(prospect, "agreement_expiry_date", None),
        "agreement_signed_at": getattr(prospect, "agreement_signed_at", None),
        "won_status": getattr(prospect, "won_status", None),
        "client_id": getattr(prospect, "client_id", None),
        "project_id": getattr(prospect, "project_id", None),
        "invoice_id": getattr(prospect, "invoice_id", None),
        "account_manager_id": getattr(prospect, "account_manager_id", None),
        "welcome_email_sent_at": getattr(prospect, "welcome_email_sent_at", None),
        "ops_notified_at": getattr(prospect, "ops_notified_at", None),
        "converted_at": getattr(prospect, "converted_at", None),
        "transferred_at": getattr(prospect, "transferred_at", None),
        "transferred_by": getattr(prospect, "transferred_by", None),
        "current_stage_status": resolved_stage_status(prospect),
        "stage_status_history": list(getattr(prospect, "stage_status_history", None) or []),
    }


def _build_pipeline_summary(prospects: List[SalesProspect]) -> Dict[str, Any]:
    active = 0
    won = 0
    lost = 0
    total_days = 0
    staged_count = 0
    now = utc_now()

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
    async def load_pipeline(current_user: User, limit: int = 500) -> Dict[str, Any]:
        company_id = _user_company_id(current_user)
        stage_catalog = await _load_stage_documents(current_user)
        stage_index = _build_stage_index(stage_catalog)
        safe_limit = max(1, min(int(limit or 500), 1000))

        query: Dict[str, Any] = {
            "company_id": company_id,
            "deleted": False,
            # Transferred leads leave the active sales stage lists (they live in Clients).
            "transferred_at": None,
        }
        if current_user.role == UserRole.EMPLOYEE:
            current_user_id = str(getattr(current_user, "id", ""))
            query["$or"] = [
                {"assigned_to": current_user_id},
                {"assigned_by": current_user_id},
            ]

        prospects_query = SalesProspect.find(query)
        total_prospects = await prospects_query.count()
        ordered_prospects = SalesProspect.find(query).sort("-updated_at")
        try:
            prospects = await ordered_prospects.to_list(length=safe_limit)
        except TypeError:
            prospects = (await ordered_prospects.to_list())[:safe_limit]
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
                "limit": safe_limit,
                "total_leads": total_prospects,
                "has_more": total_prospects > len(prospects),
            },
        }

    @staticmethod
    async def move_lead(
        current_user: User,
        lead_id: str,
        target_stage: str,
        reason: Optional[str] = None,
        force: bool = False,
    ) -> Dict[str, Any]:
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

        # A transferred lead can no longer move through sales stages.
        if getattr(prospect, "transferred_at", None):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This lead has been transferred to Clients and cannot move through sales stages anymore.",
            )

        # Sequential journey gates: only managers/admins may force past them (never skip stages).
        target_enum = _resolve_pipeline_stage(resolved_stage)
        if target_enum and not (force and _is_override_role(current_user)):
            await _validate_stage_entry(current_user, prospect, target_enum)

        now = utc_now()
        previous_entered_at = prospect.stage_entered_at or prospect.created_at or now
        days_in_previous_stage = max((now - previous_entered_at).days, 0)

        prospect.current_stage = resolved_stage
        prospect.stage_last_changed_at = now
        prospect.stage_entered_at = now
        prospect.days_in_stage = 0
        prospect.updated_at = now

        normalized_stage = _normalize_stage_value(resolved_stage)
        lost_result: Optional[Dict[str, Any]] = None
        automation_result: Dict[str, Any] = {"status": "skipped"}
        if normalized_stage == "won":
            prospect.status = ProspectStatus.WON
            prospect.closed_date = now
            prospect.closed_by = str(getattr(current_user, "id", ""))
            prospect.reason_for_lost = None
            prospect.won_amount = await _resolve_won_amount(company_id, prospect)
            prospect.won_status = getattr(prospect, "won_status", None) or "payment_pending"
            prospect.converted_at = getattr(prospect, "converted_at", None) or now
            automation_result = await _run_won_automation(current_user, prospect, company_id)
            if automation_result.get("client_id"):
                prospect.client_id = automation_result["client_id"]
            if automation_result.get("project_id"):
                prospect.project_id = automation_result["project_id"]
        elif normalized_stage == "lost":
            lost_result = await handle_lost_workflow(current_user, prospect, reason)
            prospect = lost_result["lead"]
        elif prospect.status in [ProspectStatus.WON, ProspectStatus.LOST]:
            prospect.status = ProspectStatus.ACTIVE
            prospect.closed_date = None
            prospect.closed_by = None
            prospect.won_status = None
            prospect.client_id = None
            prospect.project_id = None

        # Initialize the next stage's default inner status (Discovery stays unset).
        initialize_stage_status(prospect, current_user, now)

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
            try:
                if deal:
                    now = utc_now()
                    deal.stage = "won"
                    deal.updated_by = str(getattr(current_user, "id", ""))
                    deal.updated_by_name = _user_display_name(current_user)
                    deal.updated_at = now
                    await deal.save()
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
    async def update_stage_status(current_user: User, lead_id: str, stage_status: str) -> Dict[str, Any]:
        """Stage-scoped inner-status update — the single write path for stage statuses.

        The stage is always read from the database (never trusted from the client),
        so a Proposal status can never be applied while the lead is in Qualify.
        """
        company_id = _user_company_id(current_user)
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if prospect.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this company")
        if not _can_write_pipeline(current_user, prospect):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to update this lead")

        stage_key = stage_status_key(prospect.current_stage)
        if not stage_key or stage_key == "lost":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This lead is not in a stage that has inner statuses.",
            )

        normalized = _normalize_status_value(stage_status)
        allowed = STAGE_INNER_STATUSES.get(stage_key, [])
        if normalized not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{stage_status}' is not a valid status for the {stage_status_display(prospect.current_stage)} stage.",
            )

        # ── Stage-specific rules ──
        if stage_key == "qualify" and normalized == "qualified":
            interest_ok = _normalize_status_value(getattr(prospect, "qualify_status", None)) in QUALIFY_READY_STATUSES
            interest_ok = interest_ok or _normalize_status_value(getattr(prospect, "current_stage_status", None)) in QUALIFY_READY_STATUSES
            budget_ok = getattr(prospect, "budget", None) not in (None, "", 0)
            decision_ok = bool(getattr(prospect, "decision_maker", None))
            missing = []
            if not budget_ok:
                missing.append("budget")
            if not decision_ok:
                missing.append("decision-maker information")
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Qualified cannot be selected until {' and '.join(missing)} are completed.",
                )
            if not interest_ok:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The lead must be marked Interested before it can be Qualified.",
                )
        if stage_key == "won":
            if normalized == "transferred":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The lead cannot be marked Transferred because the client handoff has not completed. Use the Transfer action.",
                )
            # Won lifecycle moves forward only (mirrors the conversion service).
            current_won = _normalize_status_value(getattr(prospect, "won_status", None)) or None
            if current_won and current_won in STAGE_INNER_STATUSES["won"] and normalized != current_won:
                current_index = STAGE_INNER_STATUSES["won"].index(current_won)
                target_index = STAGE_INNER_STATUSES["won"].index(normalized)
                if target_index < current_index:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot move Won status backward from '{current_won}' to '{normalized}'.",
                    )

        current = _normalize_status_value(getattr(prospect, "current_stage_status", None)) or None
        now = utc_now()
        changed = apply_stage_status_change(
            prospect, stage_key=stage_key, new_status=normalized, user=current_user, now=now
        )
        prospect.updated_at = now
        await prospect.save()

        if changed:
            await publish_crm_timeline_event(
                event_name="LeadStageStatusChanged",
                aggregate_type="sales_prospect",
                aggregate_id=str(prospect.id),
                company_id=company_id,
                actor_id=str(getattr(current_user, "id", "")),
                payload={
                    "lead_id": str(prospect.id),
                    "lead_name": prospect.prospect_name,
                    "company_id": company_id,
                    "stage": stage_status_display(prospect.current_stage),
                    "stage_key": stage_key,
                    "previous_status": current,
                    "new_status": normalized,
                    "updated_at": now.isoformat(),
                },
                metadata={"surface": "crm", "workflow": "pipeline_status"},
            )

        return {
            "lead": _serialize_lead(prospect, normalize_stage_display(prospect.current_stage)),
            "status": resolved_stage_status(prospect),
            "previous_status": current,
            "changed": changed,
            "message": "Stage status updated successfully" if changed else "Stage status unchanged",
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

        now = utc_now()
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
        # Reopened leads start at the Acquire stage default inner status.
        initialize_stage_status(prospect, current_user, now)
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

        now = utc_now()
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

        now = utc_now()
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
