"""MongoDB documents owned by the Meta integration."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from beanie import Document
from pydantic import Field, field_validator
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.integrations.meta.redaction import sanitize_error_message


class MetaWebhookStatus(str, Enum):
    RECEIVED = "received"
    QUEUED = "queued"
    PROCESSING = "processing"
    PROCESSED = "processed"
    RETRY_PENDING = "retry_pending"
    FAILED = "failed"
    REJECTED = "rejected"


class MetaSyncStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class MetaIntegrationSettings(Document):
    company_id: str
    enabled: bool = False
    lead_sync_enabled: bool = False
    insights_sync_enabled: bool = False
    inbound_messaging_enabled: bool = False

    page_id: Optional[str] = None
    page_access_token_encrypted: Optional[str] = None
    business_id: Optional[str] = None
    ad_account_id: Optional[str] = None
    system_user_token_encrypted: Optional[str] = None
    lead_form_id: Optional[str] = None
    whatsapp_business_id: Optional[str] = None
    instagram_business_account_id: Optional[str] = None
    messenger_page_id: Optional[str] = None
    instagram_scoped_sender_ids: list[str] = Field(default_factory=list)
    messenger_scoped_sender_ids: list[str] = Field(default_factory=list)
    instagram_scopes: list[str] = Field(default_factory=list)
    messenger_scopes: list[str] = Field(default_factory=list)
    default_lead_owner_id: Optional[str] = None

    last_connection_test_at: Optional[datetime] = None
    last_connection_status: Optional[str] = None
    last_error_code: Optional[str] = None
    last_error_at: Optional[datetime] = None
    last_webhook_at: Optional[datetime] = None
    last_lead_sync_at: Optional[datetime] = None
    last_insights_sync_at: Optional[datetime] = None

    created_by: str
    updated_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "meta_integration_settings"
        indexes = [
            IndexModel([("company_id", ASCENDING)], unique=True),
            IndexModel(
                [("page_id", ASCENDING), ("lead_form_id", ASCENDING)],
                unique=True,
                partialFilterExpression={
                    "page_id": {"$type": "string"},
                    "lead_form_id": {"$type": "string"},
                },
            ),
            IndexModel([("enabled", ASCENDING), ("company_id", ASCENDING)]),
        ]


class MetaWebhookEvent(Document):
    company_id: str
    provider: str = "meta"
    provider_event_id: str
    event_type: str
    object_type: Optional[str] = None
    object_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    payload_sha256: str
    status: MetaWebhookStatus = MetaWebhookStatus.RECEIVED
    attempt_count: int = 0
    correlation_id: str
    received_at: datetime = Field(default_factory=datetime.utcnow)
    queued_at: Optional[datetime] = None
    processing_started_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None
    next_retry_at: Optional[datetime] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    _sanitize_error = field_validator("error_message", mode="before")(
        sanitize_error_message
    )

    class Settings:
        name = "meta_webhook_events"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel(
                [
                    ("provider", ASCENDING),
                    ("company_id", ASCENDING),
                    ("provider_event_id", ASCENDING),
                ],
                unique=True,
            ),
            IndexModel(
                [("company_id", ASCENDING), ("status", ASCENDING), ("received_at", DESCENDING)]
            ),
            IndexModel([("correlation_id", ASCENDING)]),
        ]


class MetaSyncRun(Document):
    company_id: str
    sync_type: str
    status: MetaSyncStatus = MetaSyncStatus.PENDING
    correlation_id: str
    cursor: Optional[str] = None
    # `active_key` is populated only while the run is pending/running. Its
    # partial unique index is the durable tenant-level overlap reservation.
    active_key: Optional[str] = None
    window_since: Optional[str] = None
    window_until: Optional[str] = None
    dispatch_queued_at: Optional[datetime] = None
    next_dispatch_at: Optional[datetime] = None
    records_processed: int = 0
    attempt_count: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    requested_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    _sanitize_error = field_validator("error_message", mode="before")(
        sanitize_error_message
    )

    class Settings:
        name = "meta_sync_runs"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel(
                [("company_id", ASCENDING), ("sync_type", ASCENDING), ("created_at", DESCENDING)]
            ),
            IndexModel([("correlation_id", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel(
                [("active_key", ASCENDING)],
                unique=True,
                partialFilterExpression={"active_key": {"$type": "string"}},
            ),
            IndexModel(
                [("status", ASCENDING), ("next_dispatch_at", ASCENDING)],
                partialFilterExpression={"sync_type": "insights"},
            ),
        ]


class MetaMarketingInsight(Document):
    company_id: str
    ad_account_id: str
    campaign_id: str
    campaign_name: Optional[str] = None
    adset_id: Optional[str] = None
    adset_name: Optional[str] = None
    ad_id: Optional[str] = None
    ad_name: Optional[str] = None
    date_start: datetime
    date_stop: datetime
    attribution_window: Optional[str] = None
    currency: Optional[str] = None
    spend: float = 0.0
    impressions: int = 0
    clicks: int = 0
    conversions: int = 0
    leads: int = 0
    revenue: Optional[float] = None
    cpl: Optional[float] = None
    roas: Optional[float] = None
    fetched_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "meta_marketing_insights"
        indexes = [
            IndexModel([("company_id", ASCENDING)]),
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("ad_account_id", ASCENDING),
                    ("campaign_id", ASCENDING),
                    ("adset_id", ASCENDING),
                    ("ad_id", ASCENDING),
                    ("date_start", ASCENDING),
                    ("date_stop", ASCENDING),
                ],
                unique=True,
            ),
            IndexModel(
                [("company_id", ASCENDING), ("date_start", DESCENDING), ("campaign_id", ASCENDING)]
            ),
        ]
