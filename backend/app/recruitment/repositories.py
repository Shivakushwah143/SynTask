from datetime import datetime
import inspect
from typing import Optional, TypeVar

from beanie import Document
from pymongo import ASCENDING, DESCENDING

from app.recruitment.models import (Application, Candidate, CandidateNote,
                                    CandidateTimeline, ImportStatus, Interview,
                                    InterviewFeedback,
                                    JobLifecycleStatus, RecruitmentAttachment,
                                    RecruitmentImportJob, RecruitmentJob,
                                    Resume, Offer)

T = TypeVar("T", bound=Document)


async def aggregate_to_list(model: type[Document], pipeline: list[dict]) -> list[dict]:
    """Run an aggregation pipeline across Beanie/Motor/PyMongo async variants.

    Beanie 2.x with newer PyMongo/Motor can expose an async cursor whose
    aggregate()/to_list() awaitability differs by driver. This helper keeps
    the existing pipeline and response shape while avoiding awaiting a cursor
    object directly.
    """
    cursor = model.get_pymongo_collection().aggregate(pipeline)
    if inspect.isawaitable(cursor):
        cursor = await cursor

    if hasattr(cursor, "to_list"):
        try:
            result = cursor.to_list(length=None)
        except TypeError:
            result = cursor.to_list()
        if inspect.isawaitable(result):
            return await result
        return list(result)

    return [item async for item in cursor]


class TenantRepository:
    """All private recruitment reads require company scope."""

    @staticmethod
    async def get(model: type[T], entity_id: str, company_id: str, *, include_deleted: bool = False) -> Optional[T]:
        try:
            item = await model.get(entity_id)
        except Exception:
            return None
        if not item or getattr(item, "company_id", None) != company_id:
            return None
        if not include_deleted and getattr(item, "deleted_at", None) is not None:
            return None
        return item

    @staticmethod
    async def list(model: type[T], company_id: str, filters: Optional[dict] = None, skip: int = 0, limit: int = 50) -> list[T]:
        query = {"company_id": company_id, "deleted_at": None, **(filters or {})}
        return await model.find(query).sort("-created_at").skip(skip).limit(min(limit, 100)).to_list()


