"""
Seed Recruitment demo data for end-to-end manual QA.

Creates/updates:
- 1 active company
- 1 company admin with HR module enabled
- 20 recruitment jobs
- 20 candidates
- 20 applications
- 20 resume records
- 12 interviews
- 8 inbox import jobs
- timeline and notes for candidates

Idempotent: records use stable demo emails, slugs, tracking codes and checksums.
Run:
    python backend/scripts/seed_recruitment_demo.py
"""
import asyncio
import hashlib
import os
from datetime import datetime, timedelta
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

from app.core.database import close_db, init_db
from app.core.security import get_password_hash
from app.models.company import Company, CompanyStatus, Subscription, SubscriptionStatus
from app.models.user import User, UserRole, UserStatus
from app.recruitment.models import (
    Application,
    Candidate,
    CandidateNote,
    CandidateStatus,
    CandidateTimeline,
    ImportStatus,
    Interview,
    InterviewFeedbackStatus,
    InterviewLifecycleStatus,
    JobApplicationMethod,
    JobEmploymentType,
    JobLifecycleStatus,
    JobStatus,
    JobVisibility,
    JobWorkMode,
    RecruitmentImportJob,
    RecruitmentJob,
    Resume,
)


DEMO_COMPANY_EMAIL = "recruitment-demo@example.com"
DEMO_ADMIN_EMAIL = "hr.admin@example.com"
DEMO_PASSWORD = "Demo@123456"
SEED_TAG = "recruitment-demo-v1"


JOB_TITLES = [
    "Frontend Engineer",
    "Backend Engineer",
    "Full Stack Engineer",
    "Product Designer",
    "QA Automation Engineer",
    "DevOps Engineer",
    "Data Analyst",
    "HR Executive",
    "Technical Recruiter",
    "Customer Success Manager",
    "Sales Development Representative",
    "Marketing Manager",
    "Finance Associate",
    "Operations Manager",
    "Mobile Engineer",
    "Security Engineer",
    "Business Analyst",
    "Content Strategist",
    "Project Manager",
    "Engineering Manager",
]

NAMES = [
    "Rahul Sharma",
    "Priya Mehta",
    "Aman Verma",
    "Sneha Kapoor",
    "Vikram Singh",
    "Neha Iyer",
    "Arjun Patel",
    "Kavya Rao",
    "Rohan Gupta",
    "Ananya Das",
    "Ishaan Khanna",
    "Meera Nair",
    "Kabir Malhotra",
    "Tanya Bansal",
    "Aditya Joshi",
    "Ritika Sinha",
    "Nikhil Jain",
    "Pooja Menon",
    "Samar Choudhary",
    "Diya Thomas",
]

SKILLS = [
    ["React", "TypeScript", "Tailwind", "REST"],
    ["Python", "FastAPI", "MongoDB", "Docker"],
    ["React", "Node.js", "MongoDB", "AWS"],
    ["Figma", "Design Systems", "UX Research", "Prototyping"],
    ["Playwright", "Pytest", "CI/CD", "API Testing"],
    ["Docker", "Kubernetes", "AWS", "Terraform"],
    ["SQL", "Python", "Power BI", "Statistics"],
    ["HRIS", "Payroll", "Onboarding", "Compliance"],
    ["Sourcing", "Screening", "ATS", "Stakeholder Management"],
    ["CRM", "Onboarding", "Retention", "Communication"],
]

STATUSES = [
    CandidateStatus.NEW,
    CandidateStatus.SCREENING,
    CandidateStatus.SHORTLISTED,
    CandidateStatus.INTERVIEW_1,
    CandidateStatus.INTERVIEW_2,
    CandidateStatus.OFFER_SENT,
    CandidateStatus.OFFER_ACCEPTED,
    CandidateStatus.JOINED,
    CandidateStatus.REJECTED,
    CandidateStatus.WITHDRAWN,
]


def slugify(value: str) -> str:
    return value.lower().replace("&", "and").replace("/", "-").replace(" ", "-")


async def upsert_company() -> Company:
    now = datetime.utcnow()
    company = await Company.find_one({"email": DEMO_COMPANY_EMAIL})
    if not company:
        company = Company(
            name="SynTask Recruitment Demo",
            email=DEMO_COMPANY_EMAIL,
            phone="+91 90000 00000",
            website="https://syntask.local",
            industry="Software",
            company_size="51-200",
            status=CompanyStatus.ACTIVE,
            max_users=100,
            max_projects=50,
            max_storage_gb=25,
            approved_at=now,
        )
        await company.insert()
    else:
        company.status = CompanyStatus.ACTIVE
        company.updated_at = now
        await company.save()

    subscription = await Subscription.find_one({"company_id": str(company.id)})
    if not subscription:
        subscription = Subscription(
            company_id=str(company.id),
            status=SubscriptionStatus.ACTIVE,
            current_users=1,
            current_projects=0,
            trial_end_date=now + timedelta(days=30),
        )
        await subscription.insert()
    else:
        subscription.status = SubscriptionStatus.ACTIVE
        subscription.current_users = max(subscription.current_users, 1)
        subscription.updated_at = now
        await subscription.save()
    return company


