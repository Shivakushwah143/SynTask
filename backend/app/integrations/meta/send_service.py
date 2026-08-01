from datetime import datetime, timedelta

from app.core.clock import aware_utc_now, ensure_utc
from typing import Any, Dict, Optional
from bson import ObjectId

from app.integrations.meta.messaging_models import MetaChannelConnection, MetaConversation, MetaMessage
from app.integrations.meta.channel_adapters import ChannelType, NormalizedEventType
from app.integrations.meta.whatsapp_adapter import WhatsAppAdapter
from app.integrations.meta.social_messaging_adapter import SocialMessagingAdapter
from app.integrations.meta.config_service import MetaIntegrationConfigService
from app.timeline.publisher import publish_crm_timeline_event

class MetaSendService:
    """Outbound dispatch service for human-approved Meta messages."""

    def __init__(self):
        self._whatsapp_adapter = WhatsAppAdapter()
        from app.integrations.meta.instagram_adapter import InstagramAdapter
        from app.integrations.meta.messenger_adapter import MessengerAdapter
        self._instagram_adapter = InstagramAdapter()
        self._messenger_adapter = MessengerAdapter()

    async def send_outbound_message(
        self,
        *,
        company_id: str,
        conversation_id: str,
        text: str,
        user_id: str,
        correlation_id: str,
    ) -> Dict[str, Any]:
        # 1. Fetch conversation
        try:
            conv_obj_id = ObjectId(conversation_id)
        except Exception:
            raise ValueError("Invalid conversation ID format")

        conversation = await MetaConversation.get(conv_obj_id)
        if not conversation:
            raise ValueError("Conversation not found")
        if conversation.company_id != company_id:
            raise ValueError("Access denied: conversation company mismatch")

        # 2. Fetch connection
        try:
            conn_obj_id = ObjectId(conversation.connection_id)
        except Exception:
            raise ValueError("Invalid connection ID format on conversation")

        connection = await MetaChannelConnection.get(conn_obj_id)
        if not connection:
            raise ValueError("Channel connection not found")
        if connection.company_id != company_id:
            raise ValueError("Access denied: connection company mismatch")

        # 3. Validate connection status and health
        if connection.status != "active":
            raise ValueError(f"Connection is not active (current status: {connection.status})")

        # 4. Enforce Meta's 24-hour reply window for social messaging (Instagram and Messenger)
        if conversation.channel in (ChannelType.INSTAGRAM, ChannelType.MESSENGER):
            if not conversation.last_inbound_at:
                raise ValueError("No inbound interaction found on this conversation. Outbound send blocked.")
            
            last_inbound = conversation.last_inbound_at
            if last_inbound.tzinfo is None:
                last_inbound = ensure_utc(last_inbound)
            
            now_utc = aware_utc_now()
            if (now_utc - last_inbound) > timedelta(hours=24):
                raise ValueError("Outside Meta's 24-hour reply window. Outbound send blocked.")

        # 5. Load credentials
        access_token = None
        if connection.credential_ref_encrypted:
            access_token = MetaIntegrationConfigService.reveal_secret(connection.credential_ref_encrypted)
        else:
            from app.integrations.meta.models import MetaIntegrationSettings
            settings_doc = await MetaIntegrationSettings.find_one({"company_id": company_id})
            if settings_doc and settings_doc.system_user_token_encrypted:
                access_token = MetaIntegrationConfigService.reveal_secret(settings_doc.system_user_token_encrypted)
            elif settings_doc and settings_doc.page_access_token_encrypted:
                access_token = MetaIntegrationConfigService.reveal_secret(settings_doc.page_access_token_encrypted)

        if not access_token:
            raise ValueError("Access credentials not configured for this channel")

        # 6. Select adapter and send
        parts = conversation.provider_thread_id.split(":")
        recipient_id = parts[1] if len(parts) > 1 else conversation.provider_thread_id

        if conversation.channel == ChannelType.WHATSAPP:
            adapter = self._whatsapp_adapter
            sender_asset_id = connection.provider_asset_id
        elif conversation.channel == ChannelType.INSTAGRAM:
            adapter = self._instagram_adapter
            sender_asset_id = connection.page_id or connection.provider_asset_id
        elif conversation.channel == ChannelType.MESSENGER:
            adapter = self._messenger_adapter
            sender_asset_id = connection.page_id or connection.provider_asset_id
        else:
            raise ValueError(f"Unsupported channel: {conversation.channel}")

        result = await adapter.send_message(
            recipient_id=recipient_id,
            text=text,
            sender_asset_id=sender_asset_id,
            access_token=access_token,
        )

        if not result.get("sent"):
            raise ValueError(f"Provider send failed: {result.get('reason', 'Unknown error')}")

        provider_message_id = result.get("provider_message_id")

        # 7. Create MetaMessage
        message = MetaMessage(
            company_id=company_id,
            conversation_id=str(conversation.id),
            channel=conversation.channel,
            connection_id=str(connection.id),
            provider_event_id=provider_message_id or f"out_{ObjectId()}",
            provider_message_id=provider_message_id,
            event_type=NormalizedEventType.INBOUND_MESSAGE,  # Mapped to message event
            direction="outbound",
            sender_id=sender_asset_id,
            recipient_id=recipient_id,
            text=text,
            raw_payload={"provider_result": result},
            status="sent",
            correlation_id=correlation_id,
            occurred_at=aware_utc_now(),
        )
        await message.insert()

        # 8. Update conversation
        conversation.last_message_at = aware_utc_now()
        conversation.last_outbound_at = aware_utc_now()
        conversation.unread_count = 0
        await conversation.save()

        # 9. Record CRM timeline event
        if conversation.linked_lead_id:
            channel_label = conversation.channel.value.capitalize()
            await publish_crm_timeline_event(
                event_name=f"{channel_label}MessageSent",
                aggregate_type="lead",
                aggregate_id=conversation.linked_lead_id,
                company_id=company_id,
                payload={
                    "title": f"{channel_label} message sent",
                    "channel": conversation.channel.value,
                    "conversation_id": str(conversation.id),
                    "contact_id": conversation.linked_contact_id,
                    "provider_message_id": provider_message_id,
                    "sent_by_user_id": user_id,
                },
                metadata={
                    "source": f"meta_{conversation.channel.value}",
                    "connection_id": str(connection.id),
                    "provider_message_id": provider_message_id,
                },
                correlation_id=correlation_id,
            )

        return {
            "status": "sent",
            "message_id": str(message.id),
            "provider_message_id": provider_message_id,
        }
