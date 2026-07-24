"""Tenant-scoped unified Meta inbox API."""

from typing import Any

from beanie import PydanticObjectId
from bson.errors import InvalidId
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.integrations.meta.channel_adapters import ChannelType
from app.integrations.meta.messaging_models import MetaChannelConnection, MetaConversation, MetaMessage
from app.models.user import UserRole


router = APIRouter()


class ConversationUpdate(BaseModel):
    status: str | None = None
    assigned_to: str | None = None
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    tags: list[str] | None = None
    note: str | None = Field(default=None, max_length=2000)


def _company_id_for_user(current_user: Any, company_id: str | None = None) -> str:
    role = getattr(getattr(current_user, "role", None), "value", getattr(current_user, "role", None))
    if role == UserRole.SUPER_ADMIN.value:
        if not company_id:
            raise HTTPException(status_code=400, detail="company_id is required")
        return company_id
    return str(current_user.company_id)


def _conversation_payload(conversation: MetaConversation) -> dict[str, Any]:
    return {
        "id": str(conversation.id),
        "company_id": conversation.company_id,
        "channel": _value(conversation.channel),
        "connection_id": conversation.connection_id,
        "provider_thread_id": conversation.provider_thread_id,
        "customer_identity_id": conversation.customer_identity_id,
        "linked_lead_id": conversation.linked_lead_id,
        "linked_contact_id": conversation.linked_contact_id,
        "status": conversation.status,
        "assigned_to": conversation.assigned_to,
        "priority": conversation.priority,
        "tags": conversation.tags,
        "notes": getattr(conversation, "notes", []),
        "unread_count": conversation.unread_count,
        "last_message_at": conversation.last_message_at,
        "last_inbound_at": conversation.last_inbound_at,
        "last_outbound_at": conversation.last_outbound_at,
        "updated_at": conversation.updated_at,
    }


def _message_payload(message: MetaMessage) -> dict[str, Any]:
    return {
        "id": str(message.id),
        "company_id": message.company_id,
        "conversation_id": message.conversation_id,
        "channel": _value(message.channel),
        "connection_id": message.connection_id,
        "provider_event_id": message.provider_event_id,
        "provider_message_id": message.provider_message_id,
        "event_type": _value(message.event_type),
        "direction": message.direction,
        "sender_id": message.sender_id,
        "recipient_id": message.recipient_id,
        "text": message.text,
        "status": message.status,
        "occurred_at": message.occurred_at,
        "created_at": message.created_at,
    }


@router.get("/inbox/conversations")
async def list_inbox_conversations(
    company_id: str | None = Query(default=None),
    channel: ChannelType | None = Query(default=None),
    status: str | None = Query(default=None),
    assigned_to: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    unread: bool | None = Query(default=None),
    linked: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    current_user=Depends(get_current_user),
):
    query: dict[str, Any] = {"company_id": _company_id_for_user(current_user, company_id)}
    if channel:
        query["channel"] = channel.value
    if status:
        query["status"] = status
    if assigned_to:
        query["assigned_to"] = assigned_to
    if priority:
        query["priority"] = priority
    if unread is True:
        query["unread_count"] = {"$gt": 0}
    if linked is True:
        query["$or"] = [
            {"linked_lead_id": {"$ne": None}},
            {"linked_contact_id": {"$ne": None}},
        ]
    rows = await (
        MetaConversation.find(query)
        .sort("-last_message_at")
        .skip(skip)
        .limit(limit)
        .to_list()
    )
    return {"items": [_conversation_payload(row) for row in rows]}


@router.get("/inbox/channel-status")
async def list_channel_status(
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    target_company = _company_id_for_user(current_user, company_id)
    rows = await MetaChannelConnection.find({"company_id": target_company}).to_list()
    return {"items": [_connection_payload(row) for row in rows]}


@router.get("/inbox/conversations/{conversation_id}/messages")
async def list_inbox_messages(
    conversation_id: str,
    company_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    current_user=Depends(get_current_user),
):
    target_company = _company_id_for_user(current_user, company_id)
    conversation = await _find_conversation(conversation_id, target_company)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    rows = await (
        MetaMessage.find({"company_id": target_company, "conversation_id": conversation_id})
        .sort("created_at")
        .skip(skip)
        .limit(limit)
        .to_list()
    )
    return {"items": [_message_payload(row) for row in rows]}


@router.patch("/inbox/conversations/{conversation_id}")
async def update_inbox_conversation(
    conversation_id: str,
    payload: ConversationUpdate,
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    target_company = _company_id_for_user(current_user, company_id)
    conversation = await _find_conversation(conversation_id, target_company)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if payload.status is not None:
        conversation.status = payload.status
    if payload.assigned_to is not None:
        conversation.assigned_to = payload.assigned_to
    if payload.priority is not None:
        conversation.priority = payload.priority
    if payload.tags is not None:
        conversation.tags = _clean_tags(payload.tags)
    if payload.note:
        notes = list(getattr(conversation, "notes", []) or [])
        notes.append(
            {
                "body": payload.note.strip(),
                "created_by": str(getattr(current_user, "id", "")),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        conversation.notes = notes
    conversation.updated_at = datetime.now(timezone.utc)
    await conversation.save()
    return {"items": [_conversation_payload(conversation)]}


async def _find_conversation(conversation_id: str, company_id: str) -> MetaConversation | None:
    try:
        object_id = PydanticObjectId(conversation_id)
    except (TypeError, ValueError, InvalidId):
        object_id = None
    query: dict[str, Any] = {"company_id": company_id}
    if object_id is not None:
        query["_id"] = object_id
    else:
        query["_id"] = conversation_id
    return await MetaConversation.find_one(query)


def _value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _connection_payload(connection: MetaChannelConnection) -> dict[str, Any]:
    return {
        "id": str(connection.id),
        "company_id": connection.company_id,
        "channel": _value(connection.channel),
        "provider_asset_id": connection.provider_asset_id,
        "display_name": connection.display_name,
        "status": connection.status,
        "can_receive": connection.can_receive,
        "can_send": connection.can_send,
        "health_reason": connection.health_reason,
        "last_health_check_at": connection.last_health_check_at,
        "last_webhook_at": connection.last_webhook_at,
    }


def _clean_tags(tags: list[str]) -> list[str]:
    cleaned = []
    for tag in tags:
        value = str(tag).strip()
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned[:20]


class OutboundMessagePayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


@router.post("/conversations/{conversation_id}/send")
async def send_inbox_message(
    conversation_id: str,
    payload: OutboundMessagePayload,
    company_id: str | None = Query(default=None),
    current_user=Depends(get_current_user),
):
    from app.integrations.meta.send_service import MetaSendService
    from uuid import uuid4
    
    target = _company_id_for_user(current_user, company_id)
    send_service = MetaSendService()
    try:
        result = await send_service.send_outbound_message(
            company_id=target,
            conversation_id=conversation_id,
            text=payload.text,
            user_id=str(current_user.id),
            correlation_id=str(uuid4()),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result