async def upsert_admin(company: Company) -> User:
    now = datetime.utcnow()
    user = await User.find_one({"email": DEMO_ADMIN_EMAIL})
    if not user:
        user = User(
            email=DEMO_ADMIN_EMAIL,
            password_hash=get_password_hash(DEMO_PASSWORD),
            first_name="HR",
            last_name="Admin",
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            company_id=str(company.id),
            modules=["task", "hr", "sales"],
            active_module="hr",
            is_email_verified=True,
        )
        await user.insert()
    else:
        user.status = UserStatus.ACTIVE
        user.company_id = str(company.id)
        user.modules = sorted(set([*(user.modules or []), "task", "hr", "sales"]))
        user.active_module = "hr"
        user.updated_at = now
        user.is_email_verified = True
        await user.save()

    company.admin_id = str(user.id)
    company.updated_at = now
    await company.save()
    return user


async def upsert_job(company_id: str, actor_id: str, index: int) -> RecruitmentJob:
    now = datetime.utcnow()
    title = JOB_TITLES[index]
    slug = f"{slugify(title)}-{SEED_TAG}"
    status = [JobLifecycleStatus.PUBLISHED, JobLifecycleStatus.PAUSED, JobLifecycleStatus.DRAFT, JobLifecycleStatus.APPROVED][index % 4]
    job = await RecruitmentJob.find_one({"company_id": company_id, "slug": slug})
    payload = {
        "title": title,
        "department_id": f"dept-{(index % 5) + 1}",
        "hiring_manager_id": actor_id,
        "recruiter_ids": [actor_id],
        "employment_type": [JobEmploymentType.FULL_TIME, JobEmploymentType.CONTRACT, JobEmploymentType.INTERNSHIP][index % 3],
        "work_mode": [JobWorkMode.ONSITE, JobWorkMode.REMOTE, JobWorkMode.HYBRID][index % 3],
        "location": ["Bengaluru", "Remote", "Mumbai", "Delhi NCR", "Pune"][index % 5],
        "experience_min": float(index % 4),
        "experience_max": float((index % 4) + 4),
        "salary_min": 600000 + index * 50000,
        "salary_max": 1200000 + index * 75000,
        "openings": (index % 3) + 1,
        "required_skills": SKILLS[index % len(SKILLS)],
        "description": f"Demo hiring requirement for {title}. Seeded for Recruitment end-to-end QA.",
        "responsibilities": "Own delivery, collaborate with teams, communicate clearly, and improve hiring outcomes.",
        "qualifications": "Relevant experience, strong fundamentals, and ability to work in a fast-moving SaaS team.",
        "benefits": "Hybrid work, learning budget, health insurance, and flexible leave.",
        "visibility": JobVisibility.PUBLIC,
        "application_method": JobApplicationMethod.PORTAL,
        "lifecycle_status": status,
        "status": JobStatus.PUBLISHED if status == JobLifecycleStatus.PUBLISHED else JobStatus.DRAFT,
        "publish_options": {"seed": SEED_TAG, "channels": ["career_portal"]},
        "created_by": actor_id,
    }
    if not job:
        job = RecruitmentJob(company_id=company_id, slug=slug, created_at=now - timedelta(days=index), updated_at=now, **payload)
        await job.insert()
    else:
        for key, value in payload.items():
            setattr(job, key, value)
        job.updated_at = now
        await job.save()
    return job


