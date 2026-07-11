"""
Seed a full multi-company demo dataset for end-to-end QA.

This script is intentionally deterministic and idempotent:
- reruns update the same records instead of creating duplicates
- records are keyed by stable natural identifiers such as email, phone,
  invoice number, ticket number, and lead title + phone

Dataset size:
- 4 companies
- 32 users
- 80 CRM leads
- 160 tasks
- 220 notes
- 120 files
- 650+ lead timeline events via notes/files/history/activities
- 220 stage history records
- 250 notifications
- 40 meetings
- 40 invoices
- 60 tickets
- 60 content calendar items
"""
from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.database import close_db, init_db
from app.core.security import get_password_hash
from app.models.client import Client, ClientStatus
from app.models.company import Company, CompanyStatus, Subscription, SubscriptionPlan, SubscriptionStatus
from app.models.content_calendar import ContentCalendarItem, ContentItemPriority, ContentItemStatus, ContentItemType
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.crm_company import CRMCompany
from app.models.department import Department
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.meeting import Meeting, MeetingStatus
from app.models.notification import Notification, NotificationType
from app.models.project import Epic, Project, ProjectStatus, ProjectType, Sprint
from app.models.sales_category import SalesCategory
from app.models.sales_contact import SalesContact
from app.models.sales_lead_file import SalesLeadFile
from app.models.sales_lead_note import SalesLeadNote
from app.models.sales_pipeline_history import SalesPipelineHistory
from app.models.sales_product import SalesProduct
from app.models.sales_prospect import InterestLevel, ProspectStatus, SalesProspect
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.ticket import Ticket, TicketPriority, TicketStatus, TicketType
from app.models.user import User, UserRole, UserStatus


random.seed(42)
DEMO_PASSWORD = "Demo@123456"
DEMO_TAG = "full_demo_v1"

STAGES = ["new", "follow_up_call", "schedule_a_meeting", "send_proposal", "negotiation", "won", "lost"]
COMPANIES = [
    {"name": "Northstar Digital", "email": "northstar@example.com", "industry": "Marketing", "size": "11-50"},
    {"name": "Apex Growth", "email": "apexgrowth@example.com", "industry": "IT Services", "size": "51-200"},
    {"name": "Blue Peak Media", "email": "bluepeak@example.com", "industry": "Media", "size": "11-50"},
    {"name": "Vertex Commerce", "email": "vertexcommerce@example.com", "industry": "E-commerce", "size": "51-200"},
]

ROLE_LAYOUT = [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.LEAD,
    UserRole.EMPLOYEE,
    UserRole.EMPLOYEE,
    UserRole.EMPLOYEE,
    UserRole.EMPLOYEE,
    UserRole.EMPLOYEE,
]

FIRST_NAMES = [
    "Aarav", "Isha", "Karan", "Sneha", "Rohan", "Priya", "Vikram", "Meera",
    "Arjun", "Anaya", "Dev", "Nina", "Kabir", "Tara", "Ibrahim", "Sara",
    "Nikhil", "Pooja", "Rahul", "Aisha", "Kunal", "Ritika", "Mohit", "Neha",
    "Aditya", "Sana", "Harsh", "Maya", "Om", "Diya", "Yash", "Rhea",
]

LAST_NAMES = [
    "Sharma", "Patel", "Verma", "Rao", "Kapoor", "Khan", "Mehta", "Joshi",
    "Singh", "Gupta", "Mishra", "Nair", "Iyer", "Bose", "Chopra", "Malhotra",
]

LEAD_COMPANIES = [
    "Future Build",
    "Creative Minds",
    "Blue Ocean Ltd",
    "Apex Builders",
    "TechNova Pvt Ltd",
    "Urban Nest",
    "Glow Media",
    "Peak Retail",
    "Silverline Studio",
    "Nova Foods",
]

PROJECT_NAMES = [
    "Brand Revamp",
    "Product Launch",
    "Performance Marketing",
    "CRM Migration",
    "Social Content Sprint",
    "Retail Expansion",
    "Lead Gen Engine",
    "Website Redesign",
    "Quarterly Growth",
    "Email Nurture",
    "Sales Enablement",
    "Video Campaign",
]

CLIENT_NAMES = [
    "Orchid Labs",
    "Sunrise Retail",
    "Lumen Hotels",
    "Atlas Foods",
    "Greenfield Ventures",
    "Skyline Homes",
    "Pulse Health",
    "Vista Fashion",
]

def full_name(first: str, last: str) -> str:
    return f"{first} {last}"


async def upsert_company(record: dict[str, Any]) -> Company:
    now = datetime.utcnow()
    company = await Company.find_one({"email": record["email"]})
    if not company:
        company = Company(
            name=record["name"],
            email=record["email"],
            phone=record.get("phone"),
            website=record.get("website"),
            address=record.get("address"),
            city=record.get("city"),
            state=record.get("state"),
            country="India",
            industry=record["industry"],
            company_size=record["size"],
            status=CompanyStatus.ACTIVE,
            max_users=50,
            max_projects=25,
            max_storage_gb=50,
            approved_at=now,
        )
        await company.insert()
    else:
        company.name = record["name"]
        company.phone = record.get("phone")
        company.website = record.get("website")
        company.industry = record["industry"]
        company.company_size = record["size"]
        company.status = CompanyStatus.ACTIVE
        company.approved_at = now
        company.updated_at = now
        await company.save()

    subscription = await Subscription.find_one({"company_id": str(company.id)})
    if not subscription:
        subscription = Subscription(
            company_id=str(company.id),
            plan=SubscriptionPlan.PROFESSIONAL,
            status=SubscriptionStatus.ACTIVE,
            amount=9999.0,
            currency="INR",
            billing_cycle="monthly",
            current_users=8,
            current_projects=3,
            current_storage_gb=5.0,
            trial_end_date=now + timedelta(days=30),
        )
        await subscription.insert()
    else:
        subscription.status = SubscriptionStatus.ACTIVE
        subscription.current_users = max(subscription.current_users, 8)
        subscription.current_projects = max(subscription.current_projects, 3)
        subscription.updated_at = now
        await subscription.save()

    return company


