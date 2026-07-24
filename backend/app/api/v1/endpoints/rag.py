from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.api.dependencies import get_current_user
from app.models.user import User
from app.rag.permissions import resolve_rag_scope
from app.rag.retrieval import RAGRetrievalService
from app.rag.schemas import (
    ContextPackageRequest,
    RAGApproveSourceRequest,
    RAGRetrieveRequest,
    RAGRetrieveResponse,
    RAGSourceResponse,
    RAGVisibilityInput,
    WorkingMemoryClientUpdateRequest,
    WorkingMemoryCreateRequest,
    WorkingMemorySessionResponse,
)
from app.rag.source_registry import source_registry
from app.worker.tasks.rag_tasks import process_rag_source_version
from app.rag.models import RAGKnowledgeSourceVersion
from app.rag.qdrant_store import QdrantUnavailable
from app.core.config import settings
from app.rag.context_package import ContextPackageBuilder, sanitize_for_model_context
from app.rag.feedback import RAGFeedbackInput, RAGFeedbackService
from app.rag.governance import RAGGovernanceService
from app.rag.working_memory import ClientWorkingMemoryUpdate, WorkingMemoryConflict, WorkingMemoryService, WorkingMemoryUnavailable

router = APIRouter()
working_memory_service = WorkingMemoryService()
context_package_builder = ContextPackageBuilder(working_memory_service=working_memory_service)
governance_service = RAGGovernanceService()
feedback_service = RAGFeedbackService()


def _require_rag_enabled() -> None:
    if not settings.RAG_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="RAG is disabled")


def _session_response(snapshot) -> WorkingMemorySessionResponse:
    return WorkingMemorySessionResponse(
        session_id=snapshot.session_id,
        conversation_id=snapshot.conversation_id,
        status=snapshot.status,
        version=snapshot.version,
        expires_at=snapshot.expires_at.isoformat(),
    )


def _source_response(source, version_id: str = "") -> RAGSourceResponse:
    return RAGSourceResponse(
        source_id=source.source_id,
        version_id=version_id,
        status=source.status.value if hasattr(source.status, "value") else str(source.status),
        approval_status=source.approval_status,
        title=source.title,
        document_type=source.document_type.value if hasattr(source.document_type, "value") else str(source.document_type),
        failure_reason=source.failure_reason,
    )


@router.get("/sources")
async def list_rag_sources(
    department_id: str | None = None,
    project_id: str | None = None,
    client_id: str | None = None,
    source_type: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    approval_status: str | None = None,
    owner_id: str | None = None,
    confidentiality_level: str | None = None,
    document_type: str | None = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    _require_rag_enabled()
    filters = {
        "department_id": department_id,
        "project_id": project_id,
        "client_id": client_id,
        "source_type": source_type,
        "status": status_filter,
        "approval_status": approval_status,
        "owner_id": owner_id,
        "confidentiality_level": confidentiality_level,
        "document_type": document_type,
    }
    return await governance_service.list_sources(current_user=current_user, filters=filters, skip=skip, limit=min(limit, 100))


@router.get("/sources/{source_id}/chunks")
async def preview_rag_source_chunks(source_id: str, limit: int = 5, current_user: User = Depends(get_current_user)):
    _require_rag_enabled()
    return {"chunks": await governance_service.preview_chunks(current_user=current_user, source_id=source_id, limit=min(limit, 20))}


@router.get("/sources/{source_id}/versions")
async def list_rag_source_versions(source_id: str, current_user: User = Depends(get_current_user)):
    _require_rag_enabled()
    return {"versions": await governance_service.versions(current_user=current_user, source_id=source_id)}


@router.get("/sources/{source_id}/citations")
async def list_rag_source_citations(source_id: str, current_user: User = Depends(get_current_user)):
    _require_rag_enabled()
    return {"citations": await governance_service.citations(current_user=current_user, source_id=source_id)}


@router.post("/sources/{source_id}/reject", response_model=RAGSourceResponse)
async def reject_rag_source(source_id: str, payload: dict[str, Any], current_user: User = Depends(get_current_user)):
    _require_rag_enabled()
    source = await governance_service.reject(current_user=current_user, source_id=source_id, reason=str(payload.get("reason") or "Rejected"))
    return _source_response(source)


@router.post("/sources/{source_id}/disable", response_model=RAGSourceResponse)
async def disable_rag_source(source_id: str, current_user: User = Depends(get_current_user)):
    _require_rag_enabled()
    source = await governance_service.disable_source(current_user=current_user, source_id=source_id)
    return _source_response(source)


@router.post("/feedback")
async def submit_rag_feedback(payload: RAGFeedbackInput, current_user: User = Depends(get_current_user)):
    _require_rag_enabled()
    feedback = await feedback_service.submit(current_user=current_user, payload=payload)
    return {"feedback_id": feedback.feedback_id, "review_status": feedback.review_status}


@router.post("/sources/upload", response_model=RAGSourceResponse)
async def upload_rag_source(
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None),
    department_id: str | None = Form(default=None),
    client_id: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
):
    _require_rag_enabled()
    visibility = RAGVisibilityInput(project_id=project_id, department_id=department_id, client_id=client_id).model_dump()
    scope = await resolve_rag_scope(current_user, project_id=project_id, department_id=department_id, client_id=client_id, visibility=visibility)
    source, version, duplicate = await source_registry.create_manual_upload(
        current_user=current_user,
        scope=scope,
        file=file,
        visibility=visibility,
    )
    return RAGSourceResponse(
        source_id=source.source_id,
        version_id=version.version_id if version else "",
        status=source.status.value if hasattr(source.status, "value") else str(source.status),
        approval_status=source.approval_status,
        title=source.title,
        document_type=source.document_type.value if hasattr(source.document_type, "value") else str(source.document_type),
        duplicate=duplicate,
        failure_reason=source.failure_reason,
    )


