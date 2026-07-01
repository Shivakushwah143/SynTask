from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class CreativeReviewStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class CreativeIssueSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class CreativeFeedbackAction(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"
    OVERRIDE = "override"
    IGNORE = "ignore"


class CreativeReviewDecision(str, Enum):
    PASS = "pass"
    NEEDS_CHANGES = "needs_changes"
    BLOCKED = "blocked"
    OVERRIDDEN = "overridden"


class CreativeReviewContext(BaseModel):
    project: Dict[str, Any] = Field(default_factory=dict)
    campaign: Dict[str, Any] = Field(default_factory=dict)
    client_requirements: List[Dict[str, Any]] = Field(default_factory=list)
    brand_guidelines: Dict[str, Any] = Field(default_factory=dict)
    target_audience: Dict[str, Any] = Field(default_factory=dict)
    deliverables: List[Dict[str, Any]] = Field(default_factory=list)
    reference_assets: List[Dict[str, Any]] = Field(default_factory=list)
    previous_approved_assets: List[Dict[str, Any]] = Field(default_factory=list)
    historical_reviews: List[Dict[str, Any]] = Field(default_factory=list)
    reviewer_feedback: List[Dict[str, Any]] = Field(default_factory=list)
    revision_history: List[Dict[str, Any]] = Field(default_factory=list)
    designer_notes: List[str] = Field(default_factory=list)
    asset: Dict[str, Any] = Field(default_factory=dict)


class CreativeAssetMetadata(Document):
    company_id: Indexed(str)
    project_id: Indexed(str)
    campaign_id: Optional[str] = None
    asset_id: Indexed(str)
    file_name: str
    file_url: str
    source_type: str = "project_file"
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    page_count: Optional[int] = None
    digest: Optional[str] = None
    dominant_colors: List[str] = Field(default_factory=list)
    text_content: Optional[str] = None
    ocr_text: Optional[str] = None
    preview_url: Optional[str] = None
    uploaded_by: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "creative_asset_metadata"
        indexes = [
            "company_id",
            "project_id",
            "campaign_id",
            "asset_id",
            "digest",
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("asset_id", ASCENDING)], unique=True),
        ]


class CreativeCampaignReview(Document):
    company_id: Indexed(str)
    project_id: Indexed(str)
    campaign_id: Indexed(str)
    campaign_name: str
    objective: Optional[str] = None
    channel: Optional[str] = None
    asset_ids: List[str] = Field(default_factory=list)
    status: CreativeReviewStatus = CreativeReviewStatus.PENDING
    summary: Optional[str] = None
    brand_score: float = 0.0
    ux_score: float = 0.0
    accessibility_score: float = 0.0
    marketing_score: float = 0.0
    requirement_score: float = 0.0
    creative_quality_score: float = 0.0
    overall_score: float = 0.0
    risk_level: str = "unknown"
    issue_count: int = 0
    critical_issue_count: int = 0
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "creative_campaign_reviews"
        indexes = [
            "company_id",
            "project_id",
            "campaign_id",
            "status",
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("campaign_id", ASCENDING)], unique=True),
        ]


class CreativeReview(Document):
    company_id: Indexed(str)
    project_id: Indexed(str)
    campaign_id: Optional[str] = None
    campaign_review_id: Optional[str] = None
    asset_id: Indexed(str)
    asset_metadata_id: Optional[str] = None
    status: CreativeReviewStatus = CreativeReviewStatus.PENDING
    summary: Optional[str] = None
    decision: CreativeReviewDecision = CreativeReviewDecision.NEEDS_CHANGES
    brand_score: float = 0.0
    ux_score: float = 0.0
    accessibility_score: float = 0.0
    marketing_score: float = 0.0
    requirement_score: float = 0.0
    creative_quality_score: float = 0.0
    overall_score: float = 0.0
    risk_level: str = "unknown"
    issue_count: int = 0
    critical_issue_count: int = 0
    model_version: Optional[str] = None
    prompt_version: Optional[str] = None
    rule_version: Optional[str] = None
    analyzer_versions: Dict[str, str] = Field(default_factory=dict)
    review_config: Dict[str, Any] = Field(default_factory=dict)
    context_snapshot: CreativeReviewContext = Field(default_factory=CreativeReviewContext)
    human_feedback: List[Dict[str, Any]] = Field(default_factory=list)
    created_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "creative_reviews"
        indexes = [
            "company_id",
            "project_id",
            "campaign_id",
            "asset_id",
            "status",
            "risk_level",
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("asset_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("campaign_id", ASCENDING), ("created_at", DESCENDING)]),
        ]


class CreativeIssue(Document):
    company_id: Indexed(str)
    project_id: Indexed(str)
    campaign_id: Optional[str] = None
    review_id: Indexed(str)
    asset_id: Indexed(str)
    analyzer_key: str
    analyzer_version: str
    category: str
    title: str
    description: str
    severity: CreativeIssueSeverity
    confidence: float = 0.5
    evidence: Dict[str, Any] = Field(default_factory=dict)
    related_requirement: Optional[str] = None
    suggested_fix: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "creative_issues"
        indexes = [
            "company_id",
            "project_id",
            "campaign_id",
            "review_id",
            "asset_id",
            "category",
            "severity",
            IndexModel([("company_id", ASCENDING), ("review_id", ASCENDING), ("created_at", ASCENDING)]),
        ]


class CreativeSuggestion(Document):
    company_id: Indexed(str)
    project_id: Indexed(str)
    campaign_id: Optional[str] = None
    review_id: Indexed(str)
    issue_id: Optional[str] = None
    title: str
    reason: str
    priority: str
    evidence: Dict[str, Any] = Field(default_factory=dict)
    recommended_fix: str
    action_type: str = "edit"
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "creative_suggestions"
        indexes = [
            "company_id",
            "project_id",
            "campaign_id",
            "review_id",
            "priority",
            IndexModel([("company_id", ASCENDING), ("review_id", ASCENDING), ("created_at", ASCENDING)]),
        ]


class CreativeReviewHistory(Document):
    company_id: Indexed(str)
    project_id: Indexed(str)
    campaign_id: Optional[str] = None
    review_id: Indexed(str)
    event_type: str
    actor_type: str
    actor_id: Optional[str] = None
    from_status: Optional[CreativeReviewStatus] = None
    to_status: Optional[CreativeReviewStatus] = None
    notes: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "creative_review_history"
        indexes = [
            "company_id",
            "project_id",
            "campaign_id",
            "review_id",
            "event_type",
            IndexModel([("company_id", ASCENDING), ("review_id", ASCENDING), ("created_at", ASCENDING)]),
        ]


class ReviewPolicy(Document):
    company_id: Indexed(str)
    project_id: Optional[str] = None
    campaign_id: Optional[str] = None
    name: str
    is_active: bool = True
    minimum_brand_score: float = 75.0
    minimum_ux_score: float = 70.0
    minimum_accessibility_score: float = 75.0
    critical_issue_threshold: int = 1
    auto_approval_threshold: float = 90.0
    human_review_threshold: float = 75.0
    weights: Dict[str, float] = Field(
        default_factory=lambda: {
            "brand": 0.2,
            "ux": 0.15,
            "accessibility": 0.2,
            "marketing": 0.1,
            "requirements": 0.25,
            "quality": 0.1,
        }
    )
    queue_name: str = "creative_reviews_default"
    review_timeout_seconds: int = 300
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "creative_review_policies"
        indexes = [
            "company_id",
            "project_id",
            "campaign_id",
            "is_active",
            IndexModel([("company_id", ASCENDING), ("is_active", ASCENDING), ("created_at", DESCENDING)]),
        ]

