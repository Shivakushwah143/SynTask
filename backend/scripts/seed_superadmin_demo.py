"""
Seed demo Super Admin data.

Run from backend root:
    python scripts/seed_superadmin_demo.py
"""
import asyncio
import sys
from datetime import timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.clock import utc_now
from app.core.config import settings
from app.core.database import close_db, init_db
from app.core.security import get_password_hash
from app.models.billing_transaction import BillingTransaction, PaymentStatus
from app.models.company import Company, CompanyStatus
from app.models.company_subscription import CompanySubscription, CompanySubscriptionStatus
from app.models.feature_flag import FeatureFlag
from app.models.subscription_plan import PlanStatus, SubscriptionPlan
from app.models.user import User, UserRole, UserStatus


PLANS = [
    {"name": "Free", "price_monthly": 0, "price_yearly": 0, "max_users": 5, "max_projects": 3, "max_storage_gb": 1, "features": ["tasks_projects"]},
    {"name": "Pro", "price_monthly": 4999, "price_yearly": 49990, "max_users": 25, "max_projects": 25, "max_storage_gb": 25, "features": ["tasks_projects", "sales_crm", "ai_agents"]},
    {"name": "Enterprise", "price_monthly": 14999, "price_yearly": 149990, "max_users": 100, "max_projects": 100, "max_storage_gb": 100, "features": ["tasks_projects", "sales_crm", "ai_agents", "recruitment", "custom_reports"]},
]


async def upsert_plan(data):
    plan = await SubscriptionPlan.find_one(SubscriptionPlan.name == data["name"], SubscriptionPlan.deleted == False)
    if not plan:
        plan = SubscriptionPlan(name=data["name"], status=PlanStatus.ACTIVE)
    for key, value in data.items():
        setattr(plan, key, value)
    plan.enabled_modules = data["features"]
    plan.updated_at = utc_now()
    await plan.save() if plan.id else await plan.insert()
    return plan


async def main():
    print("Connecting to database...")
    await init_db()
    plans = [await upsert_plan(data) for data in PLANS]
    password_hash = get_password_hash("DemoPass123!")
    companies_created = 0
    users_created = 0
    invoices_created = 0
    flags_created = 0

    super_admin = await User.find_one(User.email == settings.SUPER_ADMIN_EMAIL)
    if not super_admin:
        super_admin = User(
            email=settings.SUPER_ADMIN_EMAIL,
            password_hash=get_password_hash(settings.SUPER_ADMIN_PASSWORD),
            first_name="Super",
            last_name="Admin",
            role=UserRole.SUPER_ADMIN,
            status=UserStatus.ACTIVE,
            modules=[],
            active_module=None,
            is_email_verified=True,
        )
        await super_admin.insert()
        users_created += 1
        print(f"Created Super Admin: {settings.SUPER_ADMIN_EMAIL}")
    else:
        super_admin.role = UserRole.SUPER_ADMIN
        super_admin.status = UserStatus.ACTIVE
        super_admin.is_email_verified = True
        await super_admin.save()
        print(f"Updated Super Admin: {settings.SUPER_ADMIN_EMAIL}")

    for idx, plan in enumerate(plans, start=1):
        slug = plan.name.lower()
        company = await Company.find_one(Company.email == f"{slug}@demo.syntask.local")
        if not company:
            company = Company(name=f"{plan.name} Demo Co", email=f"{slug}@demo.syntask.local", status=CompanyStatus.ACTIVE)
            await company.insert()
            companies_created += 1
        company.max_users = plan.max_users or company.max_users
        company.max_projects = plan.max_projects or company.max_projects
        company.max_storage_gb = plan.max_storage_gb or company.max_storage_gb
        await company.save()

        subscription = await CompanySubscription.find_one(CompanySubscription.company_id == str(company.id))
        if not subscription:
            subscription = CompanySubscription(company_id=str(company.id), plan_id=str(plan.id))
        subscription.plan_id = str(plan.id)
        subscription.status = CompanySubscriptionStatus.ACTIVE
        subscription.billing_cycle = "monthly"
        subscription.amount = plan.price_monthly
        subscription.next_billing_date = utc_now() + timedelta(days=30 * idx)
        subscription.enabled_modules = plan.enabled_modules
        await subscription.save() if subscription.id else await subscription.insert()

        for user_idx in range(1, 6 + idx):
            role = UserRole.ADMIN if user_idx == 1 else UserRole.EMPLOYEE
            email = f"{slug}.user{user_idx}@demo.syntask.local"
            user = await User.find_one(User.email == email)
            if not user:
                user = User(
                    email=email,
                    password_hash=password_hash,
                    first_name=plan.name,
                    last_name=f"User {user_idx}",
                    role=role,
                    status=UserStatus.ACTIVE,
                    company_id=str(company.id),
                    modules=plan.enabled_modules,
                    is_email_verified=True,
                )
                await user.insert()
                users_created += 1

        invoice = await BillingTransaction.find_one(BillingTransaction.company_id == str(company.id))
        if not invoice:
            invoice = BillingTransaction(
                company_id=str(company.id),
                subscription_id=str(subscription.id),
                invoice_number=f"INV-DEMO-{idx:03d}",
                amount=plan.price_monthly,
                tax_rate=18,
                tax_amount=plan.price_monthly * 0.18,
                total_amount=plan.price_monthly * 1.18,
                payment_status=PaymentStatus.PAID if idx > 1 else PaymentStatus.PENDING,
                payment_date=utc_now() if idx > 1 else None,
                due_date=utc_now() + timedelta(days=15),
                notes=f"{plan.name} demo subscription",
            )
            await invoice.insert()
            invoices_created += 1

        for feature in ["ai_chat", "time_tracking", "custom_reports"]:
            flag = await FeatureFlag.find_one(FeatureFlag.company_id == str(company.id), FeatureFlag.feature_key == feature)
            if not flag:
                await FeatureFlag(company_id=str(company.id), feature_key=feature, is_enabled=feature in plan.enabled_modules, enabled_at=utc_now()).insert()
                flags_created += 1

    await close_db()
    print(
        "Seeded Super Admin demo data: "
        f"{len(plans)} plans, {companies_created} new companies, "
        f"{users_created} new users, {invoices_created} new invoices, {flags_created} new feature flags."
    )


if __name__ == "__main__":
    asyncio.run(main())
