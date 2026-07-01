from __future__ import annotations

from datetime import datetime
import logging
from typing import Any, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_company_admin_or_lead, get_current_user, get_project_by_id
from app.events import publish_event
from app.events.factories import build_domain_event
from app.creative.service import CreativeReviewService
from app.models.creative_review import CreativeAssetMetadata, CreativeCampaignReview, CreativeFeedbackAction, CreativeReview
from app.models.project import Project
from app.models.user import User
from app.worker.tasks.creative_review_tasks import enqueue_creative_review_task

router = APIRouter()
creative_service = CreativeReviewService()
logger = logging.getLogger(__name__)


class CreativeReviewCreateRequest(BaseModel):
    asset_id: Optional[str] = None
    file_name: Optional[str] = None
    file_url: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    objective: Optional[str] = None
    channel: Optional[str] = None
    designer_notes: Optional[str] = None
    source_type: str = "project_file"


class CreativeCampaignCreateRequest(BaseModel):
    campaign_id: str = Field(min_length=1)
    campaign_name: str = Field(min_length=1)
    objective: Optional[str] = None
    channel: Optional[str] = None


class CreativeFeedbackRequest(BaseModel):
    action: CreativeFeedbackAction
    notes: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


def _review_payload(review: CreativeReview) -> dict[str, Any]:
    return {
        "id": str(review.id),
        "company_id": review.company_id,
        "project_id": review.project_id,
        "campaign_id": review.campaign_id,
        "asset_id": review.asset_id,
        "status": review.status.value,
        "summary": review.summary,
        "decision": review.decision.value if review.decision else None,
        "brand_score": review.brand_score,
        "ux_score": review.ux_score,
        "accessibility_score": review.accessibility_score,
        "marketing_score": review.marketing_score,
        "requirement_score": review.requirement_score,
        "creative_quality_score": review.creative_quality_score,
        "overall_score": review.overall_score,
        "risk_level": review.risk_level,
        "issue_count": review.issue_count,
        "critical_issue_count": review.critical_issue_count,
        "model_version": review.model_version,
        "prompt_version": review.prompt_version,
        "rule_version": review.rule_version,
        "analyzer_versions": review.analyzer_versions,
        "review_config": review.review_config,
        "context_snapshot": review.context_snapshot.model_dump(),
        "human_feedback": review.human_feedback,
        "created_by": review.created_by,
        "reviewed_by": review.reviewed_by,
        "queued_at": review.queued_at,
        "started_at": review.started_at,
        "completed_at": review.completed_at,
        "failed_at": review.failed_at,
        "error_message": review.error_message,
        "created_at": review.created_at,
        "updated_at": review.updated_at,
    }


def _issue_payload(issue) -> dict[str, Any]:
    return {
        "id": str(issue.id),
        "review_id": issue.review_id,
        "asset_id": issue.asset_id,
        "analyzer_key": issue.analyzer_key,
        "analyzer_version": issue.analyzer_version,
        "category": issue.category,
        "title": issue.title,
        "description": issue.description,
        "severity": issue.severity.value,
        "confidence": issue.confidence,
        "evidence": issue.evidence,
        "related_requirement": issue.related_requirement,
        "suggested_fix": issue.suggested_fix,
        "metadata": issue.metadata,
        "created_at": issue.created_at,
    }


def _suggestion_payload(suggestion) -> dict[str, Any]:
    return {
        "id": str(suggestion.id),
        "review_id": suggestion.review_id,
        "issue_id": suggestion.issue_id,
        "title": suggestion.title,
        "reason": suggestion.reason,
        "priority": suggestion.priority,
        "evidence": suggestion.evidence,
        "recommended_fix": suggestion.recommended_fix,
        "action_type": suggestion.action_type,
        "metadata": suggestion.metadata,
        "created_at": suggestion.created_at,
    }


