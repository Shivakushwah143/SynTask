"""Migrate company_admin role to admin"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

MONGODB_URL = settings.MONGODB_URL
DATABASE_NAME = settings.DATABASE_NAME

async def migrate():
    """Update all company_admin roles to admin"""
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    # Update users collection
    result = await db.users.update_many(
        {"role": "company_admin"},
        {"$set": {"role": "admin"}}
    )
    
    print(f"Updated {result.modified_count} users from 'company_admin' to 'admin'")
    
    # Verify
    count = await db.users.count_documents({"role": "company_admin"})
    print(f"Remaining 'company_admin' users: {count}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate())