async def upsert_department(company_id: str, name: str, manager_id: str | None = None) -> Department:
    now = datetime.utcnow()
    department = await Department.find_one({"company_id": company_id, "name": name})
    if not department:
        department = Department(company_id=company_id, name=name, manager_id=manager_id, created_at=now, updated_at=now)
        await department.insert()
    else:
        department.manager_id = manager_id
        department.updated_at = now
        await department.save()
    return department


async def upsert_user(
    *,
    email: str,
    first_name: str,
    last_name: str,
    role: UserRole,
    company_id: str,
    department_id: str | None,
    reports_to: str | None,
    ancestors: list[str],
    modules: list[str],
) -> User:
    now = datetime.utcnow()
    user = await User.find_one({"email": email})
    if not user:
        user = User(
            email=email,
            password_hash=get_password_hash(DEMO_PASSWORD),
            first_name=first_name,
            last_name=last_name,
            role=role,
            status=UserStatus.ACTIVE,
            modules=modules,
            active_module=modules[0] if modules else "task",
            company_id=company_id,
            department_id=department_id,
            reports_to=reports_to,
            ancestors=ancestors,
            is_email_verified=True,
        )
        await user.insert()
    else:
        user.password_hash = get_password_hash(DEMO_PASSWORD)
        user.first_name = first_name
        user.last_name = last_name
        user.role = role
        user.status = UserStatus.ACTIVE
        user.modules = modules
        user.active_module = modules[0] if modules else "task"
        user.company_id = company_id
        user.department_id = department_id
        user.reports_to = reports_to
        user.ancestors = ancestors
        user.is_email_verified = True
        user.updated_at = now
        await user.save()
    return user


async def upsert_crm_company(company_id: str, admin: User) -> CRMCompany:
    now = datetime.utcnow()
    crm_company = await CRMCompany.find_one({"company_id": company_id})
    if not crm_company:
        crm_company = CRMCompany(
            name=f"Company {company_id[:6]} CRM",
            company_id=company_id,
            email=f"crm-{company_id[:6]}@example.com",
            website="https://example.com",
            industry="Services",
            company_size="11-50",
            notes="Seeded CRM company",
            created_by=str(admin.id),
            updated_by=str(admin.id),
        )
        await crm_company.insert()
    else:
        crm_company.updated_by = str(admin.id)
        crm_company.updated_at = now
        await crm_company.save()
    return crm_company


async def upsert_sales_catalog(company_id: str, admin_id: str, company_index: int) -> tuple[list[SalesCategory], list[SalesProduct]]:
    categories: list[SalesCategory] = []
    products: list[SalesProduct] = []
    category_names = ["Digital Marketing", "Web Development", "Brand Strategy"]
    product_names = [
        ["SEO Package", "Paid Ads Package", "Content Package"],
        ["Landing Page", "E-commerce Site", "Portal Build"],
        ["Brand Audit", "Positioning Sprint", "Creative Retainer"],
    ]
    for idx, category_name in enumerate(category_names):
        category = await SalesCategory.find_one({"company_id": company_id, "name": category_name})
        if not category:
            category = SalesCategory(name=category_name, company_id=company_id, created_by=admin_id)
            await category.insert()
        else:
            category.updated_at = datetime.utcnow()
            await category.save()
        categories.append(category)

        for product_name in product_names[idx]:
            product = await SalesProduct.find_one({"company_id": company_id, "name": product_name, "category_id": str(category.id)})
            if not product:
                product = SalesProduct(
                    name=product_name,
                    category_id=str(category.id),
                    rate=25000 + company_index * 5000 + idx * 3000,
                    unit="project",
                    state="Maharashtra",
                    city="Mumbai",
                    company_id=company_id,
                    created_by=admin_id,
                )
                await product.insert()
            else:
                product.rate = 25000 + company_index * 5000 + idx * 3000
                product.updated_at = datetime.utcnow()
                await product.save()
            products.append(product)
    return categories, products


async def upsert_clients(company_id: str, admin_id: str, project_ids: list[str]) -> list[Client]:
    clients: list[Client] = []
    for idx, name in enumerate(CLIENT_NAMES):
        email = f"{name.replace(' ', '').lower()}@example.com"
        client = await Client.find_one({"company_id": company_id, "email": email})
        if not client:
            client = Client(
                name=name,
                company_id=company_id,
                email=email,
                contact=f"+91{9000001000 + idx}",
                alternate_contact=f"+91{9000002000 + idx}",
                city="Mumbai",
                state="Maharashtra",
                country="India",
                company_name=f"{name} Pvt Ltd",
                industry="Services",
                status=ClientStatus.ACTIVE,
                project_ids=project_ids[:2],
                notes=f"Seeded client {name}",
                tags=["demo", "seed"],
                assigned_to=admin_id,
                created_by=admin_id,
            )
            await client.insert()
        else:
            client.project_ids = project_ids[:2]
            client.assigned_to = admin_id
            client.updated_at = datetime.utcnow()
            await client.save()
        clients.append(client)
    return clients


