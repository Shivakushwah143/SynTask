"""
Application-wide global search service.

Replaces the four-entity regex endpoint with a registry-driven search that covers
every navigation module. Each searchable entity declares:

- the Beanie model and its searchable fields (title fields rank highest),
- a company-scoped + soft-delete filter,
- a role/module permission gate (mirrors the sidebar navigation config),
- a frontend route (href), subtitle, and breadcrumb parent for the result card.

Query semantics: case-insensitive substring/prefix matching with regex-escaped
tokens, whitespace normalization, AND-across-tokens precision, relevance scoring
(exact > prefix > title substring > field substring), and de-duplication by
(type, id). Results are grouped by navigation module with per-group and global
caps so queries stay bounded even with large datasets.
"""
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.core.cache import cache_get, cache_set
from app.core.config import settings
from app.models.attendance import Attendance
from app.models.automation import AutomationRule
from app.models.chat import ChatMessage, Conversation
from app.models.client import Client
from app.models.company import Company
from app.models.content_calendar import ContentCalendarItem
from app.models.crm_company import CRMCompany
from app.models.crm_deal import CRMDeal
from app.models.crm_document import CRMDocument
from app.models.department import Department
from app.models.eod import EODReport
from app.models.invoice import Invoice
from app.models.knowledge import KnowledgeRecord
from app.models.leave import LeaveRequest
from app.models.meeting import Meeting
from app.models.msa import MSA
from app.models.notification import Notification
from app.models.page import Page
from app.models.project import Epic, Project, Sprint
from app.models.work_request import WorkRequest
from app.models.sales_contact import SalesContact
from app.models.sales_prospect import SalesProspect
from app.models.scheduled_job import ScheduledJob
from app.models.task import Task
from app.models.ticket import Ticket
from app.models.time_tracking import TimeLog
from app.models.timesheet import TimesheetEntry
from app.models.user import User, UserRole
from app.models.workflow import Workflow
from app.recruitment.models import (
    Application,
    Candidate,
    Interview,
    Offer,
    RecruitmentJob,
)

# ── Role groups (mirror the sidebar navigation config in frontend/src/config/navigation.js) ──
STANDARD_ROLES = {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}
TEAM_ROLES = {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD}
ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUB_ADMIN}


def _normalize_role(role: Any) -> UserRole:
    if isinstance(role, UserRole):
        return role
    try:
        return UserRole(str(role).strip().lower().replace(" ", "_").replace("-", "_"))
    except Exception:
        return UserRole.EMPLOYEE


def module_allowed(user: User, module: Optional[str]) -> bool:
    """Mirror backend require_module() so search results obey module gates."""
    if not module:
        return True
    role = _normalize_role(getattr(user, "role", None))
    if role in ADMIN_ROLES:
        return True
    if module in {"sales", "sales_crm", "tickets", "task", "tasks_projects"} and role in {UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}:
        return True
    if module == "recruitment" and role in {UserRole.MANAGER, UserRole.LEAD, UserRole.EMPLOYEE}:
        return True
    user_modules = set(getattr(user, "modules", None) or [])
    if module == "task":
        return bool(user_modules & {"task", "tasks_projects"})
    if module == "tasks_projects":
        return bool(user_modules & {"tasks_projects", "task"})
    if module == "chat":
        return bool(user_modules & {"chat", "task", "tasks_projects"})
    if module == "sales_crm":
        return bool(user_modules & {"sales_crm", "sales"})
    if module == "sales":
        return bool(user_modules & {"sales", "sales_crm"})
    return module in user_modules


def hr_access_allowed(user: User) -> bool:
    """Mirror the People → HR gate: managers/admins, or users in the HR department."""
    role = _normalize_role(getattr(user, "role", None))
    if role in ADMIN_ROLES or role == UserRole.MANAGER:
        return True
    department = str(getattr(user, "department", "") or "").strip().lower()
    return department == "hr"