class JobRepository(TenantRepository):
    """Repository for Job aggregate root operations."""

    @staticmethod
    async def get_by_id(job_id: str, company_id: str, include_deleted: bool = False) -> Optional[RecruitmentJob]:
        """Get job by ID with company scope validation."""
        return await TenantRepository.get(RecruitmentJob, job_id, company_id, include_deleted=include_deleted)

    @staticmethod
    async def get_by_slug(slug: str, company_id: str) -> Optional[RecruitmentJob]:
        """Get job by slug with company scope validation."""
        return await RecruitmentJob.find_one({"company_id": company_id, "slug": slug, "deleted_at": None})

    @staticmethod
    async def public_by_id_or_slug(identifier: str) -> Optional[RecruitmentJob]:
        """Get public job by ID or slug."""
        try:
            item = await RecruitmentJob.get(identifier)
            if item and item.lifecycle_status == JobLifecycleStatus.PUBLISHED and item.deleted_at is None:
                return item
        except Exception:
            pass
        return await RecruitmentJob.find_one({"lifecycle_status": "published", "deleted_at": None, "slug": identifier})

    @staticmethod
    async def list_jobs(
        company_id: str,
        filters: Optional[dict] = None,
        skip: int = 0,
        limit: int = 50,
        sort_field: str = "created_at",
        sort_order: str = "desc",
    ) -> tuple[list[RecruitmentJob], int]:
        """List jobs with filtering, sorting, and pagination."""
        query = {"company_id": company_id, "deleted_at": None, **(filters or {})}

        # Build sort
        sort_direction = DESCENDING if sort_order == "desc" else ASCENDING
        sort_tuple = [(sort_field, sort_direction)]

        # Get total count
        total = await RecruitmentJob.find(query).count()

        # Get paginated results
        items = await RecruitmentJob.find(query).sort(sort_tuple).skip(skip).limit(min(limit, 100)).to_list()

        return items, total

    @staticmethod
    async def search_jobs(
        company_id: str,
        search_term: str,
        filters: Optional[dict] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[RecruitmentJob], int]:
        """Search jobs by title, slug, location."""
        query = {
            "company_id": company_id,
            "deleted_at": None,
            "$or": [
                {"title": {"$regex": search_term, "$options": "i"}},
                {"slug": {"$regex": search_term, "$options": "i"}},
                {"location": {"$regex": search_term, "$options": "i"}},
            ],
            **(filters or {}),
        }

        total = await RecruitmentJob.find(query).count()
        items = await RecruitmentJob.find(query).sort("-created_at").skip(skip).limit(min(limit, 100)).to_list()

        return items, total

    @staticmethod
    async def count_by_status(company_id: str) -> dict[str, int]:
        """Count jobs by lifecycle status."""
        pipeline = [
            {"$match": {"company_id": company_id, "deleted_at": None}},
            {"$group": {"_id": "$lifecycle_status", "count": {"$sum": 1}}},
        ]

        results = await aggregate_to_list(RecruitmentJob, pipeline)
        return {r["_id"]: r["count"] for r in results}

    @staticmethod
    async def get_recent_jobs(company_id: str, limit: int = 5) -> list[RecruitmentJob]:
        """Get most recent jobs."""
        return await RecruitmentJob.find(
            {"company_id": company_id, "deleted_at": None}
        ).sort("-created_at").limit(limit).to_list()

    @staticmethod
    async def update_counters(job_id: str, counter_field: str, delta: int) -> Optional[RecruitmentJob]:
        """Increment/decrement a counter field atomically."""
        job = await RecruitmentJob.get(job_id)
        if not job:
            return None

        current_value = getattr(job.analytics_counters, counter_field, 0)
        setattr(job.analytics_counters, counter_field, current_value + delta)
        job.updated_at = datetime.utcnow()
        await job.save()
        return job


class CandidateRepository(TenantRepository):
    @staticmethod
    async def duplicate(company_id: str, email: str, job_id: Optional[str]) -> Optional[Candidate]:
        return await Candidate.find_one({"company_id": company_id, "email": email.lower(), "job_id": job_id, "deleted_at": None})

    @staticmethod
    async def find_by_email_or_phone(company_id: str, email: Optional[str], phone: Optional[str] = None) -> Optional[Candidate]:
        query = {"company_id": company_id, "deleted_at": None, "$or": []}
        if email:
            query["$or"].append({"email": email.lower().strip()})
        if phone:
            query["$or"].append({"phone": phone.strip()})
        if not query["$or"]:
            return None
        return await Candidate.find_one(query)

    @staticmethod
    async def search(company_id: str, filters: dict, skip: int = 0, limit: int = 50) -> tuple[list[Candidate], int]:
        query = {"company_id": company_id, **filters}
        total = await Candidate.find(query).count()
        items = await Candidate.find(query).sort("-created_at").skip(skip).limit(min(limit, 100)).to_list()
        return items, total


class ApplicationRepository(TenantRepository):
    @staticmethod
    async def find_existing(company_id: str, candidate_id: str, job_id: str) -> Optional[Application]:
        return await Application.find_one({"company_id": company_id, "candidate_id": candidate_id, "job_id": job_id, "deleted_at": None})

    @staticmethod
    async def get_by_tracking_code(company_id: str, tracking_code: str) -> Optional[Application]:
        return await Application.find_one({"company_id": company_id, "tracking_code": tracking_code, "deleted_at": None})

    @staticmethod
    async def list_for_candidate(company_id: str, candidate_id: str) -> list[Application]:
        return await Application.find({"company_id": company_id, "candidate_id": candidate_id, "deleted_at": None}).sort("-applied_at").to_list()


