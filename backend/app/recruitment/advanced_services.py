import hashlib
import io
import re
import secrets
import time
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, UploadFile, status
from pydantic import EmailStr, TypeAdapter
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.clock import utc_now
from app.core.config import settings
from app.core.security import decrypt_sensitive_value, encrypt_sensitive_value
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
    MicrosoftOAuthState,
    MicrosoftRecruitmentConnection,
    Offer,
    OfferAccessToken,
    OfferTemplate,
    RecruitmentEmailDelivery,
    RecruitmentExternalOperation,
    RecruitmentJob,
    Resume,
    ResumeParsedProfile,
    SkillAlias,
)
from app.recruitment.repositories import TenantRepository
from app.recruitment.services import ApplicationLifecycleService, ResumeStorageService, record


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


def _email_ok(value: str) -> bool:
    try:
        TypeAdapter(EmailStr).validate_python(value)
        return True
    except Exception:
        return False


def _normalize_resume_text(text: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.replace("\x00", " ").splitlines()]
    lines = [line for line in lines if line]
    counts = {}
    for line in lines:
        if len(line) < 120:
            counts[line] = counts.get(line, 0) + 1
    filtered = [line for line in lines if counts.get(line, 0) <= 3]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(filtered)).strip()


class RecruitmentEmailService:
    @staticmethod
    async def send(
        *,
        company_id: str,
        email_type: str,
        entity_type: str,
        entity_id: str,
        to_email: str,
        subject: str,
        html: str,
        text: str,
        idempotency_key: str,
        attachments: Optional[list[dict[str, Any]]] = None,
    ) -> RecruitmentEmailDelivery:
        if not _email_ok(to_email):
            raise HTTPException(status_code=422, detail="Invalid recipient email")
        existing = await RecruitmentEmailDelivery.find_one({"company_id": company_id, "idempotency_key": idempotency_key})
        if existing and existing.status == "sent":
            return existing
        item = existing or RecruitmentEmailDelivery(
            company_id=company_id,
            idempotency_key=idempotency_key,
            email_type=email_type,
            entity_type=entity_type,
            entity_id=entity_id,
            recipient_email=to_email.lower(),
            subject=subject,
            provider="brevo" if settings.BREVO_API_KEY else "smtp",
        )
        item.status = "retrying" if item.attempts else "pending"
        item.attempts += 1
        item.updated_at = utc_now()
        await item.save() if item.id else await item.insert()
        try:
            from app.services.notification_service import EmailService

            brevo = EmailService()
            if brevo.configured:
                result = await brevo.send_email(
                    to_email=to_email,
                    subject=subject,
                    html=html,
                    text=text,
                    attachments=attachments,
                    idempotency_key=idempotency_key,
                )
                if not result.success:
                    raise RuntimeError(result.error or result.status)
                item.provider = result.provider
                item.provider_message_id = result.message_id
            else:
                from app.core.email import EMAIL_CONFIGURED, FastMail, MessageSchema, MessageType, conf

                if not EMAIL_CONFIGURED or not FastMail or not conf:
                    raise RuntimeError("Email provider not configured")
                message = MessageSchema(subject=subject, recipients=[to_email], body=html, subtype=MessageType.html)
                await FastMail(conf).send_message(message)
                item.provider = "smtp"
            item.status = "sent"
            item.sent_at = utc_now()
            item.safe_error = None
        except Exception as exc:
            item.status = "failed"
            item.safe_error = str(exc)[:300]
        item.updated_at = utc_now()
        await item.save()
        return item


class MicrosoftGraphError(RuntimeError):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


