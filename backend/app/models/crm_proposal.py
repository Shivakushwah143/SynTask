from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class CRMProposalStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    ARCHIVED = "archived"


class CRMProposal(Document):
    company_id: Indexed(str)
    deal_id: Indexed(str)
    lead_id: Indexed(str)
    contact_id: Optional[str] = None
    version: int = 1
    title: str
    summary: Optional[str] = None
    status: CRMProposalStatus = CRMProposalStatus.DRAFT

    draft_at: datetime = Field(default_factory=datetime.utcnow)
    sent_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None

    deal_value: float = 0.0
    expected_close_date: Optional[datetime] = None
    probability: int = 0
    negotiation_notes: Optional[str] = None
    competitors: List[str] = Field(default_factory=list)
    decision_maker: Optional[str] = None
    archived: bool = False
    archived_at: Optional[datetime] = None
    archived_by: Optional[str] = None

    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "crm_proposals"
        indexes = [
            "company_id",
            "deal_id",
            "lead_id",
            "contact_id",
            "status",
            "archived",
            IndexModel([("company_id", ASCENDING), ("deal_id", ASCENDING), ("version", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING), ("archived", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)]),
        ]