class ResumeRepository(TenantRepository):
    @staticmethod
    async def find_by_checksum(company_id: str, checksum: str) -> Optional[Resume]:
        return await Resume.find_one({"company_id": company_id, "checksum": checksum, "deleted_at": None})

    @staticmethod
    async def list_for_candidate(company_id: str, candidate_id: str) -> list[Resume]:
        return await Resume.find({"company_id": company_id, "candidate_id": candidate_id, "deleted_at": None}).sort("-uploaded_at").to_list()

    @staticmethod
    async def list_pool(company_id: str, filters: dict, skip: int = 0, limit: int = 50) -> tuple[list[Resume], int]:
        query = {"company_id": company_id, "deleted_at": None, **filters}
        total = await Resume.find(query).count()
        items = await Resume.find(query).sort("-uploaded_at").skip(skip).limit(min(limit, 100)).to_list()
        return items, total


class CandidateNoteRepository(TenantRepository):
    @staticmethod
    async def list_for_candidate(company_id: str, candidate_id: str) -> list[CandidateNote]:
        return await CandidateNote.find({"company_id": company_id, "candidate_id": candidate_id, "deleted_at": None}).sort("-created_at").to_list()


class RecruitmentAttachmentRepository(TenantRepository):
    @staticmethod
    async def list_for_candidate(company_id: str, candidate_id: str) -> list[RecruitmentAttachment]:
        return await RecruitmentAttachment.find({"company_id": company_id, "candidate_id": candidate_id, "deleted_at": None}).sort("-created_at").to_list()


class CandidateTimelineRepository(TenantRepository):
    @staticmethod
    async def list_for_candidate(company_id: str, candidate_id: str) -> list[CandidateTimeline]:
        return await CandidateTimeline.find({"company_id": company_id, "candidate_id": candidate_id}).sort("-created_at").to_list()


class InterviewRepository(TenantRepository):
    @staticmethod
    async def get_by_id(interview_id: str, company_id: str) -> Optional[Interview]:
        return await TenantRepository.get(Interview, interview_id, company_id)

    @staticmethod
    async def list_interviews(company_id: str, filters: dict, skip: int = 0, limit: int = 50) -> tuple[list[Interview], int]:
        query = {"company_id": company_id, "deleted_at": None, **filters}
        total = await Interview.find(query).count()
        items = await Interview.find(query).sort("-schedule_at").skip(skip).limit(min(limit, 100)).to_list()
        return items, total


class InterviewFeedbackRepository(TenantRepository):
    @staticmethod
    async def list_for_interview(company_id: str, interview_id: str) -> list[InterviewFeedback]:
        return await InterviewFeedback.find({"company_id": company_id, "interview_id": interview_id, "deleted_at": None}).sort("-created_at").to_list()

    @staticmethod
    async def get_for_interviewer(company_id: str, interview_id: str, interviewer_id: str) -> Optional[InterviewFeedback]:
        return await InterviewFeedback.find_one({"company_id": company_id, "interview_id": interview_id, "interviewer_id": interviewer_id, "deleted_at": None})


class ImportJobRepository(TenantRepository):
    @staticmethod
    async def create(job: RecruitmentImportJob) -> RecruitmentImportJob:
        await job.insert()
        return job

    @staticmethod
    async def get_by_id(import_id: str, company_id: str) -> Optional[RecruitmentImportJob]:
        return await TenantRepository.get(RecruitmentImportJob, import_id, company_id)

    @staticmethod
    async def list_inbox(company_id: str, status_value: Optional[ImportStatus] = None, skip: int = 0, limit: int = 50) -> tuple[list[RecruitmentImportJob], int]:
        query = {"company_id": company_id, "deleted_at": None}
        if status_value:
            query["status"] = status_value
        total = await RecruitmentImportJob.find(query).count()
        items = await RecruitmentImportJob.find(query).sort("-created_at").skip(skip).limit(min(limit, 100)).to_list()
        return items, total

    @staticmethod
    async def find_by_external_message(company_id: str, external_message_id: str) -> Optional[RecruitmentImportJob]:
        return await RecruitmentImportJob.find_one({"company_id": company_id, "external_message_id": external_message_id, "deleted_at": None})