class MicrosoftGraphClient:
    base_url = "https://graph.microsoft.com/v1.0"

    def __init__(self, access_token: str, http_client: Optional[httpx.AsyncClient] = None) -> None:
        self.access_token = access_token
        self.http_client = http_client

    async def request(self, method: str, path: str, **kwargs) -> dict[str, Any]:
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.access_token}"
        headers["Content-Type"] = "application/json"
        close = self.http_client is None
        client = self.http_client or httpx.AsyncClient(timeout=30)
        try:
            for attempt in range(3):
                response = await client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)
                if response.status_code == 429 and attempt < 2:
                    await self._sleep_retry(response)
                    continue
                if response.status_code >= 400:
                    msg = "Microsoft Graph request failed"
                    try:
                        msg = response.json().get("error", {}).get("message") or msg
                    except Exception:
                        pass
                    raise MicrosoftGraphError(response.status_code, msg)
                if response.status_code == 204:
                    return {}
                return response.json()
        finally:
            if close:
                await client.aclose()

    @staticmethod
    async def _sleep_retry(response: httpx.Response) -> None:
        retry = response.headers.get("Retry-After")
        delay = min(int(retry), 10) if retry and retry.isdigit() else 2
        import asyncio

        await asyncio.sleep(delay)

    async def me(self) -> dict[str, Any]:
        return await self.request("GET", "/me")

    async def get_schedule(self, emails: list[str], start: datetime, end: datetime, timezone: str) -> dict[str, Any]:
        return await self.request(
            "POST",
            "/me/calendar/getSchedule",
            json={
                "schedules": emails,
                "startTime": {"dateTime": start.isoformat(), "timeZone": timezone},
                "endTime": {"dateTime": end.isoformat(), "timeZone": timezone},
                "availabilityViewInterval": 15,
            },
        )

    async def create_event(self, organizer: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request("POST", f"/users/{organizer}/events", json=payload)

    async def update_event(self, organizer: str, event_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self.request("PATCH", f"/users/{organizer}/events/{event_id}", json=payload)

    async def cancel_event(self, organizer: str, event_id: str, comment: str) -> dict[str, Any]:
        return await self.request("POST", f"/users/{organizer}/events/{event_id}/cancel", json={"comment": comment})


class ResumeIntelligenceService:
    allowed_ext = {".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"}
    allowed_mimes = {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "image/jpeg",
        "image/png",
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
        candidate.resume_url = resume.storage_url
        candidate.updated_at = utc_now()
        await candidate.save()
        await record(company_id, "ResumeUploaded", actor_id, candidate_id=candidate_id, payload={"resume_id": str(resume.id)})
        if Path(resume.original_filename or "").suffix.lower() in {".pdf", ".doc", ".docx", ".txt"}:
            # Parsing enriches a resume but must never turn a successfully stored
            # file into a failed upload. Scanned/password-protected PDFs may have
            # no extractable text; process_resume records that review state.
            try:
                await ResumeIntelligenceService.process_resume(company_id, str(resume.id), actor_id)
            except HTTPException:
                pass
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
            try:
                reader = PdfReader(io.BytesIO(content))
                if reader.is_encrypted:
                    raise HTTPException(status_code=400, detail="Password-protected PDF cannot be processed")
                if len(reader.pages) > 50:
                    raise HTTPException(status_code=413, detail="Resume PDF exceeds 50 page processing limit")
                page_text = []
                empty_pages = 0
                for page in reader.pages:
                    extracted = page.extract_text() or ""
                    normalized = _normalize_resume_text(extracted)
                    if not normalized:
                        empty_pages += 1
                    page_text.append(normalized)
                text = _normalize_resume_text("\n\n".join(page_text))
                if len(text) < 80 or empty_pages == len(reader.pages):
                    raise HTTPException(status_code=422, detail="PDF appears scanned or image-only; OCR is not configured")
                return text
            except HTTPException:
                raise
            except (PdfReadError, Exception) as exc:
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
            started = time.perf_counter()
            text = ResumeIntelligenceService.extract_text_from_bytes(content, resume.original_filename)
            if not text or len(text) < 40:
                raise HTTPException(status_code=400, detail="Resume has no extractable text")
            resume.parsed_text = text
            resume.extracted_text_checksum = hashlib.sha256(text.encode()).hexdigest()
            resume.processing_metadata = {
                "extraction_method": Path(resume.original_filename).suffix.lower().lstrip("."),
                "library": "pypdf" if resume.original_filename.lower().endswith(".pdf") else "python-stdlib",
                "character_count": len(text),
                "processing_duration_ms": round((time.perf_counter() - started) * 1000, 2),
            }
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
            resume.processing_status = "needs_review" if exc.status_code == 422 else "failed"
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
        if payload.get("use_microsoft", True):
            return await MicrosoftGraphRecruitmentService.propose_slots(company_id, payload)
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
        if payload.get("use_microsoft", True):
            return await MicrosoftGraphRecruitmentService.schedule_interview(company_id, actor_id, payload)
        slots = await InterviewSchedulingService.propose_slots(company_id, {**payload, "date_from": payload["scheduled_start"], "date_to": payload["scheduled_end"], "use_microsoft": False})
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
    token_url = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    authorize_url = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"

    @staticmethod
    def configured() -> bool:
        return bool(settings.MICROSOFT_CLIENT_ID and settings.MICROSOFT_CLIENT_SECRET and settings.MICROSOFT_REDIRECT_URI)

    @staticmethod
    def scopes() -> list[str]:
        return getattr(settings, "MICROSOFT_SCOPES", None) or getattr(settings, "MICROSOFT_GRAPH_SCOPES", [])

    @staticmethod
    async def status(company_id: str) -> dict[str, Any]:
        conn = await MicrosoftRecruitmentConnection.find_one({"company_id": company_id, "scope": "organization"})
        configured = MicrosoftGraphRecruitmentService.configured()
        status_value = conn.status if conn else "not_connected"
        if conn and conn.status == "connected":
            try:
                client = MicrosoftGraphClient(await MicrosoftGraphRecruitmentService.access_token(conn))
                await client.me()
            except HTTPException as exc:
                status_value = "reauthorization_required" if exc.status_code == 401 else "connection_error"
                conn.status = status_value
                conn.error = str(exc.detail)
                await conn.save()
        return {"connected": bool(conn and status_value == "connected"), "configured": configured, "status": status_value, "permissions": MicrosoftGraphRecruitmentService.scopes()}

    @staticmethod
    async def authorization_url(company_id: str, actor_id: str, redirect_after: Optional[str] = None) -> dict[str, Any]:
        if not MicrosoftGraphRecruitmentService.configured():
            raise HTTPException(status_code=503, detail="Microsoft Graph OAuth is not configured")
        raw_state = secrets.token_urlsafe(32)
        await MicrosoftOAuthState(
            company_id=company_id,
            actor_id=actor_id,
            state_hash=hashlib.sha256(raw_state.encode()).hexdigest(),
            redirect_after=redirect_after,
            expires_at=utc_now() + timedelta(minutes=10),
        ).insert()
        tenant = settings.MICROSOFT_TENANT_ID or "organizations"
        params = {
            "client_id": settings.MICROSOFT_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
            "response_mode": "query",
            "scope": " ".join(MicrosoftGraphRecruitmentService.scopes()),
            "state": raw_state,
            "prompt": "select_account",
        }
        return {"authorization_url": f"{MicrosoftGraphRecruitmentService.authorize_url.format(tenant=tenant)}?{urlencode(params)}", "expires_at": utc_now() + timedelta(minutes=10)}

    @staticmethod
    async def callback(company_id: str, actor_id: str, code: str, state: str) -> dict[str, Any]:
        state_hash = hashlib.sha256(state.encode()).hexdigest()
        saved = await MicrosoftOAuthState.find_one({"company_id": company_id, "state_hash": state_hash, "consumed_at": None})
        if not saved or saved.expires_at < utc_now() or saved.actor_id != actor_id:
            raise HTTPException(status_code=400, detail="Invalid or expired Microsoft OAuth state")
        saved.consumed_at = utc_now()
        await saved.save()
        tenant = settings.MICROSOFT_TENANT_ID or "organizations"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                MicrosoftGraphRecruitmentService.token_url.format(tenant=tenant),
                data={
                    "client_id": settings.MICROSOFT_CLIENT_ID,
                    "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
                    "scope": " ".join(MicrosoftGraphRecruitmentService.scopes()),
                },
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=400, detail="Microsoft token exchange failed")
        tokens = response.json()
        conn = await MicrosoftRecruitmentConnection.find_one({"company_id": company_id, "scope": "organization"})
        if not conn:
            conn = MicrosoftRecruitmentConnection(company_id=company_id, owner_user_id=actor_id)
        conn.tenant_id = tokens.get("tenant")
        conn.access_token_encrypted = encrypt_sensitive_value(tokens["access_token"])
        conn.refresh_token_encrypted = encrypt_sensitive_value(tokens.get("refresh_token", ""))
        conn.expires_at = utc_now() + timedelta(seconds=int(tokens.get("expires_in", 3600)) - 60)
        conn.status = "connected"
        conn.error = None
        conn.updated_at = utc_now()
        await conn.save() if conn.id else await conn.insert()
        return await MicrosoftGraphRecruitmentService.status(company_id)

    @staticmethod
    async def connect(company_id: str, actor_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if payload.get("code") and payload.get("state"):
            return await MicrosoftGraphRecruitmentService.callback(company_id, actor_id, payload["code"], payload["state"])
        return await MicrosoftGraphRecruitmentService.authorization_url(company_id, actor_id, payload.get("redirect_after"))

    @staticmethod
    async def access_token(conn: MicrosoftRecruitmentConnection) -> str:
        if conn.expires_at and conn.expires_at > utc_now() and conn.access_token_encrypted:
            return decrypt_sensitive_value(conn.access_token_encrypted)
        if not conn.refresh_token_encrypted:
            conn.status = "reauthorization_required"
            await conn.save()
            raise HTTPException(status_code=401, detail="Microsoft reauthorization required")
        tenant = settings.MICROSOFT_TENANT_ID or conn.tenant_id or "organizations"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                MicrosoftGraphRecruitmentService.token_url.format(tenant=tenant),
                data={
                    "client_id": settings.MICROSOFT_CLIENT_ID,
                    "client_secret": settings.MICROSOFT_CLIENT_SECRET,
                    "grant_type": "refresh_token",
                    "refresh_token": decrypt_sensitive_value(conn.refresh_token_encrypted),
                    "redirect_uri": settings.MICROSOFT_REDIRECT_URI,
                    "scope": " ".join(MicrosoftGraphRecruitmentService.scopes()),
                },
            )
        if response.status_code >= 400:
            conn.status = "reauthorization_required"
            conn.error = "Microsoft refresh token failed"
            await conn.save()
            raise HTTPException(status_code=401, detail="Microsoft reauthorization required")
        tokens = response.json()
        conn.access_token_encrypted = encrypt_sensitive_value(tokens["access_token"])
        if tokens.get("refresh_token"):
            conn.refresh_token_encrypted = encrypt_sensitive_value(tokens["refresh_token"])
        conn.expires_at = utc_now() + timedelta(seconds=int(tokens.get("expires_in", 3600)) - 60)
        conn.status = "connected"
        conn.error = None
        await conn.save()
        return tokens["access_token"]

    @staticmethod
    async def client(company_id: str) -> tuple[MicrosoftGraphClient, MicrosoftRecruitmentConnection]:
        conn = await MicrosoftRecruitmentConnection.find_one({"company_id": company_id, "scope": "organization", "status": "connected"})
        if not conn:
            raise HTTPException(status_code=409, detail="Microsoft account is not connected")
        return MicrosoftGraphClient(await MicrosoftGraphRecruitmentService.access_token(conn)), conn

    @staticmethod
    async def _interviewer_emails(ids: list[str]) -> dict[str, str]:
        users = {}
        for user_id in ids:
            user = await User.get(user_id)
            if not user or not user.email:
                raise HTTPException(status_code=422, detail=f"Interviewer {user_id} has no email")
            users[user_id] = user.email
        return users

    @staticmethod
    async def propose_slots(company_id: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
        client, _ = await MicrosoftGraphRecruitmentService.client(company_id)
        start = datetime.fromisoformat(str(payload.get("date_from") or utc_now().isoformat()).replace("Z", "+00:00")).replace(tzinfo=None)
        end = datetime.fromisoformat(str(payload.get("date_to") or (start + timedelta(days=7)).isoformat()).replace("Z", "+00:00")).replace(tzinfo=None)
        duration = int(payload.get("duration_minutes") or 60)
        timezone = payload.get("timezone") or "UTC"
        required = payload.get("required_interviewer_ids") or payload.get("interviewer_ids") or []
        optional = payload.get("optional_interviewer_ids") or []
        emails_by_id = await MicrosoftGraphRecruitmentService._interviewer_emails(required + optional)
        graph = await client.get_schedule(list(emails_by_id.values()), start, end, timezone)
        busy_by_email = {item.get("scheduleId"): item.get("scheduleItems", []) for item in graph.get("value", [])}
        working = payload.get("working_hours") or {"start": "09:00", "end": "17:00"}
        slots = []
        cursor = start.replace(hour=int(working["start"].split(":")[0]), minute=0, second=0, microsecond=0)
        notice_minutes = int(payload.get("minimum_notice_minutes") or 60)
        while cursor < end and len(slots) < 12:
            slot_end = cursor + timedelta(minutes=duration)
            unavailable = []
            for user_id, email in emails_by_id.items():
                for item in busy_by_email.get(email, []):
                    status_value = item.get("status")
                    busy_start = datetime.fromisoformat(item["start"]["dateTime"].replace("Z", "+00:00")).replace(tzinfo=None)
                    busy_end = datetime.fromisoformat(item["end"]["dateTime"].replace("Z", "+00:00")).replace(tzinfo=None)
                    if status_value in {"busy", "tentative", "oof", "workingElsewhere"} and busy_start < slot_end and busy_end > cursor:
                        unavailable.append(user_id)
                        break
            if cursor.weekday() < 5 and cursor > utc_now() + timedelta(minutes=notice_minutes) and not (set(required) & set(unavailable)):
                slots.append({
                    "start": cursor.isoformat(),
                    "end": slot_end.isoformat(),
                    "timezone": timezone,
                    "available_interviewers": [i for i in required + optional if i not in unavailable],
                    "unavailable_interviewers": unavailable,
                    "confidence": 1 if not unavailable else 0.75,
                    "reason": "Microsoft Graph free/busy confirms required panel availability",
                })
            cursor += timedelta(minutes=duration + int(payload.get("buffer_minutes") or 15))
            if cursor.hour >= int(working["end"].split(":")[0]):
                cursor = (cursor + timedelta(days=1)).replace(hour=int(working["start"].split(":")[0]), minute=0)
        return slots

    @staticmethod
    async def schedule_interview(company_id: str, actor_id: str, payload: dict[str, Any]) -> Interview:
        client, conn = await MicrosoftGraphRecruitmentService.client(company_id)
        start = datetime.fromisoformat(str(payload["scheduled_start"]).replace("Z", "+00:00")).replace(tzinfo=None)
        end = datetime.fromisoformat(str(payload.get("scheduled_end") or (start + timedelta(minutes=int(payload.get("duration_minutes") or 60))).isoformat()).replace("Z", "+00:00")).replace(tzinfo=None)
        slots = await MicrosoftGraphRecruitmentService.propose_slots(company_id, {**payload, "date_from": start.isoformat(), "date_to": end.isoformat()})
        if not slots or slots[0]["start"] != start.isoformat():
            raise HTTPException(status_code=409, detail="Selected slot is no longer available")
        idempotency_key = payload.get("idempotency_key") or f"teams:{company_id}:{payload['candidate_id']}:{start.isoformat()}:{','.join(payload.get('interviewer_ids') or payload.get('required_interviewer_ids') or [])}"
        op = await RecruitmentExternalOperation.find_one({"company_id": company_id, "idempotency_key": idempotency_key})
        if op and op.status == "completed" and op.response.get("interview_id"):
            existing = await TenantRepository.get(Interview, op.response["interview_id"], company_id)
            if existing:
                return existing
        op = op or RecruitmentExternalOperation(company_id=company_id, idempotency_key=idempotency_key, provider="microsoft_graph", operation_type="create_event", entity_type="interview", entity_id=payload["candidate_id"])
        op.attempts += 1
        await op.save() if op.id else await op.insert()
        interviewer_ids = payload.get("interviewer_ids") or payload.get("required_interviewer_ids") or []
        emails_by_id = await MicrosoftGraphRecruitmentService._interviewer_emails(interviewer_ids)
        candidate_email = payload.get("candidate_email")
        attendees = [{"emailAddress": {"address": email}, "type": "required"} for email in emails_by_id.values()]
        if candidate_email:
            attendees.append({"emailAddress": {"address": candidate_email}, "type": "required"})
        organizer = payload.get("organizer_email") or next(iter(emails_by_id.values()))
        event = await client.create_event(organizer, {
            "subject": payload.get("title") or "Interview",
            "body": {"contentType": "HTML", "content": payload.get("agenda") or "Interview scheduled from SynTask."},
            "start": {"dateTime": start.isoformat(), "timeZone": payload.get("timezone") or "UTC"},
            "end": {"dateTime": end.isoformat(), "timeZone": payload.get("timezone") or "UTC"},
            "attendees": attendees,
            "isOnlineMeeting": True,
            "onlineMeetingProvider": "teamsForBusiness",
        })
        interview = Interview(
            company_id=company_id,
            candidate_id=payload["candidate_id"],
            job_id=payload.get("job_id"),
            round=int(payload.get("round", 1)),
            interview_type=payload.get("interview_type", "technical"),
            interview_mode="online",
            interviewer_ids=interviewer_ids,
            required_interviewer_ids=payload.get("required_interviewer_ids") or interviewer_ids,
            optional_interviewer_ids=payload.get("optional_interviewer_ids") or [],
            mode="online",
            schedule_at=start,
            scheduled_at=utc_now(),
            duration_minutes=int(payload.get("duration_minutes") or 60),
            status=InterviewLifecycleStatus.SCHEDULED,
            timezone=payload.get("timezone") or "UTC",
            meeting_provider="microsoft_teams",
            meeting_url=(event.get("onlineMeeting") or {}).get("joinUrl"),
            meeting_link=(event.get("onlineMeeting") or {}).get("joinUrl"),
            external_event_id=event.get("id"),
            external_meeting_id=(event.get("onlineMeeting") or {}).get("conferenceId"),
            organizer_id=organizer,
            candidate_email=candidate_email,
            interviewer_responses={user_id: "none" for user_id in interviewer_ids},
            created_by=actor_id,
        )
        await interview.insert()
        op.status = "completed"
        op.external_id = event.get("id")
        op.response = {"interview_id": str(interview.id), "join_url_present": bool(interview.meeting_url)}
        op.updated_at = utc_now()
        await op.save()
        await RecruitmentEmailService.send(
            company_id=company_id,
            email_type="candidate_interview_invitation",
            entity_type="interview",
            entity_id=str(interview.id),
            to_email=candidate_email,
            subject=f"Interview invitation: {payload.get('title') or 'Interview'}",
            html=f"<p>Your interview is scheduled for {start.isoformat()} {interview.timezone}.</p><p><a href='{interview.meeting_url}'>Join Microsoft Teams meeting</a></p>",
            text=f"Your interview is scheduled for {start.isoformat()} {interview.timezone}. Teams: {interview.meeting_url}",
            idempotency_key=f"interview-invite:candidate:{interview.id}",
        ) if candidate_email else None
        for user_id, email in emails_by_id.items():
            await RecruitmentEmailService.send(
                company_id=company_id,
                email_type="interviewer_invitation",
                entity_type="interview",
                entity_id=str(interview.id),
                to_email=email,
                subject=f"Interview panel: {payload.get('title') or 'Interview'}",
                html=f"<p>Interview scheduled for {start.isoformat()} {interview.timezone}.</p><p><a href='{interview.meeting_url}'>Join Microsoft Teams meeting</a></p>",
                text=f"Interview scheduled for {start.isoformat()} {interview.timezone}. Teams: {interview.meeting_url}",
                idempotency_key=f"interview-invite:{user_id}:{interview.id}",
            )
        await record(company_id, "InterviewScheduled", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": str(interview.id), "external_event_id": event.get("id")})
        return interview

    @staticmethod
    async def reschedule_interview(company_id: str, actor_id: str, interview: Interview, schedule_at: datetime, duration_minutes: Optional[int], reason: Optional[str]) -> Interview:
        if not interview.external_event_id or not interview.organizer_id:
            return interview
        client, _ = await MicrosoftGraphRecruitmentService.client(company_id)
        end = schedule_at + timedelta(minutes=duration_minutes or interview.duration_minutes)
        await client.update_event(interview.organizer_id, interview.external_event_id, {
            "start": {"dateTime": schedule_at.isoformat(), "timeZone": interview.timezone},
            "end": {"dateTime": end.isoformat(), "timeZone": interview.timezone},
            "body": {"contentType": "HTML", "content": reason or "Interview rescheduled from SynTask."},
        })
        interview.schedule_at = schedule_at
        interview.duration_minutes = duration_minutes or interview.duration_minutes
        interview.status = InterviewLifecycleStatus.SCHEDULED
        interview.updated_at = utc_now()
        await interview.save()
        await record(company_id, "InterviewRescheduled", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": str(interview.id)})
        return interview

    @staticmethod
    async def cancel_interview(company_id: str, actor_id: str, interview: Interview, reason: Optional[str]) -> Interview:
        if interview.external_event_id and interview.organizer_id:
            client, _ = await MicrosoftGraphRecruitmentService.client(company_id)
            await client.cancel_event(interview.organizer_id, interview.external_event_id, reason or "Cancelled from SynTask")
        interview.status = InterviewLifecycleStatus.CANCELLED
        interview.cancelled_by = actor_id
        interview.cancellation_reason = reason
        interview.updated_at = utc_now()
        await interview.save()
        await record(company_id, "InterviewCancelled", actor_id, candidate_id=interview.candidate_id, job_id=interview.job_id, payload={"interview_id": str(interview.id)})
        return interview

    @staticmethod
    async def attendee_status(company_id: str, interview: Interview) -> dict[str, Any]:
        if interview.external_event_id and interview.organizer_id:
            client, _ = await MicrosoftGraphRecruitmentService.client(company_id)
            event = await client.request("GET", f"/users/{interview.organizer_id}/events/{interview.external_event_id}")
            responses = {}
            for attendee in event.get("attendees", []):
                email = (attendee.get("emailAddress") or {}).get("address")
                responses[email] = (attendee.get("status") or {}).get("response")
            interview.interviewer_responses = responses
            await interview.save()
        return {"candidate_response": interview.candidate_response, "interviewer_responses": interview.interviewer_responses, "provider": interview.meeting_provider}

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
        application = await TenantRepository.get(Application, payload["application_id"], company_id)
        if not application:
            raise HTTPException(status_code=404, detail="Application not found")
        candidate = await TenantRepository.get(Candidate, application.candidate_id, company_id)
        job = await TenantRepository.get(RecruitmentJob, application.job_id, company_id)
        if not candidate or not job:
            raise HTTPException(status_code=409, detail="Application has invalid candidate or job context")
        values = {**payload, "candidate_id": application.candidate_id, "job_id": application.job_id,
                  "job_title": job.title, "department": job.department_id,
                  "work_location": payload.get("work_location") or job.location,
                  "employment_type": payload.get("employment_type") or job.employment_type.value}
        offer = Offer(company_id=company_id, created_by=actor_id, offer_number=f"OFF-{utc_now().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}", **values)
        offer.offered_ctc = payload.get("base_salary", 0) + payload.get("variable_pay", 0) + payload.get("joining_bonus", 0)
        await offer.insert()
        await record(company_id, "OfferDraftCreated", actor_id, candidate_id=offer.candidate_id, application_id=offer.application_id, job_id=offer.job_id, payload={"offer_id": str(offer.id)})
        return offer

    @staticmethod
    async def preview(company_id: str, offer_id: str) -> dict[str, Any]:
        offer = await TenantRepository.get(Offer, offer_id, company_id)
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")
        if offer.status not in {"approved", "ready"}:
            raise HTTPException(status_code=409, detail="Approve offer before PDF generation")
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
        path = Path(settings.UPLOAD_DIR) / "offers"
        path.mkdir(parents=True, exist_ok=True)
        version = int(time.time())
        file_path = path / f"{offer.offer_number or offer_id}-v{version}.pdf"
        doc = SimpleDocTemplate(str(file_path), pagesize=A4, rightMargin=20 * mm, leftMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm)
        styles = getSampleStyleSheet()
        story = [
            Paragraph(settings.COMPANY, styles["Title"]),
            Paragraph(f"Offer Letter: {offer.offer_number or offer_id}", styles["Heading2"]),
            Spacer(1, 6 * mm),
            Paragraph(preview["preview"].replace("\n", "<br/>"), styles["BodyText"]),
            Spacer(1, 6 * mm),
            Table(
                [
                    ["Component", "Amount"],
                    ["Base salary", f"{offer.currency} {offer.base_salary:,.2f}"],
                    ["Variable pay", f"{offer.currency} {offer.variable_pay:,.2f}"],
                    ["Joining bonus", f"{offer.currency} {offer.joining_bonus:,.2f}"],
                    ["Total compensation", f"{offer.currency} {offer.offered_ctc:,.2f}"],
                ],
                colWidths=[90 * mm, 70 * mm],
                style=TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("PADDING", (0, 0), (-1, -1), 8),
                ]),
            ),
            Spacer(1, 8 * mm),
            Paragraph("Terms and conditions, signature, and acceptance are governed by the approved offer record in SynTask.", styles["BodyText"]),
            Spacer(1, 12 * mm),
            Paragraph("Authorized Signature: ____________________________", styles["BodyText"]),
        ]
        doc.build(story)
        pdf = file_path.read_bytes()
        offer.pdf_checksum = hashlib.sha256(pdf).hexdigest()
        offer.immutable_pdf_path = str(file_path)
        offer.pdf_file_id = f"/uploads/offers/{file_path.name}"
        offer.status = "ready"
        offer.updated_at = utc_now()
        await offer.save()
        await record(company_id, "OfferPdfGenerated", actor_id, candidate_id=offer.candidate_id, job_id=offer.job_id, payload={"offer_id": offer_id})
        return offer

    @staticmethod
    async def upload_letter(company_id: str, actor_id: str, offer_id: str, file: UploadFile) -> Offer:
        offer = await TenantRepository.get(Offer, offer_id, company_id)
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")
        filename = Path(file.filename or "offer-letter").name
        suffix = Path(filename).suffix.lower()
        content_type = (file.content_type or "").lower()
        allowed_suffixes = {".pdf", ".jpg", ".jpeg", ".png"}
        allowed_types = {"application/pdf", "image/jpeg", "image/png"}
        if suffix not in allowed_suffixes and content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Offer letter must be a PDF, JPG, or PNG file")
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Offer letter file is empty")
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Offer letter file is too large")
        path = Path(settings.UPLOAD_DIR) / "offers"
        path.mkdir(parents=True, exist_ok=True)
        checksum = hashlib.sha256(content).hexdigest()
        version = int(time.time())
        stored_suffix = suffix or ".pdf"
        file_path = path / f"{offer.offer_number or offer_id}-uploaded-v{version}{stored_suffix}"
        file_path.write_bytes(content)
        offer.pdf_checksum = checksum
        offer.immutable_pdf_path = str(file_path)
        offer.pdf_file_id = f"/uploads/offers/{file_path.name}"
        offer.status = "ready"
        offer.updated_at = utc_now()
        await offer.save()
        await record(company_id, "OfferLetterUploaded", actor_id, candidate_id=offer.candidate_id, job_id=offer.job_id, payload={"offer_id": offer_id, "filename": filename, "checksum": checksum})
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
            existing = await OfferAccessToken(company_id=company_id, offer_id=offer_id, candidate_id=offer.candidate_id, token_hash=token_hash, access_token_encrypted=encrypt_sensitive_value(raw), expires_at=expiry).insert()
        elif not existing.access_token_encrypted:
            existing.revoked_at = utc_now()
            await existing.save()
            existing = await OfferAccessToken(company_id=company_id, offer_id=offer_id, candidate_id=offer.candidate_id, token_hash=token_hash, access_token_encrypted=encrypt_sensitive_value(raw), expires_at=expiry).insert()
        else:
            raw = decrypt_sensitive_value(existing.access_token_encrypted)
        offer.status = "sent"
        offer.sent_at = offer.sent_at or utc_now()
        offer.updated_at = utc_now()
        await offer.save()
        if not offer.application_id:
            raise HTTPException(status_code=409, detail={"code": "APPLICATION_CONTEXT_REQUIRED", "message": "Offer must be linked to an application before it can be sent."})
        await ApplicationLifecycleService.transition(company_id, offer.application_id, CandidateStatus.OFFER_SENT, actor_id,
                                                     allow_offer_transition=True)
        candidate = await TenantRepository.get(Candidate, offer.candidate_id, company_id)
        secure_url = f"{settings.FRONTEND_URL}/public/offers/{raw}"
        delivery = None
        if candidate and candidate.email and secure_url:
            delivery = await RecruitmentEmailService.send(
                company_id=company_id,
                email_type="offer_letter",
                entity_type="offer",
                entity_id=offer_id,
                to_email=candidate.email,
                subject=f"Offer letter: {offer.job_title or 'SynTask offer'}",
                html=f"<p>Dear {candidate.full_name},</p><p>Your offer letter is ready.</p><p><a href='{secure_url}'>View secure offer</a></p><p>Offer expires: {expiry.date().isoformat()}</p>",
                text=f"Your offer letter is ready: {secure_url}\nOffer expires: {expiry.date().isoformat()}",
                idempotency_key=f"offer-send:{offer_id}:{candidate.email}",
            )
        await record(company_id, "OfferSent", actor_id, candidate_id=offer.candidate_id, application_id=offer.application_id, job_id=offer.job_id, payload={"offer_id": offer_id})
        return {"offer": offer, "secure_url": secure_url, "email_status": delivery.status if delivery else "not_sent"}

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
        if not offer.application_id:
            raise HTTPException(status_code=409, detail={"code": "APPLICATION_CONTEXT_REQUIRED", "message": "Offer is missing application context."})
        if accepted:
            candidate = await TenantRepository.get(Candidate, offer.candidate_id, offer.company_id)
            await ApplicationLifecycleService.transition(offer.company_id, offer.application_id, CandidateStatus.OFFER_ACCEPTED, None,
                                                         allow_offer_transition=True)
            if candidate and candidate.assigned_recruiter_id:
                recruiter = await User.get(candidate.assigned_recruiter_id)
                if recruiter and recruiter.email:
                    await RecruitmentEmailService.send(
                        company_id=offer.company_id,
                        email_type="offer_accepted_notification",
                        entity_type="offer",
                        entity_id=str(offer.id),
                        to_email=recruiter.email,
                        subject=f"Offer accepted: {candidate.full_name}",
                        html=f"<p>{candidate.full_name} accepted the offer for {offer.job_title or 'the role'}.</p>",
                        text=f"{candidate.full_name} accepted the offer.",
                        idempotency_key=f"offer-accepted:{offer.id}:{recruiter.email}",
                    )
        else:
            await ApplicationLifecycleService.transition(offer.company_id, offer.application_id, CandidateStatus.WITHDRAWN, None,
                                                         reason=payload.get("rejection_reason") or "Offer declined")
        await record(offer.company_id, "OfferAccepted" if accepted else "OfferRejected", None, candidate_id=offer.candidate_id, application_id=offer.application_id, job_id=offer.job_id, payload={"offer_id": str(offer.id)})
        return offer
