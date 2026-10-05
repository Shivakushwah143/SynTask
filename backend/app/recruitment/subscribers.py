from app.events.contracts import DomainEvent
from app.events.registry import event_registry
from app.recruitment.events import RECRUITMENT_EVENTS
from app.recruitment.models import CandidateTimeline, RecruitmentAudit


async def persist_recruitment_timeline(event: DomainEvent) -> None:
    existing = await CandidateTimeline.find_one({"payload.event_id": event.event_id})
    if existing:
        return
    await CandidateTimeline(
        company_id=event.company_id,
        candidate_id=event.payload.get("candidate_id") if event.aggregate_type != "candidate" else event.aggregate_id,
        application_id=event.payload.get("application_id"),
        job_id=event.payload.get("job_id") if event.aggregate_type != "job" else event.aggregate_id,
        event_type=event.event_name,
        payload={**event.payload, "event_id": event.event_id},
        actor_id=event.actor_id,
        created_at=event.timestamp,
    ).insert()


async def persist_recruitment_audit(event: DomainEvent) -> None:
    if await RecruitmentAudit.find_one({"event_id": event.event_id}):
        return
    await RecruitmentAudit(
        company_id=event.company_id,
        actor_id=event.actor_id,
        action=event.event_name,
        entity_type=event.aggregate_type,
        entity_id=event.aggregate_id,
        event_id=event.event_id,
        changes=event.payload,
        created_at=event.timestamp,
    ).insert()


def register_recruitment_subscribers() -> None:
    for event_name in RECRUITMENT_EVENTS:
        event_registry.register(event_name, persist_recruitment_timeline)
        event_registry.register(event_name, persist_recruitment_audit)
