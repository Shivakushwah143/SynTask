from __future__ import annotations

from typing import Any, Dict, List

from app.creative.types import AnalyzerIssue
from app.models.creative_review import CreativeIssueSeverity


class SuggestionEngine:
    @staticmethod
    def build(issues: List[AnalyzerIssue]) -> List[Dict[str, Any]]:
        suggestions: List[Dict[str, Any]] = []
        for issue in issues:
            priority = "low"
            if issue.severity == CreativeIssueSeverity.CRITICAL:
                priority = "critical"
            elif issue.severity == CreativeIssueSeverity.HIGH:
                priority = "high"
            elif issue.severity == CreativeIssueSeverity.MEDIUM:
                priority = "medium"

            suggestions.append(
                {
                    "title": issue.title,
                    "reason": issue.description,
                    "priority": priority,
                    "evidence": issue.evidence,
                    "recommended_fix": issue.suggested_fix or "Refine the asset to satisfy the identified requirement.",
                    "action_type": "edit",
                }
            )
        if not suggestions:
            suggestions.append(
                {
                    "title": "Review passed",
                    "reason": "No blocking issues were detected.",
                    "priority": "low",
                    "evidence": {},
                    "recommended_fix": "Publish or approve the asset if it matches the campaign objective.",
                    "action_type": "approve",
                }
            )
        return suggestions

