"""
Create Database Indexes
Run this script to ensure all indexes are created properly
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.user import User, SuperAdmin, CompanyAdmin, Lead, Employee
from app.models.company import Company, Subscription
from app.models.task import Task, TaskComment
from app.models.ticket import Ticket, TicketComment
from app.models.notification import Notification
from app.core.config import settings


async def create_indexes():
    """Create all database indexes"""
    print("Connecting to database...")
    
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    database = client[settings.DATABASE_NAME]
    
    print("Initializing Beanie...")
    await init_beanie(
        database=database,
        document_models=[
            User, SuperAdmin, CompanyAdmin, Lead, Employee,
            Company, Subscription,
            Task, TaskComment,
            Ticket, TicketComment,
            Notification,
        ]
    )
    
    print("✓ All indexes created successfully!")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(create_indexes())

