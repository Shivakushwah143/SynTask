from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status

from app.ai.tools import ToolContext, ToolRegistry
from app.models.user import User
from app.schemas.ai import (
    AILeadIntelligenceMatch,
    AILeadIntelligenceRequest,
    AILeadIntelligenceResponse,
)


def _safe_str(value: Any) -> str:
    return str(value or "").strip()


def _lead_display_name(lead_context: dict[str, Any]) -> str:
    lead = lead_context.get("lead") or {}
    return _safe_str(lead.get("prospect_name") or lead.get("lead_name") or lead.get("name") or lead.get("id"))


def _score_from_context(lead_context: dict[str, Any]) -> tuple[int, list[str]]:
    lead = lead_context.get("lead") or {}
    company = lead_context.get("company") or {}
    contact = lead_context.get("contact") or {}
    deal = lead_context.get("deal") or {}
    proposals = lead_context.get("proposals") or []
    notes = lead_context.get("notes") or {}
    files = lead_context.get("files") or {}
    recent_activities = lead_context.get("recent_activities") or []
    recent_follow_ups = lead_context.get("recent_follow_ups") or []
    recent_tasks = lead_context.get("recent_tasks") or []
    timeline = lead_context.get("timeline") or {}
    source_information = lead_context.get("source_information") or {}

    score = 0
    signals: list[str] = []

    if lead.get("email"):
        score += 10
        signals.append("Lead has an email address.")
    if lead.get("phone"):
        score += 10
        signals.append("Lead has a phone number.")
    if company:
        score += 15
        signals.append("Lead is linked to a company.")
    if contact:
        score += 10
        signals.append("Lead is linked to a contact.")
    if deal:
        score += 20
        signals.append("Lead has an active deal context.")
        if deal.get("stage") in {"Proposal Sent", "Negotiation"}:
            score += 10
            signals.append("Deal is in a late-stage sales motion.")
        if deal.get("value") and float(deal.get("value") or 0) >= 100000:
            score += 10
            signals.append("Deal value indicates an enterprise opportunity.")
    if proposals:
        score += min(10, len(proposals) * 2)
        signals.append("Proposal history is available.")
    if notes.get("total", 0):
        score += min(10, int(notes.get("total", 0)))
        signals.append("Notes exist on the lead.")
    if files.get("total", 0):
        score += min(5, int(files.get("total", 0)))
        signals.append("Files are attached to the lead.")
    if recent_activities:
        score += min(10, len(recent_activities) * 2)
        signals.append("Recent activities show active engagement.")
    if recent_follow_ups:
        score += min(10, len(recent_follow_ups) * 2)
        signals.append("Follow-up history is present.")
    if recent_tasks:
        score += min(5, len(recent_tasks))
        signals.append("Tasks exist for this lead.")
    if timeline.get("total", 0) or timeline.get("items"):
        score += 5
        signals.append("Timeline history is available.")

    source = str(source_information.get("source") or lead.get("source") or "").strip().lower()
    if source in {"website_form", "website", "meta_lead_ads", "meta", "google_ads", "google"}:
        score += 10
        signals.append("Source indicates an inbound intent channel.")
    elif source in {"referral", "inbound"}:
        score += 6
        signals.append("Source indicates warm inbound intent.")

    if company.get("company_size"):
        company_size = str(company.get("company_size")).lower()
        if any(token in company_size for token in ["enterprise", "500", "1000", "large"]):
            score += 8
            signals.append("Company size suggests enterprise potential.")

    score = max(0, min(100, score))
    return score, signals


def _classify_buying_intent(score: int, lead_context: dict[str, Any]) -> str:
    company = lead_context.get("company") or {}
    deal = lead_context.get("deal") or {}
    source_information = lead_context.get("source_information") or {}
    source = str(source_information.get("source") or "").lower()

    if deal and str(deal.get("stage") or "").lower() == "won":
        return "existing_customer"
    if any(token in str(company.get("company_size") or "").lower() for token in ["enterprise", "500", "1000", "large"]):
        return "enterprise"
    if score >= 80:
        return "hot"
    if score >= 50:
        return "warm"
    if source in {"website_form", "website", "meta_lead_ads", "meta", "google_ads", "google"}:
        return "warm"
    return "cold"


def _classify_urgency(score: int, duplicate_risk: bool) -> str:
    if duplicate_risk:
        return "review"
    if score >= 85:
        return "immediate"
    if score >= 65:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _classify_priority(score: int, urgency: str, buying_intent: str) -> str:
    if urgency in {"immediate", "high"} or buying_intent in {"enterprise", "hot", "existing_customer"}:
        return "high"
    if score >= 50:
        return "medium"
    return "low"


def _recommended_stage(score: int, buying_intent: str, lead_context: dict[str, Any]) -> str:
    current_stage = _safe_str((lead_context.get("assignment_information") or {}).get("current_stage"))
    if buying_intent == "existing_customer":
        return "Won"
    if buying_intent == "enterprise":
        return "Proposal Sent" if score >= 70 else "Qualified"
    if score >= 80:
        return "Proposal Sent"
    if score >= 55:
        return "Discovery Scheduled"
    if current_stage:
        return current_stage
    return "Contacted"