async def upsert_candidate_bundle(company_id: str, actor_id: str, job: RecruitmentJob, index: int) -> Candidate:
    now = datetime.utcnow()
    full_name = NAMES[index]
    email = f"candidate{index + 1:02d}@example.com"
    status = STATUSES[index % len(STATUSES)]
    candidate = await Candidate.find_one({"company_id": company_id, "email": email})
    candidate_payload = {
        "job_id": str(job.id),
        "source": ["portal", "email", "referral", "manual"][index % 4],
        "full_name": full_name,
        "phone": f"+91 98{index + 10:08d}",
        "current_company": ["Acme Apps", "Northstar Labs", "CloudNine", "OrbitWorks"][index % 4],
        "experience_years": float((index % 8) + 1),
        "expected_salary": 700000 + index * 60000,
        "notice_period": ["immediate", "15_days", "30_days", "60_days"][index % 4],
        "location": ["Bengaluru", "Remote", "Mumbai", "Pune", "Hyderabad"][index % 5],
        "education": ["B.Tech", "MCA", "MBA", "B.Des"][index % 4],
        "skills": SKILLS[index % len(SKILLS)],
        "status": status,
        "assigned_recruiter_id": actor_id if index % 3 else None,
    }
    if not candidate:
        candidate = Candidate(company_id=company_id, email=email, created_at=now - timedelta(days=20 - index), updated_at=now, **candidate_payload)
        await candidate.insert()
    else:
        for key, value in candidate_payload.items():
            setattr(candidate, key, value)
        candidate.updated_at = now
        await candidate.save()

    checksum = hashlib.sha256(f"{SEED_TAG}:{email}:resume".encode()).hexdigest()
    resume = await Resume.find_one({"company_id": company_id, "checksum": checksum})
    if not resume:
        resume = Resume(
            company_id=company_id,
            candidate_id=str(candidate.id),
            original_filename=f"{slugify(full_name)}-resume.pdf",
            mime_type="application/pdf",
            storage_url=f"/uploads/recruitment/demo/{slugify(full_name)}-resume.pdf",
            checksum=checksum,
            size_bytes=128000 + index * 512,
            parsed_text=f"Seed resume for {full_name}. Skills: {', '.join(candidate.skills)}",
            uploaded_at=now - timedelta(days=20 - index),
        )
        await resume.insert()
    else:
        resume.candidate_id = str(candidate.id)
        resume.parsed_text = f"Seed resume for {full_name}. Skills: {', '.join(candidate.skills)}"
        await resume.save()

    candidate.resume_id = str(resume.id)
    await candidate.save()

    tracking_code = f"REC-DEMO-{index + 1:03d}"
    application = await Application.find_one({"company_id": company_id, "candidate_id": str(candidate.id), "job_id": str(job.id)})
    if not application:
        application = Application(
            company_id=company_id,
            candidate_id=str(candidate.id),
            job_id=str(job.id),
            source=candidate.source,
            status=status,
            assigned_recruiter_id=candidate.assigned_recruiter_id,
            current_resume_id=str(resume.id),
            tracking_code=tracking_code,
            applied_at=now - timedelta(days=20 - index),
        )
        await application.insert()
    else:
        application.status = status
        application.assigned_recruiter_id = candidate.assigned_recruiter_id
        application.current_resume_id = str(resume.id)
        application.tracking_code = tracking_code
        application.updated_at = now
        await application.save()

    await upsert_timeline(company_id, actor_id, candidate, job, status, index)
    await upsert_note(company_id, actor_id, candidate, index)
    if index < 12:
        await upsert_interview(company_id, actor_id, candidate, job, application, index)
    if index < 8:
        await upsert_inbox(company_id, actor_id, job, candidate, index)
    return candidate


async def upsert_timeline(company_id: str, actor_id: str, candidate: Candidate, job: RecruitmentJob, status: CandidateStatus, index: int) -> None:
    now = datetime.utcnow()
    events = [
        ("CandidateApplied", {"source": candidate.source, "job_title": job.title}),
        ("ResumeUploaded", {"resume_id": candidate.resume_id}),
        ("StageChanged", {"to": status.value}),
    ]
    if status in {CandidateStatus.INTERVIEW_1, CandidateStatus.INTERVIEW_2, CandidateStatus.OFFER_SENT, CandidateStatus.OFFER_ACCEPTED, CandidateStatus.JOINED}:
        events.append(("InterviewScheduled", {"round": 1}))
    if status in {CandidateStatus.OFFER_SENT, CandidateStatus.OFFER_ACCEPTED, CandidateStatus.JOINED}:
        events.append(("OfferSent", {"ctc": candidate.expected_salary}))

    for offset, (event_type, payload) in enumerate(events):
        marker = f"{SEED_TAG}:{candidate.email}:{event_type}"
        existing = await CandidateTimeline.find_one({"company_id": company_id, "candidate_id": str(candidate.id), "payload.seed_marker": marker})
        event_payload = {**payload, "seed_marker": marker}
        if not existing:
            await CandidateTimeline(
                company_id=company_id,
                candidate_id=str(candidate.id),
                job_id=str(job.id),
                event_type=event_type,
                payload=event_payload,
                actor_id=actor_id,
                created_at=now - timedelta(days=20 - index, hours=offset),
            ).insert()
        else:
            existing.payload = event_payload
            existing.created_at = now - timedelta(days=20 - index, hours=offset)
            await existing.save()


