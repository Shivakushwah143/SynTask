from __future__ import annotations

from typing import Any, Dict, Iterable, List, Set

from fastapi import HTTPException, status

from app.models.client import Client, ClientStatus
from app.models.user import User, UserRole
from app.models.meeting import Meeting
from app.crm.models import SalesProspect
from app.crm.client_onboarding import activation_blockers, sync_client_onboarding


CLIENT_TRANSITION_BLOCKED_CODE = "CLIENT_TRANSITION_BLOCKED"

LEGACY_STATUS_MAP = {
    ClientStatus.INACTIVE.value: ClientStatus.ON_HOLD,
}

CLIENT_LIFECYCLE_RULES: Dict[ClientStatus, Dict[str, Any]] = {
    ClientStatus.NEW: {
        "transition_type": "sequential",
        "allowed_destinations": {ClientStatus.ONBOARDING},
        "prerequisites": [],
        "action_label": "Next Stage",
    },
    ClientStatus.ONBOARDING: {
        "transition_type": "sequential",
        "allowed_destinations": {ClientStatus.ACTIVE},
        "prerequisites": [
            {"field": "payment_terms", "label": "Payment Terms / Billing", "tab": "commercial"},
            {"field": "primary_contact", "label": "Primary Contact", "tab": "contacts"},
            {"field": "requirements", "label": "Requirements", "tab": "requirements"},
            {"field": "project_created", "label": "Project Created", "tab": "project-team"},
            {"field": "team_assigned", "label": "Team / Account Owner Assigned", "tab": "project-team"},
            {"field": "kickoff_meeting", "label": "Kickoff Meeting", "tab": "kickoff"},
            {"field": "start_readiness", "label": "Initial Delivery / Start Readiness", "tab": "project-team"},
        ],
        "action_label": "Next Stage",
    },
    ClientStatus.ACTIVE: {
        "transition_type": "conditional",
        "allowed_destinations": {ClientStatus.AT_RISK, ClientStatus.ON_HOLD, ClientStatus.RENEWAL_DUE, ClientStatus.CHURNED, ClientStatus.ARCHIVED},
        "prerequisites": [],
        "destination_requirements": {
            ClientStatus.AT_RISK: {"required_reason": True},
            ClientStatus.ON_HOLD: {"required_reason": True},
            ClientStatus.RENEWAL_DUE: {"required_reason": True},
            ClientStatus.CHURNED: {"required_reason": True},
            ClientStatus.ARCHIVED: {"required_reason": True},
        },
        "action_label": "Update Stage",
    },
    ClientStatus.AT_RISK: {
        "transition_type": "conditional",
        "allowed_destinations": {ClientStatus.ACTIVE, ClientStatus.ON_HOLD, ClientStatus.CHURNED, ClientStatus.ARCHIVED},
        "prerequisites": [],
        "action_label": "Update Stage",
    },
    ClientStatus.ON_HOLD: {
        "transition_type": "conditional",
        "allowed_destinations": {ClientStatus.ACTIVE, ClientStatus.RENEWAL_DUE, ClientStatus.CHURNED, ClientStatus.ARCHIVED},
        "prerequisites": [],
        "action_label": "Update Stage",
    },
    ClientStatus.RENEWAL_DUE: {
        "transition_type": "conditional",
        "allowed_destinations": {ClientStatus.ACTIVE, ClientStatus.CHURNED, ClientStatus.ARCHIVED},
        "prerequisites": [],
        "action_label": "Update Stage",
    },
    ClientStatus.CHURNED: {
        "transition_type": "conditional",
        "allowed_destinations": {ClientStatus.ACTIVE, ClientStatus.ARCHIVED},
        "prerequisites": [],
        "action_label": "Update Stage",
    },
    ClientStatus.ARCHIVED: {
        "transition_type": "conditional",
        "allowed_destinations": set(),
        "prerequisites": [],
        "action_label": "Update Stage",
    },
    ClientStatus.INACTIVE: {
        "transition_type": "conditional",
        "allowed_destinations": {ClientStatus.ACTIVE, ClientStatus.ON_HOLD, ClientStatus.ARCHIVED},
        "prerequisites": [],
        "destination_requirements": {ClientStatus.ARCHIVED: {"required_reason": True}},
        "action_label": "Update Stage",
    },
}

ALLOWED_CLIENT_STATUS_TRANSITIONS = {
    current: rule["allowed_destinations"] for current, rule in CLIENT_LIFECYCLE_RULES.items()
}


def client_lifecycle_rules() -> List[Dict[str, Any]]:
    return [
        {
            "status": current.value,
            "transition_type": rule["transition_type"],
            "allowed_destinations": sorted(destination.value for destination in rule["allowed_destinations"]),
            "prerequisites": rule["prerequisites"],
            "permission_requirements": ["company_admin_or_lead"],
            "destination_requirements": {
                destination.value: requirements
                for destination, requirements in rule.get("destination_requirements", {}).items()
            },
            "action_label": rule["action_label"],
        }
        for current, rule in CLIENT_LIFECYCLE_RULES.items()
    ]


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


async def validate_client_transition_requirements(client: Client, target_status: ClientStatus, reason: str | None = None) -> None:
    current_status = normalize_client_status(getattr(client, "status", None))
    destination_requirements = CLIENT_LIFECYCLE_RULES[current_status].get("destination_requirements", {})
    if destination_requirements.get(target_status, {}).get("required_reason") and not _has_value(reason):
        raise _transition_blocked(
            current_status=current_status.value,
            target_status=target_status.value,
            message="A reason is required for this client stage change.",
            missing_fields=[{"field": "lifecycle_reason", "label": "Reason"}],
        )
    if target_status != ClientStatus.ACTIVE:
        return

    missing = await activation_blockers(client)

    if missing:
        raise _transition_blocked(
            current_status=current_status.value,
            target_status=target_status.value,
            message="Complete the missing client information before activating this client.",
            missing_fields=missing,
        )


async def transition_client_status(client: Client, target_status: str | ClientStatus, current_user: User, reason: str | None = None, metadata: Dict[str, Any] | None = None) -> Client:
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

    await validate_client_transition_requirements(client, next_status, reason)

    client.status = next_status
    if reason:
        client.lifecycle_reason = reason.strip()
    if metadata:
        client.lifecycle_metadata = metadata
    await client.save()
    if next_status in {ClientStatus.ONBOARDING, ClientStatus.ACTIVE}:
        await sync_client_onboarding(client, current_user)
    return client
