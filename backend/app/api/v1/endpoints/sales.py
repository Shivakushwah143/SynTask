"""
Sales Tracker module - dashboard and helper endpoints.
"""
from fastapi import APIRouter, Depends

from app.api.dependencies import require_module, get_current_user
from app.models.user import User
from app.services.crm_dashboard_service import build_sales_dashboard_summary

router = APIRouter(dependencies=[Depends(require_module("sales"))])


@router.get("/health")
async def sales_health():
    return {"status": "ok", "module": "sales"}


@router.get("/me")
async def sales_me(current_user: User = Depends(get_current_user)):
    """Return current user scoped to sales module."""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role,
        "modules": getattr(current_user, "modules", []),
        "active_module": getattr(current_user, "active_module", None),
    }


@router.get("/dashboard")
async def sales_dashboard(current_user: User = Depends(get_current_user)):
    return await build_sales_dashboard_summary(current_user)
