"""
Migration Script: Update existing users with hierarchical RBAC structure

This script:
1. Converts COMPANY_ADMIN role to ADMIN
2. Sets reports_to field based on existing lead_id relationships
3. Creates reports_to relationships for existing users
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import init_db, close_db
from app.models.user import User, UserRole, Employee, Lead
from app.core.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate_hierarchy():
    """Migrate existing users to hierarchical RBAC structure"""
    try:
        await init_db()
        logger.info("Database connected")
        
        # Step 1: Convert COMPANY_ADMIN to ADMIN
        logger.info("Step 1: Converting COMPANY_ADMIN to ADMIN...")
        company_admins = await User.find({"role": "company_admin"}).to_list()
        for admin in company_admins:
            admin.role = UserRole.ADMIN
            await admin.save()
            logger.info(f"Converted {admin.email} from COMPANY_ADMIN to ADMIN")
        
        logger.info(f"Converted {len(company_admins)} COMPANY_ADMIN users to ADMIN")
        
        # Step 2: Set reports_to for Employees based on lead_id
        logger.info("Step 2: Setting reports_to for Employees based on lead_id...")
        employees = await Employee.find().to_list()
        migrated_employees = 0
        
        for employee in employees:
            if hasattr(employee, 'lead_id') and employee.lead_id:
                # Check if lead exists
                lead = await User.get(employee.lead_id)
                if lead:
                    employee.reports_to = employee.lead_id
                    await employee.save()
                    migrated_employees += 1
                    logger.info(f"Set reports_to for {employee.email} -> {lead.email}")
        
        logger.info(f"Migrated {migrated_employees} employees with lead_id")
        
        # Step 3: Set reports_to for Leads based on company structure
        # Leads should report to Managers or Admin
        logger.info("Step 3: Setting reports_to for Leads...")
        leads = await Lead.find().to_list()
        migrated_leads = 0
        
        for lead in leads:
            if not lead.reports_to and lead.company_id:
                # Try to find a Manager in the same company
                manager = await User.find_one({
                    "role": UserRole.MANAGER.value,
                    "company_id": lead.company_id
                })
                
                if manager:
                    lead.reports_to = str(manager.id)
                    await lead.save()
                    migrated_leads += 1
                    logger.info(f"Set reports_to for {lead.email} -> {manager.email}")
                else:
                    # If no Manager, try to find Admin
                    admin = await User.find_one({
                        "role": UserRole.ADMIN.value,
                        "company_id": lead.company_id
                    })
                    
                    if admin:
                        # Admin doesn't report to anyone, but we can note this
                        logger.info(f"Lead {lead.email} has no Manager, Admin is {admin.email}")
        
        logger.info(f"Migrated {migrated_leads} leads")
        
        # Step 4: Set reports_to for Managers
        logger.info("Step 4: Setting reports_to for Managers...")
        managers = await User.find({"role": UserRole.MANAGER.value}).to_list()
        migrated_managers = 0
        
        for manager in managers:
            if not manager.reports_to and manager.company_id:
                # Manager should report to Admin
                admin = await User.find_one({
                    "role": UserRole.ADMIN.value,
                    "company_id": manager.company_id
                })
                
                if admin:
                    manager.reports_to = str(admin.id)
                    await manager.save()
                    migrated_managers += 1
                    logger.info(f"Set reports_to for {manager.email} -> {admin.email}")
        
        logger.info(f"Migrated {migrated_managers} managers")
        
        # Summary
        total_users = await User.find().count()
        users_with_reports_to = await User.find({"reports_to": {"$exists": True, "$ne": None}}).count()
        
        logger.info("=" * 50)
        logger.info("Migration Summary:")
        logger.info(f"Total users: {total_users}")
        logger.info(f"Users with reports_to: {users_with_reports_to}")
        logger.info(f"Converted COMPANY_ADMIN: {len(company_admins)}")
        logger.info(f"Migrated Employees: {migrated_employees}")
        logger.info(f"Migrated Leads: {migrated_leads}")
        logger.info(f"Migrated Managers: {migrated_managers}")
        logger.info("=" * 50)
        
    except Exception as e:
        logger.error(f"Migration failed: {str(e)}", exc_info=True)
        raise
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(migrate_hierarchy())

