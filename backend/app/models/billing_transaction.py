"""
Billing Transaction Model
"""
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class PaymentStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class PaymentMethod(str, Enum):
    RAZORPAY = "razorpay"
    MANUAL = "manual"
    BANK_TRANSFER = "bank_transfer"


class BillingTransaction(Document):
    """Billing Transaction Model"""
    company_id: Indexed(str)
    subscription_id: Optional[str] = None
    
    # Invoice Details
    invoice_number: Indexed(str, unique=True)
    invoice_date: datetime = Field(default_factory=datetime.utcnow)
    due_date: Optional[datetime] = None
    
    # Amounts
    amount: float = 0.0
    tax_amount: float = 0.0
    discount_amount: float = 0.0
    total_amount: float = 0.0
    currency: str = "INR"
    
    # Tax Details
    tax_rate: float = 0.0  # GST/VAT rate
    tax_type: Optional[str] = None  # GST, VAT, etc.
    tax_id: Optional[str] = None
    
    # Payment
    payment_status: PaymentStatus = PaymentStatus.PENDING
    payment_method: Optional[PaymentMethod] = None
    payment_date: Optional[datetime] = None
    
    # Razorpay Integration
    razorpay_payment_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_invoice_id: Optional[str] = None
    
    # Billing Period
    billing_period_start: Optional[datetime] = None
    billing_period_end: Optional[datetime] = None
    
    # Retry Logic
    retry_count: int = 0
    last_retry_at: Optional[datetime] = None
    next_retry_at: Optional[datetime] = None
    
    # Notes
    notes: Optional[str] = None
    failure_reason: Optional[str] = None
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "billing_transactions"
        indexes = [
            "company_id",
            "subscription_id",
            "invoice_number",
            "payment_status",
            "razorpay_payment_id",
            "invoice_date",
        ]

