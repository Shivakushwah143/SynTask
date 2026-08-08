from __future__ import annotations

import logging
import re
import uuid
from collections import defaultdict
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

from fastapi import HTTPException, status

from app.timeline.publisher import publish_crm_timeline_event
from app.crm.deal_automation import handle_won_deal_automation
from app.crm.lost_workflow import handle_lost_workflow
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.crm_deal import CRMDeal
from app.models.crm_proposal import CRMProposal
from app.models.crm_document import CRMDocument
from app.models.sales_lead_note import SalesLeadNote
from app.models.sales_lead_file import SalesLeadFile
from app.crm.models import ProspectStatus, SalesProspect
from app.models.crm_company import CRMCompany
from app.models.user import User, UserRole
from beanie.exceptions import CollectionWasNotInitialized
from pymongo.errors import DuplicateKeyError
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
        "message": "Add a mobile number or record the first contact attempt before moving this lead to Qualify.",
    },
    PipelineStage.DISCOVERY: {
        "fields": ["qualify_status", "budget", "decision_maker"],
        "message": "This lead must be interested, with budget and a decision maker recorded, before moving to Discovery.",
    },
    PipelineStage.PROPOSAL: {
        "field": "discovery_outcome",
        "expected": "need_proposal",
        # A lead whose discovery meeting outcome is "qualified" has also earned a
        # proposal — both outcomes satisfy the Discovery -> Proposal gate.
        # Entries are compared after _normalize_status_value, so they must stay
        # normalized slugs ("need_proposal", never "Need Proposal").
        "allowed": ["need_proposal", "qualified"],
        "message": "The Discovery outcome must be 'Need Proposal' or 'Qualified' before moving to Proposal.",
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
    "acquire": ["new", "imported", "assigned", "not_contacted", "contacted", "wrong_number", "no_response", "duplicate", "spam"],
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


# Human-readable metadata for the editable fields a stage gate may ask for.
# The frontend popup renders exactly these fields (see salesTransition.js).
STAGE_GATE_FIELD_META: Dict[str, Dict[str, str]] = {
    "budget": {"label": "Budget", "type": "currency"},
    "decision_maker": {"label": "Decision Maker", "type": "text"},
    "timeline": {"label": "Timeline", "type": "text"},
    "phone": {"label": "Mobile Number", "type": "text"},
    "discovery_outcome": {"label": "Discovery Outcome", "type": "select"},
    "qualify_status": {"label": "Qualification Status", "type": "select"},
    "proposal_status": {"label": "Proposal Status", "type": "select"},
    "negotiation_status": {"label": "Negotiation Status", "type": "select"},
    "agreement_status": {"label": "Agreement Status", "type": "select"},
    "won_status": {"label": "Won Status", "type": "select"},
    "account_manager_id": {"label": "Account Manager", "type": "user"},
    "client_id": {"label": "Client", "type": "reference"},
    "company_name": {"label": "Company", "type": "text"},
}


_LAST_MISSING_STATUS_LABELS: Dict[str, str] = {
    "qualify_status": "Qualification Status",
    "discovery_outcome": "Discovery Outcome",
    "proposal_status": "Proposal Status",
    "negotiation_status": "Negotiation Status",
    "agreement_status": "Agreement Status",
    "won_status": "Won Status",
    "current_stage_status": "Inner Status",
}


def _field_meta(field: str) -> Dict[str, str]:
    meta = STAGE_GATE_FIELD_META.get(field, {})
    return {
        "field": field,
        "label": meta.get("label") or field.replace("_", " ").title(),
        "type": meta.get("type") or "text",
    }


def _transition_blocked(
    *,
    current_stage: str,
    target_stage: str,
    message: str,
    missing_fields: Optional[List[Dict[str, Any]]] = None,
    status_requirement: Optional[Dict[str, Any]] = None,
    action_requirement: Optional[Dict[str, Any]] = None,
) -> HTTPException:
    """Structured business-validation blocker for a stage transition.

    The `detail` stays a stable object so the frontend can classify the blocker
    (missing details vs. status requirement vs. action requirement) instead of
    parsing human text. The `message` key preserves the user-safe copy for
    legacy consumers that only read the string.
    """
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": "STAGE_TRANSITION_BLOCKED",
            "severity": "warning",
            "current_stage": current_stage,
            "target_stage": target_stage,
            "message": message,
            "missing_fields": missing_fields or [],
            "status_requirement": status_requirement,
            "action_requirement": action_requirement,
        },
    )


