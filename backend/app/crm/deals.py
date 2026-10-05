from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from app.timeline.publisher import publish_crm_timeline_event
from app.models.crm_deal import CRMDeal
from app.models.crm_proposal import CRMProposal, CRMProposalStatus
from app.crm.models import SalesProspect
from app.models.user import User, UserRole
from app.core.clock import utc_now


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _company_id_for_user(current_user: User) -> str:
    company_id = str(getattr(current_user, "company_id", "") or "").strip()
    if not company_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")
    return company_id


def _can_access_lead(current_user: User, prospect: SalesProspect) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if prospect.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role == UserRole.EMPLOYEE:
        current_user_id = str(getattr(current_user, "id", ""))
        if prospect.assigned_to != current_user_id and prospect.assigned_by != current_user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def _load_lead(current_user: User, lead_id: str) -> SalesProspect:
    prospect = await SalesProspect.get(lead_id)
    if not prospect or prospect.deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    _can_access_lead(current_user, prospect)
    return prospect


def _serialize_deal(deal: CRMDeal, proposals: List[CRMProposal]) -> Dict[str, Any]:
    latest = proposals[0] if proposals else None
    return {
        "id": str(deal.id),
        "company_id": deal.company_id,
        "lead_id": deal.lead_id,
        "contact_id": deal.contact_id,
        "value": deal.value,
        "stage": deal.stage,
        "probability": deal.probability,
        "expected_close_date": deal.expected_close_date,
        "decision_maker": deal.decision_maker,
        "competitors": deal.competitors,
        "negotiation_notes": deal.negotiation_notes,
        "archived": deal.archived,
        "created_at": deal.created_at,
        "updated_at": deal.updated_at,
        "latest_proposal_id": str(latest.id) if latest else None,
        "latest_proposal_status": latest.status.value if latest else None,
    }


def _serialize_proposal(proposal: CRMProposal) -> Dict[str, Any]:
    return {
        "id": str(proposal.id),
        "company_id": proposal.company_id,
        "deal_id": proposal.deal_id,
        "lead_id": proposal.lead_id,
        "contact_id": proposal.contact_id,
        "version": proposal.version,
        "title": proposal.title,
        "summary": proposal.summary,
        "status": proposal.status.value if proposal.status else CRMProposalStatus.DRAFT.value,
        "draft_at": proposal.draft_at,
        "generated_at": proposal.generated_at,
        "sent_at": proposal.sent_at,
        "viewed_at": proposal.viewed_at,
        "accepted_at": proposal.accepted_at,
        "rejected_at": proposal.rejected_at,
        "revision_requested_at": proposal.revision_requested_at,
        "expired_at": proposal.expired_at,
        "deal_value": proposal.deal_value,
        "expected_close_date": proposal.expected_close_date,
        "probability": proposal.probability,
        "negotiation_notes": proposal.negotiation_notes,
        "competitors": proposal.competitors,
        "decision_maker": proposal.decision_maker,
        "archived": proposal.archived,
        "archived_at": proposal.archived_at,
        "archived_by": proposal.archived_by,
        "created_by": proposal.created_by,
        "created_by_name": proposal.created_by_name,
        "updated_by": proposal.updated_by,
        "updated_by_name": proposal.updated_by_name,
        "created_at": proposal.created_at,
        "updated_at": proposal.updated_at,
    }


def _normalize_status(value: Optional[str]) -> CRMProposalStatus:
    if not value:
        return CRMProposalStatus.DRAFT
    normalized = str(value).strip().lower()
    try:
        return CRMProposalStatus(normalized)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown proposal status") from exc