async def upsert_projects(company_id: str, admin: User, employees: list[User], company_index: int) -> list[Project]:
    projects: list[Project] = []
    for idx, name in enumerate(PROJECT_NAMES[company_index * 3 : company_index * 3 + 3]):
        project_key = f"DEMO{company_index + 1}{idx + 1}"
        project_id = f"DEMO-{company_index + 1}-{idx + 1:02d}"
        project = await Project.find_one({"company_id": company_id, "project_id": project_id})
        if not project:
            project = Project(
                name=name,
                key=project_key,
                project_id=project_id,
                description=f"Seeded project {name} for company {company_index + 1}.",
                company_id=company_id,
                type=ProjectType.MARKETING if idx % 2 == 0 else ProjectType.BUSINESS,
                status=ProjectStatus.ACTIVE,
                lead_id=str(admin.id),
                assigned_to=str(admin.id),
                assigned_by=str(admin.id),
                assigned_at=datetime.utcnow(),
                team_member_ids=[str(admin.id)] + [str(user.id) for user in employees[:3]],
                default_assignee=str(employees[0].id),
                start_date=datetime.utcnow() - timedelta(days=30),
                delivery_date=datetime.utcnow() + timedelta(days=60),
                category="Demo",
                created_by=str(admin.id),
            )
            await project.insert()
        else:
            project.team_member_ids = [str(admin.id)] + [str(user.id) for user in employees[:3]]
            project.default_assignee = str(employees[0].id)
            project.updated_at = datetime.utcnow()
            await project.save()
        projects.append(project)

        epic = await Epic.find_one({"company_id": company_id, "project_id": project_id, "name": f"{name} Epic"})
        if not epic:
            epic = Epic(
                name=f"{name} Epic",
                description=f"Epic for {name}",
                project_id=project_id,
                company_id=company_id,
                created_by=str(admin.id),
                owner_id=str(admin.id),
                status="in_progress",
                color="#2563eb",
            )
            await epic.insert()

        sprint = await Sprint.find_one({"company_id": company_id, "project_id": project_id, "name": f"{name} Sprint"})
        if not sprint:
            sprint = Sprint(
                name=f"{name} Sprint",
                project_id=project_id,
                company_id=company_id,
                goal=f"Deliver {name}",
                start_date=datetime.utcnow() - timedelta(days=14),
                end_date=datetime.utcnow() + timedelta(days=14),
                state="active",
                team_member_ids=[str(admin.id)] + [str(user.id) for user in employees[:3]],
                created_by=str(admin.id),
            )
            await sprint.insert()
    return projects


async def upsert_lead(
    *,
    company_id: str,
    admin: User,
    manager: User,
    lead_user: User,
    employees: list[User],
    lead_index: int,
    company_index: int,
    categories: list[SalesCategory],
    products: list[SalesProduct],
    crm_company: CRMCompany,
) -> SalesProspect:
    stage = STAGES[lead_index % len(STAGES)]
    owner = [admin, manager, lead_user, *employees][lead_index % (3 + len(employees))]
    first = FIRST_NAMES[(company_index * 20 + lead_index) % len(FIRST_NAMES)]
    last = LAST_NAMES[(company_index * 20 + lead_index) % len(LAST_NAMES)]
    company_name = LEAD_COMPANIES[lead_index % len(LEAD_COMPANIES)]
    phone = f"9{company_index + 1}{lead_index:08d}"
    email = f"{first.lower()}.{last.lower()}.{company_index + 1}.{lead_index}@example.com"
    prospect_name = f"{first} {last}"
    lead = await SalesProspect.find_one({"company_id": company_id, "phone": phone})
    category = categories[lead_index % len(categories)]
    selected_products = [str(products[lead_index % len(products)].id)]
    if not lead:
        lead = SalesProspect(
            first_name=first,
            last_name=last,
            prospect_name=prospect_name,
            country_code="+91",
            phone=phone,
            email=email,
            category_id=str(category.id),
            product_ids=selected_products,
            interest_level=[InterestLevel.HOT, InterestLevel.WARM, InterestLevel.COLD][lead_index % 3],
            estimated_close_date=datetime.utcnow() + timedelta(days=15 + lead_index),
            assigned_to=str(owner.id),
            assigned_by=str(admin.id),
            current_stage=stage,
            due_date=datetime.utcnow() + timedelta(days=10 + lead_index),
            remark=f"Seed lead {lead_index + 1}",
            company_name=company_name,
            crm_company_id=str(crm_company.id),
            relationship_type="client",
            channel=["website", "referral", "social", "event"][lead_index % 4],
            source=["bulk_upload", "manual", "import", "referral"][lead_index % 4],
            designation="Founder",
            nationality=["Indian"],
            language=["English", "Hindi"],
            owner_name=full_name(owner.first_name, owner.last_name),
            owner_contact_no=owner.phone,
            tag=["demo", "crm", f"company-{company_index + 1}"],
            greeting_preference="Both",
            custom_fields={"budget": 50000 + lead_index * 2500, "product": selected_products[0]},
            status=ProspectStatus.ACTIVE if stage not in {"won", "lost"} else (ProspectStatus.WON if stage == "won" else ProspectStatus.LOST),
            won_amount=0 if stage not in {"won", "lost"} else 150000 + lead_index * 1000,
            stage_entered_at=datetime.utcnow() - timedelta(days=(lead_index % 5) + 1),
            stage_last_changed_at=datetime.utcnow() - timedelta(days=(lead_index % 5) + 1),
            days_in_stage=lead_index % 7,
            company_id=company_id,
            created_by=str(admin.id),
        )
        await lead.insert()
    else:
        lead.first_name = first
        lead.last_name = last
        lead.prospect_name = prospect_name
        lead.category_id = str(category.id)
        lead.product_ids = selected_products
        lead.interest_level = [InterestLevel.HOT, InterestLevel.WARM, InterestLevel.COLD][lead_index % 3]
        lead.assigned_to = str(owner.id)
        lead.assigned_by = str(admin.id)
        lead.current_stage = stage
        lead.company_name = company_name
        lead.crm_company_id = str(crm_company.id)
        lead.channel = ["website", "referral", "social", "event"][lead_index % 4]
        lead.source = ["bulk_upload", "manual", "import", "referral"][lead_index % 4]
        lead.owner_name = full_name(owner.first_name, owner.last_name)
        lead.owner_contact_no = owner.phone
        lead.tag = ["demo", "crm", f"company-{company_index + 1}"]
        lead.status = ProspectStatus.ACTIVE if stage not in {"won", "lost"} else (ProspectStatus.WON if stage == "won" else ProspectStatus.LOST)
        lead.won_amount = 0 if stage not in {"won", "lost"} else 150000 + lead_index * 1000
        lead.updated_at = datetime.utcnow()
        await lead.save()

    return lead


