from datetime import datetime, timezone
from typing import Any, Dict, List
from app.integrations.meta.messaging_models import MetaConversation, MetaMessage
from app.integrations.meta.ai_draft_models import MetaAIDraft

class MetaOmnichannelAnalyticsService:
    """Aggregates multi-channel communication metrics for a company."""

    @classmethod
    async def get_analytics_summary(cls, company_id: str) -> Dict[str, Any]:
        # 1. Total conversations and channel/status breakdown
        conversations = await MetaConversation.find({"company_id": company_id}).to_list()
        
        total_conversations = len(conversations)
        channel_counts = {"whatsapp": 0, "instagram": 0, "messenger": 0}
        status_counts = {"open": 0, "pending": 0, "closed": 0}
        
        for conv in conversations:
            channel_str = conv.channel.value if hasattr(conv.channel, "value") else str(conv.channel)
            channel_counts[channel_str] = channel_counts.get(channel_str, 0) + 1
            
            status_str = conv.status.value if hasattr(conv.status, "value") else str(conv.status)
            status_counts[status_str] = status_counts.get(status_str, 0) + 1

        # 2. Total messages and directions
        messages = await MetaMessage.find({"company_id": company_id}).to_list()
        total_messages = len(messages)
        inbound_messages = sum(1 for m in messages if m.direction == "inbound")
        outbound_messages = sum(1 for m in messages if m.direction == "outbound")

        # 3. Calculate First Response Time (FRT)
        # Average duration from first inbound message to first outbound reply in a conversation.
        frt_durations = []
        for conv in conversations:
            conv_msgs = sorted(
                [m for m in messages if m.conversation_id == str(conv.id)],
                key=lambda x: x.occurred_at or x.created_at
            )
            first_inbound = None
            for m in conv_msgs:
                if m.direction == "inbound":
                    first_inbound = m
                    break
            
            if first_inbound:
                first_inbound_time = first_inbound.occurred_at or first_inbound.created_at
                first_outbound = None
                for m in conv_msgs:
                    if m.direction == "outbound" and (m.occurred_at or m.created_at) > first_inbound_time:
                        first_outbound = m
                        break
                
                if first_outbound:
                    first_outbound_time = first_outbound.occurred_at or first_outbound.created_at
                    diff = (first_outbound_time - first_inbound_time).total_seconds()
                    frt_durations.append(diff)
                    
        avg_frt = sum(frt_durations) / len(frt_durations) if frt_durations else 0.0

        # 4. AI Acceptance Rate
        drafts = await MetaAIDraft.find({"company_id": company_id}).to_list()
        total_drafts = len(drafts)
        approved_drafts = sum(1 for d in drafts if d.status == "approved")
        rejected_drafts = sum(1 for d in drafts if d.status == "rejected")
        
        acceptance_rate = (approved_drafts / total_drafts) * 100.0 if total_drafts > 0 else 0.0

        # 5. Conversion rate (CRM leads created from conversations)
        converted_conversations = sum(1 for conv in conversations if conv.linked_lead_id)
        conversion_rate = (converted_conversations / total_conversations) * 100.0 if total_conversations > 0 else 0.0

        return {
            "total_conversations": total_conversations,
            "channel_counts": channel_counts,
            "status_counts": status_counts,
            "total_messages": total_messages,
            "inbound_messages": inbound_messages,
            "outbound_messages": outbound_messages,
            "average_first_response_time_seconds": avg_frt,
            "ai_metrics": {
                "total_drafts": total_drafts,
                "approved_drafts": approved_drafts,
                "rejected_drafts": rejected_drafts,
                "acceptance_rate": acceptance_rate,
            },
            "crm_metrics": {
                "converted_conversations": converted_conversations,
                "conversion_rate": conversion_rate,
            }
        }
