"""
Initialize the Super Admin user.

Run this script once after setting up the database.
"""
import asyncio
import os
import sys

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import SuperAdmin, UserStatus


async def init_super_admin():
    """Initialize Super Admin."""
    print("Connecting to database...")

    client = AsyncIOMotorClient(settings.MONGODB_URL)
    database = client[settings.DATABASE_NAME]

    await init_beanie(database=database, document_models=[SuperAdmin])

    print("Checking for existing Super Admin...")
    existing = await SuperAdmin.find_one(SuperAdmin.email == settings.SUPER_ADMIN_EMAIL)

    if existing:
        print(f"Super Admin already exists: {existing.email}")
        client.close()
        return

    print("Creating Super Admin...")
    super_admin = SuperAdmin(
        email=settings.SUPER_ADMIN_EMAIL,
        password_hash=get_password_hash(settings.SUPER_ADMIN_PASSWORD),
        first_name="Super",
        last_name="Admin",
        status=UserStatus.ACTIVE,
    )

    await super_admin.insert()

    print("Super Admin created successfully!")
    print(f"Email: {settings.SUPER_ADMIN_EMAIL}")
    print("Password: configured from SUPER_ADMIN_PASSWORD")
    print("\nIMPORTANT: Change the password after first login!")

    client.close()


if __name__ == "__main__":
    asyncio.run(init_super_admin())
