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
    DRAFT = "draft"
    SLOT_PROPOSED = "slot_proposed"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    RESCHEDULE_REQUESTED = "reschedule_requested"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"
    FAILED = "failed"


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
    date_of_birth: Optional[str] = None
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


class CandidatePortalCredential(Document):
    """Temporary public tracking credential for one candidate application."""
    company_id: Indexed(str)
    candidate_id: Indexed(str)
    application_id: Indexed(str)
    job_id: Indexed(str)
    tracking_code: Indexed(str, unique=True)
    secret_hash: str
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_candidate_portal_credentials"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("active", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("application_id", ASCENDING)], unique=True),
        ]


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
    tracking_secret_hash: Optional[str] = None
    tracking_secret_created_at: Optional[datetime] = None
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
    storage_public_id: Optional[str] = None
    storage_resource_type: Optional[str] = None
    storage_delivery_type: Optional[str] = None
    checksum: Indexed(str)
    size_bytes: int = 0
    parsed_text: Optional[str] = None
    processing_status: str = "uploaded"
    processing_error: Optional[str] = None
    extracted_text_checksum: Optional[str] = None
    processing_started_at: Optional[datetime] = None
    processing_completed_at: Optional[datetime] = None
    parser_provider: Optional[str] = None
    parser_model: Optional[str] = None
    parser_version: str = "resume-parser-v1"
    processing_metadata: dict[str, Any] = Field(default_factory=dict)
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_resumes"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("checksum", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("uploaded_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("processing_status", ASCENDING), ("uploaded_at", DESCENDING)]),
        ]


class ResumeParsedProfile(Document):
    company_id: Indexed(str)
    resume_id: Indexed(str)
    candidate_id: Indexed(str)
    profile: dict[str, Any] = Field(default_factory=dict)
    field_sources: dict[str, str] = Field(default_factory=dict)
    previous_values: list[dict[str, Any]] = Field(default_factory=list)
    parser_confidence: float = 0
    parse_warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_resume_profiles"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("resume_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("updated_at", DESCENDING)]),
        ]


class SkillAlias(Document):
    company_id: Indexed(str)
    alias: Indexed(str)
    normalized: Indexed(str)
    confidence: float = 1
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_skill_aliases"
        indexes = [IndexModel([("company_id", ASCENDING), ("alias", ASCENDING)], unique=True)]


class CandidateSkillExtraction(Document):
    company_id: Indexed(str)
    candidate_id: Indexed(str)
    resume_id: Indexed(str)
    raw_skill: str
    normalized_skill: Indexed(str)
    confidence: float = 0.8
    evidence: Optional[str] = None
    extracted_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_candidate_skills"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("normalized_skill", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("resume_id", ASCENDING), ("normalized_skill", ASCENDING)], unique=True),
        ]


class JobRequirementProfile(Document):
    company_id: Indexed(str)
    job_id: Indexed(str)
    requirements: dict[str, Any] = Field(default_factory=dict)
    scoring_weights: dict[str, float] = Field(default_factory=dict)
    version: str = "job-requirements-v1"
    extracted_by: Optional[str] = None
    edited_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_job_requirements"
        indexes = [IndexModel([("company_id", ASCENDING), ("job_id", ASCENDING)], unique=True)]


