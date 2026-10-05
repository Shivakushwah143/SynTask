"""Discover employees in admin company and users."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    admin_company = "aaaaaaaaaaaaaaaaaaaaaaaa"
    
    # Users in admin company
    users = await db.users.find(
        {"company_id": admin_company},
        {"email": 1, "role": 1, "full_name": 1, "first_name": 1, "last_name": 1, "company_id": 1}
    ).to_list(20)
    print("=== USERS IN ADMIN COMPANY ===")
    for u in users:
        name = u.get("full_name") or f"{u.get('first_name', '')} {u.get('last_name', '')}"
        print(f"  {u.get('email', '?'):35s} role={u.get('role', '?'):12s} name={name}")
    
    # Employee profiles in admin company
    profiles = await db.employee_profiles.find(
        {"company_id": admin_company},
        {"first_name": 1, "last_name": 1, "employee_id": 1, "designation": 1, "department": 1, "company_id": 1, "employment_status": 1}
    ).to_list(20)
    print("\n=== EMPLOYEE PROFILES IN ADMIN COMPANY ===")
    for p in profiles:
        name = f"{p.get('first_name', '')} {p.get('last_name', '')}"
        print(f"  {name:25s} emp_id={p.get('employee_id', '?')} dept={p.get('department', '?')} desig={p.get('designation', '?')} status={p.get('employment_status', '?')}")
    
    # Tasks in admin company
    tasks = await db.tasks.find(
        {"company_id": admin_company},
        {"title": 1, "assignee_id": 1, "status": 1, "priority": 1, "due_date": 1, "project_id": 1}
    ).to_list(20)
    print(f"\n=== TASKS IN ADMIN COMPANY ({len(tasks)} total) ===")
    for t in tasks[:10]:
        print(f"  {t.get('title', '?'):40s} assignee={str(t.get('assignee_id', 'None'))[:20]} status={t.get('status', '?')}")
    
    # Attendance
    attendance = await db.attendance.find(
        {"company_id": admin_company}
    ).to_list(5)
    print(f"\n=== ATTENDANCE RECORDS (sample {len(attendance)}) ===")
    for a in attendance[:5]:
        print(f"  user={a.get('user_id', '?')} date={a.get('date', '?')} status={a.get('status', '?')}")
    
    # Leave requests
    leaves = await db.leave_requests.find(
        {"company_id": admin_company}
    ).to_list(5)
    print(f"\n=== LEAVE REQUESTS ({len(leaves)}) ===")
    for l in leaves[:5]:
        print(f"  user={l.get('user_id', '?')} type={l.get('leave_type', '?')} status={l.get('status', '?')}")

asyncio.run(main())