def _proposal_timeline_event(status: CRMProposalStatus, archived: bool = False) -> str:
    if archived:
        return "ProposalArchived"
    mapping = {
        CRMProposalStatus.DRAFT: "ProposalCreated",
        CRMProposalStatus.GENERATED: "ProposalGenerated",
        CRMProposalStatus.SENT: "ProposalSent",
        CRMProposalStatus.VIEWED: "ProposalViewed",
        CRMProposalStatus.ACCEPTED: "ProposalAccepted",
        CRMProposalStatus.REJECTED: "ProposalRejected",
        CRMProposalStatus.REVISION_REQUESTED: "ProposalRevisionRequested",
        CRMProposalStatus.EXPIRED: "ProposalExpired",
    }
    return mapping.get(status, "ProposalCreated")


_PROPOSAL_STATUS_TRANSITIONS: Dict[CRMProposalStatus, set[CRMProposalStatus]] = {
    CRMProposalStatus.DRAFT: {CRMProposalStatus.GENERATED, CRMProposalStatus.SENT, CRMProposalStatus.REVISION_REQUESTED, CRMProposalStatus.ARCHIVED},
    CRMProposalStatus.GENERATED: {CRMProposalStatus.SENT, CRMProposalStatus.VIEWED, CRMProposalStatus.ACCEPTED, CRMProposalStatus.REJECTED, CRMProposalStatus.REVISION_REQUESTED, CRMProposalStatus.EXPIRED, CRMProposalStatus.ARCHIVED},
    CRMProposalStatus.SENT: {CRMProposalStatus.VIEWED, CRMProposalStatus.ACCEPTED, CRMProposalStatus.REJECTED, CRMProposalStatus.EXPIRED, CRMProposalStatus.REVISION_REQUESTED, CRMProposalStatus.ARCHIVED},
    CRMProposalStatus.VIEWED: {CRMProposalStatus.ACCEPTED, CRMProposalStatus.REJECTED, CRMProposalStatus.EXPIRED, CRMProposalStatus.REVISION_REQUESTED, CRMProposalStatus.ARCHIVED},
    CRMProposalStatus.REVISION_REQUESTED: {CRMProposalStatus.GENERATED, CRMProposalStatus.SENT, CRMProposalStatus.VIEWED, CRMProposalStatus.ACCEPTED, CRMProposalStatus.REJECTED, CRMProposalStatus.ARCHIVED},
    CRMProposalStatus.ACCEPTED: {CRMProposalStatus.ARCHIVED},
    CRMProposalStatus.REJECTED: {CRMProposalStatus.ARCHIVED},
    CRMProposalStatus.EXPIRED: {CRMProposalStatus.ARCHIVED},
    CRMProposalStatus.ARCHIVED: set(),
}


async def _sync_lead_proposal_status(prospect: SalesProspect, proposal: CRMProposal, current_user: User, now: datetime) -> None:
    """Mirror the canonical proposal status onto the lead's Proposal stage status.

    The Proposal stage inner status is a synchronized snapshot of the CRMProposal
    record (single source of truth), so a status change here can never conflict
    with the proposal's own status.
    """
    from app.crm.pipeline import apply_stage_status_change

    apply_stage_status_change(prospect, stage_key="proposal", new_status=proposal.status.value, user=current_user, now=now)
    prospect.updated_at = now
    await prospect.save()