@dataclass
class SearchableEntity:
    key: str                              # result type key (e.g. "task")
    label: str                            # display label (e.g. "Task")
    module: str                           # nav module label (e.g. "Work")
    module_key: str                       # nav section key (e.g. "work")
    icon: str                             # frontend icon key
    model: type
    search_fields: List[str]              # all fields matched by the query
    title_fields: List[str]               # primary fields, scored highest
    href: Callable[[Any], str]            # frontend route for the result
    subtitle: Callable[[Any], str]        # secondary line under the title
    parent: Callable[[Any], str] = lambda item: ""   # breadcrumb parent (module → parent)
    extra_filter: Callable[[], Dict[str, Any]] = lambda: {}      # soft-delete / status filters
    can_access: Callable[[User], bool] = lambda user: True
    module_required: Optional[str] = None
    scope_filter: Optional[Callable[[User], Awaitable[Dict[str, Any]]]] = None  # personal records
    limit: int = 5                        # max items from this entity kept after scoring
    pool: int = 12                        # candidate rows fetched before scoring


# ── Personal-scope filters (notifications, chats) ─────────────────────────────
async def _user_notification_scope(user: User) -> Dict[str, Any]:
    return {"user_id": str(user.id)}


async def _conversation_scope(user: User) -> Dict[str, Any]:
    return {"participants": str(user.id)}


async def _chat_message_scope(user: User) -> Dict[str, Any]:
    """Chat messages are only searchable inside conversations the user participates in."""
    conversations = await Conversation.find(
        {"company_id": user.company_id, "participants": str(user.id)}
    ).limit(500).to_list()
    conversation_ids = [str(c.id) for c in conversations]
    # $in: [] matches nothing — a user with no conversations must see no messages.
    return {"conversation_id": {"$in": conversation_ids}}


# ── Small helpers for building entity rows ────────────────────────────────────
def _project_route(item: Any) -> str:
    return f"/projects/{getattr(item, 'project_id', None) or item.id}/board"


