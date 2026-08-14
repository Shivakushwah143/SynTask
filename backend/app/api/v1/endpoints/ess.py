"""
Phase 8 — Employee Self-Service (ESS) endpoints.

Mounted at ``/hr/me``:

    GET /hr/me/summary   lightweight My HR overview aggregate (self only)

The identity is always the authenticated user — no employee_id is accepted
from the request. Module pages keep using their own existing APIs
(/employees/me, /attendance/me/*, /leaves/*,
/hr/employees/{own-profile-id}/documents, /payroll/me/payslips); this
router only adds the overview aggregate.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_current_user
from app.models.user import User
from app.services.ess_service import build_my_summary

router = APIRouter()


@router.get("/summary")
async def my_hr_summary(current_user: User = Depends(get_current_user)):
    """The current user's My HR overview (profile, attendance today, leave
    summary, document alerts, latest payslip). Self-only — never derived from
    request-supplied employee ids."""
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile is not available for this account.",
        )
    data = await build_my_summary(current_user)
    return {"success": True, "data": data}