async def upsert_lead_notes_and_files(
    lead: SalesProspect,
    admin: User,
    employees: list[User],
    global_index: int,
) -> tuple[list[SalesLeadNote], list[SalesLeadFile]]:
    notes: list[SalesLeadNote] = []
    files: list[SalesLeadFile] = []
    note_count = 3 if global_index < 40 else 2
    file_count = 2 if global_index < 40 else 1
    lead_slug = str(lead.id)

    for note_idx in range(note_count):
        created_at = datetime.utcnow() - timedelta(days=note_idx + (global_index % 4))
        note_content = f"[{DEMO_TAG}] Note {note_idx + 1} for {lead.prospect_name} - stage {lead.current_stage}"
        note = await SalesLeadNote.find_one({"lead_id": lead_slug, "company_id": lead.company_id, "content": note_content})
        actor = admin if note_idx % 2 == 0 else employees[note_idx % len(employees)]
        if not note:
            note = SalesLeadNote(
                lead_id=lead_slug,
                company_id=lead.company_id,
                content=note_content,
                created_by=str(actor.id),
                created_by_name=full_name(actor.first_name, actor.last_name),
                updated_by=str(actor.id),
                updated_by_name=full_name(actor.first_name, actor.last_name),
                is_edited=note_idx % 2 == 1,
                edited_at=created_at if note_idx % 2 == 1 else None,
                created_at=created_at,
                updated_at=created_at + timedelta(hours=1 if note_idx % 2 == 1 else 0),
            )
            await note.insert()
        else:
            note.updated_by = str(actor.id)
            note.updated_by_name = full_name(actor.first_name, actor.last_name)
            note.is_edited = note_idx % 2 == 1
            note.updated_at = created_at + timedelta(hours=1 if note_idx % 2 == 1 else 0)
            await note.save()
        notes.append(note)

    for file_idx in range(file_count):
        file_name = f"lead-{lead_slug[:8]}-{file_idx + 1}.pdf"
        original_name = f"{lead.prospect_name.replace(' ', '_')}_brief_{file_idx + 1}.pdf"
        file_record = await SalesLeadFile.find_one({"lead_id": lead_slug, "company_id": lead.company_id, "file_name": file_name})
        actor = employees[file_idx % len(employees)]
        if not file_record:
            file_record = SalesLeadFile(
                lead_id=lead_slug,
                company_id=lead.company_id,
                file_url=f"https://example.com/files/{file_name}",
                file_name=file_name,
                original_name=original_name,
                file_type="proposal" if file_idx % 2 == 0 else "brief",
                mime_type="application/pdf",
                file_size=150000 + (global_index * 1000) + file_idx * 500,
                uploaded_by=str(actor.id),
                uploaded_by_name=full_name(actor.first_name, actor.last_name),
                created_at=datetime.utcnow() - timedelta(days=file_idx),
                updated_at=datetime.utcnow() - timedelta(days=file_idx),
            )
            await file_record.insert()
        else:
            file_record.uploaded_by = str(actor.id)
            file_record.uploaded_by_name = full_name(actor.first_name, actor.last_name)
            file_record.updated_at = datetime.utcnow()
            await file_record.save()
        files.append(file_record)

    return notes, files


