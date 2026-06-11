"""Check user data after migration"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

MONGODB_URL = settings.MONGODB_URL
DATABASE_NAME = settings.DATABASE_NAME

async def check_data():
    """Check user and related data"""
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    print("=== USERS ===")
    users = await db.users.find().to_list(length=100)
    for user in users:
        print(f"- {user.get('first_name')} {user.get('last_name')} ({user.get('email')})")
        print(f"  Role: {user.get('role')}")
        print(f"  Company: {user.get('company_id')}")
        print(f"  Status: {user.get('status')}")
        print()
    
    print(f"\n=== STATS ===")
    print(f"Total Users: {len(users)}")
    print(f"Total Projects: {await db.projects.count_documents({})}")
    print(f"Total Tasks: {await db.tasks.count_documents({})}")
    print(f"Total Companies: {await db.companies.count_documents({})}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_data())

