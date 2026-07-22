import hashlib
import secrets
import base64
from io import BytesIO
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, UploadFile, status
from pathlib import Path
from slugify import slugify

from app.core.security import get_password_hash
from app.models.company import Company
from app.models.department import Department
from app.models.user import User, UserRole, UserStatus
from app.recruitment.models import (Application, Candidate, CandidateStatus,
                                    CandidateNote, ImportStatus,
                                    InterviewDecision, InterviewFeedback,
                                    InterviewFeedbackStatus,
                                    InterviewLifecycleStatus,
                                    RecruitmentAttachment,
                                    RecruitmentImportJob, Interview,
                                    JobAnalyticsCounters,
                                    JobEmploymentType, JobLifecycleStatus,
                                    JobStatus, JobVisibility, JobWorkMode, Offer,
                                    RecruitmentJob, Resume)
from app.recruitment.events import publish_recruitment_event
from app.recruitment.repositories import (ApplicationRepository,
                                         CandidateNoteRepository,
                                         CandidateRepository,
                                         CandidateTimelineRepository,
                                         ImportJobRepository,
                                         InterviewFeedbackRepository,
                                         InterviewRepository,
                                         JobRepository, ResumeRepository,
                                         RecruitmentReportRepository,
                                         RecruitmentAttachmentRepository,
                                         TenantRepository)
from app.recruitment.schemas import (ApplicationApplyRequest,
                                     ApplicationApplyResponse,
                                     ApplicationStatusResponse,
                                     CandidateApply, ConversionRequest,
                                     DuplicateCheckResult, InboxImportRequest,
                                     InterviewCancelRequest, InterviewCreate,
                                     InterviewDecisionRequest,
                                     InterviewFeedback as InterviewFeedbackPayload,
                                     InterviewRescheduleRequest,
                                     InterviewUpdate, JobCreate, JobFilter,
                                     JobUpdate,
                                     ResumeUploadResponse)
from app.services.file_service import FileService
from app.core.clock import utc_now


TRANSITIONS = {
    CandidateStatus.NEW: {CandidateStatus.SCREENING, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN, CandidateStatus.ARCHIVED},
    CandidateStatus.SCREENING: {CandidateStatus.SHORTLISTED, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN},
    CandidateStatus.SHORTLISTED: {CandidateStatus.INTERVIEW_1, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN},
    CandidateStatus.INTERVIEW_1: {CandidateStatus.INTERVIEW_2, CandidateStatus.OFFER_SENT, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN},
    CandidateStatus.INTERVIEW_2: {CandidateStatus.OFFER_SENT, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN},
    CandidateStatus.OFFER_SENT: {CandidateStatus.OFFER_ACCEPTED, CandidateStatus.REJECTED, CandidateStatus.WITHDRAWN},
    CandidateStatus.OFFER_ACCEPTED: {CandidateStatus.JOINED, CandidateStatus.WITHDRAWN},
    CandidateStatus.JOINED: {CandidateStatus.EMPLOYEE},
}


# Job Lifecycle State Transitions
JOB_LIFECYCLE_TRANSITIONS = {
    JobLifecycleStatus.DRAFT: {JobLifecycleStatus.PENDING_APPROVAL, JobLifecycleStatus.ARCHIVED},
    JobLifecycleStatus.PENDING_APPROVAL: {JobLifecycleStatus.APPROVED, JobLifecycleStatus.DRAFT, JobLifecycleStatus.ARCHIVED},
    JobLifecycleStatus.APPROVED: {JobLifecycleStatus.PUBLISHED, JobLifecycleStatus.DRAFT, JobLifecycleStatus.ARCHIVED},
    JobLifecycleStatus.PUBLISHED: {JobLifecycleStatus.PAUSED, JobLifecycleStatus.CLOSED, JobLifecycleStatus.ARCHIVED},
    JobLifecycleStatus.PAUSED: {JobLifecycleStatus.PUBLISHED, JobLifecycleStatus.CLOSED, JobLifecycleStatus.ARCHIVED},
    JobLifecycleStatus.CLOSED: {JobLifecycleStatus.ARCHIVED, JobLifecycleStatus.PUBLISHED},
    JobLifecycleStatus.ARCHIVED: {JobLifecycleStatus.DRAFT},  # Restore
}


async def record(company_id: str, event: str, actor_id: str | None, *, candidate_id: str | None = None, job_id: str | None = None, payload: dict | None = None):
    data = payload or {}
    entity_type, entity_id = ("candidate", candidate_id) if candidate_id else ("job", job_id)
    return await publish_recruitment_event(
        event_name=event,
        aggregate_type=entity_type,
        aggregate_id=entity_id or "",
        company_id=company_id,
        actor_id=actor_id,
        payload={**data, "candidate_id": candidate_id, "job_id": job_id},
    )


class RecruitmentService:
    @staticmethod
    async def create_job(company_id: str, actor_id: str, data: JobCreate) -> RecruitmentJob:
        department = await Department.get(data.department_id)
        if not department or department.company_id != company_id or department.deleted_at is not None:
            raise HTTPException(status_code=400, detail="Department not found")
        base, slug = slugify(data.title), slugify(data.title)
        sequence = 2
        while await RecruitmentJob.find_one({"company_id": company_id, "slug": slug}):
            slug, sequence = f"{base}-{sequence}", sequence + 1
        job = RecruitmentJob(company_id=company_id, slug=slug, created_by=actor_id, **data.model_dump())
        await job.insert()
        await record(company_id, "JobCreated", actor_id, job_id=str(job.id))
        return job

    @staticmethod
    async def apply(job: RecruitmentJob, data: CandidateApply, source: str = "portal") -> Candidate:
        if await CandidateRepository.duplicate(job.company_id, str(data.email), str(job.id)):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Candidate already applied for this job")
        if await Resume.find_one({"company_id": job.company_id, "checksum": data.resume_checksum}):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Resume already imported")
        candidate_data = data.model_dump(exclude={"resume_filename", "resume_mime_type", "resume_storage_url", "resume_checksum"})
        candidate = Candidate(company_id=job.company_id, job_id=str(job.id), source=source, email=str(data.email).lower(), **candidate_data)
        await candidate.insert()
        resume = Resume(company_id=job.company_id, candidate_id=str(candidate.id), original_filename=data.resume_filename, mime_type=data.resume_mime_type, storage_url=data.resume_storage_url, checksum=data.resume_checksum)
        await resume.insert()
        candidate.resume_id = str(resume.id)
        await candidate.save()
        await record(job.company_id, "CandidateApplied" if source == "portal" else "ResumeImported", None, candidate_id=str(candidate.id), job_id=str(job.id), payload={"source": source})
        return candidate

    @staticmethod
    async def move(candidate: Candidate, target: CandidateStatus, actor_id: str) -> Candidate:
        if target not in TRANSITIONS.get(candidate.status, set()):
            raise HTTPException(status_code=409, detail=f"Invalid candidate transition: {candidate.status.value} -> {target.value}")
        old = candidate.status
        candidate.status, candidate.updated_at = target, utc_now()
        await candidate.save()
        await record(candidate.company_id, "CandidateMoved", actor_id, candidate_id=str(candidate.id), payload={"from": old.value, "to": target.value})
        return candidate

    @staticmethod
    async def convert(candidate: Candidate, payload: ConversionRequest, actor_id: str) -> User:
        if candidate.status != CandidateStatus.JOINED:
            raise HTTPException(status_code=409, detail="Candidate must be in joined status")
        offer = await Offer.find_one({"company_id": candidate.company_id, "candidate_id": str(candidate.id), "status": "accepted", "deleted_at": None})
        if not offer:
            raise HTTPException(status_code=409, detail="Accepted offer is required")
        if await User.find_one({"email": candidate.email}):
            raise HTTPException(status_code=409, detail="A user with this email already exists")
        department = await Department.get(payload.department_id)
        if not department or department.company_id != candidate.company_id or department.deleted_at is not None:
            raise HTTPException(status_code=400, detail="Department not found")
        names = candidate.full_name.strip().split(maxsplit=1)
        employee = User(email=candidate.email, password_hash=get_password_hash(secrets.token_urlsafe(24)), first_name=names[0], last_name=names[1] if len(names) > 1 else "", role=UserRole.EMPLOYEE, status=UserStatus.PENDING, modules=["task"], company_id=candidate.company_id, department_id=payload.department_id, reports_to=payload.reports_to, created_by=actor_id)
        await employee.insert()
        candidate.status, candidate.employee_id, candidate.updated_at = CandidateStatus.EMPLOYEE, str(employee.id), utc_now()
        await candidate.save()
        await record(candidate.company_id, "CandidateConverted", actor_id, candidate_id=str(candidate.id), payload={"employee_id": str(employee.id), "designation": payload.designation})
        return employee


