from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class RAGVisibilityInput(BaseModel):
    department_id: Optional[str] = None
    project_id: Optional[str] = None
    client_id: Optional[str] = None
    allowed_user_ids: list[str] = Field(default_factory=list)
    allowed_roles: list[str] = Field(default_factory=list)


class RAGSourceResponse(BaseModel):
    source_id: str
    version_id: str
    status: str
    approval_status: str
    title: str
    document_type: str
    duplicate: bool = False
    failure_reason: Optional[str] = None


class RAGApproveSourceRequest(BaseModel):
    approve: bool = True


class RAGRetrieveRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=1000)
    project_id: Optional[str] = None
    department_id: Optional[str] = None
    client_id: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=20)


class RAGCitationResponse(BaseModel):
    citation_id: str
    source_id: str
    version_id: str
    chunk_id: str
    title: str
    location: dict[str, Any]
    excerpt: str
    score: float


class RAGRetrieveResponse(BaseModel):
    run_id: str
    answerable: bool
    no_answer_reason: Optional[str] = None
    citations: list[RAGCitationResponse] = Field(default_factory=list)


class WorkingMemoryCreateRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1, max_length=128)


class WorkingMemorySessionResponse(BaseModel):
    session_id: str
    conversation_id: str
    status: str
    version: int
    expires_at: str


class WorkingMemoryClientUpdateRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1, max_length=128)
    expected_version: Optional[int] = Field(default=None, ge=1)
    message: Optional[dict[str, Any]] = None
    current_page: Optional[str] = Field(default=None, max_length=120)
    selected_record: Optional[dict[str, Any]] = None
    current_filters: Optional[dict[str, Any]] = None
    reference_bindings: Optional[dict[str, Any]] = None
    clarification_state: Optional[dict[str, Any]] = None


class ContextPackageRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1, max_length=128)
    query: str = Field(..., min_length=2, max_length=1000)
    project_id: Optional[str] = None
    department_id: Optional[str] = None
    client_id: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=20)
    include_model_context: bool = False
