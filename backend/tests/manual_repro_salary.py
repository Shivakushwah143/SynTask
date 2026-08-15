"""Manual reproduction: exercise the real salary GET path against a live MongoDB.

Run with: python -m tests.manual_repro_salary  (backend cwd, MongoDB at localhost:27017)
"""
import asyncio
import os

os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault("DATABASE_NAME", "alphanexis_task_management")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-bytes-long")

from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorClient

from app.models.employee_profile import EmployeeProfile, EmploymentStatus
from app.models.salary import SalaryComponent, SalaryStructure, SalaryStatus, PayFrequency, ComponentType, CalculationType
from app.models.user import User, UserRole, UserStatus


async def main():
    from app.core.database import get_database, init_db

    await init_db()
    db = get_database()
    await db.client.drop_database(db.name)
    print("== DB dropped, fresh ==")

    # --- Seed admin + employee -------------------------------------------
    admin = User(
        email="admin@acme.com", password_hash="x", first_name="Admin", last_name="User",
        role=UserRole.ADMIN, status=UserStatus.ACTIVE, company_id="company-a", modules=["task"],
    )
    await admin.insert()
    emp = User(
        email="sonali@acme.com", password_hash="x", first_name="Sonali", last_name="Shakywar",
        role=UserRole.EMPLOYEE, status=UserStatus.ACTIVE, company_id="company-a", modules=["task"],
    )
    await emp.insert()
    profile = EmployeeProfile(
        company_id="company-a", user_id=str(emp.id), employee_number="EMP-2026-0001",
        employment_status=EmploymentStatus.ACTIVE, joining_date=datetime(2026, 1, 1),
    )
    await profile.insert()
    print(f"seeded admin={admin.id} employee={emp.id} profile={profile.id}")

    # --- Exercise endpoint functions --------------------------------------
    from app.api.v1.endpoints.salary import get_employee_salary, get_employee_salary_history

    # Case 1: employee with NO salary at all
    res = await get_employee_salary(str(emp.id), admin)
    print("CASE 1 no-salary current+upcoming:", res)
    hist = await get_employee_salary_history(str(emp.id), admin)
    print("CASE 1 history:", hist)

    # Case 2: employee WITH a normal salary structure (datetime effective_from)
    comp = SalaryComponent(
        company_id="company-a", name="Basic", code="BASIC",
        component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED, default_value=50000,
    )
    await comp.insert()
    s1 = SalaryStructure(
        company_id="company-a", employee_id=str(emp.id),
        effective_from=datetime(2026, 1, 1),
        status=SalaryStatus.ACTIVE, pay_frequency=PayFrequency.MONTHLY,
        items=[], total_earnings=50000, total_configured_deductions=0, configured_net=50000,
    )
    await s1.insert()
    res = await get_employee_salary(str(emp.id), admin)
    print("CASE 2 with-salary current+upcoming:", res)
    hist = await get_employee_salary_history(str(emp.id), admin)
    print("CASE 2 history:", hist)

    # Case 3: employee whose structure has a *date* effective_from (legacy data shape)
    await s1.delete()
    s2 = SalaryStructure(
        company_id="company-a", employee_id=str(emp.id),
        effective_from=datetime(2026, 1, 1).date(),
        status=SalaryStatus.ACTIVE, pay_frequency=PayFrequency.MONTHLY,
        items=[], total_earnings=50000, total_configured_deductions=0, configured_net=50000,
    )
    await s2.insert()
    try:
        res = await get_employee_salary(str(emp.id), admin)
        print("CASE 3 date-effective_from:", res)
    except Exception as e:
        print("CASE 3 EXCEPTION:", type(e).__name__, str(e)[:500])
    await s2.delete()

    # Case 4: employee whose structure has ISO-string effective_from (legacy)
    raw = SalaryStructure(
        company_id="company-a", employee_id=str(emp.id),
        effective_from=datetime(2026, 1, 1),
        status=SalaryStatus.ACTIVE, pay_frequency=PayFrequency.MONTHLY,
        items=[], total_earnings=50000, total_configured_deductions=0, configured_net=50000,
    )
    await raw.insert()
    coll = db["salary_structures"]
    await coll.update_one({"_id": raw.id}, {"$set": {"effective_from": "2026-01-01T00:00:00"}})
    try:
        res = await get_employee_salary(str(emp.id), admin)
        print("CASE 4 string-effective_from:", res)
    except Exception as e:
        print("CASE 4 EXCEPTION:", type(e).__name__, str(e)[:500])
    await raw.delete()

    # Case 5: status stored as plain string (legacy)
    s5 = SalaryStructure(
        company_id="company-a", employee_id=str(emp.id),
        effective_from=datetime(2026, 1, 1),
        status=SalaryStatus.ACTIVE, pay_frequency=PayFrequency.MONTHLY,
        items=[], total_earnings=50000, total_configured_deductions=0, configured_net=50000,
    )
    await s5.insert()
    await coll.update_one({"_id": s5.id}, {"$set": {"status": "active", "pay_frequency": "monthly"}})
    try:
        res = await get_employee_salary(str(emp.id), admin)
        print("CASE 5 string-status:", res)
    except Exception as e:
        print("CASE 5 EXCEPTION:", type(e).__name__, str(e)[:500])
    await s5.delete()

    print("\n== done ==")


if __name__ == "__main__":
    asyncio.run(main())
