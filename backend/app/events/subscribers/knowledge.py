from __future__ import annotations

from app.events.contracts import DomainEvent
from app.events.registry import event_registry
from app.knowledge.service import KnowledgeIngestionService

knowledge_service = KnowledgeIngestionService()


async def _handle_event(event: DomainEvent) -> None:
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
    ]:
        event_registry.register(event_name, _handle_event)
