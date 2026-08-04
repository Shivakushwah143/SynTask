from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class CRMDocumentType(str, Enum):
    QUOTATION = "quotation"
    CONTRACT = "contract"


class CRMDocumentStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    VIEWED = "viewed"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CHANGES_REQUESTED = "changes_requested"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class CRMDocument(Document):
    company_id: Indexed(str)
    lead_id: Indexed(str)
    document_type: CRMDocumentType
    document_number: Indexed(str)
    title: str
    currency: str = "INR"
    subtotal: Decimal = Decimal("0")
    discount_total: Decimal = Decimal("0")
    tax_total: Decimal = Decimal("0")
    grand_total: Decimal = Decimal("0")
    status: CRMDocumentStatus = CRMDocumentStatus.DRAFT
    valid_until: Optional[datetime] = None
    content_snapshot: dict[str, Any] = Field(default_factory=dict)
    terms: Optional[str] = None
    notes: Optional[str] = None
    pdf_file_path: Optional[str] = None
    source_file_path: Optional[str] = None
    source_file_url: Optional[str] = None
    source_file_name: Optional[str] = None
    created_by: Optional[str] = None
    sent_to: Optional[str] = None
    send_error: Optional[str] = None
    token_hash: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    token_revoked_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    sent_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None

    class Settings:
        name = "crm_documents"
        indexes = [
            "company_id",
            "lead_id",
            "status",
            IndexModel([("company_id", ASCENDING), ("document_number", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("token_hash", ASCENDING)], unique=True, partialFilterExpression={"token_hash": {"$type": "string"}}),
        ]


class CRMDocumentEvent(Document):
    company_id: Indexed(str)
    lead_id: Indexed(str)
    document_id: Indexed(str)
    event_type: str
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "crm_document_events"
        indexes = [
            "company_id",
            "lead_id",
            "document_id",
            IndexModel([("company_id", ASCENDING), ("document_id", ASCENDING), ("created_at", DESCENDING)]),
        ]


class CRMDocumentSequence(Document):
    company_id: Indexed(str)
    document_type: CRMDocumentType
    year: int
    next_number: int = 1

    class Settings:
        name = "crm_document_sequences"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("document_type", ASCENDING), ("year", ASCENDING)], unique=True),
        ]
