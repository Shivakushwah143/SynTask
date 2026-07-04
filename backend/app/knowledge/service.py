from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

from app.knowledge.contracts import KnowledgeCreated, KnowledgeEvent
from app.knowledge.lifecycle import KnowledgeLifecycle
from app.knowledge.normalizer import KnowledgeNormalizer
from app.knowledge.repository import KnowledgeRepository
from app.events import publish_event
from app.events.factories import build_domain_event
from app.models.knowledge import KnowledgeRecord, KnowledgeStatus

logger = logging.getLogger(__name__)


class KnowledgeIngestionService:
    def __init__(self, repository: KnowledgeRepository | None = None) -> None:
        self.repository = repository or KnowledgeRepository()

    async def ingest_event(self, event: KnowledgeEvent) -> KnowledgeRecord:
        record = KnowledgeNormalizer.normalize(event)
        existing = await self.repository.get_latest_by_source(
            event.company_id,
            record.source_entity,
            record.source_entity_id,
            record.knowledge_type,
        )
        if existing:
            if existing.metadata.get("idempotency_key") == event.idempotency_key:
                logger.info(
                    "knowledge_event_duplicate",
                    extra={
                        "event_id": event.event_id,
                        "event_name": event.event_name,
                        "company_id": event.company_id,
                        "source_entity": record.source_entity,
                        "source_entity_id": record.source_entity_id,
                    },
                )
                return existing
            await self.repository.archive_previous_versions(
                event.company_id,
                record.source_entity,
                record.source_entity_id,
                record.knowledge_type,
            )
            record.version = existing.version + 1
            record.status = KnowledgeStatus.ACTIVE

        created = await self.repository.create(record)
        knowledge_created = KnowledgeCreated(
            knowledge_id=created.knowledge_id,
            knowledge_type=created.knowledge_type,
            company_id=created.company_id,
            source_entity=created.source_entity,
            source_entity_id=created.source_entity_id,
            source_event_id=event.event_id,
            source_event_name=event.event_name,
            created_at=created.created_at,
            metadata=dict(created.metadata or {}),
            relationships=[],
        )
        logger.info(
            "knowledge_created",
            extra={
                "event_id": event.event_id,
                "knowledge_id": created.knowledge_id,
                "knowledge_type": created.knowledge_type,
                "company_id": created.company_id,
                "source_entity": created.source_entity,
                "source_entity_id": created.source_entity_id,
                "correlation_id": event.correlation_id,
            },
        )
        await publish_event(
            build_domain_event(
                event_name="KnowledgeCreated",
                aggregate_type="knowledge",
                aggregate_id=created.knowledge_id,
                company_id=created.company_id,
                actor_id=created.created_by,
                project_id=created.project_id,
                campaign_id=created.campaign_id,
                payload={
                    "knowledge_id": created.knowledge_id,
                    "knowledge_type": created.knowledge_type,
                    "source_entity": created.source_entity,
                    "source_entity_id": created.source_entity_id,
                    "version": created.version,
                    "status": created.status.value,
                    "content": created.content,
                    "summary": created.summary,
                    "title": created.title,
                    "updated_at": created.updated_at.isoformat() if created.updated_at else None,
                    "tags": list(created.tags or []),
                    "relationships": list(created.relationships or []),
                    "freshness": created.freshness,
                    "confidence": created.confidence,
                    "importance": created.importance,
                    "metadata": dict(created.metadata or {}),
                },
                metadata={"source": "knowledge_ingestion"},
            )
        )
        return created

    @staticmethod
    def _event(
        *,
        event_name: str,
        aggregate_type: str,
        aggregate_id: str,
        company_id: str,
        actor_id: Optional[str],
        payload: Dict[str, Any],
        project_id: str | None = None,
        campaign_id: str | None = None,
        metadata: Optional[Dict[str, Any]] = None,
        correlation_id: str | None = None,
        causation_id: str | None = None,
        event_version: int = 1,
    ) -> KnowledgeEvent:
        return KnowledgeEvent(
            event_id=str(uuid4()),
            event_name=event_name,
            event_version=event_version,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            company_id=company_id,
            project_id=project_id,
            campaign_id=campaign_id,
            actor_id=actor_id,
            occurred_at=datetime.utcnow(),
            payload=payload,
            metadata=metadata or {},
            idempotency_key=f"{company_id}:{aggregate_type}:{aggregate_id}:{event_name}:{event_version}:{payload.get('version_marker', aggregate_id)}",
            correlation_id=correlation_id,
            causation_id=causation_id,
        )

    async def ingest_project(
        self,
        *,
        project,
        actor_id: str | None,
        event_name: str,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> KnowledgeRecord:
        event = self._event(
            event_name=event_name,
            aggregate_type="project",
            aggregate_id=str(project.project_id or project.id),
            company_id=str(project.company_id),
            actor_id=actor_id,
            project_id=str(project.project_id or project.id),
            payload={
                "title": project.name,
                "name": project.name,
                "summary": project.description or project.name,
                "description": project.description,
                "status": getattr(project.status, "value", project.status),
                "type": getattr(project.type, "value", project.type),
                "lead_id": project.lead_id,
                "assigned_to": project.assigned_to,
                "tags": [project.key, getattr(project.status, "value", project.status)],
                "relationships": [
                    {"relationship_type": "project", "entity_type": "project", "entity_id": str(project.project_id or project.id)},
                ],
                "confidence": 0.95,
                "importance": 4,
                "content": project.description or project.name,
                "version_marker": str(project.updated_at or project.created_at or datetime.utcnow()),
            },
            metadata={"module": "projects"},
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        return await self.ingest_event(event)

    async def ingest_task(
        self,
        *,
        task,
        actor_id: str | None,
        event_name: str,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> KnowledgeRecord:
        event = self._event(
            event_name=event_name,
            aggregate_type="task",
            aggregate_id=str(task.id),
            company_id=str(task.company_id),
            actor_id=actor_id,
            project_id=task.project_id or task.project_object_id,
            payload={
                "title": task.title,
                "summary": task.description or task.title,
                "description": task.description,
                "status": getattr(task.status, "value", task.status),
                "priority": getattr(task.priority, "value", task.priority),
                "due_date": task.due_date.isoformat() if getattr(task, "due_date", None) else None,
                "assigned_to": task.assigned_to,
                "created_by": task.created_by,
                "tags": list(task.tags or []),
                "relationships": [
                    {"relationship_type": "task", "entity_type": "task", "entity_id": str(task.id)},
                ],
                "confidence": 0.88,
                "importance": 3 if getattr(task.priority, "value", task.priority) != "critical" else 5,
                "content": task.description or task.title,
                "version_marker": str(task.updated_at or task.created_at or datetime.utcnow()),
            },
            metadata={"module": "tasks"},
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        return await self.ingest_event(event)

    async def ingest_task_comment(
        self,
        *,
        task,
        comment,
        actor_id: str | None,
        event_name: str,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> KnowledgeRecord:
        event = self._event(
            event_name=event_name,
            aggregate_type="task_comment",
            aggregate_id=str(comment.id),
            company_id=str(comment.company_id),
            actor_id=actor_id,
            project_id=task.project_id or task.project_object_id,
            payload={
                "title": f"Comment on {task.title}",
                "summary": comment.content,
                "description": comment.content,
                "content": comment.content,
                "task_title": task.title,
                "task_id": str(task.id),
                "tags": ["comment", "task"],
                "relationships": [
                    {"relationship_type": "task", "entity_type": "task", "entity_id": str(task.id)},
                ],
                "confidence": 0.84,
                "importance": 2,
                "version_marker": str(comment.updated_at or comment.created_at or datetime.utcnow()),
            },
            metadata={"module": "tasks"},
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        return await self.ingest_event(event)

    async def ingest_meeting(
        self,
        *,
        meeting,
        actor_id: str | None,
        event_name: str,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> KnowledgeRecord:
        event = self._event(
            event_name=event_name,
            aggregate_type="meeting",
            aggregate_id=str(meeting.id),
            company_id=str(meeting.company_id),
            actor_id=actor_id,
            payload={
                "title": meeting.title,
                "summary": meeting.description or meeting.title,
                "description": meeting.description,
                "status": getattr(meeting.status, "value", meeting.status),
                "meeting_date": meeting.meeting_date.isoformat() if getattr(meeting, "meeting_date", None) else None,
                "meeting_time": meeting.meeting_time,
                "duration": meeting.duration,
                "host_id": meeting.host_id,
                "participant_ids": list(meeting.participant_ids or []),
                "tags": ["meeting", getattr(meeting.status, "value", meeting.status)],
                "relationships": [
                    {"relationship_type": "meeting", "entity_type": "meeting", "entity_id": str(meeting.id)},
                ],
                "confidence": 0.9,
                "importance": 4,
                "content": meeting.description or meeting.title,
                "version_marker": str(meeting.updated_at or meeting.created_at or datetime.utcnow()),
            },
            metadata={"module": "meetings"},
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        return await self.ingest_event(event)

    async def ingest_creative_review(
        self,
        *,
        review,
        actor_id: str | None,
        event_name: str,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> KnowledgeRecord:
        event = self._event(
            event_name=event_name,
            aggregate_type="creative_review",
            aggregate_id=str(review.id),
            company_id=str(review.company_id),
            actor_id=actor_id,
            project_id=review.project_id,
            campaign_id=review.campaign_id,
            payload={
                "title": review.summary or f"Creative review for {review.asset_id}",
                "summary": review.summary or f"Creative review for {review.asset_id}",
                "description": review.summary or f"Creative review for {review.asset_id}",
                "status": getattr(review.status, "value", review.status),
                "decision": getattr(review.decision, "value", review.decision),
                "overall_score": review.overall_score,
                "risk_level": review.risk_level,
                "issue_count": review.issue_count,
                "critical_issue_count": review.critical_issue_count,
                "asset_id": review.asset_id,
                "campaign_id": review.campaign_id,
                "tags": ["creative", "review", getattr(review.status, "value", review.status)],
                "relationships": [
                    {"relationship_type": "creative", "entity_type": "creative", "entity_id": review.asset_id},
                    {"relationship_type": "review", "entity_type": "review", "entity_id": str(review.id)},
                ],
                "confidence": 0.9,
                "importance": 4 if review.overall_score < 80 else 3,
                "content": review.summary or review.review_config.get("designer_notes") or "",
                "version_marker": str(review.updated_at or review.created_at or datetime.utcnow()),
            },
            metadata={"module": "creative"},
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        return await self.ingest_event(event)

    async def ingest_client_feedback(
        self,
        *,
        client,
        actor_id: str | None,
        event_name: str,
        payload: Dict[str, Any],
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> KnowledgeRecord:
        event = self._event(
            event_name=event_name,
            aggregate_type="client_feedback",
            aggregate_id=str(client.id),
            company_id=str(client.company_id),
            actor_id=actor_id,
            payload={
                "title": payload.get("title") or f"Feedback from {client.name}",
                "summary": payload.get("summary") or payload.get("notes") or client.notes or client.name,
                "description": payload.get("description") or payload.get("notes") or client.notes or client.name,
                "tags": ["client", "feedback", *(client.tags or [])],
                "relationships": [
                    {"relationship_type": "client", "entity_type": "client", "entity_id": str(client.id)},
                ],
                "confidence": 0.87,
                "importance": 3,
                "content": payload.get("content") or payload.get("notes") or client.notes or "",
                "version_marker": str(payload.get("version_marker") or datetime.utcnow()),
            },
            metadata={"module": "client"},
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        return await self.ingest_event(event)

    async def ingest_content_item(
        self,
        *,
        item,
        actor_id: str | None,
        event_name: str,
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> KnowledgeRecord:
        event = self._event(
            event_name=event_name,
            aggregate_type="content_item",
            aggregate_id=str(item.id),
            company_id=str(item.company_id),
            actor_id=actor_id,
            project_id=str(item.project_id) if item.project_id else None,
            payload={
                "title": item.title,
                "summary": item.notes or item.title,
                "description": item.notes or item.title,
                "status": getattr(item.status, "value", item.status),
                "priority": getattr(item.priority, "value", item.priority),
                "content_type": getattr(item.content_type, "value", item.content_type),
                "due_date": item.due_date.isoformat() if getattr(item, "due_date", None) else None,
                "publish_date": item.publish_date.isoformat() if getattr(item, "publish_date", None) else None,
                "shoot_date": item.shoot_date.isoformat() if getattr(item, "shoot_date", None) else None,
                "tags": list(item.tags or []),
                "relationships": [
                    {"relationship_type": "project", "entity_type": "project", "entity_id": str(item.project_id)},
                ],
                "confidence": 0.9,
                "importance": 4 if getattr(item.priority, "value", item.priority) in {"high", "urgent"} else 3,
                "content": item.notes or item.title,
                "version_marker": str(item.updated_at or item.created_at or datetime.utcnow()),
            },
            metadata={"module": "content_calendar"},
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        return await self.ingest_event(event)


knowledge_service = KnowledgeIngestionService()
