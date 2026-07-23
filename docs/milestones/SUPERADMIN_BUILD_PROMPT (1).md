# Super Admin Complete Build Prompt — SynTask
> Feed this entire file to Cursor / Windsurf / Claude Code. It will build all phases in order.

---

## PROJECT CONTEXT

**Stack:**
- Frontend: React + Vite + TailwindCSS + React Query + Zustand (`frontend/src/`)
- Backend: FastAPI + MongoDB (Beanie ODM) (`backend/app/`)
- Auth: JWT (`get_current_super_admin` dependency already exists)
- Email: `backend/app/core/email.py` (already exists)
- Invoice PDF: `backend/app/services/invoice_pdf.py` (already exists)
- Existing superadmin API file: `frontend/src/api/superadmin.js`
- Existing superadmin pages folder: `frontend/src/pages/superadmin/`
- Existing superadmin layout: `frontend/src/layouts/SuperAdminLayout.jsx`
- Existing backend endpoints folder: `backend/app/api/v1/endpoints/`
- Router: `backend/app/api/v1/router.py`

**Existing superadmin backend files (do NOT delete, extend only):**
- `backend/app/api/v1/endpoints/superadmin_tenants.py`
- `backend/app/api/v1/endpoints/superadmin_billing.py`
- `backend/app/api/v1/endpoints/superadmin_plans.py`
- `backend/app/api/v1/endpoints/superadmin_usage.py`

**Existing superadmin frontend pages (do NOT delete, extend only):**
- `frontend/src/pages/superadmin/AdminDashboard.jsx`
- `frontend/src/pages/superadmin/TenantManagement.jsx`
- `frontend/src/pages/superadmin/TenantDetail.jsx`
- `frontend/src/pages/superadmin/BillingRevenue.jsx`
- `frontend/src/pages/superadmin/SubscriptionPlans.jsx`
- `frontend/src/pages/superadmin/UsageAnalytics.jsx`

**UI components available** (import from `../../components/ui`):
`Badge`, `Button`, `Table`, `Modal`, `PageHeader`, `EmptyState`, `SkeletonTable`, `SkeletonCard`, `FormField`, `LoadingSpinner`

---

## PHASE 1 — Clients List with User Count & Password Reset

### Goal
Super Admin sidebar shows all subscribed clients. Each client row shows user count and has a "Reset Password" button that sends email to the client's admin.

### Backend Tasks

**File: `backend/app/api/v1/endpoints/superadmin_tenants.py`**

Add these endpoints:

```python
@router.get("/{company_id}/users", response_model=List[dict])
async def list_company_users(
    company_id: str,
    current_user: User = Depends(get_current_super_admin)
):
    """List all users for a specific tenant company"""
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    users = await User.find(User.company_id == company_id).to_list()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("/{company_id}/users/{user_id}/reset-password")
async def reset_user_password(
    company_id: str,
    user_id: str,
    current_user: User = Depends(get_current_super_admin)
):
    """Send password reset email to a specific user"""
    from app.core.security import create_password_reset_token
    from app.core.email import send_password_reset_email

    user = await User.get(user_id)
    if not user or str(user.company_id) != company_id:
        raise HTTPException(status_code=404, detail="User not found")

    token = create_password_reset_token(str(user.id))
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    await send_password_reset_email(user.email, user.first_name, reset_url)
    return {"message": f"Password reset email sent to {user.email}"}
```

### Frontend Tasks

**File: `frontend/src/api/superadmin.js`** — Add these methods:
```js
getCompanyUsers: (companyId) => api.get(`/superadmin/tenants/${companyId}/users`),
resetUserPassword: (companyId, userId) =>
  api.post(`/superadmin/tenants/${companyId}/users/${userId}/reset-password`),
```

**File: `frontend/src/pages/superadmin/TenantDetail.jsx`** — Extend to show:
1. A "Users" tab showing a table of all users in that company
2. Each user row has a "Reset Password" button
3. On click, call `superadminApi.resetUserPassword(companyId, userId)` with confirmation dialog
4. Show success toast "Password reset email sent to {email}"