# ── Searchable entity registry (one entry per nav module / sub-module) ─────────
SEARCHABLE_ENTITIES: List[SearchableEntity] = [
    # ── Work ──────────────────────────────────────────────────────────────────
    SearchableEntity(
        key="project", label="Project", module="Work", module_key="work", icon="project",
        model=Project, search_fields=["name", "key", "project_id", "description", "category"],
        title_fields=["name"],
        href=lambda item: f"/projects/{getattr(item, 'project_id', None) or item.id}/board",
        subtitle=lambda item: f"{item.key} · {getattr(item, 'status', '')}",
        parent=lambda item: "Work → Projects",
        module_required="tasks_projects",
    ),
    SearchableEntity(
        key="task", label="Task", module="Work", module_key="work", icon="task",
        model=Task, search_fields=["title", "description", "project_id", "tags"],
        title_fields=["title"],
        href=lambda item: f"/tasks/{item.id}",
        subtitle=lambda item: f"{getattr(item, 'status', 'todo')} · {getattr(item, 'priority', '')}",
        parent=lambda item: "Work → Tasks",
        module_required="tasks_projects",
    ),
    SearchableEntity(
        key="epic", label="Epic", module="Work", module_key="work", icon="project",
        model=Epic, search_fields=["name", "description"],
        title_fields=["name"],
        href=_project_route,
        subtitle=lambda item: f"Epic · {getattr(item, 'status', '')}",
        parent=lambda item: "Work → Projects",
        module_required="tasks_projects",
    ),
    SearchableEntity(
        key="sprint", label="Sprint", module="Work", module_key="work", icon="project",
        model=Sprint, search_fields=["name", "goal"],
        title_fields=["name"],
        href=_project_route,
        subtitle=lambda item: f"Sprint · {getattr(item, 'state', '')}",
        parent=lambda item: "Work → Projects",
        module_required="tasks_projects",
    ),
    SearchableEntity(
        key="ticket", label="Request", module="Work", module_key="work", icon="ticket",
        model=Ticket, search_fields=["title", "description", "ticket_number", "tags"],
        title_fields=["title"],
        href=lambda item: "/tickets",
        subtitle=lambda item: f"{item.ticket_number} · {getattr(item, 'status', '')}",
        parent=lambda item: "Work → Requests",
        module_required="tickets",
    ),
    SearchableEntity(
        key="work_request", label="Work Request", module="Work", module_key="work", icon="ticket",
        model=WorkRequest, search_fields=["title", "description", "request_type", "reason"],
        title_fields=["title"],
        href=lambda item: "/work-requests",
        subtitle=lambda item: f"{getattr(item, 'request_type', '')} · {getattr(item, 'status', '')}",
        parent=lambda item: "Work → Requests",
        module_required="tasks",
    ),
    SearchableEntity(
        key="scheduled_job", label="Scheduled Work", module="Work", module_key="work", icon="calendar",
        model=ScheduledJob, search_fields=["notes", "action_type", "status"],
        title_fields=["notes"],
        href=lambda item: "/scheduled-jobs",
        subtitle=lambda item: f"{item.action_type} · {item.status}",
        parent=lambda item: "Work → Scheduled Work",
    ),
    SearchableEntity(
        key="timesheet_entry", label="Timesheet", module="Work", module_key="work", icon="task",
        model=TimesheetEntry, search_fields=["project_name", "task_title", "meeting_title", "miscellaneous_description"],
        title_fields=["project_name", "task_title", "meeting_title"],
        href=lambda item: "/timesheet",
        subtitle=lambda item: f"{item.date} · {item.hours_spent}h",
        parent=lambda item: "Work → Time Tracking",
        module_required="tasks_projects",
    ),
    SearchableEntity(
        key="time_log", label="Time Log", module="Work", module_key="work", icon="task",
        model=TimeLog, search_fields=["description", "user_name"],
        title_fields=["description"],
        href=lambda item: "/time-tracking",
        subtitle=lambda item: f"{item.user_name} · {item.hours}h",
        parent=lambda item: "Work → Time Tracking",
        module_required="tasks_projects",
    ),
    SearchableEntity(
        key="page", label="Page", module="Work", module_key="work", icon="task",
        model=Page, search_fields=["title", "content", "labels"],
        title_fields=["title"],
        href=_project_route,
        subtitle=lambda item: f"Page · {getattr(item, 'status', '')}",
        parent=lambda item: "Work → Projects",
        module_required="tasks_projects",
    ),

    # ── Content ───────────────────────────────────────────────────────────────
    SearchableEntity(
        key="content_item", label="Content Item", module="Content", module_key="content", icon="calendar",
        model=ContentCalendarItem, search_fields=["title", "description", "notes", "campaign", "platform", "tags", "location"],
        title_fields=["title"],
        href=lambda item: "/content-calendar",
        subtitle=lambda item: f"{item.content_type} · {getattr(item, 'status', '')}",
        parent=lambda item: "Content → Content Calendar",
        module_required="tasks_projects",
    ),

    # ── People & HR ───────────────────────────────────────────────────────────
    SearchableEntity(
        key="user", label="Employee", module="People", module_key="people", icon="user",
        model=User, search_fields=["first_name", "last_name", "email", "phone"],
        title_fields=["first_name", "last_name"],
        href=lambda item: "/users",
        subtitle=lambda item: f"{getattr(item, 'email', '')} · {getattr(item, 'role', '')}",
        parent=lambda item: "People → Employees",
        can_access=lambda user: _normalize_role(getattr(user, "role", None)) in TEAM_ROLES,
    ),
    SearchableEntity(
        key="department", label="Department", module="People", module_key="people", icon="user",
        model=Department, search_fields=["name"],
        title_fields=["name"],
        href=lambda item: "/departments",
        subtitle=lambda item: f"{item.department_type} department",
        parent=lambda item: "People → Departments",
        extra_filter=lambda: {"deleted_at": None},
        can_access=lambda user: _normalize_role(getattr(user, "role", None)) in TEAM_ROLES,
    ),
    SearchableEntity(
        key="leave", label="Leave Request", module="People", module_key="people", icon="calendar",
        model=LeaveRequest, search_fields=["reason", "leave_type", "status"],
        title_fields=["reason"],
        href=lambda item: "/leaves",
        subtitle=lambda item: f"{item.leave_type} · {item.status}",
        parent=lambda item: "People → Leave Management",
    ),
    SearchableEntity(
        key="attendance", label="Attendance", module="People", module_key="people", icon="user",
        model=Attendance, search_fields=["date", "status", "work_type"],
        title_fields=["date"],
        href=lambda item: "/attendance",
        subtitle=lambda item: f"{item.status} · {item.date}",
        parent=lambda item: "People → Attendance",
    ),
    SearchableEntity(
        key="eod", label="Daily Update", module="People", module_key="people", icon="task",
        model=EODReport, search_fields=["worked_on", "blockers", "tomorrow_plan"],
        title_fields=["worked_on"],
        href=lambda item: "/eod",
        subtitle=lambda item: f"EOD · {item.report_date}",
        parent=lambda item: "People → Daily Updates",
    ),
    SearchableEntity(
        key="recruitment_job", label="Job Opening", module="People", module_key="people", icon="user",
        model=RecruitmentJob, search_fields=["title", "location", "description", "required_skills"],
        title_fields=["title"],
        href=lambda item: "/hr/recruitment/jobs",
        subtitle=lambda item: f"{item.location} · {item.employment_type}",
        parent=lambda item: "People → Hiring",
        can_access=hr_access_allowed,
        module_required="recruitment",
    ),
    SearchableEntity(
        key="candidate", label="Candidate", module="People", module_key="people", icon="user",
        model=Candidate, search_fields=["full_name", "email", "phone", "current_company", "skills", "location"],
        title_fields=["full_name"],
        href=lambda item: "/hr/recruitment/candidates",
        subtitle=lambda item: f"{getattr(item, 'email', '')} · {getattr(item, 'status', '')}",
        parent=lambda item: "People → Hiring",
        extra_filter=lambda: {"deleted_at": None},
        can_access=hr_access_allowed,
        module_required="recruitment",
    ),
    SearchableEntity(
        key="application", label="Application", module="People", module_key="people", icon="user",
        model=Application, search_fields=["tracking_code", "status"],
        title_fields=["tracking_code"],
        href=lambda item: "/hr/recruitment/inbox",
        subtitle=lambda item: f"Application · {item.status}",
        parent=lambda item: "People → Hiring",
        extra_filter=lambda: {"deleted_at": None},
        can_access=hr_access_allowed,
        module_required="recruitment",
    ),
    SearchableEntity(
        key="interview", label="Interview", module="People", module_key="people", icon="calendar",
        model=Interview, search_fields=["panel_name", "feedback", "notes", "interview_type"],
        title_fields=["panel_name", "interview_type"],
        href=lambda item: "/hr/recruitment/interviews",
        subtitle=lambda item: f"{item.interview_type} · {item.status}",
        parent=lambda item: "People → Hiring",
        can_access=hr_access_allowed,
        module_required="recruitment",
    ),
    SearchableEntity(
        key="offer", label="Offer", module="People", module_key="people", icon="task",
        model=Offer, search_fields=["offer_number", "job_title", "department"],
        title_fields=["job_title", "offer_number"],
        href=lambda item: "/hr/recruitment/offers",
        subtitle=lambda item: f"Offer · {getattr(item, 'status', '')}",
        parent=lambda item: "People → Hiring",
        can_access=hr_access_allowed,
        module_required="recruitment",
    ),

    # ── Clients & CRM ─────────────────────────────────────────────────────────
    SearchableEntity(
        key="client", label="Client", module="Clients", module_key="clients", icon="client",
        model=Client, search_fields=["name", "company_name", "email", "contact", "tags", "city"],
        title_fields=["name"],
        href=lambda item: f"/clients/{item.id}/workspace",
        subtitle=lambda item: f"{getattr(item, 'company_name', '') or getattr(item, 'email', '')} · {getattr(item, 'status', '')}",
        parent=lambda item: "Clients → All Clients",
        can_access=lambda user: _normalize_role(getattr(user, "role", None)) in ADMIN_ROLES,
    ),
    SearchableEntity(
        key="crm_company", label="Company", module="CRM", module_key="sales", icon="client",
        model=CRMCompany, search_fields=["name", "email", "phone", "website", "industry", "notes"],
        title_fields=["name"],
        href=lambda item: f"/crm/companies/{item.id}",
        subtitle=lambda item: f"{getattr(item, 'industry', '')} · {getattr(item, 'email', '')}",
        parent=lambda item: "CRM → Companies",
        extra_filter=lambda: {"deleted": False},
        module_required="sales_crm",
        can_access=lambda user: _normalize_role(getattr(user, "role", None)) in TEAM_ROLES,
    ),
    SearchableEntity(
        key="lead", label="Lead", module="CRM", module_key="sales", icon="crm",
        model=SalesProspect, search_fields=[
            "prospect_name", "first_name", "last_name", "company_name", "email", "phone",
            "industry", "requirement", "remark",
        ],
        title_fields=["prospect_name", "first_name", "last_name", "company_name"],
        href=lambda item: f"/crm/leads/{item.id}",
        subtitle=lambda item: f"{getattr(item, 'current_stage', 'new')} · {getattr(item, 'email', '') or getattr(item, 'phone', '')}",
        parent=lambda item: "CRM → Leads",
        extra_filter=lambda: {"deleted": False},
        module_required="sales_crm",
    ),
    SearchableEntity(
        key="contact", label="Contact", module="CRM", module_key="sales", icon="crm",
        model=SalesContact, search_fields=["first_name", "last_name", "email", "phone", "company_name", "designation"],
        title_fields=["first_name", "last_name", "company_name"],
        href=lambda item: "/crm/contacts",
        subtitle=lambda item: f"{item.email or item.phone} · {getattr(item, 'company_name', '')}",
        parent=lambda item: "CRM → Contacts",
        extra_filter=lambda: {"deleted": False},
        module_required="sales_crm",
        can_access=lambda user: _normalize_role(getattr(user, "role", None)) in TEAM_ROLES,
    ),
    SearchableEntity(
        key="deal", label="Deal", module="CRM", module_key="sales", icon="crm",
        model=CRMDeal, search_fields=["stage", "decision_maker", "negotiation_notes"],
        title_fields=["stage"],
        href=lambda item: f"/crm/leads/{item.lead_id}",
        subtitle=lambda item: f"Deal · {item.stage} · ₹{item.value:,.0f}" if item.value else f"Deal · {item.stage}",
        parent=lambda item: "CRM → Pipeline",
        extra_filter=lambda: {"archived": False},
        module_required="sales_crm",
    ),
    SearchableEntity(
        key="crm_document", label="Document", module="CRM", module_key="sales", icon="client",
        model=CRMDocument, search_fields=["title", "document_number", "notes", "status"],
        title_fields=["title"],
        href=lambda item: f"/crm/leads/{item.lead_id}",
        subtitle=lambda item: f"{item.document_number} · {item.document_type} · {item.status}",
        parent=lambda item: "CRM → Documents",
        module_required="sales_crm",
    ),

    # ── Finance ───────────────────────────────────────────────────────────────
    SearchableEntity(
        key="invoice", label="Invoice", module="Finance", module_key="finance", icon="client",
        model=Invoice, search_fields=["invoice_number", "client_name", "client_email", "client_company_name", "notes"],
        title_fields=["invoice_number", "client_name"],
        href=lambda item: "/invoices",
        subtitle=lambda item: f"{item.client_name} · {item.status} · ₹{item.total_amount:,.0f}",
        parent=lambda item: "Finance → Invoices",
        module_required="invoicing_ledger",
        can_access=lambda user: _normalize_role(getattr(user, "role", None)) in ADMIN_ROLES,
    ),
    SearchableEntity(
        key="msa", label="MSA", module="Finance", module_key="finance", icon="client",
        model=MSA, search_fields=["agreement_title", "msa_number", "client_name", "company_name", "notes"],
        title_fields=["agreement_title", "msa_number", "client_name"],
        href=lambda item: "/msa",
        subtitle=lambda item: f"{item.client_name} · {item.status}",
        parent=lambda item: "Finance → MSA",
        can_access=lambda user: _normalize_role(getattr(user, "role", None)) in ADMIN_ROLES,
    ),

    # ── Calendar & Inbox ──────────────────────────────────────────────────────
    SearchableEntity(
        key="meeting", label="Meeting", module="Calendar", module_key="calendar", icon="calendar",
        model=Meeting, search_fields=["title", "description"],
        title_fields=["title"],
        href=lambda item: "/meetings",
        subtitle=lambda item: f"{item.meeting_date} {item.meeting_time} · {item.status}",
        parent=lambda item: "Calendar → Meetings",
    ),
    SearchableEntity(
        key="notification", label="Notification", module="Inbox", module_key="inbox", icon="message",
        model=Notification, search_fields=["title", "message", "type"],
        title_fields=["title"],
        href=lambda item: getattr(item, "action_url", None) or "/notifications",
        subtitle=lambda item: f"{item.type} · {getattr(item, 'is_read', False) and 'Read' or 'Unread'}",
        parent=lambda item: "Inbox → Notifications",
        scope_filter=lambda user: _user_notification_scope(user),
    ),
    SearchableEntity(
        key="conversation", label="Chat", module="Inbox", module_key="inbox", icon="message",
        model=Conversation, search_fields=["group_name", "last_message"],
        title_fields=["group_name", "last_message"],
        href=lambda item: "/chat",
        subtitle=lambda item: f"{'Group' if getattr(item, 'is_group', False) else 'Direct'} chat · {getattr(item, 'last_message', '')}",
        parent=lambda item: "Inbox → Chat",
        scope_filter=lambda user: _conversation_scope(user),
        module_required="chat",
    ),
    SearchableEntity(
        key="chat_message", label="Message", module="Inbox", module_key="inbox", icon="message",
        model=ChatMessage, search_fields=["content", "sender_name", "file_name"],
        title_fields=["content"],
        href=lambda item: "/chat",
        subtitle=lambda item: f"{item.sender_name} · {getattr(item, 'message_type', 'text')}",
        parent=lambda item: "Inbox → Chat",
        extra_filter=lambda: {"is_deleted": False},
        scope_filter=_chat_message_scope,
        module_required="chat",
    ),

    # ── AI Workspace ──────────────────────────────────────────────────────────
    SearchableEntity(
        key="knowledge", label="Knowledge", module="AI Workspace", module_key="ai", icon="crm",
        model=KnowledgeRecord, search_fields=["title", "summary", "content", "tags"],
        title_fields=["title"],
        href=lambda item: "/ai-hub",
        subtitle=lambda item: f"{item.knowledge_type} · {item.status}",
        parent=lambda item: "AI Workspace → Knowledge",
        extra_filter=lambda: {"status": {"$nin": ["deleted", "archived"]}},
        module_required="ai_agents",
    ),

    # ── Settings & Admin ──────────────────────────────────────────────────────
    SearchableEntity(
        key="automation", label="Automation Rule", module="Settings", module_key="settings", icon="project",
        model=AutomationRule, search_fields=["name", "description"],
        title_fields=["name"],
        href=lambda item: "/workflows",
        subtitle=lambda item: f"{item.trigger_type} · {'Active' if item.is_active else 'Inactive'}",
        parent=lambda item: "Settings → Automation Rules",
        module_required="task",
        can_access=lambda user: _normalize_role(getattr(user, "role", None)) in ADMIN_ROLES,
    ),
    SearchableEntity(
        key="workflow", label="Workflow", module="Settings", module_key="settings", icon="project",
        model=Workflow, search_fields=["name", "description"],
        title_fields=["name"],
        href=lambda item: "/workflows",
        subtitle=lambda item: f"Workflow · {getattr(item, 'is_active', True) and 'Active' or 'Inactive'}",
        parent=lambda item: "Settings → Automation Rules",
        module_required="task",
        can_access=lambda user: _normalize_role(getattr(user, "role", None)) in ADMIN_ROLES,
    ),
]


