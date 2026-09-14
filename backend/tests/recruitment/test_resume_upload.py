from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile

from app.recruitment import advanced_services
from app.recruitment.advanced_services import ResumeIntelligenceService


@pytest.mark.asyncio
async def test_pdf_upload_succeeds_when_optional_parsing_needs_review(monkeypatch):
    """A stored PDF must not be rejected solely because text extraction fails."""
    candidate = SimpleNamespace(resume_id=None, resume_url=None, updated_at=None)

    async def save_candidate():
        return None

    candidate.save = save_candidate
    resume = SimpleNamespace(id="resume-1", original_filename="candidate.pdf", storage_url="/uploads/resumes/candidate.pdf")

    async def get_candidate(*_args, **_kwargs):
        return candidate

    async def store_resume(*_args, **_kwargs):
        return SimpleNamespace(resume_id="resume-1")

    async def get_resume(*_args, **_kwargs):
        return resume

    async def parsing_requires_review(*_args, **_kwargs):
        raise HTTPException(status_code=422, detail="PDF appears scanned or image-only")

    async def record_event(*_args, **_kwargs):
        return None

    monkeypatch.setattr(advanced_services.TenantRepository, "get", staticmethod(get_candidate))
    monkeypatch.setattr(advanced_services.ResumeStorageService, "upload_resume", staticmethod(store_resume))
    monkeypatch.setattr(advanced_services.Resume, "get", staticmethod(get_resume))
    monkeypatch.setattr(ResumeIntelligenceService, "process_resume", staticmethod(parsing_requires_review))
    monkeypatch.setattr(advanced_services, "record", record_event)

    uploaded = UploadFile(filename="candidate.pdf", file=BytesIO(b"%PDF-1.7 scanned"))
    result = await ResumeIntelligenceService.upload_resume("company-1", "user-1", "candidate-1", uploaded)

    assert result is resume
    assert candidate.resume_id == "resume-1"
    assert candidate.resume_url == "/uploads/resumes/candidate.pdf"
