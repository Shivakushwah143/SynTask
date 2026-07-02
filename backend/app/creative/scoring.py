from __future__ import annotations

from typing import Dict, List

from app.creative.types import AnalyzerIssue, CreativeReviewScore
from app.models.creative_review import CreativeIssueSeverity


class CreativeScoringEngine:
    @staticmethod
    def _category_score(base: float, issues: List[AnalyzerIssue], keyword: str) -> float:
        relevant = [issue for issue in issues if issue.category == keyword]
        if not relevant:
            return base
        penalty = 0.0
        for issue in relevant:
            severity_weight = {
                CreativeIssueSeverity.LOW: 4.0,
                CreativeIssueSeverity.MEDIUM: 8.0,
                CreativeIssueSeverity.HIGH: 14.0,
                CreativeIssueSeverity.CRITICAL: 22.0,
            }[issue.severity]
            penalty += severity_weight * max(0.25, issue.confidence)
        return max(0.0, min(100.0, base - penalty))

    @staticmethod
    def score(issues: List[AnalyzerIssue], analyzer_scores: Dict[str, float]) -> CreativeReviewScore:
        brand_score = CreativeScoringEngine._category_score(analyzer_scores.get("brand", 92.0), issues, "brand")
        ux_score = CreativeScoringEngine._category_score(analyzer_scores.get("ux", 90.0), issues, "ux")
        accessibility_score = CreativeScoringEngine._category_score(analyzer_scores.get("accessibility", 88.0), issues, "accessibility")
        marketing_score = CreativeScoringEngine._category_score(analyzer_scores.get("marketing", 90.0), issues, "marketing")
        requirement_score = CreativeScoringEngine._category_score(analyzer_scores.get("requirements", 95.0), issues, "requirement")
        quality_score = CreativeScoringEngine._category_score(analyzer_scores.get("quality", 92.0), issues, "quality")

        weighted = (
            brand_score * 0.2
            + ux_score * 0.15
            + accessibility_score * 0.2
            + marketing_score * 0.1
            + requirement_score * 0.25
            + quality_score * 0.1
        )
        overall_score = round(weighted, 2)

        if overall_score >= 90:
            risk_level = "low"
        elif overall_score >= 75:
            risk_level = "moderate"
        elif overall_score >= 60:
            risk_level = "high"
        else:
            risk_level = "critical"

        return CreativeReviewScore(
            brand_score=round(brand_score, 2),
            ux_score=round(ux_score, 2),
            accessibility_score=round(accessibility_score, 2),
            marketing_score=round(marketing_score, 2),
            requirement_score=round(requirement_score, 2),
            creative_quality_score=round(quality_score, 2),
            overall_score=overall_score,
            risk_level=risk_level,
        )

