"""
Main API Router - v1
"""
from datetime import datetime

from fastapi import APIRouter
from app.core.config import settings
from app.core.redis_client import get_redis_health
from app.worker.celery_app import is_celery_enabled
from app.core.database import get_database

from app.api.v1.endpoints import (
    auth, users, companies, tasks, notifications, dashboard, files, reports, 
    activity, auth_2fa, projects, time_tracking, workflows, automation, backlog, webhooks,
    issue_types, components, versions, watchers, issue_links, changelog, tickets, chat, subscriptions, clients, invoices, msa, ledger, meetings, calendar, timesheet,
    sales, search, departments, attendance, notification_emails, timeline, leaves, eod, admin_permissions
)
from app.api.v1.endpoints import ai
from app.api.v1.endpoints import rag
from app.api.v1.endpoints import agents
from app.api.v1.endpoints import creative
from app.api.v1.endpoints import crm
from app.api.v1.endpoints import crm_files
from app.api.v1.endpoints import crm_companies
from app.api.v1.endpoints import crm_contacts
from app.api.v1.endpoints import crm_activities
from app.api.v1.endpoints import crm_deals
from app.api.v1.endpoints import crm_notes
from app.api.v1.endpoints import crm_pipeline
from app.api.v1.endpoints import content_calendar
from app.api.v1.endpoints import scheduled_jobs
from app.api.v1.endpoints import sales_categories, sales_products, sales_contacts, sales_prospects, sales_masters, sales_reports
from app.api.v1.endpoints import superadmin_plans, superadmin_tenants, superadmin_usage, superadmin_billing
from fastapi import Depends
from app.api.dependencies import require_module
from app.recruitment.routes import careers_router, router as recruitment_router
from app.integrations.meta import api as meta_integration

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


