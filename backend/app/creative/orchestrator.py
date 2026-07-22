from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from app.creative.context import CreativeContextBuilder
from app.creative.explainability import ExplainabilityEngine
from app.creative.normalizer import AssetNormalizer
from app.creative.policy import EvaluatedPolicy
from app.creative.registry import AnalyzerRegistry
from app.creative.repository import CreativeRepository
from app.creative.scoring import CreativeScoringEngine
from app.creative.suggestions import SuggestionEngine
from app.creative.types import AnalyzerIssue
from app.models.creative_review import (
    CreativeAssetMetadata,
    CreativeCampaignReview,
    CreativeFeedbackAction,
    CreativeIssue,
    CreativeIssueSeverity,
    CreativeReview,
    CreativeReviewDecision,
    CreativeReviewHistory,
    CreativeReviewStatus,
    CreativeSuggestion,
)
from app.models.project import Project
from app.models.user import User
from app.core.clock import utc_now


class ReviewOrchestrator:
    def __init__(self, repository: CreativeRepository | None = None, registry: AnalyzerRegistry | None = None) -> None:
        self.repository = repository or CreativeRepository()
        self.registry = registry or AnalyzerRegistry()
        self.scoring_engine = CreativeScoringEngine()
        self.explainability_engine = ExplainabilityEngine()
        self.suggestion_engine = SuggestionEngine()

    async def create_asset_metadata(
        self,
        *,
        company_id: str,
        project_id: str,
        asset_id: str,
        file_name: str,
        file_url: str,
        source_type: str,
        mime_type: str | None = None,
        file_size: int | None = None,
        campaign_id: str | None = None,
        uploaded_by: str | None = None,
        metadata: Dict[str, Any] | None = None,
    ) -> CreativeAssetMetadata:
        normalized = AssetNormalizer.normalize(
            asset_id=asset_id,
            file_name=file_name,
            file_url=file_url,
            source_type=source_type,
            mime_type=mime_type,
            file_size=file_size,
            metadata=metadata,
        )
        existing = await self.repository.get_asset_metadata(company_id, asset_id)
        if existing:
            existing.project_id = project_id
            existing.campaign_id = campaign_id
            existing.file_name = file_name
            existing.file_url = file_url
            existing.source_type = source_type
            existing.mime_type = normalized.mime_type
            existing.file_size = file_size
            existing.width = normalized.width
            existing.height = normalized.height
            existing.page_count = normalized.page_count
            existing.digest = normalized.digest
            existing.dominant_colors = normalized.dominant_colors
            existing.text_content = normalized.text_content
            existing.ocr_text = normalized.ocr_text
            existing.preview_url = normalized.preview_url
            existing.uploaded_by = uploaded_by
            existing.metadata = normalized.metadata
            return await self.repository.save_asset_metadata(existing)

        doc = CreativeAssetMetadata(
            company_id=company_id,
            project_id=project_id,
            campaign_id=campaign_id,
            asset_id=asset_id,
            file_name=file_name,
            file_url=file_url,
            source_type=source_type,
            mime_type=normalized.mime_type,
            file_size=file_size,
            width=normalized.width,
            height=normalized.height,
            page_count=normalized.page_count,
            digest=normalized.digest,
            dominant_colors=normalized.dominant_colors,
            text_content=normalized.text_content,
            ocr_text=normalized.ocr_text,
            preview_url=normalized.preview_url,
            uploaded_by=uploaded_by,
            metadata=normalized.metadata,
        )
        return await self.repository.save_asset_metadata(doc)

    async def create_review_record(
        self,
        *,
        company_id: str,
        project_id: str,
        asset_id: str,
        campaign_id: str | None,
        asset_metadata_id: str | None,
        context_snapshot,
        created_by: str | None,
        review_config: Dict[str, Any],
    ) -> CreativeReview:
        review = CreativeReview(
            company_id=company_id,
            project_id=project_id,
            campaign_id=campaign_id,
            asset_id=asset_id,
            asset_metadata_id=asset_metadata_id,
            status=CreativeReviewStatus.QUEUED,
            review_config=review_config,
            context_snapshot=context_snapshot,
            created_by=created_by,
            queued_at=utc_now(),
        )
        await self.repository.create_review(review)
        return review

    async def run_review(
        self,
        *,
        review: CreativeReview,
        project: Project,
        current_user: User,
        policy: EvaluatedPolicy,
        campaign_review: CreativeCampaignReview | None = None,
    ) -> CreativeReview:
        review.status = CreativeReviewStatus.RUNNING
        review.started_at = utc_now()
        await self.repository.update_review(review)
        await self.repository.create_history(
            CreativeReviewHistory(
                company_id=review.company_id,
                project_id=review.project_id,
                campaign_id=review.campaign_id,
                review_id=str(review.id),
                event_type="started",
                actor_type="system",
                actor_id=str(current_user.id),
                from_status=CreativeReviewStatus.QUEUED,
                to_status=CreativeReviewStatus.RUNNING,
                payload={"policy": policy.__dict__},
            )
        )

        asset_metadata = await self.repository.get_asset_by_asset_id(review.asset_id)
        if not asset_metadata:
            raise ValueError("Asset metadata not found")

        context = await CreativeContextBuilder.build(
            current_user=current_user,
            project=project,
            asset_metadata=asset_metadata,
            campaign_review=campaign_review,
        )
        review.context_snapshot = context

        analyzer_results = []
        for analyzer in self.registry.list():
            result = await analyzer.analyze(context, AssetNormalizer.normalize(
                asset_id=asset_metadata.asset_id,
                file_name=asset_metadata.file_name,
                file_url=asset_metadata.file_url,
                source_type=asset_metadata.source_type,
                mime_type=asset_metadata.mime_type,
                file_size=asset_metadata.file_size,
                metadata=asset_metadata.metadata,
            ))
            analyzer_results.append(result)

        issues: List[AnalyzerIssue] = []
        analyzer_scores: Dict[str, float] = {}
        analyzer_versions: Dict[str, str] = {}
        for result in analyzer_results:
            analyzer_scores[result.analyzer_key] = result.score
            analyzer_versions[result.analyzer_key] = result.analyzer_version
            for issue in result.issues:
                issue.metadata.setdefault("analyzer_key", result.analyzer_key)
                issue.metadata.setdefault("analyzer_version", result.analyzer_version)
                issues.append(issue)

        score = self.scoring_engine.score(issues, analyzer_scores)
        suggestions = self.suggestion_engine.build(issues)
        explanations = self.explainability_engine.explain(issues)
        critical_issue_count = sum(1 for issue in issues if issue.severity in {CreativeIssueSeverity.CRITICAL, CreativeIssueSeverity.HIGH})
        decision = CreativeReviewDecision.PASS if score.overall_score >= policy.auto_approval_threshold and critical_issue_count == 0 else CreativeReviewDecision.NEEDS_CHANGES
        if policy.requires_human_review(score.overall_score, critical_issue_count):
            decision = CreativeReviewDecision.NEEDS_CHANGES

        review.summary = f"Reviewed {asset_metadata.file_name} across {len(analyzer_results)} analyzers."
        review.decision = decision
        review.brand_score = score.brand_score
        review.ux_score = score.ux_score
        review.accessibility_score = score.accessibility_score
        review.marketing_score = score.marketing_score
        review.requirement_score = score.requirement_score
        review.creative_quality_score = score.creative_quality_score
        review.overall_score = score.overall_score
        review.risk_level = score.risk_level
        review.issue_count = len(issues)
        review.critical_issue_count = critical_issue_count
        review.model_version = review.model_version or "heuristic-v1"
        review.prompt_version = review.prompt_version or "n/a"
        review.rule_version = review.rule_version or "policy-v1"
        review.analyzer_versions = analyzer_versions
        review.completed_at = utc_now()
        review.status = CreativeReviewStatus.COMPLETED
        await self.repository.update_review(review)

        db_issues: List[CreativeIssue] = []
        for issue in issues:
            db_issues.append(
                CreativeIssue(
                    company_id=review.company_id,
                    project_id=review.project_id,
                    campaign_id=review.campaign_id,
                    review_id=str(review.id),
                    asset_id=review.asset_id,
                    analyzer_key=issue.metadata.get("analyzer_key", "unknown"),
                    analyzer_version=issue.metadata.get("analyzer_version", "1.0.0"),
                    category=issue.category,
                    title=issue.title,
                    description=issue.description,
                    severity=issue.severity,
                    confidence=issue.confidence,
                    evidence=issue.evidence,
                    related_requirement=issue.related_requirement,
                    suggested_fix=issue.suggested_fix,
                    metadata=issue.metadata,
                )
            )
        await self.repository.create_issues(db_issues)

        db_suggestions: List[CreativeSuggestion] = []
        for suggestion in suggestions:
            db_suggestions.append(
                CreativeSuggestion(
                    company_id=review.company_id,
                    project_id=review.project_id,
                    campaign_id=review.campaign_id,
                    review_id=str(review.id),
                    title=suggestion["title"],
                    reason=suggestion["reason"],
                    priority=suggestion["priority"],
                    evidence=suggestion.get("evidence", {}),
                    recommended_fix=suggestion["recommended_fix"],
                    action_type=suggestion.get("action_type", "edit"),
                    metadata={"source": "SuggestionEngine"},
                )
            )
        await self.repository.create_suggestions(db_suggestions)

        await self.repository.create_history(
            CreativeReviewHistory(
                company_id=review.company_id,
                project_id=review.project_id,
                campaign_id=review.campaign_id,
                review_id=str(review.id),
                event_type="completed",
                actor_type="system",
                actor_id=str(current_user.id),
                from_status=CreativeReviewStatus.RUNNING,
                to_status=CreativeReviewStatus.COMPLETED,
                payload={
                    "score": score.__dict__,
                    "decision": decision.value,
                    "issue_count": len(issues),
                    "critical_issue_count": critical_issue_count,
                    "analyzer_versions": analyzer_versions,
                    "explainability": explanations,
                },
            )
        )

        if campaign_review:
            campaign_review.asset_ids = list(dict.fromkeys([*campaign_review.asset_ids, review.asset_id]))
            campaign_review.status = CreativeReviewStatus.COMPLETED
            campaign_review.summary = review.summary
            campaign_review.brand_score = score.brand_score
            campaign_review.ux_score = score.ux_score
            campaign_review.accessibility_score = score.accessibility_score
            campaign_review.marketing_score = score.marketing_score
            campaign_review.requirement_score = score.requirement_score
            campaign_review.creative_quality_score = score.creative_quality_score
            campaign_review.overall_score = score.overall_score
            campaign_review.risk_level = score.risk_level
            campaign_review.issue_count = len(issues)
            campaign_review.critical_issue_count = critical_issue_count
            await self.repository.update_campaign_review(campaign_review)

        return review

    async def record_feedback(
        self,
        *,
        review: CreativeReview,
        action: CreativeFeedbackAction,
        notes: str | None,
        reviewer_id: str,
        payload: Dict[str, Any] | None = None,
    ) -> CreativeReview:
        review.human_feedback.append(
            {
                "action": action.value,
                "notes": notes,
                "reviewer_id": reviewer_id,
                "created_at": utc_now(),
                "payload": payload or {},
            }
        )
        review.reviewed_by = reviewer_id
        await self.repository.update_review(review)
        await self.repository.create_history(
            CreativeReviewHistory(
                company_id=review.company_id,
                project_id=review.project_id,
                campaign_id=review.campaign_id,
                review_id=str(review.id),
                event_type="feedback",
                actor_type="human",
                actor_id=reviewer_id,
                from_status=review.status,
                to_status=review.status,
                notes=notes,
                payload={"action": action.value, **(payload or {})},
            )
        )
        return review

