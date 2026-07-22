"""
Super Admin - Subscription Plan Management
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

from app.models.subscription_plan import SubscriptionPlan, PlanStatus, BillingCycle
from app.models.user import User
from app.api.dependencies import get_current_super_admin
from app.core.clock import utc_now

router = APIRouter()


# Request/Response Models
class PlanCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price_monthly: float = 0.0
    price_yearly: float = 0.0
    currency: str = "INR"
    max_users: Optional[int] = None
    max_managers: Optional[int] = None
    max_leads: Optional[int] = None
    max_employees: Optional[int] = None
    max_tasks: Optional[int] = None
    max_projects: Optional[int] = None
    max_tickets: Optional[int] = None
    max_storage_gb: Optional[int] = None
    max_api_requests_per_month: Optional[int] = None
    enabled_modules: List[str] = Field(default_factory=list)
    has_trial: bool = False
    trial_days: int = 0
    grace_period_days: int = 7
    allow_upgrade: bool = True
    allow_downgrade: bool = True
    proration_enabled: bool = True
    display_order: int = 0
    is_popular: bool = False
    badge_text: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class PlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[PlanStatus] = None
    price_monthly: Optional[float] = None
    price_yearly: Optional[float] = None
    currency: Optional[str] = None
    max_users: Optional[int] = None
    max_managers: Optional[int] = None
    max_leads: Optional[int] = None
    max_employees: Optional[int] = None
    max_tasks: Optional[int] = None
    max_projects: Optional[int] = None
    max_tickets: Optional[int] = None
    max_storage_gb: Optional[int] = None
    max_api_requests_per_month: Optional[int] = None
    enabled_modules: Optional[List[str]] = None
    has_trial: Optional[bool] = None
    trial_days: Optional[int] = None
    grace_period_days: Optional[int] = None
    allow_upgrade: Optional[bool] = None
    allow_downgrade: Optional[bool] = None
    proration_enabled: Optional[bool] = None
    display_order: Optional[int] = None
    is_popular: Optional[bool] = None
    badge_text: Optional[str] = None
    features: Optional[List[str]] = None
    metadata: Optional[dict] = None


def _plan_to_response(plan) -> dict:
    """Build JSON-serializable dict from SubscriptionPlan."""
    d = plan.model_dump()
    d["id"] = str(plan.id)
    for key in ("created_at", "updated_at"):
        if key in d and d[key] is not None and hasattr(d[key], "isoformat"):
            d[key] = d[key].isoformat()
    if "status" in d and hasattr(d["status"], "value"):
        d["status"] = d["status"].value
    return d


@router.get("/", response_model=List[dict])
async def list_plans(
    status_filter: Optional[PlanStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_super_admin)
):
    """List all subscription plans"""
    if status_filter is not None:
        plans = await SubscriptionPlan.find(
            SubscriptionPlan.deleted == False,
            SubscriptionPlan.status == status_filter
        ).sort("display_order").skip(skip).limit(limit).to_list()
    else:
        plans = await SubscriptionPlan.find(
            SubscriptionPlan.deleted == False
        ).sort("display_order").skip(skip).limit(limit).to_list()
    return [_plan_to_response(p) for p in plans]


# Must be defined BEFORE /{plan_id} so /count is not matched as plan_id
@router.get("/count", response_model=dict)
async def get_plans_count(
    current_user: User = Depends(get_current_super_admin)
):
    """Get count of active plans"""
    count = await SubscriptionPlan.find(
        SubscriptionPlan.deleted == False,
        SubscriptionPlan.status == PlanStatus.ACTIVE
    ).count()
    return {"count": count, "max_allowed": 9999}


@router.get("/{plan_id}", response_model=dict)
async def get_plan(
    plan_id: str,
    current_user: User = Depends(get_current_super_admin)
):
    """Get subscription plan details"""
    plan = await SubscriptionPlan.get(plan_id)
    if not plan or plan.deleted:
        raise HTTPException(status_code=404, detail="Plan not found")
    return _plan_to_response(plan)


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_plan(
    plan_data: PlanCreate,
    current_user: User = Depends(get_current_super_admin)
):
    """Create a new subscription plan"""
    # Check if plan name already exists
    existing = await SubscriptionPlan.find_one(
        SubscriptionPlan.name == plan_data.name,
        SubscriptionPlan.deleted == False
    )
    if existing:
        raise HTTPException(status_code=400, detail="Plan name already exists")
    
    plan = SubscriptionPlan(
        **plan_data.model_dump(),
        created_by=str(current_user.id),
        status=PlanStatus.ACTIVE
    )
    await plan.insert()
    return _plan_to_response(plan)


@router.put("/{plan_id}", response_model=dict)
async def update_plan(
    plan_id: str,
    plan_data: PlanUpdate,
    current_user: User = Depends(get_current_super_admin)
):
    """Update subscription plan"""
    plan = await SubscriptionPlan.get(plan_id)
    if not plan or plan.deleted:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Check name uniqueness if name is being updated
    if plan_data.name and plan_data.name != plan.name:
        existing = await SubscriptionPlan.find_one(
            SubscriptionPlan.name == plan_data.name,
            SubscriptionPlan.deleted == False,
            SubscriptionPlan.id != plan_id
        )
        if existing:
            raise HTTPException(status_code=400, detail="Plan name already exists")
    
    # Update fields
    update_data = plan_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(plan, key, value)
    
    plan.updated_at = utc_now()
    await plan.save()
    return _plan_to_response(plan)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: str,
    current_user: User = Depends(get_current_super_admin)
):
    """Delete (soft delete) subscription plan"""
    plan = await SubscriptionPlan.get(plan_id)
    if not plan or plan.deleted:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Check if plan is in use
    from beanie.operators import In
    from app.models.company_subscription import (
        CompanySubscription,
        CompanySubscriptionStatus,
    )
    # Use In operator with enum values to avoid callable errors
    active_subscriptions = await CompanySubscription.find(
        CompanySubscription.plan_id == plan_id,
        In(
            CompanySubscription.status,
            [
                CompanySubscriptionStatus.ACTIVE,
                CompanySubscriptionStatus.TRIAL,
                CompanySubscriptionStatus.GRACE_PERIOD,
            ],
        ),
    ).count()
    
    if active_subscriptions > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete plan. {active_subscriptions} active subscription(s) are using this plan."
        )
    
    plan.deleted = True
    plan.status = PlanStatus.ARCHIVED
    plan.updated_at = utc_now()
    await plan.save()
    return None