async def _validate_stage_entry(
    current_user: User,
    prospect: SalesProspect,
    target_stage: PipelineStage,
    current_stage_name: str,
) -> None:
    """Enforce the sequential journey gates for a normal user moving to `target_stage`.

    Every blocker is raised as a structured STAGE_TRANSITION_BLOCKED response so
    the frontend can open the required-details popup or show a warning without
    parsing human text.
    """
    requirements = STAGE_ENTRY_REQUIREMENTS.get(target_stage)
    if not requirements:
        return
    target_stage_name = target_stage.value
    # The unified stage-status snapshot (current_stage_status) is accepted as a
    # source for the gates alongside the per-stage domain field — the two are kept
    # in sync by apply_stage_status_change.
    if "field" in requirements:
        field = requirements["field"]
        field_value = getattr(prospect, field, None)
        expected = requirements.get("expected")
        # First-contact is an action requirement (record a contact activity), not
        # an editable lead field. A lead already passes when contact evidence
        # exists: an explicit first_contact_at, a last_contacted_at timestamp, or
        # a recorded call/email/follow-up activity on the lead. This prevents
        # leads that already have contact history (phone, call logs) from being
        # blocked by the missing gate field.
        if field == "first_contact_at":
            contact_ok = bool(field_value) or bool(getattr(prospect, "last_contacted_at", None))
            # A lead that already carries a mobile number is contactable — a
            # recorded phone is enough to move Acquire -> Qualify (CSV/imported
            # leads usually have a number but no contact activity yet). Checked
            # first because it is the cheapest and most common pass condition.
            if not contact_ok:
                contact_ok = bool(getattr(prospect, "phone", None))
            if not contact_ok:
                try:
                    activity_ok = await CRMActivity.find_one(
                        {
                            "company_id": str(getattr(prospect, "company_id", "") or ""),
                            "entity_type": "lead",
                            "entity_id": str(prospect.id),
                            "activity_type": {"$in": ["call", "email", "follow_up", "meeting"]},
                            "status": {"$in": ["completed", "in_progress"]},
                        }
                    )
                    contact_ok = activity_ok is not None
                except Exception:
                    contact_ok = False
            if not contact_ok:
                raise _transition_blocked(
                    current_stage=current_stage_name,
                    target_stage=target_stage_name,
                    message="Add a mobile number or record the first contact attempt before moving this lead to Qualify.",
                    missing_fields=[_field_meta("phone")],
                    action_requirement={
                        "field": "first_contact",
                        "label": "First Contact",
                        "message": "Add the lead's mobile number, or record a call, email, WhatsApp attempt before moving this lead to Qualify.",
                    },
                )
            return
        if expected is not None:
            # Some gates accept more than one outcome (e.g. Discovery -> Proposal
            # passes with "need_proposal" OR "qualified"). `allowed` extends the
            # single-value `expected` default; both are normalized slugs.
            allowed_values = requirements.get("allowed") or [expected]
            status_ok = _normalize_status_value(field_value) in allowed_values
            status_ok = status_ok or _normalize_status_value(getattr(prospect, "current_stage_status", None)) in allowed_values
            if not status_ok:
                if not field_value:
                    raise _transition_blocked(
                        current_stage=current_stage_name,
                        target_stage=target_stage_name,
                        message=requirements["message"],
                        missing_fields=[_field_meta(field)],
                    )
                raise _transition_blocked(
                    current_stage=current_stage_name,
                    target_stage=target_stage_name,
                    message=requirements["message"],
                    status_requirement={
                        "field": field,
                        "label": _LAST_MISSING_STATUS_LABELS.get(field, _field_meta(field)["label"]),
                        "allowed_values": allowed_values,
                        "current_value": field_value or getattr(prospect, "current_stage_status", None) or "",
                    },
                )
        elif not field_value:
            raise _transition_blocked(
                current_stage=current_stage_name,
                target_stage=target_stage_name,
                message=requirements["message"],
                missing_fields=[_field_meta(field)],
            )
        return
    if "fields" in requirements:
        interest_ok = _normalize_status_value(getattr(prospect, "qualify_status", None)) in QUALIFY_READY_STATUSES
        interest_ok = interest_ok or _normalize_status_value(getattr(prospect, "current_stage_status", None)) in QUALIFY_READY_STATUSES
        # A recorded deal value satisfies the budget gate too: the lead-detail
        # header edit writes won_amount (labeled "Deal value") while the overview
        # writes budget — both are real deal sizes, so a lead carrying either one
        # must never be asked to fill a separate Budget field again.
        budget_ok = getattr(prospect, "budget", None) not in (None, "", 0)
        budget_ok = budget_ok or getattr(prospect, "won_amount", None) not in (None, "", 0)
        budget_ok = budget_ok or getattr(prospect, "deal_value", None) not in (None, "", 0)
        decision_ok = bool(getattr(prospect, "decision_maker", None))
        missing_fields = []
        if not budget_ok:
            missing_fields.append(_field_meta("budget"))
        if not decision_ok:
            missing_fields.append(_field_meta("decision_maker"))
        missing_labels = [item["label"] for item in missing_fields]
        status_requirement = None
        if not interest_ok:
            status_requirement = {
                "field": "qualify_status",
                "label": "Qualification Status",
                "allowed_values": sorted(QUALIFY_READY_STATUSES),
                "current_value": getattr(prospect, "qualify_status", None) or getattr(prospect, "current_stage_status", None) or "",
            }
        if missing_fields or status_requirement:
            parts = [item["label"] for item in missing_fields]
            if status_requirement:
                parts.append("an Interested/Qualified status")
            raise _transition_blocked(
                current_stage=current_stage_name,
                target_stage=target_stage_name,
                message=f"Cannot move to Discovery — missing {', '.join(parts)}.",
                missing_fields=missing_fields,
                status_requirement=status_requirement,
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
            raise _transition_blocked(
                current_stage=current_stage_name,
                target_stage=target_stage_name,
                message=requirements["message"],
                status_requirement={
                    "field": "proposal_status",
                    "label": "Proposal Status",
                    "allowed_values": ["accepted"],
                    "current_value": getattr(prospect, "proposal_status", None) or getattr(prospect, "current_stage_status", None) or "",
                },
            )
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
    if not value:
        value = STAGE_DEFAULT_STATUS.get(stage_key) or ""
    # In Acquire, a lead with an owner is Assigned — the generic new/imported
    # intake defaults only describe un-owned leads. Creation/import and owner
    # reassignment persist "assigned" too; this read-time rule also keeps
    # pre-existing assigned leads consistent without a data migration.
    if (
        stage_key == "acquire"
        and getattr(prospect, "assigned_to", None)
        and value in ("", "new", "imported")
    ):
        value = "assigned"
    return value or None


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


DELETE_LEAD_ARCHIVE_COLLECTION = "sales_prospect_delete_archives"


async def _archive_lead_snapshot(prospect: SalesProspect, company_id: str, current_user: User) -> str:
    """Snapshot a lead plus every child record and return a restore token.

    Used by delete_lead for the Undo feature. The snapshot is stored in a raw
    archive collection so the lead and all of its children can be re-inserted
    with their original _ids by restore_lead. Every child query is best-effort:
    a missing collection must never block the archive.
    """
    from app.core.database import get_database

    db = get_database()
    lead_key = str(prospect.id)
    children: Dict[str, List[Dict[str, Any]]] = {}

    child_queries = [
        (SalesPipelineHistory.Settings.name, {"company_id": company_id, "lead_id": lead_key}),
        (CRMDeal.Settings.name, {"company_id": company_id, "lead_id": lead_key}),
        (CRMProposal.Settings.name, {"company_id": company_id, "lead_id": lead_key}),
        (CRMDocument.Settings.name, {"company_id": company_id, "lead_id": lead_key}),
        (SalesLeadNote.Settings.name, {"company_id": company_id, "lead_id": lead_key}),
        (SalesLeadFile.Settings.name, {"company_id": company_id, "lead_id": lead_key}),
        (CRMActivity.Settings.name, {"company_id": company_id, "entity_type": "lead", "entity_id": lead_key}),
    ]
    try:
        from app.models.task import Task
        from app.models.ownership_transfer import OwnershipTransfer

        child_queries.append(
            (
                Task.Settings.name,
                {
                    "company_id": company_id,
                    "related_entity_type": "sales_lead",
                    "related_entity_id": lead_key,
                },
            )
        )
        child_queries.append(
            (
                OwnershipTransfer.Settings.name,
                {"company_id": company_id, "entity_type": "lead", "entity_id": lead_key},
            )
        )
    except Exception:  # pragma: no cover - defensive
        pass

    for collection_name, filt in child_queries:
        try:
            children[collection_name] = await db[collection_name].find(filt).to_list(length=None)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("LEAD_DELETE_SNAPSHOT_CHILD_FAILED collection=%s error=%s", collection_name, exc)
            children[collection_name] = []

    lead_raw = await db[SalesProspect.Settings.name].find_one({"_id": prospect.id})
    restore_token = str(uuid.uuid4())
    await db[DELETE_LEAD_ARCHIVE_COLLECTION].insert_one(
        {
            "_id": restore_token,
            "company_id": company_id,
            "lead_id": lead_key,
            "deleted_by": str(getattr(current_user, "id", "")),
            "deleted_at": utc_now(),
            "lead": lead_raw,
            "children": children,
        }
    )
    return restore_token


async def _fetch_prospects_resilient(query: Dict[str, Any], limit: int) -> List[SalesProspect]:
    """Fetch lead documents, skipping legacy records that fail model validation.

    Dirty legacy documents (invalid emails, wrong value types, unknown enums)
    must never take down the whole pipeline board. Validating each document
    individually lets the board keep loading while the offending records are
    cleaned up separately.
    """
    from pydantic import ValidationError

    collection = SalesProspect.get_pymongo_collection()
    raw_docs = await (
        collection.find(query)
        .sort([("updated_at", -1)])
        .limit(limit)
        .to_list(length=limit)
    )
    prospects: List[SalesProspect] = []
    skipped = 0
    for raw in raw_docs:
        try:
            prospects.append(SalesProspect.model_validate(raw))
        except ValidationError:
            skipped += 1
    if skipped:
        logger.warning(
            "Skipped %s invalid sales_prospect document(s) while loading the pipeline; run scripts/cleanup_invalid_lead_emails.py to repair dirty records.",
            skipped,
        )
    return prospects


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
        try:
            # Primary path: skip legacy documents that fail model validation so
            # one dirty record can never 500 the whole board.
            prospects = await _fetch_prospects_resilient(query, safe_limit)
        except CollectionWasNotInitialized:
            # Beanie-uninitialized fallback (unit tests patch SalesProspect.find
            # but not the raw pymongo collection): the regular beanie fetch.
            # Genuine DB/network failures are NOT caught here and surface as
            # real technical errors instead of being masked by the legacy path.
            logger.warning(
                "Pipeline resilient fetch unavailable (beanie not initialized); falling back to the standard fetch."
            )
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
            raise _transition_blocked(
                current_stage=current_stage,
                target_stage=resolved_stage,
                message=f"This lead is already in the {resolved_stage} stage.",
            )
        if not _is_allowed_transition(current_stage, resolved_stage):
            raise _transition_blocked(
                current_stage=current_stage,
                target_stage=resolved_stage,
                message=f"Cannot skip stages: move {current_stage} leads through {resolved_stage} only via the required workflow sequence.",
                action_requirement={
                    "field": "stage_sequence",
                    "label": "Stage Sequence",
                    "message": "Move the lead through each stage in order (e.g. from Qualify to Discovery, not directly to Proposal).",
                },
            )

        # A transferred lead can no longer move through sales stages.
        if getattr(prospect, "transferred_at", None):
            raise _transition_blocked(
                current_stage=current_stage,
                target_stage=resolved_stage,
                message="This lead has been transferred to Clients and cannot move through sales stages anymore.",
                action_requirement={
                    "field": "transfer",
                    "label": "Client Handoff",
                    "message": "Manage this client from the Clients module; the lead record is preserved for history.",
                },
            )

        # Sequential journey gates: only managers/admins may force past them (never skip stages).
        target_enum = _resolve_pipeline_stage(resolved_stage)
        if target_enum and not (force and _is_override_role(current_user)):
            await _validate_stage_entry(current_user, prospect, target_enum, current_stage)

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
            # Same budget evidence as the Qualify -> Discovery gate: won_amount
            # (header "Deal value") or deal_value also counts.
            budget_ok = getattr(prospect, "budget", None) not in (None, "", 0)
            budget_ok = budget_ok or getattr(prospect, "won_amount", None) not in (None, "", 0)
            budget_ok = budget_ok or getattr(prospect, "deal_value", None) not in (None, "", 0)
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
    async def bulk_assign(
        current_user: User,
        lead_ids: List[str],
        target_user_id: str,
    ) -> Dict[str, Any]:
        """Assign multiple leads to one user (Acquire bulk action).

        The target user is validated once up front; every lead then follows the
        exact single-assignment rules (tenant scope, write permission, transferred
        exclusion, ownership-transfer record). Leads that cannot be assigned are
        skipped with a reason — a batch never fails because of one bad lead.
        Owned Acquire leads are promoted to the ``assigned`` inner status exactly
        like the single-lead update path.
        """
        from app.crm.lead_engine import AssignmentEngine
        from app.models.ownership_transfer import OwnershipTransfer

        company_id = _user_company_id(current_user)
        normalized_target = str(target_user_id or "").strip()
        if not normalized_target:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_user_id is required")
        await AssignmentEngine.validate_target_user(current_user, normalized_target)

        now = utc_now()
        assigned: List[str] = []
        skipped: List[Dict[str, Any]] = []
        for lead_id in lead_ids or []:
            prospect = await SalesProspect.get(lead_id)
            if not prospect or prospect.deleted:
                skipped.append({"lead_id": lead_id, "reason": "Lead not found"})
                continue
            if prospect.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
                skipped.append({"lead_id": lead_id, "reason": "Access denied to this company"})
                continue
            if not _can_write_pipeline(current_user, prospect):
                skipped.append({"lead_id": lead_id, "reason": "No permission to update this lead"})
                continue
            if getattr(prospect, "transferred_at", None):
                skipped.append({"lead_id": lead_id, "reason": "Lead transferred to Clients"})
                continue
            previous_assignee = getattr(prospect, "assigned_to", None)
            if str(previous_assignee or "") == normalized_target:
                # Already owned by the target — nothing to change, still counted.
                assigned.append(lead_id)
                continue
            prospect.assigned_to = normalized_target
            prospect.updated_at = now
            await OwnershipTransfer(
                company_id=str(prospect.company_id),
                entity_type="lead",
                entity_id=str(prospect.id),
                from_user_id=str(previous_assignee) if previous_assignee else None,
                to_user_id=normalized_target,
                reason="bulk_assignment",
                transferred_by=str(getattr(current_user, "id", "")),
                notes="Bulk assignment from the pipeline stage list",
            ).insert()
            stage_key = stage_status_key(getattr(prospect, "current_stage", None))
            if stage_key == "acquire":
                current_status = _normalize_status_value(getattr(prospect, "current_stage_status", None))
                if current_status in ("", "new", "imported"):
                    apply_stage_status_change(
                        prospect, stage_key=stage_key, new_status="assigned", user=current_user, now=now
                    )
            await prospect.save()
            assigned.append(lead_id)
        return {
            "assigned": assigned,
            "assigned_count": len(assigned),
            "skipped": skipped,
            "skipped_count": len(skipped),
            "target_user_id": normalized_target,
            "message": f"Assigned {len(assigned)} lead(s) to the selected user.",
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

    @staticmethod
    async def delete_lead(current_user: User, lead_id: str) -> Dict[str, Any]:
        """Permanently delete a lead (hard delete) and cascade-clean its records.

        The lead document itself is removed from ``sales_prospects`` (a hard
        delete) so its unique email / meta-lead keys are freed and the same lead
        can be re-created afterwards. Before the delete, a full snapshot (lead +
        every child record) is archived under a restore token so the UI can offer
        an Undo that restores everything.

        Ordering matters: the lead is deleted FIRST (the critical operation) and
        the child cleanup runs best-effort afterwards, so a hiccup on one child
        collection can never turn a successful deletion into a 500 that the
        frontend misreads as "failed" while the lead is actually gone.
        """
        company_id = _user_company_id(current_user)
        prospect = await SalesProspect.get(lead_id)
        if not prospect or prospect.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if prospect.company_id != company_id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this company")
        if not _can_write_pipeline(current_user, prospect):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to delete this lead")

        lead_key = str(prospect.id)
        restore_token: Optional[str] = None

        # 1. Snapshot lead + children for the Undo feature. Best-effort: a
        #    snapshot failure must never block the deletion itself.
        try:
            restore_token = await _archive_lead_snapshot(prospect, company_id, current_user)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("LEAD_DELETE_SNAPSHOT_FAILED lead_id=%s error=%s", lead_key, exc)

        # 2. Hard-delete the lead itself FIRST — the guaranteed operation.
        await prospect.delete()

        # 3. Cascade child cleanup, best-effort per collection.
        deleted: Dict[str, int] = {}
        cascade_targets = [
            (SalesPipelineHistory, {"company_id": company_id, "lead_id": lead_key}, "history"),
            (CRMDeal, {"company_id": company_id, "lead_id": lead_key}, "deals"),
            (CRMProposal, {"company_id": company_id, "lead_id": lead_key}, "proposals"),
            (CRMDocument, {"company_id": company_id, "lead_id": lead_key}, "documents"),
            (SalesLeadNote, {"company_id": company_id, "lead_id": lead_key}, "notes"),
            (SalesLeadFile, {"company_id": company_id, "lead_id": lead_key}, "files"),
            (
                CRMActivity,
                {"company_id": company_id, "entity_type": "lead", "entity_id": lead_key},
                "activities",
            ),
        ]
        for model, filt, key in cascade_targets:
            try:
                deleted[key] = await model.find(filt).delete()
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("LEAD_DELETE_CASCADE_FAILED collection=%s lead_id=%s error=%s", key, lead_key, exc)
                deleted[key] = 0

        # Lazy imports keep the module import graph acyclic (same pattern as
        # bulk_assign). Calendar events for leads are derived from Tasks, so
        # deleting the tasks also clears the calendar — no separate pass needed.
        try:
            from app.models.task import Task

            deleted["tasks"] = await Task.find(
                {
                    "company_id": company_id,
                    "related_entity_type": "sales_lead",
                    "related_entity_id": lead_key,
                }
            ).delete()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("LEAD_DELETE_TASKS_FAILED lead_id=%s error=%s", lead_key, exc)
            deleted["tasks"] = 0
        try:
            from app.models.ownership_transfer import OwnershipTransfer

            deleted["ownership_transfers"] = await OwnershipTransfer.find(
                {
                    "company_id": company_id,
                    "entity_type": "lead",
                    "entity_id": lead_key,
                }
            ).delete()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("LEAD_DELETE_OWNERSHIP_TRANSFERS_FAILED lead_id=%s error=%s", lead_key, exc)
            deleted["ownership_transfers"] = 0

        logger.info(
            "LEAD_DELETE_COMPLETED lead_id=%s company_id=%s deleted=%s",
            lead_key,
            company_id,
            deleted,
        )
        return {
            "message": "Lead deleted permanently",
            "deleted_lead_id": lead_key,
            "deleted": deleted,
            "restore_token": restore_token,
        }

    @staticmethod
    async def restore_lead(current_user: User, restore_token: str) -> Dict[str, Any]:
        """Restore a hard-deleted lead and all of its archived records (Undo).

        Reads the snapshot written by delete_lead, re-inserts the lead document
        (original _id preserved) plus every child record, then removes the
        archive entry. Company isolation is enforced on the archive lookup.
        """
        from app.core.database import get_database

        company_id = _user_company_id(current_user)
        db = get_database()
        archive_col = db[DELETE_LEAD_ARCHIVE_COLLECTION]
        archive = await archive_col.find_one({"_id": restore_token, "company_id": company_id})
        if not archive:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restore record not found or expired")

        # Re-insert the lead itself (original _id preserved). If a new lead was
        # created with the same email / meta-lead key after the delete, the
        # unique index rejects this — report a clear 409 instead of a raw 500.
        try:
            await db[SalesProspect.Settings.name].insert_one(archive["lead"])
        except DuplicateKeyError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot restore: a lead with the same email or identifier was already re-created",
            )
        # Re-insert every archived child record.
        for collection_name, docs in (archive.get("children") or {}).items():
            if not docs:
                continue
            try:
                await db[collection_name].insert_many(docs)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("LEAD_RESTORE_CHILD_FAILED collection=%s error=%s", collection_name, exc)
        await archive_col.delete_one({"_id": restore_token})

        logger.info(
            "LEAD_RESTORE_COMPLETED lead_id=%s company_id=%s restore_token=%s",
            archive["lead_id"],
            company_id,
            restore_token,
        )
        return {
            "message": "Lead restored",
            "lead_id": archive["lead_id"],
            "restore_token": restore_token,
        }

    @staticmethod
    async def bulk_delete_leads(current_user: User, lead_ids: List[str]) -> Dict[str, Any]:
        """Delete many leads at once, reusing the single-lead cascade delete.

        Each lead is handled independently (permission / ownership / company
        checks are per lead), so one blocked lead never fails the whole batch.
        """
        results: List[Dict[str, Any]] = []
        for lead_id in lead_ids or []:
            try:
                res = await CRMPipelineService.delete_lead(current_user, lead_id)
                results.append(
                    {
                        "lead_id": lead_id,
                        "status": "deleted",
                        "restore_token": res.get("restore_token"),
                    }
                )
            except HTTPException as exc:
                results.append(
                    {
                        "lead_id": lead_id,
                        "status": "error",
                        "status_code": exc.status_code,
                        "reason": exc.detail,
                    }
                )
        deleted_count = sum(1 for item in results if item["status"] == "deleted")
        return {
            "results": results,
            "deleted_count": deleted_count,
            "skipped_count": len(results) - deleted_count,
        }
