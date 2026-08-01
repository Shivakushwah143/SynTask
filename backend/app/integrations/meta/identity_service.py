"""Deterministic Meta identity suggestions and human-confirmed links."""

import inspect
from datetime import datetime

from app.core.clock import aware_utc_now
from typing import Any, Callable, Optional

from beanie import PydanticObjectId
from bson.errors import InvalidId
from pydantic import BaseModel

from app.integrations.meta.identity_models import CustomerIdentity, CrossChannelIdentityLink
from app.timeline.publisher import publish_crm_timeline_event


class IdentitySuggestion(BaseModel):
    identity_id: str
    channel: str
    provider_user_id: str
    display_name: Optional[str] = None
    linked_lead_id: Optional[str] = None
    linked_contact_id: Optional[str] = None
    evidence: list[dict[str, Any]]


class MetaIdentityService:
    """Suggest only deterministic matches; link only after human confirmation."""

    def __init__(
        self,
        *,
        identity_model: Any = CustomerIdentity,
        link_model: Any = CrossChannelIdentityLink,
        link_factory: Callable[..., CrossChannelIdentityLink] = CrossChannelIdentityLink,
        timeline_publisher: Callable[..., Any] = publish_crm_timeline_event,
    ):
        self._identity_model = identity_model
        self._link_model = link_model
        self._link_factory = link_factory
        self._timeline_publisher = timeline_publisher

    async def suggest_links(self, *, company_id: str, identity_id: str) -> list[IdentitySuggestion]:
        source = await self._find_identity(company_id=company_id, identity_id=identity_id)
        if source is None:
            return []

        candidates: dict[str, Any] = {}
        for query in self._deterministic_queries(source):
            rows = await _find_many(self._identity_model, query)
            for row in rows:
                row_id = str(getattr(row, "id", ""))
                if not row_id or row_id == str(source.id):
                    continue
                candidates[row_id] = row

        suggestions = []
        for candidate in candidates.values():
            evidence = _deterministic_evidence(source, candidate)
            if evidence:
                suggestions.append(
                    IdentitySuggestion(
                        identity_id=str(candidate.id),
                        channel=_value(candidate.channel),
                        provider_user_id=candidate.provider_user_id,
                        display_name=getattr(candidate, "display_name", None),
                        linked_lead_id=getattr(candidate, "linked_lead_id", None),
                        linked_contact_id=getattr(candidate, "linked_contact_id", None),
                        evidence=evidence,
                    )
                )
        return suggestions

    async def confirm_link(
        self,
        *,
        company_id: str,
        identity_id: str,
        target_identity_id: str,
        confirmed_by: str,
    ) -> CrossChannelIdentityLink:
        source = await self._find_identity(company_id=company_id, identity_id=identity_id)
        target = await self._find_identity(company_id=company_id, identity_id=target_identity_id)
        if source is None or target is None:
            raise ValueError("Identity not found")
        evidence = _deterministic_evidence(source, target)
        if not evidence:
            raise ValueError("Deterministic evidence is required before linking")

        identity_ids = sorted([str(source.id), str(target.id)])
        link_key = ":".join(identity_ids)
        existing = await _find_one(
            self._link_model,
            {"company_id": company_id, "link_key": link_key, "status": "confirmed"},
        )
        if existing is not None:
            return existing

        linked_lead_id = getattr(source, "linked_lead_id", None) or getattr(target, "linked_lead_id", None)
        linked_contact_id = getattr(source, "linked_contact_id", None) or getattr(target, "linked_contact_id", None)
        now = aware_utc_now()
        link = self._link_factory(
            company_id=company_id,
            identity_ids=identity_ids,
            link_key=link_key,
            evidence=evidence,
            linked_lead_id=linked_lead_id,
            linked_contact_id=linked_contact_id,
            confirmed_by=confirmed_by,
            confirmed_at=now,
            created_at=now,
            updated_at=now,
        )
        saved = await _maybe_await(link.insert())
        await self._publish_link_timeline(
            company_id=company_id,
            link=saved,
            source=source,
            target=target,
        )
        return saved

    async def _find_identity(self, *, company_id: str, identity_id: str) -> Any:
        return await _find_one(
            self._identity_model,
            {"company_id": company_id, "_id": _object_id_or_raw(identity_id)},
        )

    def _deterministic_queries(self, source: Any) -> list[dict[str, Any]]:
        queries: list[dict[str, Any]] = []
        company_id = source.company_id
        if getattr(source, "normalized_phone", None):
            queries.append({"company_id": company_id, "normalized_phone": source.normalized_phone})
        if getattr(source, "linked_contact_id", None):
            queries.append({"company_id": company_id, "linked_contact_id": source.linked_contact_id})
        if getattr(source, "linked_lead_id", None):
            queries.append({"company_id": company_id, "linked_lead_id": source.linked_lead_id})
        return queries

    async def _publish_link_timeline(self, *, company_id: str, link: Any, source: Any, target: Any) -> None:
        if not getattr(link, "linked_lead_id", None):
            return
        await _maybe_await(
            self._timeline_publisher(
                event_name="MetaIdentityLinkConfirmed",
                aggregate_type="lead",
                aggregate_id=link.linked_lead_id,
                company_id=company_id,
                payload={
                    "title": "Meta identity link confirmed",
                    "identity_ids": list(link.identity_ids),
                    "channels": [_value(source.channel), _value(target.channel)],
                    "linked_contact_id": link.linked_contact_id,
                    "evidence": list(link.evidence),
                },
                metadata={
                    "source": "meta_identity",
                    "confirmed_by": link.confirmed_by,
                },
                correlation_id=f"meta-identity-link:{getattr(link, 'id', '')}",
            )
        )


def _deterministic_evidence(source: Any, target: Any) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    if _same_nonempty(getattr(source, "normalized_phone", None), getattr(target, "normalized_phone", None)):
        evidence.append({"type": "normalized_phone", "value": source.normalized_phone})
    if _same_nonempty(getattr(source, "linked_contact_id", None), getattr(target, "linked_contact_id", None)):
        evidence.append({"type": "linked_contact_id", "value": source.linked_contact_id})
    if _same_nonempty(getattr(source, "linked_lead_id", None), getattr(target, "linked_lead_id", None)):
        evidence.append({"type": "linked_lead_id", "value": source.linked_lead_id})
    return evidence


def _same_nonempty(left: Any, right: Any) -> bool:
    return bool(left) and bool(right) and str(left) == str(right)


async def _find_one(model: Any, query: dict[str, Any]) -> Any:
    return await _maybe_await(model.find_one(query))


async def _find_many(model: Any, query: dict[str, Any]) -> list[Any]:
    result = model.find(query)
    if hasattr(result, "limit"):
        result = result.limit(50)
    return await _maybe_await(result.to_list())


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


def _value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _object_id_or_raw(value: str) -> Any:
    try:
        return PydanticObjectId(str(value))
    except (TypeError, ValueError, InvalidId):
        return value