# ── Query + scoring primitives ────────────────────────────────────────────────
def _company_scope(user: User) -> Dict[str, Any]:
    if _normalize_role(getattr(user, "role", None)) == UserRole.SUPER_ADMIN:
        return {}
    return {"company_id": user.company_id}


def _regex(value: str) -> Dict[str, Any]:
    return {"$regex": re.escape(value), "$options": "i"}


def normalize_query(q: str) -> str:
    """Collapse whitespace so '  project   alpha ' and 'project alpha' match the same records."""
    return re.sub(r"\s+", " ", (q or "").strip().lower())


def _field_text(item: Any, field: str) -> str:
    value = getattr(item, field, None)
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return " ".join(str(part) for part in value)
    return str(value)


def _fields_text(item: Any, fields: List[str]) -> str:
    return " ".join(_field_text(item, field) for field in fields)


def _score_item(item: Any, entity: SearchableEntity, tokens: List[str]) -> int:
    if not tokens:
        return 50
    title_haystack = _fields_text(item, entity.title_fields).lower()
    full_haystack = _fields_text(item, entity.search_fields).lower()
    phrase = " ".join(tokens)
    score = 0
    if title_haystack == phrase:
        score += 1000
    elif title_haystack.startswith(phrase):
        score += 800
    elif phrase in title_haystack:
        score += 600
    if any(token in title_haystack for token in tokens):
        score += 300
    if any(token in full_haystack for token in tokens):
        score += 150
    if all(token in full_haystack for token in tokens):
        score += 120
    return score


