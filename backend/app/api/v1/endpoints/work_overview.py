"""
Work Overview API — Phase 3

Role-aware endpoint for the Work Overview experience.
Backend determines visibility scope based on the authenticated user's role.
"""
from fastapi import APIRouter, Depends

from app.api.dependencies import get_current_user
from app.models.user import User
from app.services.work_overview_service import build_work_overview

router = APIRouter()


@router.get("/overview")
async def get_work_overview(current_user: User = Depends(get_current_user)):
    """
    Return the role-aware Work Overview.

    Employee → My Work (personal execution view)
    Manager/Lead → Team Work (team operational view)
    Admin/Super Admin → Business Work (company scope)

    The backend determines scope — no arbitrary user_id/company_id query params.
    """
    return await build_work_overview(current_user)
