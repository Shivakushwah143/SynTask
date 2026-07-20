from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.dependencies import get_current_user
from app.models.user import User
from app.rag.permissions import resolve_rag_scope
from app.rag.retrieval import RAGRetrievalService
from app.rag.schemas import (
    RAGApproveSourceRequest,
    RAGRetrieveRequest,
    RAGRetrieveResponse,
    RAGSourceResponse,
    RAGVisibilityInput,
)
from app.rag.source_registry import source_registry
from app.worker.tasks.rag_tasks import process_rag_source_version
from app.rag.models import RAGKnowledgeSourceVersion
from app.rag.qdrant_store import QdrantUnavailable
from app.core.config import settings

router = APIRouter()


def _require_rag_enabled() -> None:
    if not settings.RAG_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="RAG is disabled")


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
