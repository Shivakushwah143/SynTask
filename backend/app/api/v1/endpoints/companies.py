"""
Company Management Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form
from datetime import datetime
from typing import Optional

from app.models.company import Company, CompanyStatus, Subscription, SubscriptionPlan, SubscriptionStatus
from app.models.user import User, CompanyAdmin, UserStatus
from app.models.company_subscription import CompanySubscription, CompanySubscriptionStatus
from app.models.subscription_plan import SubscriptionPlan as SubscriptionPlanDoc
from app.core.security import get_password_hash
from app.api.dependencies import get_current_user, get_current_super_admin


router = APIRouter()
@router.post("/register")
async def register_company(
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    website: Optional[str] = Form(None),
    admin_first_name: Optional[str] = Form(None),
    admin_last_name: Optional[str] = Form(None),
    admin_email: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    zip_code: Optional[str] = Form(None),
    industry: Optional[str] = Form(None),
    company_size: Optional[str] = Form(None),
    registration_number: Optional[str] = Form(None),
    tax_id: Optional[str] = Form(None),
    seats_requested: Optional[int] = Form(None),
    contact_role: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    subscription_plan: Optional[SubscriptionPlan] = Form(None),
    billing_cycle: Optional[str] = Form(None),
    payment_method: Optional[str] = Form(None),
    payment_reference: Optional[str] = Form(None),
):

    """Register a new company (Public endpoint - requires Super Admin approval)"""
    # Check if company already exists
    existing = await Company.find_one(Company.email == email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company with this email already exists"
        )
    
    # Create company
    company = Company(
        name=name,
        email=email,
        phone=phone,
        website=website,
        status=CompanyStatus.PENDING,
        address=address,
        city=city,
        state=state,
        country=country,
        zip_code=zip_code,
        industry=industry,
        company_size=company_size,
        registration_number=registration_number,
        tax_id=tax_id,
        seats_requested=seats_requested,
        admin_first_name=admin_first_name,
        admin_last_name=admin_last_name,
        admin_email=admin_email,
        contact_role=contact_role,
        notes=notes,
        requested_plan=subscription_plan,
        requested_billing_cycle=billing_cycle,
        payment_method_preference=payment_method,
        payment_reference=payment_reference,
    )
    
    await company.insert()
    
    
    return {
        "message": "Company registration request submitted. Awaiting Super Admin approval.",
        "company_id": str(company.id)
    }


@router.get("/")
async def list_companies(
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_super_admin)
):
    """List all companies (Super Admin only)"""
    query = {}
    if status_filter:
        query["status"] = status_filter
    
    companies = await Company.find(query).skip(skip).limit(limit).to_list()
    total = await Company.find(query).count()
    
    return {
        "companies": [
            {
                "id": str(company.id),
                "name": company.name,
                "email": company.email,
                "status": company.status.value,
                "created_at": company.created_at,
                "max_users": company.max_users,
                "max_projects": company.max_projects
            }
            for company in companies
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/{company_id}")
async def get_company(
    company_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get company details"""
    company = await Company.get(company_id)
    
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
        
    # Check access
    from app.models.user import UserRole
    if current_user.role != UserRole.SUPER_ADMIN:
        if current_user.company_id != company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
    
    return {
        "id": str(company.id),
        "name": company.name,
        "email": company.email,
        "phone": company.phone,
        "website": company.website,
        "address": company.address,
        "city": company.city,
        "state": company.state,
        "country": company.country,
        "zip_code": company.zip_code,
        "registration_number": company.registration_number,
        "status": company.status.value,
        "max_users": company.max_users,
        "max_projects": company.max_projects,
        "max_storage_gb": company.max_storage_gb,
        "created_at": company.created_at,
    }
    


