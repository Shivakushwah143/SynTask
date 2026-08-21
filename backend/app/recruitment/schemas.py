from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator

from app.recruitment.models import (CandidateStatus, ImportStatus,
                                    InterviewDecision,
                                    InterviewFeedbackStatus,
                                    InterviewLifecycleStatus,
                                    JobApplicationMethod,
                                    JobEmploymentType, JobLifecycleStatus,
                                    JobVisibility, JobWorkMode)


# Job Analytics Counters Schema
class JobAnalyticsCountersSchema(BaseModel):
    total_applications: int = 0
    shortlisted: int = 0
    interviewing: int = 0
    offers_sent: int = 0
    joined: int = 0
    rejected: int = 0


# Job Create Schema
class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    department_id: str
    hiring_manager_id: Optional[str] = None
    recruiter_ids: list[str] = Field(default_factory=list)
    employment_type: JobEmploymentType = JobEmploymentType.FULL_TIME
    work_mode: JobWorkMode = JobWorkMode.ONSITE
    location: str
    experience_min: float = Field(default=0, ge=0)
    experience_max: Optional[float] = Field(default=None, ge=0)
    salary_min: Optional[float] = Field(default=None, ge=0)
    salary_max: Optional[float] = Field(default=None, ge=0)
    openings: int = Field(default=1, ge=1)
    required_skills: list[str] = Field(default_factory=list)
    description: str = Field(min_length=10)
    responsibilities: Optional[str] = None
    qualifications: Optional[str] = None
    benefits: Optional[str] = None
    application_deadline: Optional[datetime] = None
    auto_close: bool = False
    visibility: JobVisibility = JobVisibility.PUBLIC
    application_method: JobApplicationMethod = JobApplicationMethod.PORTAL
    publish_options: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_ranges(self):
        if self.experience_max is not None and self.experience_max < self.experience_min:
            raise ValueError("experience_max must be greater than or equal to experience_min")
        if self.salary_min is not None and self.salary_max is not None and self.salary_max < self.salary_min:
            raise ValueError("salary_max must be greater than or equal to salary_min")
        return self


# Job Update Schema
class JobUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=160)
    department_id: Optional[str] = None
    hiring_manager_id: Optional[str] = None
    recruiter_ids: Optional[list[str]] = None
    employment_type: Optional[JobEmploymentType] = None
    work_mode: Optional[JobWorkMode] = None
    location: Optional[str] = None
    experience_min: Optional[float] = Field(default=None, ge=0)
    experience_max: Optional[float] = Field(default=None, ge=0)
    salary_min: Optional[float] = Field(default=None, ge=0)
    salary_max: Optional[float] = Field(default=None, ge=0)
    openings: Optional[int] = Field(default=None, ge=1)
    required_skills: Optional[list[str]] = None
    description: Optional[str] = Field(default=None, min_length=10)
    responsibilities: Optional[str] = None
    qualifications: Optional[str] = None
    benefits: Optional[str] = None
    application_deadline: Optional[datetime] = None
    auto_close: Optional[bool] = None
    visibility: Optional[JobVisibility] = None
    application_method: Optional[JobApplicationMethod] = None
    publish_options: Optional[dict] = None


# Job Status Transition Schema
class JobStatusUpdate(BaseModel):
    """Request body for a validated lifecycle status transition."""
    status: JobLifecycleStatus


# Job Response Schema
class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    title: str
    slug: str
    department_id: str
    hiring_manager_id: Optional[str] = None
    recruiter_ids: list[str] = []
    employment_type: JobEmploymentType
    work_mode: JobWorkMode
    location: str
    experience_min: float
    experience_max: Optional[float] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    openings: int
    required_skills: list[str] = []
    description: str
    responsibilities: Optional[str] = None
    qualifications: Optional[str] = None
    benefits: Optional[str] = None
    application_deadline: Optional[datetime] = None
    auto_close: bool
    visibility: JobVisibility
    application_method: JobApplicationMethod
    lifecycle_status: JobLifecycleStatus
    analytics_counters: JobAnalyticsCountersSchema
    created_by: str
    created_at: datetime
    updated_at: datetime



# Job List Response Schema (for pagination)
class JobListResponse(BaseModel):
    items: list[JobResponse]
    total: int
    page: int
    page_size: int
    has_next: bool


# Job Filter Schema
class JobFilter(BaseModel):
    department_id: Optional[str] = None
    lifecycle_status: Optional[JobLifecycleStatus] = None
    hiring_manager_id: Optional[str] = None
    recruiter_id: Optional[str] = None
    work_mode: Optional[JobWorkMode] = None
    employment_type: Optional[JobEmploymentType] = None
    location: Optional[str] = None
    visibility: Optional[JobVisibility] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    search: Optional[str] = None