async def upsert_pipeline_history(
    lead: SalesProspect,
    admin: User,
    manager: User,
    lead_user: User,
    company_index: int,
    lead_index: int,
) -> list[SalesPipelineHistory]:
    history: list[SalesPipelineHistory] = []
    transitions = [
        ("new", "follow_up_call"),
        ("follow_up_call", "schedule_a_meeting"),
        ("schedule_a_meeting", "send_proposal"),
    ]
    if lead_index % 4 == 0:
        transitions.append(("send_proposal", "negotiation"))
    if lead_index % 5 == 0:
        transitions.append(("negotiation", "won"))
    elif lead_index % 7 == 0:
        transitions.append(("negotiation", "lost"))

    actor_cycle = [admin, manager, lead_user]
    lead_id = str(lead.id)
    for idx, (previous_stage, new_stage) in enumerate(transitions):
        reason = f"Seed transition {idx + 1} for {lead.prospect_name}"
        transition_time = datetime.utcnow() - timedelta(days=(idx + 1) + company_index)
        record = await SalesPipelineHistory.find_one(
            {
                "company_id": lead.company_id,
                "lead_id": lead_id,
                "previous_stage": previous_stage,
                "new_stage": new_stage,
                "reason": reason,
            }
        )
        actor = actor_cycle[idx % len(actor_cycle)]
        payload = {
            "seed": DEMO_TAG,
            "company_index": company_index,
            "lead_index": lead_index,
            "from": previous_stage,
            "to": new_stage,
        }
        if not record:
            record = SalesPipelineHistory(
                lead_id=lead_id,
                company_id=lead.company_id,
                previous_stage=previous_stage,
                new_stage=new_stage,
                user_id=str(actor.id),
                user_name=full_name(actor.first_name, actor.last_name),
                reason=reason,
                days_in_previous_stage=idx + 1,
                payload=payload,
                transitioned_at=transition_time,
            )
            await record.insert()
        else:
            record.user_id = str(actor.id)
            record.user_name = full_name(actor.first_name, actor.last_name)
            record.payload = payload
            record.transitioned_at = transition_time
            await record.save()
        history.append(record)
    return history


async def upsert_crm_activities(
    lead: SalesProspect,
    admin: User,
    manager: User,
    lead_user: User,
    employees: list[User],
    company_id: str,
    global_index: int,
) -> list[CRMActivity]:
    activities: list[CRMActivity] = []
    activity_specs = [
        (CRMActivityType.CALL, "Discovery call", CRMActivityStatus.COMPLETED),
        (CRMActivityType.MEETING, "Follow-up meeting", CRMActivityStatus.SCHEDULED),
        (CRMActivityType.NOTE, "Internal CRM note", CRMActivityStatus.COMPLETED),
        (CRMActivityType.FILE, "Shared proposal file", CRMActivityStatus.COMPLETED),
    ]
    for idx, (activity_type, title, status) in enumerate(activity_specs):
        actor = [admin, manager, lead_user, *employees][(global_index + idx) % (3 + len(employees))]
        due = datetime.utcnow() + timedelta(days=idx + 1)
        record = await CRMActivity.find_one(
            {
                "company_id": company_id,
                "entity_type": "lead",
                "entity_id": str(lead.id),
                "activity_type": activity_type.value,
                "title": title,
            }
        )
        if not record:
            record = CRMActivity(
                company_id=company_id,
                entity_type="lead",
                entity_id=str(lead.id),
                activity_type=activity_type.value,
                title=title,
                description=f"{title} for {lead.prospect_name}",
                status=status,
                priority=CRMActivityPriority.MEDIUM if idx % 2 == 0 else CRMActivityPriority.HIGH,
                owner_id=str(actor.id),
                owner_name=full_name(actor.first_name, actor.last_name),
                due_date=due,
                scheduled_at=due if status == CRMActivityStatus.SCHEDULED else None,
                completed_at=datetime.utcnow() if status == CRMActivityStatus.COMPLETED else None,
                completed_by=str(actor.id) if status == CRMActivityStatus.COMPLETED else None,
                completed_by_name=full_name(actor.first_name, actor.last_name) if status == CRMActivityStatus.COMPLETED else None,
                metadata={"seed": DEMO_TAG, "lead_id": str(lead.id), "index": idx},
                created_by=str(admin.id),
                created_by_name=full_name(admin.first_name, admin.last_name),
                updated_by=str(actor.id),
                updated_by_name=full_name(actor.first_name, actor.last_name),
            )
            await record.insert()
        activities.append(record)
    return activities


async def upsert_tasks(
    company_id: str,
    admin: User,
    manager: User,
    lead_user: User,
    employees: list[User],
    projects: list[Project],
    company_index: int,
) -> list[Task]:
    tasks: list[Task] = []
    people = [admin, manager, lead_user, *employees]
    for idx in range(40):
        project = projects[idx % len(projects)]
        owner = people[idx % len(people)]
        assignee = people[(idx + 3) % len(people)]
        task_title = f"[{DEMO_TAG}] Task {company_index + 1}-{idx + 1:02d}"
        task = await Task.find_one({"company_id": company_id, "title": task_title})
        status = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW, TaskStatus.COMPLETED][idx % 4]
        if not task:
            task = Task(
                title=task_title,
                description=f"Seeded task {idx + 1} for company {company_index + 1}.",
                company_id=company_id,
                project_id=project.project_id,
                project_object_id=str(project.id),
                created_by=str(owner.id),
                assigned_to=str(assignee.id),
                assigned_by=str(admin.id),
                department_id=owner.department_id,
                department=owner.department_id,
                status=status,
                priority=[TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.CRITICAL][idx % 4],
                due_date=datetime.utcnow() + timedelta(days=idx % 21),
                start_date=datetime.utcnow() - timedelta(days=idx % 5),
                tags=["demo", "seed", f"company-{company_index + 1}"],
                story_points=(idx % 8) + 1,
                estimated_hours=float((idx % 8) + 2),
            )
            await task.insert()
        else:
            task.project_id = project.project_id
            task.project_object_id = str(project.id)
            task.assigned_to = str(assignee.id)
            task.assigned_by = str(admin.id)
            task.status = status
            task.priority = [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.CRITICAL][idx % 4]
            task.updated_at = datetime.utcnow()
            await task.save()
        tasks.append(task)
    return tasks