@api_router.get("/health", tags=["Health"])
async def health_check():
    status = {
        "status": "healthy",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now().isoformat(),
    }

    checks = {"mongodb": {"ok": True}, "redis": {"ok": False}, "celery": {"ok": False}}
    try:
        db = get_database()
        await db.command("ping")
        checks["mongodb"] = {"ok": True}
    except Exception as exc:
        checks["mongodb"] = {"ok": False, "error": str(exc)}
        status["status"] = "degraded"

    try:
        redis_ok = await get_redis_health(force_refresh=True)
        checks["redis"] = {"ok": redis_ok, "disabled": settings.DISABLE_REDIS}
        if not redis_ok:
            status["status"] = "degraded"
    except Exception as exc:
        checks["redis"] = {"ok": False, "error": str(exc), "disabled": settings.DISABLE_REDIS}
        status["status"] = "degraded"

    checks["celery"] = {
        "ok": is_celery_enabled(),
        "disabled": settings.DISABLE_CELERY,
        "always_eager": settings.CELERY_ALWAYS_EAGER or settings.DISABLE_CELERY,
    }

    status["checks"] = checks
    return status


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
api_router.include_router(notification_emails.router, prefix="/notifications", tags=["Notification Email"])
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
api_router.include_router(tickets.router, prefix="/tickets", tags=["Tickets"], dependencies=[Depends(require_module("tickets"))])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"], dependencies=[Depends(require_module("chat"))])
# Subscriptions: no module gate so company admins can always see plans and upgrade
api_router.include_router(subscriptions.router, prefix="/subscriptions", tags=["Subscriptions"])
# Clients: no module gate so super admins can access without module restrictions
api_router.include_router(clients.router, prefix="/clients", tags=["Clients"])
api_router.include_router(invoices.router, prefix="/invoices", tags=["Invoices"], dependencies=[Depends(require_module("invoicing_ledger"))])
# MSA router: no module gate so public signing links (/msa/sign/{token}) work without authentication.
# Individual endpoints inside msa.py already use dependencies for authenticated actions.
api_router.include_router(msa.router, prefix="/msa", tags=["MSA"])
api_router.include_router(ledger.router, prefix="/ledger", tags=["Ledger"], dependencies=[Depends(require_module("invoicing_ledger"))])
api_router.include_router(meetings.router, prefix="/meetings", tags=["Meetings"], dependencies=[Depends(require_module("meetings_calendar"))])
api_router.include_router(calendar.router, prefix="/calendar", tags=["Calendar"], dependencies=[Depends(require_module("meetings_calendar"))])
api_router.include_router(content_calendar.router, prefix="/content-calendar", tags=["Content Calendar"], dependencies=[Depends(require_module("task"))])
api_router.include_router(scheduled_jobs.router, prefix="/scheduled-jobs", tags=["Scheduled Jobs"])
api_router.include_router(timesheet.router, prefix="/timesheet", tags=["Timesheet"], dependencies=[Depends(require_module("task"))])
api_router.include_router(departments.router, prefix="/departments", tags=["Departments"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["Attendance"], dependencies=[Depends(require_module("attendance_leaves"))])
api_router.include_router(timeline.router, prefix="/timeline", tags=["Timeline"])
api_router.include_router(leaves.router, prefix="/leaves", tags=["Leaves"], dependencies=[Depends(require_module("attendance_leaves"))])
api_router.include_router(eod.router, prefix="/eod", tags=["EOD Reports"], dependencies=[Depends(require_module("attendance_leaves"))])
api_router.include_router(recruitment_router, prefix="/recruitment", tags=["Recruitment"], dependencies=[Depends(require_module("recruitment"))])
api_router.include_router(careers_router, prefix="/careers", tags=["Careers"])
api_router.include_router(meta_integration.router, prefix="/integrations/meta", tags=["Meta Integration"])

api_router.include_router(ai.router, prefix="/ai", tags=["AI"], dependencies=[Depends(require_module("ai_agents"))])
api_router.include_router(rag.router, prefix="/rag", tags=["RAG"])
api_router.include_router(agents.router, prefix="/agents", tags=["Agent Platform"], dependencies=[Depends(require_module("ai_agents"))])
api_router.include_router(creative.router, prefix="/creative", tags=["Creative Director"])
api_router.include_router(search.router, tags=["Search"], dependencies=[Depends(require_module("task"))])
# Sales Tracker module (new)
sales_module_dependency = [Depends(require_module("sales_crm"))]
api_router.include_router(sales.router, prefix="/sales", tags=["Sales"], dependencies=sales_module_dependency)
# CRM endpoints are visible to every authenticated company user.
api_router.include_router(crm.router, prefix="/crm", tags=["CRM"])
api_router.include_router(crm_files.router, prefix="/crm", tags=["CRM Files"])
api_router.include_router(crm_companies.router, prefix="/crm/companies", tags=["CRM Companies"])
api_router.include_router(crm_contacts.router, prefix="/crm/contacts", tags=["CRM Contacts"])
api_router.include_router(crm_activities.router, prefix="/crm/activities", tags=["CRM Activities"])
api_router.include_router(crm_deals.router, prefix="/crm", tags=["CRM Deals"])
api_router.include_router(crm_notes.router, prefix="/crm", tags=["CRM Notes"])
api_router.include_router(crm_pipeline.router, prefix="/crm/pipeline", tags=["CRM Pipeline"])
api_router.include_router(sales_categories.router, prefix="/sales/categories", tags=["Sales Categories"], dependencies=sales_module_dependency)
api_router.include_router(sales_products.router, prefix="/sales/products", tags=["Sales Products"], dependencies=sales_module_dependency)
api_router.include_router(sales_contacts.router, prefix="/sales/contacts", tags=["Sales Contacts"], dependencies=sales_module_dependency)
# Lead create/list powers CRM as well as Sales, so do not gate whole router by the Sales module.
# Sensitive bulk import routes keep route-level Sales module and import capability guards.
api_router.include_router(sales_prospects.router, prefix="/sales/prospects", tags=["Leads"])
api_router.include_router(sales_masters.router, prefix="/sales/masters", tags=["Sales Masters"], dependencies=sales_module_dependency)
api_router.include_router(sales_reports.router, prefix="/sales/reports", tags=["Sales Reports"], dependencies=sales_module_dependency)

# Super Admin endpoints
api_router.include_router(superadmin_plans.router, prefix="/superadmin/plans", tags=["Super Admin - Plans"])
api_router.include_router(superadmin_tenants.router, prefix="/superadmin/tenants", tags=["Super Admin - Tenants"])
api_router.include_router(superadmin_usage.router, prefix="/superadmin/usage", tags=["Super Admin - Usage"])
api_router.include_router(superadmin_billing.router, prefix="/superadmin/billing", tags=["Super Admin - Billing"])
api_router.include_router(admin_permissions.router, prefix="/admin/permissions", tags=["Admin Permissions"])