**File: `frontend/src/pages/superadmin/TenantManagement.jsx`** — The user count column already exists. Make the count clickable, linking to `TenantDetail` users tab.

---

## PHASE 2 — Suspend / Activate Clients (Kill Switch)

### Goal
Super Admin can instantly suspend any client (blocks all their API access) or reactivate them. Suspension reason is stored. Suspended clients see a "Your account is suspended" message.

### Backend Tasks

**File: `backend/app/api/v1/endpoints/superadmin_tenants.py`**

The `suspendTenant` and `activateTenant` endpoints already exist. Extend them:

```python
class TenantSuspendRequest(BaseModel):
    reason: str  # "payment_failed" | "compliance" | "manual"
    notes: Optional[str] = None
    notify_admin: bool = True  # Send email to company admin

@router.post("/{company_id}/suspend")
async def suspend_tenant(
    company_id: str,
    body: TenantSuspendRequest,
    current_user: User = Depends(get_current_super_admin)
):
    company = await Company.get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    company.status = CompanyStatus.suspended
    company.suspension_reason = body.reason
    company.suspension_notes = body.notes
    company.suspended_at = datetime.utcnow()
    company.suspended_by = str(current_user.id)
    await company.save()

    if body.notify_admin:
        admin = await User.find_one(User.company_id == company_id, User.role == "admin")
        if admin:
            from app.core.email import send_email
            await send_email(
                to=admin.email,
                subject="Your SynTask account has been suspended",
                body=f"Your account has been suspended. Reason: {body.reason}. Please contact support."
            )

    return {"message": "Tenant suspended", "company_id": company_id}
```

Also add suspension check in `backend/app/api/dependencies.py` — in `get_current_user`, after fetching company, raise HTTP 403 with `{"detail": "account_suspended", "reason": company.suspension_reason}` if company status is suspended.

### Frontend Tasks

**File: `frontend/src/pages/superadmin/TenantManagement.jsx`** — Update Suspend button to open a modal:
- Modal has: Reason dropdown (Payment Failed / Compliance / Manual), Notes textarea, "Notify Admin via Email" checkbox
- Confirm button calls suspend with reason+notes
- Show red "SUSPENDED" badge on suspended tenants
- Activate button shows only for suspended tenants

**File: `frontend/src/pages/auth/Login.jsx`** — Handle 403 with `account_suspended` detail, show a clear error: "Your account has been suspended. Please contact support."

---

## PHASE 3 — Invoice Generation & Email Sending

### Goal
Super Admin can generate an invoice for any client and send it to their email as PDF.

### Backend Tasks

**File: `backend/app/api/v1/endpoints/superadmin_billing.py`** — The `InvoiceGenerateRequest` model already exists. Add:

