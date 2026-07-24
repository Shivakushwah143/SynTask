"""
Super Admin - Tenant (Company) Management
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, Body
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from beanie.operators import In

from app.models.company import Company, CompanyStatus
from app.models.company_subscription import CompanySubscription, CompanySubscriptionStatus
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.api.dependencies import get_current_super_admin
from app.core.config import settings
from app.core.clock import utc_now
from app.models.audit_log import log_audit

# Razorpay client
try:
    import razorpay
    razorpay_client = razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID or "", settings.RAZORPAY_KEY_SECRET or "")
    ) if settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET else None
except ImportError:
    razorpay_client = None

router = APIRouter()


def _json_safe(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        data = value.model_dump()
        if getattr(value, "id", None) is not None:
            data["id"] = str(value.id)
        return _json_safe(data)
    return str(value)


# Request Models
class TenantApproveRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"  # monthly, yearly
    auto_approval_enabled: bool = False
    enabled_modules: Optional[List[str]] = None


class TenantSuspendRequest(BaseModel):
    reason: str  # payment_failed, compliance, manual
    notes: Optional[str] = None
    notify_admin: bool = True


class TenantModuleUpdate(BaseModel):
    enabled_modules: List[str]
    notes: Optional[str] = None


class TenantDeleteRequest(BaseModel):
    delete_data: bool = False  # True = full deletion, False = soft delete with retention
    retention_days: int = 30  # Data retention period if delete_data=False
    notes: Optional[str] = None


class AssignPlanRequest(BaseModel):
    plan_id: str = Field(..., min_length=1)
    billing_cycle: str = Field("monthly", pattern="^(monthly|yearly)$")
    custom_user_limit: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None


def _user_to_response(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role.value if hasattr(user.role, "value") else user.role,
        "is_active": getattr(user, "is_active", None) if getattr(user, "is_active", None) is not None else getattr(user, "status", None) == "active",
        "created_at": user.created_at.isoformat() if getattr(user, "created_at", None) else None,
    }


@router.get("/subscription-overview", response_model=List[dict])
async def subscription_overview(current_user: User = Depends(get_current_super_admin)):
    companies = await Company.find_all().to_list()
    result = []
    for company in companies:
        sub = await CompanySubscription.find_one(
            CompanySubscription.company_id == str(company.id),
            In(
                CompanySubscription.status,
                [
                    CompanySubscriptionStatus.ACTIVE,
                    CompanySubscriptionStatus.TRIAL,
                    CompanySubscriptionStatus.GRACE_PERIOD,
                ],
            ),
        )
        plan = await SubscriptionPlan.get(sub.plan_id) if sub and sub.plan_id else None
        result.append({
            "company_id": str(company.id),
            "company_name": company.name,
            "status": company.status.value if hasattr(company.status, "value") else company.status,
            "plan": plan.name if plan else None,
            "purchase_date": sub.created_at.isoformat() if sub and sub.created_at else None,
            "next_billing_date": sub.next_billing_date.isoformat() if sub and sub.next_billing_date else None,
            "monthly_amount": sub.amount if sub else None,
            "user_count": await User.find(User.company_id == str(company.id)).count(),
        })
    return result


@router.get("/", response_model=List[dict])
async def list_tenants(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    current_user: User = Depends(get_current_super_admin)
):
    """List all tenant companies"""
    # Normalize empty strings to None (handle both None and empty string cases)
    # FastAPI may pass empty strings "" when query params are present but empty
    if status is not None:
        status = status.strip() if status and status.strip() else None
    if search is not None:
        search = search.strip() if search and search.strip() else None
    
    # Validate and convert status string to enum if provided
    status_filter = None
    if status and status.strip():
        try:
            status_filter = CompanyStatus(status.strip().lower())
        except ValueError:
            # Invalid status value, ignore it
            pass
    
    # Start with base query
    if status_filter:
        companies = await Company.find(Company.status == status_filter).skip(skip).limit(limit).sort("-created_at").to_list()
    else:
        companies = await Company.find().skip(skip).limit(limit).sort("-created_at").to_list()
    
    # Filter by search if provided (client-side filtering for now to avoid query complexity)
    if search:
        search_lower = search.lower()
        companies = [
            c for c in companies 
            if search_lower in (c.name or "").lower() or search_lower in (c.email or "").lower()
        ]
    
    result = []
    for company in companies:
        # Get subscription info
        subscription = await CompanySubscription.find_one(
            CompanySubscription.company_id == str(company.id)
        )
        
        # Get user count
        from app.models.user import UserStatus
        user_count = await User.find(
            User.company_id == str(company.id)
        ).count()
        
        company_dict = _json_safe(company)
        
        sub_dict = None
        if subscription:
            sub_dict = _json_safe(subscription)
        company_dict["subscription"] = sub_dict
        company_dict["user_count"] = user_count
        result.append(company_dict)
    
    return result


@router.get("/{company_id}", response_model=dict)
async def get_tenant(
    company_id: str,
    current_user: User = Depends(get_current_super_admin)
):
    """Get complete tenant profile"""
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Get subscription
    subscription = await CompanySubscription.find_one(
        CompanySubscription.company_id == company_id
    )
    
    # Get plan details
    plan = None
    if subscription:
        plan = await SubscriptionPlan.get(subscription.plan_id)
    
    # Get users
    users = await User.find(
        User.company_id == company_id
    ).to_list()
    
    # Get usage stats
    from app.models.usage_tracking import UsageTracking
    current_month = utc_now().month
    current_year = utc_now().year
    usage = await UsageTracking.find_one(
        UsageTracking.company_id == company_id,
        UsageTracking.period_month == current_month,
        UsageTracking.period_year == current_year
    )
    
    # Get billing history
    from app.models.billing_transaction import BillingTransaction
    transactions = await BillingTransaction.find(
        BillingTransaction.company_id == company_id
    ).sort("-invoice_date").limit(10).to_list()
    
    return {
        "company": _json_safe(company),
        "subscription": _json_safe(subscription) if subscription else None,
        "plan": _json_safe(plan) if plan else None,
        "users": [_json_safe(u) for u in users],
        "usage": _json_safe(usage) if usage else None,
        "billing_history": [_json_safe(t) for t in transactions],
        "enabled_modules": subscription.enabled_modules if subscription else []
    }


@router.get("/{company_id}/users", response_model=List[dict])
async def list_company_users(
    company_id: str,
    current_user: User = Depends(get_current_super_admin),
):
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail={"detail": "Company not found", "code": "company_not_found"})
    users = await User.find(User.company_id == company_id).to_list()
    return [_user_to_response(user) for user in users]


@router.post("/{company_id}/users/{user_id}/reset-password", response_model=dict)
async def reset_user_password(
    company_id: str,
    user_id: str,
    current_user: User = Depends(get_current_super_admin),
):
    import secrets
    from app.core.security import get_password_hash
    from app.core.email import send_password_reset_email

    user = await User.get(user_id)
    if not user or str(user.company_id) != company_id:
        raise HTTPException(status_code=404, detail={"detail": "User not found", "code": "user_not_found"})

    reset_token = secrets.token_urlsafe(32)
    user.password_reset_token = get_password_hash(reset_token)
    user.password_reset_token_expires_at = utc_now() + timedelta(minutes=30)
    user.password_reset_token_used = False
    await user.save()
    await send_password_reset_email(user.email, reset_token, user.first_name)
    await log_audit("reset_password", str(current_user.id), "user", user_id, {"company_id": company_id, "email": user.email})
    return {"message": f"Password reset email sent to {user.email}"}


@router.post("/{company_id}/approve", response_model=dict)
async def approve_tenant(
    company_id: str,
    request: TenantApproveRequest,
    current_user: User = Depends(get_current_super_admin)
):
    """Approve and activate tenant company"""
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    if company.status == CompanyStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Company is already active")
    
    # Get plan
    plan = await SubscriptionPlan.get(request.plan_id)
    if not plan or plan.deleted:
        raise HTTPException(status_code=404, detail="Subscription plan not found")
    
    # Update company status
    company.status = CompanyStatus.ACTIVE
    company.approved_at = utc_now()
    company.approved_by = str(current_user.id)
    await company.save()
    
    # Create or update subscription
    subscription = await CompanySubscription.find_one(
        CompanySubscription.company_id == company_id
    )
    
    if not subscription:
        # Calculate pricing
        amount = plan.price_monthly if request.billing_cycle == "monthly" else plan.price_yearly
        
        # Calculate dates
        start_date = utc_now()
        if plan.has_trial and plan.trial_days > 0:
            trial_end = start_date.replace(day=1) + timedelta(days=plan.trial_days)
            end_date = None
        else:
            trial_end = None
            if request.billing_cycle == "monthly":
                end_date = start_date.replace(day=1) + timedelta(days=32)
                end_date = end_date.replace(day=1) - timedelta(days=1)
            else:
                end_date = start_date.replace(month=1, day=1) + timedelta(days=365)
        
        # Create Razorpay subscription if payment method is razorpay and client is available
        razorpay_subscription_id = None
        razorpay_customer_id = None
        
        if razorpay_client and amount > 0:
            try:
                # Create Razorpay customer
                customer_data = razorpay_client.customer.create({
                    "name": f"{company.name}",
                    "email": company.email,
                    "contact": company.phone or "",
                    "notes": {
                        "company_id": company_id,
                        "plan_id": request.plan_id
                    }
                })
                razorpay_customer_id = customer_data.get("id")
                
                # Create Razorpay plan
                razorpay_plan_data = {
                    "period": request.billing_cycle,
                    "interval": 1,
                    "item": {
                        "name": plan.name,
                        "amount": int(amount * 100),  # Convert to paise
                        "currency": plan.currency,
                        "description": plan.description or ""
                    }
                }
                razorpay_plan = razorpay_client.plan.create(razorpay_plan_data)
                
                # Create Razorpay subscription
                subscription_data = {
                    "plan_id": razorpay_plan.get("id"),
                    "customer_notify": 1,
                    "total_count": 12 if request.billing_cycle == "monthly" else 1,  # 12 months or 1 year
                    "start_at": int(start_date.timestamp()),
                    "notes": {
                        "company_id": company_id,
                        "plan_id": request.plan_id
                    }
                }
                
                if plan.has_trial and plan.trial_days > 0:
                    subscription_data["start_at"] = int(trial_end.timestamp())
                
                razorpay_subscription = razorpay_client.subscription.create(subscription_data)
                razorpay_subscription_id = razorpay_subscription.get("id")
                
            except Exception as e:
                # Log error but continue with subscription creation
                print(f"Razorpay subscription creation failed: {str(e)}")
                # Continue without Razorpay subscription
        
        subscription = CompanySubscription(
            company_id=company_id,
            plan_id=request.plan_id,
            status=CompanySubscriptionStatus.TRIAL if plan.has_trial else CompanySubscriptionStatus.ACTIVE,
            billing_cycle=request.billing_cycle,
            amount=amount,
            currency=plan.currency,
            start_date=start_date,
            end_date=end_date,
            trial_start_date=start_date if plan.has_trial else None,
            trial_end_date=trial_end,
            next_billing_date=end_date if end_date else None,
            enabled_modules=request.enabled_modules or plan.enabled_modules,
            auto_renew=True,
            razorpay_subscription_id=razorpay_subscription_id,
            razorpay_customer_id=razorpay_customer_id,
            payment_method="razorpay" if razorpay_subscription_id else "manual"
        )
        await subscription.insert()
    else:
        # Update existing subscription
        subscription.plan_id = request.plan_id
        subscription.billing_cycle = request.billing_cycle
        subscription.status = CompanySubscriptionStatus.ACTIVE
        subscription.enabled_modules = request.enabled_modules or plan.enabled_modules
        subscription.updated_at = utc_now()
        await subscription.save()
    
    return {
        "message": "Company approved and activated",
        "company": _json_safe(company),
        "subscription": _json_safe(subscription)
    }


@router.post("/{company_id}/suspend", response_model=dict)
async def suspend_tenant(
    company_id: str,
    request: TenantSuspendRequest,
    current_user: User = Depends(get_current_super_admin)
):
    """Suspend tenant access"""
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    company.status = CompanyStatus.SUSPENDED
    company.notes = request.notes or company.notes
    company.updated_at = utc_now()
    await company.save()
    
    # Update subscription
    subscription = await CompanySubscription.find_one(
        CompanySubscription.company_id == company_id
    )
    if subscription:
        subscription.status = CompanySubscriptionStatus.SUSPENDED
        subscription.suspended_at = utc_now()
        subscription.suspension_reason = request.reason
        subscription.metadata = subscription.metadata or {}
        subscription.metadata["suspension_notes"] = request.notes
        subscription.metadata["suspended_by"] = str(current_user.id)
        subscription.updated_at = utc_now()
        await subscription.save()
    if request.notify_admin:
        admin = await User.find_one(User.company_id == company_id, User.role == "admin")
        if admin:
            from app.core.email import send_task_assignment_email
            await send_task_assignment_email(
                assignee_email=admin.email,
                assignee_name=f"{admin.first_name or ''} {admin.last_name or ''}".strip() or admin.email,
                task_title="SynTask account suspended",
                task_description=f"Your account has been suspended. Reason: {request.reason}. Please contact support.",
                task_priority="critical",
                task_due_date=None,
                assigned_by_name="SynTask Super Admin",
                task_id=company_id,
            )
    await log_audit("suspend_tenant", str(current_user.id), "company", company_id, {"reason": request.reason, "notes": request.notes})
    
    return {"message": "Company suspended", "company": _json_safe(company)}


@router.post("/{company_id}/activate", response_model=dict)
async def activate_tenant(
    company_id: str,
    current_user: User = Depends(get_current_super_admin)
):
    """Activate suspended tenant"""
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    company.status = CompanyStatus.ACTIVE
    company.updated_at = utc_now()
    await company.save()
    
    # Update subscription
    subscription = await CompanySubscription.find_one(
        CompanySubscription.company_id == company_id
    )
    if subscription:
        subscription.status = CompanySubscriptionStatus.ACTIVE
        subscription.suspended_at = None
        subscription.suspension_reason = None
        if subscription.metadata:
            subscription.metadata.pop("suspension_notes", None)
            subscription.metadata.pop("suspended_by", None)
        subscription.updated_at = utc_now()
        await subscription.save()
    await log_audit("activate_tenant", str(current_user.id), "company", company_id, {})
    
    return {"message": "Company activated", "company": _json_safe(company)}


@router.post("/{company_id}/assign-plan", response_model=dict)
async def assign_plan_to_tenant(
    company_id: str,
    body: AssignPlanRequest,
    current_user: User = Depends(get_current_super_admin),
):
    company = await Company.get(company_id)
    plan = await SubscriptionPlan.get(body.plan_id)
    if not company or not plan or getattr(plan, "deleted", False):
        raise HTTPException(status_code=404, detail={"detail": "Company or plan not found", "code": "company_or_plan_not_found"})

    existing = await CompanySubscription.find_one(CompanySubscription.company_id == company_id)
    amount = plan.price_monthly if body.billing_cycle == "monthly" else plan.price_yearly
    if existing:
        existing.plan_id = body.plan_id
        existing.billing_cycle = body.billing_cycle
        existing.amount = amount
        existing.status = CompanySubscriptionStatus.ACTIVE
        existing.metadata = existing.metadata or {}
        existing.metadata["custom_user_limit"] = body.custom_user_limit
        existing.metadata["assignment_notes"] = body.notes
        existing.updated_at = utc_now()
        await existing.save()
    else:
        existing = CompanySubscription(
            company_id=company_id,
            plan_id=body.plan_id,
            billing_cycle=body.billing_cycle,
            amount=amount,
            status=CompanySubscriptionStatus.ACTIVE,
            next_billing_date=utc_now() + timedelta(days=30 if body.billing_cycle == "monthly" else 365),
            enabled_modules=plan.enabled_modules,
            metadata={"custom_user_limit": body.custom_user_limit, "assignment_notes": body.notes},
        )
        await existing.insert()

    company.max_users = body.custom_user_limit or plan.max_users or company.max_users
    company.max_projects = plan.max_projects or company.max_projects
    company.max_storage_gb = plan.max_storage_gb or company.max_storage_gb
    company.updated_at = utc_now()
    await company.save()
    await log_audit("assign_plan", str(current_user.id), "company", company_id, {"plan_id": body.plan_id, "billing_cycle": body.billing_cycle})
    return {"message": f"Plan '{plan.name}' assigned to {company.name}", "subscription": _json_safe(existing)}


@router.put("/{company_id}/modules", response_model=dict)
async def update_tenant_modules(
    company_id: str,
    request: TenantModuleUpdate,
    current_user: User = Depends(get_current_super_admin)
):
    """Update enabled modules for tenant"""
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    subscription = await CompanySubscription.find_one(
        CompanySubscription.company_id == company_id
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    subscription.enabled_modules = request.enabled_modules
    subscription.updated_at = utc_now()
    await subscription.save()
    
    return {
        "message": "Modules updated",
        "enabled_modules": subscription.enabled_modules
    }


class SubscriptionUpdateRequest(BaseModel):
    plan_id: Optional[str] = None
    billing_cycle: Optional[str] = None  # monthly, yearly
    status: Optional[str] = None  # active, suspended, cancelled, etc.
    amount: Optional[float] = None
    enabled_modules: Optional[List[str]] = None
    auto_renew: Optional[bool] = None
    next_billing_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    notes: Optional[str] = None


@router.put("/{company_id}/subscription", response_model=dict)
async def update_subscription(
    company_id: str,
    request: SubscriptionUpdateRequest,
    current_user: User = Depends(get_current_super_admin)
):
    """Update subscription details for a tenant"""
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    subscription = await CompanySubscription.find_one(
        CompanySubscription.company_id == company_id
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    # Update plan if provided
    if request.plan_id:
        plan = await SubscriptionPlan.get(request.plan_id)
        if not plan or plan.deleted:
            raise HTTPException(status_code=404, detail="Subscription plan not found")
        
        # Store old plan for comparison
        old_plan_id = subscription.plan_id
        subscription.plan_id = request.plan_id
        
        # If plan changed, update enabled_modules from new plan (unless explicitly provided)
        if old_plan_id != request.plan_id and request.enabled_modules is None:
            subscription.enabled_modules = plan.enabled_modules or []
        
        # Recalculate amount if plan changed (unless amount is explicitly provided)
        if request.amount is None:
            billing_cycle = request.billing_cycle or subscription.billing_cycle
            subscription.amount = plan.price_monthly if billing_cycle == "monthly" else plan.price_yearly
    
    # Update billing cycle
    if request.billing_cycle:
        if request.billing_cycle not in ["monthly", "yearly"]:
            raise HTTPException(status_code=400, detail="Billing cycle must be 'monthly' or 'yearly'")
        subscription.billing_cycle = request.billing_cycle
        
        # Recalculate amount if billing cycle changed and plan exists (unless amount is explicitly provided)
        if subscription.plan_id and request.amount is None:
            plan = await SubscriptionPlan.get(subscription.plan_id)
            if plan:
                subscription.amount = plan.price_monthly if request.billing_cycle == "monthly" else plan.price_yearly
    
    # Update status
    if request.status:
        try:
            subscription.status = CompanySubscriptionStatus(request.status.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {[s.value for s in CompanySubscriptionStatus]}")
    
    # Update amount (if explicitly provided)
    if request.amount is not None:
        subscription.amount = request.amount
    
    # Update enabled modules
    if request.enabled_modules is not None:
        subscription.enabled_modules = request.enabled_modules
    
    # Update auto_renew
    if request.auto_renew is not None:
        subscription.auto_renew = request.auto_renew
    
    # Update dates
    if request.next_billing_date:
        subscription.next_billing_date = request.next_billing_date
    if request.end_date:
        subscription.end_date = request.end_date
    
    subscription.updated_at = utc_now()
    await subscription.save()
    
    # Get updated plan details
    plan = await SubscriptionPlan.get(subscription.plan_id) if subscription.plan_id else None
    
    return {
        "message": "Subscription updated successfully",
        "subscription": _json_safe(subscription),
        "plan": _json_safe(plan) if plan else None
    }


@router.delete("/{company_id}", response_model=dict)
async def delete_tenant(
    company_id: str,
    request: TenantDeleteRequest = Body(...),
    current_user: User = Depends(get_current_super_admin)
):
    """Delete tenant with data retention options"""
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    if request.delete_data:
        # Full deletion - delete all related data
        # Note: In production, this should be done carefully with proper backups
        from app.models.task import Task
        from app.models.project import Project
        from app.models.ticket import Ticket
        
        # Delete users (set status to suspended)
        from app.models.user import UserStatus
        users = await User.find(User.company_id == company_id).to_list()
        for user in users:
            user.status = UserStatus.SUSPENDED
            await user.save()
        
        # Delete Meta Integration and Messaging data (PII & tenant isolation compliance)
        from app.integrations.meta.models import MetaIntegrationSettings, MetaSyncRun, MetaMarketingInsight
        from app.integrations.meta.messaging_models import MetaChannelConnection, MetaConversation, MetaMessage
        from app.integrations.meta.ai_draft_models import MetaAIDraft
        from app.integrations.meta.identity_models import CustomerIdentity, CrossChannelIdentityLink

        await MetaIntegrationSettings.find({"company_id": company_id}).delete()
        await MetaSyncRun.find({"company_id": company_id}).delete()
        await MetaMarketingInsight.find({"company_id": company_id}).delete()
        await MetaChannelConnection.find({"company_id": company_id}).delete()
        await MetaConversation.find({"company_id": company_id}).delete()
        await MetaMessage.find({"company_id": company_id}).delete()
        await MetaAIDraft.find({"company_id": company_id}).delete()
        await CustomerIdentity.find({"company_id": company_id}).delete()
        await CrossChannelIdentityLink.find({"company_id": company_id}).delete()

        # Delete company
        await company.delete()
        
        # Delete subscription
        subscription = await CompanySubscription.find_one(
            CompanySubscription.company_id == company_id
        )
        if subscription:
            await subscription.delete()
        
        return {"message": "Company and all data deleted"}
    else:
        # Soft delete with retention
        company.status = CompanyStatus.CANCELLED
        await company.save()
        
        # Mark subscription as cancelled
        subscription = await CompanySubscription.find_one(
            CompanySubscription.company_id == company_id
        )
        if subscription:
            subscription.status = CompanySubscriptionStatus.CANCELLED
            subscription.cancelled_at = utc_now()
            subscription.cancellation_reason = "Tenant deleted by Super Admin"
            subscription.updated_at = utc_now()
            await subscription.save()
        
        # Schedule data deletion after retention period
        # This would typically be handled by a background job
        retention_date = utc_now() + timedelta(days=request.retention_days)
        company.metadata = company.metadata or {}
        company.metadata["delete_after"] = retention_date.isoformat()
        await company.save()
        
        return {
            "message": f"Company marked for deletion. Data will be retained for {request.retention_days} days.",
            "retention_until": retention_date.isoformat()
        }
