from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from app.core.permission_catalog import SCOPES

MODULE_CATALOG = [
    {"id": "tasks_projects", "label": "All Work", "core": True},
    {"id": "projects", "label": "Projects", "core": False},
    {"id": "tasks", "label": "Tasks", "core": False},
    {"id": "scheduled_work", "label": "Scheduled Work", "core": False},
    {"id": "time_tracking", "label": "Time Tracking", "core": False},
    {"id": "daily_updates", "label": "Daily Updates", "core": False},
    {"id": "content_calendar", "label": "Content Calendar", "core": False},
    {"id": "automation_rules", "label": "Automation Rules", "core": False},
    {"id": "tickets", "label": "Tickets", "core": False},
    {"id": "chat", "label": "Chat", "core": False},
    {"id": "meetings_calendar", "label": "Meetings & Calendar", "core": False},
    {"id": "invoicing_ledger", "label": "Invoicing & Ledger", "core": False},
    {"id": "invoices", "label": "Invoices", "core": False},
    {"id": "transactions", "label": "Transactions", "core": False},
    {"id": "sales_crm", "label": "Sales & CRM", "core": False},
    {"id": "sales_overview", "label": "Sales Overview", "core": False},
    {"id": "leads", "label": "Leads", "core": False},
    {"id": "sales_pipeline", "label": "Sales Pipeline", "core": False},
    {"id": "import_leads", "label": "Import Leads", "core": False},
    {"id": "sales_reports", "label": "Sales Reports", "core": False},
    {"id": "clients", "label": "Clients", "core": False},
    {"id": "companies", "label": "Companies", "core": False},
    {"id": "contacts", "label": "Contacts", "core": False},
    {"id": "client_calendar", "label": "Client Calendar", "core": False},
    {"id": "client_insights", "label": "Client Insights", "core": False},
    {"id": "meta_messages", "label": "Meta Messages", "core": False},
    {"id": "meta_settings", "label": "Meta Settings", "core": False},
    {"id": "publishing_centre", "label": "Publishing Centre", "core": False},
    {"id": "social_accounts", "label": "Social Accounts", "core": False},
    {"id": "publishing_analytics", "label": "Publishing Analytics", "core": False},
    {"id": "integrations", "label": "Integrations", "core": False},
    {"id": "attendance_leaves", "label": "Attendance & Leaves", "core": False},
    {"id": "attendance", "label": "Attendance", "core": False},
    {"id": "live_attendance", "label": "Live Attendance", "core": False},
    {"id": "attendance_reports", "label": "Attendance Reports", "core": False},
    {"id": "leave_management", "label": "Leave Management", "core": False},
    {"id": "hr", "label": "People / HR", "core": False},
    {"id": "recruitment", "label": "Recruitment", "core": False},
    {"id": "reports", "label": "Reports", "core": False},
    {"id": "activity_logs", "label": "Activity Logs", "core": False},
    {"id": "ai_agents", "label": "AI & Agents", "core": False},
    {"id": "ai_assistant", "label": "AI Assistant", "core": False},
    {"id": "ai_content_assistant", "label": "AI Content Assistant", "core": False},
]


class ModuleUpdateRequest(BaseModel):
    modules: List[str] = Field(default_factory=list)


class CapabilityGrantUpdateRequest(BaseModel):
    """Explicit company-scoped grants for one member."""
    capabilities: List[str] = Field(default_factory=list)


class PermissionOverrideInput(BaseModel):
    permission: str
    effect: str = "inherit"
    scope: Optional[str] = None

    @field_validator("effect")
    @classmethod
    def validate_effect(cls, value: str) -> str:
        if value not in {"inherit", "allow", "deny"}:
            raise ValueError("effect must be inherit, allow, or deny")
        return value

    @field_validator("scope")
    @classmethod
    def validate_scope(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in SCOPES:
            raise ValueError("unsupported permission scope")
        return value


class PermissionOverrideUpdateRequest(BaseModel):
    overrides: List[PermissionOverrideInput] = Field(default_factory=list)


# Role-level default module selections, used by the member creation forms to
# pre-populate the Permissions selector (frontend mirrors this in
# src/config/modulePermissions.js - keep both in sync).
#
# NOTE: the backend `require_module` gate auto-grants tasks/sales/tickets/
# recruitment to Manager/Lead/Employee regardless of the stored list, so these
# defaults focus on the modules that actually vary per role. Admin / Sub Admin /
# Super Admin have full access to every module in `require_module`.
ROLE_MODULE_DEFAULTS = {
    "super_admin": [entry["id"] for entry in MODULE_CATALOG],
    "admin": [entry["id"] for entry in MODULE_CATALOG],
    "sub_admin": [entry["id"] for entry in MODULE_CATALOG],
    "manager": ["projects", "tasks", "scheduled_work", "time_tracking", "daily_updates", "content_calendar", "chat", "meetings_calendar", "clients", "attendance", "live_attendance", "attendance_reports", "leave_management", "hr", "ai_assistant", "ai_content_assistant"],
    "lead": ["projects", "tasks", "scheduled_work", "time_tracking", "daily_updates", "content_calendar", "chat", "meetings_calendar", "attendance", "attendance_reports", "leave_management"],
    "employee": ["projects", "tasks", "time_tracking", "daily_updates", "content_calendar", "chat", "meetings_calendar", "attendance", "leave_management"],
}


def role_module_defaults(role: str) -> List[str]:
    """Return the default module selection for a role (unknown roles fall back
    to the employee default so legacy/unknown roles never get locked out)."""
    normalized = str(role or "").lower().strip()
    return list(ROLE_MODULE_DEFAULTS.get(normalized, ROLE_MODULE_DEFAULTS["employee"]))


def normalize_modules(modules: Optional[List[str] | str], *, require_tasks_projects: bool = True) -> List[str]:
    catalog_ids = {entry["id"] for entry in MODULE_CATALOG}
    raw_values: List[str] = []
    if isinstance(modules, str):
        raw_values = [value.strip() for value in modules.split(",") if value and value.strip()]
    elif modules is not None:
        raw_values = [str(value).strip() for value in modules if value is not None and str(value).strip()]

    normalized: List[str] = []
    seen = set()
    for value in raw_values:
        if value not in catalog_ids:
            continue
        if value not in seen:
            normalized.append(value)
            seen.add(value)

    if require_tasks_projects and "tasks_projects" not in seen:
        normalized.insert(0, "tasks_projects")

    return normalized
