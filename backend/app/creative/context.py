from __future__ import annotations

from beanie.odm.operators.find.comparison import In

from app.models.client import Client
from app.models.creative_review import CreativeReviewContext, CreativeReviewHistory, CreativeReview, CreativeAssetMetadata, CreativeCampaignReview
from app.models.page import Page
from app.models.project import Project
from app.models.user import User


class CreativeContextBuilder:
    @staticmethod
    async def build(
        *,
        current_user: User,
        project: Project,
        asset_metadata: CreativeAssetMetadata,
        campaign_review: CreativeCampaignReview | None = None,
        designer_notes: str | None = None,
    ) -> CreativeReviewContext:
        client = await CreativeContextBuilder._find_client(project.company_id, project.project_id or str(project.id))
        pages = await Page.find(Page.company_id == project.company_id, Page.project_id == project.project_id).to_list()
        previous_reviews = await CreativeReview.find(
            CreativeReview.company_id == project.company_id,
            CreativeReview.project_id == (project.project_id or str(project.id)),
        ).sort("-created_at").limit(20).to_list()
        feedback = await CreativeReviewHistory.find(
            CreativeReviewHistory.company_id == project.company_id,
            CreativeReviewHistory.project_id == (project.project_id or str(project.id)),
            In(CreativeReviewHistory.event_type, ["feedback", "override", "approve", "reject", "ignore"]),
        ).sort("-created_at").limit(20).to_list()

        deliverables = [
            {
                "id": str(page.id),
                "title": page.title,
                "status": page.status.value,
                "template": page.template,
                "labels": list(page.labels or []),
            }
            for page in pages
        ]

        historical_reviews = [
            {
                "review_id": str(review.id),
                "asset_id": review.asset_id,
                "status": review.status.value,
                "overall_score": review.overall_score,
                "risk_level": review.risk_level,
                "created_at": review.created_at,
            }
            for review in previous_reviews
        ]
        revision_history = [
            {
                "event_type": item.event_type,
                "from_status": item.from_status.value if item.from_status else None,
                "to_status": item.to_status.value if item.to_status else None,
                "notes": item.notes,
                "created_at": item.created_at,
            }
            for item in feedback
        ]

        brand_guidelines = {
            "brand_name": client.company_name if client else project.name,
            "required_colors": [],
            "logo_name": None,
        }
        if getattr(project, "category", None):
            brand_guidelines["brand_name"] = f"{project.category} {project.name}"
        for page in pages[:5]:
            if page.template:
                brand_guidelines.setdefault("templates", []).append(page.template)

        target_audience = {
            "role": getattr(project, "type", None).value if getattr(project, "type", None) else None,
            "department": getattr(current_user, "department", None),
            "team": getattr(current_user, "team_name", None),
        }
        campaign_payload = campaign_review.model_dump() if campaign_review else {}

        return CreativeReviewContext(
            project={
                "id": str(project.id),
                "project_id": project.project_id or str(project.id),
                "name": project.name,
                "key": project.key,
                "description": project.description,
                "status": project.status.value,
                "type": getattr(project.type, "value", project.type),
                "category": project.category,
            },
            campaign=campaign_payload,
            client_requirements=[
                {
                    "name": client.name if client else None,
                    "notes": client.notes if client else None,
                    "industry": client.industry if client else None,
                    "project_ids": list(client.project_ids or []) if client else [],
                }
            ] if client else [],
            brand_guidelines=brand_guidelines,
            target_audience=target_audience,
            deliverables=deliverables,
            reference_assets=list((campaign_review.asset_ids if campaign_review else [])),
            previous_approved_assets=[],
            historical_reviews=historical_reviews,
            reviewer_feedback=[item.payload | {"event_type": item.event_type} for item in feedback],
            revision_history=revision_history,
            designer_notes=[designer_notes] if designer_notes else [],
            asset=asset_metadata.model_dump(),
        )

    @staticmethod
    async def _find_client(company_id: str, project_id: str) -> Client | None:
        clients = await Client.find(
            Client.company_id == company_id,
            In(Client.project_ids, [project_id]),
        ).to_list()
        return clients[0] if clients else None