def _apply_proposal_status_transition(proposal: CRMProposal, next_status: CRMProposalStatus, now: datetime) -> None:
    current_status = proposal.status or CRMProposalStatus.DRAFT
    if current_status == next_status:
        return
    if next_status not in _PROPOSAL_STATUS_TRANSITIONS.get(current_status, set()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid proposal status transition")

    proposal.status = next_status
    if next_status == CRMProposalStatus.DRAFT:
        proposal.draft_at = proposal.draft_at or now
    elif next_status == CRMProposalStatus.GENERATED:
        proposal.generated_at = proposal.generated_at or now
    elif next_status == CRMProposalStatus.SENT:
        proposal.sent_at = proposal.sent_at or now
    elif next_status == CRMProposalStatus.VIEWED:
        proposal.viewed_at = proposal.viewed_at or now
    elif next_status == CRMProposalStatus.ACCEPTED:
        proposal.accepted_at = proposal.accepted_at or now
    elif next_status == CRMProposalStatus.REJECTED:
        proposal.rejected_at = proposal.rejected_at or now
    elif next_status == CRMProposalStatus.REVISION_REQUESTED:
        proposal.revision_requested_at = proposal.revision_requested_at or now
    elif next_status == CRMProposalStatus.EXPIRED:
        proposal.expired_at = proposal.expired_at or now


class CRMDealService:
    @staticmethod
    async def get_deal(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await _load_lead(current_user, lead_id)
        company_id = _company_id_for_user(current_user)
        deal = await CRMDeal.find_one({"company_id": company_id, "lead_id": str(prospect.id)})
        proposals = await CRMProposal.find({"company_id": company_id, "lead_id": str(prospect.id), "archived": False}).sort("-version").to_list()
        if not deal:
            deal = CRMDeal(
                company_id=company_id,
                lead_id=str(prospect.id),
                contact_id=getattr(prospect, "contact_id", None),
                value=float(getattr(prospect, "won_amount", 0) or 0),
                stage=str(getattr(prospect, "current_stage", "qualified") or "qualified"),
                probability=0,
                expected_close_date=getattr(prospect, "estimated_close_date", None),
                decision_maker=getattr(prospect, "prospect_name", None),
                competitors=[],
                negotiation_notes=getattr(prospect, "remark", None),
                created_by=str(getattr(current_user, "id", "")),
                created_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
                updated_by=str(getattr(current_user, "id", "")),
                updated_by_name=_display_name(current_user, str(getattr(current_user, "id", "system"))),
            )
            await deal.insert()
        return {
            "lead_id": str(prospect.id),
            "deal": _serialize_deal(deal, proposals),
            "proposals": [_serialize_proposal(item) for item in proposals],
        }

    @staticmethod
    async def upsert_deal(current_user: User, lead_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        prospect = await _load_lead(current_user, lead_id)
        company_id = _company_id_for_user(current_user)
        deal = await CRMDeal.find_one({"company_id": company_id, "lead_id": str(prospect.id)})
        now = utc_now()
        if not deal:
            deal = CRMDeal(company_id=company_id, lead_id=str(prospect.id), created_by=str(current_user.id), created_by_name=_display_name(current_user, str(current_user.id)))

        if "contact_id" in payload:
            deal.contact_id = payload.get("contact_id") or None
        if "value" in payload:
            deal.value = float(payload.get("value") or 0)
        if "stage" in payload:
            deal.stage = str(payload.get("stage") or deal.stage)
        if "probability" in payload:
            deal.probability = max(0, min(100, int(payload.get("probability") or 0)))
        if "expected_close_date" in payload:
            deal.expected_close_date = payload.get("expected_close_date")
        if "decision_maker" in payload:
            deal.decision_maker = str(payload.get("decision_maker") or "").strip() or None
        if "competitors" in payload:
            competitors = payload.get("competitors") or []
            if not isinstance(competitors, list):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Competitors must be a list")
            deal.competitors = [str(item).strip() for item in competitors if str(item).strip()]
        if "negotiation_notes" in payload:
            deal.negotiation_notes = str(payload.get("negotiation_notes") or "").strip() or None
        deal.updated_by = str(current_user.id)
        deal.updated_by_name = _display_name(current_user, str(current_user.id))
        deal.updated_at = now
        await deal.save()

        await publish_crm_timeline_event(
            event_name="DealUpdated",
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(current_user.id),
            payload={
                "lead_id": str(prospect.id),
                "deal_id": str(deal.id),
                "value": deal.value,
                "stage": deal.stage,
                "probability": deal.probability,
                "expected_close_date": deal.expected_close_date.isoformat() if deal.expected_close_date else None,
                "decision_maker": deal.decision_maker,
                "competitors": deal.competitors,
                "negotiation_notes": deal.negotiation_notes,
                "timestamp": now.isoformat(),
            },
            metadata={"surface": "crm", "workflow": "deal"},
        )
        return await CRMDealService.get_deal(current_user, lead_id)

    @staticmethod
    async def list_proposals(current_user: User, lead_id: str) -> Dict[str, Any]:
        prospect = await _load_lead(current_user, lead_id)
        company_id = _company_id_for_user(current_user)
        deal = await CRMDeal.find_one({"company_id": company_id, "lead_id": str(prospect.id)})
        if not deal:
            data = await CRMDealService.get_deal(current_user, lead_id)
            deal = await CRMDeal.find_one({"company_id": company_id, "lead_id": str(prospect.id)})
            return data
        proposals = await CRMProposal.find({"company_id": company_id, "deal_id": str(deal.id)}).sort("-version").to_list()
        return {
            "lead_id": str(prospect.id),
            "deal": _serialize_deal(deal, proposals),
            "proposals": [_serialize_proposal(item) for item in proposals],
        }

    @staticmethod
    async def create_proposal(current_user: User, lead_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        prospect = await _load_lead(current_user, lead_id)
        company_id = _company_id_for_user(current_user)
        deal_data = await CRMDealService.get_deal(current_user, lead_id)
        deal = await CRMDeal.find_one({"company_id": company_id, "lead_id": str(prospect.id)})
        assert deal is not None
        existing = await CRMProposal.find({"company_id": company_id, "deal_id": str(deal.id)}).sort("-version").to_list()
        version = (existing[0].version if existing else 0) + 1
        now = utc_now()
        proposal = CRMProposal(
            company_id=company_id,
            deal_id=str(deal.id),
            lead_id=str(prospect.id),
            contact_id=deal.contact_id,
            version=version,
            title=str(payload.get("title") or f"Proposal v{version}").strip(),
            summary=str(payload.get("summary") or "").strip() or None,
            status=CRMProposalStatus.DRAFT,
            deal_value=float(payload.get("deal_value") or deal.value or 0),
            expected_close_date=payload.get("expected_close_date") or deal.expected_close_date,
            probability=max(0, min(100, int(payload.get("probability") if payload.get("probability") is not None else deal.probability or 0))),
            negotiation_notes=str(payload.get("negotiation_notes") or deal.negotiation_notes or "").strip() or None,
            competitors=[str(item).strip() for item in (payload.get("competitors") or deal.competitors or []) if str(item).strip()],
            decision_maker=str(payload.get("decision_maker") or deal.decision_maker or "").strip() or None,
            created_by=str(current_user.id),
            created_by_name=_display_name(current_user, str(current_user.id)),
            updated_by=str(current_user.id),
            updated_by_name=_display_name(current_user, str(current_user.id)),
            created_at=now,
            updated_at=now,
        )
        target_status = _normalize_status(payload.get("status"))
        if target_status == CRMProposalStatus.DRAFT:
            proposal.draft_at = now
        else:
            _apply_proposal_status_transition(proposal, target_status, now)
        await proposal.insert()
        await _sync_lead_proposal_status(prospect, proposal, current_user, now)
        await publish_crm_timeline_event(
            event_name=_proposal_timeline_event(proposal.status),
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(current_user.id),
            payload={"lead_id": str(prospect.id), "deal_id": str(deal.id), "proposal_id": str(proposal.id), "version": proposal.version, "status": proposal.status.value, "timestamp": now.isoformat()},
            metadata={"surface": "crm", "workflow": "proposal"},
        )
        return {"message": "Proposal created successfully", "deal": deal_data["deal"], "proposal": _serialize_proposal(proposal), "proposals": deal_data["proposals"] + [_serialize_proposal(proposal)]}

    @staticmethod
    async def update_proposal(current_user: User, lead_id: str, proposal_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        prospect = await _load_lead(current_user, lead_id)
        company_id = _company_id_for_user(current_user)
        proposal = await CRMProposal.get(proposal_id)
        if not proposal or proposal.lead_id != str(prospect.id) or proposal.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
        if proposal.archived or proposal.status == CRMProposalStatus.ARCHIVED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archived proposals cannot be modified")
        now = utc_now()
        if "title" in payload:
            proposal.title = str(payload.get("title") or proposal.title).strip()
        if "summary" in payload:
            proposal.summary = str(payload.get("summary") or "").strip() or None
        if "status" in payload:
            _apply_proposal_status_transition(proposal, _normalize_status(payload.get("status")), now)
        if "deal_value" in payload:
            proposal.deal_value = float(payload.get("deal_value") or 0)
        if "expected_close_date" in payload:
            proposal.expected_close_date = payload.get("expected_close_date")
        if "probability" in payload:
            proposal.probability = max(0, min(100, int(payload.get("probability") or 0)))
        if "negotiation_notes" in payload:
            proposal.negotiation_notes = str(payload.get("negotiation_notes") or "").strip() or None
        if "competitors" in payload:
            competitors = payload.get("competitors") or []
            if not isinstance(competitors, list):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Competitors must be a list")
            proposal.competitors = [str(item).strip() for item in competitors if str(item).strip()]
        if "decision_maker" in payload:
            proposal.decision_maker = str(payload.get("decision_maker") or "").strip() or None
        proposal.updated_by = str(current_user.id)
        proposal.updated_by_name = _display_name(current_user, str(current_user.id))
        proposal.updated_at = now
        await proposal.save()
        await _sync_lead_proposal_status(prospect, proposal, current_user, now)

        await publish_crm_timeline_event(
            event_name=_proposal_timeline_event(proposal.status),
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(current_user.id),
            payload={"lead_id": str(prospect.id), "deal_id": str(proposal.deal_id), "proposal_id": str(proposal.id), "version": proposal.version, "status": proposal.status.value, "timestamp": now.isoformat()},
            metadata={"surface": "crm", "workflow": "proposal"},
        )
        proposals = await CRMProposal.find({"company_id": company_id, "deal_id": proposal.deal_id}).sort("-version").to_list()
        deal = await CRMDeal.get(proposal.deal_id)
        return {"message": "Proposal updated successfully", "deal": _serialize_deal(deal, proposals), "proposal": _serialize_proposal(proposal), "proposals": [_serialize_proposal(item) for item in proposals]}

    @staticmethod
    async def archive_proposal(current_user: User, lead_id: str, proposal_id: str) -> Dict[str, Any]:
        prospect = await _load_lead(current_user, lead_id)
        company_id = _company_id_for_user(current_user)
        proposal = await CRMProposal.get(proposal_id)
        if not proposal or proposal.lead_id != str(prospect.id) or proposal.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found")
        now = utc_now()
        proposal.status = CRMProposalStatus.ARCHIVED
        proposal.archived = True
        proposal.archived_at = now
        proposal.archived_by = str(current_user.id)
        proposal.updated_at = now
        proposal.updated_by = str(current_user.id)
        proposal.updated_by_name = _display_name(current_user, str(current_user.id))
        await proposal.save()
        await publish_crm_timeline_event(
            event_name=_proposal_timeline_event(proposal.status, archived=True),
            aggregate_type="sales_prospect",
            aggregate_id=str(prospect.id),
            company_id=company_id,
            actor_id=str(current_user.id),
            payload={"lead_id": str(prospect.id), "deal_id": str(proposal.deal_id), "proposal_id": str(proposal.id), "version": proposal.version, "status": proposal.status.value, "timestamp": now.isoformat()},
            metadata={"surface": "crm", "workflow": "proposal"},
        )
        proposals = await CRMProposal.find({"company_id": company_id, "deal_id": proposal.deal_id}).sort("-version").to_list()
        deal = await CRMDeal.get(proposal.deal_id)
        return {"message": "Proposal archived successfully", "deal": _serialize_deal(deal, proposals), "proposal": _serialize_proposal(proposal), "proposals": [_serialize_proposal(item) for item in proposals]}