```python
@router.post("/invoices/generate")
async def generate_invoice(
    body: InvoiceGenerateRequest,
    current_user: User = Depends(get_current_super_admin)
):
    """Generate invoice PDF and optionally email it"""
    from app.services.invoice_pdf import generate_invoice_pdf
    from app.models.invoice import Invoice
    from app.core.email import send_email_with_attachment

    company = await Company.get(body.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    invoice_number = f"INV-{datetime.utcnow().strftime('%Y%m%d')}-{body.company_id[-6:].upper()}"
    tax_amount = body.amount * (body.tax_rate / 100)
    total_amount = body.amount + tax_amount

    invoice = Invoice(
        company_id=body.company_id,
        invoice_number=invoice_number,
        amount=body.amount,
        tax_rate=body.tax_rate,
        tax_amount=tax_amount,
        total_amount=total_amount,
        description=body.description or "SynTask Subscription",
        status="pending",
        due_date=datetime.utcnow() + timedelta(days=15),
        billing_period_start=body.billing_period_start,
        billing_period_end=body.billing_period_end,
        created_by=str(current_user.id),
    )
    await invoice.insert()

    pdf_bytes = await generate_invoice_pdf(invoice, company)
    return {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice_number,
        "total_amount": total_amount,
        "message": "Invoice generated successfully"
    }


@router.post("/invoices/{invoice_id}/send")
async def send_invoice_email(
    invoice_id: str,
    current_user: User = Depends(get_current_super_admin)
):
    """Email invoice PDF to company admin"""
    from app.models.invoice import Invoice
    from app.services.invoice_pdf import generate_invoice_pdf
    from app.core.email import send_email_with_attachment

    invoice = await Invoice.get(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    company = await Company.get(invoice.company_id)
    admin = await User.find_one(User.company_id == invoice.company_id, User.role == "admin")
    if not admin:
        raise HTTPException(status_code=404, detail="Company admin not found")

    pdf_bytes = await generate_invoice_pdf(invoice, company)
    await send_email_with_attachment(
        to=admin.email,
        subject=f"Invoice {invoice.invoice_number} from SynTask",
        body=f"Please find attached your invoice for {invoice.total_amount}. Due date: {invoice.due_date.strftime('%Y-%m-%d')}",
        attachment=pdf_bytes,
        attachment_name=f"{invoice.invoice_number}.pdf",
        content_type="application/pdf"
    )
    invoice.email_sent_at = datetime.utcnow()
    await invoice.save()
    return {"message": f"Invoice sent to {admin.email}"}


@router.get("/invoices", response_model=List[dict])
async def list_invoices(
    company_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_super_admin)
):
    query = {}
    if company_id:
        query["company_id"] = company_id
    if status:
        query["status"] = status
    from app.models.invoice import Invoice
    invoices = await Invoice.find(query).sort("-created_at").skip(skip).limit(limit).to_list()
    return [i.dict() for i in invoices]
```

**Add to `frontend/src/api/superadmin.js`:**
```js
generateInvoice: (data) => api.post('/superadmin/billing/invoices/generate', data),
sendInvoice: (invoiceId) => api.post(`/superadmin/billing/invoices/${invoiceId}/send`),
listInvoices: (params) => api.get('/superadmin/billing/invoices', { params }),
```

### Frontend Tasks

**File: `frontend/src/pages/superadmin/BillingRevenue.jsx`** — Add a section "Invoices":
1. Table of all invoices with columns: Invoice #, Company, Amount, Tax, Total, Status, Due Date, Sent, Actions
2. "Generate Invoice" button opens a modal with fields: Company (dropdown), Amount, Description, Tax Rate, Billing Period Start/End
3. Each invoice row has "Send Email" button
4. Status badges: pending (yellow), sent (blue), paid (green), overdue (red)

---

## PHASE 4 — Analytics Dashboard (Revenue, Sales, Subscriptions)

### Goal
Super Admin sees a real analytics dashboard: total revenue, active subscriptions, due dates, purchase dates, MRR trends.

### Backend Tasks

**File: `backend/app/api/v1/endpoints/superadmin_billing.py`** — Add:

```python
@router.get("/revenue/analytics")
async def revenue_analytics(
    period: str = Query("30d"),  # 7d, 30d, 90d, 1y
    current_user: User = Depends(get_current_super_admin)
):
    from app.models.billing_transaction import BillingTransaction
    from app.models.company_subscription import CompanySubscription

    now = datetime.utcnow()
    days = {"7d": 7, "30d": 30, "90d": 90, "1y": 365}.get(period, 30)
    since = now - timedelta(days=days)

    transactions = await BillingTransaction.find(
        BillingTransaction.created_at >= since
    ).to_list()

    total_revenue = sum(t.amount for t in transactions if t.payment_status == "paid")
    pending_revenue = sum(t.amount for t in transactions if t.payment_status == "pending")

    active_subs = await CompanySubscription.find(
        CompanySubscription.status == "active"
    ).to_list()
    mrr = sum(s.monthly_amount or 0 for s in active_subs)

    overdue_subs = await CompanySubscription.find(
        CompanySubscription.next_billing_date < now,
        CompanySubscription.status == "active"
    ).to_list()

    # Monthly breakdown for chart
    monthly = {}
    for t in transactions:
        if t.payment_status == "paid":
            month = t.created_at.strftime("%Y-%m")
            monthly[month] = monthly.get(month, 0) + t.amount

    return {
        "total_revenue": total_revenue,
        "pending_revenue": pending_revenue,
        "mrr": mrr,
        "active_subscriptions": len(active_subs),
        "overdue_subscriptions": len(overdue_subs),
        "total_transactions": len(transactions),
        "monthly_breakdown": [{"month": k, "revenue": v} for k, v in sorted(monthly.items())],
        "period": period
    }
```

