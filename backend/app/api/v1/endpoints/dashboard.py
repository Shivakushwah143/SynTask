"""
Dashboard & Analytics Endpoints
"""
from datetime import datetime, timedelta

import asyncio
from fastapi import APIRouter, Depends, Query
from app.core.config import settings
from app.models.user import User, UserRole
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.ticket import Ticket
from app.models.project import Project, ProjectStatus
from app.models.meeting import Meeting
from app.models.notification import Notification
from app.models.company import Company, Subscription
from app.models.sales_prospect import SalesProspect
from app.api.dependencies import get_current_user, get_current_super_admin
from app.core.cache import cache_get, cache_set, dashboard_cache_key, dashboard_metrics_cache_key, company_dashboard_pattern
from app.services.crm_dashboard_service import build_sales_analytics_summary, build_sales_dashboard_summary
from app.services.dashboard_service import build_manager_dashboard_metrics
from app.core.clock import utc_now

router = APIRouter()


def _normalize_stage(value: str) -> str:
    return str(value or "").strip().lower().replace("-", " ").replace("_", " ")


def _safe_number(value) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _month_start(reference: datetime) -> datetime:
    return reference.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _next_month(reference: datetime) -> datetime:
    start = _month_start(reference)
    if start.month == 12:
        return start.replace(year=start.year + 1, month=1)
    return start.replace(month=start.month + 1)


def _build_revenue_trend(sales_summary: dict) -> list[dict]:
    trend = sales_summary.get("closed_vs_target", {}) if sales_summary else {}
    months = trend.get("months") or []
    closed = trend.get("closed") or []
    target = trend.get("target") or []
    return [
        {
            "label": label,
            "primary": round(_safe_number(closed[index] if index < len(closed) else 0), 2),
            "secondary": round(_safe_number(target[index] if index < len(target) else 0), 2),
        }
        for index, label in enumerate(months)
    ]


def _build_pipeline_funnel(sales_summary: dict, analytics: dict) -> list[dict]:
    summary = sales_summary.get("summary", {}) if sales_summary else {}
    kpis = analytics.get("kpis", {}) if analytics else {}
    stage_rows = sales_summary.get("pipeline", {}).get("stage_breakdown", []) if sales_summary else []
    qualified_count = sum(row.get("count", 0) for row in stage_rows if _normalize_stage(row.get("stage")) == "qualified")
    return [
        {"name": "Total Leads", "value": summary.get("prospect_count", 0), "route": "/crm/leads"},
        {"name": "Qualified", "value": qualified_count, "route": "/crm/pipeline"},
        {"name": "Active Deals", "value": kpis.get("active_deals", 0), "route": "/crm/pipeline"},
        {"name": "Won", "value": kpis.get("won_deals", 0), "route": "/crm/pipeline"},
        {"name": "Lost", "value": kpis.get("lost_deals", 0), "route": "/crm/pipeline"},
    ]


def _build_conversion_trend(analytics: dict) -> list[dict]:
    rows = analytics.get("kpis", {}).get("stage_conversion", []) if analytics else []
    return [
        {
            "name": f"{row.get('from')} to {row.get('to')}",
            "value": round(_safe_number(row.get("conversion_percent")), 2),
            "route": "/crm/pipeline",
        }
        for row in rows
        if row.get("from") and row.get("to")
    ]


async def _build_project_status_chart(base_query: dict) -> list[dict]:
    status_values = [item.value for item in ProjectStatus]
    counts = await asyncio.gather(*[
        Project.find({**base_query, "status": sv}).count()
        for sv in status_values
    ])
    row = {"name": "All Projects", "route": "/projects"}
    total = 0
    for sv, count in zip(status_values, counts):
        row[sv] = count
        total += count
    row["total"] = total
    return [row] if total else []


async def _build_due_priority_chart(base_query: dict, now: datetime) -> list[dict]:
    end = now + timedelta(days=7)
    priorities = [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW]
    counts = await asyncio.gather(*[
        Task.find({
            **base_query,
            "priority": p.value,
            "due_date": {"$gte": now, "$lt": end},
            "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
        }).count()
        for p in priorities
    ])
    rows = []
    for p, count in zip(priorities, counts):
        rows.append({
            "name": p.value.replace("_", " ").title(),
            "priorityKey": p.value,
            "count": count,
            "route": "/tasks",
        })
    return rows


async def _build_report_totals(base_query: dict, now: datetime) -> dict:
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    high_priority_query = {**base_query, "priority": {"$in": [TaskPriority.HIGH.value, TaskPriority.CRITICAL.value]}}
    due_today_query = {**base_query, "due_date": {"$gte": today_start, "$lt": today_end}}
    tasks, projects, meetings, high_priority, tasks_due_today = await asyncio.gather(
        Task.find(base_query).count(),
        Project.find(base_query).count(),
        Meeting.find(base_query).count(),
        Task.find(high_priority_query).count(),
        Task.find(due_today_query).count(),
    )
    return {
        "tasks": tasks,
        "projects": projects,
        "meetings": meetings,
        "high_priority": high_priority,
        "tasks_due_today": tasks_due_today,
    }