# Job Sort Schema
class JobSort(BaseModel):
    field: str = "created_at"
    order: str = "desc"  # "asc" or "desc"


class CandidateApply(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    phone: Optional[str] = None
    current_company: Optional[str] = None
    experience_years: float = Field(default=0, ge=0)
    expected_salary: Optional[float] = Field(default=None, ge=0)
    notice_period: Optional[str] = None
    location: Optional[str] = None
    education: Optional[str] = None
    skills: list[str] = Field(default_factory=list)
    resume_filename: str
    resume_mime_type: str
    resume_storage_url: str
    resume_checksum: str = Field(min_length=16)


class CandidateUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    current_company: Optional[str] = None
    experience_years: Optional[float] = Field(default=None, ge=0)
    expected_salary: Optional[float] = Field(default=None, ge=0)
    notice_period: Optional[str] = None
    location: Optional[str] = None
    education: Optional[str] = None
    skills: Optional[list[str]] = None
    assigned_recruiter_id: Optional[str] = None


class CandidateMove(BaseModel):
    status: CandidateStatus


class CandidateReject(BaseModel):
    reason: str = Field(min_length=2)


class InterviewCreate(BaseModel):
    candidate_id: str
    application_id: Optional[str] = None
    job_id: Optional[str] = None
    round: int = Field(ge=1)
    interview_type: str = "technical"
    interview_mode: str = "online"
    interviewer_ids: list[str] = Field(min_length=1)
    panel_name: Optional[str] = None
    mode: str = "online"
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    schedule_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=480)
    notes: Optional[str] = None


class InterviewUpdate(BaseModel):
    interviewer_ids: Optional[list[str]] = None
    interview_type: Optional[str] = None
    interview_mode: Optional[str] = None
    panel_name: Optional[str] = None
    mode: Optional[str] = None
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    schedule_at: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=15, le=480)
    notes: Optional[str] = None


class InterviewFeedback(BaseModel):
    feedback: str = Field(min_length=2)
    result: Optional[str] = None
    decision: Optional[InterviewDecision] = None
    score: Optional[float] = Field(default=None, ge=0, le=10)
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)


class InterviewResponse(BaseModel):
    id: str
    company_id: str
    candidate_id: str
    application_id: Optional[str] = None
    job_id: Optional[str] = None
    round: int
    interview_type: str
    interview_mode: str
    interviewer_ids: list[str]
    panel_name: Optional[str] = None
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    schedule_at: datetime
    duration_minutes: int
    status: InterviewLifecycleStatus
    feedback_status: InterviewFeedbackStatus
    decision: Optional[InterviewDecision] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class InterviewListResponse(BaseModel):
    items: list[InterviewResponse]
    total: int
    page: int
    page_size: int
    has_next: bool


class InterviewRescheduleRequest(BaseModel):
    schedule_at: datetime
    duration_minutes: Optional[int] = Field(default=None, ge=15, le=480)
    meeting_link: Optional[str] = None
    location: Optional[str] = None
    reason: Optional[str] = None


class InterviewCancelRequest(BaseModel):
    reason: Optional[str] = None


class InterviewDecisionRequest(BaseModel):
    decision: InterviewDecision
    notes: Optional[str] = None


class OfferCreate(BaseModel):
    candidate_id: str
    offered_ctc: float = Field(gt=0)
    joining_date: datetime
    send: bool = True


class OfferUpdate(BaseModel):
    offered_ctc: Optional[float] = Field(default=None, gt=0)
    joining_date: Optional[datetime] = None
    status: Optional[str] = None


class ConversionRequest(BaseModel):
    department_id: str
    designation: str
    reports_to: Optional[str] = None


# =============================================================================
# Career Portal Schemas (Phase 3)
# =============================================================================


# Public Job Listing Response
class PublicJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    slug: str
    department_id: str
    employment_type: JobEmploymentType
    work_mode: JobWorkMode
    location: str
    experience_min: float
    experience_max: Optional[float] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    openings: int
    required_skills: list[str] = []
    description: str
    responsibilities: Optional[str] = None
    qualifications: Optional[str] = None
    benefits: Optional[str] = None
    application_deadline: Optional[datetime] = None
    apply_available: bool = True
    created_at: datetime


# Public Job List Response (for pagination)
class PublicJobListResponse(BaseModel):
    items: list[PublicJobResponse]
    total: int
    page: int
    page_size: int
    has_next: bool


class PublicCareerCompanyResponse(BaseModel):
    name: str
    slug: str
    industry: Optional[str] = None
    location: Optional[str] = None
    job_count: int