**File: `backend/app/api/v1/endpoints/superadmin_tenants.py`** — Add:

```python
@router.get("/subscription-overview")
async def subscription_overview(
    current_user: User = Depends(get_current_super_admin)
):
    """Get all clients with subscription details: plan, purchase date, due date, status"""
    from app.models.company_subscription import CompanySubscription

    companies = await Company.find_all().to_list()
    result = []
    for company in companies:
        sub = await CompanySubscription.find_one(
            CompanySubscription.company_id == str(company.id),
            CompanySubscription.status.in_(["active", "trial", "overdue"])
        )
        result.append({
            "company_id": str(company.id),
            "company_name": company.name,
            "status": company.status,
            "plan": sub.plan_name if sub else None,
            "purchase_date": sub.created_at.isoformat() if sub and sub.created_at else None,
            "next_billing_date": sub.next_billing_date.isoformat() if sub and sub.next_billing_date else None,
            "monthly_amount": sub.monthly_amount if sub else None,
            "user_count": await User.find(User.company_id == str(company.id)).count(),
        })
    return result
```

### Frontend Tasks

**File: `frontend/src/pages/superadmin/AdminDashboard.jsx`** — Replace/extend with real data:
1. Top stat cards: Total Revenue, MRR, Active Subscriptions, Overdue Subscriptions
2. Revenue trend line chart (use recharts, already in project)
3. Period selector: 7d / 30d / 90d / 1y
4. Subscriptions table: Company, Plan, Purchase Date, Next Billing Date, Amount, Status
5. Color-code overdue rows in red
6. All data from `superadminApi.getRevenueAnalytics({ period })` and `/subscription-overview`

**Add to `frontend/src/api/superadmin.js`:**
```js
getSubscriptionOverview: () => api.get('/superadmin/tenants/subscription-overview'),
```

---

## PHASE 5 — Subscription & Plan Manager

### Goal
Super Admin assigns Free/Pro/Enterprise plan per client, sets user limits, configures what features each plan includes.

### Backend Tasks

**File: `backend/app/api/v1/endpoints/superadmin_plans.py`** — Already exists. Extend plan model to include:

```python
class PlanCreateRequest(BaseModel):
    name: str  # Free, Pro, Enterprise, Custom
    price_monthly: float
    price_yearly: float
    max_users: int
    max_projects: int
    max_storage_gb: float
    features: List[str]  # list of feature keys
    is_active: bool = True
    color: str = "#6366f1"  # for UI display

@router.put("/{plan_id}")
async def update_plan(plan_id: str, body: PlanCreateRequest, current_user: User = Depends(get_current_super_admin)):
    plan = await SubscriptionPlan.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    for field, value in body.dict().items():
        setattr(plan, field, value)
    plan.updated_at = datetime.utcnow()
    await plan.save()
    return plan.dict()
```

**File: `backend/app/api/v1/endpoints/superadmin_tenants.py`** — Add:

