"""Create demo admin user for testing"""
import asyncio
from app.core.database import init_db
from app.models.user import User, UserRole, UserStatus
from app.core.security import get_password_hash

async def create_demo_admin():
    await init_db()
    
    # Check if user exists
    existing = await User.find_one(User.email == 'admin@demo.com')
    if existing:
        print(f"User admin@demo.com already exists with role: {existing.role}")
        print(f"User ID: {existing.id}")
        return
    
    # Create new admin user
    admin = User(
        email='admin@demo.com',
        password_hash=get_password_hash('Admin@123'),
        first_name='Demo',
        last_name='Admin',
        role=UserRole.ADMIN,
        company_id=None,
        modules=['task', 'sales'],
        active_module='task',
        status=UserStatus.ACTIVE
    )
    
    await admin.insert()
    print(f"Created admin@demo.com with role: {admin.role}")
    print(f"User ID: {admin.id}")
    print("Password: Admin@123")

if __name__ == "__main__":
    asyncio.run(create_demo_admin())