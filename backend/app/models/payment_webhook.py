"""
Payment Webhook Model for Razorpay
"""
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class WebhookEventType(str, Enum):
    PAYMENT_SUCCESS = "payment.success"
    PAYMENT_FAILED = "payment.failed"
    SUBSCRIPTION_CREATED = "subscription.created"
    SUBSCRIPTION_ACTIVATED = "subscription.activated"
    SUBSCRIPTION_CHARGED = "subscription.charged"
    SUBSCRIPTION_CANCELLED = "subscription.cancelled"
    INVOICE_PAID = "invoice.paid"
    INVOICE_FAILED = "invoice.failed"


class WebhookStatus(str, Enum):
    PENDING = "pending"
    PROCESSED = "processed"
    FAILED = "failed"


class PaymentWebhook(Document):
    """Payment Webhook Model for Razorpay"""
    # Razorpay Webhook Details
    razorpay_event_id: Optional[str] = None
    razorpay_entity: Optional[str] = None  # payment, subscription, invoice
    event_type: WebhookEventType
    
    # Related IDs
    company_id: Optional[str] = None
    subscription_id: Optional[str] = None
    transaction_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_subscription_id: Optional[str] = None
    
    # Webhook Payload
    payload: Dict[str, Any] = Field(default_factory=dict)
    
    # Processing Status
    status: WebhookStatus = WebhookStatus.PENDING
    processed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "payment_webhooks"
        indexes = [
            "razorpay_event_id",
            "event_type",
            "status",
            "company_id",
            "razorpay_payment_id",
        ]

