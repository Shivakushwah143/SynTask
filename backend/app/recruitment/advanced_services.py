import hashlib
import io
import re
import secrets
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException, UploadFile, status

from app.core.clock import utc_now
from app.core.config import settings
from app.models.user import User
from app.recruitment.models import (
    Application,
    Candidate,
    CandidateJobScore,
    CandidateSkillExtraction,
    CandidateStatus,
    Interview,
    InterviewLifecycleStatus,
    JobRequirementProfile,
    MicrosoftRecruitmentConnection,
    Offer,
    OfferAccessToken,
    OfferTemplate,
    RecruitmentJob,
    Resume,
    ResumeParsedProfile,
    SkillAlias,
)
from app.recruitment.repositories import TenantRepository
from app.recruitment.services import RecruitmentService, ResumeStorageService, record


DEFAULT_SKILL_ALIASES = {
    "react.js": "React",
    "reactjs": "React",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "typescript": "TypeScript",
    "postgres sql": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "ms azure": "Microsoft Azure",
    "azure": "Microsoft Azure",
}

DEFAULT_WEIGHTS = {
    "required_skills": 35,
    "experience": 20,
    "preferred_skills": 10,
    "project_relevance": 10,
    "education": 5,
    "location": 5,
    "salary": 5,
    "notice_period": 5,
    "resume_completeness": 5,
}


def _tokenize_csv(value: str) -> list[str]:
    return [part.strip(" .;:\n\t").strip() for part in re.split(r"[,|;/\n]", value or "") if part.strip()]


def _safe_sentence(text: str, term: str) -> Optional[str]:
    idx = text.lower().find(term.lower())
    if idx < 0:
        return None
    start = max(0, text.rfind(".", 0, idx) + 1)
    end = text.find(".", idx)
    if end < 0:
        end = min(len(text), idx + 180)
    return text[start:end].strip()[:240]