class JobService:
    """Service for Job aggregate operations."""

    @staticmethod
    async def create_job(company_id: str, actor_id: str, data: JobCreate) -> RecruitmentJob:
        """Create a new job."""
        # Validate department exists
        department = await Department.get(data.department_id)
        if not department or department.company_id != company_id or department.deleted_at is not None:
            raise HTTPException(status_code=400, detail="Department not found")

        # Generate unique slug
        base_slug = slugify(data.title)
        slug = base_slug
        sequence = 2
        while await RecruitmentJob.find_one({"company_id": company_id, "slug": slug}):
            slug = f"{base_slug}-{sequence}"
            sequence += 1

        # Create job with analytics counters
        job = RecruitmentJob(
            company_id=company_id,
            slug=slug,
            created_by=actor_id,
            lifecycle_status=JobLifecycleStatus.DRAFT,
            analytics_counters=JobAnalyticsCounters(),
            **data.model_dump()
        )
        await job.insert()

        # Publish domain event
        await record(company_id, "RecruitmentJobCreated", actor_id, job_id=str(job.id), payload=data.model_dump())
        return job

    @staticmethod
    async def update_job(job: RecruitmentJob, data: JobUpdate, actor_id: str) -> RecruitmentJob:
        """Update an existing job."""
        changes = data.model_dump(exclude_unset=True)
        for key, value in changes.items():
            setattr(job, key, value)

        job.updated_at = utc_now()
        await job.save()

        # Publish domain event
        await record(job.company_id, "RecruitmentJobUpdated", actor_id, job_id=str(job.id), payload=changes)
        return job

    @staticmethod
    async def duplicate_job(job: RecruitmentJob, actor_id: str) -> RecruitmentJob:
        """Duplicate an existing job."""
        # Generate new slug
        base_slug = slugify(f"{job.title} (Copy)")
        slug = base_slug
        sequence = 2
        while await RecruitmentJob.find_one({"company_id": job.company_id, "slug": slug}):
            slug = f"{base_slug}-{sequence}"
            sequence += 1

        # Create duplicate job
        duplicate = RecruitmentJob(
            company_id=job.company_id,
            title=f"{job.title} (Copy)",
            slug=slug,
            department_id=job.department_id,
            hiring_manager_id=job.hiring_manager_id,
            recruiter_ids=job.recruiter_ids,
            employment_type=job.employment_type,
            work_mode=job.work_mode,
            location=job.location,
            experience_min=job.experience_min,
            experience_max=job.experience_max,
            salary_min=job.salary_min,
            salary_max=job.salary_max,
            openings=job.openings,
            required_skills=job.required_skills,
            description=job.description,
            responsibilities=job.responsibilities,
            qualifications=job.qualifications,
            benefits=job.benefits,
            application_deadline=job.application_deadline,
            auto_close=job.auto_close,
            visibility=job.visibility,
            application_method=job.application_method,
            lifecycle_status=JobLifecycleStatus.DRAFT,
            created_by=actor_id,
            analytics_counters=JobAnalyticsCounters(),
            publish_options=job.publish_options,
        )
        await duplicate.insert()

        # Publish domain event
        await record(job.company_id, "RecruitmentJobDuplicated", actor_id, job_id=str(duplicate.id), payload={"original_job_id": str(job.id)})
        return duplicate

    @staticmethod
    async def transition_job(job: RecruitmentJob, target_status: JobLifecycleStatus, actor_id: str) -> RecruitmentJob:
        """Validate and transition job to new lifecycle status."""
        current_status = job.lifecycle_status

        # Validate transition
        allowed_transitions = JOB_LIFECYCLE_TRANSITIONS.get(current_status, set())
        if target_status not in allowed_transitions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid lifecycle transition: {current_status.value} -> {target_status.value}"
            )

        # Update status
        job.previous_status = current_status
        job.lifecycle_status = target_status
        job.updated_at = utc_now()
        await job.save()

        # Map to legacy status for backward compatibility
        if target_status == JobLifecycleStatus.PUBLISHED:
            job.status = JobStatus.PUBLISHED
        elif target_status == JobLifecycleStatus.ARCHIVED:
            job.status = JobStatus.ARCHIVED
        else:
            job.status = JobStatus.DRAFT
        await job.save()

        # Publish domain event
        event_name = {
            JobLifecycleStatus.PUBLISHED: "RecruitmentJobPublished",
            JobLifecycleStatus.PAUSED: "RecruitmentJobPaused",
            JobLifecycleStatus.CLOSED: "RecruitmentJobClosed",
            JobLifecycleStatus.ARCHIVED: "RecruitmentJobArchived",
            JobLifecycleStatus.DRAFT: "RecruitmentJobRestored",
        }.get(target_status, "RecruitmentJobUpdated")

        await record(job.company_id, event_name, actor_id, job_id=str(job.id), payload={"from": current_status.value, "to": target_status.value})
        return job

    @staticmethod
    async def publish_job(job: RecruitmentJob, actor_id: str) -> RecruitmentJob:
        """Publish a job."""
        return await JobService.transition_job(job, JobLifecycleStatus.PUBLISHED, actor_id)

    @staticmethod
    async def pause_job(job: RecruitmentJob, actor_id: str) -> RecruitmentJob:
        """Pause a published job."""
        return await JobService.transition_job(job, JobLifecycleStatus.PAUSED, actor_id)

    @staticmethod
    async def close_job(job: RecruitmentJob, actor_id: str) -> RecruitmentJob:
        """Close a job."""
        return await JobService.transition_job(job, JobLifecycleStatus.CLOSED, actor_id)

    @staticmethod
    async def archive_job(job: RecruitmentJob, actor_id: str) -> RecruitmentJob:
        """Archive a job."""
        if job.lifecycle_status == JobLifecycleStatus.ARCHIVED:
            if job.status != JobStatus.ARCHIVED:
                job.status = JobStatus.ARCHIVED
                job.updated_at = utc_now()
                await job.save()
            return job
        return await JobService.transition_job(job, JobLifecycleStatus.ARCHIVED, actor_id)

    @staticmethod
    async def restore_job(job: RecruitmentJob, actor_id: str) -> RecruitmentJob:
        """Restore an archived job to draft."""
        return await JobService.transition_job(job, JobLifecycleStatus.DRAFT, actor_id)

    @staticmethod
    async def get_job(job_id: str, company_id: str) -> RecruitmentJob:
        """Get a job by ID with company scope validation."""
        job = await JobRepository.get_by_id(job_id, company_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @staticmethod
    async def list_jobs(
        company_id: str,
        filters: Optional[JobFilter] = None,
        skip: int = 0,
        limit: int = 50,
        sort_field: str = "created_at",
        sort_order: str = "desc",
    ) -> tuple[list[RecruitmentJob], int]:
        """List jobs with filtering, sorting, and pagination."""
        filter_dict = {}

        if filters:
            if filters.department_id:
                filter_dict["department_id"] = filters.department_id
            if filters.lifecycle_status:
                filter_dict["lifecycle_status"] = filters.lifecycle_status
            if filters.hiring_manager_id:
                filter_dict["hiring_manager_id"] = filters.hiring_manager_id
            if filters.recruiter_id:
                filter_dict["recruiter_ids"] = filters.recruiter_id
            if filters.work_mode:
                filter_dict["work_mode"] = filters.work_mode
            if filters.employment_type:
                filter_dict["employment_type"] = filters.employment_type
            if filters.location:
                filter_dict["location"] = {"$regex": filters.location, "$options": "i"}
            if filters.visibility:
                filter_dict["visibility"] = filters.visibility
            if filters.date_from or filters.date_to:
                filter_dict["created_at"] = {}
                if filters.date_from:
                    filter_dict["created_at"]["$gte"] = filters.date_from
                if filters.date_to:
                    filter_dict["created_at"]["$lte"] = filters.date_to
            if filters.search:
                filter_dict["$or"] = [
                    {"title": {"$regex": filters.search, "$options": "i"}},
                    {"slug": {"$regex": filters.search, "$options": "i"}},
                    {"location": {"$regex": filters.search, "$options": "i"}},
                ]

        return await JobRepository.list_jobs(company_id, filter_dict, skip, limit, sort_field, sort_order)

    @staticmethod
    async def validate_lifecycle_transition(current: JobLifecycleStatus, target: JobLifecycleStatus) -> bool:
        """Validate if a lifecycle transition is allowed."""
        allowed = JOB_LIFECYCLE_TRANSITIONS.get(current, set())
        return target in allowed


# =============================================================================
# Career Portal Services (Phase 3)
# =============================================================================


class TrackingCodeService:
    """Service for generating and managing application tracking codes."""

    @staticmethod
    async def generate_tracking_code(company_id: str) -> str:
        """Generate immutable tracking code like APP-2026-000001."""
        year = utc_now().year
        prefix = f"APP-{year}-"
        count = await Application.find({"company_id": company_id, "tracking_code": {"$regex": f"^{prefix}"}}).count()
        for offset in range(1, 100):
            code = f"{prefix}{count + offset:06d}"
            if not await Application.find_one({"tracking_code": code}):
                return code
        raise HTTPException(status_code=500, detail="Unable to generate tracking code")

    @staticmethod
    async def get_by_tracking_code(tracking_code: str, company_id: str) -> Optional[Application]:
        """Get application by tracking code."""
        return await Application.find_one({
            "tracking_code": tracking_code,
            "company_id": company_id,
            "deleted_at": None
        })


class DuplicateDetectionService:
    """Service for detecting duplicate candidates/applications."""

    @staticmethod
    async def check_duplicate(company_id: str, job_id: str, email: str, phone: Optional[str] = None, resume_checksum: Optional[str] = None) -> DuplicateCheckResult:
        """Check if candidate/application already exists."""
        normalized_email = email.lower().strip()

        # Check by email
        existing_candidate = await Candidate.find_one({
            "company_id": company_id,
            "email": normalized_email,
            "deleted_at": None
        })

        if existing_candidate:
            # Check if already applied to this job
            existing_application = await Application.find_one({
                "company_id": company_id,
                "candidate_id": str(existing_candidate.id),
                "job_id": job_id,
                "deleted_at": None
            })
            if existing_application:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    candidate_id=str(existing_candidate.id),
                    existing_application_id=str(existing_application.id),
                    reason="Candidate already applied to this job"
                )

            return DuplicateCheckResult(
                is_duplicate=True,
                candidate_id=str(existing_candidate.id),
                reason="Candidate with this email already exists"
            )

        # Check by phone
        if phone:
            existing_by_phone = await Candidate.find_one({
                "company_id": company_id,
                "phone": phone,
                "deleted_at": None
            })
            if existing_by_phone:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    candidate_id=str(existing_by_phone.id),
                    reason="Candidate with this phone already exists"
                )

        # Check by resume checksum
        if resume_checksum:
            existing_resume = await Resume.find_one({
                "company_id": company_id,
                "checksum": resume_checksum,
                "deleted_at": None
            })
            if existing_resume:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    candidate_id=str(existing_resume.candidate_id),
                    reason="Resume already uploaded"
                )

        return DuplicateCheckResult(is_duplicate=False)


