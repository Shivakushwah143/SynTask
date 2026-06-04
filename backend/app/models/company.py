"""
Company and Subscription Models
"""
from datetime import datetime
from typing import Optional, Dict, Any
from beanie import Document, Indexed
from pydantic import Field, EmailStr
from enum import Enum


class CompanyStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class SubscriptionPlan(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(str, Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class Company(Document):
    """Company Model"""
    name: Indexed(str, unique=True)
    email: Indexed(EmailStr, unique=True)
    phone: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None
    
    # Business Details
    industry: Optional[str] = None
    company_size: Optional[str] = None
    registration_number: Optional[str] = None
    tax_id: Optional[str] = None
    seats_requested: Optional[int] = None
    
    # Requester / Admin contact (captured at signup to speed up approval)
    admin_first_name: Optional[str] = None
    admin_last_name: Optional[str] = None
    admin_email: Optional[EmailStr] = None
    contact_role: Optional[str] = None
    notes: Optional[str] = None
    
    # Subscription & billing preferences (for approval workflow)
    requested_plan: Optional[SubscriptionPlan] = None
    requested_billing_cycle: Optional[str] = None  # monthly, annual
    payment_method_preference: Optional[str] = None  # stripe, razorpay, bank_transfer, etc.
    payment_reference: Optional[str] = None
    
    # Status
    status: CompanyStatus = CompanyStatus.PENDING
    
    # Admin Details
    admin_id: Optional[str] = None
    
    # Limits (based on subscription)
    max_users: int = 10
    max_projects: int = 5
    max_storage_gb: int = 5
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None  # Super Admin ID
    
    class Settings:
        name = "companies"
        indexes = [
            "name",
            "email",
            "status",
        ]


class Subscription(Document):
    """Subscription Model"""
    company_id: Indexed(str)
    plan: SubscriptionPlan = SubscriptionPlan.FREE
    status: SubscriptionStatus = SubscriptionStatus.TRIAL
    
    # Pricing
    amount: float = 0.0
    currency: str = "USD"
    billing_cycle: str = "monthly"  # monthly, annual
    
    # Dates
    start_date: datetime = Field(default_factory=datetime.utcnow)
    end_date: Optional[datetime] = None
    trial_end_date: Optional[datetime] = None
    next_billing_date: Optional[datetime] = None
    
    # Payment
    payment_method: Optional[str] = None
    last_payment_date: Optional[datetime] = None
    last_payment_amount: Optional[float] = None
    stripe_subscription_id: Optional[str] = None
    razorpay_subscription_id: Optional[str] = None
    
    # Usage tracking
    current_users: int = 0
    current_projects: int = 0
    current_storage_gb: float = 0.0
    
    # Auto-renewal
    auto_renew: bool = True
    cancelled_at: Optional[datetime] = None
    
    # History
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "subscriptions"
        indexes = [
            "company_id",
            "status",
            "plan",
        ]