@router.post("/projects/{project_id}/creative-reviews")
async def create_project_creative_review(
    project_id: str,
    payload: CreativeReviewCreateRequest,
    current_user: User = Depends(get_current_user),
):
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not payload.file_url and not payload.asset_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="asset_id or file_url is required")

    asset_id = payload.asset_id or uuid.uuid4().hex
    file_name = payload.file_name or asset_id
    file_url = payload.file_url or f"/api/v1/files/projects/{file_name}"
    asset = await creative_service.orchestrator.create_asset_metadata(
        company_id=str(current_user.company_id),
        project_id=str(project.project_id or project.id),
        asset_id=asset_id,
        file_name=file_name,
        file_url=file_url,
        source_type=payload.source_type,
        mime_type=payload.mime_type,
        file_size=payload.file_size,
        campaign_id=payload.campaign_id,
        uploaded_by=str(current_user.id),
        metadata={"designer_notes": payload.designer_notes},
    )

    campaign_review = None
    if payload.campaign_id:
        campaign_review = await creative_service.create_campaign_review(
            current_user=current_user,
            project=project,
            campaign_id=payload.campaign_id,
            campaign_name=payload.campaign_name or payload.campaign_id,
            objective=payload.objective,
            channel=payload.channel,
            asset_ids=[asset.asset_id],
        )

    review = await creative_service.create_review_for_asset(
        current_user=current_user,
        project=project,
        asset_metadata=asset,
        campaign_review=campaign_review,
        designer_notes=payload.designer_notes,
    )

    enqueue_creative_review_task.delay(str(review.id), str(current_user.id))
    await publish_event(
        build_domain_event(
            event_name="CreativeUploaded",
            aggregate_type="creative_review",
            aggregate_id=str(review.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload=_review_payload(review),
            project_id=str(project.project_id or project.id),
            campaign_id=str(campaign_review.campaign_id) if campaign_review else None,
            metadata={"source": "creative_upload"},
        )
    )
    return {
        "message": "Creative review queued",
        "review": _review_payload(review),
        "asset": asset.model_dump(),
        "campaign_review": campaign_review.model_dump() if campaign_review else None,
    }


@router.post("/projects/{project_id}/campaign-reviews")
async def create_campaign_review(
    project_id: str,
    payload: CreativeCampaignCreateRequest,
    current_user: User = Depends(get_current_user),
):
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    campaign = await creative_service.create_campaign_review(
        current_user=current_user,
        project=project,
        campaign_id=payload.campaign_id,
        campaign_name=payload.campaign_name,
        objective=payload.objective,
        channel=payload.channel,
    )
    return {"campaign_review": campaign.model_dump()}


@router.get("/projects/{project_id}/creative-reviews")
async def list_project_creative_reviews(
    project_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    reviews = await creative_service.list_project_reviews(str(current_user.company_id), str(project.project_id or project.id), skip, limit)
    return {"reviews": [_review_payload(review) for review in reviews], "skip": skip, "limit": limit}


@router.get("/projects/{project_id}/campaign-reviews")
async def list_project_campaign_reviews(
    project_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    project, _ = await get_project_by_id(project_id, current_user.company_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    campaigns = await creative_service.list_campaign_reviews(str(current_user.company_id), str(project.project_id or project.id), skip, limit)
    return {"campaign_reviews": [campaign.model_dump() for campaign in campaigns], "skip": skip, "limit": limit}


@router.get("/assets/{asset_id}/creative-reviews")
async def list_asset_creative_reviews(
    asset_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    reviews = await creative_service.list_asset_reviews(str(current_user.company_id), asset_id, skip, limit)
    return {"reviews": [_review_payload(review) for review in reviews], "skip": skip, "limit": limit}


@router.get("/creative-reviews/{review_id}")
async def get_creative_review(
    review_id: str,
    current_user: User = Depends(get_current_user),
):
    data = await creative_service.get_review_details(review_id)
    review: CreativeReview = data["review"]
    if review.company_id != str(current_user.company_id) and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return {
        "review": _review_payload(review),
        "issues": [_issue_payload(issue) for issue in data["issues"]],
        "suggestions": [_suggestion_payload(item) for item in data["suggestions"]],
        "history": [item.model_dump() for item in data["history"]],
    }


@router.post("/creative-reviews/{review_id}/rerun")
async def rerun_creative_review(
    review_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    review = await creative_service.repository.get_review(review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if review.company_id != str(current_user.company_id) and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    rerun = await creative_service.rerun_review(review_id, reviewer_id=str(current_user.id))
    return {"review": _review_payload(rerun)}


@router.post("/creative-reviews/{review_id}/feedback")
async def add_review_feedback(
    review_id: str,
    payload: CreativeFeedbackRequest,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    review = await creative_service.repository.get_review(review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if review.company_id != str(current_user.company_id) and current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if payload.action == CreativeFeedbackAction.APPROVE:
        updated = await creative_service.approve_review(review, reviewer_id=str(current_user.id), notes=payload.notes)
        event_name = "CreativeApproved"
    elif payload.action == CreativeFeedbackAction.OVERRIDE:
        updated = await creative_service.override_review(review, reviewer_id=str(current_user.id), notes=payload.notes, payload=payload.payload)
        event_name = "CreativeReviewed"
    elif payload.action == CreativeFeedbackAction.REJECT:
        updated = await creative_service.reject_review(review, reviewer_id=str(current_user.id), notes=payload.notes)
        event_name = "CreativeRejected"
    else:
        updated = await creative_service.ignore_review(review, reviewer_id=str(current_user.id), notes=payload.notes)
        event_name = "CreativeReviewFeedbackAdded"

    await publish_event(
        build_domain_event(
            event_name=event_name,
            aggregate_type="creative_review",
            aggregate_id=str(updated.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload=_review_payload(updated) | {"feedback_action": payload.action.value, "notes": payload.notes, "feedback_payload": payload.payload},
            project_id=str(updated.project_id) if updated.project_id else None,
            campaign_id=str(updated.campaign_id) if updated.campaign_id else None,
            metadata={"source": "creative_feedback"},
        )
    )
    return {"review": _review_payload(updated)}


@router.post("/creative-reviews/{review_id}/approve")
async def approve_review(
    review_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    review = await creative_service.repository.get_review(review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    updated = await creative_service.approve_review(review, reviewer_id=str(current_user.id))
    await publish_event(
        build_domain_event(
            event_name="CreativeApproved",
            aggregate_type="creative_review",
            aggregate_id=str(updated.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload=_review_payload(updated),
            project_id=str(updated.project_id) if updated.project_id else None,
            campaign_id=str(updated.campaign_id) if updated.campaign_id else None,
            metadata={"source": "creative_approval"},
        )
    )
    return {"review": _review_payload(updated)}


@router.post("/creative-reviews/{review_id}/override")
async def override_review(
    review_id: str,
    payload: CreativeFeedbackRequest,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    review = await creative_service.repository.get_review(review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    updated = await creative_service.override_review(review, reviewer_id=str(current_user.id), notes=payload.notes, payload=payload.payload)
    await publish_event(
        build_domain_event(
            event_name="CreativeReviewed",
            aggregate_type="creative_review",
            aggregate_id=str(updated.id),
            company_id=str(current_user.company_id),
            actor_id=str(current_user.id),
            payload=_review_payload(updated) | {"feedback_action": payload.action.value, "notes": payload.notes, "feedback_payload": payload.payload},
            project_id=str(updated.project_id) if updated.project_id else None,
            campaign_id=str(updated.campaign_id) if updated.campaign_id else None,
            metadata={"source": "creative_override"},
        )
    )
    return {"review": _review_payload(updated)}
