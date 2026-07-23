"""
Super Admin - Usage Monitoring & Analytics
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

try:
    from bson import ObjectId
except ImportError:
    ObjectId = type(None)

from beanie.operators import In
from app.models.usage_tracking import UsageTracking
from app.models.company_subscription import CompanySubscription, CompanySubscriptionStatus
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.models.company import Company
from app.models.task import Task
from app.models.project import Project
from app.models.ticket import Ticket
from app.api.dependencies import get_current_super_admin
from app.core.clock import utc_now

router = APIRouter()


def _to_jsonable(obj):
    """Convert Beanie/Pydantic model to JSON-serializable dict."""
    if obj is None:
        return None
    d = obj.model_dump() if hasattr(obj, "model_dump") else obj.dict()
    if hasattr(obj, "id") and obj.id is not None:
        d["id"] = str(obj.id)
    for k in list(d.keys()):
        v = d[k]
        if v is None:
            continue
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif hasattr(v, "value") and not isinstance(v, (list, dict)):
            d[k] = v.value
        elif ObjectId is not type(None) and isinstance(v, ObjectId):
            d[k] = str(v)
    return d


@router.get("/all-companies-summary", response_model=List[dict])
async def all_companies_usage_summary(current_user: User = Depends(get_current_super_admin)):
    companies = await Company.find_all().to_list()
    result = []
    for company in companies:
        company_id = str(company.id)
        subscription = await CompanySubscription.find_one(CompanySubscription.company_id == company_id)
        plan = await SubscriptionPlan.get(subscription.plan_id) if subscription and subscription.plan_id else None
        total_users = await User.find(User.company_id == company_id).count()
        project_count = await Project.find(Project.company_id == company_id).count()
        result.append({
            "company_id": company_id,
            "company_name": company.name,
            "status": company.status.value if hasattr(company.status, "value") else company.status,
            "total_users": total_users,
            "project_count": project_count,
            "plan": plan.name if plan else "-",
            "max_users": company.max_users,
            "max_storage_gb": company.max_storage_gb,
        })
    return result


@router.get("/company/{company_id}/detailed", response_model=dict)
async def get_company_detailed_usage(
    company_id: str,
    current_user: User = Depends(get_current_super_admin),
):
    now = utc_now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    total_users = await User.find(User.company_id == company_id).count()
    active_users = await User.find(User.company_id == company_id, User.status == "active").count()
    monthly_usage = await UsageTracking.find(
        UsageTracking.company_id == company_id,
        UsageTracking.created_at >= month_start,
    ).to_list()
    project_count = await Project.find(Project.company_id == company_id).count()
    task_count = await Task.find(Task.company_id == company_id).count()
    return {
        "company_id": company_id,
        "total_users": total_users,
        "active_users": active_users,
        "api_requests_this_month": len(monthly_usage),
        "storage_used_mb": round(sum(getattr(item, "storage_used_gb", 0) or 0 for item in monthly_usage) * 1024, 2),
        "project_count": project_count,
        "task_count": task_count,
        "last_updated": now.isoformat(),
    }


@router.get("/company/{company_id}", response_model=dict)
async def get_company_usage(
    company_id: str,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    current_user: User = Depends(get_current_super_admin)
):
    """Get usage statistics for a specific company"""
    if not month:
        month = utc_now().month
    if not year:
        year = utc_now().year
    
    # Get current usage
    usage = await UsageTracking.find_one(
        UsageTracking.company_id == company_id,
        UsageTracking.period_month == month,
        UsageTracking.period_year == year
    )
    
    # Get subscription and plan
    subscription = await CompanySubscription.find_one(
        CompanySubscription.company_id == company_id
    )
    
    plan = None
    limits = {}
    if subscription:
        plan = await SubscriptionPlan.get(subscription.plan_id)
        if plan:
            limits = {
                "max_users": plan.max_users,
                "max_managers": plan.max_managers,
                "max_leads": plan.max_leads,
                "max_employees": plan.max_employees,
                "max_tasks": plan.max_tasks,
                "max_projects": plan.max_projects,
                "max_tickets": plan.max_tickets,
                "max_storage_gb": plan.max_storage_gb,
                "max_api_requests_per_month": plan.max_api_requests_per_month,
            }
    
    if usage:
        usage_data = _to_jsonable(usage)
    else:
        # Real-time from DB when no UsageTracking record
        total_users = await User.find(User.company_id == company_id).count()
        total_tasks = await Task.find(Task.company_id == company_id).count()
        total_projects = await Project.find(Project.company_id == company_id).count()
        total_tickets = await Ticket.find(Ticket.company_id == company_id).count()
        usage_data = {
            "total_users": total_users,
            "total_managers": 0,
            "total_leads": 0,
            "total_employees": 0,
            "total_tasks": total_tasks,
            "total_projects": total_projects,
            "total_tickets": total_tickets,
            "storage_used_gb": 0.0,
            "api_requests_count": 0,
        }
    
    # Calculate usage percentages
    usage_percentages = {}
    for key, limit in limits.items():
        if limit is not None:
            usage_key = key.replace("max_", "total_")
            if key == "max_api_requests_per_month":
                usage_key = "api_requests_count"
            current = usage_data.get(usage_key, 0)
            percentage = (current / limit * 100) if limit > 0 else 0
            usage_percentages[key] = {
                "current": current,
                "limit": limit,
                "percentage": min(percentage, 100),
                "warning": percentage >= 80,
                "exceeded": percentage >= 100
            }
    
    return {
        "company_id": company_id,
        "period": {"month": month, "year": year},
        "usage": usage_data,
        "limits": limits,
        "usage_analysis": usage_percentages,
        "subscription": _to_jsonable(subscription) if subscription else None,
        "plan": _to_jsonable(plan) if plan else None
    }


@router.get("/analytics", response_model=dict)
async def get_usage_analytics(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    current_user: User = Depends(get_current_super_admin)
):
    """Get usage analytics across all companies (real-time from DB when UsageTracking missing)."""
    current_month = utc_now().month
    current_year = utc_now().year

    # Get all active subscriptions (Beanie In operator)
    try:
        subscriptions = await CompanySubscription.find(
            In(
                CompanySubscription.status,
                [
                    CompanySubscriptionStatus.ACTIVE,
                    CompanySubscriptionStatus.TRIAL,
                    CompanySubscriptionStatus.GRACE_PERIOD,
                ],
            )
        ).skip(skip).limit(limit).to_list()
    except Exception:
        subscriptions = []

    analytics = {
        "total_companies": len(subscriptions),
        "companies_exceeding_limits": [],
        "companies_near_limits": [],
        "summary": {
            "total_users": 0,
            "total_tasks": 0,
            "total_projects": 0,
            "total_storage_gb": 0.0,
        },
    }

    for subscription in subscriptions:
        try:
            company_id = str(subscription.company_id) if subscription.company_id else None
            if not company_id:
                continue

            usage = await UsageTracking.find_one(
                UsageTracking.company_id == company_id,
                UsageTracking.period_month == current_month,
                UsageTracking.period_year == current_year,
            )

            # Real-time fallback: if no UsageTracking, compute from DB
            if usage:
                total_users = getattr(usage, "total_users", None) or 0
                total_tasks = getattr(usage, "total_tasks", None) or 0
                total_projects = getattr(usage, "total_projects", None) or 0
                total_tickets = getattr(usage, "total_tickets", None) or 0
                storage_used_gb = getattr(usage, "storage_used_gb", None) or 0.0
            else:
                total_users = await User.find(User.company_id == company_id).count()
                total_tasks = await Task.find(Task.company_id == company_id).count()
                total_projects = await Project.find(Project.company_id == company_id).count()
                total_tickets = await Ticket.find(Ticket.company_id == company_id).count()
                storage_used_gb = 0.0

            plan_id = str(subscription.plan_id) if subscription.plan_id else None
            if not plan_id:
                continue
            plan = await SubscriptionPlan.get(plan_id)
            if not plan or getattr(plan, "deleted", False):
                continue

            exceeded = []
            near_limit = []

            max_users = getattr(plan, "max_users", None)
            if max_users is not None and total_users >= max_users:
                exceeded.append("users")
            elif max_users is not None and max_users > 0 and total_users >= max_users * 0.8:
                near_limit.append("users")

            max_tasks = getattr(plan, "max_tasks", None)
            if max_tasks is not None and total_tasks >= max_tasks:
                exceeded.append("tasks")
            elif max_tasks is not None and max_tasks > 0 and total_tasks >= max_tasks * 0.8:
                near_limit.append("tasks")

            max_projects = getattr(plan, "max_projects", None)
            if max_projects is not None and total_projects >= max_projects:
                exceeded.append("projects")
            elif max_projects is not None and max_projects > 0 and total_projects >= max_projects * 0.8:
                near_limit.append("projects")

            max_tickets = getattr(plan, "max_tickets", None)
            if max_tickets is not None and total_tickets >= max_tickets:
                exceeded.append("tickets")
            elif max_tickets is not None and max_tickets > 0 and total_tickets >= max_tickets * 0.8:
                near_limit.append("tickets")

            if exceeded:
                analytics["companies_exceeding_limits"].append(
                    {"company_id": company_id, "exceeded_limits": exceeded}
                )
            if near_limit:
                analytics["companies_near_limits"].append(
                    {"company_id": company_id, "near_limits": near_limit}
                )

            analytics["summary"]["total_users"] += total_users
            analytics["summary"]["total_tasks"] += total_tasks
            analytics["summary"]["total_projects"] += total_projects
            analytics["summary"]["total_storage_gb"] += float(storage_used_gb)
        except Exception:
            continue

    return analytics




