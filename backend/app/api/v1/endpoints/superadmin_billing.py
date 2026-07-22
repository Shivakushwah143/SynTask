"""
Super Admin - Billing & Payment Management (Razorpay Integration)
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query, Header, Request
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel
import hashlib
import hmac
import json

from app.models.billing_transaction import BillingTransaction, PaymentStatus, PaymentMethod
from app.models.company_subscription import CompanySubscription, CompanySubscriptionStatus
from app.models.payment_webhook import PaymentWebhook, WebhookEventType, WebhookStatus
from app.models.user import User
from app.api.dependencies import get_current_super_admin
from app.core.config import settings
from app.core.clock import utc_now

router = APIRouter()

# Razorpay client (install razorpay: pip install razorpay)
try:
    import razorpay
    razorpay_client = razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID or "", settings.RAZORPAY_KEY_SECRET or "")
    )
except ImportError:
    razorpay_client = None
    print("Warning: razorpay package not installed. Install with: pip install razorpay")


class InvoiceGenerateRequest(BaseModel):
    company_id: str
    subscription_id: Optional[str] = None
    amount: float
    description: Optional[str] = None
    tax_rate: float = 18.0  # GST rate
    billing_period_start: Optional[datetime] = None
    billing_period_end: Optional[datetime] = None


@router.get("/transactions", response_model=List[dict])
async def list_transactions(
    company_id: Optional[str] = Query(None),
    payment_status: Optional[PaymentStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    current_user: User = Depends(get_current_super_admin)
):
    """List billing transactions"""
    query = {}
    if company_id:
        query["company_id"] = company_id
    if payment_status:
        query["payment_status"] = payment_status
    
    transactions = await BillingTransaction.find(query).sort("-invoice_date").skip(skip).limit(limit).to_list()
    return [t.dict() for t in transactions]


@router.get("/revenue/analytics", response_model=dict)
async def get_revenue_analytics(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_super_admin)
):
    """Get revenue analytics (MRR, ARR, Total Revenue)"""
    if not start_date:
        start_date = utc_now().replace(day=1)
    if not end_date:
        end_date = utc_now()
    
    # Get all paid transactions in the period
    transactions = await BillingTransaction.find(
        BillingTransaction.payment_status == PaymentStatus.PAID,
        BillingTransaction.payment_date >= start_date,
        BillingTransaction.payment_date <= end_date
    ).to_list()
    
    # Calculate metrics
    total_revenue = sum(t.total_amount for t in transactions)
    
    # MRR (Monthly Recurring Revenue) - sum of monthly subscriptions
    mrr_transactions = [t for t in transactions if t.billing_period_start and 
                       (t.billing_period_end - t.billing_period_start).days <= 35]
    mrr = sum(t.total_amount for t in mrr_transactions)
    
    # ARR (Annual Recurring Revenue) - sum of yearly subscriptions * 12
    arr_transactions = [t for t in transactions if t.billing_period_start and 
                       (t.billing_period_end - t.billing_period_start).days > 35]
    arr = sum(t.total_amount for t in arr_transactions) * 12
    
    # Get current month revenue
    current_month_start = utc_now().replace(day=1)
    current_month_revenue = sum(
        t.total_amount for t in transactions 
        if t.payment_date >= current_month_start
    )
    
    # Get last month revenue
    last_month_start = (current_month_start - timedelta(days=32)).replace(day=1)
    last_month_revenue = sum(
        t.total_amount for t in transactions 
        if last_month_start <= t.payment_date < current_month_start
    )
    
    # Fallback: if no billing transactions, derive MRR/ARR from active CompanySubscriptions
    if total_revenue == 0 and mrr == 0 and arr == 0:
        active_subs = await CompanySubscription.find(
            CompanySubscription.status == CompanySubscriptionStatus.ACTIVE
        ).to_list()
        for sub in active_subs:
            amt = getattr(sub, "amount", 0) or 0
            if (getattr(sub, "billing_cycle", "") or "monthly") == "annual":
                mrr += amt / 12
                arr += amt
            else:
                mrr += amt
                arr += amt * 12
        total_revenue = sum(getattr(s, "last_payment_amount", 0) or 0 for s in active_subs)
        if total_revenue == 0:
            total_revenue = mrr  # approximate
        current_month_revenue = mrr
        last_month_revenue = mrr
    return {
        "total_revenue": total_revenue,
        "mrr": mrr,
        "arr": arr,
        "current_month_revenue": current_month_revenue,
        "last_month_revenue": last_month_revenue,
        "transaction_count": len(transactions),
        "period": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat()
        }
    }


@router.post("/invoices/generate", response_model=dict)
async def generate_invoice(
    request: InvoiceGenerateRequest,
    current_user: User = Depends(get_current_super_admin)
):
    """Generate invoice for a company"""
    # Generate invoice number
    invoice_number = f"INV-{utc_now().strftime('%Y%m%d')}-{utc_now().microsecond}"
    
    # Calculate amounts
    tax_amount = (request.amount * request.tax_rate) / 100
    total_amount = request.amount + tax_amount
    
    # Create invoice
    invoice = BillingTransaction(
        company_id=request.company_id,
        subscription_id=request.subscription_id,
        invoice_number=invoice_number,
        invoice_date=utc_now(),
        due_date=utc_now() + timedelta(days=15),
        amount=request.amount,
        tax_amount=tax_amount,
        total_amount=total_amount,
        currency="INR",
        tax_rate=request.tax_rate,
        tax_type="GST",
        payment_status=PaymentStatus.PENDING,
        billing_period_start=request.billing_period_start,
        billing_period_end=request.billing_period_end
    )
    await invoice.insert()
    
    return invoice.dict()


@router.post("/razorpay/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None)
):
    """Handle Razorpay webhook events"""
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Razorpay not configured")
    
    # Get webhook payload
    payload = await request.body()
    payload_str = payload.decode('utf-8')
    payload_dict = json.loads(payload_str)
    
    # Verify webhook signature
    if x_razorpay_signature:
        webhook_secret = settings.RAZORPAY_KEY_SECRET or ""
        expected_signature = hmac.new(
            webhook_secret.encode('utf-8'),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(x_razorpay_signature, expected_signature):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")
    
    # Parse webhook event
    event_type = payload_dict.get("event")
    entity = payload_dict.get("contains", [""])[0] if payload_dict.get("contains") else ""
    
    # Map Razorpay event types
    event_mapping = {
        "payment.captured": WebhookEventType.PAYMENT_SUCCESS,
        "payment.failed": WebhookEventType.PAYMENT_FAILED,
        "subscription.created": WebhookEventType.SUBSCRIPTION_CREATED,
        "subscription.activated": WebhookEventType.SUBSCRIPTION_ACTIVATED,
        "subscription.charged": WebhookEventType.SUBSCRIPTION_CHARGED,
        "subscription.cancelled": WebhookEventType.SUBSCRIPTION_CANCELLED,
    }
    
    webhook_event_type = event_mapping.get(event_type, WebhookEventType.PAYMENT_SUCCESS)
    
    # Store webhook
    webhook = PaymentWebhook(
        razorpay_event_id=payload_dict.get("id"),
        razorpay_entity=entity,
        event_type=webhook_event_type,
        payload=payload_dict,
        status=WebhookStatus.PENDING
    )
    await webhook.insert()
    
    # Process webhook based on event type
    try:
        if event_type == "payment.captured":
            payment_data = payload_dict.get("payload", {}).get("payment", {}).get("entity", {})
            payment_id = payment_data.get("id")
            
            # Update transaction
            transaction = await BillingTransaction.find_one(
                BillingTransaction.razorpay_payment_id == payment_id
            )
            if transaction:
                transaction.payment_status = PaymentStatus.PAID
                transaction.payment_date = utc_now()
                transaction.payment_method = PaymentMethod.RAZORPAY
                await transaction.save()
                
                # Update subscription if exists
                if transaction.subscription_id:
                    subscription = await CompanySubscription.get(transaction.subscription_id)
                    if subscription:
                        subscription.last_payment_date = utc_now()
                        subscription.last_payment_amount = transaction.total_amount
                        subscription.last_payment_status = "paid"
                        subscription.status = CompanySubscriptionStatus.ACTIVE
                        await subscription.save()
        
        elif event_type == "payment.failed":
            payment_data = payload_dict.get("payload", {}).get("payment", {}).get("entity", {})
            payment_id = payment_data.get("id")
            
            # Update transaction
            transaction = await BillingTransaction.find_one(
                BillingTransaction.razorpay_payment_id == payment_id
            )
            if transaction:
                transaction.payment_status = PaymentStatus.FAILED
                transaction.failure_reason = payment_data.get("error_description", "Payment failed")
                transaction.retry_count += 1
                await transaction.save()
        
        elif event_type == "subscription.charged":
            subscription_data = payload_dict.get("payload", {}).get("subscription", {}).get("entity", {})
            subscription_id = subscription_data.get("id")
            
            # Update subscription
            subscription = await CompanySubscription.find_one(
                CompanySubscription.razorpay_subscription_id == subscription_id
            )
            if subscription:
                subscription.last_payment_date = utc_now()
                subscription.status = CompanySubscriptionStatus.ACTIVE
                await subscription.save()
        
        webhook.status = WebhookStatus.PROCESSED
        webhook.processed_at = utc_now()
    except Exception as e:
        webhook.status = WebhookStatus.FAILED
        webhook.error_message = str(e)
        webhook.retry_count += 1
    
    webhook.updated_at = utc_now()
    await webhook.save()
    
    return {"status": "success"}


@router.get("/export", response_model=dict)
async def export_billing_data(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    format: str = Query("csv", pattern="^(csv|excel)$"),
    current_user: User = Depends(get_current_super_admin)
):
    """Export billing data to CSV/Excel"""
    query = {}
    if start_date:
        query["invoice_date"] = {"$gte": start_date}
    if end_date:
        if "invoice_date" in query:
            query["invoice_date"]["$lte"] = end_date
        else:
            query["invoice_date"] = {"$lte": end_date}
    
    transactions = await BillingTransaction.find(query).sort("-invoice_date").to_list()
    
    # Convert to export format
    export_data = []
    for t in transactions:
        export_data.append({
            "Invoice Number": t.invoice_number,
            "Company ID": t.company_id,
            "Invoice Date": t.invoice_date.isoformat(),
            "Due Date": t.due_date.isoformat() if t.due_date else "",
            "Amount": t.amount,
            "Tax": t.tax_amount,
            "Total": t.total_amount,
            "Currency": t.currency,
            "Payment Status": t.payment_status.value,
            "Payment Date": t.payment_date.isoformat() if t.payment_date else "",
            "Payment Method": t.payment_method.value if t.payment_method else ""
        })
    
    # In production, generate actual CSV/Excel file
    # For now, return JSON that can be converted on frontend
    return {
        "format": format,
        "data": export_data,
        "count": len(export_data)
    }





