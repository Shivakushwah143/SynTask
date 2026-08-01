"""Governed Meta AI reply draft workflow.

Draft-only by design:
- no provider send
- no action proposal
- approval/rejection only changes draft state
- audit stores metadata, not message bodies or raw payloads
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.clock import aware_utc_now
from typing import Any, Awaitable, Callable

from beanie import PydanticObjectId
from bson.errors import InvalidId

from app.integrations.meta.ai_draft_models import MetaAIDraft
from app.integrations.meta.channel_adapters import ChannelType
from app.integrations.meta.messaging_models import MetaConversation, MetaMessage
from app.models.ai_log import AIInteractionLog


DraftGenerator = Callable[["MetaDraftPrompt"], str | Awaitable[str]]


@dataclass(frozen=True)
class MetaDraftPrompt:
    company_id: str
    conversation_id: str
    channel: ChannelType
    policy: dict[str, Any]
    crm_context: dict[str, Any]
    conversation_context: dict[str, Any]
    instruction: str | None = None


class MetaAIDraftService:
    def __init__(
        self,
        *,
        conversation_model=MetaConversation,
        message_model=MetaMessage,
        draft_model=MetaAIDraft,
        draft_factory=MetaAIDraft,
        audit_log_factory=AIInteractionLog,
        draft_generator: DraftGenerator | None = None,
    ):
        self.conversation_model = conversation_model
        self.message_model = message_model
        self.draft_model = draft_model
        self.draft_factory = draft_factory
        self.audit_log_factory = audit_log_factory
        self.draft_generator = draft_generator or self._default_generator

    async def generate_draft(
        self,
        *,
        company_id: str,
        conversation_id: str,
        requested_by: str,
        instruction: str | None = None,
    ) -> Any:
        conversation = await self.conversation_model.find_one(
            {"company_id": company_id, "_id": _object_id_or_raw(conversation_id)}
        )
        if conversation is None:
            raise ValueError("Conversation not found")

        messages = await (
            self.message_model.find({"company_id": company_id, "conversation_id": conversation_id})
            .sort("-created_at")
            .limit(12)
            .to_list()
        )
        channel = _channel(getattr(conversation, "channel"))
        policy = self._policy_for(channel)
        metadata = self._prompt_metadata(conversation, messages, instruction)
        prompt = MetaDraftPrompt(
            company_id=company_id,
            conversation_id=conversation_id,
            channel=channel,
            policy=policy,
            crm_context={
                "linked_lead_id": getattr(conversation, "linked_lead_id", None),
                "linked_contact_id": getattr(conversation, "linked_contact_id", None),
                "customer_identity_id": getattr(conversation, "customer_identity_id", None),
            },
            conversation_context=metadata,
            instruction=instruction,
        )
        draft_text = await _maybe_await(self.draft_generator(prompt))
        draft = self.draft_factory(
            company_id=company_id,
            conversation_id=conversation_id,
            channel=channel,
            requested_by=requested_by,
            draft_text=str(draft_text).strip(),
            status="drafted",
            prompt_metadata=metadata,
            policy_snapshot=policy,
        )
        await draft.insert()
        await self._audit(
            company_id=company_id,
            user_id=requested_by,
            status="drafted",
            context=metadata | {"policy": policy},
            parsed_response={"draft_id": str(getattr(draft, "id", "")), "status": "drafted"},
        )
        return draft

    async def approve_draft(self, *, company_id: str, draft_id: str, approved_by: str) -> Any:
        draft = await self._find_draft(company_id, draft_id)
        draft.status = "approved"
        draft.approved_by = approved_by
        draft.approved_at = aware_utc_now()
        draft.updated_at = aware_utc_now()
        await draft.save()
        await self._audit(
            company_id=company_id,
            user_id=approved_by,
            status="approved",
            context={"draft_id": draft_id, "conversation_id": draft.conversation_id},
            parsed_response={"draft_id": draft_id, "status": "approved"},
        )
        return draft

    async def reject_draft(
        self,
        *,
        company_id: str,
        draft_id: str,
        rejected_by: str,
        reason: str | None = None,
    ) -> Any:
        draft = await self._find_draft(company_id, draft_id)
        draft.status = "rejected"
        draft.rejected_by = rejected_by
        draft.rejected_at = aware_utc_now()
        draft.rejection_reason = reason
        draft.updated_at = aware_utc_now()
        await draft.save()
        await self._audit(
            company_id=company_id,
            user_id=rejected_by,
            status="rejected",
            context={
                "draft_id": draft_id,
                "conversation_id": draft.conversation_id,
                "reason_provided": bool(reason),
            },
            parsed_response={"draft_id": draft_id, "status": "rejected"},
        )
        return draft

    async def _find_draft(self, company_id: str, draft_id: str) -> Any:
        draft = await self.draft_model.find_one({"company_id": company_id, "_id": _object_id_or_raw(draft_id)})
        if draft is None:
            raise ValueError("AI draft not found")
        return draft

    def _policy_for(self, channel: ChannelType) -> dict[str, Any]:
        base = {
            "requires_human_approval": True,
            "provider_send_allowed": False,
            "autonomous_send_allowed": False,
            "draft_only": True,
        }
        if channel == ChannelType.WHATSAPP:
            return base | {"channel_rule": "WhatsApp replies need eligible window/template validation before any later send phase."}
        if channel == ChannelType.INSTAGRAM:
            return base | {"channel_rule": "Instagram replies require user-initiated conversation and approved permissions."}
        if channel == ChannelType.MESSENGER:
            return base | {"channel_rule": "Messenger replies require valid Page messaging window and approved permissions."}
        return base | {"channel_rule": "Unknown channel; draft only."}

    def _prompt_metadata(self, conversation: Any, messages: list[Any], instruction: str | None) -> dict[str, Any]:
        inbound_count = sum(1 for item in messages if getattr(item, "direction", None) == "inbound")
        outbound_count = sum(1 for item in messages if getattr(item, "direction", None) == "outbound")
        return {
            "conversation_id": str(getattr(conversation, "id", "")),
            "channel": _value(getattr(conversation, "channel", None)),
            "message_count": len(messages),
            "inbound_count": inbound_count,
            "outbound_count": outbound_count,
            "has_linked_lead": bool(getattr(conversation, "linked_lead_id", None)),
            "has_linked_contact": bool(getattr(conversation, "linked_contact_id", None)),
            "instruction_provided": bool(instruction),
            "message_ids": [str(getattr(item, "id", "")) for item in messages if getattr(item, "id", None)],
        }

    async def _audit(
        self,
        *,
        company_id: str,
        user_id: str,
        status: str,
        context: dict[str, Any],
        parsed_response: dict[str, Any],
    ) -> None:
        await self.audit_log_factory(
            feature="meta_ai_reply_draft",
            role="assistant",
            provider="syntask",
            model="governed-meta-draft",
            prompt_version="meta-ai-draft-v1",
            status=status,
            company_id=company_id,
            user_id=user_id,
            prompt=None,
            raw_response=None,
            context=context,
            parsed_response=parsed_response,
        ).insert()

    async def _default_generator(self, prompt: MetaDraftPrompt) -> str:
        if prompt.instruction:
            return f"Thanks for reaching out. {prompt.instruction.strip()}"
        return "Thanks for reaching out. A teammate will review this and reply shortly."


async def _maybe_await(value):
    if hasattr(value, "__await__"):
        return await value
    return value


def _channel(value: Any) -> ChannelType:
    if isinstance(value, ChannelType):
        return value
    return ChannelType(str(value))


def _value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _object_id_or_raw(value: str) -> Any:
    try:
        return PydanticObjectId(value)
    except (TypeError, ValueError, InvalidId):
        return value
