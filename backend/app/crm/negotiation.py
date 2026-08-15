from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.core.rbac_visibility import require_owned_record_access
from app.crm.pipeline import (
    NEGOTIATION_STATUSES,
    STAGE_STATUS_LABELS,
    apply_stage_status_change,
    stage_status_key,
)
from app.models.crm_activity import CRMActivityPriority, CRMActivityStatus
from app.models.sales_prospect import SalesProspect
from app.models.user import User, UserRole
from app.services.notification_service import notification_service


EDIT_ROLES = {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}
NEGOTIATION_FIELDS = {
    "accepted_quotation_reference",
    "customer_counter_offer",
    "final_agreed_amount",
    "discount",
    "final_scope",
    "payment_terms",
    "delivery_timeline",
    "client_conditions",
    "negotiation_notes",
    "next_follow_up",
    "next_follow_up_at",
    "negotiation_status",
}
NEGOTIATION_STAGE_ORDER = ["acquire", "qualify", "discovery", "proposal", "negotiation", "agreement", "won"]


def _text(value: Any) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid numeric value: {value}")


def _status(value: Any) -> Optional[str]:
    if value in (None, ""):
        return None
    normalized = str(value).strip().lower().replace(" ", "_")
    if normalized not in NEGOTIATION_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"'{value}' is not a valid negotiation status.")
    return normalized


async def _lead_for_user(current_user: User, lead_id: str) -> SalesProspect:
    lead = await SalesProspect.get(lead_id)
    if not lead or lead.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    await require_owned_record_access(current_user, lead, ownership_fields=("assigned_to", "assigned_by", "created_by"))
    return lead


def _assert_can_edit(current_user: User) -> None:
    if current_user.role not in EDIT_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def _assert_negotiation_unlocked(lead: SalesProspect) -> None:
    stage_key = stage_status_key(getattr(lead, "current_stage", None)) or "acquire"
    current_index = NEGOTIATION_STAGE_ORDER.index(stage_key) if stage_key in NEGOTIATION_STAGE_ORDER else -1
    required_index = NEGOTIATION_STAGE_ORDER.index("negotiation")
    if current_index < required_index:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Negotiation unlocks after the lead reaches Negotiation.")


def serialize_negotiation(lead: SalesProspect) -> dict[str, Any]:
    return {
        "lead_id": str(lead.id),
        "accepted_quotation_reference": getattr(lead, "accepted_quotation_reference", None),
        "negotiation_status": getattr(lead, "negotiation_status", None),
        "negotiation_status_label": STAGE_STATUS_LABELS.get(getattr(lead, "negotiation_status", None) or "", getattr(lead, "negotiation_status", None)),
        "customer_counter_offer": getattr(lead, "customer_counter_offer", None),
        "final_agreed_amount": getattr(lead, "won_amount", None),
        "discount": getattr(lead, "discount", None),
        "final_scope": getattr(lead, "final_scope", None),
        "payment_terms": getattr(lead, "payment_terms", None),
        "delivery_timeline": getattr(lead, "timeline", None),
        "client_conditions": getattr(lead, "client_conditions", None),
        "negotiation_notes": getattr(lead, "negotiation_notes", None),
        "next_follow_up": getattr(lead, "next_follow_up_at", None).isoformat() if getattr(lead, "next_follow_up_at", None) else None,
        "updated_at": getattr(lead, "updated_at", None).isoformat() if getattr(lead, "updated_at", None) else None,
    }


def _current_values(lead: SalesProspect) -> dict[str, Any]:
    return serialize_negotiation(lead)


