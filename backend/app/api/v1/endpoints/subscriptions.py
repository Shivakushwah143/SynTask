"""
Subscription & Billing: dynamic plans from Super Admin, CompanySubscription, Razorpay.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form
from typing import Optional
from datetime import datetime, timedelta

from app.models.subscription_plan import SubscriptionPlan as DynamicPlan, PlanStatus
from app.models.company_subscription import CompanySubscription, CompanySubscriptionStatus
from app.models.company import Company
from app.models.user import User
from app.api.dependencies import get_current_user
from app.core.clock import utc_now

router = APIRouter()


def _plan_to_public(plan) -> dict:
    """Public plan payload for company admin (plans list and current subscription)."""
    return {
        "id": str(plan.id),
        "name": plan.name,
        "description": getattr(plan, "description", None) or "",
        "monthly_price": getattr(plan, "price_monthly", 0.0),
        "annual_price": getattr(plan, "price_yearly", 0.0),
        "currency": getattr(plan, "currency", "INR"),
        "features": getattr(plan, "features", None) or [],
        "enabled_modules": getattr(plan, "enabled_modules", None) or [],
        "max_users": getattr(plan, "max_users", None),
        "max_leads": getattr(plan, "max_leads", None),
        "max_projects": getattr(plan, "max_projects", None),
        "max_tasks": getattr(plan, "max_tasks", None),
        "display_order": getattr(plan, "display_order", 0),
        "is_popular": getattr(plan, "is_popular", False),
        # Older SubscriptionPlan documents in production may not have this field yet
        "badge_text": getattr(plan, "badge_text", None),
    }


@router.get("/plans")
async def get_subscription_plans(
    current_user: User = Depends(get_current_user),
):
    """Get all active subscription plans (dynamic plans from Super Admin)."""
    plans = (
        await DynamicPlan.find(
            DynamicPlan.deleted == False,
            DynamicPlan.status == PlanStatus.ACTIVE,
        )
        .sort("display_order")
        .limit(100)
        .to_list()
    )
    return {"plans": [_plan_to_public(p) for p in plans]}


@router.get("/current", response_model=dict)
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
):
    """
    Get current subscription for the logged-in user's company (CompanySubscription).
    Returns null if no active subscription; access is then based on default/free.
    """
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with any company",
        )

    sub = await CompanySubscription.find_one(
        CompanySubscription.company_id == current_user.company_id
    )

    if not sub:
        return {"subscription": None}

    # Optionally attach plan details
    plan = await DynamicPlan.get(sub.plan_id) if sub.plan_id else None
    plan_info = _plan_to_public(plan) if plan else {"id": sub.plan_id, "name": "Unknown"}

    def _dt(v):
        return v.isoformat() if v and hasattr(v, "isoformat") else None

    return {
        "subscription": {
            "plan": plan_info.get("name") or "Unknown",
            "plan_id": str(sub.plan_id),
            "plan_details": plan_info,
            "status": sub.status.value if hasattr(sub.status, "value") else sub.status,
            "billing_cycle": sub.billing_cycle,
            "amount": sub.amount,
            "currency": sub.currency,
            "next_billing_date": _dt(sub.next_billing_date),
            "start_date": _dt(sub.start_date),
            "end_date": _dt(sub.end_date),
            "enabled_modules": sub.enabled_modules or [],
            "features": plan_info.get("features", []),
        }
    }


@router.post("/payment-intent")
async def create_payment_intent(
    plan_id: str = Form(...),
    billing_cycle: str = Form(...),
    company_id: Optional[str] = Form(None),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Create a Razorpay order for upgrading to a dynamic plan."""
    if billing_cycle not in ["monthly", "annual"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Billing cycle must be 'monthly' or 'annual'",
        )

    cid = company_id or (current_user.company_id if current_user else None)
    if not cid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company is required",
        )

    plan = await DynamicPlan.get(plan_id)
    if not plan or plan.deleted or plan.status != PlanStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found or not available",
        )

    amount = plan.price_yearly if billing_cycle == "annual" else plan.price_monthly
    if amount is None or amount < 0:
        amount = 0
    amount_paise = int(amount * 100)

    try:
        import razorpay
        from app.core.config import settings

        razorpay_key_id = getattr(settings, "RAZORPAY_KEY_ID", None)
        razorpay_key_secret = getattr(settings, "RAZORPAY_KEY_SECRET", None)

        # In development or when credentials are missing, behave like mock mode
        if not razorpay_key_id or not razorpay_key_secret:
            raise ImportError("Razorpay credentials not configured")

        client = razorpay.Client(auth=(razorpay_key_id, razorpay_key_secret))
        order_data = {
            "amount": amount_paise,
            "currency": plan.currency or "INR",
            # Razorpay receipt max 40 chars
            "receipt": f"sub_{str(cid)[:12]}_{int(utc_now().timestamp())}"[:40],
            "notes": {
                "plan_id": str(plan_id),
                "billing_cycle": billing_cycle,
                "company_id": cid,
            },
        }
        order = client.order.create(data=order_data)

        return {
            "order_id": order["id"],
            "amount": amount,
            "currency": order_data["currency"],
            "key_id": razorpay_key_id,
        }
    except ImportError:
        return {
            "order_id": f"order_mock_{utc_now().timestamp()}",
            "amount": amount,
            "currency": plan.currency or "INR",
            "key_id": "rzp_test_mock",
            "note": "Razorpay not installed. Mock response.",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create payment order: {str(e)}",
        )