```python
class AssignPlanRequest(BaseModel):
    plan_id: str
    billing_cycle: str = "monthly"  # monthly | yearly
    custom_user_limit: Optional[int] = None
    notes: Optional[str] = None

@router.post("/{company_id}/assign-plan")
async def assign_plan_to_tenant(
    company_id: str,
    body: AssignPlanRequest,
    current_user: User = Depends(get_current_super_admin)
):
    company = await Company.get(company_id)
    plan = await SubscriptionPlan.get(body.plan_id)
    if not company or not plan:
        raise HTTPException(status_code=404, detail="Company or plan not found")

    from app.models.company_subscription import CompanySubscription
    existing = await CompanySubscription.find_one(CompanySubscription.company_id == company_id)
    if existing:
        existing.plan_id = body.plan_id
        existing.plan_name = plan.name
        existing.billing_cycle = body.billing_cycle
        existing.max_users = body.custom_user_limit or plan.max_users
        existing.updated_at = datetime.utcnow()
        await existing.save()
    else:
        sub = CompanySubscription(
            company_id=company_id,
            plan_id=body.plan_id,
            plan_name=plan.name,
            billing_cycle=body.billing_cycle,
            max_users=body.custom_user_limit or plan.max_users,
            monthly_amount=plan.price_monthly,
            status="active",
            created_at=datetime.utcnow(),
            next_billing_date=datetime.utcnow() + timedelta(days=30 if body.billing_cycle == "monthly" else 365),
        )
        await sub.insert()

    company.subscription_plan = plan.name
    await company.save()
    return {"message": f"Plan '{plan.name}' assigned to {company.name}"}
```

### Frontend Tasks

**File: `frontend/src/pages/superadmin/SubscriptionPlans.jsx`** — Full plan management UI:
1. Grid of plan cards (Free, Pro, Enterprise)
2. Each card shows: Name, Price monthly/yearly, Max users, Max projects, Storage, Features list
3. Edit button opens modal to edit plan details
4. Create New Plan button

**File: `frontend/src/pages/superadmin/TenantDetail.jsx`** — Add "Subscription" section:
1. Shows current plan, billing cycle, user limit, next billing date
2. "Change Plan" button opens modal with plan dropdown + custom user limit field + billing cycle selector
3. On submit, calls `superadminApi.assignPlan(companyId, data)`

**Add to `frontend/src/api/superadmin.js`:**
```js
assignPlan: (companyId, data) => api.post(`/superadmin/tenants/${companyId}/assign-plan`, data),
```

---

## PHASE 6 — Feature Flags (Live Feature Toggles Per Client)

### Goal
Super Admin can toggle any feature on/off for a specific client without code changes. Example: enable WhatsApp API only for Enterprise clients.

### Backend Tasks

**New file: `backend/app/models/feature_flag.py`**

```python
from beanie import Document
from pydantic import Field
from datetime import datetime
from typing import Optional

class FeatureFlag(Document):
    company_id: str
    feature_key: str  # e.g. "whatsapp_api", "meta_ads", "ai_chat", "recruitment"
    is_enabled: bool = False
    enabled_by: Optional[str] = None
    enabled_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "feature_flags"
        indexes = [
            [("company_id", 1), ("feature_key", 1)],
        ]
```