async def upsert_meetings(company_id: str, admin: User, manager: User, lead_user: User, employees: list[User], projects: list[Project]) -> list[Meeting]:
    meetings: list[Meeting] = []
    people = [admin, manager, lead_user, *employees]
    for idx in range(40):
        organizer = people[idx % len(people)]
        host = people[(idx + 1) % len(people)]
        title = f"[{DEMO_TAG}] Meeting {idx + 1:02d}"
        meeting = await Meeting.find_one({"company_id": company_id, "title": title})
        if not meeting:
            meeting = Meeting(
                title=title,
                description=f"Seed meeting {idx + 1}",
                company_id=company_id,
                created_by=str(organizer.id),
                host_id=str(host.id),
                participant_ids=[str(member.id) for member in people[:4]],
                meeting_date=datetime.utcnow() + timedelta(days=idx % 14),
                meeting_time=f"{9 + (idx % 8):02d}:30",
                duration=30 + (idx % 3) * 15,
                status=[MeetingStatus.SCHEDULED, MeetingStatus.ONGOING, MeetingStatus.COMPLETED, MeetingStatus.CANCELLED][idx % 4],
                zoom_meeting_id=f"zm-{company_id[:4]}-{idx:03d}",
                zoom_meeting_url=f"https://zoom.example.com/{company_id[:4]}/{idx:03d}",
                zoom_start_url=f"https://zoom.example.com/start/{company_id[:4]}/{idx:03d}",
                zoom_password=f"{100000 + idx}",
            )
            await meeting.insert()
        meetings.append(meeting)
    return meetings


async def upsert_invoices(company_id: str, admin: User, clients: list[Client], projects: list[Project]) -> list[Invoice]:
    invoices: list[Invoice] = []
    for idx in range(40):
        client = clients[idx % len(clients)]
        project = projects[idx % len(projects)]
        invoice_number = f"INV-DEMO-{company_id[:4].upper()}-{idx + 1:04d}"
        invoice = await Invoice.find_one({"company_id": company_id, "invoice_number": invoice_number})
        subtotal = 50000 + idx * 2500
        tax_rate = 18.0
        tax_amount = subtotal * tax_rate / 100
        total_amount = subtotal + tax_amount
        if not invoice:
            invoice = Invoice(
                invoice_number=invoice_number,
                company_id=company_id,
                invoice_type=InvoiceType.TAX if idx % 2 == 0 else InvoiceType.PROFORMA,
                include_tax=True,
                client_id=str(client.id),
                client_name=client.name,
                client_email=client.email,
                client_contact=client.contact,
                client_address=client.address,
                client_city=client.city,
                client_state=client.state,
                client_country=client.country,
                client_zip_code=client.zip_code,
                client_company_name=client.company_name,
                invoice_date=datetime.utcnow() - timedelta(days=idx),
                due_date=datetime.utcnow() + timedelta(days=30 - idx % 15),
                items=[
                    {"name": "Services", "quantity": 1, "rate": subtotal, "amount": subtotal},
                ],
                subtotal=subtotal,
                tax_rate=tax_rate,
                tax_amount=tax_amount,
                total_amount=total_amount,
                currency="INR",
                payments=[],
                total_received=0,
                tds_amount=0,
                outstanding_amount=total_amount,
                notes=f"Seed invoice {idx + 1}",
                terms_and_conditions="Standard demo terms.",
                status=[InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.PAID, InvoiceStatus.CANCELLED][idx % 4],
                email_sent=idx % 3 == 0,
                email_sent_at=datetime.utcnow() - timedelta(days=idx - 1) if idx % 3 == 0 else None,
                email_sent_to=client.email,
                pdf_url=f"https://example.com/invoices/{invoice_number}.pdf",
                project_id=project.project_id,
                created_by=str(admin.id),
            )
            await invoice.insert()
        invoices.append(invoice)
    return invoices


async def upsert_tickets(company_id: str, admin: User, manager: User, lead_user: User, employees: list[User]) -> list[Ticket]:
    tickets: list[Ticket] = []
    people = [admin, manager, lead_user, *employees]
    for idx in range(60):
        creator = people[idx % len(people)]
        assignee = people[(idx + 2) % len(people)]
        ticket_number = f"TKT-DEMO-{company_id[:4].upper()}-{idx + 1:04d}"
        ticket = await Ticket.find_one({"company_id": company_id, "ticket_number": ticket_number})
        if not ticket:
            ticket = Ticket(
                ticket_number=ticket_number,
                title=f"[{DEMO_TAG}] Ticket {idx + 1}",
                description=f"Seed ticket {idx + 1} for support and workflow QA.",
                company_id=company_id,
                created_by=str(creator.id),
                created_by_name=full_name(creator.first_name, creator.last_name),
                created_by_email=creator.email,
                assigned_to=str(assignee.id),
                assigned_by=str(admin.id),
                assigned_at=datetime.utcnow() - timedelta(days=idx % 10),
                type=[TicketType.SUPPORT, TicketType.BUG, TicketType.FEATURE_REQUEST, TicketType.QUERY, TicketType.COMPLAINT][idx % 5],
                status=[TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.WAITING_FOR_CUSTOMER, TicketStatus.RESOLVED, TicketStatus.CLOSED][idx % 5],
                priority=[TicketPriority.LOW, TicketPriority.MEDIUM, TicketPriority.HIGH, TicketPriority.URGENT][idx % 4],
                attachments=[],
                tags=["demo", "seed"],
                due_date=datetime.utcnow() + timedelta(days=idx % 12),
                first_response_at=datetime.utcnow() - timedelta(days=idx % 2) if idx % 2 == 0 else None,
                escalated=idx % 8 == 0,
                escalated_to=str(manager.id) if idx % 8 == 0 else None,
                escalated_at=datetime.utcnow() - timedelta(days=1) if idx % 8 == 0 else None,
            )
            await ticket.insert()
        tickets.append(ticket)
    return tickets


