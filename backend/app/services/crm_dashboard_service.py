"""
CRM dashboard aggregation and workspace metadata.

This module intentionally reuses the existing Sales models so the CRM surface
can evolve without duplicating business logic or changing the current domain
model. Both /sales/dashboard and /crm/dashboard consume the same sales summary
builder.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List

from bson import ObjectId

from app.models.crm_deal import CRMDeal
from app.models.crm_proposal import CRMProposal
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


def _safe_amount(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _proposal_amount(proposal: CRMProposal) -> float:
    return _safe_amount(getattr(proposal, "deal_value", 0))


def _deal_amount(deal: CRMDeal) -> float:
    return _safe_amount(getattr(deal, "value", 0))


def _user_label(user: User, fallback: str = "") -> str:
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or fallback or str(getattr(user, "id", ""))


def _valid_object_ids(values: List[str]) -> List[ObjectId]:
    return [ObjectId(value) for value in values if ObjectId.is_valid(str(value))]


def _stage_weight(stage: str) -> float:
    normalized = str(stage or "").strip().lower()
    if normalized in {"won", "closed-won", "closed won"}:
        return 1.0
    if normalized in {"proposal sent", "negotiation"}:
        return 0.75
    if normalized in {"qualified"}:
        return 0.5
    if normalized in {"contacted", "discovery scheduled", "discovery completed"}:
        return 0.25
    return 0.15


async def build_sales_analytics_summary(current_user: User) -> Dict[str, Any]:
    now = datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    quarter_start_month = ((now.month - 1) // 3) * 3 + 1
    quarter_start = now.replace(month=quarter_start_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    prospects = await SalesProspect.find({"company_id": current_user.company_id, "deleted": False}).to_list()
    deals = await CRMDeal.find({"company_id": current_user.company_id, "archived": False}).to_list()
    proposals = await CRMProposal.find({"company_id": current_user.company_id, "archived": False}).sort("-updated_at").to_list()

    won_revenue = sum(_safe_amount(p.won_amount) for p in prospects if p.status == ProspectStatus.WON)
    lost_revenue = sum(_safe_amount(p.won_amount) for p in prospects if p.status == ProspectStatus.LOST)
    total_revenue = won_revenue
    monthly_revenue = sum(_safe_amount(p.won_amount) for p in prospects if p.status == ProspectStatus.WON and p.closed_date and p.closed_date >= month_start)
    quarterly_revenue = sum(_safe_amount(p.won_amount) for p in prospects if p.status == ProspectStatus.WON and p.closed_date and p.closed_date >= quarter_start)
    yearly_revenue = sum(_safe_amount(p.won_amount) for p in prospects if p.status == ProspectStatus.WON and p.closed_date and p.closed_date >= year_start)

    forecast_revenue = sum(_proposal_amount(p) for p in proposals if p.status in {"sent", "viewed"})
    weighted_pipeline_value = sum(_deal_amount(deal) * _stage_weight(deal.stage) for deal in deals)
    pipeline_value = sum(_deal_amount(deal) for deal in deals)

    active_deals = [deal for deal in deals if str(deal.stage).lower() not in {"won", "lost"}]
    won_deals = [deal for deal in deals if str(deal.stage).lower() == "won"]
    lost_deals = [deal for deal in deals if str(deal.stage).lower() == "lost"]

    average_deal_size = round((sum(_deal_amount(deal) for deal in deals) / len(deals)), 2) if deals else 0.0
    average_sales_cycle = 0.0
    cycle_days = [
        (p.closed_date - p.created_at).days
        for p in prospects
        if p.status == ProspectStatus.WON and p.closed_date and p.created_at
    ]
    if cycle_days:
        average_sales_cycle = round(sum(cycle_days) / len(cycle_days), 2)

    stage_counts: Dict[str, int] = defaultdict(int)
    stage_values: Dict[str, float] = defaultdict(float)
    for deal in deals:
        stage_counts[deal.stage] += 1
        stage_values[deal.stage] += _deal_amount(deal)

    stage_conversion = []
    ordered_stages = ["Lead", "Contacted", "Discovery Scheduled", "Discovery Completed", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"]
    for index, stage in enumerate(ordered_stages[:-1]):
        next_stage = ordered_stages[index + 1]
        current_count = stage_counts.get(stage, 0)
        next_count = stage_counts.get(next_stage, 0)
        conversion = round((next_count / current_count) * 100, 2) if current_count else 0.0
        stage_conversion.append({"from": stage, "to": next_stage, "conversion_percent": conversion})

    owner_counts: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"revenue": 0.0, "won_deals": 0, "total_deals": 0, "deal_value_sum": 0.0})
    for prospect in prospects:
        owner = str(prospect.assigned_to or prospect.created_by or "unassigned")
        bucket = owner_counts[owner]
        bucket["total_deals"] += 1
        if prospect.status == ProspectStatus.WON:
            bucket["won_deals"] += 1
            bucket["revenue"] += _safe_amount(prospect.won_amount)
        bucket["deal_value_sum"] += _safe_amount(prospect.won_amount)

    owner_map = {}
    owner_ids = [owner_id for owner_id in owner_counts.keys() if owner_id and owner_id != "unassigned"]
    if owner_ids:
        owner_object_ids = _valid_object_ids(owner_ids)
        owner_query_ids = owner_object_ids or owner_ids
        owners = await User.find({"_id": {"$in": owner_query_ids}, "company_id": current_user.company_id}).to_list()
        owner_map = {str(owner.id): _user_label(owner, str(owner.id)) for owner in owners}

    leaderboard = sorted(
        [
            {
                "salesperson": owner_map.get(owner_id, owner_id),
                "revenue": round(bucket["revenue"], 2),
                "deals_closed": bucket["won_deals"],
                "win_rate": round((bucket["won_deals"] / bucket["total_deals"]) * 100, 2) if bucket["total_deals"] else 0.0,
                "average_deal_value": round((bucket["deal_value_sum"] / bucket["total_deals"]), 2) if bucket["total_deals"] else 0.0,
            }
            for owner_id, bucket in owner_counts.items()
        ],
        key=lambda row: (-row["revenue"], row["salesperson"].lower()),
    )

    company_revenue: Dict[str, float] = defaultdict(float)
    industry_revenue: Dict[str, float] = defaultdict(float)
    source_revenue: Dict[str, float] = defaultdict(float)
    service_revenue: Dict[str, float] = defaultdict(float)
    company_map: Dict[str, str] = {}
    if prospects:
        company_ids = list({str(p.crm_company_id) for p in prospects if getattr(p, "crm_company_id", None)})
        if company_ids:
            companies = await SalesContact.find({"crm_company_id": {"$in": company_ids}, "company_id": current_user.company_id}).to_list()
            for company_id in company_ids:
                linked = next((c for c in companies if str(c.crm_company_id) == company_id), None)
                if linked:
                    company_map[company_id] = linked.company_name or company_id
    for prospect in prospects:
        amount = _safe_amount(prospect.won_amount)
        if prospect.status == ProspectStatus.WON:
            if prospect.crm_company_id:
                company_revenue[company_map.get(str(prospect.crm_company_id), prospect.company_name or str(prospect.crm_company_id))] += amount
            if prospect.channel:
                source_revenue[prospect.channel] += amount
            if prospect.category_id:
                service_revenue[str(prospect.category_id)] += amount
            if prospect.company_name:
                industry_revenue[prospect.company_name] += amount

    aging_deals = []
    stuck_deals = 0
    for deal in deals:
        age_days = (now - deal.updated_at).days if deal.updated_at else 0
        if age_days >= 14:
            stuck_deals += 1
        aging_deals.append({"deal_id": str(deal.id), "lead_id": deal.lead_id, "stage": deal.stage, "age_days": age_days, "value": _deal_amount(deal)})

    return {
        "revenue": {
            "total_revenue": total_revenue,
            "monthly_revenue": monthly_revenue,
            "quarterly_revenue": quarterly_revenue,
            "yearly_revenue": yearly_revenue,
            "won_revenue": won_revenue,
            "lost_revenue": lost_revenue,
            "forecast_revenue": forecast_revenue,
            "weighted_pipeline_value": weighted_pipeline_value,
        },
        "kpis": {
            "total_deals": len(deals),
            "won_deals": len(won_deals),
            "lost_deals": len(lost_deals),
            "active_deals": len(active_deals),
            "win_rate": round((len(won_deals) / len(deals)) * 100, 2) if deals else 0.0,
            "loss_rate": round((len(lost_deals) / len(deals)) * 100, 2) if deals else 0.0,
            "average_deal_size": average_deal_size,
            "average_sales_cycle": average_sales_cycle,
            "stage_conversion": stage_conversion,
        },
        "leaderboards": leaderboard,
        "analytics": {
            "revenue_by_client": [{"client": key, "revenue": round(value, 2)} for key, value in sorted(company_revenue.items(), key=lambda item: -item[1])],
            "revenue_by_service": [{"service": key, "revenue": round(value, 2)} for key, value in sorted(service_revenue.items(), key=lambda item: -item[1])],
            "revenue_by_lead_source": [{"source": key, "revenue": round(value, 2)} for key, value in sorted(source_revenue.items(), key=lambda item: -item[1])],
            "revenue_by_industry": [{"industry": key, "revenue": round(value, 2)} for key, value in sorted(industry_revenue.items(), key=lambda item: -item[1])],
        },
        "pipeline": {
            "pipeline_value": pipeline_value,
            "deals_by_stage": [{"stage": stage, "count": count, "value": round(stage_values.get(stage, 0.0), 2)} for stage, count in stage_counts.items()],
            "stuck_deals": stuck_deals,
            "aging_deals": sorted(aging_deals, key=lambda item: (-item["age_days"], -item["value"])),
            "expected_close_this_month": len([deal for deal in deals if deal.expected_close_date and deal.expected_close_date.month == now.month and deal.expected_close_date.year == now.year]),
        },
    }


async def build_sales_dashboard_summary(current_user: User) -> Dict[str, Any]:
    now = datetime.now()
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
            "message": "Live data based on leads for your company.",
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
            "leads": True,
            "companies": True,
            "contacts": True,
            "activities": False,
            "calendar": False,
            "reports": False,
            "settings": True,
        },
        "navigation": [
            {"key": "dashboard", "label": "Dashboard", "path": "/crm/dashboard", "status": "active"},
            {"key": "pipeline", "label": "Pipeline", "path": "/crm/pipeline", "status": "planned"},
            {"key": "leads", "label": "Leads", "path": "/crm/leads", "status": "active"},
            {"key": "companies", "label": "Companies", "path": "/crm/companies", "status": "active"},
            {"key": "contacts", "label": "Contacts", "path": "/crm/contacts", "status": "active"},
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

