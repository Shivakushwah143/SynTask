from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.models.creative_review import (
    CreativeAssetMetadata,
    CreativeCampaignReview,
    CreativeIssue,
    CreativeReview,
    CreativeReviewHistory,
    CreativeSuggestion,
    ReviewPolicy,
)


class CreativeRepository:
    async def save_asset_metadata(self, asset: CreativeAssetMetadata) -> CreativeAssetMetadata:
        asset.updated_at = datetime.now()
        await asset.save()
        return asset

    async def create_review(self, review: CreativeReview) -> CreativeReview:
        review.updated_at = datetime.now()
        await review.insert()
        return review

    async def update_review(self, review: CreativeReview) -> CreativeReview:
        review.updated_at = datetime.now()
        await review.save()
        return review

    async def create_campaign_review(self, campaign: CreativeCampaignReview) -> CreativeCampaignReview:
        campaign.updated_at = datetime.now()
        await campaign.insert()
        return campaign

    async def update_campaign_review(self, campaign: CreativeCampaignReview) -> CreativeCampaignReview:
        campaign.updated_at = datetime.now()
        await campaign.save()
        return campaign

    async def get_campaign_review(self, company_id: str, project_id: str, campaign_id: str) -> CreativeCampaignReview | None:
        return await CreativeCampaignReview.find_one(
            CreativeCampaignReview.company_id == company_id,
            CreativeCampaignReview.project_id == project_id,
            CreativeCampaignReview.campaign_id == campaign_id,
        )

    async def create_issues(self, issues: List[CreativeIssue]) -> List[CreativeIssue]:
        for issue in issues:
            await issue.insert()
        return issues

    async def create_suggestions(self, suggestions: List[CreativeSuggestion]) -> List[CreativeSuggestion]:
        for suggestion in suggestions:
            await suggestion.insert()
        return suggestions

    async def create_history(self, history: CreativeReviewHistory) -> CreativeReviewHistory:
        await history.insert()
        return history

    async def delete_review_artifacts(self, review_id: str) -> None:
        await CreativeIssue.find(CreativeIssue.review_id == review_id).delete()
        await CreativeSuggestion.find(CreativeSuggestion.review_id == review_id).delete()
        await CreativeReviewHistory.find(CreativeReviewHistory.review_id == review_id).delete()

    async def get_review(self, review_id: str) -> CreativeReview | None:
        return await CreativeReview.get(review_id)

    async def get_asset_by_asset_id(self, asset_id: str) -> CreativeAssetMetadata | None:
        return await CreativeAssetMetadata.find_one(CreativeAssetMetadata.asset_id == asset_id)

    async def get_asset_metadata(self, company_id: str, asset_id: str) -> CreativeAssetMetadata | None:
        return await CreativeAssetMetadata.find_one(
            CreativeAssetMetadata.company_id == company_id,
            CreativeAssetMetadata.asset_id == asset_id,
        )

    async def list_project_reviews(self, company_id: str, project_id: str, limit: int, skip: int) -> List[CreativeReview]:
        return await CreativeReview.find(
            CreativeReview.company_id == company_id,
            CreativeReview.project_id == project_id,
        ).sort("-created_at").skip(skip).limit(limit).to_list()

    async def list_asset_reviews(self, company_id: str, asset_id: str, limit: int, skip: int) -> List[CreativeReview]:
        return await CreativeReview.find(
            CreativeReview.company_id == company_id,
            CreativeReview.asset_id == asset_id,
        ).sort("-created_at").skip(skip).limit(limit).to_list()

    async def list_review_issues(self, review_id: str) -> List[CreativeIssue]:
        return await CreativeIssue.find(CreativeIssue.review_id == review_id).sort("created_at").to_list()

    async def list_review_suggestions(self, review_id: str) -> List[CreativeSuggestion]:
        return await CreativeSuggestion.find(CreativeSuggestion.review_id == review_id).sort("created_at").to_list()

    async def list_review_history(self, review_id: str) -> List[CreativeReviewHistory]:
        return await CreativeReviewHistory.find(CreativeReviewHistory.review_id == review_id).sort("created_at").to_list()

    async def get_active_policy(self, company_id: str, project_id: str | None = None, campaign_id: str | None = None) -> ReviewPolicy | None:
        query = [ReviewPolicy.company_id == company_id, ReviewPolicy.is_active == True]  # noqa: E712
        if campaign_id:
            query.append(ReviewPolicy.campaign_id == campaign_id)
        if project_id:
            query.append(ReviewPolicy.project_id == project_id)
        return await ReviewPolicy.find_one(*query)

