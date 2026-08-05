"""Lead model.

Legacy storage and import names remain for API and database compatibility.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import EmailStr, Field
from enum import Enum
from pymongo import ASCENDING, DESCENDING, TEXT, IndexModel


class InterestLevel(str, Enum):
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"


class ProspectStatus(str, Enum):
    ACTIVE = "active"
    WON = "won"
    LOST = "lost"
    CLOSED = "closed"


class SalesProspect(Document):
    """Lead linked to contacts, products, and pipeline stages."""

    # Basic Fields (from Contact or new) - All optional except phone for partial lead creation
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    prospect_name: Optional[str] = None  # Auto-generated: First + Last, or set manually
    country_code: Optional[str] = None  # Defaults to +91 if not provided
    phone: Optional[Indexed(str)] = None  # Optional for bulk file import
    email: Optional[EmailStr] = None
    contact_id: Optional[str] = None  # If converted from existing contact

    # Sales-Specific Fields
    category_id: Optional[str] = None  # SalesCategory FK
    product_ids: List[str] = Field(default_factory=list)  # Multiple products
    interest_level: InterestLevel = InterestLevel.WARM
    estimated_close_date: Optional[datetime] = None
    assigned_to: str  # User ID
    assigned_by: Optional[str] = None  # User ID who assigned
    current_stage: str = "new"  # Stage name (from master)
    due_date: Optional[datetime] = None
    due_time: Optional[str] = None  # HH:MM AM/PM format
    remark: Optional[str] = None

    # Company Information (from Contact or new)
    company_name: Optional[str] = None
    crm_company_id: Optional[str] = None
    relationship_type: Optional[str] = None
    channel: Optional[str] = None
    source: str = "bulk_upload"

    # Optional Meta Lead Ads attribution. These are additive so existing leads
    # retain their current CRM contract when the integration is disabled.
    meta_lead_id: Optional[str] = None
    meta_campaign_id: Optional[str] = None
    meta_adset_id: Optional[str] = None
    meta_ad_id: Optional[str] = None
    meta_form_id: Optional[str] = None
    meta_created_time: Optional[datetime] = None
    meta_consent: Optional[bool] = None
    meta_attribution: Dict[str, Any] = Field(default_factory=dict)

    # Additional Information (from Contact or new)
    designation: Optional[str] = None
    nationality: Optional[List[str]] = Field(default_factory=list)
    language: Optional[List[str]] = Field(default_factory=list)
    owner_name: Optional[str] = None
    owner_contact_no: Optional[str] = None
    tag: Optional[List[str]] = Field(default_factory=list)
    greeting_preference: Optional[str] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)

    # Status & Closure
    status: ProspectStatus = ProspectStatus.ACTIVE
    closed_date: Optional[datetime] = None
    closed_by: Optional[str] = None
    reason_for_lost: Optional[str] = None  # From master
    won_amount: Optional[float] = None
    stage_entered_at: Optional[datetime] = None
    stage_last_changed_at: Optional[datetime] = None
    days_in_stage: int = 0

    # ── Sales journey: contact cadence ────────────────────────────────────────
    first_contact_at: Optional[datetime] = None  # First contact attempt recorded
    last_contacted_at: Optional[datetime] = None
    next_action: Optional[str] = None  # Suggested / required next step
    next_follow_up_at: Optional[datetime] = None

    # ── Qualify stage data ────────────────────────────────────────────────────
    qualify_status: Optional[str] = None  # not_contacted, contacted, busy, call_back, wrong_number, no_response, interested, not_interested, spam, qualified
    industry: Optional[str] = None
    requirement: Optional[str] = None
    budget: Optional[float] = None
    timeline: Optional[str] = None
    decision_maker: Optional[str] = None
    location: Optional[str] = None
    pain_points: Optional[str] = None
    current_agency: Optional[str] = None
    num_employees: Optional[str] = None

    # ── Discovery stage data ──────────────────────────────────────────────────
    discovery_outcome: Optional[str] = None  # need_proposal, need_audit, need_second_meeting, follow_up_required, not_interested, lost
    discovery_notes: Optional[str] = None

    # ── Proposal stage (mirror of the authoritative CRMProposal status) ──────
    proposal_status: Optional[str] = None  # draft, generated, sent, viewed, accepted, rejected, revision_requested, expired

    # ── Negotiation stage data ────────────────────────────────────────────────
    negotiation_status: Optional[str] = None  # negotiation_started, waiting_client, waiting_internal, discount_approval, final_offer, accepted, rejected
    negotiation_notes: Optional[str] = None

    # ── Agreement stage data ──────────────────────────────────────────────────
    agreement_status: Optional[str] = None  # draft, sent, viewed, signed, rejected, expired
    agreement_expiry_date: Optional[datetime] = None
    agreement_signed_at: Optional[datetime] = None

    # ── Won / conversion ──────────────────────────────────────────────────────
    won_status: Optional[str] = None  # payment_pending, payment_received, onboarding_started, ready, transferred
    client_id: Optional[str] = None  # Created Client ref (idempotent conversion)
    project_id: Optional[str] = None  # Created Project ref
    invoice_id: Optional[str] = None  # Created Invoice ref
    account_manager_id: Optional[str] = None
    welcome_email_sent_at: Optional[datetime] = None
    ops_notified_at: Optional[datetime] = None
    converted_at: Optional[datetime] = None
    transferred_at: Optional[datetime] = None  # Set when transferred to the Clients module
    transferred_by: Optional[str] = None

    # ── Stage inner status (canonical snapshot) ────────────────────────────────
    # The single display/query value for the lead's condition INSIDE its current
    # stage. Allowed values come from STAGE_INNER_STATUSES for the current stage.
    # The per-stage domain fields (qualify_status, discovery_outcome, ...) stay in
    # sync with this snapshot through one write path (apply_stage_status_change).
    current_stage_status: Optional[str] = None
    # Embedded status history: [{stage, from_status, to_status, changed_by,
    # changed_by_name, changed_at}] — distinct from SalesPipelineHistory (stages).
    stage_status_history: List[Dict[str, Any]] = Field(default_factory=list)

    # Metadata
    company_id: Optional[str] = None
    created_by: Optional[str] = None
    deleted: bool = False

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "sales_prospects"
        indexes = [
            "company_id",
            "assigned_to",
            "assigned_by",
            "current_stage",
            "status",
            "category_id",
            "contact_id",
            "deleted",
            ("country_code", "phone"),  # For duplicate check
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("current_stage", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("status", ASCENDING), ("closed_date", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("assigned_to", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("crm_company_id", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("deleted", ASCENDING), ("country_code", ASCENDING), ("phone", ASCENDING)]),
            IndexModel(
                [("company_id", ASCENDING), ("meta_lead_id", ASCENDING)],
                unique=True,
                partialFilterExpression={"meta_lead_id": {"$type": "string"}},
            ),
            IndexModel([
                ("company_id", ASCENDING),
                ("email", ASCENDING),
            ], unique=True, partialFilterExpression={"email": {"$type": "string"}}),
            IndexModel(
                [("prospect_name", TEXT), ("company_name", TEXT), ("email", TEXT), ("phone", TEXT)],
                language_override="_text_language",
            ),
            "crm_company_id",
        ]

    def unique_key(self) -> str:
        """Unique identifier: country_code + phone"""
        return f"{self.country_code}:{self.phone or ''}"


# Compatibility aliases: old names remain until persisted and API contracts
# can migrate without breaking existing clients.
Lead = SalesProspect
LeadStatus = ProspectStatus