async def upsert_notifications(company_id: str, users: list[User], tasks: list[Task], tickets: list[Ticket]) -> list[Notification]:
    notifications: list[Notification] = []
    total = 250
    for idx in range(total):
        user = users[idx % len(users)]
        related_task = tasks[idx % len(tasks)]
        related_ticket = tickets[idx % len(tickets)]
        ntype = [
            NotificationType.TASK_ASSIGNED,
            NotificationType.TASK_UPDATED,
            NotificationType.TASK_COMPLETED,
            NotificationType.TICKET_ASSIGNED,
            NotificationType.MENTION,
            NotificationType.SYSTEM,
        ][idx % 6]
        title = f"[{DEMO_TAG}] Notification {idx + 1}"
        message = f"Seed notification {idx + 1} for {user.first_name}."
        notification = await Notification.find_one({"user_id": str(user.id), "title": title})
        if not notification:
            notification = Notification(
                user_id=str(user.id),
                company_id=company_id,
                type=ntype,
                title=title,
                message=message,
                related_id=str(related_task.id if idx % 2 == 0 else related_ticket.id),
                related_type="task" if idx % 2 == 0 else "ticket",
                action_url="/dashboard",
                metadata={"seed": DEMO_TAG, "index": idx},
                is_read=idx % 3 == 0,
                read_at=datetime.utcnow() - timedelta(days=1) if idx % 3 == 0 else None,
                email_sent=idx % 4 == 0,
                email_sent_at=datetime.utcnow() - timedelta(days=1) if idx % 4 == 0 else None,
            )
            await notification.insert()
        notifications.append(notification)
    return notifications


