"""
Seed a realistic CRM + delivery dataset for production stress testing.

The script is idempotent at the natural-key level and reuses the existing
Beanie models, CRM automation flow, timeline events, and knowledge ingestion
where possible.
"""
from __future__ import annotations

import asyncio
import random
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.database import close_db, init_db
from app.core.security import get_password_hash
from app.crm.deal_automation import handle_won_deal_automation
from app.crm.timeline import publish_crm_timeline_event
from app.knowledge.service import knowledge_service
from app.models.client import Client, ClientStatus
from app.models.company import Company, CompanyStatus, Subscription, SubscriptionStatus
from app.models.content_calendar import ContentCalendarItem, ContentItemPriority, ContentItemStatus, ContentItemType
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.crm_company import CRMCompany
from app.models.crm_deal import CRMDeal
from app.models.crm_proposal import CRMProposal, CRMProposalStatus
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.meeting import Meeting, MeetingStatus
from app.models.project import Project, ProjectStatus, ProjectType
from app.models.sales_prospect import InterestLevel, ProspectStatus, SalesProspect
from app.models.sales_contact import SalesContact
from app.models.sales_lead_note import SalesLeadNote
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User, UserRole, UserStatus

SEED = 42
random.seed(SEED)

TENANT_NAME = "SynTask Digital Agency"
TENANT_EMAIL = "seed.agency@synTask.local"
TENANT_PHONE = "+911140000001"
TENANT_WEBSITE = "https://syntask.local"
TENANT_INDUSTRY = "Digital Marketing"
TENANT_COMPANY_SIZE = "11-50"
TENANT_PASSWORD = "Seed@123456"

BASE_DATE = datetime.utcnow().replace(microsecond=0)

TARGET_USERS = 20
TARGET_COMPANIES = 500
TARGET_CONTACTS = 1500
TARGET_LEADS = 2000
TARGET_FOLLOWUPS = 2000
TARGET_ACTIVITIES = 5000
TARGET_DEALS = 500
TARGET_PROPOSAL_FAMILIES = 250
TARGET_PROPOSAL_VERSIONS = 650
TARGET_PROJECTS_MIN = 200
TARGET_PROJECTS_MAX = 300
TARGET_CONTENT_DAYS = 365
TARGET_CALENDAR_EVENTS = 2000
TARGET_KNOWLEDGE_DOCS = 1000
TARGET_TIMELINE_EVENTS = 20000
PROJECT_TASK_TARGET = 5200

INDUSTRIES = [
    "Local Business",
    "E-commerce",
    "SaaS",
    "Healthcare",
    "Education",
    "Restaurants",
    "Real Estate",
    "Manufacturing",
]

COMPANY_PREFIXES = {
    "Local Business": ["Bright", "Metro", "Peak", "City", "North"],
    "E-commerce": ["Cart", "Nova", "Swift", "Prime", "Market"],
    "SaaS": ["Cloud", "Flow", "Stack", "Pulse", "Orbit"],
    "Healthcare": ["Well", "Care", "Medi", "Health", "Vital"],
    "Education": ["Learn", "Edus", "Campus", "Scholars", "Academy"],
    "Restaurants": ["Bistro", "Fork", "Table", "Spice", "Tasty"],
    "Real Estate": ["Nest", "Prime", "Urban", "Estate", "Harbor"],
    "Manufacturing": ["Forge", "Atlas", "Build", "Core", "Axis"],
}

SERVICE_CATALOG = [
    "SEO",
    "Social Media",
    "Performance Marketing",
    "Branding",
    "Web Development",
]

STAGES = ["new", "contacted", "discovery_scheduled", "discovery_completed", "qualified", "proposal_sent", "negotiation", "won", "lost"]
CONTENT_TYPES = [
    ContentItemType.REEL,
    ContentItemType.STATIC_POST,
    ContentItemType.CAROUSEL,
    ContentItemType.STORY,
    ContentItemType.BLOG,
    ContentItemType.YOUTUBE,
    ContentItemType.EMAIL_CAMPAIGN,
]

INVOICE_STATUS_FLOW = [InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.PAID, InvoiceStatus.CANCELLED]

PROJECT_TEMPLATES = {
    "SEO": ["Keyword audit", "Technical fixes", "Content plan", "Reporting"],
    "Social Media": ["Content pillars", "Calendar setup", "Asset production", "Weekly review"],
    "Performance Marketing": ["Tracking setup", "Campaign build", "Launch", "Optimization"],
    "Branding": ["Discovery", "Concepts", "Identity system", "Delivery"],
    "Web Development": ["Scope", "Build", "QA", "Launch"],
}


@dataclass
class SeedRefs:
    tenant: Company
    agency_company_id: str
    users: dict[str, User]
    crm_companies: list[CRMCompany]
    contacts: list[SalesContact]
    leads: list[SalesProspect]
    deals: list[CRMDeal]
    proposals: list[CRMProposal]
    clients: list[Client]
    projects: list[Project]


def months_ago(offset: int) -> datetime:
    year = BASE_DATE.year
    month = BASE_DATE.month - offset
    while month <= 0:
        month += 12
        year -= 1
    day = min(BASE_DATE.day, 28)
    return BASE_DATE.replace(year=year, month=month, day=day)


def days_ago(days: int) -> datetime:
    return BASE_DATE - timedelta(days=days)


def display_name(first_name: str, last_name: str) -> str:
    return f"{first_name} {last_name}".strip()


async def upsert_tenant() -> Company:
    now = datetime.utcnow()
    tenant = await Company.find_one({"email": TENANT_EMAIL})
    if not tenant:
        tenant = Company(
            name=TENANT_NAME,
            email=TENANT_EMAIL,
            phone=TENANT_PHONE,
            website=TENANT_WEBSITE,
            industry=TENANT_INDUSTRY,
            company_size=TENANT_COMPANY_SIZE,
            status=CompanyStatus.ACTIVE,
            max_users=100,
            max_projects=250,
            max_storage_gb=500,
            approved_at=now,
        )
        await tenant.insert()
    else:
        tenant.status = CompanyStatus.ACTIVE
        tenant.industry = TENANT_INDUSTRY
        tenant.company_size = TENANT_COMPANY_SIZE
        tenant.updated_at = now
        await tenant.save()

    subscription = await Subscription.find_one({"company_id": str(tenant.id)})
    if not subscription:
        subscription = Subscription(
            company_id=str(tenant.id),
            status=SubscriptionStatus.ACTIVE,
            plan="enterprise",
            current_users=15,
            current_projects=250,
            current_storage_gb=250.0,
            auto_renew=True,
            start_date=months_ago(12),
            trial_end_date=months_ago(11),
        )
        await subscription.insert()
    else:
        subscription.status = SubscriptionStatus.ACTIVE
        subscription.current_users = max(subscription.current_users, 15)
        subscription.current_projects = max(subscription.current_projects, 250)
        subscription.current_storage_gb = max(subscription.current_storage_gb, 250.0)
        subscription.updated_at = now
        await subscription.save()
    return tenant


