from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from app.models.creative_review import ReviewPolicy


@dataclass(slots=True)
class EvaluatedPolicy:
    minimum_brand_score: float
    minimum_ux_score: float
    minimum_accessibility_score: float
    critical_issue_threshold: int
    auto_approval_threshold: float
    human_review_threshold: float
    weights: Dict[str, float]
    queue_name: str
    review_timeout_seconds: int

    def requires_human_review(self, overall_score: float, critical_issue_count: int) -> bool:
        return critical_issue_count >= self.critical_issue_threshold or overall_score < self.human_review_threshold

    def auto_approves(self, overall_score: float, critical_issue_count: int) -> bool:
        return critical_issue_count == 0 and overall_score >= self.auto_approval_threshold


class ReviewPolicyEngine:
    DEFAULTS = EvaluatedPolicy(
        minimum_brand_score=75.0,
        minimum_ux_score=70.0,
        minimum_accessibility_score=75.0,
        critical_issue_threshold=1,
        auto_approval_threshold=90.0,
        human_review_threshold=75.0,
        weights={
            "brand": 0.2,
            "ux": 0.15,
            "accessibility": 0.2,
            "marketing": 0.1,
            "requirements": 0.25,
            "quality": 0.1,
        },
        queue_name="creative_reviews_default",
        review_timeout_seconds=300,
    )

    @classmethod
    def from_document(cls, policy: ReviewPolicy | None) -> EvaluatedPolicy:
        if not policy:
            return cls.DEFAULTS
        return EvaluatedPolicy(
            minimum_brand_score=policy.minimum_brand_score,
            minimum_ux_score=policy.minimum_ux_score,
            minimum_accessibility_score=policy.minimum_accessibility_score,
            critical_issue_threshold=policy.critical_issue_threshold,
            auto_approval_threshold=policy.auto_approval_threshold,
            human_review_threshold=policy.human_review_threshold,
            weights=policy.weights,
            queue_name=policy.queue_name,
            review_timeout_seconds=policy.review_timeout_seconds,
        )