class ResumeIntelligenceService:
    allowed_ext = {".pdf", ".docx", ".txt"}
    allowed_mimes = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    }

    @staticmethod
    async def upload_resume(company_id: str, actor_id: str, candidate_id: str, file: UploadFile) -> Resume:
        candidate = await TenantRepository.get(Candidate, candidate_id, company_id)
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Resume file is empty")
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ResumeIntelligenceService.allowed_ext:
            raise HTTPException(status_code=400, detail="Unsupported resume file type")
        result = await ResumeStorageService.upload_resume(company_id, content, Path(file.filename or "resume").name, candidate_id)
        resume = await Resume.get(result.resume_id)
        if not resume:
            raise HTTPException(status_code=500, detail="Resume storage failed")
        candidate.resume_id = str(resume.id)
        candidate.updated_at = utc_now()
        await candidate.save()
        await record(company_id, "ResumeUploaded", actor_id, candidate_id=candidate_id, payload={"resume_id": str(resume.id)})
        await ResumeIntelligenceService.process_resume(company_id, str(resume.id), actor_id)
        return resume

    @staticmethod
    def extract_text_from_bytes(content: bytes, filename: str) -> str:
        ext = Path(filename).suffix.lower()
        if ext == ".txt":
            return content.decode("utf-8", errors="ignore").strip()
        if ext == ".docx":
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as archive:
                    xml = archive.read("word/document.xml").decode("utf-8", errors="ignore")
                text = re.sub(r"<[^>]+>", " ", xml)
                return re.sub(r"\s+", " ", text).strip()
            except Exception as exc:
                raise HTTPException(status_code=400, detail="DOCX resume is corrupted or password protected") from exc
        if ext == ".pdf":
            if b"/Encrypt" in content[:4096] or b"/Encrypt" in content:
                raise HTTPException(status_code=400, detail="Password-protected PDF cannot be processed")
            try:
                raw = content.decode("latin-1", errors="ignore")
                chunks = re.findall(r"\(([^()]{2,})\)\s*Tj|\[([^\]]+)\]\s*TJ", raw)
                text = " ".join(a or b for a, b in chunks)
                text = re.sub(r"\\[()]", "", text)
                text = re.sub(r"\s+", " ", text).strip()
                return text
            except Exception as exc:
                raise HTTPException(status_code=400, detail="PDF resume is corrupted") from exc
        raise HTTPException(status_code=400, detail="Unsupported resume file type")

    @staticmethod
    async def process_resume(company_id: str, resume_id: str, actor_id: Optional[str] = None, force: bool = False) -> Resume:
        resume = await TenantRepository.get(Resume, resume_id, company_id)
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        if resume.processing_status == "completed" and not force:
            return resume
        resume.processing_status = "extracting"
        resume.processing_error = None
        resume.processing_started_at = utc_now()
        await resume.save()
        try:
            storage_path = resume.storage_url.replace("/uploads/", "")
            path = Path(settings.UPLOAD_DIR) / storage_path
            if not path.exists():
                path = Path(settings.UPLOAD_DIR) / "resumes" / Path(resume.original_filename).name
            if not path.exists():
                raise HTTPException(status_code=404, detail="Stored resume file not found")
            content = path.read_bytes()
            text = ResumeIntelligenceService.extract_text_from_bytes(content, resume.original_filename)
            if not text:
                raise HTTPException(status_code=400, detail="Resume has no extractable text")
            resume.parsed_text = text
            resume.extracted_text_checksum = hashlib.sha256(text.encode()).hexdigest()
            resume.processing_status = "parsing"
            await resume.save()
            profile = await ResumeIntelligenceService.parse_profile(company_id, resume, text)
            await ResumeIntelligenceService.persist_skills(company_id, resume, text, profile.get("skills", []))
            resume.processing_status = "completed"
            resume.processing_completed_at = utc_now()
            resume.parser_provider = "deterministic"
            resume.parser_model = "local-rules"
            await resume.save()
            candidate = await TenantRepository.get(Candidate, resume.candidate_id, company_id)
            if candidate:
                candidate.full_name = candidate.full_name or profile.get("full_name") or candidate.full_name
                candidate.phone = candidate.phone or profile.get("phone")
                candidate.location = candidate.location or profile.get("location")
                candidate.experience_years = candidate.experience_years or profile.get("total_experience_years") or 0
                candidate.expected_salary = candidate.expected_salary or profile.get("expected_salary")
                candidate.skills = sorted(set(candidate.skills + profile.get("normalized_skills", [])))
                candidate.updated_at = utc_now()
                await candidate.save()
            await record(company_id, "ResumeProcessed", actor_id, candidate_id=resume.candidate_id, payload={"resume_id": resume_id})
            return resume
        except HTTPException as exc:
            resume.processing_status = "failed"
            resume.processing_error = str(exc.detail)
            await resume.save()
            raise
        except Exception as exc:
            resume.processing_status = "failed"
            resume.processing_error = "Resume processing failed"
            await resume.save()
            raise HTTPException(status_code=500, detail="Resume processing failed") from exc

    @staticmethod
    async def parse_profile(company_id: str, resume: Resume, text: str) -> dict[str, Any]:
        email = re.search(r"[\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,}", text)
        phone = re.search(r"(?:\+?\d[\d\s().-]{8,}\d)", text)
        years = re.search(r"(\d+(?:\.\d+)?)\+?\s*(?:years|yrs)", text, re.I)
        linkedin = re.search(r"https?://(?:www\.)?linkedin\.com/[^\s)]+", text, re.I)
        github = re.search(r"https?://(?:www\.)?github\.com/[^\s)]+", text, re.I)
        portfolio = re.search(r"https?://[^\s)]+", text, re.I)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        full_name = lines[0][:120] if lines else ""
        known_skills = set(DEFAULT_SKILL_ALIASES.values()) | {"Python", "Java", "FastAPI", "Django", "MongoDB", "AWS", "Docker", "Kubernetes", "GraphQL", "Next.js", "Vue", "Angular"}
        raw_skills = []
        lower = text.lower()
        for skill in sorted(known_skills):
            if re.search(rf"\b{re.escape(skill.lower())}\b", lower):
                raw_skills.append(skill)
        for match in re.findall(r"(?:skills|technologies)[:\s]+([^\n]{4,220})", text, re.I):
            raw_skills.extend(_tokenize_csv(match))
        normalized = await SkillNormalizationService.normalize_many(company_id, raw_skills)
        profile = {
            "full_name": full_name,
            "email": email.group(0).lower() if email else "",
            "phone": phone.group(0).strip() if phone else "",
            "location": "",
            "current_title": "",
            "total_experience_years": float(years.group(1)) if years else 0,
            "summary": text[:600],
            "skills": sorted(set(raw_skills)),
            "normalized_skills": sorted(set(item["normalized_skill"] for item in normalized)),
            "education": re.findall(r"(?i)\b(B\.?Tech|M\.?Tech|MBA|BSc|MSc|Bachelor|Master|PhD)[^\n.]{0,80}", text),
            "employment_history": [],
            "projects": re.findall(r"(?i)project[s]?:?\s*([^\n.]{5,160})", text)[:8],
            "certifications": re.findall(r"(?i)(?:certified|certification)[:\s]+([^\n.]{4,120})", text)[:8],
            "languages": [],
            "expected_salary": None,
            "notice_period_days": None,
            "linkedin_url": linkedin.group(0) if linkedin else None,
            "github_url": github.group(0) if github else None,
            "portfolio_url": portfolio.group(0) if portfolio else None,
            "parser_confidence": 0.75 if email and raw_skills else 0.45,
            "parse_warnings": [] if email else ["Email not found in resume"],
        }
        existing = await ResumeParsedProfile.find_one({"company_id": company_id, "resume_id": str(resume.id)})
        if not existing:
            existing = ResumeParsedProfile(company_id=company_id, resume_id=str(resume.id), candidate_id=resume.candidate_id)
        existing.profile = profile
        existing.field_sources = {key: "resume_parser" for key in profile}
        existing.parser_confidence = profile["parser_confidence"]
        existing.parse_warnings = profile["parse_warnings"]
        existing.updated_at = utc_now()
        await existing.save() if existing.id else await existing.insert()
        return profile

    @staticmethod
    async def persist_skills(company_id: str, resume: Resume, text: str, skills: list[str]) -> None:
        normalized = await SkillNormalizationService.normalize_many(company_id, skills)
        for item in normalized:
            existing = await CandidateSkillExtraction.find_one({
                "company_id": company_id,
                "resume_id": str(resume.id),
                "normalized_skill": item["normalized_skill"],
            })
            if existing:
                continue
            await CandidateSkillExtraction(
                company_id=company_id,
                candidate_id=resume.candidate_id,
                resume_id=str(resume.id),
                raw_skill=item["raw_skill"],
                normalized_skill=item["normalized_skill"],
                confidence=item["confidence"],
                evidence=_safe_sentence(text, item["raw_skill"]),
            ).insert()