async def upsert_user(*, email: str, first_name: str, last_name: str, role: UserRole, company_id: str, modules: list[str], reports_to: str | None = None, ancestors: list[str] | None = None, password: str = TENANT_PASSWORD) -> User:
    now = datetime.utcnow()
    user = await User.find_one({"email": email})
    if not user:
        user = User(
            email=email,
            password_hash=get_password_hash(password),
            first_name=first_name,
            last_name=last_name,
            role=role,
            status=UserStatus.ACTIVE,
            modules=modules,
            active_module=modules[0] if modules else "task",
            company_id=company_id,
            reports_to=reports_to,
            created_by=reports_to,
            ancestors=ancestors or [],
            is_email_verified=True,
        )
        await user.insert()
    else:
        user.password_hash = get_password_hash(password)
        user.first_name = first_name
        user.last_name = last_name
        user.role = role
        user.status = UserStatus.ACTIVE
        user.modules = modules
        user.active_module = modules[0] if modules else "task"
        user.company_id = company_id
        user.reports_to = reports_to
        user.ancestors = ancestors or []
        user.is_email_verified = True
        user.updated_at = now
        await user.save()
    return user


async def seed_team(tenant: Company) -> dict[str, User]:
    company_id = str(tenant.id)
    super_admin = await upsert_user(email="superadmin@synTask.local", first_name="System", last_name="Admin", role=UserRole.SUPER_ADMIN, company_id=company_id, modules=["task", "sales", "crm", "project", "content", "finance"], password=TENANT_PASSWORD)
    admin = await upsert_user(email="admin@synTask.local", first_name="Asha", last_name="Mehta", role=UserRole.ADMIN, company_id=company_id, modules=["task", "sales", "crm", "project", "content", "finance"])
    manager = await upsert_user(email="sales.manager@synTask.local", first_name="Rohan", last_name="Patel", role=UserRole.MANAGER, company_id=company_id, modules=["task", "sales", "crm"], reports_to=str(admin.id), ancestors=[str(admin.id)])
    lead = await upsert_user(email="sales.lead@synTask.local", first_name="Neha", last_name="Sharma", role=UserRole.LEAD, company_id=company_id, modules=["task", "sales", "crm"], reports_to=str(manager.id), ancestors=[str(admin.id), str(manager.id)])
    employees = [
        ("sales.exec@synTask.local", "Arjun", "Khan", UserRole.EMPLOYEE, ["task", "sales", "crm"]),
        ("project.manager@synTask.local", "Priya", "Nair", UserRole.MANAGER, ["task", "project", "content"], str(admin.id), [str(admin.id)]),
        ("writer@synTask.local", "Kavya", "Iyer", UserRole.EMPLOYEE, ["task", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
        ("designer@synTask.local", "Ritesh", "Singh", UserRole.EMPLOYEE, ["task", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
        ("video.editor@synTask.local", "Maya", "Desai", UserRole.EMPLOYEE, ["task", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
        ("seo@synTask.local", "Rahul", "Verma", UserRole.EMPLOYEE, ["task", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
        ("social@synTask.local", "Sana", "Kapoor", UserRole.EMPLOYEE, ["task", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
        ("dev@synTask.local", "Ankit", "Malhotra", UserRole.EMPLOYEE, ["task", "project"], str(admin.id), [str(admin.id)]),
        ("qa@synTask.local", "Tanya", "Joshi", UserRole.EMPLOYEE, ["task", "project"], str(admin.id), [str(admin.id)]),
        ("finance@synTask.local", "Vikram", "Rao", UserRole.EMPLOYEE, ["task"], str(admin.id), [str(admin.id)]),
        ("account@synTask.local", "Isha", "Bose", UserRole.EMPLOYEE, ["task", "sales"], str(manager.id), [str(admin.id), str(manager.id)]),
        ("support@synTask.local", "Dev", "Agarwal", UserRole.EMPLOYEE, ["task"], str(admin.id), [str(admin.id)]),
        ("ops@synTask.local", "Nitin", "Khanna", UserRole.EMPLOYEE, ["task", "project", "content"], str(admin.id), [str(admin.id)]),
        ("client.success@synTask.local", "Pooja", "Sethi", UserRole.EMPLOYEE, ["task", "sales"], str(manager.id), [str(admin.id), str(manager.id)]),
        ("copywriter@synTask.local", "Mansi", "Kulkarni", UserRole.EMPLOYEE, ["task", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
        ("video.lead@synTask.local", "Varun", "Das", UserRole.EMPLOYEE, ["task", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
        ("qa.lead@synTask.local", "Sneha", "Roy", UserRole.EMPLOYEE, ["task", "project"], str(admin.id), [str(admin.id)]),
        ("paid.media@synTask.local", "Amit", "Gupta", UserRole.EMPLOYEE, ["task", "sales", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
    ]
    roster = {"super_admin": super_admin, "admin": admin, "manager": manager, "lead": lead}
    for email, first_name, last_name, role, modules, reports_to, ancestors in employees:
        roster[email.split("@")[0]] = await upsert_user(
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=role,
            company_id=company_id,
            modules=modules,
            reports_to=reports_to,
            ancestors=ancestors,
        )

    user_entries = list(roster.items())
    if len(user_entries) < TARGET_USERS:
        extras = [
            ("content.manager", "Meera", "Chopra", UserRole.MANAGER, ["task", "content"], str(admin.id), [str(admin.id)]),
            ("seo.specialist", "Karan", "Gill", UserRole.EMPLOYEE, ["task", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
            ("designer.2", "Pallavi", "Das", UserRole.EMPLOYEE, ["task", "content"], str(lead.id), [str(admin.id), str(manager.id), str(lead.id)]),
            ("developer.2", "Rohit", "Kapoor", UserRole.EMPLOYEE, ["task", "project"], str(admin.id), [str(admin.id)]),
            ("qa.2", "Nisha", "Pillai", UserRole.EMPLOYEE, ["task", "project"], str(admin.id), [str(admin.id)]),
        ]
        for email_prefix, first_name, last_name, role, modules, reports_to, ancestors in extras:
            if len(roster) >= TARGET_USERS:
                break
            roster[email_prefix] = await upsert_user(
                email=f"{email_prefix}@synTask.local",
                first_name=first_name,
                last_name=last_name,
                role=role,
                company_id=company_id,
                modules=modules,
                reports_to=reports_to,
                ancestors=ancestors,
            )
    return roster


def make_company_name(index: int) -> tuple[str, str]:
    industry = INDUSTRIES[index % len(INDUSTRIES)]
    prefix = random.choice(COMPANY_PREFIXES[industry])
    suffixes = ["Studio", "Works", "Labs", "Digital", "Group", "Collective", "Hub", "Solutions"]
    descriptor = random.choice(suffixes)
    return industry, f"{prefix} {descriptor} {index + 1}"


async def seed_crm_companies(tenant_id: str) -> list[CRMCompany]:
    companies: list[CRMCompany] = []
    for index in range(TARGET_COMPANIES):
        industry, name = make_company_name(index)
        existing = await CRMCompany.find_one({"company_id": tenant_id, "name": name})
        payload = {
            "name": name,
            "company_id": tenant_id,
            "email": f"hello+{index+1}@{name.lower().replace(' ', '').replace('&', 'and')}.com",
            "phone": f"+91{9000000000 + index}",
            "website": f"https://{name.lower().replace(' ', '').replace('&', 'and')}.com",
            "industry": industry,
            "company_size": random.choice(["1-10", "11-50", "51-200", "201-500"]),
            "notes": f"Seeded {industry.lower()} prospect for agency workflow testing.",
            "created_by": tenant_id,
            "updated_by": tenant_id,
            "primary_contact_id": None,
            "created_at": months_ago(12 - (index % 12)),
            "updated_at": months_ago(index % 12),
        }
        if existing:
            for key, value in payload.items():
                setattr(existing, key, value)
            await existing.save()
            companies.append(existing)
        else:
            company = CRMCompany(**payload)
            await company.insert()
            companies.append(company)
    return companies


async def seed_contacts(tenant_id: str, crm_companies: list[CRMCompany]) -> list[SalesContact]:
    contacts: list[SalesContact] = []
    for index in range(TARGET_CONTACTS):
        company = crm_companies[index % len(crm_companies)]
        first = ["Aarav", "Mira", "Kabir", "Diya", "Ishaan", "Anaya", "Vihaan", "Riya"][index % 8]
        last = ["Shah", "Patel", "Mehta", "Joshi", "Khan", "Nair", "Verma", "Bose"][index % 8]
        email = f"{first.lower()}.{last.lower()}.{index+1}@{company.name.lower().replace(' ', '')}.com"
        existing = await SalesContact.find_one({"company_id": tenant_id, "email": email})
        payload = {
            "first_name": first,
            "last_name": last,
            "country_code": "+91",
            "phone": f"{7000000000 + index}",
            "email": email,
            "company_name": company.name,
            "designation": random.choice(["Founder", "CMO", "Marketing Manager", "Growth Lead", "Owner", "Procurement Head"]),
            "channel": random.choice(["Referral", "Organic", "LinkedIn", "Email", "Trade Show"]),
            "relationship_type": random.choice(["Decision Maker", "Influencer", "Approver", "Champion"]),
            "nationality": ["Indian"],
            "language": ["English"],
            "owner_name": "Asha Mehta",
            "owner_contact_no": TENANT_PHONE,
            "tag": [company.industry.lower().replace(" ", "_"), "seed"],
            "crm_company_id": str(company.id),
            "is_primary_contact": index % 2 == 0,
            "company_id": tenant_id,
            "created_by": tenant_id,
            "updated_by": tenant_id,
            "created_at": months_ago((index % 12)),
            "updated_at": months_ago((index % 12)),
        }
        if existing:
            for key, value in payload.items():
                setattr(existing, key, value)
            await existing.save()
            contacts.append(existing)
        else:
            contact = SalesContact(**payload)
            await contact.insert()
            contacts.append(contact)

        if not company.primary_contact_id and index % 2 == 0:
            company.primary_contact_id = str(contacts[-1].id)
            company.updated_at = datetime.utcnow()
            await company.save()
    return contacts


def stage_for_index(index: int) -> str:
    return STAGES[index % len(STAGES)]


async def seed_leads(tenant: Company, crm_companies: list[CRMCompany], contacts: list[SalesContact], team: dict[str, User]) -> list[SalesProspect]:
    leads: list[SalesProspect] = []
    sales_owner = team["sales.exec"] if "sales.exec" in team else team["sales.exec"]
    company_id = str(tenant.id)
    for index in range(TARGET_LEADS):
        company = crm_companies[index % len(crm_companies)]
        contact = contacts[index % len(contacts)]
        first_name = contact.first_name
        last_name = contact.last_name
        prospect_name = f"{first_name} {last_name}"
        phone = contact.phone
        stage = stage_for_index(index)
        status = ProspectStatus.WON if stage == "won" else ProspectStatus.LOST if stage == "lost" else ProspectStatus.ACTIVE
        existing = await SalesProspect.find_one({"company_id": company_id, "phone": phone})
        payload = {
            "first_name": first_name,
            "last_name": last_name,
            "prospect_name": prospect_name,
            "country_code": "+91",
            "phone": phone,
            "email": contact.email,
            "contact_id": str(contact.id),
            "category_id": random.choice(SERVICE_CATALOG),
            "product_ids": [random.choice(["SEO", "Paid Ads", "Content", "Web", "Branding"])],
            "interest_level": random.choice(list(InterestLevel)),
            "estimated_close_date": months_ago(index % 12) + timedelta(days=30),
            "assigned_to": str(sales_owner.id),
            "assigned_by": str(team["manager"].id),
            "current_stage": stage,
            "due_date": months_ago(index % 12) + timedelta(days=7),
            "due_time": random.choice(["10:00 AM", "11:30 AM", "03:00 PM"]),
            "remark": f"Seed lead for {company.industry.lower()} account {company.name}.",
            "company_name": company.name,
            "crm_company_id": str(company.id),
            "relationship_type": "decision maker",
            "channel": random.choice(["Referral", "Website", "LinkedIn", "Cold Email", "Event"]),
            "source": random.choice(["website", "referral", "linkedin", "ads", "bulk_upload"]),
            "designation": contact.designation,
            "nationality": ["Indian"],
            "language": ["English"],
            "owner_name": display_name(team["sales.exec"].first_name, team["sales.exec"].last_name),
            "owner_contact_no": team["sales.exec"].phone or TENANT_PHONE,
            "tag": [company.industry.lower().replace(" ", "_"), stage],
            "greeting_preference": "Both",
            "status": status,
            "closed_date": months_ago(index % 12) if status in {ProspectStatus.WON, ProspectStatus.LOST, ProspectStatus.CLOSED} else None,
            "closed_by": str(team["sales.exec"].id) if status in {ProspectStatus.WON, ProspectStatus.LOST, ProspectStatus.CLOSED} else None,
            "reason_for_lost": random.choice(["Budget", "Timing", "No fit", "Competitor"]) if status == ProspectStatus.LOST else None,
            "won_amount": random.randint(120000, 3500000) if status == ProspectStatus.WON else None,
            "stage_entered_at": months_ago(index % 12),
            "stage_last_changed_at": months_ago(index % 12),
            "days_in_stage": random.randint(1, 50),
            "company_id": company_id,
            "created_by": str(team["manager"].id),
            "deleted": False,
            "created_at": months_ago(index % 12),
            "updated_at": months_ago(index % 12),
        }
        if existing:
            for key, value in payload.items():
                setattr(existing, key, value)
            await existing.save()
            lead = existing
        else:
            lead = SalesProspect(**payload)
            await lead.insert()
        leads.append(lead)
        await publish_crm_timeline_event(
            event_name="LeadCreated" if not existing else "LeadUpdated",
            aggregate_type="sales_prospect",
            aggregate_id=str(lead.id),
            company_id=company_id,
            actor_id=str(team["manager"].id),
            payload={"lead_id": str(lead.id), "company_name": lead.company_name, "stage": lead.current_stage, "timestamp": lead.updated_at.isoformat()},
            metadata={"module": "seed"},
        )
    return leads


async def seed_followups_and_activities(tenant_id: str, leads: list[SalesProspect], team: dict[str, User]) -> None:
    sales_exec = team["sales.exec"]
    manager = team["manager"]
    activity_types = [CRMActivityType.CALL.value, CRMActivityType.MEETING.value, CRMActivityType.EMAIL.value, "whatsapp", CRMActivityType.NOTE.value, CRMActivityType.TASK.value]
    for index in range(TARGET_FOLLOWUPS):
        lead = leads[index % len(leads)]
        status = random.choice([CRMActivityStatus.COMPLETED, CRMActivityStatus.SCHEDULED, CRMActivityStatus.IN_PROGRESS])
        due = BASE_DATE - timedelta(days=random.randint(1, 60)) if status != CRMActivityStatus.COMPLETED else BASE_DATE + timedelta(days=random.randint(1, 30))
        activity = CRMActivity(
            company_id=tenant_id,
            entity_type="lead",
            entity_id=str(lead.id),
            activity_type=CRMActivityType.FOLLOW_UP.value,
            title=f"Follow-up on {lead.prospect_name}",
            description=f"Follow up for {lead.company_name} on {random.choice(['proposal', 'pricing', 'timeline', 'discovery'])}.",
            status=status,
            priority=random.choice([CRMActivityPriority.MEDIUM, CRMActivityPriority.HIGH, CRMActivityPriority.URGENT]),
            owner_id=str(sales_exec.id),
            owner_name=display_name(sales_exec.first_name, sales_exec.last_name),
            due_date=due,
            scheduled_at=due - timedelta(hours=2),
            completed_at=due if status == CRMActivityStatus.COMPLETED else None,
            completed_by=str(manager.id) if status == CRMActivityStatus.COMPLETED else None,
            completed_by_name=display_name(manager.first_name, manager.last_name) if status == CRMActivityStatus.COMPLETED else None,
            metadata={"follow_up": True, "lead_id": str(lead.id), "source": "seed"},
            created_by=str(manager.id),
            created_by_name=display_name(manager.first_name, manager.last_name),
            updated_by=str(manager.id),
            updated_by_name=display_name(manager.first_name, manager.last_name),
            created_at=months_ago(index % 12),
            updated_at=months_ago(index % 12),
        )
        await activity.insert()
        await publish_crm_timeline_event(
            event_name="FollowUpCompleted" if status == CRMActivityStatus.COMPLETED else "FollowUpScheduled",
            aggregate_type="crm_activity",
            aggregate_id=str(activity.id),
            company_id=tenant_id,
            actor_id=str(sales_exec.id),
            payload={"activity_id": str(activity.id), "lead_id": str(lead.id), "status": activity.status.value, "timestamp": activity.updated_at.isoformat()},
            metadata={"module": "seed"},
        )

    for index in range(TARGET_ACTIVITIES - TARGET_FOLLOWUPS):
        lead = leads[index % len(leads)]
        activity_type = activity_types[index % len(activity_types)]
        status = CRMActivityStatus.COMPLETED if index % 3 == 0 else CRMActivityStatus.SCHEDULED
        due = BASE_DATE - timedelta(days=random.randint(1, 90)) if status == CRMActivityStatus.COMPLETED else BASE_DATE + timedelta(days=random.randint(1, 45))
        activity = CRMActivity(
            company_id=tenant_id,
            entity_type="lead",
            entity_id=str(lead.id),
            activity_type=activity_type,
            title=f"{activity_type.title()} for {lead.company_name}",
            description=f"Seeded {activity_type} record for {lead.company_name}.",
            status=status,
            priority=random.choice([CRMActivityPriority.LOW, CRMActivityPriority.MEDIUM, CRMActivityPriority.HIGH]),
            owner_id=str(sales_exec.id),
            owner_name=display_name(sales_exec.first_name, sales_exec.last_name),
            due_date=due,
            scheduled_at=due - timedelta(hours=1),
            completed_at=due if status == CRMActivityStatus.COMPLETED else None,
            completed_by=str(sales_exec.id) if status == CRMActivityStatus.COMPLETED else None,
            completed_by_name=display_name(sales_exec.first_name, sales_exec.last_name) if status == CRMActivityStatus.COMPLETED else None,
            metadata={"source": "seed", "lead_id": str(lead.id)},
            created_by=str(manager.id),
            created_by_name=display_name(manager.first_name, manager.last_name),
            updated_by=str(manager.id),
            updated_by_name=display_name(manager.first_name, manager.last_name),
            created_at=months_ago(index % 12),
            updated_at=months_ago(index % 12),
        )
        await activity.insert()
        await publish_crm_timeline_event(
            event_name="ActivityLogged",
            aggregate_type="crm_activity",
            aggregate_id=str(activity.id),
            company_id=tenant_id,
            actor_id=str(manager.id),
            payload={"activity_id": str(activity.id), "lead_id": str(lead.id), "activity_type": activity_type, "timestamp": activity.updated_at.isoformat()},
            metadata={"module": "seed"},
        )


async def seed_pipeline_history(tenant_id: str, leads: list[SalesProspect], team: dict[str, User]) -> None:
    sales_exec = team["sales.exec"]
    for index, lead in enumerate(leads):
        previous_stage = "new" if lead.current_stage != "new" else None
        await SalesPipelineHistory(
            lead_id=str(lead.id),
            company_id=tenant_id,
            previous_stage=previous_stage,
            new_stage=lead.current_stage,
            user_id=str(sales_exec.id),
            user_name=display_name(sales_exec.first_name, sales_exec.last_name),
            reason="Seeded transition",
            days_in_previous_stage=random.randint(1, 14),
            payload={"seed": True, "lead_id": str(lead.id), "current_stage": lead.current_stage},
            transitioned_at=months_ago(index % 12),
        ).insert()


async def seed_deals_and_proposals(tenant_id: str, leads: list[SalesProspect], team: dict[str, User]) -> tuple[list[CRMDeal], list[CRMProposal], list[Client], list[Project]]:
    deals: list[CRMDeal] = []
    proposals: list[CRMProposal] = []
    clients: list[Client] = []
    projects: list[Project] = []
    sales_exec = team["sales.exec"]
    proposal_version_target = TARGET_PROPOSAL_VERSIONS
    proposal_family_target = TARGET_PROPOSAL_FAMILIES
    for index, lead in enumerate(leads[:TARGET_DEALS]):
        stage_cycle = ["won", "negotiation", "proposal_sent", "lost", "discovery"]
        stage = stage_cycle[index % len(stage_cycle)]
        if index < 220:
            stage = "won"
        elif index < 320:
            stage = "negotiation"
        elif index < 420:
            stage = "proposal_sent"
        elif index < 470:
            stage = "discovery"
        else:
            stage = "lost"
        value = random.randint(75000, 5500000)
        expected_close = months_ago(index % 12) + timedelta(days=random.randint(10, 120))
        deal = await CRMDeal.find_one({"company_id": tenant_id, "lead_id": str(lead.id)})
        if not deal:
            deal = CRMDeal(
                company_id=tenant_id,
                lead_id=str(lead.id),
                contact_id=getattr(lead, "contact_id", None),
                value=value,
                stage=stage,
                probability={"proposal_sent": 55, "negotiation": 75, "won": 100, "lost": 0, "discovery": 35}[stage],
                expected_close_date=expected_close,
                decision_maker=lead.owner_name or lead.assigned_to,
                competitors=random.sample(["AgencyX", "BrandLift", "MarketEdge", "GrowthNest"], 2),
                negotiation_notes=f"Negotiation notes for {lead.company_name}.",
                created_by=str(sales_exec.id),
                created_by_name=display_name(sales_exec.first_name, sales_exec.last_name),
                updated_by=str(sales_exec.id),
                updated_by_name=display_name(sales_exec.first_name, sales_exec.last_name),
                created_at=months_ago(index % 12),
                updated_at=months_ago(index % 12),
            )
            await deal.insert()
        else:
            deal.stage = stage
            deal.value = value
            deal.probability = {"proposal_sent": 55, "negotiation": 75, "won": 100, "lost": 0, "discovery": 35}[stage]
            deal.updated_at = months_ago(index % 12)
            await deal.save()
        deals.append(deal)
        await publish_crm_timeline_event(
            event_name="DealUpdated",
            aggregate_type="crm_deal",
            aggregate_id=str(deal.id),
            company_id=tenant_id,
            actor_id=str(sales_exec.id),
            payload={"deal_id": str(deal.id), "lead_id": str(lead.id), "stage": stage, "value": value, "timestamp": deal.updated_at.isoformat()},
            metadata={"module": "seed"},
        )

        if index < proposal_family_target:
            versions_for_family = 2 if index % 3 else 3
            for version in range(1, versions_for_family + 1):
                status_cycle = [CRMProposalStatus.DRAFT, CRMProposalStatus.SENT, CRMProposalStatus.VIEWED, CRMProposalStatus.ACCEPTED, CRMProposalStatus.REJECTED]
                status = status_cycle[min(version - 1, len(status_cycle) - 1)]
                proposal = await CRMProposal.find_one({"company_id": tenant_id, "deal_id": str(deal.id), "version": version})
                if not proposal:
                    proposal = CRMProposal(
                        company_id=tenant_id,
                        deal_id=str(deal.id),
                        lead_id=str(lead.id),
                        contact_id=getattr(lead, "contact_id", None),
                        version=version,
                        title=f"{lead.company_name} Proposal v{version}",
                        summary=f"{lead.company_name} growth proposal version {version}.",
                        status=status,
                        draft_at=months_ago(index % 12),
                        sent_at=months_ago(index % 12) + timedelta(days=2) if status in {CRMProposalStatus.SENT, CRMProposalStatus.VIEWED, CRMProposalStatus.ACCEPTED} else None,
                        viewed_at=months_ago(index % 12) + timedelta(days=4) if status in {CRMProposalStatus.VIEWED, CRMProposalStatus.ACCEPTED} else None,
                        accepted_at=months_ago(index % 12) + timedelta(days=8) if status == CRMProposalStatus.ACCEPTED else None,
                        rejected_at=months_ago(index % 12) + timedelta(days=10) if status == CRMProposalStatus.REJECTED else None,
                        expired_at=None,
                        deal_value=value,
                        expected_close_date=expected_close,
                        probability=deal.probability,
                        negotiation_notes=deal.negotiation_notes,
                        competitors=list(deal.competitors),
                        decision_maker=deal.decision_maker,
                        archived=False,
                        created_by=str(sales_exec.id),
                        created_by_name=display_name(sales_exec.first_name, sales_exec.last_name),
                        updated_by=str(sales_exec.id),
                        updated_by_name=display_name(sales_exec.first_name, sales_exec.last_name),
                        created_at=months_ago(index % 12),
                        updated_at=months_ago(index % 12),
                    )
                    await proposal.insert()
                else:
                    proposal.status = status
                    proposal.updated_at = months_ago(index % 12)
                    await proposal.save()
                proposals.append(proposal)
                await publish_crm_timeline_event(
                    event_name=f"Proposal{status.value.title().replace('_', '')}",
                    aggregate_type="crm_proposal",
                    aggregate_id=str(proposal.id),
                    company_id=tenant_id,
                    actor_id=str(sales_exec.id),
                    payload={"proposal_id": str(proposal.id), "deal_id": str(deal.id), "version": version, "status": proposal.status.value, "timestamp": proposal.updated_at.isoformat()},
                    metadata={"module": "seed"},
                )
        if len(proposals) >= proposal_version_target:
            pass

        if stage == "won":
            lead.status = ProspectStatus.WON
            lead.closed_date = months_ago(index % 12)
            lead.won_amount = value
            lead.updated_at = datetime.utcnow()
            await lead.save()
            existing_project = await Project.find_one({"company_id": tenant_id, "lead_id": str(lead.id)})
            if existing_project:
                project = existing_project
                client = await Client.find_one({"company_id": tenant_id, "company_name": lead.company_name}) or await Client.find_one({"company_id": tenant_id, "name": lead.company_name})
                if client and client not in clients:
                    clients.append(client)
                if project not in projects:
                    projects.append(project)
            else:
                automation = await handle_won_deal_automation(sales_exec, lead, deal)
                client = automation["client"]
                project = automation["project"]
                if client not in clients:
                    clients.append(client)
                if project not in projects:
                    projects.append(project)
        elif stage == "lost":
            lead.status = ProspectStatus.LOST
            lead.closed_date = months_ago(index % 12)
            lead.reason_for_lost = random.choice(["Budget", "Timing", "Competitor", "Internal priority"])
            lead.updated_at = datetime.utcnow()
            await lead.save()

    return deals, proposals, clients, projects


async def seed_content_calendar(tenant_id: str, projects: list[Project], team: dict[str, User]) -> list[ContentCalendarItem]:
    items: list[ContentCalendarItem] = []
    project_cycle = projects[:]
    if not project_cycle:
        return items
    for index in range(TARGET_CONTENT_DAYS):
        project = project_cycle[index % len(project_cycle)]
        content_type = CONTENT_TYPES[index % len(CONTENT_TYPES)]
        publish_date = BASE_DATE + timedelta(days=index)
        due_date = publish_date - timedelta(days=2)
        status_flow = [
            ContentItemStatus.DRAFT,
            ContentItemStatus.PLANNED,
            ContentItemStatus.SHOOT_SCHEDULED,
            ContentItemStatus.SHOT,
            ContentItemStatus.EDITING,
            ContentItemStatus.INTERNAL_REVIEW,
            ContentItemStatus.CLIENT_REVIEW,
            ContentItemStatus.APPROVED,
            ContentItemStatus.SCHEDULED,
            ContentItemStatus.PUBLISHED,
        ]
        status = status_flow[index % len(status_flow)]
        item = await ContentCalendarItem.find_one({"company_id": tenant_id, "project_id": str(project.id), "title": f"{project.name} Content {index+1}"})
        payload = {
            "company_id": tenant_id,
            "project_id": str(project.id),
            "client_id": None,
            "campaign": f"{project.name} Campaign {index // 7 + 1}",
            "platform": random.choice(["Instagram", "LinkedIn", "YouTube", "Blog", "Email"]),
            "title": f"{project.name} Content {index + 1}",
            "content_type": content_type,
            "assignee_id": project.assigned_to or str(team["project.manager"].id),
            "assignee_name": "Content Team",
            "due_date": due_date,
            "publish_date": publish_date,
            "priority": random.choice([ContentItemPriority.LOW, ContentItemPriority.MEDIUM, ContentItemPriority.HIGH]),
            "status": status,
            "notes": f"Seeded {content_type.value.replace('_', ' ')} for {project.name}.",
            "tags": [project.category or "delivery", content_type.value],
            "file_ids": [],
            "file_urls": [],
            "deliverable_target": random.choice([1, 2, 4, 8, 10]),
            "shoot_date": publish_date - timedelta(days=5) if content_type == ContentItemType.SHOOT_DAY else None,
            "location": "Studio 2" if content_type == ContentItemType.SHOOT_DAY else None,
            "photographer": "In-house team" if content_type == ContentItemType.SHOOT_DAY else None,
            "team": [str(team["writer"].id), str(team["designer"].id), str(team["video.editor"].id)],
            "assets_required": ["Brief", "Reference", "CTA"],
            "metadata": {"seed": True, "project_template": project.category},
            "created_by": str(team["project.manager"].id),
            "updated_by": str(team["project.manager"].id),
            "created_at": months_ago(index % 12),
            "updated_at": months_ago(index % 12),
        }
        if item:
            for key, value in payload.items():
                setattr(item, key, value)
            await item.save()
        else:
            item = ContentCalendarItem(**payload)
            await item.insert()
        items.append(item)
        await publish_crm_timeline_event(
            event_name="ContentPlanned" if status == ContentItemStatus.PLANNED else "Scheduled" if status == ContentItemStatus.SCHEDULED else "Published" if status == ContentItemStatus.PUBLISHED else "ReadyForReview",
            aggregate_type="content_item",
            aggregate_id=str(item.id),
            company_id=tenant_id,
            actor_id=str(team["project.manager"].id),
            project_id=str(project.project_id or project.id),
            payload={
                "content_item_id": str(item.id),
                "project_id": str(project.id),
                "status": item.status.value,
                "title": item.title,
                "timestamp": item.updated_at.isoformat(),
            },
            metadata={"module": "seed", "surface": "delivery"},
        )
        await publish_crm_timeline_event(
            event_name="ContentItemSeeded",
            aggregate_type="content_item",
            aggregate_id=str(item.id),
            company_id=tenant_id,
            actor_id=str(team["project.manager"].id),
            payload={"content_item_id": str(item.id), "project_id": str(project.id), "status": item.status.value, "timestamp": item.updated_at.isoformat()},
            metadata={"module": "seed"},
        )
    return items


async def seed_reports_and_knowledge(team: dict[str, User], leads: list[SalesProspect], projects: list[Project]) -> None:
    for project in projects[:80]:
        await knowledge_service.ingest_project(project=project, actor_id=str(team["admin"].id), event_name="ProjectCreated")
        meeting = await Meeting.find_one({"company_id": str(project.company_id), "title": {"$regex": f"Kickoff -"}})
        if meeting:
            await knowledge_service.ingest_meeting(meeting=meeting, actor_id=str(team["admin"].id), event_name="MeetingScheduled")
        for task in await Task.find({"project_object_id": str(project.id)}).limit(5).to_list():
            await knowledge_service.ingest_task(task=task, actor_id=str(team["admin"].id), event_name="TaskCreated")
    for lead in leads[:TARGET_KNOWLEDGE_DOCS // 2]:
        await SalesLeadNote(
            lead_id=str(lead.id),
            company_id=str(lead.company_id),
            content=f"Seed note for {lead.company_name}.",
            created_by=str(team["manager"].id),
            created_by_name=display_name(team["manager"].first_name, team["manager"].last_name),
            updated_by=str(team["manager"].id),
            created_at=months_ago(lead.days_in_stage % 12),
            updated_at=months_ago(lead.days_in_stage % 12),
        ).insert()

    for index in range(TARGET_KNOWLEDGE_DOCS // 2):
        lead = leads[index % len(leads)]
        client = await Client.find_one({"company_id": lead.company_id, "company_name": lead.company_name})
        if not client:
            client = Client(
                name=lead.company_name,
                company_id=str(lead.company_id),
                company_name=lead.company_name,
                status=ClientStatus.ACTIVE,
                created_by=str(team["admin"].id),
                created_at=months_ago(index % 12),
                updated_at=months_ago(index % 12),
            )
            await client.insert()
        await knowledge_service.ingest_client_feedback(
            client=client,
            actor_id=str(team["manager"].id),
            event_name="ClientFeedbackAdded",
            payload={
                "title": f"Client note for {lead.company_name}",
                "summary": f"Seeded knowledge note for {lead.company_name}.",
                "description": f"Seeded client note for {lead.company_name}.",
                "content": f"Knowledge doc for {lead.company_name} and campaign history.",
                "version_marker": f"seed-kd-{index}",
            },
        )
        await publish_crm_timeline_event(
            event_name="KnowledgeDocumentCreated",
            aggregate_type="knowledge_record",
            aggregate_id=f"seed-kd-{index}",
            company_id=str(lead.company_id),
            actor_id=str(team["manager"].id),
            payload={"lead_id": str(lead.id), "client_id": str(client.id), "timestamp": months_ago(index % 12).isoformat()},
            metadata={"module": "seed"},
        )


async def seed_project_tasks(team: dict[str, User], projects: list[Project], leads: list[SalesProspect]) -> None:
    if not projects:
        return
    task_templates = [
        "Project kickoff",
        "Discovery checklist",
        "Creative brief",
        "Content draft",
        "Design review",
        "Development task",
        "QA validation",
        "Client approval",
        "Launch preparation",
        "Reporting review",
    ]
    existing_count = await Task.find({"company_id": str(projects[0].company_id)}).count()
    task_counter = int(existing_count)
    project_index = 0
    while task_counter < PROJECT_TASK_TARGET:
        project = projects[project_index % len(projects)]
        lead = leads[task_counter % len(leads)]
        for template_name in task_templates:
            if task_counter >= PROJECT_TASK_TARGET:
                break
            existing = await Task.find_one(
                {
                    "company_id": str(project.company_id),
                    "project_object_id": str(project.id),
                    "title": f"{template_name} - {project.name} {task_counter + 1}",
                }
            )
            if existing:
                task_counter += 1
                continue
            due = months_ago(task_counter % 12) + timedelta(days=(task_counter % 21) + 1)
            task = Task(
                title=f"{template_name} - {project.name} {task_counter + 1}",
                description=f"Seed task for {lead.company_name} under {project.name}.",
                company_id=str(project.company_id),
                project_id=project.project_id or str(project.id),
                project_object_id=str(project.id),
                created_by=str(team["admin"].id),
                assigned_to=project.assigned_to or str(team["project.manager"].id),
                assigned_by=str(team["project.manager"].id),
                status=random.choice([TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, TaskStatus.COMPLETED]),
                priority=random.choice([TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.CRITICAL]),
                due_date=due,
                start_date=due - timedelta(days=7),
                completed_at=due if task_counter % 4 == 0 else None,
                tags=[project.category or "delivery", "seed"],
                story_points=random.randint(1, 8),
                estimated_hours=random.randint(2, 16),
                created_at=months_ago(task_counter % 12),
                updated_at=months_ago(task_counter % 12),
            )
            await task.insert()
            await publish_crm_timeline_event(
                event_name="TaskAssigned",
                aggregate_type="task",
                aggregate_id=str(task.id),
                company_id=str(project.company_id),
                actor_id=str(team["project.manager"].id),
                payload={"task_id": str(task.id), "project_id": str(project.id), "timestamp": task.updated_at.isoformat()},
                metadata={"module": "seed"},
            )
            task_counter += 1
        project_index += 1


async def seed_calendar_events(tenant_id: str, leads: list[SalesProspect], projects: list[Project], team: dict[str, User]) -> None:
    for index in range(TARGET_CALENDAR_EVENTS):
        lead = leads[index % len(leads)]
        project = projects[index % len(projects)] if projects else None
        meeting = Meeting(
            title=f"Seed Calendar Event {index + 1} - {lead.company_name}",
            description=f"Calendar event for {lead.company_name}",
            company_id=tenant_id,
            created_by=str(team["admin"].id),
            host_id=str(team["manager"].id),
            participant_ids=[str(team["manager"].id), str(team["sales.exec"].id)],
            meeting_date=months_ago(index % 12) + timedelta(days=index % 28),
            meeting_time=random.choice(["09:00", "11:00", "14:00", "16:00"]),
            duration=random.choice([30, 45, 60]),
            status=MeetingStatus.SCHEDULED if index % 3 else MeetingStatus.COMPLETED,
            created_at=months_ago(index % 12),
            updated_at=months_ago(index % 12),
            started_at=months_ago(index % 12) + timedelta(hours=1) if index % 3 == 0 else None,
            ended_at=months_ago(index % 12) + timedelta(hours=2) if index % 3 == 0 else None,
        )
        await meeting.insert()


async def seed_invoices(tenant_id: str, clients: list[Client], projects: list[Project], team: dict[str, User]) -> list[Invoice]:
    invoices: list[Invoice] = []
    if not clients:
        return invoices
    finance_user = team.get("finance") or team["admin"]
    for index in range(150):
        client = clients[index % len(clients)]
        project = projects[index % len(projects)] if projects else None
        status = INVOICE_STATUS_FLOW[index % len(INVOICE_STATUS_FLOW)]
        invoice_number = f"INV-{BASE_DATE.year}-{index + 1:04d}"
        existing = await Invoice.find_one({"company_id": tenant_id, "invoice_number": invoice_number})
        items = [
            {"name": random.choice(["SEO Retainer", "Paid Ads", "Content Retainer", "Website Maintenance"]), "quantity": 1, "rate": random.randint(25000, 250000)},
            {"name": random.choice(["Strategy", "Reporting", "Creative", "Production"]), "quantity": 1, "rate": random.randint(15000, 120000)},
        ]
        subtotal = sum(item["quantity"] * item["rate"] for item in items)
        tax_amount = round(subtotal * 0.18, 2)
        total_amount = subtotal + tax_amount
        paid_amount = total_amount if status == InvoiceStatus.PAID else round(total_amount * random.uniform(0.1, 0.6), 2) if status == InvoiceStatus.SENT else 0.0
        payload = {
            "invoice_number": invoice_number,
            "company_id": tenant_id,
            "invoice_type": InvoiceType.PROFORMA,
            "include_tax": True,
            "client_id": str(client.id),
            "client_name": client.name,
            "client_email": client.email,
            "client_contact": client.contact,
            "client_address": client.address,
            "client_city": client.city,
            "client_state": client.state,
            "client_country": client.country,
            "client_zip_code": client.zip_code,
            "client_company_name": client.company_name,
            "invoice_date": months_ago(index % 12),
            "due_date": months_ago(index % 12) + timedelta(days=30),
            "items": items,
            "subtotal": subtotal,
            "tax_rate": 18.0,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "currency": "INR",
            "payments": ([{"date": months_ago(index % 12) + timedelta(days=15), "amount": paid_amount, "method": "bank_transfer", "reference": f"PAY-{index+1:04d}", "notes": "Seed payment", "received_by": str(finance_user.id)}] if paid_amount else []),
            "total_received": paid_amount,
            "tds_amount": 0.0,
            "outstanding_amount": max(total_amount - paid_amount, 0.0),
            "notes": f"Seed invoice for {client.name}.",
            "terms_and_conditions": "Payment due within 30 days.",
            "status": status,
            "email_sent": status in {InvoiceStatus.SENT, InvoiceStatus.PAID},
            "email_sent_at": months_ago(index % 12) + timedelta(days=1) if status in {InvoiceStatus.SENT, InvoiceStatus.PAID} else None,
            "email_sent_to": client.email,
            "pdf_url": None,
            "project_id": str(project.id) if project else None,
            "created_at": months_ago(index % 12),
            "updated_at": months_ago(index % 12),
            "created_by": str(finance_user.id),
        }
        if existing:
            for key, value in payload.items():
                setattr(existing, key, value)
            await existing.save()
            invoices.append(existing)
        else:
            invoice = Invoice(**payload)
        await invoice.insert()
        invoices.append(invoice)
        await publish_crm_timeline_event(
            event_name="InvoiceCreated",
            aggregate_type="invoice",
            aggregate_id=str(invoice.id),
            company_id=tenant_id,
            actor_id=str(finance_user.id),
            payload={"invoice_id": str(invoice.id), "client_id": str(client.id), "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status, "timestamp": invoice.updated_at.isoformat()},
            metadata={"module": "seed"},
        )
    return invoices


async def main() -> None:
    await init_db()
    try:
        tenant = await upsert_tenant()
        team = await seed_team(tenant)
        company_id = str(tenant.id)

        crm_companies = await seed_crm_companies(company_id)
        contacts = await seed_contacts(company_id, crm_companies)
        leads = await seed_leads(tenant, crm_companies, contacts, team)
        await seed_pipeline_history(company_id, leads, team)
        await seed_followups_and_activities(company_id, leads, team)
        deals, proposals, clients, projects = await seed_deals_and_proposals(company_id, leads, team)
        content_items = await seed_content_calendar(company_id, projects or [], team)
        await seed_reports_and_knowledge(team, leads, projects)
        await seed_project_tasks(team, projects, leads)
        await seed_calendar_events(company_id, leads, projects, team)
        invoices = await seed_invoices(company_id, clients, projects, team)

        print("CRM production seed complete.")
        print(f"Tenant ID: {company_id}")
        print(f"Team members: {len(team)}")
        print(f"CRM companies: {len(crm_companies)}")
        print(f"Contacts: {len(contacts)}")
        print(f"Leads: {len(leads)}")
        print(f"Deals: {len(deals)}")
        print(f"Proposals: {len(proposals)}")
        print(f"Clients created: {len(clients)}")
        print(f"Projects created: {len(projects)}")
        print(f"Content items: {len(content_items)}")
        print(f"Invoices: {len(invoices)}")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
