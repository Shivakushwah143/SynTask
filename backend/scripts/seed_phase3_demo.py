"""
Seed a small Phase 3 demo dataset for manual QA.

This script is idempotent: running it again updates the same demo records
instead of creating duplicates.
"""
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.database import close_db, init_db
from app.core.security import get_password_hash
from app.models.company import Company, CompanyStatus, Subscription, SubscriptionStatus
from app.models.department import Department, DepartmentType
from app.models.project import Epic, Project, ProjectStatus, ProjectType, Sprint
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User, UserRole, UserStatus


DEMO_PASSWORD = "Demo@123456"
ADMIN_EMAIL = "phase3admin@example.com"
TASK_ONLY_EMAIL = "phase3taskonly@example.com"
COMPANY_EMAIL = "phase3-demo-company@example.com"
PROJECT_ID = "P3-DEMO-001"
PROJECT_KEY = "P3D"
TASK_TITLE = "Phase 3 Demo Task"
HR_DEPARTMENT_NAME = "Human Resources"


async def upsert_company() -> Company:
    now = datetime.utcnow()
    company = await Company.find_one({"email": COMPANY_EMAIL})
    if not company:
        company = Company(
            name="Phase 3 Demo Company",
            email=COMPANY_EMAIL,
            phone="+10000000000",
            website="https://example.com",
            industry="Software",
            company_size="1-10",
            status=CompanyStatus.ACTIVE,
            max_users=25,
            max_projects=25,
            max_storage_gb=10,
            approved_at=now,
        )
        await company.insert()
    else:
        company.status = CompanyStatus.ACTIVE
        company.updated_at = now
        await company.save()

    subscription = await Subscription.find_one({"company_id": str(company.id)})
    if not subscription:
        subscription = Subscription(
            company_id=str(company.id),
            status=SubscriptionStatus.ACTIVE,
            current_users=2,
            current_projects=1,
            trial_end_date=now + timedelta(days=30),
        )
        await subscription.insert()
    else:
        subscription.status = SubscriptionStatus.ACTIVE
        subscription.current_users = max(subscription.current_users, 2)
        subscription.current_projects = max(subscription.current_projects, 1)
        subscription.updated_at = now
        await subscription.save()

    return company