class CandidateJobScore(Document):
    company_id: Indexed(str)
    candidate_id: Indexed(str)
    job_id: Indexed(str)
    resume_id: Optional[str] = None
    scoring_version: str = "candidate-score-v1"
    score: dict[str, Any] = Field(default_factory=dict)
    status: str = "completed"
    human_override: Optional[dict[str, Any]] = None
    scored_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_candidate_job_scores"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("job_id", ASCENDING), ("score.overall_score", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("job_id", ASCENDING), ("scoring_version", ASCENDING)], unique=True),
        ]


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
    required_interviewer_ids: list[str] = Field(default_factory=list)
    optional_interviewer_ids: list[str] = Field(default_factory=list)
    timezone: str = "UTC"
    meeting_provider: Optional[str] = None
    meeting_url: Optional[str] = None
    external_event_id: Optional[str] = None
    external_meeting_id: Optional[str] = None
    organizer_id: Optional[str] = None
    reminder_status: str = "pending"
    candidate_email: Optional[str] = None
    candidate_response: Optional[str] = None
    interviewer_responses: dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None
    cancelled_by: Optional[str] = None
    cancellation_reason: Optional[str] = None
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
            IndexModel([("company_id", ASCENDING), ("external_event_id", ASCENDING)], sparse=True),
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
    job_id: Optional[str] = None
    offer_number: Optional[str] = None
    offered_ctc: float = 0
    job_title: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    work_location: Optional[str] = None
    joining_date: datetime
    probation_period: Optional[str] = None
    currency: str = "INR"
    base_salary: float = 0
    variable_pay: float = 0
    joining_bonus: float = 0
    benefits: list[dict[str, Any]] = Field(default_factory=list)
    notice_period: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    offer_expiry: Optional[datetime] = None
    template_id: Optional[str] = None
    template_version: Optional[str] = None
    pdf_file_id: Optional[str] = None
    pdf_checksum: Optional[str] = None
    status: str = "draft"
    sent_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    withdrawn_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    candidate_comment: Optional[str] = None
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    approval_history: list[dict[str, Any]] = Field(default_factory=list)
    rendered_preview: Optional[str] = None
    immutable_pdf_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None

    class Settings:
        name = "recruitment_offers"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("candidate_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("job_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("offer_expiry", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("offer_number", ASCENDING)], unique=True, sparse=True),
        ]


class OfferTemplate(Document):
    company_id: Indexed(str)
    name: str
    version: str
    body: str
    required_variables: list[str] = Field(default_factory=list)
    branding: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_offer_templates"
        indexes = [IndexModel([("company_id", ASCENDING), ("name", ASCENDING), ("version", ASCENDING)], unique=True)]


class OfferAccessToken(Document):
    company_id: Indexed(str)
    offer_id: Indexed(str)
    candidate_id: Indexed(str)
    token_hash: Indexed(str, unique=True)
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    last_viewed_at: Optional[datetime] = None
    attempts: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_offer_access_tokens"
        indexes = [
            IndexModel([("token_hash", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("offer_id", ASCENDING), ("expires_at", ASCENDING)]),
        ]


class MicrosoftRecruitmentConnection(Document):
    company_id: Indexed(str)
    owner_user_id: Optional[str] = None
    scope: str = "organization"
    tenant_id: Optional[str] = None
    access_token_encrypted: Optional[str] = None
    refresh_token_encrypted: Optional[str] = None
    expires_at: Optional[datetime] = None
    status: str = "not_connected"
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_microsoft_connections"
        indexes = [IndexModel([("company_id", ASCENDING), ("scope", ASCENDING), ("owner_user_id", ASCENDING)], unique=True)]


class MicrosoftOAuthState(Document):
    company_id: Indexed(str)
    actor_id: str
    state_hash: Indexed(str, unique=True)
    redirect_after: Optional[str] = None
    expires_at: datetime
    consumed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_microsoft_oauth_states"
        indexes = [
            IndexModel([("state_hash", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("expires_at", ASCENDING)]),
        ]


class RecruitmentExternalOperation(Document):
    company_id: Indexed(str)
    idempotency_key: Indexed(str, unique=True)
    provider: str
    operation_type: str
    entity_type: str
    entity_id: str
    status: str = "pending"
    request_fingerprint: Optional[str] = None
    external_id: Optional[str] = None
    response: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    attempts: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_external_operations"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("provider", ASCENDING), ("operation_type", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("entity_type", ASCENDING), ("entity_id", ASCENDING)]),
        ]


class RecruitmentEmailDelivery(Document):
    company_id: Indexed(str)
    idempotency_key: Indexed(str, unique=True)
    email_type: str
    entity_type: str
    entity_id: str
    recipient_email: str
    subject: str
    provider: str
    status: str = "pending"
    provider_message_id: Optional[str] = None
    safe_error: Optional[str] = None
    attempts: int = 0
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "recruitment_email_deliveries"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("entity_type", ASCENDING), ("entity_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
        ]


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
    storage_public_id: Optional[str] = None
    storage_resource_type: Optional[str] = None
    storage_delivery_type: Optional[str] = None
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
