from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict

from app.creative.types import AnalyzerResult, NormalizedAsset
from app.models.creative_review import CreativeReviewContext


class BaseCreativeAnalyzer(ABC):
    key = "base"
    version = "1.0.0"

    @abstractmethod
    async def analyze(self, context: CreativeReviewContext, asset: NormalizedAsset) -> AnalyzerResult:
        raise NotImplementedError

    @staticmethod
    def _context_text(context: CreativeReviewContext) -> str:
        parts = []
        if context.brand_guidelines:
            parts.append(str(context.brand_guidelines))
        if context.client_requirements:
            parts.append(str(context.client_requirements))
        if context.deliverables:
            parts.append(str(context.deliverables))
        if context.target_audience:
            parts.append(str(context.target_audience))
        if context.designer_notes:
            parts.append(" ".join(context.designer_notes))
        return "\n".join(parts).lower()

    @staticmethod
    def _asset_text(asset: NormalizedAsset) -> str:
        return " ".join(
            filter(
                None,
                [
                    asset.file_name,
                    asset.text_content,
                    asset.ocr_text,
                    str(asset.metadata),
                ],
            )
        ).lower()

    @staticmethod
    def _make_issue(
        category: str,
        title: str,
        description: str,
        severity,
        confidence: float,
        evidence: Dict[str, Any] | None = None,
        related_requirement: str | None = None,
        suggested_fix: str | None = None,
        metadata: Dict[str, Any] | None = None,
    ):
        from app.creative.types import AnalyzerIssue

        return AnalyzerIssue(
            category=category,
            title=title,
            description=description,
            severity=severity,
            confidence=max(0.0, min(1.0, confidence)),
            evidence=evidence or {},
            related_requirement=related_requirement,
            suggested_fix=suggested_fix,
            metadata=metadata or {},
        )

