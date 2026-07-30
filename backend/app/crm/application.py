from __future__ import annotations

from typing import Any, Dict

from app.models.user import User, UserRole
from app.services.crm_dashboard_service import (
    build_crm_workspace_config,
    build_sales_dashboard_summary,
    build_sales_analytics_summary,
)


def build_crm_workspace_manifest(current_user: User) -> Dict[str, Any]:
    workspace = build_crm_workspace_config(current_user)
    capabilities = get_crm_capabilities(current_user)
    return {
        "workspace": workspace,
        "navigation": workspace["navigation"],
        "feature_flags": workspace["feature_flags"],
        "permissions": workspace["permissions"],
        "capabilities": capabilities,
    }


async def build_crm_dashboard(current_user: User) -> Dict[str, Any]:
    workspace_manifest = build_crm_workspace_manifest(current_user)
    sales_summary = await build_sales_dashboard_summary(current_user)
    sales_analytics = await build_sales_analytics_summary(current_user)
    return {
        "workspace": workspace_manifest["workspace"],
        "sales": sales_summary,
        "analytics": sales_analytics,
        "navigation": workspace_manifest["navigation"],
        "feature_flags": workspace_manifest["feature_flags"],
        "permissions": workspace_manifest["permissions"],
        "capabilities": workspace_manifest["capabilities"],
    }


def get_crm_capabilities(current_user: User) -> Dict[str, bool]:
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN]
    return {
        "can_manage_settings": is_admin,
        "can_use_future_modules": is_admin,
    }