async def upsert_note(company_id: str, actor_id: str, candidate: Candidate, index: int) -> None:
    marker = f"{SEED_TAG}:{candidate.email}:note"
    note = await CandidateNote.find_one({"company_id": company_id, "candidate_id": str(candidate.id), "body": {"$regex": marker}})
    body = f"Seed note: candidate looks suitable for pipeline review. [{marker}]"
    if not note:
        await CandidateNote(company_id=company_id, candidate_id=str(candidate.id), body=body, created_by=actor_id).insert()
    else:
        note.body = body
        note.updated_at = datetime.utcnow()
        await note.save()


async def upsert_interview(company_id: str, actor_id: str, candidate: Candidate, job: RecruitmentJob, application: Application, index: int) -> None:
    schedule_at = datetime.utcnow() + timedelta(days=(index % 7) + 1, hours=index % 5)
    interview = await Interview.find_one({"company_id": company_id, "application_id": str(application.id), "round": (index % 2) + 1})
    payload = {
        "candidate_id": str(candidate.id),
        "application_id": str(application.id),
        "job_id": str(job.id),
        "round": (index % 2) + 1,
        "interview_type": ["technical", "culture", "manager"][index % 3],
        "interview_mode": ["online", "onsite", "phone"][index % 3],
        "interviewer_ids": [actor_id],
        "panel_name": "Seed Interview Panel",
        "mode": ["online", "onsite", "phone"][index % 3],
        "meeting_link": f"https://meet.syntask.local/recruitment-demo-{index + 1}",
        "location": "SynTask Office" if index % 3 == 1 else None,
        "schedule_at": schedule_at,
        "scheduled_at": schedule_at,
        "duration_minutes": 45 + (index % 2) * 15,
        "status": [InterviewLifecycleStatus.SCHEDULED, InterviewLifecycleStatus.CONFIRMED, InterviewLifecycleStatus.IN_PROGRESS, InterviewLifecycleStatus.COMPLETED][index % 4],
        "feedback_status": InterviewFeedbackStatus.SUBMITTED if index % 4 == 3 else InterviewFeedbackStatus.PENDING,
        "notes": f"Seed interview for {candidate.full_name}",
    }
    if not interview:
        interview = Interview(company_id=company_id, created_at=datetime.utcnow() - timedelta(days=index), updated_at=datetime.utcnow(), **payload)
        await interview.insert()
    else:
        for key, value in payload.items():
            setattr(interview, key, value)
        interview.updated_at = datetime.utcnow()
        await interview.save()


async def upsert_inbox(company_id: str, actor_id: str, job: RecruitmentJob, candidate: Candidate, index: int) -> None:
    message_id = f"{SEED_TAG}-message-{index + 1}"
    item = await RecruitmentImportJob.find_one({"company_id": company_id, "external_message_id": message_id})
    payload = {
        "source": "email",
        "external_message_id": message_id,
        "job_id": str(job.id),
        "status": [ImportStatus.IMPORTED, ImportStatus.PENDING, ImportStatus.DUPLICATE, ImportStatus.FAILED][index % 4],
        "attempts": index % 3,
        "imported_count": 1 if index % 4 == 0 else 0,
        "duplicate_count": 1 if index % 4 == 2 else 0,
        "rejected_count": 1 if index % 4 == 3 else 0,
        "sender_email": candidate.email,
        "sender_name": candidate.full_name,
        "subject": f"Application for {job.title}",
        "body_preview": f"Please find attached resume for {candidate.full_name}.",
        "attachments": [{"filename": f"{slugify(candidate.full_name)}-resume.pdf", "mime_type": "application/pdf", "size": 128000}],
        "result": {"candidate_id": str(candidate.id), "candidate_name": candidate.full_name, "seed": SEED_TAG},
        "requested_by": actor_id,
        "processed_at": datetime.utcnow() if index % 4 in {0, 2, 3} else None,
    }
    if not item:
        item = RecruitmentImportJob(company_id=company_id, created_at=datetime.utcnow() - timedelta(days=index), updated_at=datetime.utcnow(), **payload)
        await item.insert()
    else:
        for key, value in payload.items():
            setattr(item, key, value)
        item.updated_at = datetime.utcnow()
        await item.save()


async def main() -> None:
    await init_db()
    try:
        company = await upsert_company()
        admin = await upsert_admin(company)
        company_id = str(company.id)
        actor_id = str(admin.id)
        jobs = [await upsert_job(company_id, actor_id, index) for index in range(20)]
        for index, job in enumerate(jobs):
            await upsert_candidate_bundle(company_id, actor_id, job, index)
        print("Recruitment demo seed complete.")
        print(f"Company: {company.name} ({company_id})")
        print(f"Login: {DEMO_ADMIN_EMAIL} / {DEMO_PASSWORD}")
        print("Records: 20 jobs, 20 candidates, 20 applications, 20 resumes, 12 interviews, 8 inbox items")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
