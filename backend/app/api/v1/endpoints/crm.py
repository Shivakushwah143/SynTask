"""
CRM workspace endpoints.

The backend business domain remains Sales, so CRM endpoints are a thin
application-layer facade over the existing sales models and permissions.
"""
from fastapi import APIRouter, Depends

from app.api.dependencies import get_current_user, require_module
from app.crm.application import build_crm_dashboard
from app.models.user import User

router = APIRouter(dependencies=[Depends(require_module("sales"))])


@router.get("/dashboard")
async def crm_dashboard(current_user: User = Depends(get_current_user)):
    return await build_crm_dashboard(current_user)
