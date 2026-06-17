"""
Main API Router - v1
"""
from fastapi import APIRouter
from app.core.config import settings

from app.api.v1.endpoints import (
    auth, users, companies, tasks, notifications, dashboard, files, reports, 
    activity, auth_2fa, projects, time_tracking, workflows, automation, backlog, webhooks,
    issue_types, components, versions, watchers, issue_links, changelog, tickets, chat, subscriptions, clients, invoices, msa, ledger, meetings, calendar, timesheet,
    sales, search
)
from app.api.v1.endpoints import sales_categories, sales_products, sales_contacts, sales_prospects, sales_masters, sales_reports
from app.api.v1.endpoints import superadmin_plans, superadmin_tenants, superadmin_usage, superadmin_billing
from fastapi import Depends
from app.api.dependencies import require_module

api_router = APIRouter()


@api_router.get("/debug", tags=["Health"])
async def debug_backend():
    """Confirm backend uses user-provided project_id. Hit: GET /api/v1/debug"""
    return {
        "status": "ok",
        "version": settings.VERSION,
        "project_id": "user_provided",
        "message": "Create project saves your project_id in DB. If you see this, the new backend is live.",
    }


# Include all endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(auth_2fa.router, prefix="/auth/2fa", tags=["2FA"])

# Include users router (hierarchy routes are defined first in the router itself)
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(companies.router, prefix="/companies", tags=["Companies"])
api_router.include_router(
    tasks.router,
    prefix="/tasks",
    tags=["Tasks"],
    dependencies=[Depends(require_module("task"))]
)
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(files.router, prefix="/files", tags=["Files"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(activity.router, prefix="/activity", tags=["Activity"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"], dependencies=[Depends(require_module("task"))])
api_router.include_router(time_tracking.router, prefix="/time-tracking", tags=["Time Tracking"], dependencies=[Depends(require_module("task"))])
api_router.include_router(workflows.router, prefix="/workflows", tags=["Workflows"], dependencies=[Depends(require_module("task"))])
api_router.include_router(automation.router, prefix="/automation", tags=["Automation"], dependencies=[Depends(require_module("task"))])
api_router.include_router(backlog.router, prefix="/backlog", tags=["Backlog"], dependencies=[Depends(require_module("task"))])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["Webhooks"], dependencies=[Depends(require_module("task"))])
api_router.include_router(issue_types.router, prefix="/issue-types", tags=["Issue Types"], dependencies=[Depends(require_module("task"))])
api_router.include_router(components.router, prefix="/components", tags=["Components"], dependencies=[Depends(require_module("task"))])
api_router.include_router(versions.router, prefix="/versions", tags=["Versions"], dependencies=[Depends(require_module("task"))])
api_router.include_router(watchers.router, prefix="/watchers", tags=["Watchers"], dependencies=[Depends(require_module("task"))])
api_router.include_router(issue_links.router, prefix="/issue-links", tags=["Issue Links"], dependencies=[Depends(require_module("task"))])
api_router.include_router(changelog.router, prefix="/changelog", tags=["Changelog"], dependencies=[Depends(require_module("task"))])
api_router.include_router(tickets.router, prefix="/tickets", tags=["Tickets"], dependencies=[Depends(require_module("task"))])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"], dependencies=[Depends(require_module("task"))])
# Subscriptions: no module gate so company admins can always see plans and upgrade
api_router.include_router(subscriptions.router, prefix="/subscriptions", tags=["Subscriptions"])
api_router.include_router(clients.router, prefix="/clients", tags=["Clients"], dependencies=[Depends(require_module("task"))])
api_router.include_router(invoices.router, prefix="/invoices", tags=["Invoices"], dependencies=[Depends(require_module("task"))])
# MSA router: no module gate so public signing links (/msa/sign/{token}) work without authentication.
# Individual endpoints inside msa.py already use dependencies for authenticated actions.
api_router.include_router(msa.router, prefix="/msa", tags=["MSA"])
api_router.include_router(ledger.router, prefix="/ledger", tags=["Ledger"], dependencies=[Depends(require_module("task"))])
api_router.include_router(meetings.router, prefix="/meetings", tags=["Meetings"], dependencies=[Depends(require_module("task"))])
api_router.include_router(calendar.router, prefix="/calendar", tags=["Calendar"], dependencies=[Depends(require_module("task"))])
api_router.include_router(timesheet.router, prefix="/timesheet", tags=["Timesheet"], dependencies=[Depends(require_module("task"))])
api_router.include_router(search.router, tags=["Search"], dependencies=[Depends(require_module("task"))])
# Sales Tracker module (new)
sales_module_dependency = [Depends(require_module("sales"))]
api_router.include_router(sales.router, prefix="/sales", tags=["Sales"], dependencies=sales_module_dependency)
api_router.include_router(sales_categories.router, prefix="/sales/categories", tags=["Sales Categories"], dependencies=sales_module_dependency)
api_router.include_router(sales_products.router, prefix="/sales/products", tags=["Sales Products"], dependencies=sales_module_dependency)
api_router.include_router(sales_contacts.router, prefix="/sales/contacts", tags=["Sales Contacts"], dependencies=sales_module_dependency)
api_router.include_router(sales_prospects.router, prefix="/sales/prospects", tags=["Sales Prospects"], dependencies=sales_module_dependency)
api_router.include_router(sales_masters.router, prefix="/sales/masters", tags=["Sales Masters"], dependencies=sales_module_dependency)
api_router.include_router(sales_reports.router, prefix="/sales/reports", tags=["Sales Reports"], dependencies=sales_module_dependency)

# Super Admin endpoints
api_router.include_router(superadmin_plans.router, prefix="/superadmin/plans", tags=["Super Admin - Plans"])
api_router.include_router(superadmin_tenants.router, prefix="/superadmin/tenants", tags=["Super Admin - Tenants"])
api_router.include_router(superadmin_usage.router, prefix="/superadmin/usage", tags=["Super Admin - Usage"])
api_router.include_router(superadmin_billing.router, prefix="/superadmin/billing", tags=["Super Admin - Billing"])
