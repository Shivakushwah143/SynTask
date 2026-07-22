from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class RAGSourceStatus(str, Enum):
    UPLOADED = "uploaded"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    INDEXING = "indexing"
    ACTIVE = "active"
    FAILED = "failed"
    QUARANTINED = "quarantined"
    RETIRED = "retired"
    DELETED = "deleted"


class RAGSourceType(str, Enum):
    MANUAL_UPLOAD = "manual_upload"
    EMAIL_TEMPLATE = "email_template"
    COMMUNICATION_POLICY = "communication_policy"
    BRAND_GUIDELINE = "brand_guideline"
    CLIENT_COMMUNICATION_GUIDANCE = "client_communication_guidance"
    APPROVED_SIGNATURE = "approved_signature"


class RAGDocumentType(str, Enum):
    TXT = "txt"
    MARKDOWN = "markdown"
    PDF = "pdf"
    DOCX = "docx"
    PPTX = "pptx"
    XLSX = "xlsx"
    CSV = "csv"
    HTML = "html"


class RAGKnowledgeSource(Document):
    source_id: Indexed(str)
    company_id: Indexed(str)
    tenant_id: Indexed(str)
    owner_id: Indexed(str)
    source_type: RAGSourceType = RAGSourceType.MANUAL_UPLOAD
    document_type: RAGDocumentType
    title: str
    original_filename: str
    storage_path: str
    mime_type: Optional[str] = None
    size_bytes: int = 0
    checksum: Indexed(str)
    status: RAGSourceStatus = RAGSourceStatus.PENDING_APPROVAL
    approval_status: Indexed(str) = "pending"
    visibility: dict[str, Any] = Field(default_factory=dict)
    confidentiality_level: str = "internal"
    schema_version: str = "rag-source-v1"
    prompt_injection_detected: bool = False
    failure_reason: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    retired_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "rag_knowledge_sources"
        indexes = [
            "source_id",
            "company_id",
            "tenant_id",
            "owner_id",
            "checksum",
            "status",
            "approval_status",
            IndexModel([("company_id", ASCENDING), ("checksum", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("source_type", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("source_id", ASCENDING)], unique=True),
        ]


class RAGKnowledgeSourceVersion(Document):
    version_id: Indexed(str)
    source_id: Indexed(str)
    company_id: Indexed(str)
    tenant_id: Indexed(str)
    version: int = 1
    checksum: Indexed(str)
    status: RAGSourceStatus = RAGSourceStatus.PENDING_APPROVAL
    parser_version: str = "rag-parser-v1"
    chunk_schema_version: str = "rag-chunk-v1"
    embedding_schema_version: str = "openai-embedding-v1"
    embedding_model: str
    embedding_dimensions: int
    qdrant_collection: str
    chunk_count: int = 0
    failure_reason: Optional[str] = None
    indexed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "rag_knowledge_source_versions"
        indexes = [
            "version_id",
            "source_id",
            "company_id",
            "status",
            IndexModel([("company_id", ASCENDING), ("source_id", ASCENDING), ("version", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("version_id", ASCENDING)], unique=True),
        ]


class RAGKnowledgeChunk(Document):
    chunk_id: Indexed(str)
    source_id: Indexed(str)
    version_id: Indexed(str)
    company_id: Indexed(str)
    tenant_id: Indexed(str)
    qdrant_point_id: Optional[str] = None
    ordinal: int
    location: dict[str, Any] = Field(default_factory=dict)
    excerpt: str
    checksum: str
    visibility: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    deleted: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "rag_knowledge_chunks"
        indexes = [
            "chunk_id",
            "source_id",
            "version_id",
            "company_id",
            IndexModel([("company_id", ASCENDING), ("source_id", ASCENDING), ("ordinal", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("chunk_id", ASCENDING)], unique=True),
        ]


class RAGRetrievalRun(Document):
    run_id: Indexed(str)
    company_id: Indexed(str)
    tenant_id: Indexed(str)
    user_id: Indexed(str)
    query_hash: str
    status: Indexed(str)
    top_k: int
    result_count: int = 0
    no_answer: bool = False
    filters: dict[str, Any] = Field(default_factory=dict)
    citation_ids: list[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "rag_retrieval_runs"
        indexes = [
            "run_id",
            "company_id",
            "user_id",
            "status",
            "created_at",
            IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)]),
        ]


class RAGCitation(Document):
    citation_id: Indexed(str)
    run_id: Indexed(str)
    company_id: Indexed(str)
    tenant_id: Indexed(str)
    source_id: Indexed(str)
    version_id: Indexed(str)
    chunk_id: Indexed(str)
    location: dict[str, Any] = Field(default_factory=dict)
    excerpt: str
    score: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "rag_citations"
        indexes = [
            "citation_id",
            "run_id",
            "company_id",
            "source_id",
            "chunk_id",
        ]
