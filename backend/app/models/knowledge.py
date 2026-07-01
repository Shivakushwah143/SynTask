"""
Knowledge ingestion models.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class KnowledgeType(str, Enum):
    PROJECT = "project"
    CAMPAIGN = "campaign"
    TASK = "task"
    MEETING = "meeting"
    DECISION = "decision"
    CREATIVE = "creative"
    REVIEW = "review"
    FEEDBACK = "feedback"
    BRAND = "brand"
    CLIENT = "client"
    BEST_PRACTICE = "best_practice"


class KnowledgeStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    VERIFIED = "verified"
    ARCHIVED = "archived"
    SUPERSEDED = "superseded"
    DELETED = "deleted"


class KnowledgeRelationshipType(str, Enum):
    PROJECT = "project"
    CAMPAIGN = "campaign"
    CREATIVE = "creative"
    REVIEW = "review"
    FEEDBACK = "feedback"
    DECISION = "decision"
    TASK = "task"
    MEETING = "meeting"
    CLIENT = "client"
    BRAND = "brand"


class KnowledgeRecord(Document):
    knowledge_id: Indexed(str)
    knowledge_type: Indexed(str)
    company_id: Indexed(str)
    project_id: Optional[str] = None
    campaign_id: Optional[str] = None
    source_entity: Indexed(str)
    source_entity_id: Indexed(str)
    source_event: Dict[str, Any] = Field(default_factory=dict)
    title: str
    summary: str
    content: str
    relationships: List[Dict[str, Any]] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    importance: int = Field(default=1, ge=1, le=5)
    freshness: float = Field(default=1.0, ge=0.0, le=1.0)
    status: KnowledgeStatus = KnowledgeStatus.ACTIVE
    version: int = Field(default=1, ge=1)
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Settings:
        name = "knowledge_records"
        indexes = [
            "knowledge_id",
            "knowledge_type",
            "company_id",
            "project_id",
            "campaign_id",
            "source_entity",
            "source_entity_id",
            "status",
            "version",
            IndexModel([("company_id", ASCENDING), ("knowledge_type", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("source_entity", ASCENDING), ("source_entity_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("knowledge_id", ASCENDING)], unique=True),
        ]