**New file: `backend/app/api/v1/endpoints/superadmin_features.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.models.feature_flag import FeatureFlag
from app.models.user import User
from app.api.dependencies import get_current_super_admin

router = APIRouter()

AVAILABLE_FEATURES = [
    {"key": "whatsapp_api", "label": "WhatsApp API", "description": "Meta WhatsApp Business integration"},
    {"key": "meta_ads", "label": "Meta Ads", "description": "Facebook & Instagram ads management"},
    {"key": "ai_chat", "label": "AI Assistant", "description": "AI-powered chat and task assistance"},
    {"key": "recruitment", "label": "Recruitment Module", "description": "HR recruitment and hiring"},
    {"key": "crm_advanced", "label": "Advanced CRM", "description": "CRM pipeline and automation"},
    {"key": "rag", "label": "Knowledge Base RAG", "description": "Document AI and RAG search"},
    {"key": "time_tracking", "label": "Time Tracking", "description": "Employee time tracking"},
    {"key": "custom_reports", "label": "Custom Reports", "description": "Advanced reporting and exports"},
]

class FeatureToggleRequest(BaseModel):
    feature_key: str
    is_enabled: bool
    notes: Optional[str] = None

@router.get("/available")
async def get_available_features(current_user: User = Depends(get_current_super_admin)):
    return AVAILABLE_FEATURES

@router.get("/{company_id}")
async def get_company_features(company_id: str, current_user: User = Depends(get_current_super_admin)):
    flags = await FeatureFlag.find(FeatureFlag.company_id == company_id).to_list()
    flag_map = {f.feature_key: f.is_enabled for f in flags}
    return [
        {
            **feat,
            "is_enabled": flag_map.get(feat["key"], False),
        }
        for feat in AVAILABLE_FEATURES
    ]

@router.put("/{company_id}/toggle")
async def toggle_feature(
    company_id: str,
    body: FeatureToggleRequest,
    current_user: User = Depends(get_current_super_admin)
):
    flag = await FeatureFlag.find_one(
        FeatureFlag.company_id == company_id,
        FeatureFlag.feature_key == body.feature_key
    )
    if flag:
        flag.is_enabled = body.is_enabled
        flag.enabled_by = str(current_user.id)
        flag.enabled_at = datetime.utcnow()
        flag.notes = body.notes
        flag.updated_at = datetime.utcnow()
        await flag.save()
    else:
        flag = FeatureFlag(
            company_id=company_id,
            feature_key=body.feature_key,
            is_enabled=body.is_enabled,
            enabled_by=str(current_user.id),
            enabled_at=datetime.utcnow(),
            notes=body.notes,
        )
        await flag.insert()
    return {"feature_key": body.feature_key, "is_enabled": body.is_enabled}
```

**Register in `backend/app/api/v1/router.py`:**
```python
from app.api.v1.endpoints import superadmin_features
router.include_router(superadmin_features.router, prefix="/superadmin/features", tags=["superadmin-features"])
```

**Register FeatureFlag in `backend/app/core/database.py`** in the `document_models` list.

### Frontend Tasks

**Add to `frontend/src/api/superadmin.js`:**
```js
getAvailableFeatures: () => api.get('/superadmin/features/available'),
getCompanyFeatures: (companyId) => api.get(`/superadmin/features/${companyId}`),
toggleFeature: (companyId, data) => api.put(`/superadmin/features/${companyId}/toggle`, data),
```

**File: `frontend/src/pages/superadmin/TenantDetail.jsx`** — Add "Feature Flags" tab:
1. List all available features as toggle switches
2. Green = enabled, Gray = disabled
3. Each toggle calls `toggleFeature` immediately on change
4. Show "Enabled by / Enabled at" below each toggle
5. Optional notes field on toggle

---

## PHASE 7 — Usage Metrics Tracker

### Goal
Track and display per-client: active users count, storage used, monthly API requests.

### Backend Tasks

**File: `backend/app/api/v1/endpoints/superadmin_usage.py`** — Already exists. Add:

```python
@router.get("/company/{company_id}/detailed")
async def get_company_detailed_usage(
    company_id: str,
    current_user: User = Depends(get_current_super_admin)
):
    from app.models.usage_tracking import UsageTracking
    from app.models.files import File  # if exists

    # User stats
    total_users = await User.find(User.company_id == company_id).count()
    active_users = await User.find(
        User.company_id == company_id,
        User.is_active == True
    ).count()

    # Usage tracking
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0)
    monthly_usage = await UsageTracking.find(
        UsageTracking.company_id == company_id,
        UsageTracking.created_at >= month_start
    ).to_list()

    api_requests_this_month = len(monthly_usage)
    storage_used_mb = sum(getattr(u, 'storage_bytes', 0) for u in monthly_usage) / (1024 * 1024)

    # Project and task counts
    from app.models.project import Project
    from app.models.task import Task
    project_count = await Project.find(Project.company_id == company_id).count()
    task_count = await Task.find(Task.company_id == company_id).count()

    return {
        "company_id": company_id,
        "total_users": total_users,
        "active_users": active_users,
        "api_requests_this_month": api_requests_this_month,
        "storage_used_mb": round(storage_used_mb, 2),
        "project_count": project_count,
        "task_count": task_count,
        "last_updated": now.isoformat(),
    }

@router.get("/all-companies-summary")
async def all_companies_usage_summary(
    current_user: User = Depends(get_current_super_admin)
):
    """Usage summary for all companies for the analytics table"""
    companies = await Company.find_all().to_list()
    result = []
    for company in companies:
        company_id = str(company.id)
        total_users = await User.find(User.company_id == company_id).count()
        from app.models.project import Project
        project_count = await Project.find(Project.company_id == company_id).count()
        result.append({
            "company_id": company_id,
            "company_name": company.name,
            "status": str(company.status) if company.status else "unknown",
            "total_users": total_users,
            "project_count": project_count,
            "plan": company.subscription_plan or "—",
        })
    return result
```

