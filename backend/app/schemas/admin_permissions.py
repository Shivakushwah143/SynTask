from typing import List, Optional
from pydantic import BaseModel, Field

MODULE_CATALOG = [
    {"id": "tasks_projects", "label": "Tasks & Projects", "core": True},
    {"id": "tickets", "label": "Tickets", "core": False},
    {"id": "chat", "label": "Chat", "core": False},
    {"id": "meetings_calendar", "label": "Meetings & Calendar", "core": False},
    {"id": "invoicing_ledger", "label": "Invoicing & Ledger", "core": False},
    {"id": "sales_crm", "label": "Sales & CRM", "core": False},
    {"id": "attendance_leaves", "label": "Attendance & Leaves", "core": False},
    {"id": "recruitment", "label": "Recruitment", "core": False},
    {"id": "reports", "label": "Reports", "core": False},
    {"id": "ai_agents", "label": "AI & Agents", "core": False},
]


class ModuleUpdateRequest(BaseModel):
    modules: List[str] = Field(default_factory=list)


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
