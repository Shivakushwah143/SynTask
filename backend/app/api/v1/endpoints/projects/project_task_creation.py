from fastapi import APIRouter

from .shared import *

router = APIRouter()


@router.get("/for-task-creation")
async def get_projects_for_task_creation(
    current_user: User = Depends(get_current_user),
):
    """Get projects that can be used when creating tasks (filtered by assignment)"""
    query = {"company_id": current_user.company_id, "status": ProjectStatus.ACTIVE}
    
    # Apply role-based filtering
    # Company Admin and Super Admin see all active projects
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        if current_user.role == UserRole.EMPLOYEE:
            # Employees see projects assigned to their lead
            employee = await Employee.get(current_user.id)
            if employee and employee.lead_id:
                query["assigned_to"] = employee.lead_id
            else:
                # If employee has no lead, return empty list
                return {"projects": []}