async def _build_company_dashboard_metrics(current_user: User) -> dict:
    now = utc_now()
    base_query = {"company_id": current_user.company_id} if current_user.company_id else {}
    # Parallelize heavy async calls
    sales_summary, sales_analytics, report_totals = await asyncio.gather(
        build_sales_dashboard_summary(current_user),
        build_sales_analytics_summary(current_user),
        _build_report_totals(base_query, now),
    )
    month_start = _month_start(now)
    next_month = _next_month(now)

    kpis = sales_analytics.get("kpis", {})
    revenue = sales_analytics.get("revenue", {})
    sales_summary_values = sales_summary.get("summary", {})

    # Parallelize remaining DB counts
    current_month_leads, upcoming_meetings_count, project_status_chart, task_due_priority_chart = await asyncio.gather(
        SalesProspect.find({
            **base_query,
            "deleted": False,
            "created_at": {"$gte": month_start, "$lt": next_month},
        }).count(),
        Meeting.find({**base_query, "meeting_date": {"$gte": now}}).count(),
        _build_project_status_chart(base_query),
        _build_due_priority_chart(base_query, now),
    )

    monthly_performance = [
        {"name": "Leads", "value": current_month_leads, "total": sales_summary_values.get("prospect_count", 0), "route": "/crm/leads"},
        {"name": "Deals", "value": kpis.get("active_deals", 0), "total": kpis.get("total_deals", 0), "route": "/crm/pipeline"},
        {"name": "Projects", "value": report_totals["projects"], "total": report_totals["projects"], "route": "/projects"},
        {"name": "Tasks", "value": report_totals["tasks"], "total": report_totals["tasks"], "route": "/tasks"},
    ]

    report_graph = [
        {"name": "Tasks", "value": report_totals["tasks"], "route": "/tasks"},
        {"name": "Projects", "value": report_totals["projects"], "route": "/projects"},
        {"name": "Meetings", "value": report_totals["meetings"], "route": "/meetings"},
        {"name": "High Priority", "value": report_totals["high_priority"], "route": "/tasks"},
    ]

    return {
        "total_leads": sales_summary_values.get("prospect_count", 0),
        "new_leads": current_month_leads,
        "qualified_leads": sum(row.get("count", 0) for row in sales_summary.get("pipeline", {}).get("stage_breakdown", []) if _normalize_stage(row.get("stage")) == "qualified"),
        "active_deals": kpis.get("active_deals", 0),
        "revenue": round(_safe_number(revenue.get("yearly_revenue")), 2),
        "won_deals": kpis.get("won_deals", 0),
        "lost_deals": kpis.get("lost_deals", 0),
        "projects": report_totals["projects"],
        "upcoming_meetings": upcoming_meetings_count,
        "tasks_due_today": report_totals["tasks_due_today"],
        "revenue_trend": _build_revenue_trend(sales_summary),
        "pipeline_funnel": _build_pipeline_funnel(sales_summary, sales_analytics),
        "conversion_trend": _build_conversion_trend(sales_analytics),
        "monthly_performance": monthly_performance,
        "report_totals": report_totals,
        "report_graph": report_graph,
        "project_status_chart": project_status_chart,
        "task_due_priority_chart": task_due_priority_chart,
    }


@router.get("/stats")
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    fresh: bool = Query(False)
):
    """Get dashboard statistics with hierarchical RBAC"""
    cache_key = dashboard_cache_key(str(current_user.id), current_user.role.value, current_user.company_id)
    cached = await cache_get(cache_key)
    if not fresh and cached:
        return cached

    if current_user.role == UserRole.SUPER_ADMIN:
        # Super Admin Dashboard
        total_companies = await Company.find().count()
        active_companies = await Company.find({"status": "active"}).count()
        pending_companies = await Company.find({"status": "pending"}).count()
        total_subscriptions = await Subscription.find().count()
        
        data = {
            "role": "super_admin",
            "total_companies": total_companies,
            "active_companies": active_companies,
            "pending_companies": pending_companies,
            "total_subscriptions": total_subscriptions,
        }
        await cache_set(cache_key, data, ttl=settings.DASHBOARD_CACHE_TTL)
        return data