class ResumeStorageService:
    """Service for handling resume uploads."""

    # Allowed resume extensions
    ALLOWED_RESUME_EXTENSIONS = {".pdf", ".doc", ".docx"}
    ALLOWED_RESUME_MIME_TYPES = {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }

    # Max resume size (5MB)
    MAX_RESUME_SIZE = 5 * 1024 * 1024

    @staticmethod
    async def upload_resume(
        company_id: str,
        resume_content: bytes,
        filename: str,
        candidate_id: Optional[str] = None
    ) -> ResumeUploadResponse:
        """Upload and store resume."""
        # Validate file size
        if len(resume_content) > ResumeStorageService.MAX_RESUME_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Resume size exceeds maximum allowed size of {ResumeStorageService.MAX_RESUME_SIZE / 1024 / 1024}MB"
            )

        # Validate extension
        file_ext = Path(filename).suffix.lower()
        if file_ext not in ResumeStorageService.ALLOWED_RESUME_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Resume type not allowed. Allowed types: {', '.join(ResumeStorageService.ALLOWED_RESUME_EXTENSIONS)}"
            )

        detected_mime = FileService.detect_mime_type(resume_content, filename)
        if detected_mime not in ResumeStorageService.ALLOWED_RESUME_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Resume MIME type '{detected_mime}' not allowed"
            )

        # Calculate checksum (SHA-256)
        checksum = hashlib.sha256(resume_content).hexdigest()

        # Check for duplicate
        existing_resume = await Resume.find_one({
            "company_id": company_id,
            "checksum": checksum,
            "deleted_at": None
        })
        if existing_resume:
            return ResumeUploadResponse(
                resume_id=str(existing_resume.id),
                storage_url=existing_resume.storage_url,
                filename=existing_resume.original_filename,
                size=existing_resume.size_bytes,
                checksum=existing_resume.checksum,
                mime_type=existing_resume.mime_type
            )

        upload_dir = FileService.resolve_upload_dir() / "resumes"
        upload = UploadFile(filename=Path(filename).name, file=BytesIO(resume_content))
        stored = await FileService.store_uploaded_file(upload, upload_dir=upload_dir, url_prefix="/uploads/resumes")

        # Create resume record
        resume = Resume(
            company_id=company_id,
            candidate_id=candidate_id or "",
            original_filename=filename,
            mime_type=detected_mime,
            storage_url=stored["file_url"],
            checksum=checksum,
            size_bytes=len(resume_content),
        )
        await resume.insert()

        return ResumeUploadResponse(
            resume_id=str(resume.id),
            storage_url=resume.storage_url,
            filename=filename,
            size=len(resume_content),
            checksum=checksum,
            mime_type=detected_mime
        )


