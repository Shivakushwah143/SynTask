from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from app.models.user import User
from app.recruitment.models import (Candidate, CandidateStatus, CandidateTimeline,
                                    ImportStatus, Interview, JobLifecycleStatus,
                                    JobStatus, Offer, RecruitmentJob, Resume)
from app.recruitment.permissions import (require_job_archive, require_job_create,
                                         require_job_publish, require_job_update,
                                         require_job_view, require_recruitment_access,
                                         require_recruitment_manager,
                                         require_candidate_view,
                                         require_candidate_manage,
                                         require_candidate_assign,
                                         require_resume_pool_view,
                                         require_interview_view,
                                         require_interview_manage,
                                         require_interview_feedback,
                                         require_report_view)
from app.recruitment.repositories import JobRepository, TenantRepository
from app.recruitment.schemas import (ApplicationApplyResponse, ApplicationStatusResponse,
                                     CandidateApply, CandidateMove, CandidateReject,
                                     CandidateAssignRequest, CandidateNoteCreate,
                                     CandidateUpdate, CandidateWorkspaceResponse,
                                     CandidateListResponse, ConversionRequest,
                                     InboxImportRequest, InboxItemResponse,
                                     InboxListResponse, InboxMergeRequest,
                                     InterviewCreate, InterviewFeedback,
                                     InterviewUpdate, InterviewResponse,
                                     InterviewListResponse,
                                     InterviewRescheduleRequest,
                                     InterviewCancelRequest,
                                     InterviewDecisionRequest, JobCreate,
                                     JobFilter, JobListResponse, JobResponse,
                                     JobSort, JobUpdate, KeywordMatchResponse,
                                     OfferCreate,
                                     OfferUpdate, PublicJobListResponse,
                                     PublicJobResponse, ResumePoolResponse)
from app.recruitment.services import (ApplicationService, CareerPortalService,
                                      CandidateAssignmentService,
                                      CandidateAttachmentService,
                                      CandidateNotesService,
                                      CandidateSearchService,
                                      CandidateWorkspaceService,
                                      HiringAnalyticsService,
                                      ImportHistoryService, JobDiscoveryService,
                                      InterviewDecisionService,
                                      InterviewFeedbackService,
                                      InterviewService,
                                      JobService, RecruitmentInboxService,
                                      RecruitmentDashboardService,
                                      RecruitmentReportService,
                                      RecruitmentService, ResumePoolService,
                                      record)

router = APIRouter()
careers_router = APIRouter()


def company(user: User) -> str:
    if not user.company_id:
        raise HTTPException(status_code=400, detail="User must belong to a company")
    return user.company_id


# =============================================================================
# Job Engine API Endpoints (Phase 2)
# =============================================================================


@router.get("/dashboard")
async def dashboard(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    department_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source: Optional[str] = None,
    user: User = Depends(require_report_view),
):
    filters = HiringAnalyticsService.build_filters(date_from, date_to, department_id, recruiter_id, job_id, source)
    return await RecruitmentDashboardService.dashboard(company(user), filters)


# Job Dashboard Metrics (Phase 2)
@router.get("/jobs/dashboard")
async def job_dashboard(user: User = Depends(require_job_view)):
    """Get job-specific dashboard metrics."""
    cid = company(user)

    # Get counts by status
    status_counts = await JobRepository.count_by_status(cid)

    # Get recent jobs
    recent_jobs = await JobRepository.get_recent_jobs(cid, limit=5)

    # Build response
    return {
        "open_jobs": status_counts.get(JobLifecycleStatus.PUBLISHED.value, 0) + status_counts.get(JobLifecycleStatus.APPROVED.value, 0) + status_counts.get(JobLifecycleStatus.PAUSED.value, 0),
        "published_jobs": status_counts.get(JobLifecycleStatus.PUBLISHED.value, 0),
        "closed_jobs": status_counts.get(JobLifecycleStatus.CLOSED.value, 0),
        "draft_jobs": status_counts.get(JobLifecycleStatus.DRAFT.value, 0),
        "archived_jobs": status_counts.get(JobLifecycleStatus.ARCHIVED.value, 0),
        "recent_jobs": recent_jobs,
        "by_status": status_counts,
    }


