"""
Dashboard & Analytics Endpoints
"""
from fastapi import APIRouter, Depends
from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.company import Company, Subscription
from app.api.dependencies import get_current_user, get_current_super_admin
from app.core.cache import cache_get, cache_set, dashboard_cache_key

router = APIRouter()


@router.get("/stats")
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user)
):
    """Get dashboard statistics with hierarchical RBAC"""
    cache_key = dashboard_cache_key(str(current_user.id), current_user.role.value, current_user.company_id)
    cached = await cache_get(cache_key)
    if cached:
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
        await cache_set(cache_key, data, ttl=300)
        return data
    
    # Admin or legacy Company Admin
    is_admin = (
        current_user.role == UserRole.ADMIN or 
        current_user.role.value == "admin"
    )
    
    if is_admin:
        # Admin Dashboard - See all company data
        total_tasks = await Task.find({"company_id": current_user.company_id}).count()
        active_tasks = await Task.find({
            "company_id": current_user.company_id,
            "status": {"$in": ["todo", "in_progress"]}
        }).count()
        completed_tasks = await Task.find({
            "company_id": current_user.company_id,
            "status": "completed"
        }).count()
        
        total_tickets = await Ticket.find({"company_id": current_user.company_id}).count()
        open_tickets = await Ticket.find({
            "company_id": current_user.company_id,
            "status": {"$in": ["open", "in_progress"]}
        }).count()
        
        total_users = await User.find({"company_id": current_user.company_id}).count()
        
        data = {
            "role": "admin",
            "total_tasks": total_tasks,
            "active_tasks": active_tasks,
            "completed_tasks": completed_tasks,
            "total_tickets": total_tickets,
            "open_tickets": open_tickets,
            "total_users": total_users,
        }
        await cache_set(cache_key, data, ttl=300)
        return data
    
    elif current_user.role == UserRole.MANAGER:
        # Manager Dashboard - See all subordinates' data
        subordinates = await current_user.get_all_subordinates()
        subordinate_ids = [str(sub.id) for sub in subordinates]
        subordinate_ids.append(str(current_user.id))
        
        # Tasks assigned to manager or subordinates
        total_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": {"$in": subordinate_ids}
        }).count()
        
        active_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": {"$in": subordinate_ids},
            "status": {"$in": ["todo", "in_progress"]}
        }).count()
        
        completed_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": {"$in": subordinate_ids},
            "status": "completed"
        }).count()
        
        # Tickets created by manager or subordinates
        total_tickets = await Ticket.find({
            "company_id": current_user.company_id,
            "created_by": {"$in": subordinate_ids}
        }).count()
        
        open_tickets = await Ticket.find({
            "company_id": current_user.company_id,
            "created_by": {"$in": subordinate_ids},
            "status": {"$in": ["open", "in_progress"]}
        }).count()
        
        total_subordinates = len(subordinates)
        
        data = {
            "role": "manager",
            "total_tasks": total_tasks,
            "active_tasks": active_tasks,
            "completed_tasks": completed_tasks,
            "total_tickets": total_tickets,
            "open_tickets": open_tickets,
            "total_subordinates": total_subordinates,
        }
        await cache_set(cache_key, data, ttl=300)
        return data
    
    elif current_user.role == UserRole.LEAD:
        # Lead Dashboard - See only their employees' data
        employees = await User.find(
            User.reports_to == str(current_user.id),
            User.role == UserRole.EMPLOYEE
        ).to_list()
        employee_ids = [str(emp.id) for emp in employees]
        employee_ids.append(str(current_user.id))
        
        my_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": str(current_user.id)
        }).count()
        
        team_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": {"$in": employee_ids}
        }).count()
        
        my_tickets = await Ticket.find({
            "company_id": current_user.company_id,
            "assigned_to": str(current_user.id)
        }).count()
        
        team_tickets = await Ticket.find({
            "company_id": current_user.company_id,
            "created_by": {"$in": employee_ids}
        }).count()
        
        total_employees = len(employees)
        
        data = {
            "role": "lead",
            "my_tasks": my_tasks,
            "team_tasks": team_tasks,
            "my_tickets": my_tickets,
            "team_tickets": team_tickets,
            "total_employees": total_employees,
        }
        await cache_set(cache_key, data, ttl=300)
        return data
    
    else:
        # Employee Dashboard - See only own data
        my_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": str(current_user.id)
        }).count()
        
        active_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": str(current_user.id),
            "status": {"$in": ["todo", "in_progress"]}
        }).count()
        
        completed_tasks = await Task.find({
            "company_id": current_user.company_id,
            "assigned_to": str(current_user.id),
            "status": "completed"
        }).count()
        
        my_tickets = await Ticket.find({
            "company_id": current_user.company_id,
            "$or": [
                {"created_by": str(current_user.id)},
                {"assigned_to": str(current_user.id)},
            ],
        }).count()
        
        data = {
            "role": "employee",
            "my_tasks": my_tasks,
            "active_tasks": active_tasks,
            "completed_tasks": completed_tasks,
            "my_tickets": my_tickets,
        }
        await cache_set(cache_key, data, ttl=300)
        return data


@router.get("/super-admin/analytics")
async def get_super_admin_analytics(
    current_user: User = Depends(get_current_super_admin)
):
    """Get detailed analytics for Super Admin"""
    # Company statistics
    companies_by_status = {}
    statuses = ["pending", "active", "suspended", "cancelled"]
    for status in statuses:
        count = await Company.find({"status": status}).count()
        companies_by_status[status] = count
    
    # Subscription statistics
    subscriptions_by_plan = {}
    plans = ["free", "basic", "professional", "enterprise"]
    for plan in plans:
        count = await Subscription.find({"plan": plan}).count()
        subscriptions_by_plan[plan] = count
    
    # User statistics
    total_users = await User.find().count()
    users_by_role = {}
    roles = ["super_admin", "admin", "manager", "lead", "employee"]
    for role in roles:
        count = await User.find({"role": role}).count()
        users_by_role[role] = count
    
    return {
        "companies_by_status": companies_by_status,
        "subscriptions_by_plan": subscriptions_by_plan,
        "total_users": total_users,
        "users_by_role": users_by_role,
    }