async def _search_entity(
    entity: SearchableEntity,
    user: User,
    tokens: List[str],
) -> List[Dict[str, Any]]:
    if not entity.can_access(user):
        return []
    if not module_allowed(user, entity.module_required):
        return []

    scope = _company_scope(user)
    if entity.scope_filter:
        scope = await entity.scope_filter(user)
        scope.update(_company_scope(user) if _company_scope(user) else {})
    query = dict(scope)
    query.update(entity.extra_filter())
    if tokens:
        query["$and"] = [
            {"$or": [{field: _regex(token)} for field in entity.search_fields]}
            for token in tokens
        ]

    try:
        rows = await entity.model.find(query).limit(entity.pool).to_list()
    except Exception:
        # A malformed field reference on any single entity must never break the
        # whole search — skip the entity and let the others return.
        return []

    results = []
    for item in rows:
        score = _score_item(item, entity, tokens)
        if score <= 0:
            continue
        results.append({
            "id": str(getattr(item, "id", "")),
            "type": entity.key,
            "title": _fields_text(item, entity.title_fields).strip() or entity.label,
            "subtitle": entity.subtitle(item) or "",
            "href": entity.href(item),
            "module": entity.module,
            "moduleKey": entity.module_key,
            "parent": entity.parent(item) or entity.module,
            "score": score,
            "updated_at": str(getattr(item, "updated_at", "")) if getattr(item, "updated_at", None) else None,
        })
    results.sort(key=lambda row: (-row["score"], str(row.get("updated_at") or "")), reverse=False)
    return results[: entity.limit]


