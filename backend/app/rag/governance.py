from __future__ import annotations

from datetime import datetime

from app.core.clock import utc_now
from typing import Any

from fastapi import HTTPException, status

from app.models.user import UserRole
from app.rag.models import RAGCitation, RAGKnowledgeChunk, RAGKnowledgeSource, RAGKnowledgeSourceVersion, RAGSourceStatus
from app.rag.permissions import can_approve_source, source_visible_to_scope
from app.rag.qdrant_store import RAGQdrantStore


class RAGGovernanceService:
    def _scope_query(self, current_user, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        query = dict(filters or {})
        if current_user.role != UserRole.SUPER_ADMIN:
            if not current_user.company_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant scope required")
            query["company_id"] = current_user.company_id
        return query

    async def list_sources(self, *, current_user, filters: dict[str, Any] | None = None, skip: int = 0, limit: int = 50) -> dict[str, Any]:
        query = self._scope_query(current_user)
        filters = filters or {}
        for key in ("department_id", "project_id", "client_id"):
            if filters.get(key):
                query[f"visibility.{key}"] = filters[key]
        for key in ("source_type", "status", "approval_status", "owner_id", "confidentiality_level", "document_type"):
            if filters.get(key):
                query[key] = filters[key]
        sources = await RAGKnowledgeSource.find(query).sort("-updated_at").skip(skip).limit(limit).to_list()
        return {"sources": [source.model_dump(mode="json") for source in sources], "total": await RAGKnowledgeSource.find(query).count()}

    async def preview_chunks(self, *, current_user, source_id: str, limit: int = 5) -> list[dict[str, Any]]:
        source = await RAGKnowledgeSource.find_one(RAGKnowledgeSource.source_id == source_id)
        if not source or source.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
        chunks = await RAGKnowledgeChunk.find(
            RAGKnowledgeChunk.company_id == source.company_id,
            RAGKnowledgeChunk.source_id == source.source_id,
            RAGKnowledgeChunk.deleted == False,
        ).sort("ordinal").limit(limit).to_list()
        return [{"chunk_id": chunk.chunk_id, "ordinal": chunk.ordinal, "excerpt": chunk.excerpt[:600], "location": chunk.location} for chunk in chunks]

    async def reject(self, *, current_user, source_id: str, reason: str) -> RAGKnowledgeSource:
        source = await self._editable_source(current_user, source_id)
        source.status = RAGSourceStatus.RETIRED
        source.approval_status = "rejected"
        source.failure_reason = reason
        source.updated_at = utc_now()
        await source.save()
        return source

    async def disable_source(self, *, current_user, source_id: str) -> RAGKnowledgeSource:
        source = await self._editable_source(current_user, source_id)
        source.status = RAGSourceStatus.RETIRED
        source.approval_status = "disabled"
        source.retired_at = utc_now()
        source.updated_at = utc_now()
        await source.save()
        await RAGQdrantStore().delete_source(company_id=source.company_id, source_id=source.source_id)
        return source

    async def versions(self, *, current_user, source_id: str) -> list[dict[str, Any]]:
        source = await self._editable_source(current_user, source_id)
        versions = await RAGKnowledgeSourceVersion.find(
            RAGKnowledgeSourceVersion.company_id == source.company_id,
            RAGKnowledgeSourceVersion.source_id == source.source_id,
        ).sort("-version").to_list()
        return [version.model_dump(mode="json") for version in versions]

    async def citations(self, *, current_user, source_id: str) -> list[dict[str, Any]]:
        source = await self._editable_source(current_user, source_id)
        citations = await RAGCitation.find(RAGCitation.company_id == source.company_id, RAGCitation.source_id == source.source_id).sort("-created_at").to_list()
        return [citation.model_dump(mode="json") for citation in citations]

    async def _editable_source(self, current_user, source_id: str) -> RAGKnowledgeSource:
        source = await RAGKnowledgeSource.find_one(RAGKnowledgeSource.source_id == source_id)
        if not source:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
        if not await can_approve_source(current_user, source.visibility or {}, source.company_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Source governance denied")
        return source