@router.post("/confirm-payment")
async def confirm_payment(
    order_id: str = Form(...),
    payment_id: str = Form(...),
    signature: str = Form(...),
    company_id: str = Form(...),
    plan_id: str = Form(...),
    billing_cycle: str = Form(...),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Verify Razorpay payment and create/update CompanySubscription; access follows plan."""
    if billing_cycle not in ["monthly", "annual"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid billing cycle")

    plan = await DynamicPlan.get(plan_id)
    if not plan or plan.deleted or plan.status != PlanStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    try:
        import razorpay
        from app.core.config import settings

        razorpay_key_id = getattr(settings, "RAZORPAY_KEY_ID", None)
        razorpay_key_secret = getattr(settings, "RAZORPAY_KEY_SECRET", None)
        # If credentials are missing, fall back to mock flow below
        if not razorpay_key_id or not razorpay_key_secret:
            raise ImportError("Razorpay credentials not configured")
        client = razorpay.Client(auth=(razorpay_key_id, razorpay_key_secret))
        params_dict = {
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        }
        try:
            client.utility.verify_payment_signature(params_dict)
        except razorpay.errors.SignatureVerificationError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid payment signature",
            )
    except ImportError:
        pass  # mock mode: skip verification
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment verification failed: {str(e)}",
        )

    amount = plan.price_yearly if billing_cycle == "annual" else plan.price_monthly
    amount = amount if amount is not None else 0.0
    start_date = utc_now()
    if billing_cycle == "annual":
        end_date = start_date + timedelta(days=365)
    else:
        end_date = start_date + timedelta(days=30)
    next_billing = end_date
    enabled_modules = list(plan.enabled_modules or [])

    existing = await CompanySubscription.find_one(
        CompanySubscription.company_id == company_id
    )

    if existing:
        existing.plan_id = plan_id
        existing.status = CompanySubscriptionStatus.ACTIVE
        existing.amount = amount
        existing.billing_cycle = billing_cycle
        existing.start_date = start_date
        existing.end_date = end_date
        existing.next_billing_date = next_billing
        existing.enabled_modules = enabled_modules
        existing.payment_method = "razorpay"
        existing.last_payment_date = start_date
        existing.last_payment_amount = amount
        existing.last_payment_status = "paid"
        existing.razorpay_subscription_id = payment_id
        existing.updated_at = utc_now()
        await existing.save()
    else:
        new_sub = CompanySubscription(
            company_id=company_id,
            plan_id=plan_id,
            status=CompanySubscriptionStatus.ACTIVE,
            amount=amount,
            currency=plan.currency or "INR",
            billing_cycle=billing_cycle,
            start_date=start_date,
            end_date=end_date,
            next_billing_date=next_billing,
            enabled_modules=enabled_modules,
            payment_method="razorpay",
            last_payment_date=start_date,
            last_payment_amount=amount,
            last_payment_status="paid",
            razorpay_subscription_id=payment_id,
        )
        await new_sub.insert()

    return {
        "success": True,
        "message": "Payment confirmed and subscription activated. Access is based on your plan.",
        "subscription": {
            "plan": plan.name,
            "plan_id": str(plan_id),
            "billing_cycle": billing_cycle,
            "amount": amount,
            "end_date": end_date.isoformat(),
            "enabled_modules": enabled_modules,
        },
    }

