"""
Dynamic Subscription Plan Model
"""
from datetime import datetime
from typing import Optional, Dict, List, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class BillingCycle(str, Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class PlanStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class SubscriptionPlan(Document):
    """Dynamic Subscription Plan Model"""
    name: Indexed(str)
    description: Optional[str] = None
    status: PlanStatus = PlanStatus.ACTIVE
    
    # Pricing
    price_monthly: float = 0.0
    price_yearly: float = 0.0
    currency: str = "INR"
    
    # Plan Limits
    max_users: Optional[int] = None  # None = unlimited
    max_managers: Optional[int] = None
    max_leads: Optional[int] = None
    max_employees: Optional[int] = None
    max_tasks: Optional[int] = None
    max_projects: Optional[int] = None
    max_tickets: Optional[int] = None
    max_storage_gb: Optional[int] = None
    max_api_requests_per_month: Optional[int] = None
    
    # Feature Access (Module-wise)
    enabled_modules: List[str] = Field(default_factory=list)  # ["task", "sales", "ticketing", "invoicing", "automation"]
    
    # Trial Settings
    has_trial: bool = False
    trial_days: int = 0
    
    # Grace Period (days after expiry before suspension)
    grace_period_days: int = 7
    
    # Upgrade/Downgrade Rules
    allow_upgrade: bool = True
    allow_downgrade: bool = True
    proration_enabled: bool = True
    
    # Display Order
    display_order: int = 0
    is_popular: bool = False
    
    # Metadata
    features: List[str] = Field(default_factory=list)  # Feature list for display
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None  # Super Admin ID
    deleted: bool = False
    
    class Settings:
        name = "subscription_plans"
        indexes = [
            "name",
            "status",
            "display_order",
        ]

