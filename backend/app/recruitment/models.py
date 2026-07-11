from datetime import datetime
from enum import Enum
from typing import Any, Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class JobLifecycleStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    PUBLISHED = "published"
    PAUSED = "paused"
    CLOSED = "closed"
    ARCHIVED = "archived"


class JobEmploymentType(str, Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERNSHIP = "internship"
    TEMPORARY = "temporary"


class JobWorkMode(str, Enum):
    ONSITE = "onsite"
    REMOTE = "remote"
    HYBRID = "hybrid"


class JobVisibility(str, Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    PRIVATE = "private"


class JobApplicationMethod(str, Enum):
    PORTAL = "portal"
    EMAIL = "email"
    EXTERNAL = "external"


# Legacy alias for backward compatibility
class JobStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class CandidateStatus(str, Enum):
    NEW = "new"
    SCREENING = "screening"
    SHORTLISTED = "shortlisted"
    INTERVIEW_1 = "interview_1"
    INTERVIEW_2 = "interview_2"
    OFFER_SENT = "offer_sent"
    OFFER_ACCEPTED = "offer_accepted"
    JOINED = "joined"
    EMPLOYEE = "employee"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    ARCHIVED = "archived"


class ImportStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    IMPORTED = "imported"
    DUPLICATE = "duplicate"
    FAILED = "failed"
    IGNORED = "ignored"


class InterviewLifecycleStatus(str, Enum):
    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class InterviewDecision(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    HOLD = "hold"
    CANCELLED = "cancelled"
    RESCHEDULED = "rescheduled"


class InterviewFeedbackStatus(str, Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"


class JobAnalyticsCounters(BaseModel):
    """Analytics counters stored on Job document."""
    total_applications: int = 0
    shortlisted: int = 0
    interviewing: int = 0
    offers_sent: int = 0
    joined: int = 0
    rejected: int = 0


class RecruitmentJob(Document):
    # Tenant isolation
    company_id: Indexed(str)

    # Basic job details
    title: str
    slug: Indexed(str)
    department_id: str

    # Hiring team
    hiring_manager_id: Optional[str] = None
    recruiter_ids: list[str] = Field(default_factory=list)

    # Job type and location
    employment_type: JobEmploymentType = JobEmploymentType.FULL_TIME
    work_mode: JobWorkMode = JobWorkMode.ONSITE
    location: str

    # Experience and salary range
    experience_min: float = 0
    experience_max: Optional[float] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    openings: int = 1

    # Skills and description
    required_skills: list[str] = Field(default_factory=list)
    description: str
    responsibilities: Optional[str] = None
    qualifications: Optional[str] = None
    benefits: Optional[str] = None

    # Application settings
    application_deadline: Optional[datetime] = None
    auto_close: bool = False
    visibility: JobVisibility = JobVisibility.PUBLIC
    application_method: JobApplicationMethod = JobApplicationMethod.PORTAL

    # Legacy field - maps to lifecycle_status for backward compatibility
    status: JobStatus = JobStatus.DRAFT

    # New lifecycle status
    lifecycle_status: JobLifecycleStatus = JobLifecycleStatus.DRAFT
    previous_status: Optional[JobLifecycleStatus] = None

    # Analytics counters
    analytics_counters: JobAnalyticsCounters = Field(default_factory=JobAnalyticsCounters)

    # Publishing options
    publish_options: dict[str, Any] = Field(default_factory=dict)

    # Metadata
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_jobs"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("slug", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("lifecycle_status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("department_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("hiring_manager_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("location", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("title", ASCENDING)]),
        ]


class Candidate(Document):
    company_id: Indexed(str)
    job_id: Optional[str] = None
    source: str = "portal"
    full_name: str
    email: Indexed(str)
    phone: Optional[str] = None
    current_company: Optional[str] = None
    experience_years: float = 0
    expected_salary: Optional[float] = None
    notice_period: Optional[str] = None
    location: Optional[str] = None
    education: Optional[str] = None
    skills: list[str] = Field(default_factory=list)
    status: CandidateStatus = CandidateStatus.NEW
    assigned_recruiter_id: Optional[str] = None
    resume_id: Optional[str] = None
    rejection_reason: Optional[str] = None
    employee_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_candidates"
        indexes = [IndexModel([("company_id", ASCENDING), ("email", ASCENDING)], unique=True), IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)])]


class Application(Document):
    """A candidate's application to one job; candidates are reusable people."""
    company_id: Indexed(str)
    candidate_id: Indexed(str)
    job_id: Indexed(str)
    source: str = "portal"
    status: CandidateStatus = CandidateStatus.NEW
    assigned_recruiter_id: Optional[str] = None
    current_resume_id: Optional[str] = None
    tracking_code: Indexed(str, unique=True)
    applied_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_applications"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("job_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("job_id", ASCENDING), ("status", ASCENDING), ("applied_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_recruiter_id", ASCENDING), ("status", ASCENDING)]),
        ]


