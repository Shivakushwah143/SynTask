"""Create demo admin user for testing"""
import asyncio
from app.core.database import init_db
from app.models.user import User, UserRole, UserStatus
from app.core.security import get_password_hash

DEMO_ADMIN_MODULES = [
    # Legacy route guards and the sidebar still use these compatibility IDs.
    'task',
    'sales',
    'tasks_projects',
    'tickets',
    'chat',
    'meetings_calendar',
    'invoicing_ledger',
    'sales_crm',
    'attendance_leaves',
    'recruitment',
    'reports',
    'ai_agents',
]

async def create_demo_admin():
    await init_db()
    
    # Check if user exists
    existing = await User.find_one(User.email == 'admin@demo.com')
    if existing:
        existing.modules = DEMO_ADMIN_MODULES.copy()
        existing.active_module = 'tasks_projects'
        await existing.save()
        print(f"User admin@demo.com already exists with role: {existing.role}")
        print(f"Updated modules: {', '.join(existing.modules)}")
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
        modules=DEMO_ADMIN_MODULES.copy(),
        active_module='tasks_projects',
        status=UserStatus.ACTIVE
    )
    
    await admin.insert()
    print(f"Created admin@demo.com with role: {admin.role}")
    print(f"User ID: {admin.id}")
    print("Password: Admin@123")

if __name__ == "__main__":
    asyncio.run(create_demo_admin())
