from __future__ import annotations

import logging

from app.events.contracts import DomainEvent
from app.events.registry import event_registry
from app.core.config import settings
from app.core.redis_client import get_redis_health
from app.knowledge.service import KnowledgeIngestionService

logger = logging.getLogger(__name__)

knowledge_service = KnowledgeIngestionService()


async def _handle_event(event: DomainEvent) -> None:
    if settings.DISABLE_EVENT_PROCESSING:
        logger.info(
            "event_processing_disabled",
            extra={"event_id": event.event_id, "event_name": event.event_name, "company_id": event.company_id},
        )
        return

    if not await get_redis_health():
        logger.warning(
            "knowledge_event_skipped_redis_unavailable",
            extra={
                "event_id": event.event_id,
                "event_name": event.event_name,
                "company_id": event.company_id,
                "aggregate_type": event.aggregate_type,
                "aggregate_id": event.aggregate_id,
            },
        )
        return

    if event.event_name.startswith("Project"):
        from app.models.project import Project

        project = await Project.get(event.aggregate_id)
        if project:
            await knowledge_service.ingest_project(
                project=project,
                actor_id=event.actor_id,
                event_name=event.event_name,
                correlation_id=event.correlation_id,
                causation_id=event.causation_id,
            )
    elif event.event_name.startswith("Task"):
        from app.models.task import Task, TaskComment

        if event.aggregate_type == "task_comment":
            comment = await TaskComment.get(event.aggregate_id)
            task_id = event.payload.get("task_id")
            task = await Task.get(task_id) if task_id else None
            if task and comment:
                await knowledge_service.ingest_task_comment(
                    task=task,
                    comment=comment,
                    actor_id=event.actor_id,
                    event_name=event.event_name,
                    correlation_id=event.correlation_id,
                    causation_id=event.causation_id,
                )
        else:
            task = await Task.get(event.aggregate_id)
            if task:
                await knowledge_service.ingest_task(
                    task=task,
                    actor_id=event.actor_id,
                    event_name=event.event_name,
                    correlation_id=event.correlation_id,
                    causation_id=event.causation_id,
                )
    elif event.event_name.startswith("Meeting"):
        from app.models.meeting import Meeting

        meeting = await Meeting.get(event.aggregate_id)
        if meeting:
            await knowledge_service.ingest_meeting(
                meeting=meeting,
                actor_id=event.actor_id,
                event_name=event.event_name,
                correlation_id=event.correlation_id,
                causation_id=event.causation_id,
            )
    elif event.event_name.startswith("Creative") or event.event_name == "DocumentUploaded":
        from app.models.creative_review import CreativeReview

        review = await CreativeReview.get(event.aggregate_id)
        if review:
            await knowledge_service.ingest_creative_review(
                review=review,
                actor_id=event.actor_id,
                event_name=event.event_name,
                correlation_id=event.correlation_id,
                causation_id=event.causation_id,
            )
    elif event.event_name == "ClientFeedbackAdded":
        from app.models.client import Client

        client = await Client.get(event.aggregate_id)
        if client:
            await knowledge_service.ingest_client_feedback(
                client=client,
                actor_id=event.actor_id,
                event_name=event.event_name,
                payload=event.payload,
                correlation_id=event.correlation_id,
                causation_id=event.causation_id,
            )
    elif event.event_name.startswith("Content"):
        from app.models.content_calendar import ContentCalendarItem

        item = await ContentCalendarItem.get(event.aggregate_id)
        if item:
            await knowledge_service.ingest_content_item(
                item=item,
                actor_id=event.actor_id,
                event_name=event.event_name,
                correlation_id=event.correlation_id,
                causation_id=event.causation_id,
            )


def register_knowledge_subscribers() -> None:
    for event_name in [
        "ProjectCreated",
        "ProjectUpdated",
        "ProjectArchived",
        "ProjectDeleted",
        "TaskCreated",
        "TaskUpdated",
        "TaskCompleted",
        "TaskCommentAdded",
        "TaskAttachmentAdded",
        "MeetingCreated",
        "MeetingDeleted",
        "CreativeUploaded",
        "CreativeReviewed",
        "CreativeApproved",
        "CreativeRejected",
        "CreativeReviewFeedbackAdded",
        "DocumentUploaded",
        "ClientFeedbackAdded",
        "ContentPlanned",
        "ShootScheduled",
        "ShootCompleted",
        "EditingStarted",
        "ReadyForReview",
        "Approved",
        "Scheduled",
        "Published",
        "DeadlineMissed",
    ]:
        event_registry.register(event_name, _handle_event)