@router.post("/{company_id}/approve")
async def approve_company(
    company_id: str,
    admin_first_name: str = Form(...),
    admin_last_name: str = Form(...),
    admin_email: str = Form(...),
    admin_password: str = Form(...),
    role: Optional[str] = Form('admin'),
    phone: Optional[str] = Form(None),
    modules: Optional[str] = Form(None),
    subscription_plan: Optional[SubscriptionPlan] = Form(None),
    plan_id: Optional[str] = Form(None),
    billing_cycle: Optional[str] = Form(None),
    current_user: User = Depends(get_current_super_admin)
):
    """Approve company and create admin account (Super Admin only). Use plan_id for Plans Management plans (e.g. Real Time), or subscription_plan for legacy enum."""
    from app.models.user import UserRole
    
    company = await Company.get(company_id)
    
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    if company.status != CompanyStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company is not pending approval"
        )
    
    # Check if admin email already exists
    existing_user = await User.find_one(User.email == admin_email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin email already exists"
        )
    
    allowed_modules = ["task", "sales"]
    parsed_modules = []
    if modules:
        parsed_modules = [
            m.strip()
            for m in modules.split(",")
            if m and m.strip() in allowed_modules
        ]
    if not parsed_modules:
        parsed_modules = ["task"]
    active_module = parsed_modules[0]
    
    plan_doc = None
    if plan_id and plan_id.strip():
        plan_doc = await SubscriptionPlanDoc.get(plan_id.strip())
        if not plan_doc or getattr(plan_doc, "deleted", False):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription plan not found"
            )
        parsed_modules = list(plan_doc.enabled_modules) if getattr(plan_doc, "enabled_modules", None) else ["task"]
        if not parsed_modules:
            parsed_modules = ["task"]
        active_module = parsed_modules[0]
    
    # Determine role
    try:
        target_role = UserRole(role.lower()) if role else UserRole.ADMIN
    except ValueError:
        target_role = UserRole.ADMIN
    
    # Create user based on role
    user_data = {
        "email": admin_email.lower(),
        "password_hash": get_password_hash(admin_password),
        "first_name": admin_first_name,
        "last_name": admin_last_name,
        "role": target_role,
        "company_id": company_id,
        "created_by": str(current_user.id),
        "phone": phone,
        "modules": parsed_modules,
        "active_module": active_module,
        "status": UserStatus.ACTIVE
    }
    
    if target_role == UserRole.ADMIN:
        admin = CompanyAdmin(**user_data)
    else:
        admin = User(**user_data)
    
    await admin.insert()
    
    # Update company
    company.status = CompanyStatus.ACTIVE
    company.admin_id = str(admin.id)
    company.approved_at = datetime.now()
    company.approved_by = str(current_user.id)
    await company.save()
    
    billing_cycle_val = (billing_cycle or company.requested_billing_cycle or "monthly").strip().lower()
    if billing_cycle_val not in ("monthly", "yearly", "annual"):
        billing_cycle_val = "monthly"
    if billing_cycle_val == "annual":
        billing_cycle_val = "yearly"
    
    if plan_doc:
        amount = plan_doc.price_monthly if billing_cycle_val == "monthly" else plan_doc.price_yearly
        start_date = datetime.now()
        sub = CompanySubscription(
            company_id=company_id,
            plan_id=str(plan_doc.id),
            status=CompanySubscriptionStatus.TRIAL if (getattr(plan_doc, "has_trial", False) and getattr(plan_doc, "trial_days", 0)) else CompanySubscriptionStatus.ACTIVE,
            billing_cycle=billing_cycle_val,
            amount=amount,
            currency=getattr(plan_doc, "currency", "INR"),
            start_date=start_date,
            end_date=None,
            enabled_modules=list(plan_doc.enabled_modules) if getattr(plan_doc, "enabled_modules", None) else ["task"],
            payment_method="manual",
        )
        await sub.insert()
    else:
        plan_to_use = subscription_plan or company.requested_plan or SubscriptionPlan.FREE
        payment_method = company.payment_method_preference
        subscription = Subscription(
            company_id=company_id,
            plan=plan_to_use,
            status=SubscriptionStatus.TRIAL,
            billing_cycle=billing_cycle_val,
            payment_method=payment_method,
        )
        await subscription.insert()
    
    # Queue welcome email to the new Company Admin
    try:
        from app.worker.tasks.email_tasks import send_welcome_email_task
        send_welcome_email_task.delay(
            admin_email,
            admin_password,
            admin_first_name,
            admin_last_name,
            target_role.value.upper(),
            f"{current_user.first_name} {current_user.last_name}",
        )
    except Exception as e:
        # Log error but don't fail the request
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send welcome email to {admin_email}: {str(e)}")
    
    return {
        "message": "Company approved successfully",
        "admin_id": str(admin.id)
    }


@router.patch("/{company_id}/status")
async def update_company_status(
    company_id: str,
    new_status: CompanyStatus,
    current_user: User = Depends(get_current_super_admin)
):
    """Update company status (Super Admin only)"""
    company = await Company.get(company_id)
    
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    company.status = new_status
    company.updated_at = datetime.now()
    await company.save()
    
    return {"message": "Company status updated successfully"}


@router.delete("/{company_id}")
async def delete_company(
    company_id: str,
    current_user: User = Depends(get_current_super_admin)
):
    """Delete company permanently (Super Admin only)"""
    company = await Company.get(company_id)
    
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found"
        )
    
    # Cascade delete related data
    # 1. Delete Users
    await User.find(User.company_id == str(company.id)).delete()
    
    # 2. Delete Projects
    from app.models.project import Project
    await Project.find(Project.company_id == str(company.id)).delete()
    
    # 3. Delete Subscriptions
    await Subscription.find(Subscription.company_id == str(company.id)).delete()
    
    # 4. Delete Company
    await company.delete()
    
    return {"message": "Company permanently deleted"} 