class JobDiscoveryService:
    """Service for discovering and listing public jobs."""

    @staticmethod
    async def list_public_jobs(
        company_id: str,
        search: Optional[str] = None,
        department_id: Optional[str] = None,
        location: Optional[str] = None,
        employment_type: Optional[str] = None,
        work_mode: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> tuple[list[RecruitmentJob], int]:
        """List published jobs for career portal."""
        # Build query - only published, non-archived jobs
        query = {
            "company_id": company_id,
            "lifecycle_status": JobLifecycleStatus.PUBLISHED,
            "deleted_at": None,
        }

        # Add filters
        if department_id:
            query["department_id"] = department_id
        if location:
            query["location"] = {"$regex": location, "$options": "i"}
        if employment_type:
            query["employment_type"] = employment_type
        if work_mode:
            query["work_mode"] = work_mode
        if search:
            query["$or"] = [
                {"title": {"$regex": search, "$options": "i"}},
                {"location": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
            ]

        # Build sort
        sort_direction = -1 if sort_order == "desc" else 1
        sort_tuple = [(sort_by, sort_direction)]

        # Get total count
        total = await RecruitmentJob.find(query).count()

        # Get paginated results
        items = await RecruitmentJob.find(query).sort(sort_tuple).skip(skip).limit(min(limit, 100)).to_list()

        return items, total

    @staticmethod
    def public_job_payload(job: RecruitmentJob) -> dict:
        """Return public-safe job fields only."""
        show_salary = bool(job.publish_options.get("show_salary", True))
        return {
            "id": str(job.id),
            "title": job.title,
            "slug": job.slug,
            "department_id": job.department_id,
            "employment_type": job.employment_type,
            "work_mode": job.work_mode,
            "location": job.location,
            "experience_min": job.experience_min,
            "experience_max": job.experience_max,
            "salary_min": job.salary_min if show_salary else None,
            "salary_max": job.salary_max if show_salary else None,
            "openings": job.openings,
            "required_skills": job.required_skills,
            "description": job.description,
            "responsibilities": job.responsibilities,
            "qualifications": job.qualifications,
            "benefits": job.benefits,
            "application_deadline": job.application_deadline,
            "apply_available": (
                job.lifecycle_status == JobLifecycleStatus.PUBLISHED
                and job.deleted_at is None
                and (job.application_deadline is None or job.application_deadline >= utc_now())
            ),
            "created_at": job.created_at,
        }

    @staticmethod
    async def get_public_job_by_slug(slug: str, company_id: str) -> Optional[RecruitmentJob]:
        """Get a published job by slug."""
        return await RecruitmentJob.find_one({
            "slug": slug,
            "company_id": company_id,
            "lifecycle_status": JobLifecycleStatus.PUBLISHED,
            "deleted_at": None
        })

    @staticmethod
    async def validate_job_for_application(job: RecruitmentJob) -> dict:
        """Validate if a job is available for application."""
        errors = []

        # Check if job is published
        if job.lifecycle_status != JobLifecycleStatus.PUBLISHED:
            errors.append("Job is not currently accepting applications")

        # Check deadline
        if job.application_deadline and job.application_deadline < utc_now():
            errors.append("Application deadline has passed")

        # Check if archived
        if job.lifecycle_status == JobLifecycleStatus.ARCHIVED:
            errors.append("Job has been archived")

        return {
            "is_valid": len(errors) == 0,
            "errors": errors
        }


class CareerPortalService:
    """Service for Career Portal operations."""

    @staticmethod
    async def resolve_company_id(company_id: Optional[str] = None, domain: Optional[str] = None, host: Optional[str] = None) -> str:
        """Resolve public careers tenant from explicit id, domain, or host."""
        if company_id:
            company = await Company.get(company_id)
            if company:
                return company_id
            raise HTTPException(status_code=404, detail="Career portal not found")

        lookup = (domain or host or "").split(":")[0].lower().strip()
        if not lookup:
            raise HTTPException(status_code=400, detail="company_id or company domain is required")

        if lookup.endswith(".syntask.ai"):
            tenant_slug = lookup.removesuffix(".syntask.ai")
            company = await Company.find_one({"name": {"$regex": f"^{tenant_slug.replace('-', ' ')}$", "$options": "i"}})
            if company:
                return str(company.id)

        company = await Company.find_one({"website": {"$regex": lookup, "$options": "i"}})
        if company:
            return str(company.id)

        raise HTTPException(status_code=404, detail="Career portal not found")

    @staticmethod
    async def get_portal_settings(company_id: str) -> dict:
        """Get career portal settings for a company."""
        company = await Company.get(company_id)
        if not company:
            return {"is_active": False}

        return {
            "company_name": company.name,
            "logo_url": getattr(company, "logo_url", None),
            "banner_url": getattr(company, "banner_url", None),
            "primary_color": getattr(company, "primary_color", None),
            "careers_description": getattr(company, "careers_description", None) or company.industry,
            "office_locations": getattr(company, "office_locations", []) or [v for v in [company.city, company.state, company.country] if v],
            "social_links": getattr(company, "social_links", {}),
            "hiring_process": getattr(company, "hiring_process", None),
            "is_active": getattr(company, "careers_portal_active", True),
        }


class ApplicationService:
    """Service for handling job applications."""

    @staticmethod
    async def apply_to_job(
        company_id: str,
        job: RecruitmentJob,
        data: ApplicationApplyRequest,
    ) -> ApplicationApplyResponse:
        """Submit an application for a job."""
        # Validate job is available
        validation = await JobDiscoveryService.validate_job_for_application(job)
        if not validation["is_valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=validation["errors"]
            )

        # Normalize email
        normalized_email = data.email.lower().strip()

        # Calculate resume checksum
        resume_checksum = hashlib.sha256(data.resume_content).hexdigest()

        # Check for duplicates
        duplicate_check = await DuplicateDetectionService.check_duplicate(
            company_id, str(job.id), normalized_email, data.phone, resume_checksum
        )

        # Upload resume
        resume_result = await ResumeStorageService.upload_resume(
            company_id, data.resume_content, data.resume_filename
        )

        # Get or create candidate
        candidate_id = duplicate_check.candidate_id
        if not candidate_id:
            candidate = Candidate(
                company_id=company_id,
                job_id=str(job.id),
                source="portal",
                email=normalized_email,
                full_name=data.full_name,
                phone=data.phone,
                current_company=data.current_company,
                experience_years=data.experience_years,
                expected_salary=data.expected_salary,
                notice_period=data.notice_period,
                location=data.location,
                education=data.education,
                skills=data.skills,
                status=CandidateStatus.NEW,
                resume_id=resume_result.resume_id,
            )
            await candidate.insert()
            candidate_id = str(candidate.id)
        else:
            # Update existing candidate with resume if they don't have one
            candidate = await Candidate.get(candidate_id)
            if candidate and not candidate.resume_id:
                candidate.resume_id = resume_result.resume_id
                await candidate.save()

        # Generate tracking code
        tracking_code = await TrackingCodeService.generate_tracking_code(company_id)

        # Create application
        if await ApplicationRepository.find_existing(company_id, candidate_id, str(job.id)):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Candidate already applied to this job")

        application = Application(
            company_id=company_id,
            candidate_id=candidate_id,
            job_id=str(job.id),
            source="portal",
            status=CandidateStatus.NEW,
            current_resume_id=resume_result.resume_id,
            tracking_code=tracking_code,
        )
        await application.insert()
        await JobRepository.update_counters(str(job.id), "total_applications", 1)

        await record(
            company_id,
            "ResumeUploaded",
            None,
            candidate_id=candidate_id,
            job_id=str(job.id),
            payload={"source": "portal", "resume_id": resume_result.resume_id, "checksum": resume_result.checksum}
        )
        await record(
            company_id,
            "ApplicationCreated",
            None,
            candidate_id=candidate_id,
            job_id=str(job.id),
            payload={"source": "portal", "application_id": str(application.id), "tracking_code": tracking_code}
        )
        await record(
            company_id,
            "CandidateApplied",
            None,  # No actor for public applications
            candidate_id=candidate_id,
            job_id=str(job.id),
            payload={
                "source": "portal",
                "tracking_code": tracking_code,
                "resume_id": resume_result.resume_id,
            }
        )

        return ApplicationApplyResponse(
            application_id=str(application.id),
            tracking_code=tracking_code,
            job_id=str(job.id),
            job_title=job.title,
            candidate_email=normalized_email,
            applied_at=application.applied_at,
            message="Application submitted successfully"
        )

    @staticmethod
    async def get_application_status(tracking_code: str, company_id: str) -> ApplicationStatusResponse:
        """Get application status by tracking code."""
        application = await TrackingCodeService.get_by_tracking_code(tracking_code, company_id)

        if not application:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application not found"
            )

        job = await RecruitmentJob.get(application.job_id)

        return ApplicationStatusResponse(
            tracking_code=application.tracking_code,
            job_title=job.title if job else "Unknown",
            status=application.status.value,
            applied_at=application.applied_at,
            last_updated=application.updated_at,
        )


# =============================================================================
# Recruitment Inbox Services (Phase 4)
# =============================================================================


class ImportHistoryService:
    @staticmethod
    def serialize(import_job: RecruitmentImportJob) -> dict:
        return {
            "id": str(import_job.id),
            "company_id": import_job.company_id,
            "job_id": import_job.job_id,
            "external_message_id": import_job.external_message_id,
            "status": import_job.status,
            "attempts": import_job.attempts,
            "imported_count": import_job.imported_count,
            "rejected_count": import_job.rejected_count,
            "duplicate_count": import_job.duplicate_count,
            "sender_email": import_job.sender_email,
            "sender_name": import_job.sender_name,
            "subject": import_job.subject,
            "body_preview": import_job.body_preview,
            "attachments": import_job.attachments,
            "result": import_job.result,
            "error": import_job.error,
            "requested_by": import_job.requested_by,
            "processed_at": import_job.processed_at,
            "created_at": import_job.created_at,
            "updated_at": import_job.updated_at,
        }


class ResumeProcessingService:
    @staticmethod
    async def process_attachment(company_id: str, attachment: dict, candidate_id: Optional[str] = None) -> ResumeUploadResponse:
        try:
            content = base64.b64decode(attachment["content_base64"], validate=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Attachment content must be valid base64") from exc
        filename = Path(attachment.get("filename") or "resume.pdf").name
        return await ResumeStorageService.upload_resume(company_id, content, filename, candidate_id=candidate_id)


class EmailImportService:
    @staticmethod
    async def create_import_job(company_id: str, actor_id: str, payload: InboxImportRequest) -> RecruitmentImportJob:
        job = await JobService.get_job(payload.job_id, company_id)
        if payload.external_message_id:
            existing = await ImportJobRepository.find_by_external_message(company_id, payload.external_message_id)
            if existing:
                return existing
        import_job = RecruitmentImportJob(
            company_id=company_id,
            source="email",
            job_id=str(job.id),
            external_message_id=payload.external_message_id,
            sender_email=str(payload.sender_email).lower().strip(),
            sender_name=payload.sender_name,
            subject=payload.subject,
            body_preview=payload.body_preview,
            attachments=[item.model_dump() for item in payload.attachments],
            requested_by=actor_id,
            result={
                "candidate_name": payload.candidate_name,
                "candidate_phone": payload.candidate_phone,
            },
        )
        await ImportJobRepository.create(import_job)
        await record(company_id, "RecruitmentEmailReceived", actor_id, job_id=str(job.id), payload={"import_id": str(import_job.id), "sender_email": import_job.sender_email})
        return import_job


class RecruitmentInboxService:
    @staticmethod
    async def list_inbox(company_id: str, status_value: Optional[ImportStatus], skip: int, limit: int) -> tuple[list[RecruitmentImportJob], int]:
        return await ImportJobRepository.list_inbox(company_id, status_value, skip, limit)

    @staticmethod
    async def get_inbox_item(company_id: str, import_id: str) -> RecruitmentImportJob:
        import_job = await ImportJobRepository.get_by_id(import_id, company_id)
        if not import_job:
            raise HTTPException(status_code=404, detail="Inbox item not found")
        return import_job

    @staticmethod
    async def import_email(company_id: str, actor_id: str, payload: InboxImportRequest) -> RecruitmentImportJob:
        import_job = await EmailImportService.create_import_job(company_id, actor_id, payload)
        if payload.process_now:
            try:
                from app.worker.tasks.recruitment_inbox_tasks import process_recruitment_import_task
                process_recruitment_import_task.delay(str(import_job.id), company_id)
            except Exception:
                await RecruitmentInboxService.process_import(company_id, str(import_job.id))
        return import_job

    @staticmethod
    async def sync_now(company_id: str) -> dict[str, int]:
        from app.services.hr_mail_sync import sync_inbox_once

        result = await sync_inbox_once()
        return {
            "synced_count": int(result.get("synced_count", 0)),
            "created_count": int(result.get("created_count", 0)),
            "processed_count": int(result.get("processed_count", 0)),
        }

    @staticmethod
    async def process_import(company_id: str, import_id: str) -> RecruitmentImportJob:
        import_job = await RecruitmentInboxService.get_inbox_item(company_id, import_id)
        if import_job.status == ImportStatus.IGNORED:
            return import_job

        import_job.status = ImportStatus.PROCESSING
        import_job.attempts += 1
        import_job.error = None
        import_job.updated_at = utc_now()
        await import_job.save()

        try:
            if not import_job.job_id:
                raise HTTPException(status_code=400, detail="Import job must be linked to a recruitment job")
            job = await JobService.get_job(import_job.job_id, company_id)
            if not import_job.attachments:
                raise HTTPException(status_code=400, detail="Import job has no attachments")

            result_items = []
            imported_count = duplicate_count = rejected_count = 0
            candidate_name = import_job.result.get("candidate_name") or import_job.sender_name or import_job.sender_email or "Email Candidate"
            candidate_phone = import_job.result.get("candidate_phone")

            for attachment in import_job.attachments:
                try:
                    content = base64.b64decode(attachment["content_base64"], validate=True)
                    checksum = hashlib.sha256(content).hexdigest()
                    duplicate = await DuplicateDetectionService.check_duplicate(
                        company_id=company_id,
                        job_id=str(job.id),
                        email=import_job.sender_email or "",
                        phone=candidate_phone,
                        resume_checksum=checksum,
                    )
                    if duplicate.existing_application_id:
                        duplicate_count += 1
                        result_items.append({"filename": attachment.get("filename"), "status": "duplicate", "reason": duplicate.reason})
                        await record(company_id, "CandidateMatched", None, candidate_id=duplicate.candidate_id, job_id=str(job.id), payload={"import_id": import_id, "reason": duplicate.reason})
                        continue

                    resume_result = await ResumeStorageService.upload_resume(company_id, content, attachment.get("filename") or "resume.pdf")
                    candidate_id = duplicate.candidate_id
                    if candidate_id:
                        await record(company_id, "CandidateMatched", None, candidate_id=candidate_id, job_id=str(job.id), payload={"import_id": import_id})
                    else:
                        candidate = Candidate(
                            company_id=company_id,
                            job_id=str(job.id),
                            source="email",
                            full_name=candidate_name,
                            email=(import_job.sender_email or "").lower().strip(),
                            phone=candidate_phone,
                            status=CandidateStatus.NEW,
                            resume_id=resume_result.resume_id,
                        )
                        await candidate.insert()
                        candidate_id = str(candidate.id)
                        await record(company_id, "CandidateCreated", None, candidate_id=candidate_id, job_id=str(job.id), payload={"import_id": import_id, "source": "email"})

                    resume = await Resume.get(resume_result.resume_id)
                    if resume and not resume.candidate_id:
                        resume.candidate_id = candidate_id
                        await resume.save()

                    existing_application = await ApplicationRepository.find_existing(company_id, candidate_id, str(job.id))
                    if existing_application:
                        duplicate_count += 1
                        result_items.append({"filename": attachment.get("filename"), "status": "duplicate", "candidate_id": candidate_id, "application_id": str(existing_application.id)})
                        continue

                    tracking_code = await TrackingCodeService.generate_tracking_code(company_id)
                    application = Application(
                        company_id=company_id,
                        candidate_id=candidate_id,
                        job_id=str(job.id),
                        source="email",
                        current_resume_id=resume_result.resume_id,
                        tracking_code=tracking_code,
                    )
                    await application.insert()
                    await JobRepository.update_counters(str(job.id), "total_applications", 1)
                    imported_count += 1
                    result_items.append({"filename": attachment.get("filename"), "status": "imported", "candidate_id": candidate_id, "application_id": str(application.id), "tracking_code": tracking_code})
                    await record(company_id, "ResumeImported", None, candidate_id=candidate_id, job_id=str(job.id), payload={"import_id": import_id, "resume_id": resume_result.resume_id, "checksum": checksum})
                    await record(company_id, "ApplicationCreated", None, candidate_id=candidate_id, job_id=str(job.id), payload={"import_id": import_id, "application_id": str(application.id), "source": "email", "tracking_code": tracking_code})
                except Exception as item_exc:
                    rejected_count += 1
                    result_items.append({"filename": attachment.get("filename"), "status": "failed", "error": str(getattr(item_exc, "detail", item_exc))})

            import_job.imported_count = imported_count
            import_job.duplicate_count = duplicate_count
            import_job.rejected_count = rejected_count
            import_job.result = {**import_job.result, "items": result_items}
            import_job.status = ImportStatus.IMPORTED if imported_count else ImportStatus.DUPLICATE if duplicate_count else ImportStatus.FAILED
            import_job.processed_at = utc_now()
            import_job.updated_at = utc_now()
            await import_job.save()
            if import_job.status == ImportStatus.FAILED:
                await record(company_id, "ImportFailed", None, job_id=str(job.id), payload={"import_id": import_id, "items": result_items})
            return import_job
        except Exception as exc:
            import_job.status = ImportStatus.FAILED
            import_job.error = str(getattr(exc, "detail", exc))
            import_job.updated_at = utc_now()
            import_job.processed_at = utc_now()
            await import_job.save()
            await record(company_id, "ImportFailed", None, job_id=import_job.job_id, payload={"import_id": import_id, "error": import_job.error})
            return import_job

    @staticmethod
    async def retry_import(company_id: str, import_id: str) -> RecruitmentImportJob:
        import_job = await RecruitmentInboxService.get_inbox_item(company_id, import_id)
        if import_job.status not in {ImportStatus.FAILED, ImportStatus.DUPLICATE, ImportStatus.PENDING}:
            raise HTTPException(status_code=409, detail="Only pending, duplicate or failed imports can be retried")
        import_job.status = ImportStatus.PENDING
        import_job.updated_at = utc_now()
        await import_job.save()
        return await RecruitmentInboxService.process_import(company_id, import_id)

    @staticmethod
    async def ignore_import(company_id: str, import_id: str, actor_id: str) -> RecruitmentImportJob:
        import_job = await RecruitmentInboxService.get_inbox_item(company_id, import_id)
        import_job.status = ImportStatus.IGNORED
        import_job.ignored_at = utc_now()
        import_job.ignored_by = actor_id
        import_job.updated_at = utc_now()
        await import_job.save()
        return import_job

    @staticmethod
    async def merge_import(company_id: str, import_id: str, candidate_id: str) -> RecruitmentImportJob:
        import_job = await RecruitmentInboxService.get_inbox_item(company_id, import_id)
        candidate = await TenantRepository.get(Candidate, candidate_id, company_id)
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        import_job.merged_into_candidate_id = candidate_id
        import_job.status = ImportStatus.DUPLICATE
        import_job.result = {**import_job.result, "merged_into_candidate_id": candidate_id}
        import_job.updated_at = utc_now()
        await import_job.save()
        await record(company_id, "CandidateMatched", None, candidate_id=candidate_id, job_id=import_job.job_id, payload={"import_id": import_id, "merge": True})
        return import_job


# =============================================================================
# Candidate Workspace Services (Phase 5)
# =============================================================================


class CandidateSearchService:
    @staticmethod
    def build_filters(
        *,
        search: Optional[str] = None,
        status_value: Optional[CandidateStatus] = None,
        recruiter_id: Optional[str] = None,
        department_id: Optional[str] = None,
        application_status: Optional[CandidateStatus] = None,
        experience_min: Optional[float] = None,
        experience_max: Optional[float] = None,
        location: Optional[str] = None,
        source: Optional[str] = None,
        applied_from: Optional[datetime] = None,
        applied_to: Optional[datetime] = None,
    ) -> dict:
        filters: dict = {"deleted_at": None}
        if status_value:
            filters["status"] = status_value
        if recruiter_id:
            filters["assigned_recruiter_id"] = recruiter_id
        if experience_min is not None or experience_max is not None:
            filters["experience_years"] = {}
            if experience_min is not None:
                filters["experience_years"]["$gte"] = experience_min
            if experience_max is not None:
                filters["experience_years"]["$lte"] = experience_max
        if location:
            filters["location"] = {"$regex": location, "$options": "i"}
        if source:
            filters["source"] = source
        if search:
            filters["$or"] = [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"skills": {"$regex": search, "$options": "i"}},
            ]
        # Department/application date/status are application-scoped. Service resolves candidate ids.
        if department_id or application_status or applied_from or applied_to:
            filters["_application_filter"] = {
                "department_id": department_id,
                "application_status": application_status,
                "applied_from": applied_from,
                "applied_to": applied_to,
            }
        return filters

    @staticmethod
    async def search_candidates(company_id: str, filters: dict, skip: int, limit: int) -> tuple[list[Candidate], int]:
        application_filter = filters.pop("_application_filter", None)
        if application_filter:
            application_query = {"company_id": company_id, "deleted_at": None}
            if application_filter.get("application_status"):
                application_query["status"] = application_filter["application_status"]
            if application_filter.get("applied_from") or application_filter.get("applied_to"):
                application_query["applied_at"] = {}
                if application_filter.get("applied_from"):
                    application_query["applied_at"]["$gte"] = application_filter["applied_from"]
                if application_filter.get("applied_to"):
                    application_query["applied_at"]["$lte"] = application_filter["applied_to"]
            apps = await Application.find(application_query).to_list()
            if application_filter.get("department_id"):
                job_ids = {str(job.id) for job in await RecruitmentJob.find({"company_id": company_id, "department_id": application_filter["department_id"], "deleted_at": None}).to_list()}
                apps = [app for app in apps if app.job_id in job_ids]
            candidate_ids = [ObjectId(candidate_id) for candidate_id in {app.candidate_id for app in apps} if ObjectId.is_valid(candidate_id)]
            filters["_id"] = {"$in": candidate_ids} if candidate_ids else {"$in": []}
        return await CandidateRepository.search(company_id, filters, skip, limit)


class CandidateWorkspaceService:
    @staticmethod
    def candidate_payload(candidate: Candidate) -> dict:
        data = candidate.model_dump()
        data["id"] = str(candidate.id)
        return data

    @staticmethod
    async def get_candidate(company_id: str, candidate_id: str) -> Candidate:
        candidate = await TenantRepository.get(Candidate, candidate_id, company_id)
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        return candidate

    @staticmethod
    async def list_candidates(company_id: str, filters: dict, skip: int, limit: int) -> tuple[list[dict], int]:
        candidates, total = await CandidateSearchService.search_candidates(company_id, filters, skip, limit)
        return [CandidateWorkspaceService.candidate_payload(candidate) for candidate in candidates], total

    @staticmethod
    async def overview(company_id: str, candidate_id: str) -> dict:
        candidate = await CandidateWorkspaceService.get_candidate(company_id, candidate_id)
        applications = await ApplicationRepository.list_for_candidate(company_id, candidate_id)
        resumes = await ResumeRepository.list_for_candidate(company_id, candidate_id)
        timeline = await CandidateTimelineRepository.list_for_candidate(company_id, candidate_id)
        notes = await CandidateNoteRepository.list_for_candidate(company_id, candidate_id)
        attachments = await RecruitmentAttachmentRepository.list_for_candidate(company_id, candidate_id)
        return {
            "candidate": CandidateWorkspaceService.candidate_payload(candidate),
            "applications": [{**app.model_dump(), "id": str(app.id)} for app in applications],
            "resumes": [{**resume.model_dump(), "id": str(resume.id)} for resume in resumes],
            "timeline": [{**item.model_dump(), "id": str(item.id)} for item in timeline],
            "notes": [{**note.model_dump(), "id": str(note.id)} for note in notes],
            "attachments": [{**attachment.model_dump(), "id": str(attachment.id)} for attachment in attachments],
        }

    @staticmethod
    async def update_candidate(company_id: str, candidate_id: str, changes: dict, actor_id: str) -> Candidate:
        candidate = await CandidateWorkspaceService.get_candidate(company_id, candidate_id)
        for key, value in changes.items():
            setattr(candidate, key, value)
        candidate.updated_at = utc_now()
        await candidate.save()
        await record(company_id, "CandidateUpdated", actor_id, candidate_id=candidate_id, payload=changes)
        return candidate

    @staticmethod
    async def archive_candidate(company_id: str, candidate_id: str, actor_id: str) -> Candidate:
        candidate = await CandidateWorkspaceService.get_candidate(company_id, candidate_id)
        candidate.deleted_at = utc_now()
        candidate.status = CandidateStatus.ARCHIVED
        candidate.updated_at = utc_now()
        await candidate.save()
        await record(company_id, "CandidateArchived", actor_id, candidate_id=candidate_id)
        return candidate

    @staticmethod
    async def restore_candidate(company_id: str, candidate_id: str, actor_id: str) -> Candidate:
        candidate = await TenantRepository.get(Candidate, candidate_id, company_id, include_deleted=True)
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        candidate.deleted_at = None
        if candidate.status == CandidateStatus.ARCHIVED:
            candidate.status = CandidateStatus.NEW
        candidate.updated_at = utc_now()
        await candidate.save()
        await record(company_id, "CandidateRestored", actor_id, candidate_id=candidate_id)
        return candidate

    @staticmethod
    async def keyword_match(company_id: str, candidate_id: str, job_id: str) -> dict:
        candidate = await CandidateWorkspaceService.get_candidate(company_id, candidate_id)
        job = await JobService.get_job(job_id, company_id)
        candidate_skills = {skill.strip().lower() for skill in candidate.skills}
        required = [skill.strip() for skill in job.required_skills]
        matched = [skill for skill in required if skill.lower() in candidate_skills]
        missing = [skill for skill in required if skill.lower() not in candidate_skills]
        percentage = round((len(matched) / len(required)) * 100, 2) if required else 100.0
        return {"matchedSkills": matched, "missingSkills": missing, "matchPercentage": percentage}


class CandidateAssignmentService:
    @staticmethod
    async def assign(company_id: str, candidate_id: str, recruiter_id: str, actor_id: str) -> Candidate:
        recruiter = await User.get(recruiter_id)
        if not recruiter or recruiter.company_id != company_id:
            raise HTTPException(status_code=400, detail="Recruiter not found")
        candidate = await CandidateWorkspaceService.update_candidate(company_id, candidate_id, {"assigned_recruiter_id": recruiter_id}, actor_id)
        await record(company_id, "CandidateAssigned", actor_id, candidate_id=candidate_id, payload={"recruiter_id": recruiter_id})
        return candidate


class CandidateNotesService:
    @staticmethod
    async def add_note(company_id: str, candidate_id: str, body: str, actor_id: str, application_id: Optional[str] = None) -> CandidateNote:
        await CandidateWorkspaceService.get_candidate(company_id, candidate_id)
        if application_id and not await ApplicationRepository.find_existing(company_id, candidate_id, application_id):
            application = await TenantRepository.get(Application, application_id, company_id)
            if not application or application.candidate_id != candidate_id:
                raise HTTPException(status_code=400, detail="Application not found for candidate")
        note = CandidateNote(company_id=company_id, candidate_id=candidate_id, application_id=application_id, body=body, created_by=actor_id)
        await note.insert()
        await record(company_id, "CandidateNoteAdded", actor_id, candidate_id=candidate_id, payload={"note_id": str(note.id), "application_id": application_id})
        return note


class CandidateAttachmentService:
    @staticmethod
    async def add_attachment(company_id: str, candidate_id: str, file: UploadFile, actor_id: str, kind: str = "candidate_attachment") -> RecruitmentAttachment:
        await CandidateWorkspaceService.get_candidate(company_id, candidate_id)
        content = await file.read()
        checksum = hashlib.sha256(content).hexdigest()
        upload = UploadFile(filename=Path(file.filename or "attachment").name, file=BytesIO(content))
        stored = await FileService.store_uploaded_file(upload, upload_dir=FileService.resolve_upload_dir() / "recruitment", url_prefix="/uploads/recruitment")
        attachment = RecruitmentAttachment(
            company_id=company_id,
            candidate_id=candidate_id,
            kind=kind,
            original_filename=stored["filename"] or Path(file.filename or "attachment").name,
            mime_type=FileService.detect_mime_type(content, file.filename or ""),
            storage_key=stored["file_url"],
            checksum=checksum,
            size_bytes=stored["size"],
            uploaded_by=actor_id,
        )
        await attachment.insert()
        await record(company_id, "CandidateAttachmentAdded", actor_id, candidate_id=candidate_id, payload={"attachment_id": str(attachment.id)})
        return attachment


class ResumePoolService:
    @staticmethod
    async def list_pool(company_id: str, search: Optional[str], skip: int, limit: int) -> tuple[list[dict], int]:
        filters: dict = {}
        if search:
            candidates = await Candidate.find({
                "company_id": company_id,
                "deleted_at": None,
                "$or": [
                    {"full_name": {"$regex": search, "$options": "i"}},
                    {"email": {"$regex": search, "$options": "i"}},
                    {"skills": {"$regex": search, "$options": "i"}},
                ],
            }).to_list()
            filters["candidate_id"] = {"$in": [str(candidate.id) for candidate in candidates]}
        resumes, total = await ResumeRepository.list_pool(company_id, filters, skip, limit)
        candidate_ids = list({resume.candidate_id for resume in resumes if resume.candidate_id})
        candidate_object_ids = [ObjectId(candidate_id) for candidate_id in candidate_ids if ObjectId.is_valid(candidate_id)]
        candidates = await Candidate.find({"company_id": company_id, "_id": {"$in": candidate_object_ids}}).to_list() if candidate_object_ids else []
        candidate_map = {str(candidate.id): candidate for candidate in candidates}
        return [
            {
                **resume.model_dump(),
                "id": str(resume.id),
                "candidate_name": candidate_map[resume.candidate_id].full_name if resume.candidate_id in candidate_map else None,
                "candidate": CandidateWorkspaceService.candidate_payload(candidate_map[resume.candidate_id]) if resume.candidate_id in candidate_map else None,
            }
            for resume in resumes
        ], total


# =============================================================================
# Interview Engine Services (Phase 6)
# =============================================================================


class InterviewReminderService:
    @staticmethod
    async def schedule_reminders(interview: Interview) -> Optional[str]:
        return f"recruitment-interview-reminder:{interview.id}"


class InterviewSchedulingService:
    @staticmethod
    async def validate_panel(company_id: str, interviewer_ids: list[str]) -> None:
        if not interviewer_ids:
            raise HTTPException(status_code=400, detail="At least one interviewer is required")
        for interviewer_id in set(interviewer_ids):
            user = await User.get(interviewer_id)
            if not user or user.company_id != company_id:
                raise HTTPException(status_code=400, detail="One or more interviewers were not found")

    @staticmethod
    async def validate_candidate_application(company_id: str, candidate_id: str, application_id: Optional[str], job_id: Optional[str]) -> tuple[Candidate, Optional[Application]]:
        candidate = await CandidateWorkspaceService.get_candidate(company_id, candidate_id)
        application = None
        if application_id:
            application = await TenantRepository.get(Application, application_id, company_id)
            if not application or application.candidate_id != candidate_id:
                raise HTTPException(status_code=400, detail="Application not found for candidate")
            if job_id and application.job_id != job_id:
                raise HTTPException(status_code=400, detail="Application does not belong to job")
        elif job_id:
            application = await ApplicationRepository.find_existing(company_id, candidate_id, job_id)
        return candidate, application


class InterviewService:
    @staticmethod
    def payload(interview: Interview) -> dict:
        return {
            "id": str(interview.id),
            "company_id": interview.company_id,
            "candidate_id": interview.candidate_id,
            "application_id": interview.application_id,
            "job_id": interview.job_id,
            "round": interview.round,
            "interview_type": interview.interview_type,
            "interview_mode": interview.interview_mode,
            "interviewer_ids": interview.interviewer_ids,
            "panel_name": interview.panel_name,
            "meeting_link": interview.meeting_link,
            "location": interview.location,
            "schedule_at": interview.schedule_at,
            "duration_minutes": interview.duration_minutes,
            "status": interview.status,
            "feedback_status": interview.feedback_status,
            "decision": interview.decision,
            "notes": interview.notes,
            "created_at": interview.created_at,
            "updated_at": interview.updated_at,
        }

    @staticmethod
    async def list_interviews(company_id: str, filters: dict, skip: int, limit: int) -> tuple[list[dict], int]:
        interviews, total = await InterviewRepository.list_interviews(company_id, filters, skip, limit)
        return [InterviewService.payload(item) for item in interviews], total

    @staticmethod
    async def get_interview(company_id: str, interview_id: str) -> Interview:
        interview = await InterviewRepository.get_by_id(interview_id, company_id)
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found")
        return interview

    @staticmethod
    async def schedule(company_id: str, actor_id: str, data: InterviewCreate) -> Interview:
        await InterviewSchedulingService.validate_panel(company_id, data.interviewer_ids)
        _candidate, application = await InterviewSchedulingService.validate_candidate_application(company_id, data.candidate_id, data.application_id, data.job_id)
        interview = Interview(
            company_id=company_id,
            candidate_id=data.candidate_id,
            application_id=data.application_id or (str(application.id) if application else None),
            job_id=data.job_id or (application.job_id if application else None),
            round=data.round,
            interview_type=data.interview_type,
            interview_mode=data.interview_mode,
            interviewer_ids=data.interviewer_ids,
            panel_name=data.panel_name,
            mode=data.mode or data.interview_mode,
            meeting_link=data.meeting_link,
            location=data.location,
            schedule_at=data.schedule_at,
            scheduled_at=data.schedule_at,
            duration_minutes=data.duration_minutes,
            notes=data.notes,
        )
        await interview.insert()
        interview.reminder_job_id = await InterviewReminderService.schedule_reminders(interview)
        await interview.save()
        await record(company_id, "InterviewScheduled", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": str(interview.id), "application_id": interview.application_id, "round": interview.round})
        return interview

    @staticmethod
    async def update(company_id: str, interview_id: str, data: InterviewUpdate, actor_id: str) -> Interview:
        interview = await InterviewService.get_interview(company_id, interview_id)
        changes = data.model_dump(exclude_unset=True)
        for key, value in changes.items():
            setattr(interview, key, value)
            if key == "schedule_at":
                interview.scheduled_at = value
        interview.updated_at = utc_now()
        await interview.save()
        await record(company_id, "InterviewUpdated", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": interview_id, **changes})
        return interview

    @staticmethod
    async def reschedule(company_id: str, interview_id: str, data: InterviewRescheduleRequest, actor_id: str) -> Interview:
        interview = await InterviewService.get_interview(company_id, interview_id)
        interview.schedule_at = data.schedule_at
        interview.scheduled_at = data.schedule_at
        if data.duration_minutes is not None:
            interview.duration_minutes = data.duration_minutes
        if data.meeting_link is not None:
            interview.meeting_link = data.meeting_link
        if data.location is not None:
            interview.location = data.location
        interview.decision = InterviewDecision.RESCHEDULED
        interview.status = InterviewLifecycleStatus.SCHEDULED
        interview.updated_at = utc_now()
        await interview.save()
        await record(company_id, "InterviewRescheduled", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": interview_id, "reason": data.reason, "schedule_at": data.schedule_at.isoformat()})
        return interview

    @staticmethod
    async def cancel(company_id: str, interview_id: str, data: InterviewCancelRequest, actor_id: str) -> Interview:
        interview = await InterviewService.get_interview(company_id, interview_id)
        interview.decision = InterviewDecision.CANCELLED
        interview.cancelled_reason = data.reason
        interview.updated_at = utc_now()
        await interview.save()
        await record(company_id, "InterviewCancelled", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": interview_id, "reason": data.reason})
        return interview

    @staticmethod
    async def start(company_id: str, interview_id: str, actor_id: str) -> Interview:
        interview = await InterviewService.get_interview(company_id, interview_id)
        if interview.status not in {InterviewLifecycleStatus.SCHEDULED, InterviewLifecycleStatus.CONFIRMED}:
            raise HTTPException(status_code=409, detail="Interview cannot be started from current status")
        interview.status = InterviewLifecycleStatus.IN_PROGRESS
        interview.updated_at = utc_now()
        await interview.save()
        await record(company_id, "InterviewStarted", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": interview_id})
        return interview

    @staticmethod
    async def complete(company_id: str, interview_id: str, actor_id: str) -> Interview:
        interview = await InterviewService.get_interview(company_id, interview_id)
        interview.status = InterviewLifecycleStatus.COMPLETED
        interview.updated_at = utc_now()
        await interview.save()
        await record(company_id, "InterviewCompleted", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": interview_id})
        return interview


class InterviewFeedbackService:
    @staticmethod
    async def submit_feedback(company_id: str, interview_id: str, actor_id: str, data: InterviewFeedbackPayload) -> Interview:
        interview = await InterviewService.get_interview(company_id, interview_id)
        if actor_id not in interview.interviewer_ids:
            raise HTTPException(status_code=403, detail="Only assigned interviewers can submit feedback")
        existing = await InterviewFeedbackRepository.get_for_interviewer(company_id, interview_id, actor_id)
        if existing:
            existing.feedback = data.feedback
            existing.decision = data.decision
            existing.score = data.score
            existing.strengths = data.strengths
            existing.concerns = data.concerns
            existing.submitted_at = utc_now()
            existing.updated_at = utc_now()
            await existing.save()
        else:
            feedback = InterviewFeedback(
                company_id=company_id,
                interview_id=interview_id,
                application_id=interview.application_id or "",
                interviewer_id=actor_id,
                decision=data.decision,
                feedback=data.feedback,
                score=data.score,
                strengths=data.strengths,
                concerns=data.concerns,
                submitted_at=utc_now(),
            )
            await feedback.insert()
        interview.feedback = data.feedback
        interview.result = data.result or (data.decision.value if data.decision else None)
        interview.feedback_status = InterviewFeedbackStatus.SUBMITTED
        interview.updated_at = utc_now()
        await interview.save()
        await record(company_id, "InterviewFeedbackSubmitted", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": interview_id, "decision": data.decision.value if data.decision else None, "score": data.score})
        return interview


class InterviewDecisionService:
    @staticmethod
    async def record_decision(company_id: str, interview_id: str, actor_id: str, data: InterviewDecisionRequest) -> Interview:
        interview = await InterviewService.get_interview(company_id, interview_id)
        interview.decision = data.decision
        interview.notes = data.notes or interview.notes
        interview.status = InterviewLifecycleStatus.COMPLETED if data.decision in {InterviewDecision.PASSED, InterviewDecision.FAILED, InterviewDecision.HOLD} else interview.status
        interview.updated_at = utc_now()
        await interview.save()
        await record(company_id, "InterviewDecisionRecorded", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": interview_id, "decision": data.decision.value, "notes": data.notes})
        return interview


# =============================================================================
# Recruitment Reports Services (Phase 7)
# =============================================================================


class HiringAnalyticsService:
    @staticmethod
    def build_filters(
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        department_id: Optional[str] = None,
        recruiter_id: Optional[str] = None,
        job_id: Optional[str] = None,
        source: Optional[str] = None,
    ) -> dict:
        return {
            "date_from": date_from,
            "date_to": date_to,
            "department_id": department_id,
            "recruiter_id": recruiter_id,
            "job_id": job_id,
            "source": source,
        }

    @staticmethod
    async def time_metrics(company_id: str, filters: dict) -> dict:
        return await RecruitmentReportRepository.time_metrics(company_id, filters)


class RecruitmentDashboardService:
    @staticmethod
    async def dashboard(company_id: str, filters: dict) -> dict:
        metrics = await RecruitmentReportRepository.dashboard(company_id, filters)
        funnel = await RecruitmentReportRepository.hiring_funnel(company_id, filters)
        trends = await RecruitmentReportRepository.monthly_trends(company_id, filters)
        return {"metrics": metrics, "funnel": funnel, "monthly_trends": trends}


class RecruitmentReportService:
    @staticmethod
    async def funnel(company_id: str, filters: dict) -> dict:
        return {"items": await RecruitmentReportRepository.hiring_funnel(company_id, filters)}

    @staticmethod
    async def jobs(company_id: str, filters: dict) -> dict:
        return {"items": await RecruitmentReportRepository.applications_by_job(company_id, filters)}

    @staticmethod
    async def departments(company_id: str, filters: dict) -> dict:
        return {"items": await RecruitmentReportRepository.applications_by_department(company_id, filters)}

    @staticmethod
    async def recruiters(company_id: str, filters: dict) -> dict:
        return {"items": await RecruitmentReportRepository.recruiter_performance(company_id, filters)}

    @staticmethod
    async def interviews(company_id: str, filters: dict) -> dict:
        return await RecruitmentReportRepository.interview_conversion(company_id, filters)

    @staticmethod
    async def offers(company_id: str, filters: dict) -> dict:
        offer_data = await RecruitmentReportRepository.offer_analytics(company_id, filters)
        candidate_funnel = await RecruitmentReportRepository.hiring_funnel(company_id, filters)
        accepted = sum(item["count"] for item in offer_data["by_status"] if item["_id"] == "accepted")
        joined = sum(item["count"] for item in candidate_funnel if item["_id"] in ("joined", "employee"))
        offer_data["joining_rate"] = round((joined / accepted) * 100, 2) if accepted else 0
        return offer_data

    @staticmethod
    async def trends(company_id: str, filters: dict) -> dict:
        return {
            "monthly_hiring_trend": await RecruitmentReportRepository.monthly_trends(company_id, filters),
            "hiring_sources": await RecruitmentReportRepository.hiring_sources(company_id, filters),
            **await HiringAnalyticsService.time_metrics(company_id, filters),
        }