async def upsert_user(
    *,
    email: str,
    first_name: str,
    last_name: str,
    role: UserRole,
    company_id: str,
    modules: list[str],
    reports_to: str | None = None,
    ancestors: list[str] | None = None,
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
            reports_to=reports_to,
            created_by=reports_to,
            ancestors=ancestors or [],
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
        user.reports_to = reports_to
        user.ancestors = ancestors or []
        user.is_email_verified = True
        user.updated_at = now
        await user.save()
    return user


async def upsert_department(company_id: str, name: str, department_type: DepartmentType, manager_id: str | None = None) -> Department:
    now = datetime.utcnow()
    department = await Department.find_one({"company_id": company_id, "name": name})
    if not department:
        department = Department(
            company_id=company_id,
            name=name,
            department_type=department_type,
            manager_id=manager_id,
            created_at=now,
            updated_at=now,
        )
        await department.insert()
    else:
        department.department_type = department_type
        department.manager_id = manager_id
        department.updated_at = now
        await department.save()
    return department


async def upsert_project(company_id: str, admin_id: str, employee_id: str) -> Project:
    now = datetime.utcnow()
    project = await Project.find_one({"company_id": company_id, "project_id": PROJECT_ID})
    if not project:
        project = Project(
            name="Phase 3 Demo Project",
            key=PROJECT_KEY,
            project_id=PROJECT_ID,
            description="Demo project for Phase 3 architecture QA.",
            company_id=company_id,
            type=ProjectType.SOFTWARE,
            status=ProjectStatus.ACTIVE,
            lead_id=admin_id,
            assigned_to=admin_id,
            assigned_by=admin_id,
            assigned_at=now,
            team_member_ids=[admin_id, employee_id],
            default_assignee=employee_id,
            start_date=now,
            delivery_date=now + timedelta(days=30),
            category="QA",
            created_by=admin_id,
        )
        await project.insert()
    else:
        project.name = "Phase 3 Demo Project"
        project.key = PROJECT_KEY
        project.status = ProjectStatus.ACTIVE
        project.lead_id = admin_id
        project.assigned_to = admin_id
        project.assigned_by = admin_id
        project.team_member_ids = [admin_id, employee_id]
        project.default_assignee = employee_id
        project.updated_at = now
        await project.save()
    return project


async def upsert_epic(company_id: str, admin_id: str) -> Epic:
    epic = await Epic.find_one({"company_id": company_id, "project_id": PROJECT_ID, "name": "Phase 3 Demo Epic"})
    if not epic:
        epic = Epic(
            name="Phase 3 Demo Epic",
            description="Demo epic for project endpoint tests.",
            project_id=PROJECT_ID,
            company_id=company_id,
            created_by=admin_id,
            owner_id=admin_id,
            status="in_progress",
            color="#2563eb",
        )
        await epic.insert()
    else:
        epic.status = "in_progress"
        epic.owner_id = admin_id
        epic.updated_at = datetime.utcnow()
        await epic.save()
    return epic


async def upsert_sprint(company_id: str, admin_id: str, employee_id: str) -> Sprint:
    now = datetime.utcnow()
    sprint = await Sprint.find_one({"company_id": company_id, "project_id": PROJECT_ID, "name": "Phase 3 Demo Sprint"})
    if not sprint:
        sprint = Sprint(
            name="Phase 3 Demo Sprint",
            project_id=PROJECT_ID,
            company_id=company_id,
            goal="Verify Phase 3 project and task endpoints.",
            start_date=now,
            end_date=now + timedelta(days=14),
            state="active",
            team_member_ids=[admin_id, employee_id],
            created_by=admin_id,
        )
        await sprint.insert()
    else:
        sprint.state = "active"
        sprint.team_member_ids = [admin_id, employee_id]
        sprint.start_date = now
        sprint.end_date = now + timedelta(days=14)
        sprint.updated_at = now
        await sprint.save()
    return sprint


async def upsert_task(
    company_id: str,
    admin_id: str,
    employee_id: str,
    project: Project,
    epic: Epic,
    sprint: Sprint,
) -> Task:
    now = datetime.utcnow()
    task = await Task.find_one({"company_id": company_id, "title": TASK_TITLE, "project_id": PROJECT_ID})
    if not task:
        task = Task(
            title=TASK_TITLE,
            description="A seeded task used for Phase 3 manual testing.",
            company_id=company_id,
            project_id=PROJECT_ID,
            project_object_id=str(project.id),
            created_by=admin_id,
            assigned_to=employee_id,
            assigned_by=admin_id,
            status=TaskStatus.TODO,
            priority=TaskPriority.MEDIUM,
            due_date=now + timedelta(days=7),
            start_date=now,
            tags=["phase3", "demo"],
            epic_id=str(epic.id),
            sprint_id=str(sprint.id),
            story_points=3,
            estimated_hours=4.0,
        )
        await task.insert()
    else:
        task.project_id = PROJECT_ID
        task.project_object_id = str(project.id)
        task.assigned_to = employee_id
        task.assigned_by = admin_id
        task.epic_id = str(epic.id)
        task.sprint_id = str(sprint.id)
        task.status = TaskStatus.TODO
        task.priority = TaskPriority.MEDIUM
        task.tags = ["phase3", "demo"]
        task.updated_at = now
        await task.save()
    return task


async def main() -> None:
    await init_db()
    try:
        company = await upsert_company()
        company_id = str(company.id)
        admin = await upsert_user(
            email=ADMIN_EMAIL,
            first_name="Phase3",
            last_name="Admin",
            role=UserRole.ADMIN,
            company_id=company_id,
            modules=["task", "sales"],
        )
        hr_department = await upsert_department(company_id, HR_DEPARTMENT_NAME, DepartmentType.HR, str(admin.id))
        hr_manager = await upsert_user(
            email="phase3hr@example.com",
            first_name="Phase3",
            last_name="HR",
            role=UserRole.MANAGER,
            company_id=company_id,
            modules=["task", "hr"],
            reports_to=str(admin.id),
            ancestors=[str(admin.id)],
        )
        hr_manager.department_id = str(hr_department.id)
        hr_manager.updated_at = datetime.utcnow()
        await hr_manager.save()
        employee = await upsert_user(
            email=TASK_ONLY_EMAIL,
            first_name="Phase3",
            last_name="TaskOnly",
            role=UserRole.EMPLOYEE,
            company_id=company_id,
            modules=["task"],
            reports_to=str(admin.id),
            ancestors=[str(admin.id)],
        )
        employee.department_id = str(hr_department.id)
        employee.updated_at = datetime.utcnow()
        await employee.save()
        company.admin_id = str(admin.id)
        company.updated_at = datetime.utcnow()
        await company.save()

        project = await upsert_project(company_id, str(admin.id), str(employee.id))
        epic = await upsert_epic(company_id, str(admin.id))
        sprint = await upsert_sprint(company_id, str(admin.id), str(employee.id))
        task = await upsert_task(company_id, str(admin.id), str(employee.id), project, epic, sprint)

        print("Phase 3 demo seed complete.")
        print(f"Admin login:      {ADMIN_EMAIL} / {DEMO_PASSWORD}")
        print("HR login:         phase3hr@example.com / Demo@123456")
        print(f"Task-only login:  {TASK_ONLY_EMAIL} / {DEMO_PASSWORD}")
        print(f"Company ID:       {company_id}")
        print(f"Admin User ID:    {admin.id}")
        print(f"HR User ID:       {hr_manager.id}")
        print(f"Employee User ID: {employee.id}")
        print(f"HR Department ID: {hr_department.id}")
        print(f"Project ID:       {PROJECT_ID}")
        print(f"Project Object:   {project.id}")
        print(f"Epic ID:          {epic.id}")
        print(f"Sprint ID:        {sprint.id}")
        print(f"Task ID:          {task.id}")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
