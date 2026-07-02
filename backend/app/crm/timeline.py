from __future__ import annotations

from typing import Any, Dict, Optional

from app.events import publish_event
from app.events.factories import build_domain_event
from app.events.contracts import DomainEvent


def build_crm_timeline_event(
    *,
    event_name: str,
    aggregate_type: str,
    aggregate_id: str,
    company_id: str,
    actor_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    project_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    correlation_id: Optional[str] = None,
    causation_id: Optional[str] = None,
    event_version: int = 1,
) -> DomainEvent:
    payload_data = dict(payload or {})
    payload_data.setdefault("aggregate_type", aggregate_type)
    payload_data.setdefault("aggregate_id", aggregate_id)
    payload_data.setdefault("company_id", company_id)
    payload_data.setdefault("event_name", event_name)
    payload_data.setdefault("surface", "crm")

    metadata_data = {"surface": "crm"}
    if metadata:
        metadata_data.update(metadata)

    return build_domain_event(
        event_name=event_name,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        company_id=company_id,
        actor_id=actor_id,
        payload=payload_data,
        project_id=project_id,
        metadata=metadata_data,
        correlation_id=correlation_id,
        causation_id=causation_id,
        event_version=event_version,
    )


async def publish_crm_timeline_event(**kwargs: Any) -> DomainEvent:
    event = build_crm_timeline_event(**kwargs)
    await publish_event(event)
    return event