# Create Job
@router.post("/jobs", status_code=201, response_model=JobResponse)
async def create_job(payload: JobCreate, user: User = Depends(require_job_create)):
    """Create a new job."""
    job = await JobService.create_job(company(user), str(user.id), payload)
    return job


# List Jobs with filtering, sorting, pagination
@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    department_id: Optional[str] = None,
    lifecycle_status: Optional[JobLifecycleStatus] = None,
    hiring_manager_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    work_mode: Optional[str] = None,
    employment_type: Optional[str] = None,
    location: Optional[str] = None,
    visibility: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    sort_by: str = Query("created_at", alias="sort_by"),
    sort_order: str = Query("desc", alias="sort_order"),
    page: int = 1,
    page_size: int = 50,
    user: User = Depends(require_job_view),
):
    """List jobs with server-side filtering, sorting, and pagination."""
    cid = company(user)

    # Build filter
    filters = JobFilter(
        department_id=department_id,
        lifecycle_status=lifecycle_status,
        hiring_manager_id=hiring_manager_id,
        recruiter_id=recruiter_id,
        work_mode=work_mode,
        employment_type=employment_type,
        location=location,
        visibility=visibility,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    skip = (page - 1) * page_size
    items, total = await JobService.list_jobs(
        cid, filters, skip, page_size, sort_by, sort_order
    )

    return JobListResponse(
        items=[JobResponse.model_validate(job) for job in items],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


# Get Job by ID
@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, user: User = Depends(require_job_view)):
    """Get a job by ID."""
    job = await JobService.get_job(job_id, company(user))
    return job


# Update Job
@router.patch("/jobs/{job_id}", response_model=JobResponse)
async def update_job(job_id: str, payload: JobUpdate, user: User = Depends(require_job_update)):
    """Update an existing job."""
    job = await JobService.get_job(job_id, company(user))
    job = await JobService.update_job(job, payload, str(user.id))
    return job


# Publish Job
@router.post("/jobs/{job_id}/publish", response_model=JobResponse)
async def publish_job(job_id: str, user: User = Depends(require_job_publish)):
    """Publish a job."""
    job = await JobService.get_job(job_id, company(user))
    job = await JobService.publish_job(job, str(user.id))
    return job


# Pause Job
@router.post("/jobs/{job_id}/pause", response_model=JobResponse)
async def pause_job(job_id: str, user: User = Depends(require_job_publish)):
    """Pause a published job."""
    job = await JobService.get_job(job_id, company(user))
    job = await JobService.pause_job(job, str(user.id))
    return job


# Close Job
@router.post("/jobs/{job_id}/close", response_model=JobResponse)
async def close_job(job_id: str, user: User = Depends(require_job_publish)):
    """Close a job."""
    job = await JobService.get_job(job_id, company(user))
    job = await JobService.close_job(job, str(user.id))
    return job


# Archive Job
@router.post("/jobs/{job_id}/archive", response_model=JobResponse)
async def archive_job(job_id: str, user: User = Depends(require_job_archive)):
    """Archive a job."""
    job = await JobService.get_job(job_id, company(user))
    job = await JobService.archive_job(job, str(user.id))
    return job


# Restore Job
@router.post("/jobs/{job_id}/restore", response_model=JobResponse)
async def restore_job(job_id: str, user: User = Depends(require_job_update)):
    """Restore an archived job."""
    job = await JobService.get_job(job_id, company(user))
    job = await JobService.restore_job(job, str(user.id))
    return job


# Duplicate Job
@router.post("/jobs/{job_id}/duplicate", status_code=201, response_model=JobResponse)
async def duplicate_job(job_id: str, user: User = Depends(require_job_create)):
    """Duplicate an existing job."""
    job = await JobService.get_job(job_id, company(user))
    job = await JobService.duplicate_job(job, str(user.id))
    return job


# =============================================================================
# Legacy endpoints for backward compatibility
# =============================================================================


@router.post("/jobs/legacy", status_code=201)
async def create_job_legacy(payload: JobCreate, user: User = Depends(require_recruitment_manager)):
    return await RecruitmentService.create_job(company(user), str(user.id), payload)


@router.get("/jobs/legacy")
async def list_jobs_legacy(status: Optional[JobStatus] = None, skip: int = 0, limit: int = 50, user: User = Depends(require_recruitment_access)):
    return await TenantRepository.list(RecruitmentJob, company(user), {"status": status.value} if status else {}, skip, limit)


@router.get("/jobs/{job_id}/legacy")
async def get_job_legacy(job_id: str, user: User = Depends(require_recruitment_access)):
    item = await TenantRepository.get(RecruitmentJob, job_id, company(user))
    if not item: raise HTTPException(status_code=404, detail="Job not found")
    return item


@router.patch("/jobs/{job_id}/legacy")
async def update_job_legacy(job_id: str, payload: JobUpdate, user: User = Depends(require_recruitment_manager)):
    item = await TenantRepository.get(RecruitmentJob, job_id, company(user))
    if not item: raise HTTPException(status_code=404, detail="Job not found")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items(): setattr(item, key, value)
    item.updated_at = datetime.utcnow(); await item.save()
    await record(company(user), "JobUpdated", str(user.id), job_id=job_id, payload=changes)
    return item


@router.post("/jobs/{job_id}/publish/legacy")
async def publish_job_legacy(job_id: str, user: User = Depends(require_recruitment_manager)):
    item = await TenantRepository.get(RecruitmentJob, job_id, company(user))
    if not item: raise HTTPException(status_code=404, detail="Job not found")
    item.status = JobStatus.PUBLISHED; item.updated_at = datetime.utcnow(); await item.save()
    await record(company(user), "JobPublished", str(user.id), job_id=job_id)
    return item


@router.post("/jobs/{job_id}/archive/legacy")
async def archive_job_legacy(job_id: str, user: User = Depends(require_recruitment_manager)):
    item = await TenantRepository.get(RecruitmentJob, job_id, company(user))
    if not item: raise HTTPException(status_code=404, detail="Job not found")
    item.status = JobStatus.ARCHIVED; item.updated_at = datetime.utcnow(); await item.save()
    await record(company(user), "JobArchived", str(user.id), job_id=job_id)
    return item


# =============================================================================
# Career Portal Routes (Phase 3)
# =============================================================================


@careers_router.get("")
async def get_career_portal(
    request: Request,
    company_id: Optional[str] = Query(None),
    company_domain: Optional[str] = Query(None),
):
    """Get career portal settings for a company."""
    resolved_company_id = await CareerPortalService.resolve_company_id(company_id, company_domain, request.headers.get("host"))
    settings = await CareerPortalService.get_portal_settings(resolved_company_id)
    await record(resolved_company_id, "CareerPortalViewed", None, payload={"host": request.headers.get("host")})
    return settings


@careers_router.get("/jobs", response_model=PublicJobListResponse)
async def list_public_jobs(
    request: Request,
    company_id: Optional[str] = Query(None),
    company_domain: Optional[str] = Query(None),
    search: Optional[str] = None,
    department_id: Optional[str] = None,
    location: Optional[str] = None,
    employment_type: Optional[str] = None,
    work_mode: Optional[str] = None,
    sort_by: str = Query("created_at", alias="sort_by"),
    sort_order: str = Query("desc", alias="sort_order"),
    page: int = 1,
    page_size: int = 50,
):
    """List published jobs for career portal."""
    resolved_company_id = await CareerPortalService.resolve_company_id(company_id, company_domain, request.headers.get("host"))

    skip = (page - 1) * page_size
    items, total = await JobDiscoveryService.list_public_jobs(
        resolved_company_id, search, department_id, location,
        employment_type, work_mode, skip, page_size, sort_by, sort_order
    )

    return PublicJobListResponse(
        items=[PublicJobResponse.model_validate(JobDiscoveryService.public_job_payload(job)) for job in items],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@careers_router.get("/jobs/{slug}", response_model=PublicJobResponse)
async def get_public_job(
    slug: str,
    request: Request,
    company_id: Optional[str] = Query(None),
    company_domain: Optional[str] = Query(None),
):
    """Get job detail by slug."""
    resolved_company_id = await CareerPortalService.resolve_company_id(company_id, company_domain, request.headers.get("host"))

    job = await JobDiscoveryService.get_public_job_by_slug(slug, resolved_company_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await record(resolved_company_id, "JobViewed", None, job_id=str(job.id), payload={"slug": slug})
    return JobDiscoveryService.public_job_payload(job)


@careers_router.post("/jobs/{job_id}/apply", status_code=201, response_model=ApplicationApplyResponse)
async def apply_to_job(
    job_id: str,
    request: Request,
    company_id: Optional[str] = Query(None),
    company_domain: Optional[str] = Query(None),
    full_name: str = Form(...),
    email: str = Form(...),
    phone: Optional[str] = Form(None),
    current_company: Optional[str] = Form(None),
    experience_years: float = Form(0),
    expected_salary: Optional[float] = Form(None),
    notice_period: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    education: Optional[str] = Form(None),
    skills: Optional[str] = Form(None),
    resume: UploadFile = File(...),
):
    """Apply to a job via career portal."""
    from app.recruitment.schemas import ApplicationApplyRequest
    resolved_company_id = await CareerPortalService.resolve_company_id(company_id, company_domain, request.headers.get("host"))

    # Get job
    job = await RecruitmentJob.get(job_id)
    if not job or job.company_id != resolved_company_id:
        raise HTTPException(status_code=404, detail="Job not found")

    # Validate job is available
    validation = await JobDiscoveryService.validate_job_for_application(job)
    if not validation["is_valid"]:
        raise HTTPException(status_code=400, detail=validation["errors"])

    # Read resume content
    resume_content = await resume.read()

    # Parse skills
    skills_list = []
    if skills:
        skills_list = [s.strip() for s in skills.split(",")]

    # Create application request
    data = ApplicationApplyRequest(
        full_name=full_name,
        email=email,
        phone=phone,
        current_company=current_company,
        experience_years=experience_years,
        expected_salary=expected_salary,
        notice_period=notice_period,
        location=location,
        education=education,
        skills=skills_list,
        resume_content=resume_content,
        resume_filename=resume.filename or "resume.pdf",
    )

    return await ApplicationService.apply_to_job(resolved_company_id, job, data)


@careers_router.get("/applications/{tracking_code}", response_model=ApplicationStatusResponse)
async def get_application_status(
    tracking_code: str,
    request: Request,
    company_id: Optional[str] = Query(None),
    company_domain: Optional[str] = Query(None),
):
    """Get application status by tracking code."""
    resolved_company_id = await CareerPortalService.resolve_company_id(company_id, company_domain, request.headers.get("host"))

    return await ApplicationService.get_application_status(tracking_code, resolved_company_id)


# Legacy endpoints for backward compatibility
@careers_router.get("/jobs/legacy")
async def public_jobs_legacy(skip: int = 0, limit: int = 50):
    return await RecruitmentJob.find({"status": "published", "deleted_at": None}).sort("-created_at").skip(skip).limit(min(limit, 100)).to_list()


@careers_router.get("/jobs/{identifier}/legacy")
async def public_job_legacy(identifier: str):
    item = await JobRepository.public_by_id_or_slug(identifier)
    if not item: raise HTTPException(status_code=404, detail="Job not found")
    return item


@careers_router.post("/jobs/{identifier}/apply/legacy", status_code=201)
async def apply_legacy(identifier: str, payload: CandidateApply):
    return await RecruitmentService.apply(await public_job_legacy(identifier), payload)


@router.post("/resume-inbox/import", status_code=201)
async def import_email_resume(job_id: str, payload: CandidateApply, user: User = Depends(require_recruitment_access)):
    job = await get_job(job_id, user)
    return await RecruitmentService.apply(job, payload, source="email")


# =============================================================================
# Recruitment Inbox Routes (Phase 4)
# =============================================================================


@router.get("/inbox", response_model=InboxListResponse)
async def list_inbox(
    status: Optional[ImportStatus] = None,
    page: int = 1,
    page_size: int = 50,
    user: User = Depends(require_recruitment_access),
):
    skip = (page - 1) * page_size
    items, total = await RecruitmentInboxService.list_inbox(company(user), status, skip, page_size)
    return InboxListResponse(
        items=[InboxItemResponse.model_validate(ImportHistoryService.serialize(item)) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/inbox/{import_id}", response_model=InboxItemResponse)
async def get_inbox_item(import_id: str, user: User = Depends(require_recruitment_access)):
    item = await RecruitmentInboxService.get_inbox_item(company(user), import_id)
    return InboxItemResponse.model_validate(ImportHistoryService.serialize(item))


@router.post("/inbox/import", status_code=201, response_model=InboxItemResponse)
async def import_inbox_email(payload: InboxImportRequest, user: User = Depends(require_recruitment_access)):
    item = await RecruitmentInboxService.import_email(company(user), str(user.id), payload)
    return InboxItemResponse.model_validate(ImportHistoryService.serialize(item))


@router.post("/inbox/{import_id}/retry", response_model=InboxItemResponse)
async def retry_inbox_import(import_id: str, user: User = Depends(require_recruitment_access)):
    item = await RecruitmentInboxService.retry_import(company(user), import_id)
    return InboxItemResponse.model_validate(ImportHistoryService.serialize(item))


@router.post("/inbox/{import_id}/ignore", response_model=InboxItemResponse)
async def ignore_inbox_import(import_id: str, user: User = Depends(require_recruitment_access)):
    item = await RecruitmentInboxService.ignore_import(company(user), import_id, str(user.id))
    return InboxItemResponse.model_validate(ImportHistoryService.serialize(item))


@router.post("/inbox/{import_id}/merge", response_model=InboxItemResponse)
async def merge_inbox_import(import_id: str, payload: InboxMergeRequest, user: User = Depends(require_recruitment_access)):
    item = await RecruitmentInboxService.merge_import(company(user), import_id, payload.candidate_id)
    return InboxItemResponse.model_validate(ImportHistoryService.serialize(item))


@router.get("/candidates", response_model=CandidateListResponse)
async def list_candidates(
    search: Optional[str] = None,
    status: Optional[CandidateStatus] = None,
    recruiter_id: Optional[str] = None,
    department_id: Optional[str] = None,
    application_status: Optional[CandidateStatus] = None,
    experience_min: Optional[float] = None,
    experience_max: Optional[float] = None,
    location: Optional[str] = None,
    source: Optional[str] = None,
    applied_from: Optional[datetime] = None,
    applied_to: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 50,
    user: User = Depends(require_candidate_view),
):
    filters = CandidateSearchService.build_filters(
        search=search,
        status_value=status,
        recruiter_id=recruiter_id,
        department_id=department_id,
        application_status=application_status,
        experience_min=experience_min,
        experience_max=experience_max,
        location=location,
        source=source,
        applied_from=applied_from,
        applied_to=applied_to,
    )
    skip = (page - 1) * page_size
    items, total = await CandidateWorkspaceService.list_candidates(company(user), filters, skip, page_size)
    return CandidateListResponse(items=items, total=total, page=page, page_size=page_size, has_next=(page * page_size) < total)


@router.get("/candidates/{candidate_id}", response_model=CandidateWorkspaceResponse)
async def get_candidate(candidate_id: str, user: User = Depends(require_candidate_view)):
    return await CandidateWorkspaceService.overview(company(user), candidate_id)


@router.patch("/candidates/{candidate_id}")
async def update_candidate(candidate_id: str, payload: CandidateUpdate, user: User = Depends(require_candidate_manage)):
    return await CandidateWorkspaceService.update_candidate(company(user), candidate_id, payload.model_dump(exclude_unset=True), str(user.id))


@router.post("/candidates/{candidate_id}/assign")
async def assign_candidate(candidate_id: str, payload: CandidateAssignRequest, user: User = Depends(require_candidate_assign)):
    return await CandidateAssignmentService.assign(company(user), candidate_id, payload.recruiter_id, str(user.id))


@router.post("/candidates/{candidate_id}/archive")
async def archive_candidate(candidate_id: str, user: User = Depends(require_candidate_manage)):
    return await CandidateWorkspaceService.archive_candidate(company(user), candidate_id, str(user.id))


@router.post("/candidates/{candidate_id}/restore")
async def restore_candidate(candidate_id: str, user: User = Depends(require_candidate_manage)):
    return await CandidateWorkspaceService.restore_candidate(company(user), candidate_id, str(user.id))


@router.post("/candidates/{candidate_id}/note")
async def add_candidate_note(candidate_id: str, payload: CandidateNoteCreate, user: User = Depends(require_candidate_manage)):
    return await CandidateNotesService.add_note(company(user), candidate_id, payload.body, str(user.id), payload.application_id)


@router.post("/candidates/{candidate_id}/attachment")
async def add_candidate_attachment(candidate_id: str, file: UploadFile = File(...), user: User = Depends(require_candidate_manage)):
    return await CandidateAttachmentService.add_attachment(company(user), candidate_id, file, str(user.id))


@router.get("/candidates/{candidate_id}/keyword-match/{job_id}", response_model=KeywordMatchResponse)
async def candidate_keyword_match(candidate_id: str, job_id: str, user: User = Depends(require_candidate_view)):
    return await CandidateWorkspaceService.keyword_match(company(user), candidate_id, job_id)


@router.post("/candidates/{candidate_id}/move")
async def move_candidate(candidate_id: str, payload: CandidateMove, user: User = Depends(require_recruitment_access)):
    candidate = await CandidateWorkspaceService.get_candidate(company(user), candidate_id)
    return await RecruitmentService.move(candidate, payload.status, str(user.id))


@router.post("/candidates/{candidate_id}/reject")
async def reject_candidate(candidate_id: str, payload: CandidateReject, user: User = Depends(require_recruitment_access)):
    candidate = await CandidateWorkspaceService.get_candidate(company(user), candidate_id)
    item = await RecruitmentService.move(candidate, CandidateStatus.REJECTED, str(user.id)); item.rejection_reason = payload.reason; await item.save(); return item


@router.post("/candidates/{candidate_id}/convert")
async def convert_candidate(candidate_id: str, payload: ConversionRequest, user: User = Depends(require_recruitment_manager)):
    candidate = await CandidateWorkspaceService.get_candidate(company(user), candidate_id)
    return await RecruitmentService.convert(candidate, payload, str(user.id))


@router.get("/candidates/{candidate_id}/timeline")
async def timeline(candidate_id: str, user: User = Depends(require_recruitment_access)):
    await CandidateWorkspaceService.get_candidate(company(user), candidate_id)
    return await CandidateTimeline.find({"company_id": company(user), "candidate_id": candidate_id}).sort("-created_at").to_list()


@router.get("/resumes")
async def resume_pool(skip: int = 0, limit: int = 50, user: User = Depends(require_recruitment_access)):
    return await Resume.find({"company_id": company(user)}).sort("-uploaded_at").skip(skip).limit(min(limit, 100)).to_list()


@router.get("/resume-pool", response_model=ResumePoolResponse)
async def recruitment_resume_pool(search: Optional[str] = None, page: int = 1, page_size: int = 50, user: User = Depends(require_resume_pool_view)):
    skip = (page - 1) * page_size
    items, total = await ResumePoolService.list_pool(company(user), search, skip, page_size)
    return ResumePoolResponse(items=items, total=total, page=page, page_size=page_size, has_next=(page * page_size) < total)


@router.get("/interviews", response_model=InterviewListResponse)
async def list_interviews(
    candidate_id: Optional[str] = None,
    application_id: Optional[str] = None,
    job_id: Optional[str] = None,
    interviewer_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 50,
    user: User = Depends(require_interview_view),
):
    filters = {}
    if candidate_id:
        filters["candidate_id"] = candidate_id
    if application_id:
        filters["application_id"] = application_id
    if job_id:
        filters["job_id"] = job_id
    if interviewer_id:
        filters["interviewer_ids"] = interviewer_id
    if status:
        filters["status"] = status
    if date_from or date_to:
        filters["schedule_at"] = {}
        if date_from:
            filters["schedule_at"]["$gte"] = date_from
        if date_to:
            filters["schedule_at"]["$lte"] = date_to
    skip = (page - 1) * page_size
    items, total = await InterviewService.list_interviews(company(user), filters, skip, page_size)
    return InterviewListResponse(items=[InterviewResponse.model_validate(item) for item in items], total=total, page=page, page_size=page_size, has_next=(page * page_size) < total)


@router.post("/interviews", status_code=201, response_model=InterviewResponse)
async def create_interview(payload: InterviewCreate, user: User = Depends(require_interview_manage)):
    interview = await InterviewService.schedule(company(user), str(user.id), payload)
    return InterviewResponse.model_validate(InterviewService.payload(interview))


@router.get("/interviews/{interview_id}", response_model=InterviewResponse)
async def get_interview(interview_id: str, user: User = Depends(require_interview_view)):
    interview = await InterviewService.get_interview(company(user), interview_id)
    return InterviewResponse.model_validate(InterviewService.payload(interview))


@router.patch("/interviews/{interview_id}", response_model=InterviewResponse)
async def update_interview(interview_id: str, payload: InterviewUpdate, user: User = Depends(require_interview_manage)):
    interview = await InterviewService.update(company(user), interview_id, payload, str(user.id))
    return InterviewResponse.model_validate(InterviewService.payload(interview))


@router.post("/interviews/{interview_id}/reschedule", response_model=InterviewResponse)
async def reschedule_interview(interview_id: str, payload: InterviewRescheduleRequest, user: User = Depends(require_interview_manage)):
    interview = await InterviewService.reschedule(company(user), interview_id, payload, str(user.id))
    return InterviewResponse.model_validate(InterviewService.payload(interview))


@router.post("/interviews/{interview_id}/cancel", response_model=InterviewResponse)
async def cancel_interview(interview_id: str, payload: InterviewCancelRequest, user: User = Depends(require_interview_manage)):
    interview = await InterviewService.cancel(company(user), interview_id, payload, str(user.id))
    return InterviewResponse.model_validate(InterviewService.payload(interview))


@router.post("/interviews/{interview_id}/start", response_model=InterviewResponse)
async def start_interview(interview_id: str, user: User = Depends(require_interview_manage)):
    interview = await InterviewService.start(company(user), interview_id, str(user.id))
    return InterviewResponse.model_validate(InterviewService.payload(interview))


@router.post("/interviews/{interview_id}/complete", response_model=InterviewResponse)
async def complete_interview(interview_id: str, user: User = Depends(require_interview_manage)):
    interview = await InterviewService.complete(company(user), interview_id, str(user.id))
    return InterviewResponse.model_validate(InterviewService.payload(interview))


@router.post("/interviews/{interview_id}/feedback", response_model=InterviewResponse)
async def interview_feedback(interview_id: str, payload: InterviewFeedback, user: User = Depends(require_interview_feedback)):
    interview = await InterviewFeedbackService.submit_feedback(company(user), interview_id, str(user.id), payload)
    return InterviewResponse.model_validate(InterviewService.payload(interview))


@router.post("/interviews/{interview_id}/decision", response_model=InterviewResponse)
async def interview_decision(interview_id: str, payload: InterviewDecisionRequest, user: User = Depends(require_interview_manage)):
    interview = await InterviewDecisionService.record_decision(company(user), interview_id, str(user.id), payload)
    return InterviewResponse.model_validate(InterviewService.payload(interview))


@router.post("/offers", status_code=201)
async def create_offer(payload: OfferCreate, user: User = Depends(require_recruitment_manager)):
    candidate = await get_candidate(payload.candidate_id, user)
    offer = Offer(company_id=company(user), candidate_id=payload.candidate_id, offered_ctc=payload.offered_ctc, joining_date=payload.joining_date, status="sent" if payload.send else "draft", sent_at=datetime.utcnow() if payload.send else None); await offer.insert()
    if payload.send:
        candidate = await RecruitmentService.move(candidate, CandidateStatus.OFFER_SENT, str(user.id))
        await record(company(user), "OfferSent", str(user.id), candidate_id=payload.candidate_id, payload={"offer_id": str(offer.id)})
    return offer


@router.patch("/offers/{offer_id}")
async def update_offer(offer_id: str, payload: OfferUpdate, user: User = Depends(require_recruitment_manager)):
    item = await TenantRepository.get(Offer, offer_id, company(user))
    if not item: raise HTTPException(status_code=404, detail="Offer not found")
    for key, value in payload.model_dump(exclude_unset=True).items(): setattr(item, key, value)
    item.updated_at = datetime.utcnow(); await item.save(); return item


async def decide_offer(offer_id: str, decision: str, user: User):
    item = await TenantRepository.get(Offer, offer_id, company(user))
    if not item: raise HTTPException(status_code=404, detail="Offer not found")
    if item.status != "sent": raise HTTPException(status_code=409, detail="Only sent offers can be decided")
    item.status, item.updated_at = decision, datetime.utcnow(); await item.save()
    target = CandidateStatus.OFFER_ACCEPTED if decision == "accepted" else CandidateStatus.REJECTED
    await RecruitmentService.move(await get_candidate(item.candidate_id, user), target, str(user.id))
    await record(company(user), "OfferAccepted" if decision == "accepted" else "OfferRejected", str(user.id), candidate_id=item.candidate_id, payload={"offer_id": offer_id}); return item


@router.post("/offers/{offer_id}/accept")
async def accept_offer(offer_id: str, user: User = Depends(require_recruitment_manager)): return await decide_offer(offer_id, "accepted", user)


@router.post("/offers/{offer_id}/reject")
async def reject_offer(offer_id: str, user: User = Depends(require_recruitment_manager)): return await decide_offer(offer_id, "rejected", user)


def build_report_filters(
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    department_id: Optional[str],
    recruiter_id: Optional[str],
    job_id: Optional[str],
    source: Optional[str],
) -> dict:
    return HiringAnalyticsService.build_filters(date_from, date_to, department_id, recruiter_id, job_id, source)


@router.get("/reports/funnel")
async def report_funnel(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    department_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source: Optional[str] = None,
    user: User = Depends(require_report_view),
):
    return await RecruitmentReportService.funnel(company(user), build_report_filters(date_from, date_to, department_id, recruiter_id, job_id, source))


@router.get("/reports/jobs")
async def report_jobs(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    department_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source: Optional[str] = None,
    user: User = Depends(require_report_view),
):
    return await RecruitmentReportService.jobs(company(user), build_report_filters(date_from, date_to, department_id, recruiter_id, job_id, source))


@router.get("/reports/departments")
async def report_departments(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    department_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source: Optional[str] = None,
    user: User = Depends(require_report_view),
):
    return await RecruitmentReportService.departments(company(user), build_report_filters(date_from, date_to, department_id, recruiter_id, job_id, source))


@router.get("/reports/recruiters")
async def report_recruiters(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    department_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source: Optional[str] = None,
    user: User = Depends(require_report_view),
):
    return await RecruitmentReportService.recruiters(company(user), build_report_filters(date_from, date_to, department_id, recruiter_id, job_id, source))


@router.get("/reports/interviews")
async def report_interviews(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    department_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source: Optional[str] = None,
    user: User = Depends(require_report_view),
):
    return await RecruitmentReportService.interviews(company(user), build_report_filters(date_from, date_to, department_id, recruiter_id, job_id, source))


@router.get("/reports/offers")
async def report_offers(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    department_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source: Optional[str] = None,
    user: User = Depends(require_report_view),
):
    return await RecruitmentReportService.offers(company(user), build_report_filters(date_from, date_to, department_id, recruiter_id, job_id, source))


@router.get("/reports/trends")
async def report_trends(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    department_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source: Optional[str] = None,
    user: User = Depends(require_report_view),
):
    return await RecruitmentReportService.trends(company(user), build_report_filters(date_from, date_to, department_id, recruiter_id, job_id, source))


@router.get("/reports")
async def reports(
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    department_id: Optional[str] = None,
    recruiter_id: Optional[str] = None,
    job_id: Optional[str] = None,
    source: Optional[str] = None,
    user: User = Depends(require_report_view),
):
    filters = build_report_filters(date_from, date_to, department_id, recruiter_id, job_id, source)
    return {
        "dashboard": await RecruitmentDashboardService.dashboard(company(user), filters),
        "funnel": await RecruitmentReportService.funnel(company(user), filters),
        "offers": await RecruitmentReportService.offers(company(user), filters),
        "trends": await RecruitmentReportService.trends(company(user), filters),
    }
