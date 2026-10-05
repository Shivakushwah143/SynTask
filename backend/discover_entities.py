"""Discover real entities in the database."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def main():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]

    profiles = await db.employee_profiles.find(
        {}, {"first_name": 1, "last_name": 1, "employee_id": 1, "company_id": 1, "designation": 1, "department": 1}
    ).to_list(10)
    print("=== EMPLOYEE PROFILES ===")
    for p in profiles:
        name = f"{p.get('first_name', '')} {p.get('last_name', '')}"
        print(f"  {name:25s} emp_id={p.get('employee_id', '?')} company={p.get('company_id', '?')}")

    candidates = await db.candidates.find(
        {}, {"first_name": 1, "last_name": 1, "company_id": 1}
    ).to_list(10)
    print("\n=== CANDIDATES ===")
    for c in candidates:
        name = f"{c.get('first_name', '')} {c.get('last_name', '')}"
        print(f"  {name:25s} company={c.get('company_id', '?')}")

    projects = await db.projects.find(
        {}, {"name": 1, "company_id": 1, "status": 1}
    ).to_list(10)
    print("\n=== PROJECTS ===")
    for pr in projects:
        print(f"  {pr.get('name', '?'):30s} status={pr.get('status', '?')} company={pr.get('company_id', '?')}")

    clients = await db.clients.find(
        {}, {"name": 1, "company_id": 1}
    ).to_list(10)
    print("\n=== CLIENTS ===")
    for cl in clients:
        print(f"  {cl.get('name', '?'):30s} company={cl.get('company_id', '?')}")

    tasks = await db.tasks.find(
        {"assignee_id": {"$ne": None}},
        {"title": 1, "assignee_id": 1, "status": 1, "priority": 1, "company_id": 1}
    ).to_list(10)
    print("\n=== TASKS WITH ASSIGNEES ===")
    for t in tasks:
        print(f"  {t.get('title', '?'):40s} assignee={t.get('assignee_id', '?')} status={t.get('status', '?')} prio={t.get('priority', '?')} company={t.get('company_id', '?')}")

    # Find the admin user's company
    admin = await db.users.find_one({"email": "admin@demo.com"}, {"company_id": 1})
    if admin:
        print(f"\n=== ADMIN COMPANY: {admin.get('company_id')} ===")

asyncio.run(main())