def _recommended_next_action(score: int, buying_intent: str, duplicate_risk: bool) -> str:
    if duplicate_risk:
        return "Review and merge duplicate records before outreach."
    if buying_intent == "existing_customer":
        return "Coordinate the next cross-sell or expansion conversation."
    if score >= 80:
        return "Send a proposal and schedule a decision call."
    if score >= 55:
        return "Book a discovery meeting and qualify the budget, timeline, and stakeholders."
    if score >= 30:
        return "Send a tailored follow-up and request more buying context."
    return "Enrich the record before the next outreach."


def _recommended_salesperson(lead_context: dict[str, Any]) -> dict[str, Any]:
    assignment = lead_context.get("assignment_information") or {}
    return {
        "id": assignment.get("assigned_to"),
        "name": assignment.get("assigned_to_name"),
        "source": "current_assignment",
    }


def _detect_duplicates(lead_context: dict[str, Any], search_results: dict[str, Any]) -> tuple[bool, list[AILeadIntelligenceMatch]]:
    lead = lead_context.get("lead") or {}
    current_id = _safe_str(lead.get("id"))
    current_email = _safe_str(lead.get("email")).lower()
    current_phone = _safe_str(lead.get("phone"))
    current_name = _safe_str(lead.get("prospect_name")).lower()

    matches: list[AILeadIntelligenceMatch] = []
    for item in search_results.get("leads", []):
        lead_id = _safe_str(item.get("id"))
        if not lead_id or lead_id == current_id:
            continue
        score = 0
        if current_email and _safe_str(item.get("email")).lower() == current_email:
            score += 60
        if current_phone and _safe_str(item.get("phone")) == current_phone:
            score += 50
        if current_name and _safe_str(item.get("prospect_name")).lower() == current_name:
            score += 30
        if score <= 0:
            continue
        matches.append(
            AILeadIntelligenceMatch(
                lead_id=lead_id,
                prospect_name=_safe_str(item.get("prospect_name")),
                company_name=_safe_str(item.get("company_name")),
                email=_safe_str(item.get("email")) or None,
                phone=_safe_str(item.get("phone")) or None,
                match_score=min(100, score),
            )
        )
    return bool(matches), matches


@dataclass(slots=True)
class LeadIntelligenceAgent:
    tool_registry: ToolRegistry

    async def analyze(
        self,
        current_user: User,
        request: AILeadIntelligenceRequest,
    ) -> AILeadIntelligenceResponse:
        lead_id = _safe_str(request.lead_id)
        if not lead_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id is required")

        tool_context = ToolContext(
            current_user=current_user,
            tool_name="leadIntelligence",
            metadata={"depth": request.depth, "persist": request.persist},
        )

        context_result = await self.tool_registry.execute(
            "getCRMContext",
            {"lead_id": lead_id, "depth": request.depth},
            tool_context,
        )
        if not context_result.success:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=context_result.error or "Unable to load CRM context")

        lead_context = context_result.data
        lead = lead_context.get("lead") or {}
        duplicate_query = " ".join(
            part
            for part in [
                _safe_str(lead.get("prospect_name")),
                _safe_str(lead.get("company_name")),
                _safe_str(lead.get("email")),
                _safe_str(lead.get("phone")),
            ]
            if part
        ).strip()
        if duplicate_query:
            search_result = await self.tool_registry.execute(
                "searchCRM",
                {"query": duplicate_query, "limit": 10},
                tool_context,
            )
            search_payload = search_result.data if search_result.success else {"leads": []}
        else:
            search_payload = {"leads": []}

        duplicate_risk, duplicate_matches = _detect_duplicates(lead_context, search_payload)
        score, signals = _score_from_context(lead_context)
        buying_intent = _classify_buying_intent(score, lead_context)
        urgency = _classify_urgency(score, duplicate_risk)
        priority = _classify_priority(score, urgency, buying_intent)
        recommended_stage = _recommended_stage(score, buying_intent, lead_context)
        recommended_next_action = _recommended_next_action(score, buying_intent, duplicate_risk)
        recommended_salesperson = _recommended_salesperson(lead_context)

        reasoning = [
            f"Context depth: {request.depth}",
            *signals,
        ]
        if duplicate_risk:
            reasoning.append("Potential duplicate records were detected during CRM search.")
        if lead_context.get("assignment_information", {}).get("assigned_to_name"):
            reasoning.append("Existing assignment was used as the baseline salesperson recommendation.")

        return AILeadIntelligenceResponse(
            lead_id=lead_id,
            lead_name=_lead_display_name(lead_context),
            company_name=_safe_str((lead_context.get("company") or {}).get("name")) or None,
            lead_score=score,
            priority=priority,
            urgency=urgency,
            buying_intent=buying_intent,
            duplicate_risk=duplicate_risk,
            duplicate_matches=duplicate_matches,
            recommended_salesperson=recommended_salesperson,
            recommended_pipeline_stage=recommended_stage,
            recommended_next_action=recommended_next_action,
            reasoning_summary=" ".join(reasoning).strip(),
            source="tool_layer",
            provider="deterministic",
            model="lead-intelligence-v1",
            generated_at=datetime.now(timezone.utc),
            context=lead_context,
        )