InboxRepository = ImportJobRepository


class RecruitmentReportRepository:
    """Aggregation-only reporting queries."""

    @staticmethod
    def scoped_match(company_id: str, filters: dict, date_field: str = "created_at") -> dict:
        match = {"company_id": company_id, "deleted_at": None}
        if filters.get("source"):
            match["source"] = filters["source"]
        if filters.get("job_id"):
            match["job_id"] = filters["job_id"]
        if filters.get("recruiter_id"):
            match["assigned_recruiter_id"] = filters["recruiter_id"]
        if filters.get("date_from") or filters.get("date_to"):
            match[date_field] = {}
            if filters.get("date_from"):
                match[date_field]["$gte"] = filters["date_from"]
            if filters.get("date_to"):
                match[date_field]["$lte"] = filters["date_to"]
        return match

    @staticmethod
    async def counts_by_field(model: type[Document], match: dict, field: str) -> list[dict]:
        pipeline = [
            {"$match": match},
            {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        return await aggregate_to_list(model, pipeline)

    @staticmethod
    async def dashboard(company_id: str, filters: dict) -> dict:
        job_match = {"company_id": company_id, "deleted_at": None}
        app_match = RecruitmentReportRepository.scoped_match(company_id, filters, "applied_at")
        interview_match = RecruitmentReportRepository.scoped_match(company_id, filters, "schedule_at")
        offer_match = RecruitmentReportRepository.scoped_match(company_id, filters, "created_at")
        candidate_match = RecruitmentReportRepository.scoped_match(company_id, filters, "created_at")
        return {
            "open_jobs": await RecruitmentJob.find({**job_match, "lifecycle_status": {"$in": ["published", "approved", "paused"]}}).count(),
            "published_jobs": await RecruitmentJob.find({**job_match, "lifecycle_status": "published"}).count(),
            "active_applications": await Application.find({**app_match, "status": {"$nin": ["rejected", "withdrawn", "archived"]}}).count(),
            "interviews_scheduled": await Interview.find({**interview_match, "status": {"$in": ["scheduled", "confirmed", "in_progress"]}}).count(),
            "offers_pending": await Offer.find({**offer_match, "status": {"$in": ["draft", "sent"]}}).count(),
            "joined_candidates": await Candidate.find({**candidate_match, "status": {"$in": ["joined", "employee"]}}).count(),
        }

    @staticmethod
    async def hiring_funnel(company_id: str, filters: dict) -> list[dict]:
        return await RecruitmentReportRepository.counts_by_field(
            Candidate,
            RecruitmentReportRepository.scoped_match(company_id, filters, "created_at"),
            "status",
        )

    @staticmethod
    async def applications_by_job(company_id: str, filters: dict) -> list[dict]:
        return await aggregate_to_list(Application, [
            {"$match": RecruitmentReportRepository.scoped_match(company_id, filters, "applied_at")},
            {"$group": {"_id": "$job_id", "applications": {"$sum": 1}}},
            {"$addFields": {"job_object_id": {"$convert": {"input": "$_id", "to": "objectId", "onError": None, "onNull": None}}}},
            {"$lookup": {"from": "recruitment_jobs", "localField": "job_object_id", "foreignField": "_id", "as": "job"}},
            {"$sort": {"applications": -1}},
        ])

    @staticmethod
    async def applications_by_department(company_id: str, filters: dict) -> list[dict]:
        return await aggregate_to_list(Application, [
            {"$match": RecruitmentReportRepository.scoped_match(company_id, filters, "applied_at")},
            {"$addFields": {"job_object_id": {"$convert": {"input": "$job_id", "to": "objectId", "onError": None, "onNull": None}}}},
            {"$lookup": {"from": "recruitment_jobs", "localField": "job_object_id", "foreignField": "_id", "as": "job"}},
            {"$unwind": {"path": "$job", "preserveNullAndEmptyArrays": True}},
            {"$match": {"job.department_id": filters["department_id"]} if filters.get("department_id") else {}},
            {"$group": {"_id": "$job.department_id", "applications": {"$sum": 1}}},
            {"$sort": {"applications": -1}},
        ])

    @staticmethod
    async def recruiter_performance(company_id: str, filters: dict) -> list[dict]:
        return await aggregate_to_list(Application, [
            {"$match": RecruitmentReportRepository.scoped_match(company_id, filters, "applied_at")},
            {"$group": {
                "_id": "$assigned_recruiter_id",
                "applications": {"$sum": 1},
                "joined": {"$sum": {"$cond": [{"$eq": ["$status", "employee"]}, 1, 0]}},
                "rejected": {"$sum": {"$cond": [{"$eq": ["$status", "rejected"]}, 1, 0]}},
            }},
            {"$sort": {"applications": -1}},
        ])

    @staticmethod
    async def interview_conversion(company_id: str, filters: dict) -> dict:
        match = RecruitmentReportRepository.scoped_match(company_id, filters, "schedule_at")
        by_decision = await RecruitmentReportRepository.counts_by_field(Interview, match, "decision")
        by_status = await RecruitmentReportRepository.counts_by_field(Interview, match, "status")
        return {"by_decision": by_decision, "by_status": by_status}

    @staticmethod
    async def offer_analytics(company_id: str, filters: dict) -> dict:
        match = RecruitmentReportRepository.scoped_match(company_id, filters, "created_at")
        by_status = await RecruitmentReportRepository.counts_by_field(Offer, match, "status")
        sent = sum(item["count"] for item in by_status if item["_id"] in ("sent", "accepted", "rejected"))
        accepted = sum(item["count"] for item in by_status if item["_id"] == "accepted")
        return {
            "by_status": by_status,
            "offer_acceptance_rate": round((accepted / sent) * 100, 2) if sent else 0,
        }

    @staticmethod
    async def hiring_sources(company_id: str, filters: dict) -> list[dict]:
        return await RecruitmentReportRepository.counts_by_field(
            Candidate,
            RecruitmentReportRepository.scoped_match(company_id, filters, "created_at"),
            "source",
        )

    @staticmethod
    async def monthly_trends(company_id: str, filters: dict) -> list[dict]:
        return await aggregate_to_list(Application, [
            {"$match": RecruitmentReportRepository.scoped_match(company_id, filters, "applied_at")},
            {"$group": {"_id": {"year": {"$year": "$applied_at"}, "month": {"$month": "$applied_at"}}, "applications": {"$sum": 1}}},
            {"$sort": {"_id.year": 1, "_id.month": 1}},
        ])

    @staticmethod
    async def time_metrics(company_id: str, filters: dict) -> dict:
        match = RecruitmentReportRepository.scoped_match(company_id, filters, "applied_at")
        time_to_hire = await aggregate_to_list(Application, [
            {"$match": {**match, "status": {"$in": ["joined", "employee"]}}},
            {"$project": {"days": {"$dateDiff": {"startDate": "$applied_at", "endDate": "$updated_at", "unit": "day"}}}},
            {"$group": {"_id": None, "average_days": {"$avg": "$days"}, "count": {"$sum": 1}}},
        ])
        time_to_fill = await aggregate_to_list(RecruitmentJob, [
            {"$match": {"company_id": company_id, "deleted_at": None, "lifecycle_status": {"$in": ["closed", "archived"]}}},
            {"$project": {"days": {"$dateDiff": {"startDate": "$created_at", "endDate": "$updated_at", "unit": "day"}}}},
            {"$group": {"_id": None, "average_days": {"$avg": "$days"}, "count": {"$sum": 1}}},
        ])
        return {
            "time_to_hire": time_to_hire[0] if time_to_hire else {"average_days": 0, "count": 0},
            "time_to_fill": time_to_fill[0] if time_to_fill else {"average_days": 0, "count": 0},
        }
