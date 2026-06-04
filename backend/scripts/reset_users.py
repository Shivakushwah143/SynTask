"""
Reset all users and create fresh Super Admin
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.core.config import settings
from app.models.user import User, SuperAdmin, UserRole, UserStatus
from app.core.security import get_password_hash

async def reset_users():
    """Delete all users and create fresh Super Admin"""
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    database = client[settings.DATABASE_NAME]
    
    # Initialize Beanie with User models
    await init_beanie(
        database=database,
        document_models=[User, SuperAdmin]
    )
    
    print("Deleting all existing users...")
    result = await User.find_all().delete()
    print(f"Deleted {result.deleted_count if result else 0} users")
    
    print("\nCreating fresh Super Admin...")
    
    # Create Super Admin with known credentials
    super_admin = SuperAdmin(
        email="admin@synzent.ai",
        password_hash=get_password_hash("Admin@123"),
        first_name="Super",
        last_name="Admin",
        role=UserRole.SUPER_ADMIN,
        status=UserStatus.ACTIVE,
        is_email_verified=True,
        company_id=None,
        reports_to=None,
        created_by=None
    )
    
    await super_admin.insert()
    
    print("Super Admin created successfully!")
    print("\nEmail: admin@synzent.ai")
    print("Password: Admin@123")
    print("\nYou can now login with these credentials")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(reset_users())

