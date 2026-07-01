from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List
from uuid import uuid4

from app.knowledge.contracts import KnowledgeEvent
from app.knowledge.relationships import KnowledgeRelationshipBuilder
from app.models.knowledge import KnowledgeRecord, KnowledgeType, KnowledgeStatus


class KnowledgeNormalizer:
    EVENT_MAP: dict[str, KnowledgeType] = {
        "ProjectCreated": KnowledgeType.PROJECT,
        "ProjectUpdated": KnowledgeType.PROJECT,
        "ProjectArchived": KnowledgeType.PROJECT,
        "ProjectDeleted": KnowledgeType.PROJECT,
        "CampaignCreated": KnowledgeType.CAMPAIGN,
        "CampaignUpdated": KnowledgeType.CAMPAIGN,
        "CampaignCompleted": KnowledgeType.CAMPAIGN,
        "TaskCreated": KnowledgeType.TASK,
        "TaskUpdated": KnowledgeType.TASK,
        "TaskCompleted": KnowledgeType.TASK,
        "TaskCommentAdded": KnowledgeType.TASK,
        "TaskAttachmentAdded": KnowledgeType.TASK,
        "MeetingCreated": KnowledgeType.MEETING,
        "MeetingUpdated": KnowledgeType.MEETING,
        "MeetingCompleted": KnowledgeType.MEETING,
        "MeetingDeleted": KnowledgeType.MEETING,
        "MeetingDecisionRecorded": KnowledgeType.DECISION,
        "CommentAdded": KnowledgeType.FEEDBACK,
        "CreativeUploaded": KnowledgeType.CREATIVE,
        "CreativeReviewed": KnowledgeType.REVIEW,
        "CreativeApproved": KnowledgeType.CREATIVE,
        "CreativeRejected": KnowledgeType.REVIEW,
        "CreativeReviewCompleted": KnowledgeType.REVIEW,
        "CreativeReviewFeedbackAdded": KnowledgeType.FEEDBACK,
        "CreativeFeedbackAdded": KnowledgeType.FEEDBACK,
        "BrandGuidelineUpdated": KnowledgeType.BRAND,
        "ClientFeedbackAdded": KnowledgeType.FEEDBACK,
        "DecisionRecorded": KnowledgeType.DECISION,
        "DocumentUploaded": KnowledgeType.CREATIVE,
    }

    @classmethod
    def normalize(cls, event: KnowledgeEvent) -> KnowledgeRecord:
        knowledge_type = cls.EVENT_MAP.get(event.event_name, KnowledgeType.BEST_PRACTICE)
        payload = dict(event.payload or {})
        metadata = dict(event.metadata or {})
        source = event.aggregate_type.lower()
        source_id = event.aggregate_id
        title, summary, content, tags, relationships, confidence, importance = cls._build_knowledge(
            knowledge_type=knowledge_type,
            event=event,
            payload=payload,
        )
        status = KnowledgeStatus.ACTIVE if knowledge_type != KnowledgeType.BEST_PRACTICE else KnowledgeStatus.DRAFT

        return KnowledgeRecord.model_construct(
            knowledge_id=str(uuid4()),
            knowledge_type=knowledge_type.value,
            company_id=event.company_id,
            project_id=event.project_id,
            campaign_id=event.campaign_id,
            source_entity=source,
            source_entity_id=source_id,
            source_event=event.model_dump(),
            title=title,
            summary=summary,
            content=content,
            relationships=KnowledgeRelationshipBuilder.from_refs(relationships),
            tags=tags,
            confidence=confidence,
            importance=importance,
            freshness=1.0,
            status=status,
            version=1,
            created_by=event.actor_id,
            created_at=event.occurred_at,
            updated_at=event.occurred_at,
            metadata={
                **metadata,
                "source_event_name": event.event_name,
                "source_event_version": event.event_version,
                "idempotency_key": event.idempotency_key,
                "correlation_id": event.correlation_id,
                "causation_id": event.causation_id,
            },
        )

    @staticmethod
    def _build_knowledge(
        *,
        knowledge_type: KnowledgeType,
        event: KnowledgeEvent,
        payload: Dict[str, Any],
    ) -> tuple[str, str, str, List[str], List[Dict[str, Any]], float, int]:
        title = payload.get("title") or payload.get("name") or event.event_name
        summary = payload.get("summary") or payload.get("description") or f"{event.event_name} occurred."
        content_parts = [
            f"event={event.event_name}",
            f"aggregate={event.aggregate_type}:{event.aggregate_id}",
            f"company={event.company_id}",
        ]
        for key in ("status", "priority", "due_date", "completed_at", "approved_at"):
            if payload.get(key) is not None:
                content_parts.append(f"{key}={payload.get(key)}")

        tags = list(dict.fromkeys([
            knowledge_type.value,
            event.aggregate_type,
            *(payload.get("tags") or []),
        ]))

        relationships: List[Dict[str, Any]] = list(payload.get("relationships") or [])
        if event.project_id:
            relationships.append(
                {
                    "relationship_type": "project",
                    "entity_type": "project",
                    "entity_id": event.project_id,
                    "label": payload.get("project_name") or payload.get("project_id") or event.project_id,
                }
            )
        if event.campaign_id:
            relationships.append(
                {
                    "relationship_type": "campaign",
                    "entity_type": "campaign",
                    "entity_id": event.campaign_id,
                    "label": payload.get("campaign_name") or payload.get("campaign_id") or event.campaign_id,
                }
            )
        if payload.get("source_entities"):
            relationships.extend(payload["source_entities"])

        confidence = float(payload.get("confidence", 0.85))
        importance = int(payload.get("importance", 3))
        content = "\n".join(content_parts + [payload.get("content") or payload.get("body") or ""])
        return title, summary, content.strip(), tags, relationships, confidence, importance
