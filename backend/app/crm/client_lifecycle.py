from __future__ import annotations

from typing import Any, Dict, Iterable, List, Set

from fastapi import HTTPException, status

from app.models.client import Client, ClientStatus
from app.models.meeting import Meeting
from app.models.sales_prospect import SalesProspect
from app.models.user import User, UserRole


CLIENT_TRANSITION_BLOCKED_CODE = "CLIENT_TRANSITION_BLOCKED"

LEGACY_STATUS_MAP = {
    ClientStatus.INACTIVE.value: ClientStatus.ON_HOLD,
}

ALLOWED_CLIENT_STATUS_TRANSITIONS: Dict[ClientStatus, Set[ClientStatus]] = {
    ClientStatus.NEW: {ClientStatus.ONBOARDING, ClientStatus.ARCHIVED},
    ClientStatus.ONBOARDING: {ClientStatus.ACTIVE, ClientStatus.ON_HOLD, ClientStatus.ARCHIVED},
    ClientStatus.ACTIVE: {ClientStatus.ONBOARDING, ClientStatus.ON_HOLD, ClientStatus.AT_RISK, ClientStatus.RENEWAL_DUE, ClientStatus.CHURNED, ClientStatus.ARCHIVED},
    ClientStatus.ON_HOLD: {ClientStatus.ACTIVE, ClientStatus.CHURNED, ClientStatus.ARCHIVED},
    ClientStatus.AT_RISK: {ClientStatus.ACTIVE, ClientStatus.CHURNED, ClientStatus.ARCHIVED},
    ClientStatus.RENEWAL_DUE: {ClientStatus.ACTIVE, ClientStatus.CHURNED, ClientStatus.ARCHIVED},
    ClientStatus.CHURNED: {ClientStatus.ARCHIVED},
    ClientStatus.ARCHIVED: set(),
    ClientStatus.INACTIVE: {ClientStatus.ACTIVE, ClientStatus.ON_HOLD, ClientStatus.ARCHIVED},
}


def normalize_client_status(value: str | ClientStatus | None) -> ClientStatus:
    raw = value.value if isinstance(value, ClientStatus) else str(value or "").strip().lower()
    raw = LEGACY_STATUS_MAP.get(raw, raw)
    try:
        return ClientStatus(raw)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid client status: {value}")


def client_status_options() -> Iterable[str]:
    return [
        ClientStatus.NEW.value,
        ClientStatus.ONBOARDING.value,
        ClientStatus.ACTIVE.value,
        ClientStatus.AT_RISK.value,
        ClientStatus.ON_HOLD.value,
        ClientStatus.RENEWAL_DUE.value,
        ClientStatus.CHURNED.value,
        ClientStatus.ARCHIVED.value,
    ]


def _transition_blocked(
    *,
    current_status: str,
    target_status: str,
    message: str,
    missing_fields: List[Dict[str, Any]],
) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={
            "code": CLIENT_TRANSITION_BLOCKED_CODE,
            "severity": "warning",
            "current_status": current_status,
            "target_status": target_status,
            "message": message,
            "missing_fields": missing_fields,
        },
    )


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True


async def _source_lead_for_client(client: Client) -> SalesProspect | None:
    company_id = str(getattr(client, "company_id", "") or "")
    source_lead_id = getattr(client, "source_lead_id", None)
    if source_lead_id:
        try:
            lead = await SalesProspect.get(source_lead_id)
        except Exception:
            lead = None
        if lead and not getattr(lead, "deleted", False) and str(getattr(lead, "company_id", "") or "") == company_id:
            return lead
    return await SalesProspect.find_one(
        {
            "company_id": company_id,
            "client_id": str(client.id),
            "deleted": {"$ne": True},
        }
    )


async def _has_kickoff_meeting(client: Client) -> bool:
    company_id = str(getattr(client, "company_id", "") or "")
    client_id = str(getattr(client, "id", "") or "")
    title = f"Kickoff - {getattr(client, 'name', '')}"
    query = {
        "company_id": company_id,
        "$or": [
            {"title": title},
            {"description": {"$regex": client_id, "$options": "i"}},
        ],
    }
    return bool(await Meeting.find_one(query))


async def validate_client_transition_requirements(client: Client, target_status: ClientStatus) -> None:
    if target_status != ClientStatus.ACTIVE:
        return

    missing: List[Dict[str, Any]] = []
    source_lead = None

    if not (_has_value(getattr(client, "contact", None)) or _has_value(getattr(client, "email", None))):
        missing.append({"field": "primary_contact", "label": "Primary Contact"})
    if not (_has_value(getattr(client, "account_owner_id", None)) or _has_value(getattr(client, "assigned_to", None))):
        missing.append({"field": "account_owner_id", "label": "Account Owner"})
    if not _has_value(getattr(client, "notes", None)):
        source_lead = await _source_lead_for_client(client)
        if not (_has_value(getattr(source_lead, "requirement", None)) or _has_value(getattr(source_lead, "pain_points", None))):
            missing.append({"field": "requirements", "label": "Requirements"})
    if not await _has_kickoff_meeting(client):
        missing.append({"field": "kickoff_meeting", "label": "Kickoff Meeting"})

    if missing:
        raise _transition_blocked(
            current_status=normalize_client_status(getattr(client, "status", None)).value,
            target_status=target_status.value,
            message="Complete the missing client information before activating this client.",
            missing_fields=missing,
        )


async def transition_client_status(client: Client, target_status: str | ClientStatus, current_user: User) -> Client:
    if current_user.role != UserRole.SUPER_ADMIN and client.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    current_status = normalize_client_status(getattr(client, "status", None))
    next_status = normalize_client_status(target_status)
    if current_status == next_status:
        if getattr(client, "status", None) != next_status:
            client.status = next_status
            await client.save()
        return client

    allowed = ALLOWED_CLIENT_STATUS_TRANSITIONS.get(current_status, set())
    if next_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid client status transition: {current_status.value} to {next_status.value}",
        )

    await validate_client_transition_requirements(client, next_status)

    client.status = next_status
    await client.save()
    return client
