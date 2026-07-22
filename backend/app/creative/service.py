from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.creative.orchestrator import ReviewOrchestrator
from app.creative.policy import ReviewPolicyEngine
from app.creative.repository import CreativeRepository
from app.models.creative_review import (
    CreativeAssetMetadata,
    CreativeCampaignReview,
    CreativeFeedbackAction,
    CreativeReview,
    CreativeReviewContext,
    CreativeReviewHistory,
    CreativeReviewStatus,
)
from app.models.project import Project
from app.models.user import User
from app.core.clock import utc_now


class CreativeReviewService:
    def __init__(self, repository: CreativeRepository | None = None, orchestrator: ReviewOrchestrator | None = None) -> None:
        self.repository = repository or CreativeRepository()
        self.orchestrator = orchestrator or ReviewOrchestrator(self.repository)

    async def create_campaign_review(
        self,
        *,
        current_user: User,
        project: Project,
        campaign_id: str,
        campaign_name: str,
        objective: str | None,
        channel: str | None,
        asset_ids: List[str] | None = None,
    ) -> CreativeCampaignReview:
        project_key = str(project.project_id or project.id)
        existing = await self.repository.get_campaign_review(str(current_user.company_id), project_key, campaign_id)
        if existing:
            existing.campaign_name = campaign_name
            existing.objective = objective
            existing.channel = channel
            await self.repository.update_campaign_review(existing)
            return existing

        campaign = CreativeCampaignReview(
            company_id=str(current_user.company_id),
            project_id=project_key,
            campaign_id=campaign_id,
            campaign_name=campaign_name,
            objective=objective,
            channel=channel,
            asset_ids=asset_ids or [],
            status=CreativeReviewStatus.PENDING,
            created_by=str(current_user.id),
        )
        await self.repository.create_campaign_review(campaign)
        return campaign

    async def create_review_for_asset(
        self,
        *,
        current_user: User,
        project: Project,
        asset_metadata: CreativeAssetMetadata,
        campaign_review: CreativeCampaignReview | None = None,
        designer_notes: str | None = None,
    ) -> CreativeReview:
        project_key = str(project.project_id or project.id)
        policy_doc = await self.repository.get_active_policy(str(current_user.company_id), project_key, campaign_review.campaign_id if campaign_review else None)
        policy = ReviewPolicyEngine.from_document(policy_doc)
        snapshot = await self._build_context_snapshot(current_user, project, asset_metadata, campaign_review, designer_notes)
        review = await self.orchestrator.create_review_record(
            company_id=str(current_user.company_id),
            project_id=project_key,
            asset_id=asset_metadata.asset_id,
            campaign_id=campaign_review.campaign_id if campaign_review else None,
            asset_metadata_id=str(asset_metadata.id),
            context_snapshot=snapshot,
            created_by=str(current_user.id),
            review_config={
                "policy": policy.__dict__,
                "queue_name": policy.queue_name,
                "designer_notes": designer_notes,
            },
        )
        if campaign_review:
            campaign_review.asset_ids = list(dict.fromkeys([*campaign_review.asset_ids, asset_metadata.asset_id]))
            await self.repository.update_campaign_review(campaign_review)
        return review

    async def process_review(self, review_id: str, reviewer_id: str | None = None) -> CreativeReview:
        review = await self.repository.get_review(review_id)
        if not review:
            raise ValueError("Review not found")
        asset_metadata = await self.repository.get_asset_by_asset_id(review.asset_id)
        if not asset_metadata:
            raise ValueError("Asset metadata not found")
        project = await Project.get(review.project_id) or await Project.find_one(Project.project_id == review.project_id)
        if not project:
            raise ValueError("Project not found")
        policy_doc = await self.repository.get_active_policy(review.company_id, review.project_id, review.campaign_id)
        policy = ReviewPolicyEngine.from_document(policy_doc)
        campaign_review = None
        if review.campaign_id:
            campaign_review = await CreativeCampaignReview.find_one(
                CreativeCampaignReview.company_id == review.company_id,
                CreativeCampaignReview.campaign_id == review.campaign_id,
            )
        current_user = await User.get(reviewer_id) if reviewer_id else await User.get(review.created_by) if review.created_by else None
        if not current_user:
            current_user = await User.find_one(User.company_id == review.company_id)
        if not current_user:
            raise ValueError("Reviewer context not found")
        await self.repository.delete_review_artifacts(review_id)
        return await self.orchestrator.run_review(
            review=review,
            project=project,
            current_user=current_user,
            policy=policy,
            campaign_review=campaign_review,
        )

    async def rerun_review(self, review_id: str, reviewer_id: str) -> CreativeReview:
        review = await self.repository.get_review(review_id)
        if not review:
            raise ValueError("Review not found")
        review.status = CreativeReviewStatus.QUEUED
        review.queued_at = utc_now()
        review.failed_at = None
        review.error_message = None
        await self.repository.update_review(review)
        return await self.process_review(review_id, reviewer_id=reviewer_id)

    async def approve_review(self, review: CreativeReview, reviewer_id: str, notes: str | None = None) -> CreativeReview:
        review.decision = review.decision if review.decision else None
        return await self.orchestrator.record_feedback(
            review=review,
            action=CreativeFeedbackAction.APPROVE,
            notes=notes,
            reviewer_id=reviewer_id,
        )

    async def override_review(self, review: CreativeReview, reviewer_id: str, notes: str | None = None, payload: Dict[str, Any] | None = None) -> CreativeReview:
        return await self.orchestrator.record_feedback(
            review=review,
            action=CreativeFeedbackAction.OVERRIDE,
            notes=notes,
            reviewer_id=reviewer_id,
            payload=payload,
        )

    async def reject_review(self, review: CreativeReview, reviewer_id: str, notes: str | None = None) -> CreativeReview:
        return await self.orchestrator.record_feedback(
            review=review,
            action=CreativeFeedbackAction.REJECT,
            notes=notes,
            reviewer_id=reviewer_id,
        )

    async def ignore_review(self, review: CreativeReview, reviewer_id: str, notes: str | None = None) -> CreativeReview:
        return await self.orchestrator.record_feedback(
            review=review,
            action=CreativeFeedbackAction.IGNORE,
            notes=notes,
            reviewer_id=reviewer_id,
        )

    async def list_project_reviews(self, company_id: str, project_id: str, skip: int, limit: int) -> List[CreativeReview]:
        return await self.repository.list_project_reviews(company_id, project_id, limit, skip)

    async def list_asset_reviews(self, company_id: str, asset_id: str, skip: int, limit: int) -> List[CreativeReview]:
        return await self.repository.list_asset_reviews(company_id, asset_id, limit, skip)

    async def get_review_details(self, review_id: str) -> Dict[str, Any]:
        review = await self.repository.get_review(review_id)
        if not review:
            raise ValueError("Review not found")
        issues = await self.repository.list_review_issues(review_id)
        suggestions = await self.repository.list_review_suggestions(review_id)
        history = await self.repository.list_review_history(review_id)
        return {
            "review": review,
            "issues": issues,
            "suggestions": suggestions,
            "history": history,
        }

    async def list_campaign_reviews(self, company_id: str, project_id: str, skip: int, limit: int) -> List[CreativeCampaignReview]:
        return await CreativeCampaignReview.find(
            CreativeCampaignReview.company_id == company_id,
            CreativeCampaignReview.project_id == project_id,
        ).sort("-created_at").skip(skip).limit(limit).to_list()

    async def _build_context_snapshot(
        self,
        current_user: User,
        project: Project,
        asset_metadata: CreativeAssetMetadata,
        campaign_review: CreativeCampaignReview | None,
        designer_notes: str | None,
    ) -> CreativeReviewContext:
        from app.creative.context import CreativeContextBuilder

        return await CreativeContextBuilder.build(
            current_user=current_user,
            project=project,
            asset_metadata=asset_metadata,
            campaign_review=campaign_review,
            designer_notes=designer_notes,
        )

