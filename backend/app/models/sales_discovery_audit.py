from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class SalesWorkspaceStatus(str, Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class SalesDiscovery(Document):
    company_id: Indexed(str)
    lead_id: Indexed(str)
    status: SalesWorkspaceStatus = SalesWorkspaceStatus.DRAFT
    business_information: dict[str, Any] = Field(default_factory=dict)
    current_marketing: dict[str, Any] = Field(default_factory=dict)
    problems: dict[str, Any] = Field(default_factory=dict)
    goals: dict[str, Any] = Field(default_factory=dict)
    budget: dict[str, Any] = Field(default_factory=dict)
    decision_maker: dict[str, Any] = Field(default_factory=dict)
    competitors: list[dict[str, Any]] = Field(default_factory=list)
    timeline: dict[str, Any] = Field(default_factory=dict)
    summary: dict[str, Any] = Field(default_factory=dict)
    completion: dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_discoveries"
        indexes = [
            "company_id",
            "lead_id",
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)]),
        ]


class SalesAudit(Document):
    company_id: Indexed(str)
    lead_id: Indexed(str)
    status: SalesWorkspaceStatus = SalesWorkspaceStatus.DRAFT
    audit_source: str = "manual"
    website: dict[str, Any] = Field(default_factory=dict)
    google_presence: dict[str, Any] = Field(default_factory=dict)
    social_media: dict[str, Any] = Field(default_factory=dict)
    seo: dict[str, Any] = Field(default_factory=dict)
    competitors: list[dict[str, Any]] = Field(default_factory=list)
    swot: dict[str, Any] = Field(default_factory=dict)
    recommendations: list[dict[str, Any]] = Field(default_factory=list)
    findings: list[dict[str, Any]] = Field(default_factory=list)
    completion: dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_audits"
        indexes = [
            "company_id",
            "lead_id",
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)]),
        ]
