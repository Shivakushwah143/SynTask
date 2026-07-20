from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.rag.models import RAGDocumentType, RAGKnowledgeSource, RAGKnowledgeSourceVersion, RAGSourceStatus
from app.rag.parsers import detect_prompt_injection, parse_document
from app.rag.permissions import RAGScope, can_approve_source
from app.models.user import User


def checksum_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def document_type_for(filename: str) -> RAGDocumentType:
    ext = Path(filename or "").suffix.lower()
    if ext == ".txt":
        return RAGDocumentType.TXT
    if ext in {".md", ".markdown"}:
        return RAGDocumentType.MARKDOWN
    if ext == ".pdf":
        return RAGDocumentType.PDF
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only TXT, Markdown and PDF are supported in Milestone 1")


class RAGSourceRegistry:
    @staticmethod
    def upload_root() -> Path:
        root = Path(__file__).resolve().parents[2] / settings.UPLOAD_DIR / "rag"
        root.mkdir(parents=True, exist_ok=True)
        return root

    async def create_manual_upload(
        self,
        *,
        current_user: User,
        scope: RAGScope,
        file: UploadFile,
        visibility: dict,
    ) -> tuple[RAGKnowledgeSource, RAGKnowledgeSourceVersion, bool]:
        content = await file.read()
        max_size = min(settings.MAX_UPLOAD_SIZE, settings.RAG_MAX_UPLOAD_SIZE)
        if len(content) > max_size:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds maximum RAG upload size")
        document_type = document_type_for(file.filename or "")
        from app.services.file_service import FileService

        FileService.validate_uploaded_file(file.filename or "", content)
        checksum = checksum_bytes(content)
        duplicate = await RAGKnowledgeSource.find_one(
            RAGKnowledgeSource.company_id == scope.company_id,
            RAGKnowledgeSource.checksum == checksum,
            RAGKnowledgeSource.status != RAGSourceStatus.DELETED,
        )
        if duplicate:
            version = await RAGKnowledgeSourceVersion.find_one(
                RAGKnowledgeSourceVersion.company_id == scope.company_id,
                RAGKnowledgeSourceVersion.source_id == duplicate.source_id,
            )
            return duplicate, version, True

        source_id = str(uuid4())
        version_id = str(uuid4())
        filename = f"{version_id}{Path(file.filename or '').suffix.lower()}"
        path = self.upload_root() / filename
        path.write_bytes(content)

        source = RAGKnowledgeSource(
            source_id=source_id,
            company_id=scope.company_id,
            tenant_id=scope.tenant_id,
            owner_id=scope.user_id,
            document_type=document_type,
            title=Path(file.filename or "Untitled").stem,
            original_filename=file.filename or filename,
            storage_path=str(path),
            mime_type=file.content_type,
            size_bytes=len(content),
            checksum=checksum,
            visibility={
                "department_id": visibility.get("department_id") or scope.department_id,
                "project_id": visibility.get("project_id") or scope.project_id,
                "client_id": visibility.get("client_id") or scope.client_id,
                "allowed_user_ids": visibility.get("allowed_user_ids") or [],
                "allowed_roles": visibility.get("allowed_roles") or [],
            },
        )
        version = RAGKnowledgeSourceVersion(
            version_id=version_id,
            source_id=source_id,
            company_id=scope.company_id,
            tenant_id=scope.tenant_id,
            checksum=checksum,
            embedding_model=settings.OPENAI_EMBEDDING_MODEL,
            embedding_dimensions=settings.OPENAI_EMBEDDING_DIMENSIONS,
            qdrant_collection=settings.QDRANT_COLLECTION,
        )

        try:
            sections = parse_document(path, document_type.value)
            if detect_prompt_injection("\n".join(section.text for section in sections)):
                source.status = RAGSourceStatus.QUARANTINED
                source.approval_status = "quarantined"
                source.prompt_injection_detected = True
                version.status = RAGSourceStatus.QUARANTINED
        except HTTPException as exc:
            source.status = RAGSourceStatus.FAILED
            source.approval_status = "failed"
            source.failure_reason = str(exc.detail)
            version.status = RAGSourceStatus.FAILED
            version.failure_reason = str(exc.detail)

        await source.insert()
        await version.insert()
        return source, version, False

    async def approve_source(self, *, source_id: str, current_user: User) -> RAGKnowledgeSource:
        source = await RAGKnowledgeSource.find_one(RAGKnowledgeSource.source_id == source_id)
        if not source:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RAG source not found")
        if source.status == RAGSourceStatus.QUARANTINED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Quarantined sources cannot be approved")
        if not await can_approve_source(current_user, source.visibility or {}, source.company_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Source approval denied")
        source.status = RAGSourceStatus.APPROVED
        source.approval_status = "approved"
        source.approved_by = str(current_user.id)
        source.approved_at = datetime.utcnow()
        source.updated_at = datetime.utcnow()
        await source.save()
        version = await RAGKnowledgeSourceVersion.find_one(
            RAGKnowledgeSourceVersion.company_id == source.company_id,
            RAGKnowledgeSourceVersion.source_id == source.source_id,
        )
        if version:
            version.status = RAGSourceStatus.APPROVED
            version.updated_at = datetime.utcnow()
            await version.save()
        return source


source_registry = RAGSourceRegistry()
