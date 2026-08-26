from __future__ import annotations

from typing import Dict, Iterable, Set

from fastapi import HTTPException, status

from app.models.client import Client, ClientStatus
from app.models.user import User, UserRole


LEGACY_STATUS_MAP = {
    ClientStatus.INACTIVE.value: ClientStatus.ON_HOLD,
}

ALLOWED_CLIENT_STATUS_TRANSITIONS: Dict[ClientStatus, Set[ClientStatus]] = {
    ClientStatus.NEW: {ClientStatus.ONBOARDING, ClientStatus.ARCHIVED},
    ClientStatus.ONBOARDING: {ClientStatus.ACTIVE, ClientStatus.ON_HOLD, ClientStatus.ARCHIVED},
    ClientStatus.ACTIVE: {ClientStatus.ON_HOLD, ClientStatus.AT_RISK, ClientStatus.RENEWAL_DUE, ClientStatus.CHURNED, ClientStatus.ARCHIVED},
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

    client.status = next_status
    await client.save()
    return client
