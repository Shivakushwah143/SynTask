from __future__ import annotations

from typing import Any, Dict

from app.models.user import User, UserRole
from app.services.crm_dashboard_service import (
    build_crm_workspace_config,
    build_sales_summary_pair,
)


def build_crm_dashboard_from_metrics(current_user: User, cached_metrics: Dict[str, Any]) -> Dict[str, Any]:
    """Build the CRM dashboard payload from already-computed /dashboard/metrics.

    When the frontend fires /dashboard/metrics and /crm/dashboard in parallel,
    the second endpoint can reuse cached metrics instead of recomputing the same
    sales summaries, analytics, and workspace config.
    """
    workspace_manifest = build_crm_workspace_manifest(current_user)
    # The metrics cache stores the raw output of _build_company_dashboard_metrics.
    # We reconstruct the shapes expected by the frontend from its fields.
    return {
        "workspace": workspace_manifest["workspace"],
        "sales": {
            "closed_vs_target": {
                "months": [item["label"] for item in cached_metrics.get("revenue_trend", [])],
                "closed": [item["primary"] for item in cached_metrics.get("revenue_trend", [])],
                "target": [item["secondary"] for item in cached_metrics.get("revenue_trend", [])],
            },
            "pipeline": {
                "stage_breakdown": cached_metrics.get("pipeline_funnel", []),
            },
            "summary": {
                "prospect_count": cached_metrics.get("total_leads", 0),
                "this_month": 0,
                "last_month": 0,
                "total_active_prospect_value": 0,
                "contact_count": 0,
                "pipeline_value": 0,
            },
            "overview": {},
            "spotlight": {},
            "meta": {"currency": "INR", "message": "Reused from dashboard metrics cache."},
        },
        "analytics": {
            "kpis": {
                "total_deals": 0,
                "won_deals": cached_metrics.get("won_deals", 0),
                "lost_deals": cached_metrics.get("lost_deals", 0),
                "active_deals": cached_metrics.get("active_deals", 0),
                "win_rate": 0,
                "loss_rate": 0,
                "average_deal_size": 0,
                "average_sales_cycle": 0,
                "stage_conversion": cached_metrics.get("conversion_trend", []),
            },
            "revenue": {},
            "leaderboards": [],
            "analytics": {},
            "pipeline": {},
        },
        "pipeline": {
            "stage_breakdown": cached_metrics.get("pipeline_funnel", []),
        },
        "navigation": workspace_manifest["navigation"],
        "feature_flags": workspace_manifest["feature_flags"],
        "permissions": workspace_manifest["permissions"],
        "capabilities": workspace_manifest["capabilities"],
    }


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
    # One canonical canvas load (or Redis hit) feeds both summary contracts,
    # instead of two independent full-document scans.
    sales_summary, sales_analytics = await build_sales_summary_pair(current_user)
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