def _search_cache_key(user: User, module: Optional[str], q: str, limit: int) -> str:
    """Tenant-safe, user-scoped cache key.

    Results are permission-filtered per user, so the key embeds both the
    company (tenant isolation) and the user id — a tenant or user can only
    ever read back its own cached result set. The query is normalized so
    "  Proj " and "proj" share one entry.
    """
    company = getattr(user, "company_id", None) or "platform"
    return f"search:{company}:{user.id}:{module or 'all'}:{limit}:{normalize_query(q)}"


async def global_search(
    q: str,
    current_user: User,
    limit: int = 40,
    module: Optional[str] = None,
) -> Dict[str, Any]:
    """Run the registry search and group results by navigation module.

    Repeated queries (backspace re-typing, module-filter clicks, repeat
    searches while typing) hit a short per-user Redis cache so the ~35
    parallel regex scans only run for genuinely new queries.
    """
    tokens = normalize_query(q).split() if normalize_query(q) else []
    if not tokens:
        return {"query": q, "total": 0, "groups": []}

    import asyncio

    cache_key = _search_cache_key(current_user, module, q, limit)
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    entity_results = await asyncio.gather(
        *[_search_entity(entity, current_user, tokens) for entity in SEARCHABLE_ENTITIES]
    )

    # De-duplicate by (type, id) — a record can only appear once.
    seen = set()
    groups: Dict[str, Dict[str, Any]] = {}
    for rows in entity_results:
        for row in rows:
            dedupe_key = (row["type"], row["id"])
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            group = groups.setdefault(
                row["moduleKey"],
                {"module": row["module"], "moduleKey": row["moduleKey"], "items": []},
            )
            group["items"].append(row)

    ordered_groups = []
    for group in groups.values():
        group["items"].sort(key=lambda row: -row["score"])
        ordered_groups.append(group)
    ordered_groups.sort(key=lambda group: -max((item["score"] for item in group["items"]), default=0))

    if module:
        ordered_groups = [group for group in ordered_groups if group["moduleKey"] == module]

    total = 0
    capped_groups = []
    for group in ordered_groups:
        capped_items = group["items"][: limit]
        capped_groups.append({**group, "items": capped_items})
        total += len(capped_items)

    result = {"query": q, "total": total, "groups": capped_groups}
    await cache_set(cache_key, result, ttl=settings.SEARCH_CACHE_TTL)
    return result
