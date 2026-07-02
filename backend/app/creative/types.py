from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.models.creative_review import CreativeIssueSeverity


@dataclass(slots=True)
class AnalyzerIssue:
    category: str
    title: str
    description: str
    severity: CreativeIssueSeverity
    confidence: float
    evidence: Dict[str, Any] = field(default_factory=dict)
    related_requirement: Optional[str] = None
    suggested_fix: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AnalyzerResult:
    analyzer_key: str
    analyzer_version: str
    score: float
    issues: List[AnalyzerIssue] = field(default_factory=list)
    severity: CreativeIssueSeverity = CreativeIssueSeverity.LOW
    confidence: float = 0.5
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedAsset:
    asset_id: str
    file_name: str
    file_url: str
    source_type: str
    mime_type: Optional[str]
    file_size: Optional[int]
    width: Optional[int] = None
    height: Optional[int] = None
    page_count: Optional[int] = None
    digest: Optional[str] = None
    dominant_colors: List[str] = field(default_factory=list)
    text_content: Optional[str] = None
    ocr_text: Optional[str] = None
    preview_url: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class CreativeReviewScore:
    brand_score: float
    ux_score: float
    accessibility_score: float
    marketing_score: float
    requirement_score: float
    creative_quality_score: float
    overall_score: float
    risk_level: str


@dataclass(slots=True)
class CreativeReviewAggregate:
    summary: str
    score: CreativeReviewScore
    issues: List[AnalyzerIssue]
    suggestions: List[Dict[str, Any]]
    analyzer_versions: Dict[str, str]
    explainability: List[Dict[str, Any]]
    decision: str
    model_version: str
    prompt_version: Optional[str]
    rule_version: str
    review_config: Dict[str, Any]
    metadata: Dict[str, Any]