async def upsert_content_calendar(
    company_id: str,
    admin: User,
    clients: list[Client],
    projects: list[Project],
    employees: list[User],
) -> list[ContentCalendarItem]:
    items: list[ContentCalendarItem] = []
    statuses = [
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
    types = list(ContentItemType)
    for idx in range(60):
        project = projects[idx % len(projects)]
        client = clients[idx % len(clients)]
        assignee = employees[idx % len(employees)]
        title = f"[{DEMO_TAG}] Content Item {idx + 1:02d}"
        item = await ContentCalendarItem.find_one({"company_id": company_id, "title": title})
        if not item:
            item = ContentCalendarItem(
                company_id=company_id,
                project_id=project.project_id or str(project.id),
                client_id=str(client.id),
                campaign=f"Campaign {idx % 6 + 1}",
                platform=["Instagram", "LinkedIn", "YouTube", "Email"][idx % 4],
                title=title,
                content_type=types[idx % len(types)],
                assignee_id=str(assignee.id),
                assignee_name=full_name(assignee.first_name, assignee.last_name),
                due_date=datetime.utcnow() + timedelta(days=idx % 20),
                publish_date=datetime.utcnow() + timedelta(days=(idx % 20) + 2),
                priority=[ContentItemPriority.LOW, ContentItemPriority.MEDIUM, ContentItemPriority.HIGH, ContentItemPriority.URGENT][idx % 4],
                status=statuses[idx % len(statuses)],
                notes=f"Seed content item {idx + 1}",
                tags=["demo", "seed", "marketing"],
                deliverable_target=1 + idx % 5,
                completed=idx % 10 == 0,
                team=[str(admin.id), str(assignee.id)],
                assets_required=["copy", "design", "video"][: (idx % 3) + 1],
                metadata={"seed": DEMO_TAG, "client": client.name},
                created_by=str(admin.id),
                updated_by=str(assignee.id),
            )
            await item.insert()
        items.append(item)
    return items


def pick_by_index(items: list[Any], index: int) -> Any:
    return items[index % len(items)]


async def build_company_bundle(company_record: dict[str, Any], company_index: int) -> dict[str, Any]:
    company = await upsert_company(company_record)
    company_id = str(company.id)

    admin = await upsert_user(
        email=f"admin{company_index + 1}@demo.com",
        first_name=f"Admin{company_index + 1}",
        last_name="Demo",
        role=UserRole.ADMIN,
        company_id=company_id,
        department_id=None,
        reports_to=None,
        ancestors=[],
        modules=["task", "sales", "crm", "projects"],
    )

    dept_sales = await upsert_department(company_id, "Sales", str(admin.id))
    dept_delivery = await upsert_department(company_id, "Delivery", str(admin.id))
    dept_support = await upsert_department(company_id, "Support", str(admin.id))

    manager = await upsert_user(
        email=f"manager{company_index + 1}@demo.com",
        first_name=f"Manager{company_index + 1}",
        last_name="Demo",
        role=UserRole.MANAGER,
        company_id=company_id,
        department_id=str(dept_sales.id),
        reports_to=str(admin.id),
        ancestors=[str(admin.id)],
        modules=["task", "sales", "crm"],
    )
    lead_user = await upsert_user(
        email=f"lead{company_index + 1}@demo.com",
        first_name=f"Lead{company_index + 1}",
        last_name="Demo",
        role=UserRole.LEAD,
        company_id=company_id,
        department_id=str(dept_delivery.id),
        reports_to=str(manager.id),
        ancestors=[str(admin.id), str(manager.id)],
        modules=["task", "sales", "crm"],
    )

    employees: list[User] = []
    for employee_index in range(5):
        dept = [dept_sales, dept_delivery, dept_support][employee_index % 3]
        employee = await upsert_user(
            email=f"emp{company_index + 1}{employee_index + 1}@demo.com",
            first_name=f"Emp{company_index + 1}{employee_index + 1}",
            last_name="Demo",
            role=UserRole.EMPLOYEE,
            company_id=company_id,
            department_id=str(dept.id),
            reports_to=str(lead_user.id),
            ancestors=[str(admin.id), str(manager.id), str(lead_user.id)],
            modules=["task", "sales", "crm"],
        )
        employees.append(employee)

    company.admin_id = str(admin.id)
    company.updated_at = datetime.utcnow()
    await company.save()

    crm_company = await upsert_crm_company(company_id, admin)
    categories, products = await upsert_sales_catalog(company_id, str(admin.id), company_index)
    projects = await upsert_projects(company_id, admin, employees, company_index)
    clients = await upsert_clients(company_id, str(admin.id), [str(project.id) for project in projects])

    return {
        "company": company,
        "admin": admin,
        "manager": manager,
        "lead": lead_user,
        "employees": employees,
        "crm_company": crm_company,
        "categories": categories,
        "products": products,
        "projects": projects,
        "clients": clients,
    }


async def main() -> None:
    await init_db()
    try:
        bundles = []
        for idx, company_record in enumerate(COMPANIES):
            bundle = await build_company_bundle(company_record, idx)
            bundles.append(bundle)

        all_users: list[User] = []
        all_tasks: list[Task] = []
        all_tickets: list[Ticket] = []
        all_notifications: list[Notification] = []
        all_content_items: list[ContentCalendarItem] = []
        total_leads = 0
        total_notes = 0
        total_files = 0
        total_history = 0
        total_meetings = 0
        total_invoices = 0

        for company_index, bundle in enumerate(bundles):
            company = bundle["company"]
            admin = bundle["admin"]
            manager = bundle["manager"]
            lead_user = bundle["lead"]
            employees = bundle["employees"]
            categories = bundle["categories"]
            products = bundle["products"]
            crm_company = bundle["crm_company"]
            projects = bundle["projects"]
            clients = bundle["clients"]
            users = [admin, manager, lead_user, *employees]
            all_users.extend(users)

            tasks = await upsert_tasks(str(company.id), admin, manager, lead_user, employees, projects, company_index)
            tickets = await upsert_tickets(str(company.id), admin, manager, lead_user, employees)
            meetings = await upsert_meetings(str(company.id), admin, manager, lead_user, employees, projects)
            invoices = await upsert_invoices(str(company.id), admin, clients, projects)
            content_items = await upsert_content_calendar(str(company.id), admin, clients, projects, employees)

            all_tasks.extend(tasks)
            all_tickets.extend(tickets)
            all_content_items.extend(content_items)
            total_meetings += len(meetings)
            total_invoices += len(invoices)

            for lead_index in range(20):
                lead = await upsert_lead(
                    company_id=str(company.id),
                    admin=admin,
                    manager=manager,
                    lead_user=lead_user,
                    employees=employees,
                    lead_index=lead_index,
                    company_index=company_index,
                    categories=categories,
                    products=products,
                    crm_company=crm_company,
                )
                total_leads += 1

                notes, files = await upsert_lead_notes_and_files(lead, admin, employees, company_index * 20 + lead_index)
                history = await upsert_pipeline_history(lead, admin, manager, lead_user, company_index, lead_index)
                activities = await upsert_crm_activities(lead, admin, manager, lead_user, employees, str(company.id), company_index * 20 + lead_index)

                total_notes += len(notes)
                total_files += len(files)
                total_history += len(history)

            lead_pool = [admin, manager, lead_user, *employees]
            notifications = await upsert_notifications(str(company.id), lead_pool, tasks, tickets)
            all_notifications.extend(notifications)

        print("Full demo seed complete.")
        print(f"Companies:           {len(bundles)}")
        print(f"Users:               {len(all_users)}")
        print(f"CRM leads:           {total_leads}")
        print(f"Tasks:               {len(all_tasks)}")
        print(f"Notes:               {total_notes}")
        print(f"Files:               {total_files}")
        print(f"Timeline history:    {total_history} stage changes")
        print(f"Meetings:            {total_meetings}")
        print(f"Invoices:            {total_invoices}")
        print(f"Tickets:             {len(all_tickets)}")
        print(f"Notifications:       {len(all_notifications)}")
        print(f"Content calendar:    {len(all_content_items)}")
        print(f"Demo password:       {DEMO_PASSWORD}")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
