"""Migrate company_admin role to admin"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URL = "mongodb+srv://tms-madhu:madhu12345@cluster0.knbbp3j.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority"
DATABASE_NAME = "alphanexis_task_management"

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