def _changed_fields(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    fields = []
    for key in sorted(NEGOTIATION_FIELDS):
        output_key = "next_follow_up" if key == "next_follow_up_at" else key
        if output_key in before and output_key in after and before[output_key] != after[output_key]:
            fields.append(output_key)
    return sorted(set(fields))


def _suggest_status(lead: SalesProspect, changed_payload: dict[str, Any]) -> Optional[str]:
    current = getattr(lead, "negotiation_status", None)
    if current in {"accepted", "rejected"}:
        return None
    final_fields = {"final_agreed_amount", "final_scope", "payment_terms", "delivery_timeline", "client_conditions", "discount"}
    if any(field in changed_payload for field in final_fields):
        if getattr(lead, "won_amount", None) or getattr(lead, "final_scope", None) or getattr(lead, "payment_terms", None):
            return "final_offer"
    if "customer_counter_offer" in changed_payload and getattr(lead, "customer_counter_offer", None) is not None:
        return "waiting_internal"
    if not current:
        return "negotiation_started"
    return None


def _activity_title(changed_fields: list[str], previous_status: Optional[str], new_status: Optional[str]) -> str:
    if any(field in changed_fields for field in {"final_agreed_amount", "discount", "final_scope", "payment_terms", "delivery_timeline", "client_conditions"}):
        return "Final offer recorded" if new_status not in {"accepted", "rejected"} else ("Negotiation accepted" if new_status == "accepted" else "Negotiation rejected")
    if "customer_counter_offer" in changed_fields:
        return "Counter offer recorded"
    if previous_status != new_status:
        if new_status == "accepted":
            return "Negotiation accepted"
        if new_status == "rejected":
            return "Negotiation rejected"
        if new_status == "final_offer":
            return "Final offer recorded"
        return "Status changed"
    return "Negotiation updated"


async def _activity(lead: SalesProspect, current_user: User, title: str, metadata: Optional[dict[str, Any]] = None) -> None:
    actor_name = f"{getattr(current_user, 'first_name', '') or ''} {getattr(current_user, 'last_name', '') or ''}".strip() or getattr(current_user, "email", "")
    await notification_service.update_crm_activity(
        company_id=str(lead.company_id),
        entity_type="lead",
        entity_id=str(lead.id),
        activity_type="note",
        title=title,
        description=title,
        owner_id=str(current_user.id),
        owner_name=actor_name,
        status=CRMActivityStatus.COMPLETED.value,
        priority=CRMActivityPriority.MEDIUM.value,
        due_date=None,
        scheduled_at=None,
        created_by=str(current_user.id),
        created_by_name=actor_name,
        metadata=metadata or {},
        idempotency_key=f"sales-negotiation:{lead.id}:{utc_now().timestamp()}",
    )


async def get_negotiation(current_user: User, lead_id: str) -> dict[str, Any]:
    lead = await _lead_for_user(current_user, lead_id)
    _assert_negotiation_unlocked(lead)
    return {"negotiation": serialize_negotiation(lead)}


async def patch_negotiation(current_user: User, lead_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    _assert_can_edit(current_user)
    lead = await _lead_for_user(current_user, lead_id)
    _assert_negotiation_unlocked(lead)

    unknown = sorted(set(payload) - NEGOTIATION_FIELDS)
    if unknown:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"unknown_fields": unknown})

    before = _current_values(lead)
    now = utc_now()

    if "accepted_quotation_reference" in payload:
        lead.accepted_quotation_reference = _text(payload.get("accepted_quotation_reference"))
    if "customer_counter_offer" in payload:
        lead.customer_counter_offer = _float(payload.get("customer_counter_offer"))
    if "final_agreed_amount" in payload:
        lead.won_amount = _float(payload.get("final_agreed_amount"))
    if "discount" in payload:
        lead.discount = _float(payload.get("discount"))
    if "final_scope" in payload:
        lead.final_scope = _text(payload.get("final_scope"))
    if "payment_terms" in payload:
        lead.payment_terms = _text(payload.get("payment_terms"))
    if "delivery_timeline" in payload:
        lead.timeline = _text(payload.get("delivery_timeline"))
    if "client_conditions" in payload:
        lead.client_conditions = _text(payload.get("client_conditions"))
    if "negotiation_notes" in payload:
        lead.negotiation_notes = _text(payload.get("negotiation_notes"))
    if "next_follow_up" in payload or "next_follow_up_at" in payload:
        from app.crm.lead_engine import _parse_datetime

        lead.next_follow_up_at = _parse_datetime(payload.get("next_follow_up", payload.get("next_follow_up_at")))

    status_changed = False
    manual_status = "negotiation_status" in payload
    if manual_status:
        normalized_status = _status(payload.get("negotiation_status"))
        status_changed = apply_stage_status_change(lead, stage_key="negotiation", new_status=normalized_status, user=current_user, now=now)
    else:
        # Automation suggests obvious status only for this save. Users can still
        # override through the same manual negotiation_status field at any time.
        suggested = _suggest_status(lead, payload)
        if suggested:
            status_changed = apply_stage_status_change(lead, stage_key="negotiation", new_status=suggested, user=None, now=now)

    lead.updated_at = now
    await lead.save()

    after = _current_values(lead)
    changed_fields = _changed_fields(before, after)
    if changed_fields or status_changed:
        title = _activity_title(changed_fields, before.get("negotiation_status"), after.get("negotiation_status"))
        await _activity(
            lead,
            current_user,
            title,
            {
                "changed_fields": changed_fields,
                "manual_status": manual_status,
                "previous_status": before.get("negotiation_status"),
                "new_status": after.get("negotiation_status"),
            },
        )

    return {"negotiation": after, "changed_fields": changed_fields, "manual_status": manual_status}
