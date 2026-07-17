from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from app.events.contracts import DomainEvent


def _idempotency_key(company_id: str, aggregate_type: str, aggregate_id: str, event_name: str, payload: Dict[str, Any]) -> str:
    marker = payload.get("version_marker") or payload.get("updated_at") or payload.get("created_at") or aggregate_id
    return f"{company_id}:{aggregate_type}:{aggregate_id}:{event_name}:{marker}"


def build_domain_event(
    *,
    event_name: str,
    aggregate_type: str,
    aggregate_id: str,
    company_id: str,
    actor_id: Optional[str],
    payload: Dict[str, Any],
    project_id: str | None = None,
    campaign_id: str | None = None,
    metadata: Dict[str, Any] | None = None,
    correlation_id: str | None = None,
    causation_id: str | None = None,
    event_version: int = 1,
) -> DomainEvent:
    return DomainEvent(
        event_name=event_name,
        event_version=event_version,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        company_id=company_id,
        project_id=project_id,
        campaign_id=campaign_id,
        actor_id=actor_id,
        timestamp=datetime.now(),
        payload=payload,
        metadata=metadata or {},
        idempotency_key=_idempotency_key(company_id, aggregate_type, aggregate_id, event_name, payload),
        correlation_id=correlation_id,
        causation_id=causation_id,
    )