**Add to `frontend/src/api/superadmin.js`:**
```js
getCompanyDetailedUsage: (companyId) => api.get(`/superadmin/usage/company/${companyId}/detailed`),
getAllCompaniesUsageSummary: () => api.get('/superadmin/usage/all-companies-summary'),
```

### Frontend Tasks

**File: `frontend/src/pages/superadmin/UsageAnalytics.jsx`** — Build full usage page:
1. Top section: Summary table of all companies with columns: Company, Plan, Users, Projects, Status
2. Click a company row to expand and show detailed usage
3. Detailed view: Active Users, Total Users, API Requests This Month, Storage Used, Projects, Tasks
4. Progress bars for storage (e.g. 2.3 GB / 10 GB)
5. Color-code companies nearing their limits in yellow/red

**File: `frontend/src/pages/superadmin/TenantDetail.jsx`** — Add "Usage" tab:
1. Show all detailed usage metrics for that company
2. Storage bar, user count vs limit, API requests this month

---

## PHASE 8 — Sidebar Navigation Update + Routing

### Goal
All new pages are accessible from the Super Admin sidebar with correct routes.

### Frontend Tasks

**File: `frontend/src/layouts/SuperAdminLayout.jsx`** — Update navigation array to:

```js
const navigation = [
  { name: 'Dashboard', href: '/super-admin/dashboard', icon: LayoutDashboard },
  { name: 'Clients', href: '/super-admin/tenants', icon: Building2 },
  { name: 'Subscription Plans', href: '/super-admin/plans', icon: Package },
  { name: 'Billing & Invoices', href: '/super-admin/billing', icon: TrendingUp },
  { name: 'Usage Analytics', href: '/super-admin/usage', icon: BarChart3 },
  { name: 'Feature Flags', href: '/super-admin/feature-flags', icon: Zap },
  { name: 'Platform Audit', href: '/super-admin/activity', icon: Activity },
  { name: 'System Settings', href: '/super-admin/settings', icon: Settings },
]
```

Add import: `import { Zap } from 'lucide-react'`

**File: `frontend/src/App.jsx`** — Make sure these routes exist under the super admin layout:
```jsx
/super-admin/dashboard       → AdminDashboard
/super-admin/tenants         → TenantManagement
/super-admin/tenants/:id     → TenantDetail
/super-admin/plans           → SubscriptionPlans
/super-admin/billing         → BillingRevenue
/super-admin/usage           → UsageAnalytics
/super-admin/feature-flags   → FeatureFlagsPage (new page)
/super-admin/activity        → existing activity log
/super-admin/settings        → existing settings
```

**New file: `frontend/src/pages/superadmin/FeatureFlagsPage.jsx`**

Global feature flags page showing all companies and their feature states in a matrix table:
- Rows = Companies
- Columns = Features
- Each cell = toggle switch
- Bulk enable/disable by feature column header

---

## PHASE 9 — Production Hardening

### Backend Tasks

1. **Rate limiting on superadmin endpoints** — In `backend/app/middleware/rate_limiter.py`, apply stricter rate limits to all `/superadmin/` routes (max 100 requests/minute per IP)