@router.get("/metrics")
async def get_dashboard_metrics(
    current_user: User = Depends(get_current_user),
    fresh: bool = Query(False)
):
    cache_key = dashboard_metrics_cache_key(str(current_user.id), current_user.role.value, current_user.company_id)
    cached = await cache_get(cache_key)
    if not fresh and cached:
        return cached

    base_query = {"company_id": current_user.company_id} if current_user.company_id else {}
    role = current_user.role

    if role == UserRole.SUPER_ADMIN:
        data = {
            "total_companies": await Company.find().count(),
            "active_companies": await Company.find({"status": "active"}).count(),
            "pending_companies": await Company.find({"status": "pending"}).count(),
            "total_subscriptions": await Subscription.find().count(),
        }
        await cache_set(cache_key, data, ttl=settings.DASHBOARD_CACHE_TTL)
        return data

    if role == UserRole.ADMIN:
        data = await _build_company_dashboard_metrics(current_user)
        await cache_set(cache_key, data, ttl=settings.DASHBOARD_CACHE_TTL)
        return data

    if role == UserRole.MANAGER:
        manager_metrics = await build_manager_dashboard_metrics(current_user)
        data = {**await _build_company_dashboard_metrics(current_user), **manager_metrics}
        await cache_set(cache_key, data, ttl=settings.DASHBOARD_CACHE_TTL)
        return data

    if role == UserRole.LEAD:
        employees = await User.find({"reports_to": str(current_user.id), "role": UserRole.EMPLOYEE.value}).to_list()
        employee_ids = [str(emp.id) for emp in employees] + [str(current_user.id)]
        data = await _build_company_dashboard_metrics(current_user)
        data["tasks_due_today"] = await Task.find({"company_id": current_user.company_id, "assigned_to": {"$in": employee_ids}}).count()
        await cache_set(cache_key, data, ttl=settings.DASHBOARD_CACHE_TTL)
        return data

    company_metrics = await _build_company_dashboard_metrics(current_user) if current_user.company_id else {}
    data = {
        **company_metrics,
        "total_leads": 0,
        "new_leads": 0,
        "qualified_leads": 0,
        "active_deals": await Ticket.find({**base_query, "assigned_to": str(current_user.id)}).count(),
        "projects": await Project.find(base_query).count() if base_query else 0,
        "upcoming_meetings": await Meeting.find({**base_query, "meeting_date": {"$gte": utc_now()}}).count(),
        "tasks_due_today": await Task.find({**base_query, "assigned_to": str(current_user.id)}).count(),
    }
    await cache_set(cache_key, data, ttl=settings.DASHBOARD_CACHE_TTL)
    return data


@router.get("/recent")
async def get_dashboard_recent(current_user: User = Depends(get_current_user)):
    cache_key = f"dashboard:recent:{current_user.company_id}" if current_user.company_id else "dashboard:recent:platform"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    company_id = current_user.company_id
    task_query = {"company_id": company_id} if company_id else {}
    recent_tasks, recent_meetings, recent_projects = await asyncio.gather(
        Task.find(task_query).sort("-created_at").limit(5).to_list(),
        Meeting.find(task_query).sort("-created_at").limit(5).to_list(),
        Project.find(task_query).sort("-created_at").limit(5).to_list(),
    )
    data = {
        "tasks": [{"id": str(item.id), "title": item.title, "created_at": item.created_at} for item in recent_tasks],
        "meetings": [{"id": str(item.id), "title": item.title, "created_at": item.created_at} for item in recent_meetings],
        "projects": [{"id": str(item.id), "name": item.name, "created_at": item.created_at} for item in recent_projects],
    }
    await cache_set(cache_key, data, ttl=60)
    return data


@router.get("/activity")
async def get_dashboard_activity(current_user: User = Depends(get_current_user)):
    cache_key = f"dashboard:activity:{current_user.id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    company_id = current_user.company_id
    notifications = await Notification.find({
        "company_id": company_id,
        "user_id": str(current_user.id)}).sort("-created_at").limit(10).to_list()
    data = {"activity": [
        {"id": str(item.id), "title": item.title, "message": item.message, "created_at": item.created_at, "type": item.type.value}
        for item in notifications
    ]}
    await cache_set(cache_key, data, ttl=30)
    return data


@router.get("/super-admin/analytics")
async def get_super_admin_analytics(current_user: User = Depends(get_current_super_admin)):
    cache_key = "dashboard:super_admin:analytics"
    cached = await cache_get(cache_key)
    if cached:
        return cached
    statuses = ["pending", "active", "suspended", "cancelled"]
    plans = ["free", "basic", "professional", "enterprise"]
    roles = ["super_admin", "admin", "manager", "lead", "employee"]
    company_counts, plan_counts, role_counts, total_users = await asyncio.gather(
        asyncio.gather(*[Company.find({"status": s}).count() for s in statuses]),
        asyncio.gather(*[Subscription.find({"plan": p}).count() for p in plans]),
        asyncio.gather(*[User.find({"role": r}).count() for r in roles]),
        User.find().count(),
    )
    data = {
        "companies_by_status": dict(zip(statuses, company_counts)),
        "subscriptions_by_plan": dict(zip(plans, plan_counts)),
        "total_users": total_users,
        "users_by_role": dict(zip(roles, role_counts)),
    }
    await cache_set(cache_key, data, ttl=300)
    return data