# Career Portal Settings
class CareerPortalSettings(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    primary_color: Optional[str] = None
    careers_description: Optional[str] = None
    office_locations: list[str] = []
    social_links: dict[str, str] = {}
    hiring_process: Optional[str] = None
    is_active: bool = True


# Application Apply Request
class ApplicationApplyRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    phone: Optional[str] = None
    current_company: Optional[str] = None
    experience_years: float = Field(default=0, ge=0)
    expected_salary: Optional[float] = Field(default=None, ge=0)
    notice_period: Optional[str] = None
    location: Optional[str] = None
    education: Optional[str] = None
    skills: list[str] = Field(default_factory=list)
    resume_content: bytes  # Binary resume content
    resume_filename: str


# Application Apply Response
class ApplicationApplyResponse(BaseModel):
    application_id: str
    tracking_code: str
    tracking_pin: Optional[str] = None
    job_id: str
    job_title: str
    candidate_email: str
    applied_at: datetime
    message: str


# Application Status Response (public)
class ApplicationStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tracking_code: str
    job_title: str
    status: str
    status_label: str
    current_step: str
    timeline: list[dict]
    applied_at: datetime
    last_updated: datetime



# Resume Upload Request (for internal use)
class ResumeUploadRequest(BaseModel):
    resume_content: bytes
    resume_filename: str
    candidate_id: Optional[str] = None


# Resume Upload Response
class ResumeUploadResponse(BaseModel):
    resume_id: str
    storage_url: str
    filename: str
    size: int
    checksum: str
    mime_type: str


# Duplicate Check Result
class DuplicateCheckResult(BaseModel):
    is_duplicate: bool
    candidate_id: Optional[str] = None
    existing_application_id: Optional[str] = None
    reason: Optional[str] = None


# =============================================================================
# Recruitment Inbox Schemas (Phase 4)
# =============================================================================


class InboxAttachmentInput(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(min_length=1)


class InboxImportRequest(BaseModel):
    job_id: str
    external_message_id: Optional[str] = None
    sender_email: EmailStr
    sender_name: Optional[str] = None
    subject: Optional[str] = None
    body_preview: Optional[str] = None
    candidate_name: Optional[str] = None
    candidate_phone: Optional[str] = None
    attachments: list[InboxAttachmentInput] = Field(min_length=1)
    process_now: bool = True


class InboxSyncResponse(BaseModel):
    synced_count: int
    created_count: int
    processed_count: int


class InboxMergeRequest(BaseModel):
    candidate_id: str


class InboxItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    job_id: Optional[str] = None
    external_message_id: Optional[str] = None
    status: ImportStatus
    attempts: int
    imported_count: int
    rejected_count: int
    duplicate_count: int
    sender_email: Optional[str] = None
    sender_name: Optional[str] = None
    subject: Optional[str] = None
    body_preview: Optional[str] = None
    attachments: list[dict] = []
    result: dict = {}
    error: Optional[str] = None
    requested_by: Optional[str] = None
    processed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime



class InboxListResponse(BaseModel):
    items: list[InboxItemResponse]
    total: int
    page: int
    page_size: int
    has_next: bool


# =============================================================================
# Candidate Workspace Schemas (Phase 5)
# =============================================================================


class CandidateAssignRequest(BaseModel):
    recruiter_id: str


class CandidateAssignJobRequest(BaseModel):
    """Quick-assign a job to a candidate (creates an application link).

    When ``hire`` is True the candidate is also converted to an employee
    (status -> employee, a User record is created) so they move out of the
    candidates list and appear on the Recruitment > Employees page.
    """
    job_id: str
    source: str = "manual"
    hire: bool = False


class CandidateAssignJobResponse(BaseModel):
    application_id: str
    tracking_code: str
    candidate_id: str
    candidate_name: str
    job_id: str
    job_title: str
    message: str
    hired: bool = False
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    department_id: Optional[str] = None


class CandidateNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    application_id: Optional[str] = None


class CandidateAttachmentResponse(BaseModel):
    id: str
    kind: str
    original_filename: str
    mime_type: str
    storage_key: str
    checksum: str
    size_bytes: int
    created_at: datetime


class KeywordMatchResponse(BaseModel):
    matchedSkills: list[str]
    missingSkills: list[str]
    matchPercentage: float


class CandidateWorkspaceResponse(BaseModel):
    candidate: dict
    applications: list[dict]
    resumes: list[dict]
    timeline: list[dict]
    notes: list[dict]
    attachments: list[dict]


class CandidateListResponse(BaseModel):
    items: list[dict]
    total: int
    page: int
    page_size: int
    has_next: bool


class EmployeeListResponse(BaseModel):
    items: list[dict]
    total: int
    page: int
    page_size: int
    has_next: bool


class ResumePoolResponse(BaseModel):
    items: list[dict]
    total: int
    page: int
    page_size: int
    has_next: bool