2. **Audit logging** — Every superadmin action (suspend, activate, plan change, feature toggle, password reset, invoice send) must be logged. Add to `backend/app/models/audit_log.py`:
```python
class AuditLog(Document):
    action: str          # "suspend_tenant", "toggle_feature", etc.
    actor_id: str        # super admin user id
    target_type: str     # "company", "user", "plan"
    target_id: str
    details: dict        # whatever extra data is relevant
    created_at: datetime = Field(default_factory=datetime.utcnow)
    class Settings:
        name = "audit_logs"
```
Create a helper: `async def log_audit(action, actor_id, target_type, target_id, details)` and call it in every superadmin endpoint.

3. **Input validation** — All request bodies must have Pydantic validators. Add `@validator` for email fields, amount fields (must be > 0), and plan names (no empty strings).

4. **Error responses** — All endpoints return consistent error format:
```python
{"detail": "human readable message", "code": "error_code"}
```

### Frontend Tasks

1. **Loading states** — Every button that triggers an API call must show a spinner while loading. Use `isLoading` from `useMutation`.

2. **Error handling** — All API calls wrapped in try/catch. Show toast on error with `error.response?.data?.detail || "Something went wrong"`.

3. **Confirmation dialogs** — Destructive actions (Suspend, Delete, Reset Password, Kill Switch) must show a confirmation modal before executing.

4. **Empty states** — Every table/list must have an `EmptyState` component for when there is no data.

5. **Mobile responsiveness** — All superadmin pages must be scrollable and usable on mobile. Tables should have horizontal scroll on small screens.

---

## PHASE 10 — Final Integration & Testing

### Tasks

1. **Register all new models** in `backend/app/core/database.py` `document_models` list:
   - `FeatureFlag`
   - `AuditLog`

2. **Register all new routers** in `backend/app/api/v1/router.py`:
   - `superadmin_features` at `/superadmin/features`

3. **Test checklist** — Manually verify each of these flows works end to end:
   - [ ] Super Admin logs in → sees sidebar with all new items
   - [ ] Clients page loads with user counts
   - [ ] Click user count → see user list
   - [ ] Reset password → confirmation dialog → success toast → email sent
   - [ ] Suspend client with reason → client login shows suspended message
   - [ ] Activate suspended client → they can log in again
   - [ ] Generate invoice for client → invoice appears in list
   - [ ] Send invoice → client admin receives email with PDF
   - [ ] Revenue dashboard shows MRR, total revenue, chart
   - [ ] Subscription overview shows all clients with plan + due dates
   - [ ] Assign plan to client → their subscription updates
   - [ ] Toggle WhatsApp API feature flag ON for one client → OFF for another
   - [ ] Usage analytics shows per-client user counts, storage, API requests
   - [ ] Feature flags matrix page loads and toggles work
   - [ ] Audit log records every superadmin action

4. **Seed data script** — Create `backend/scripts/seed_superadmin_demo.py` that creates:
   - 3 demo companies with different plans (Free, Pro, Enterprise)
   - 5-10 users per company
   - Sample invoices
   - Sample billing transactions
   - Sample feature flags

---

## IMPORTANT RULES FOR THE AI CODING TOOL

1. **Do NOT delete existing files** — Only add to them
2. **Do NOT change auth logic** — `get_current_super_admin` dependency handles all auth
3. **Import UI components** from `../../components/ui` (Badge, Button, Table, Modal, PageHeader, EmptyState, SkeletonTable, SkeletonCard)
4. **Use React Query** (`useQuery`, `useMutation`) for all API calls — no raw `useEffect` + `fetch`
5. **Use `toast` from `react-hot-toast`** for all success/error notifications
6. **Use TailwindCSS** for all styling — no inline styles, no CSS modules
7. **All new backend models** must extend Beanie `Document` and be registered in `database.py`
8. **All new API routes** must use the `get_current_super_admin` dependency for authentication
9. Build Phase 1 first, test it, then move to Phase 2, and so on
10. Each phase must be fully functional before moving to the next
