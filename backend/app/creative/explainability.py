from __future__ import annotations

from typing import Any, Dict, List

from app.creative.types import AnalyzerIssue


class ExplainabilityEngine:
    @staticmethod
    def explain(issues: List[AnalyzerIssue]) -> List[Dict[str, Any]]:
        explanations: List[Dict[str, Any]] = []
        for issue in issues:
            explanations.append(
                {
                    "category": issue.category,
                    "title": issue.title,
                    "why": issue.description,
                    "evidence": issue.evidence,
                    "confidence": issue.confidence,
                    "analyzer": issue.metadata.get("analyzer_key"),
                    "related_requirement": issue.related_requirement,
                    "suggested_fix": issue.suggested_fix,
                    "severity": issue.severity.value,
                }
            )
        return explanations

