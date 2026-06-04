"""
Enhanced Company Subscription Model
"""
from datetime import datetime
from typing import Optional, Dict, List, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class CompanySubscriptionStatus(str, Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    EXPIRED = "expired"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"
    GRACE_PERIOD = "grace_period"


class CompanySubscription(Document):
    """Enhanced Company Subscription Model"""
    company_id: Indexed(str)
    plan_id: Indexed(str)  # Reference to SubscriptionPlan
    
    # Status
    status: CompanySubscriptionStatus = CompanySubscriptionStatus.TRIAL
    
    # Billing
    billing_cycle: str = "monthly"  # monthly, yearly
    amount: float = 0.0
    currency: str = "INR"
    
    # Dates
    start_date: datetime = Field(default_factory=datetime.utcnow)
    end_date: Optional[datetime] = None
    trial_start_date: Optional[datetime] = None
    trial_end_date: Optional[datetime] = None
    next_billing_date: Optional[datetime] = None
    grace_period_end_date: Optional[datetime] = None
    
    # Payment Integration
    razorpay_subscription_id: Optional[str] = None
    razorpay_customer_id: Optional[str] = None
    payment_method: Optional[str] = None  # razorpay, manual, bank_transfer
    
    # Last Payment Info
    last_payment_date: Optional[datetime] = None
    last_payment_amount: Optional[float] = None
    last_payment_status: Optional[str] = None  # paid, failed, pending
    
    # Module Control
    enabled_modules: List[str] = Field(default_factory=list)  # Override plan modules if needed
    
    # Auto-renewal
    auto_renew: bool = True
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    
    # Suspension
    suspended_at: Optional[datetime] = None
    suspension_reason: Optional[str] = None  # payment_failed, compliance, manual
    
    # Usage Tracking (cached for quick access)
    current_users: int = 0
    current_managers: int = 0
    current_leads: int = 0
    current_employees: int = 0
    current_tasks: int = 0
    current_projects: int = 0
    current_tickets: int = 0
    current_storage_gb: float = 0.0
    current_api_requests_this_month: int = 0
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "company_subscriptions"
        indexes = [
            "company_id",
            "plan_id",
            "status",
            "razorpay_subscription_id",
        ]