class SkillNormalizationService:
    @staticmethod
    async def normalize(company_id: str, raw: str) -> dict[str, Any]:
        key = raw.strip().lower()
        alias = await SkillAlias.find_one({"company_id": company_id, "alias": key})
        normalized = alias.normalized if alias else DEFAULT_SKILL_ALIASES.get(key, raw.strip())
        return {"raw_skill": raw.strip(), "normalized_skill": normalized, "confidence": alias.confidence if alias else 0.9}

    @staticmethod
    async def normalize_many(company_id: str, skills: list[str]) -> list[dict[str, Any]]:
        result = []
        seen = set()
        for raw in skills:
            if not raw or not raw.strip():
                continue
            item = await SkillNormalizationService.normalize(company_id, raw)
            key = item["normalized_skill"].lower()
            if key not in seen:
                seen.add(key)
                result.append(item)
        return result


class CandidateScoringService:
    @staticmethod
    async def extract_requirements(company_id: str, job_id: str, actor_id: Optional[str]) -> JobRequirementProfile:
        job = await TenantRepository.get(RecruitmentJob, job_id, company_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        text = " ".join([job.description or "", job.responsibilities or "", job.qualifications or ""])
        raw_required = job.required_skills + re.findall(r"(?i)(?:required|required skills|must have)[:\s]+([^\n.]{3,180})", text)
        required = [s for part in raw_required for s in (part if isinstance(part, list) else _tokenize_csv(str(part)))]
        normalized = await SkillNormalizationService.normalize_many(company_id, required)
        preferred = re.findall(r"(?i)(?:preferred|nice to have)[:\s]+([^\n.]{3,180})", text)
        preferred_norm = await SkillNormalizationService.normalize_many(company_id, [s for p in preferred for s in _tokenize_csv(p)])
        req = {
            "required_skills": sorted(set(i["normalized_skill"] for i in normalized)),
            "preferred_skills": sorted(set(i["normalized_skill"] for i in preferred_norm)),
            "minimum_experience_years": job.experience_min,
            "preferred_experience_years": job.experience_max,
            "education_requirements": re.findall(r"(?i)\b(Bachelor|Master|MBA|BTech|MTech|PhD)[^\n.]{0,80}", text),
            "location_requirements": [job.location] if job.location else [],
            "salary_min": job.salary_min,
            "salary_max": job.salary_max,
            "notice_period_limit": None,
            "keywords": sorted(set(re.findall(r"\b[A-Za-z][A-Za-z+#.]{2,}\b", text)))[:50],
        }
        profile = await JobRequirementProfile.find_one({"company_id": company_id, "job_id": job_id})
        if not profile:
            profile = JobRequirementProfile(company_id=company_id, job_id=job_id, extracted_by=actor_id)
        profile.requirements = req
        profile.scoring_weights = DEFAULT_WEIGHTS.copy()
        profile.updated_at = utc_now()
        await profile.save() if profile.id else await profile.insert()
        await record(company_id, "JobRequirementsExtracted", actor_id, job_id=job_id)
        return profile

    @staticmethod
    async def score_candidate(company_id: str, job_id: str, candidate_id: str) -> CandidateJobScore:
        job = await TenantRepository.get(RecruitmentJob, job_id, company_id)
        candidate = await TenantRepository.get(Candidate, candidate_id, company_id)
        if not job or not candidate:
            raise HTTPException(status_code=404, detail="Job or candidate not found")
        req = await JobRequirementProfile.find_one({"company_id": company_id, "job_id": job_id}) or await CandidateScoringService.extract_requirements(company_id, job_id, None)
        weights = {**DEFAULT_WEIGHTS, **(req.scoring_weights or {})}
        candidate_skills = set(candidate.skills or [])
        extracted = await CandidateSkillExtraction.find({"company_id": company_id, "candidate_id": candidate_id}).to_list()
        candidate_skills |= {s.normalized_skill for s in extracted}
        required = set(req.requirements.get("required_skills") or [])
        preferred = set(req.requirements.get("preferred_skills") or [])
        matched_required = sorted(required & candidate_skills)
        missing_required = sorted(required - candidate_skills)
        matched_preferred = sorted(preferred & candidate_skills)
        required_score = weights["required_skills"] * (len(matched_required) / len(required)) if required else weights["required_skills"]
        preferred_score = weights["preferred_skills"] * (len(matched_preferred) / len(preferred)) if preferred else weights["preferred_skills"]
        min_exp = req.requirements.get("minimum_experience_years") or 0
        exp_score = weights["experience"] if candidate.experience_years >= min_exp else weights["experience"] * min(1, candidate.experience_years / max(min_exp, 1))
        salary_score = weights["salary"]
        if candidate.expected_salary and req.requirements.get("salary_max"):
            salary_score = weights["salary"] if candidate.expected_salary <= req.requirements["salary_max"] else 0
        completeness_fields = [candidate.full_name, candidate.email, candidate.phone, candidate.location, candidate.skills]
        completeness = weights["resume_completeness"] * (sum(1 for v in completeness_fields if v) / len(completeness_fields))
        location_score = weights["location"] if not req.requirements.get("location_requirements") or (candidate.location and candidate.location.lower() in " ".join(req.requirements["location_requirements"]).lower()) else weights["location"] * 0.5
        components = {
            "required_skills_score": round(required_score, 2),
            "experience_score": round(exp_score, 2),
            "preferred_skills_score": round(preferred_score, 2),
            "project_relevance_score": weights["project_relevance"] if matched_required else 0,
            "education_score": weights["education"] if candidate.education else 0,
            "location_score": round(location_score, 2),
            "salary_score": round(salary_score, 2),
            "notice_period_score": weights["notice_period"],
            "resume_completeness_score": round(completeness, 2),
        }
        overall = round(sum(components.values()), 2)
        recommendation = "strong_match" if overall >= 85 else "good_match" if overall >= 70 else "review_manually" if overall >= 50 else "weak_match"
        if not candidate_skills:
            recommendation = "insufficient_information"
        score = {
            "overall_score": overall,
            **components,
            "matched_skills": matched_required,
            "missing_required_skills": missing_required,
            "matched_preferred_skills": matched_preferred,
            "strengths": [f"Matches {len(matched_required)} required skill(s)", f"{candidate.experience_years:g} years reported experience"],
            "concerns": [f"Missing required skill: {s}" for s in missing_required[:5]],
            "recommendation": recommendation,
            "explanation": "Deterministic score. Protected attributes are excluded. Human review is required before any hiring decision.",
            "scoring_version": "candidate-score-v1",
            "scored_at": utc_now().isoformat(),
        }
        record_item = await CandidateJobScore.find_one({"company_id": company_id, "candidate_id": candidate_id, "job_id": job_id, "scoring_version": "candidate-score-v1"})
        if not record_item:
            record_item = CandidateJobScore(company_id=company_id, candidate_id=candidate_id, job_id=job_id, resume_id=candidate.resume_id)
        record_item.score = score
        record_item.status = "completed"
        record_item.updated_at = utc_now()
        await record_item.save() if record_item.id else await record_item.insert()
        return record_item

    @staticmethod
    async def score_job_candidates(company_id: str, job_id: str) -> list[CandidateJobScore]:
        apps = await Application.find({"company_id": company_id, "job_id": job_id, "deleted_at": None}).to_list()
        candidate_ids = {app.candidate_id for app in apps}
        if not candidate_ids:
            candidates = await Candidate.find({"company_id": company_id, "job_id": job_id, "deleted_at": None}).to_list()
            candidate_ids = {str(c.id) for c in candidates}
        return [await CandidateScoringService.score_candidate(company_id, job_id, cid) for cid in candidate_ids]


class InterviewSchedulingService:
    @staticmethod
    async def propose_slots(company_id: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        start = payload.get("date_from") or utc_now().isoformat()
        end = payload.get("date_to")
        start_dt = datetime.fromisoformat(str(start).replace("Z", "+00:00")).replace(tzinfo=None)
        end_dt = datetime.fromisoformat(str(end).replace("Z", "+00:00")).replace(tzinfo=None) if end else start_dt + timedelta(days=7)
        duration = int(payload.get("duration_minutes") or 60)
        required = payload.get("required_interviewer_ids") or payload.get("interviewer_ids") or []
        optional = payload.get("optional_interviewer_ids") or []
        working = payload.get("working_hours") or {"start": "09:00", "end": "17:00"}
        slots = []
        cursor = start_dt.replace(hour=int(working["start"].split(":")[0]), minute=0, second=0, microsecond=0)
        while cursor < end_dt and len(slots) < 12:
            if cursor.weekday() < 5:
                slot_end = cursor + timedelta(minutes=duration)
                conflicts = await Interview.find({
                    "company_id": company_id,
                    "deleted_at": None,
                    "interviewer_ids": {"$in": required + optional},
                    "schedule_at": {"$lt": slot_end},
                    "$expr": {"$gt": [{"$add": ["$schedule_at", {"$multiply": ["$duration_minutes", 60000]}]}, cursor]},
                }).to_list()
                busy = {i for item in conflicts for i in item.interviewer_ids}
                if not (set(required) & busy):
                    slots.append({
                        "start": cursor.isoformat(),
                        "end": slot_end.isoformat(),
                        "timezone": payload.get("timezone") or "UTC",
                        "available_interviewers": [i for i in required + optional if i not in busy],
                        "unavailable_interviewers": sorted(busy),
                        "confidence": 1 if not busy else 0.75,
                        "reason": "All required panel members are available" if not (set(required) & busy) else "Optional panel conflict",
                    })
            cursor += timedelta(minutes=duration + int(payload.get("buffer_minutes") or 15))
            if cursor.hour >= int(working["end"].split(":")[0]):
                cursor = (cursor + timedelta(days=1)).replace(hour=int(working["start"].split(":")[0]), minute=0)
        return slots

    @staticmethod
    async def schedule(company_id: str, actor_id: str, payload: dict[str, Any]) -> Interview:
        slots = await InterviewSchedulingService.propose_slots(company_id, {**payload, "date_from": payload["scheduled_start"], "date_to": payload["scheduled_end"]})
        if not slots:
            raise HTTPException(status_code=409, detail="Selected slot is no longer available")
        start = datetime.fromisoformat(str(payload["scheduled_start"]).replace("Z", "+00:00")).replace(tzinfo=None)
        interview = Interview(
            company_id=company_id,
            candidate_id=payload["candidate_id"],
            job_id=payload.get("job_id"),
            round=int(payload.get("round", 1)),
            interview_type=payload.get("interview_type", "technical"),
            interview_mode="online",
            interviewer_ids=payload.get("interviewer_ids") or payload.get("required_interviewer_ids") or [],
            required_interviewer_ids=payload.get("required_interviewer_ids") or [],
            optional_interviewer_ids=payload.get("optional_interviewer_ids") or [],
            mode="online",
            schedule_at=start,
            scheduled_at=utc_now(),
            duration_minutes=int(payload.get("duration_minutes") or 60),
            status=InterviewLifecycleStatus.SCHEDULED,
            timezone=payload.get("timezone") or "UTC",
            meeting_provider="microsoft_teams",
            meeting_url=payload.get("meeting_url"),
            meeting_link=payload.get("meeting_url"),
            candidate_email=payload.get("candidate_email"),
            created_by=actor_id,
        )
        await interview.insert()
        await record(company_id, "InterviewScheduled", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": str(interview.id)})
        return interview


class MicrosoftGraphRecruitmentService:
    @staticmethod
    async def status(company_id: str) -> dict[str, Any]:
        conn = await MicrosoftRecruitmentConnection.find_one({"company_id": company_id, "scope": "organization"})
        configured = bool(getattr(settings, "MICROSOFT_CLIENT_ID", None) and getattr(settings, "MICROSOFT_CLIENT_SECRET", None))
        return {"connected": bool(conn and conn.status == "connected"), "configured": configured, "status": conn.status if conn else "not_connected", "permissions": ["Calendars.ReadWrite", "OnlineMeetings.ReadWrite"]}

    @staticmethod
    async def connect(company_id: str, actor_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        conn = await MicrosoftRecruitmentConnection.find_one({"company_id": company_id, "scope": "organization"})
        if not conn:
            conn = MicrosoftRecruitmentConnection(company_id=company_id, owner_user_id=actor_id)
        conn.tenant_id = payload.get("tenant_id")
        conn.status = "connected" if payload.get("authorization_code") or payload.get("access_token") else "authorization_required"
        conn.error = None if conn.status == "connected" else "Microsoft authorization code is required"
        conn.updated_at = utc_now()
        await conn.save() if conn.id else await conn.insert()
        return await MicrosoftGraphRecruitmentService.status(company_id)

    @staticmethod
    async def disconnect(company_id: str) -> dict[str, Any]:
        conn = await MicrosoftRecruitmentConnection.find_one({"company_id": company_id, "scope": "organization"})
        if conn:
            conn.status = "disconnected"
            conn.access_token_encrypted = None
            conn.refresh_token_encrypted = None
            conn.updated_at = utc_now()
            await conn.save()
        return await MicrosoftGraphRecruitmentService.status(company_id)


class OfferWorkflowService:
    @staticmethod
    async def create(company_id: str, actor_id: str, payload: dict[str, Any]) -> Offer:
        candidate = await TenantRepository.get(Candidate, payload["candidate_id"], company_id)
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        offer = Offer(company_id=company_id, created_by=actor_id, offer_number=f"OFF-{utc_now().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}", **payload)
        offer.offered_ctc = payload.get("base_salary", 0) + payload.get("variable_pay", 0) + payload.get("joining_bonus", 0)
        await offer.insert()
        await record(company_id, "OfferDraftCreated", actor_id, candidate_id=offer.candidate_id, job_id=offer.job_id, payload={"offer_id": str(offer.id)})
        return offer

    @staticmethod
    async def preview(company_id: str, offer_id: str) -> dict[str, Any]:
        offer = await TenantRepository.get(Offer, offer_id, company_id)
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")
        candidate = await TenantRepository.get(Candidate, offer.candidate_id, company_id)
        variables = {
            "candidate_name": candidate.full_name if candidate else "",
            "job_title": offer.job_title or "",
            "department": offer.department or "",
            "joining_date": offer.joining_date.date().isoformat(),
            "work_location": offer.work_location or "",
            "employment_type": offer.employment_type or "",
            "base_salary": f"{offer.currency} {offer.base_salary:,.2f}",
            "variable_pay": f"{offer.currency} {offer.variable_pay:,.2f}",
            "total_compensation": f"{offer.currency} {offer.offered_ctc:,.2f}",
            "probation_period": offer.probation_period or "",
            "notice_period": offer.notice_period or "",
            "reporting_manager": offer.reporting_manager_id or "",
            "company_name": settings.COMPANY,
            "offer_expiry": offer.offer_expiry.date().isoformat() if offer.offer_expiry else "",
        }
        template = await OfferTemplate.find_one({"company_id": company_id, "is_active": True})
        body = template.body if template else "Dear {{candidate_name}},\n\nWe are pleased to offer you the role of {{job_title}} with total compensation {{total_compensation}}.\n\nRegards,\n{{company_name}}"
        missing = [k for k, v in variables.items() if f"{{{{{k}}}}}" in body and not v]
        if missing:
            raise HTTPException(status_code=400, detail={"message": "Missing offer variables", "variables": missing})
        rendered = body
        for key, value in variables.items():
            rendered = rendered.replace(f"{{{{{key}}}}}", str(value))
        offer.rendered_preview = rendered
        offer.updated_at = utc_now()
        await offer.save()
        return {"offer_id": offer_id, "preview": rendered, "variables": variables}

    @staticmethod
    async def generate_pdf(company_id: str, actor_id: str, offer_id: str) -> Offer:
        offer = await TenantRepository.get(Offer, offer_id, company_id)
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")
        preview = await OfferWorkflowService.preview(company_id, offer_id)
        content = preview["preview"].replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        pdf = f"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length {len(content)+80}>>stream\nBT /F1 12 Tf 72 720 Td ({content[:3000]}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n".encode()
        path = Path(settings.UPLOAD_DIR) / "offers"
        path.mkdir(parents=True, exist_ok=True)
        file_path = path / f"{offer.offer_number or offer_id}.pdf"
        file_path.write_bytes(pdf)
        offer.pdf_checksum = hashlib.sha256(pdf).hexdigest()
        offer.immutable_pdf_path = str(file_path)
        offer.pdf_file_id = f"/uploads/offers/{file_path.name}"
        offer.status = "ready"
        offer.updated_at = utc_now()
        await offer.save()
        await record(company_id, "OfferPdfGenerated", actor_id, candidate_id=offer.candidate_id, job_id=offer.job_id, payload={"offer_id": offer_id})
        return offer

    @staticmethod
    async def send(company_id: str, actor_id: str, offer_id: str) -> dict[str, Any]:
        offer = await TenantRepository.get(Offer, offer_id, company_id)
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")
        if offer.status not in {"ready", "sent", "delivery_failed"}:
            raise HTTPException(status_code=409, detail="Generate PDF before sending offer")
        raw = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        expiry = offer.offer_expiry or utc_now() + timedelta(days=7)
        existing = await OfferAccessToken.find_one({"company_id": company_id, "offer_id": offer_id, "revoked_at": None})
        if not existing:
            await OfferAccessToken(company_id=company_id, offer_id=offer_id, candidate_id=offer.candidate_id, token_hash=token_hash, expires_at=expiry).insert()
        offer.status = "sent"
        offer.sent_at = offer.sent_at or utc_now()
        offer.updated_at = utc_now()
        await offer.save()
        await RecruitmentService.move(await TenantRepository.get(Candidate, offer.candidate_id, company_id), CandidateStatus.OFFER_SENT, actor_id)
        await record(company_id, "OfferSent", actor_id, candidate_id=offer.candidate_id, job_id=offer.job_id, payload={"offer_id": offer_id})
        return {"offer": offer, "secure_url": f"{settings.FRONTEND_URL}/public/offers/{raw}" if not existing else None, "email_status": "queued" if settings.MAIL_USERNAME or settings.BREVO_API_KEY else "not_configured"}

    @staticmethod
    async def public_offer(token: str) -> tuple[Offer, OfferAccessToken]:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        access = await OfferAccessToken.find_one({"token_hash": token_hash, "revoked_at": None})
        if not access or access.expires_at < utc_now():
            raise HTTPException(status_code=404, detail="Offer link expired or invalid")
        offer = await Offer.get(access.offer_id)
        if not offer or offer.deleted_at or offer.status in {"withdrawn", "expired"}:
            raise HTTPException(status_code=404, detail="Offer unavailable")
        access.last_viewed_at = utc_now()
        access.attempts += 1
        await access.save()
        if not offer.viewed_at:
            offer.viewed_at = utc_now()
            offer.status = "viewed" if offer.status == "sent" else offer.status
            await offer.save()
        return offer, access

    @staticmethod
    async def decide_public(token: str, accepted: bool, payload: dict[str, Any]) -> Offer:
        offer, access = await OfferWorkflowService.public_offer(token)
        if offer.offer_expiry and offer.offer_expiry < utc_now():
            offer.status = "expired"
            await offer.save()
            raise HTTPException(status_code=409, detail="Offer expired")
        if offer.status in {"accepted", "rejected"}:
            return offer
        offer.status = "accepted" if accepted else "rejected"
        offer.accepted_at = utc_now() if accepted else None
        offer.rejected_at = utc_now() if not accepted else None
        offer.rejection_reason = payload.get("rejection_reason")
        offer.candidate_comment = payload.get("comment")
        offer.updated_at = utc_now()
        await offer.save()
        if accepted:
            candidate = await TenantRepository.get(Candidate, offer.candidate_id, offer.company_id)
            if candidate:
                await RecruitmentService.move(candidate, CandidateStatus.OFFER_ACCEPTED, None)
        await record(offer.company_id, "OfferAccepted" if accepted else "OfferRejected", None, candidate_id=offer.candidate_id, job_id=offer.job_id, payload={"offer_id": str(offer.id)})
        return offer
