from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from beanie import Document, Indexed
from pydantic import BaseModel, Field


class RAGFeedback(Document):
    feedback_id: Indexed(str)
    company_id: Indexed(str)
    tenant_id: Indexed(str)
    user_id: Indexed(str)
    run_id: Indexed(str)
    output_id: str | None = None
    profile_version: str | None = None
    prompt_version: str | None = None
    provider_version: str | None = None
    rating: str
    reason: str | None = None
    incorrect_citation_ids: list[str] = Field(default_factory=list)
    unsafe_reported: bool = False
    review_status: str = "pending"
    audit_history: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "rag_feedback"
        indexes = ["feedback_id", "company_id", "run_id", "user_id", "review_status"]


class RAGFeedbackInput(BaseModel):
    run_id: str
    output_id: str | None = None
    rating: str
    reason: str | None = None
    incorrect_citation_ids: list[str] = Field(default_factory=list)
    unsafe_reported: bool = False
    versions: dict[str, str] = Field(default_factory=dict)


class RAGFeedbackService:
    async def submit(self, *, current_user, payload: RAGFeedbackInput) -> RAGFeedback:
        if payload.rating not in {"useful", "not_useful"}:
            raise ValueError("rating must be useful or not_useful")
        feedback = RAGFeedback(
            feedback_id=str(uuid4()),
            company_id=current_user.company_id,
            tenant_id=current_user.company_id,
            user_id=str(current_user.id),
            run_id=payload.run_id,
            output_id=payload.output_id,
            profile_version=payload.versions.get("profile_version"),
            prompt_version=payload.versions.get("prompt_version"),
            provider_version=payload.versions.get("provider_version"),
            rating=payload.rating,
            reason=payload.reason,
            incorrect_citation_ids=payload.incorrect_citation_ids,
            unsafe_reported=payload.unsafe_reported,
            audit_history=[{"event": "feedback_submitted", "at": datetime.utcnow().isoformat()}],
        )
        await feedback.insert()
        return feedback
