"""
Sales Tracker module - dashboard and helper endpoints.
"""
from datetime import datetime, timedelta
from typing import Dict, List

from fastapi import APIRouter, Depends

from app.api.dependencies import require_module, get_current_user
from app.models.user import User
from app.models.sales_prospect import SalesProspect, ProspectStatus
from app.models.sales_product import SalesProduct

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

def _get_last_12_month_labels(reference: datetime) -> List[str]:
    """
    Return month labels like 'Feb-25' for the last 12 months ending
    at the reference month (inclusive).
    """
    labels: List[str] = []
    for i in range(11, -1, -1):
        month_dt = (reference.replace(day=1) - timedelta(days=1)).replace(day=1)
        # Walk back i additional months from the start of the current month
        month_dt = reference.replace(day=1)
        # Move back i months
        year = month_dt.year
        month = month_dt.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_dt = month_dt.replace(year=year, month=month)
        labels.append(month_dt.strftime("%b-%y"))
    return labels


@router.get("/dashboard")
async def sales_dashboard(current_user: User = Depends(get_current_user)):
    """
    Sales dashboard summary backed by real SalesProspect data.

    - closed_vs_target: last 12 months of closed vs target (INR)
    - summary: this month, last month, total active prospect value
    - spotlight: fastest closed, highest amount, maximum prospects owner
    """
    now = datetime.utcnow()

    # Build month buckets for last 12 months
    month_labels = _get_last_12_month_labels(now)
    month_ranges: List[Dict[str, datetime]] = []
    for label in month_labels:
        month_start = datetime.strptime(label, "%b-%y").replace(day=1)
        # Compute start of next month
        if month_start.month == 12:
            next_month = month_start.replace(year=month_start.year + 1, month=1, day=1)
        else:
            next_month = month_start.replace(month=month_start.month + 1, day=1)
        month_ranges.append({"start": month_start, "end": next_month})

    # Load all prospects and products for this company
    prospects = await SalesProspect.find(
        SalesProspect.company_id == current_user.company_id,
        SalesProspect.deleted == False,  # noqa: E712
    ).to_list()
    
    products = await SalesProduct.find(
        SalesProduct.company_id == current_user.company_id,
        SalesProduct.deleted == False,  # noqa: E712
    ).to_list()
    
    # Create product lookup map
    product_map = {str(p.id): p for p in products}

    # Prepare closed vs target arrays
    closed_amounts = [0.0 for _ in month_labels]
    target_amounts = [0.0 for _ in month_labels]

    def _prospect_product_value(p: SalesProspect) -> float:
        """
        Calculate prospect value from product rates when prospect was created.
        Sum of all product rates.
        """
        if not p.product_ids:
            return 0.0
        total = 0.0
        for prod_id in p.product_ids:
            product = product_map.get(prod_id)
            if product and product.rate:
                total += float(product.rate)
        return total

    for p in prospects:
        # Closed business - based on closed_date and won_amount
        if p.status == ProspectStatus.WON and p.closed_date is not None:
            won_amount = float(p.won_amount) if p.won_amount is not None else 0.0
            for idx, rng in enumerate(month_ranges):
                if rng["start"] <= p.closed_date < rng["end"]:
                    closed_amounts[idx] += won_amount
                    break

        # Target business - based on created_at month (when prospect was created)
        # Target = sum of product prices at creation time
        if p.created_at is not None:
            prospect_value = _prospect_product_value(p)
            for idx, rng in enumerate(month_ranges):
                if rng["start"] <= p.created_at < rng["end"]:
                    target_amounts[idx] += prospect_value
                    break

    # Summary metrics
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

    for p in prospects:
        # Closed amounts - use won_amount
        if p.status == ProspectStatus.WON and p.closed_date is not None:
            won_amount = float(p.won_amount) if p.won_amount is not None else 0.0
            if _in_range(p.closed_date, this_month_start, now):
                this_month_closed += won_amount
            if _in_range(p.closed_date, last_month_start, last_month_end):
                last_month_closed += won_amount
        # Active prospect value - use product rates
        if p.status == ProspectStatus.ACTIVE:
            total_active_value += _prospect_product_value(p)

    # Spotlight metrics
    fastest_days = None
    fastest_name = None
    highest_amount = 0.0
    highest_amount_name = None
    owner_counts: Dict[str, int] = {}

    for p in prospects:
        if p.status == ProspectStatus.WON and p.closed_date is not None:
            # Fastest closed
            if p.created_at and p.closed_date:
                days = (p.closed_date - p.created_at).days
                if fastest_days is None or days < fastest_days:
                    fastest_days = days
                    fastest_name = p.prospect_name

            # Highest amount - use won_amount
            won_amount = float(p.won_amount) if p.won_amount is not None else 0.0
            if won_amount > highest_amount:
                highest_amount = won_amount
                highest_amount_name = p.prospect_name

        # Maximum prospects (by assigned_to)
        if p.assigned_to:
            owner_counts[p.assigned_to] = owner_counts.get(p.assigned_to, 0) + 1

    max_count = None
    max_owner = None
    if owner_counts:
        max_owner_id, max_count_val = max(owner_counts.items(), key=lambda kv: kv[1])
        max_count = max_count_val
        # Get user name
        try:
            user = await User.get(max_owner_id)
            if user:
                max_owner = f"{user.first_name} {user.last_name}".strip()
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