@router.post("/sources/{source_id}/approval", response_model=RAGSourceResponse)
async def approve_rag_source(
    source_id: str,
    payload: RAGApproveSourceRequest,
    current_user: User = Depends(get_current_user),
):
    _require_rag_enabled()
    if not payload.approve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Milestone 1 supports approval activation only")
    source = await source_registry.approve_source(source_id=source_id, current_user=current_user)
    version = await RAGKnowledgeSourceVersion.find_one(RAGKnowledgeSourceVersion.source_id == source.source_id)
    if version:
        process_rag_source_version.delay(source.source_id, version.version_id)
    return RAGSourceResponse(
        source_id=source.source_id,
        version_id=version.version_id if version else "",
        status=source.status.value if hasattr(source.status, "value") else str(source.status),
        approval_status=source.approval_status,
        title=source.title,
        document_type=source.document_type.value if hasattr(source.document_type, "value") else str(source.document_type),
    )


@router.delete("/sources/{source_id}", response_model=RAGSourceResponse)
async def delete_rag_source(
    source_id: str,
    current_user: User = Depends(get_current_user),
):
    _require_rag_enabled()
    source = await source_registry.retire_source(source_id=source_id, current_user=current_user, deleted=True)
    version = await RAGKnowledgeSourceVersion.find_one(RAGKnowledgeSourceVersion.source_id == source.source_id)
    return RAGSourceResponse(
        source_id=source.source_id,
        version_id=version.version_id if version else "",
        status=source.status.value if hasattr(source.status, "value") else str(source.status),
        approval_status=source.approval_status,
        title=source.title,
        document_type=source.document_type.value if hasattr(source.document_type, "value") else str(source.document_type),
        failure_reason=source.failure_reason,
    )


@router.post("/retrieve", response_model=RAGRetrieveResponse)
async def retrieve_rag_context(
    payload: RAGRetrieveRequest,
    current_user: User = Depends(get_current_user),
):
    _require_rag_enabled()
    scope = await resolve_rag_scope(
        current_user,
        project_id=payload.project_id,
        department_id=payload.department_id,
        client_id=payload.client_id,
    )
    try:
        service = RAGRetrievalService()
        return await service.retrieve(scope=scope, query=payload.query, top_k=payload.top_k)
    except QdrantUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/working-memory/sessions", response_model=WorkingMemorySessionResponse)
async def create_working_memory_session(
    payload: WorkingMemoryCreateRequest,
    current_user: User = Depends(get_current_user),
):
    _require_rag_enabled()
    scope = await resolve_rag_scope(current_user)
    try:
        snapshot = await working_memory_service.create_session(scope=scope, conversation_id=payload.conversation_id)
        return _session_response(snapshot)
    except WorkingMemoryUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.patch("/working-memory/sessions/{session_id}", response_model=WorkingMemorySessionResponse)
async def update_working_memory_session(
    session_id: str,
    payload: WorkingMemoryClientUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    _require_rag_enabled()
    scope = await resolve_rag_scope(current_user)
    try:
        snapshot = await working_memory_service.update_client_state(
            scope=scope,
            session_id=session_id,
            update=ClientWorkingMemoryUpdate(**payload.model_dump()),
        )
        return _session_response(snapshot)
    except WorkingMemoryConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except WorkingMemoryUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.delete("/working-memory/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_working_memory_session(
    session_id: str,
    conversation_id: str,
    current_user: User = Depends(get_current_user),
):
    _require_rag_enabled()
    scope = await resolve_rag_scope(current_user)
    try:
        await working_memory_service.delete_session(scope=scope, session_id=session_id, conversation_id=conversation_id)
    except WorkingMemoryUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.post("/working-memory/sessions/{session_id}/context-package")
async def build_context_package(
    session_id: str,
    payload: ContextPackageRequest,
    current_user: User = Depends(get_current_user),
):
    _require_rag_enabled()
    scope = await resolve_rag_scope(
        current_user,
        project_id=payload.project_id,
        department_id=payload.department_id,
        client_id=payload.client_id,
    )
    try:
        package = await context_package_builder.build(
            scope=scope,
            session_id=session_id,
            conversation_id=payload.conversation_id,
            query=payload.query,
            top_k=payload.top_k,
        )
    except WorkingMemoryUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    response = {"context_package": package.model_dump(mode="json")}
    if payload.include_model_context:
        response["model_context"] = sanitize_for_model_context(package).model_dump(mode="json")
    return response
