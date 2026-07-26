"""Channel-neutral Meta messaging core."""

import inspect
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from beanie.exceptions import CollectionWasNotInitialized

from app.models.sales_contact import SalesContact
from app.models.sales_prospect import SalesProspect
from app.integrations.meta.channel_adapters import (
    ChannelType,
    NormalizedChannelEvent,
    NormalizedEventType,
)
from app.integrations.meta.identity_models import CustomerIdentity
from app.integrations.meta.messaging_models import MetaConversation, MetaMessage
from app.timeline.publisher import publish_crm_timeline_event


class MetaMessagingService:
    """Persist normalized Meta messaging events without provider sends."""

    def __init__(
        self,
        *,
        conversation_factory: Callable[..., MetaConversation] = MetaConversation,
        message_factory: Callable[..., MetaMessage] = MetaMessage,
        identity_model: Any = CustomerIdentity,
    ):
        self._conversation_factory = conversation_factory
        self._message_factory = message_factory
        self._identity_model = identity_model

    async def process_normalized_event(
        self, event: NormalizedChannelEvent, *, correlation_id: str
    ) -> str:
        conversation = await self._get_or_create_conversation(event)
        direction = (
            "inbound"
            if event.event_type == NormalizedEventType.INBOUND_MESSAGE
            else "system"
        )
        message = self._message_factory(
            company_id=event.company_id,
            conversation_id=str(conversation.id),
            channel=event.channel,
            connection_id=event.connection_id,
            provider_event_id=event.provider_event_id,
            provider_message_id=event.provider_message_id or event.provider_event_id,
            event_type=event.event_type,
            direction=direction,
            sender_id=event.sender_id,
            recipient_id=event.recipient_id,
            text=event.text,
            raw_payload=dict(event.raw_payload or {}),
            correlation_id=correlation_id,
            occurred_at=event.occurred_at,
        )
        await message.insert()
        if direction == "inbound" and conversation.linked_lead_id:
            await self._publish_lead_timeline_event(event, conversation, correlation_id)
        return "message_created" if direction == "inbound" else "event_recorded"

    async def _get_or_create_conversation(
        self, event: NormalizedChannelEvent
    ) -> MetaConversation:
        provider_thread_id = (
            event.provider_thread_id
            or event.sender_id
            or event.provider_message_id
            or event.provider_event_id
        )
        existing = await _maybe_await(
            MetaConversation.find_one(
                {
                    "company_id": event.company_id,
                    "channel": event.channel.value,
                    "connection_id": event.connection_id,
                    "provider_thread_id": provider_thread_id,
                }
            )
        )
        if existing is not None:
            await self._update_existing_conversation(existing, event)
            return existing

        now = event.occurred_at or datetime.now(timezone.utc)
        linked_contact_id, linked_lead_id = await self._deterministic_crm_links(event)
        customer_identity_id = await self._upsert_customer_identity(
            event,
            linked_contact_id=linked_contact_id,
            linked_lead_id=linked_lead_id,
        )
        conversation = self._conversation_factory(
            company_id=event.company_id,
            channel=event.channel,
            connection_id=event.connection_id,
            provider_thread_id=provider_thread_id,
            customer_identity_id=customer_identity_id,
            linked_contact_id=linked_contact_id,
            linked_lead_id=linked_lead_id,
            last_message_at=now,
            last_inbound_at=now
            if event.event_type == NormalizedEventType.INBOUND_MESSAGE
            else None,
            unread_count=1
            if event.event_type == NormalizedEventType.INBOUND_MESSAGE
            else 0,
        )
        return await conversation.insert()

    async def _update_existing_conversation(
        self, conversation: MetaConversation, event: NormalizedChannelEvent
    ) -> None:
        now = event.occurred_at or datetime.now(timezone.utc)
        conversation.last_message_at = now
        conversation.updated_at = datetime.now(timezone.utc)
        if event.event_type == NormalizedEventType.INBOUND_MESSAGE:
            conversation.last_inbound_at = now
            conversation.unread_count = (conversation.unread_count or 0) + 1
            if not getattr(conversation, "customer_identity_id", None):
                conversation.customer_identity_id = await self._upsert_customer_identity(
                    event,
                    linked_contact_id=getattr(conversation, "linked_contact_id", None),
                    linked_lead_id=getattr(conversation, "linked_lead_id", None),
                )
        elif getattr(event, "direction", None) == "outbound":
            conversation.last_outbound_at = now
        save = getattr(conversation, "save", None)
        if save is not None:
            await _maybe_await(save())

    async def _deterministic_crm_links(
        self, event: NormalizedChannelEvent
    ) -> tuple[Optional[str], Optional[str]]:
        if event.channel != ChannelType.WHATSAPP or not event.sender_id:
            return None, None
        country_code, phone = _split_e164_like_phone(event.sender_id)
        if not phone:
            return None, None
        contact = await _find_first(SalesContact, _phone_query(event.company_id, phone, country_code=country_code))
        if contact is None:
            return None, None
        contact_id = str(contact.id)
        lead = await _find_first(
            SalesProspect,
            {
                "company_id": event.company_id,
                "deleted": False,
                "contact_id": contact_id,
            },
        )
        return contact_id, str(lead.id) if lead is not None else None

    async def _upsert_customer_identity(
        self,
        event: NormalizedChannelEvent,
        *,
        linked_contact_id: Optional[str],
        linked_lead_id: Optional[str],
    ) -> Optional[str]:
        if event.event_type != NormalizedEventType.INBOUND_MESSAGE or not event.sender_id:
            return None
        try:
            identity = await _find_first(
                self._identity_model,
                {
                    "company_id": event.company_id,
                    "channel": event.channel.value,
                    "provider_user_id": event.sender_id,
                },
            )
            normalized_phone = None
            if event.channel == ChannelType.WHATSAPP:
                _country_code, normalized_phone = _split_e164_like_phone(event.sender_id)
            if identity is None:
                identity = self._identity_model(
                    company_id=event.company_id,
                    channel=event.channel,
                    provider_user_id=event.sender_id,
                    normalized_phone=normalized_phone,
                    linked_contact_id=linked_contact_id,
                    linked_lead_id=linked_lead_id,
                )
                saved = await identity.insert()
                return str(saved.id)

            changed = False
            if normalized_phone and not getattr(identity, "normalized_phone", None):
                identity.normalized_phone = normalized_phone
                changed = True
            if linked_contact_id and not getattr(identity, "linked_contact_id", None):
                identity.linked_contact_id = linked_contact_id
                changed = True
            if linked_lead_id and not getattr(identity, "linked_lead_id", None):
                identity.linked_lead_id = linked_lead_id
                changed = True
            if changed:
                identity.updated_at = datetime.now(timezone.utc)
                save = getattr(identity, "save", None)
                if save is not None:
                    await _maybe_await(save())
            return str(identity.id)
        except CollectionWasNotInitialized:
            return None

    async def _publish_lead_timeline_event(
        self,
        event: NormalizedChannelEvent,
        conversation: MetaConversation,
        correlation_id: str,
    ) -> None:
        await publish_crm_timeline_event(
            event_name="WhatsAppMessageReceived",
            aggregate_type="lead",
            aggregate_id=conversation.linked_lead_id,
            company_id=event.company_id,
            payload={
                "title": "WhatsApp message received",
                "channel": event.channel.value,
                "conversation_id": str(conversation.id),
                "contact_id": conversation.linked_contact_id,
                "provider_message_id": event.provider_message_id,
            },
            metadata={
                "source": "meta_whatsapp",
                "connection_id": event.connection_id,
                "provider_event_id": event.provider_event_id,
                "provider_message_id": event.provider_message_id,
            },
            correlation_id=correlation_id,
        )


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


async def _find_first(model: Any, query: dict[str, Any]) -> Any:
    try:
        if hasattr(model, "find_one"):
            found = await _maybe_await(model.find_one(query))
            if found is not None:
                return found
        if hasattr(model, "find"):
            result = model.find(query)
            if hasattr(result, "limit"):
                result = result.limit(1)
            items = await result.to_list()
            return items[0] if items else None
    except CollectionWasNotInitialized:
        return None
    return None


def _split_e164_like_phone(value: str) -> tuple[str, str]:
    digits = "".join(character for character in str(value) if character.isdigit())
    if len(digits) > 10:
        return f"+{digits[:-10]}", digits[-10:]
    return "", digits


def _phone_query(company_id: str, phone: str, *, country_code: str) -> dict[str, Any]:
    query: dict[str, Any] = {"company_id": company_id, "deleted": False, "phone": phone}
    if country_code:
        query["country_code"] = country_code
    return query
