"""
CRM dashboard aggregation and workspace metadata.

This module intentionally reuses the existing Sales models so the CRM surface
can evolve without duplicating business logic or changing the current domain
model. Both /sales/dashboard and /crm/dashboard consume the same sales summary
builder.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List

from app.models.sales_product import SalesProduct
from app.models.sales_prospect import SalesProspect, ProspectStatus
from app.models.sales_contact import SalesContact
from app.models.user import User, UserRole


def _get_last_12_month_labels(reference: datetime) -> List[str]:
    labels: List[str] = []
    for i in range(11, -1, -1):
        month_dt = reference.replace(day=1)
        year = month_dt.year
        month = month_dt.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_dt = month_dt.replace(year=year, month=month)
        labels.append(month_dt.strftime("%b-%y"))
    return labels


def _build_month_ranges(reference: datetime) -> List[Dict[str, datetime]]:
    month_ranges: List[Dict[str, datetime]] = []
    for label in _get_last_12_month_labels(reference):
        month_start = datetime.strptime(label, "%b-%y").replace(day=1)
        if month_start.month == 12:
            next_month = month_start.replace(year=month_start.year + 1, month=1, day=1)
        else:
            next_month = month_start.replace(month=month_start.month + 1, day=1)
        month_ranges.append({"start": month_start, "end": next_month})
    return month_ranges


def _prospect_product_value(prospect: SalesProspect, product_map: Dict[str, SalesProduct]) -> float:
    if not prospect.product_ids:
        return 0.0

    total = 0.0
    for product_id in prospect.product_ids:
        product = product_map.get(product_id)
        if product and product.rate:
            total += float(product.rate)
    return total


def _pipeline_breakdown(prospects: List[SalesProspect], product_map: Dict[str, SalesProduct]) -> List[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for prospect in prospects:
        stage = prospect.current_stage or "Unstaged"
        bucket = grouped.setdefault(
            stage,
            {"stage": stage, "count": 0, "value": 0.0},
        )
        bucket["count"] += 1
        bucket["value"] += _prospect_product_value(prospect, product_map)

    return sorted(grouped.values(), key=lambda item: (-item["count"], item["stage"].lower()))


async def build_sales_dashboard_summary(current_user: User) -> Dict[str, Any]:
    now = datetime.utcnow()
    month_labels = _get_last_12_month_labels(now)
    month_ranges = _build_month_ranges(now)

    prospects = await SalesProspect.find(
        {
            "company_id": current_user.company_id,
            "deleted": False,
        }
    ).to_list()
    contact_count = await SalesContact.find(
        {
            "company_id": current_user.company_id,
            "deleted": False,
        }
    ).count()
    products = await SalesProduct.find(
        {
            "company_id": current_user.company_id,
            "deleted": False,
        }
    ).to_list()
    product_map = {str(product.id): product for product in products}

    closed_amounts = [0.0 for _ in month_labels]
    target_amounts = [0.0 for _ in month_labels]

    for prospect in prospects:
        if prospect.status == ProspectStatus.WON and prospect.closed_date is not None:
            won_amount = float(prospect.won_amount) if prospect.won_amount is not None else 0.0
            for index, month_range in enumerate(month_ranges):
                if month_range["start"] <= prospect.closed_date < month_range["end"]:
                    closed_amounts[index] += won_amount
                    break

        if prospect.created_at is not None:
            prospect_value = _prospect_product_value(prospect, product_map)
            for index, month_range in enumerate(month_ranges):
                if month_range["start"] <= prospect.created_at < month_range["end"]:
                    target_amounts[index] += prospect_value
                    break

    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if this_month_start.month == 1:
        last_month_start = this_month_start.replace(year=this_month_start.year - 1, month=12)
    else:
        last_month_start = this_month_start.replace(month=this_month_start.month - 1)
    last_month_end = this_month_start

    def _in_range(dt: datetime, start: datetime, end: datetime) -> bool:
        return start <= dt < end

    this_month_closed = 0.0
    last_month_closed = 0.0
    total_active_value = 0.0

    for prospect in prospects:
        if prospect.status == ProspectStatus.WON and prospect.closed_date is not None:
            won_amount = float(prospect.won_amount) if prospect.won_amount is not None else 0.0
            if _in_range(prospect.closed_date, this_month_start, now):
                this_month_closed += won_amount
            if _in_range(prospect.closed_date, last_month_start, last_month_end):
                last_month_closed += won_amount
        if prospect.status == ProspectStatus.ACTIVE:
            total_active_value += _prospect_product_value(prospect, product_map)

    fastest_days = None
    fastest_name = None
    highest_amount = 0.0
    highest_amount_name = None
    owner_counts: Dict[str, int] = defaultdict(int)

    for prospect in prospects:
        if prospect.status == ProspectStatus.WON and prospect.closed_date is not None:
            if prospect.created_at and prospect.closed_date:
                days = (prospect.closed_date - prospect.created_at).days
                if fastest_days is None or days < fastest_days:
                    fastest_days = days
                    fastest_name = prospect.prospect_name

            won_amount = float(prospect.won_amount) if prospect.won_amount is not None else 0.0
            if won_amount > highest_amount:
                highest_amount = won_amount
                highest_amount_name = prospect.prospect_name

        if prospect.assigned_to:
            owner_counts[prospect.assigned_to] += 1

    max_count = None
    max_owner = None
    if owner_counts:
        max_owner_id, max_count_val = max(owner_counts.items(), key=lambda item: item[1])
        max_count = max_count_val
        try:
            owner = await User.get(max_owner_id)
            if owner:
                max_owner = f"{owner.first_name} {owner.last_name}".strip()
            else:
                max_owner = max_owner_id
        except Exception:
            max_owner = max_owner_id

    return {
        "sales_breakup": [],
        "closed_vs_target": {
            "months": month_labels,
            "target": target_amounts,
            "closed": closed_amounts,
        },
        "summary": {
            "this_month": this_month_closed,
            "last_month": last_month_closed,
            "total_active_prospect_value": total_active_value,
            "contact_count": contact_count,
            "prospect_count": len(prospects),
            "pipeline_value": total_active_value,
        },
        "pipeline": {
            "stage_breakdown": _pipeline_breakdown(prospects, product_map),
        },
        "spotlight": {
            "fastest_prospect_closed_days": fastest_days,
            "fastest_prospect_name": fastest_name,
            "highest_amount": highest_amount,
            "highest_amount_name": highest_amount_name,
            "max_prospects_count": max_count,
            "max_prospects_owner": max_owner,
        },
        "meta": {
            "currency": "INR",
            "message": "Live data based on prospects for your company.",
        },
    }


def build_crm_workspace_config(current_user: User) -> Dict[str, Any]:
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    return {
        "key": "crm",
        "label": "CRM",
        "description": "Workspace foundation for agency relationships.",
        "permissions": {
            "can_view": True,
            "can_manage_settings": is_admin,
            "can_use_future_modules": is_admin,
        },
        "feature_flags": {
            "dashboard": True,
            "pipeline": False,
            "leads": False,
            "companies": False,
            "contacts": False,
            "activities": False,
            "calendar": False,
            "reports": False,
            "settings": True,
        },
        "navigation": [
            {"key": "dashboard", "label": "Dashboard", "path": "/crm/dashboard", "status": "active"},
            {"key": "pipeline", "label": "Pipeline", "path": "/crm/pipeline", "status": "planned"},
            {"key": "leads", "label": "Leads", "path": "/crm/leads", "status": "planned"},
            {"key": "companies", "label": "Companies", "path": "/crm/companies", "status": "planned"},
            {"key": "contacts", "label": "Contacts", "path": "/crm/contacts", "status": "planned"},
            {"key": "activities", "label": "Activities", "path": "/crm/activities", "status": "planned"},
            {"key": "calendar", "label": "Calendar", "path": "/crm/calendar", "status": "planned"},
            {"key": "reports", "label": "Reports", "path": "/crm/reports", "status": "planned"},
            {"key": "settings", "label": "Settings", "path": "/crm/settings", "status": "planned"},
        ],
    }


async def build_crm_dashboard_payload(current_user: User) -> Dict[str, Any]:
    sales_summary = await build_sales_dashboard_summary(current_user)
    workspace = build_crm_workspace_config(current_user)
    return {
        "workspace": workspace,
        "sales": sales_summary,
        "pipeline": sales_summary["pipeline"],
        "feature_flags": workspace["feature_flags"],
        "navigation": workspace["navigation"],
    }
