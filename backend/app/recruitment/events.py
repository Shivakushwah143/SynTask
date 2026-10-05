from typing import Any, Optional

from app.events import publish_event
from app.events.contracts import DomainEvent
from app.events.factories import build_domain_event

RECRUITMENT_EVENTS = (
    "JobCreated", "JobUpdated", "JobPublished", "JobArchived",
    "CandidateApplied", "ResumeImported", "CandidateUpdated", "CandidateMoved",
    "InterviewScheduled", "InterviewCompleted", "OfferSent", "OfferAccepted",
    "OfferRejected", "CandidateConverted",
    "RecruitmentCandidateCreated",
    "RecruitmentApplicationCreated",
    "ApplicationLifecycleTransitioned", "ApplicationRestored", "ApplicationRecruiterAssigned",
    "RecruitmentResumeStored",
    "RecruitmentEntityUpdated",
    "RecruitmentEntityArchived",
    # Job Engine Events (Phase 2)
    "RecruitmentJobCreated",
    "RecruitmentJobUpdated",
    "RecruitmentJobPublished",
    "RecruitmentJobPaused",
    "RecruitmentJobClosed",
    "RecruitmentJobArchived",
    "RecruitmentJobRestored",
    "RecruitmentJobDuplicated",
    # Career Portal Events (Phase 3)
    "CareerPortalViewed",
    "JobViewed",
    "ResumeUploaded",
    "ApplicationCreated",
    # Recruitment Inbox Events (Phase 4)
    "RecruitmentEmailReceived",
    "CandidateMatched",
    "CandidateCreated",
    "ImportFailed",
    # Candidate Workspace Events (Phase 5)
    "CandidateAssigned",
    "CandidateArchived",
    "CandidateRestored",
    "CandidateNoteAdded",
    "CandidateAttachmentAdded",
    # Interview Engine Events (Phase 6)
    "InterviewUpdated",
    "InterviewRescheduled",
    "InterviewCancelled",
    "InterviewStarted",
    "InterviewFeedbackSubmitted",
    "InterviewDecisionRecorded",
)


def build_recruitment_event(*, event_name: str, aggregate_type: str, aggregate_id: str,
                            company_id: str, actor_id: Optional[str], payload: dict[str, Any]) -> DomainEvent:
    return build_domain_event(event_name=event_name, aggregate_type=aggregate_type,
                              aggregate_id=aggregate_id, company_id=company_id,
                              actor_id=actor_id, payload=payload,
                              metadata={"surface": "recruitment", "domain": "employee_lifecycle"})


async def publish_recruitment_event(**kwargs: Any) -> DomainEvent:
    event = build_recruitment_event(**kwargs)
    await publish_event(event)
    return event
