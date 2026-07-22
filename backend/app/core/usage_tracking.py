"""
Usage Tracking Middleware - Enforce Plan Limits
"""
from fastapi import HTTPException, status, Request
from typing import Callable
from datetime import datetime
import logging

from beanie.odm.operators.find.comparison import In

from app.models.user import User
from app.models.company_subscription import CompanySubscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.usage_tracking import UsageTracking
from app.core.clock import utc_now

logger = logging.getLogger(__name__)


async def track_usage_and_enforce_limits(
    company_id: str,
    resource_type: str,  # users, tasks, projects, tickets, storage, api_requests
    increment: int = 1
):
    """
    Track usage and check if limits are exceeded
    Returns: (is_allowed: bool, current_usage: int, limit: int)
    """
    if not company_id:
        return True, 0, None
    
    try:
        # Get subscription
        subscription = await CompanySubscription.find_one(
            CompanySubscription.company_id == company_id,
            In(CompanySubscription.status, ["active", "trial", "grace_period"])
        )
        
        if not subscription:
            # No active subscription - allow for now (can be restricted later)
            return True, 0, None
        
        # Get plan
        plan = await SubscriptionPlan.get(subscription.plan_id)
        if not plan or plan.deleted:
            return True, 0, None
        
        # Get current month usage
        current_month = utc_now().month
        current_year = utc_now().year
        
        usage = await UsageTracking.find_one(
            UsageTracking.company_id == company_id,
            UsageTracking.period_month == current_month,
            UsageTracking.period_year == current_year
        )
        
        if not usage:
            usage = UsageTracking(
                company_id=company_id,
                period_month=current_month,
                period_year=current_year
            )
            await usage.insert()
        
        # Map resource type to plan limit and usage field
        limit_map = {
            "users": ("max_users", "total_users"),
            "managers": ("max_managers", "total_managers"),
            "leads": ("max_leads", "total_leads"),
            "employees": ("max_employees", "total_employees"),
            "tasks": ("max_tasks", "total_tasks"),
            "projects": ("max_projects", "total_projects"),
            "tickets": ("max_tickets", "total_tickets"),
            "storage": ("max_storage_gb", "storage_used_gb"),
            "api_requests": ("max_api_requests_per_month", "api_requests_count")
        }
        
        if resource_type not in limit_map:
            return True, 0, None
        
        limit_field, usage_field = limit_map[resource_type]
        limit = getattr(plan, limit_field, None)
        current_usage = getattr(usage, usage_field, 0)
        
        # Check if limit exists and is exceeded
        if limit is not None:
            if current_usage + increment > limit:
                return False, current_usage, limit
        
        # Update usage (if increment > 0)
        if increment > 0:
            setattr(usage, usage_field, current_usage + increment)
            usage.updated_at = utc_now()
            await usage.save()
            
            # Update subscription cache
            setattr(subscription, f"current_{usage_field}", current_usage + increment)
            subscription.updated_at = utc_now()
            await subscription.save()
        
        return True, current_usage + increment, limit
    
    except Exception as e:
        logger.error(f"Error tracking usage: {str(e)}")
        # On error, allow the operation (fail open)
        return True, 0, None


def require_plan_limit(resource_type: str):
    """
    Dependency factory to enforce plan limits on API endpoints
    """
    async def _checker(request: Request, current_user: User = None) -> User:
        if not current_user or not current_user.company_id:
            return current_user
        
        is_allowed, current_usage, limit = await track_usage_and_enforce_limits(
            company_id=current_user.company_id,
            resource_type=resource_type,
            increment=0  # Just check, don't increment
        )
        
        if not is_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Plan limit exceeded for {resource_type}. Current: {current_usage}, Limit: {limit}. Please upgrade your plan."
            )
        
        return current_user
    
    return _checker


async def update_usage_counts(company_id: str):
    """
    Update all usage counts for a company (called periodically or on demand)
    """
    try:
        from app.models.task import Task
        from app.models.project import Project
        from app.models.ticket import Ticket
        
        # Count users by role
        users = await User.find(
            User.company_id == company_id,
            User.deleted == False
        ).to_list()
        
        total_users = len(users)
        total_managers = len([u for u in users if u.role.value == "manager"])
        total_leads = len([u for u in users if u.role.value == "lead"])
        total_employees = len([u for u in users if u.role.value == "employee"])
        
        # Count tasks, projects, tickets
        total_tasks = await Task.find(
            Task.company_id == company_id,
            Task.deleted == False
        ).count()
        
        total_projects = await Project.find(
            Project.company_id == company_id,
            Project.deleted == False
        ).count()
        
        total_tickets = await Ticket.find(
            Ticket.company_id == company_id,
            Ticket.deleted == False
        ).count()
        
        # Get current month usage
        current_month = utc_now().month
        current_year = utc_now().year
        
        usage = await UsageTracking.find_one(
            UsageTracking.company_id == company_id,
            UsageTracking.period_month == current_month,
            UsageTracking.period_year == current_year
        )
        
        if not usage:
            usage = UsageTracking(
                company_id=company_id,
                period_month=current_month,
                period_year=current_year
            )
        
        # Update counts
        usage.total_users = total_users
        usage.total_managers = total_managers
        usage.total_leads = total_leads
        usage.total_employees = total_employees
        usage.total_tasks = total_tasks
        usage.total_projects = total_projects
        usage.total_tickets = total_tickets
        usage.updated_at = utc_now()
        
        await usage.save()
        
        # Update subscription cache
        subscription = await CompanySubscription.find_one(
            CompanySubscription.company_id == company_id
        )
        if subscription:
            subscription.current_users = total_users
            subscription.current_managers = total_managers
            subscription.current_leads = total_leads
            subscription.current_employees = total_employees
            subscription.current_tasks = total_tasks
            subscription.current_projects = total_projects
            subscription.current_tickets = total_tickets
            subscription.updated_at = utc_now()
            await subscription.save()
        
        return usage
    
    except Exception as e:
        logger.error(f"Error updating usage counts: {str(e)}")
        return None

