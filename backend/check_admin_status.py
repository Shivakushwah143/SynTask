"""Check and fix admin user status"""
import asyncio
from app.core.database import init_db
from app.models.user import User, UserRole, UserStatus

async def check_and_fix_admin():
    await init_db()
    
    # Find the admin user
    admin = await User.find_one(User.email == 'admin@demo.com')
    
    if not admin:
        print("Admin user not found!")
        print("Run: python create_demo_admin.py")
        return
    
    print(f"Found admin user: {admin.email}")
    print(f"  - User ID: {admin.id}")
    print(f"  - Name: {admin.first_name} {admin.last_name}")
    print(f"  - Role: {admin.role}")
    print(f"  - Status: {admin.status}")
    print(f"  - Company ID: {admin.company_id}")
    print(f"  - Modules: {admin.modules}")
    
    # Check if status is ACTIVE
    if admin.status != UserStatus.ACTIVE:
        print(f"\nWARNING: User status is '{admin.status}' but should be 'active'")
        print("   This is causing the 403 Forbidden error!")
        
        # Fix the status
        admin.status = UserStatus.ACTIVE
        await admin.save()
        print("Fixed: User status updated to 'active'")
    else:
        print("\nUser status is correct (active)")
    
    # Check role
    if admin.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.LEAD]:
        print(f"\nWARNING: User role is '{admin.role}' but should be 'admin', 'manager', 'lead', or 'super_admin'")
        print("   This will prevent access to clients!")
        
        # Fix the role
        admin.role = UserRole.ADMIN
        await admin.save()
        print("Fixed: User role updated to 'admin'")
    else:
        print(f"User role is correct ({admin.role})")
    
    print("\n" + "="*50)
    print("Admin user is now properly configured!")
    print("="*50)
    print("\nYou can now login with:")
    print("  Email: admin@demo.com")
    print("  Password: Admin@123")
    print("\nTry accessing /clients again - it should work now!")

if __name__ == "__main__":
    asyncio.run(check_and_fix_admin())