class Resume(Document):
    company_id: Indexed(str)
    candidate_id: str
    original_filename: str
    mime_type: str
    storage_url: str
    checksum: Indexed(str)
    size_bytes: int = 0
    parsed_text: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_resumes"
        indexes = [IndexModel([("company_id", ASCENDING), ("checksum", ASCENDING)], unique=True)]


class Interview(Document):
    company_id: Indexed(str)
    candidate_id: str
    application_id: Optional[str] = None
    job_id: Optional[str] = None
    round: int
    interview_type: str = "technical"
    interview_mode: str = "online"
    interviewer_ids: list[str]
    panel_name: Optional[str] = None
    mode: str
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    schedule_at: datetime
    scheduled_at: Optional[datetime] = None
    duration_minutes: int = 60
    status: InterviewLifecycleStatus = InterviewLifecycleStatus.SCHEDULED
    feedback_status: InterviewFeedbackStatus = InterviewFeedbackStatus.PENDING
    decision: Optional[InterviewDecision] = None
    feedback: Optional[str] = None
    result: Optional[str] = None
    notes: Optional[str] = None
    calendar_event_id: Optional[str] = None
    reminder_job_id: Optional[str] = None
    cancelled_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_interviews"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("schedule_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("application_id", ASCENDING), ("round", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("schedule_at", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("interviewer_ids", ASCENDING), ("schedule_at", ASCENDING)]),
        ]


class InterviewFeedback(Document):
    company_id: Indexed(str)
    interview_id: Indexed(str)
    application_id: Indexed(str)
    interviewer_id: Indexed(str)
    decision: Optional[InterviewDecision] = None
    feedback: str
    score: Optional[float] = None
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    submitted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_interview_feedback"
        indexes = [IndexModel([("company_id", ASCENDING), ("interview_id", ASCENDING), ("interviewer_id", ASCENDING)], unique=True)]


class Offer(Document):
    company_id: Indexed(str)
    candidate_id: str
    offered_ctc: float
    joining_date: datetime
    status: str = "draft"
    sent_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_offers"
        indexes = [IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("created_at", DESCENDING)])]


class CandidateTimeline(Document):
    company_id: Indexed(str)
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None
    event_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    actor_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_timeline"
        indexes = [IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("created_at", DESCENDING)])]


class CandidateNote(Document):
    company_id: Indexed(str)
    candidate_id: Indexed(str)
    application_id: Optional[str] = None
    body: str
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_candidate_notes"
        indexes = [IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("created_at", DESCENDING)])]


class RecruitmentAttachment(Document):
    company_id: Indexed(str)
    candidate_id: str
    application_id: Optional[str] = None
    kind: str
    original_filename: str
    mime_type: str
    storage_key: str
    checksum: str
    size_bytes: int
    uploaded_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_attachments"
        indexes = [IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("created_at", DESCENDING)]), IndexModel([("company_id", ASCENDING), ("checksum", ASCENDING)])]


class RecruitmentImportJob(Document):
    company_id: Indexed(str)
    source: str = "email"
    external_message_id: Optional[str] = None
    job_id: Optional[str] = None
    status: ImportStatus = ImportStatus.PENDING
    attempts: int = 0
    imported_count: int = 0
    rejected_count: int = 0
    duplicate_count: int = 0
    sender_email: Optional[str] = None
    sender_name: Optional[str] = None
    subject: Optional[str] = None
    body_preview: Optional[str] = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    result: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    requested_by: Optional[str] = None
    processed_at: Optional[datetime] = None
    ignored_at: Optional[datetime] = None
    ignored_by: Optional[str] = None
    merged_into_candidate_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_import_jobs"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("job_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("external_message_id", ASCENDING)], unique=True, sparse=True),
        ]


class RecruitmentOutbox(Document):
    company_id: Indexed(str)
    event_id: Indexed(str, unique=True)
    event_name: str
    aggregate_type: str
    aggregate_id: str
    event_data: dict[str, Any]
    status: str = "pending"
    attempts: int = 0
    available_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_outbox"
        indexes = [IndexModel([("status", ASCENDING), ("available_at", ASCENDING)]), IndexModel([("company_id", ASCENDING), ("aggregate_type", ASCENDING), ("aggregate_id", ASCENDING)])]


class RecruitmentAudit(Document):
    company_id: Indexed(str)
    actor_id: Optional[str] = None
    action: str
    entity_type: str
    entity_id: str
    event_id: Optional[str] = None
    changes: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_audit_logs"
        indexes = [IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)]), IndexModel([("event_id", ASCENDING)], unique=True, sparse=True)]
