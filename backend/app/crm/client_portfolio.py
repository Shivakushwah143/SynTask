from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from beanie.exceptions import CollectionWasNotInitialized

from app.core.clock import utc_now
from app.crm.client_commercial import load_client_finance
from app.crm.client_health import calculate_client_health, sync_client_health
from app.models.automation import AutomationExecution
from app.models.client import Client, ClientStatus
from app.models.client_deliverable import ClientDeliverable
from app.models.client_deliverable import ClientApprovalStatus, ClientDeliverableStatus
from app.models.client_saved_view import ClientSavedView
from app.models.client_service import ClientService, ClientServiceStatus
from app.models.invoice import Invoice
from app.models.meeting import Meeting
from app.models.notification import Notification, NotificationType
from app.models.project import Project
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.user import User


DEFAULT_SAVED_VIEWS = [
    {"name": "My Clients", "filters": {"mine": True}},
    {"name": "At Risk", "filters": {"status": "at_risk"}},
    {"name": "Critical", "filters": {"health_level": "critical"}},
    {"name": "Renewals This Month", "filters": {"renewal_window": "month"}},
    {"name": "Payment Follow-up", "filters": {"attention_type": "invoice_overdue"}},
    {"name": "Delayed Delivery", "filters": {"attention_type": "deliverable_overdue"}},
    {"name": "No Recent Activity", "filters": {"attention_type": "communication_inactive"}},
]


def _company_query(user: User) -> Dict[str, Any]:
    if getattr(user, "role", None) and getattr(user.role, "value", user.role) == "super_admin":
        return {}
    return {"company_id": str(user.company_id)}


def _status_value(value: Any) -> str:
    return str(getattr(value, "value", value) or "").lower()


def _amount(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _open_client_url(client_id: str, tab: str = "overview") -> str:
    suffix = "" if tab == "overview" else f"?tab={tab}"
    return f"/clients/{client_id}/workspace{suffix}"


async def _safe_list(model: Any, query: Dict[str, Any], *, sort: Optional[str] = None, limit: Optional[int] = None) -> List[Any]:
    try:
        finder = model.find(query)
        if sort:
            finder = finder.sort(sort)
        if limit:
            finder = finder.limit(limit)
        return await finder.to_list()
    except CollectionWasNotInitialized:
        return []


async def _client_related(client: Client) -> Dict[str, Any]:
    company_id = str(client.company_id)
    client_id = str(client.id)
    project_ids = [str(item) for item in (client.project_ids or []) if item]
    projects = await _safe_list(Project, {"company_id": company_id, "$or": [{"client_id": client_id}, {"_id": {"$in": project_ids}}, {"project_id": {"$in": project_ids}}]}, sort="-updated_at")
    project_keys = list({str(getattr(p, "id", "")) for p in projects} | {str(getattr(p, "project_id", "")) for p in projects if getattr(p, "project_id", None)} | set(project_ids))
    tasks = await _safe_list(Task, {"company_id": company_id, "$or": [{"project_object_id": {"$in": project_keys}}, {"project_id": {"$in": project_keys}}]}, sort="-updated_at") if project_keys else []
    deliverables = await _safe_list(ClientDeliverable, {"company_id": company_id, "client_id": client_id}, sort="-updated_at")
    invoices = await _safe_list(Invoice, {"company_id": company_id, "client_id": client_id}, sort="-updated_at")
    services = await _safe_list(ClientService, {"company_id": company_id, "client_id": client_id}, sort="-updated_at")
    meetings = await _safe_list(Meeting, {"company_id": company_id, "client_id": client_id}, sort="-meeting_date")
    return {"projects": projects, "tasks": tasks, "deliverables": deliverables, "invoices": invoices, "services": services, "meetings": meetings}


def _project_summary(project: Project) -> Dict[str, Any]:
    return {"id": str(project.id), "project_id": project.project_id, "name": project.name, "status": _status_value(project.status), "updated_at": project.updated_at}


def _deliverable_summary(item: Any) -> Dict[str, Any]:
    return {
        "id": str(item.id),
        "title": item.title,
        "status": _status_value(item.status),
        "approval_status": _status_value(item.approval_status),
        "due_date": item.due_date,
        "updated_at": item.updated_at,
        "revision_count": item.revision_count,
    }


def _task_summary(task: Task) -> Dict[str, Any]:
    return {"id": str(task.id), "title": task.title, "status": _status_value(task.status), "due_date": task.due_date, "updated_at": task.updated_at, "assigned_to": task.assigned_to}


def _meeting_summary(meeting: Meeting) -> Dict[str, Any]:
    return {"id": str(meeting.id), "title": meeting.title, "status": _status_value(meeting.status), "meeting_date": meeting.meeting_date, "updated_at": meeting.updated_at}


def _client_card(client: Client, health: Dict[str, Any], finance: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(client.id),
        "name": client.name,
        "company_name": client.company_name,
        "status": _status_value(client.status),
        "owner_id": client.account_owner_id or client.assigned_to or client.sales_owner_id,
        "health": {"score": health.get("score"), "level": health.get("level"), "label": health.get("label")},
        "value": finance.get("client_value") or finance.get("contract_value") or _amount(client.budget),
        "outstanding": finance.get("outstanding", 0),
        "url": _open_client_url(str(client.id)),
    }


async def build_client_portfolio_overview(current_user: User, *, limit: int = 10) -> Dict[str, Any]:
    query = _company_query(current_user)
    clients = await _safe_list(Client, query, sort="-updated_at", limit=200)
    active_statuses = {ClientStatus.ACTIVE.value, ClientStatus.ONBOARDING.value, ClientStatus.RENEWAL_DUE.value, ClientStatus.AT_RISK.value}
    kpis = {"total_clients": 0, "active_clients": 0, "at_risk": 0, "renewal_due": 0, "outstanding_revenue": 0.0, "mrr": 0.0, "active_projects": 0, "overall_health": 100}
    attention: List[Dict[str, Any]] = []
    daily_actions: List[Dict[str, Any]] = []
    insights = {"new_clients": 0, "churned": 0, "renewals": 0, "churn_reasons": {}, "top_clients_by_value": [], "at_risk_or_critical": 0, "delayed_delivery": 0}
    health_scores: List[float] = []
    now = utc_now()

    for client in clients:
        related = await _client_related(client)
        finance = await load_client_finance(client, related["invoices"], related["services"])
        deliverables = [_deliverable_summary(item) for item in related["deliverables"]]
        health = calculate_client_health(
            client,
            projects=[_project_summary(item) for item in related["projects"]],
            tasks=related["tasks"],
            meetings=[_meeting_summary(item) for item in related["meetings"]],
            deliverables=deliverables,
            invoices=related["invoices"],
            communication=[],
            finance=finance,
            renewal=(client.lifecycle_metadata or {}).get("renewal"),
            now=now,
        )
        await sync_client_health(client, current_user, health)
        status_value = _status_value(client.status)
        kpis["total_clients"] += 1
        kpis["active_clients"] += int(status_value in active_statuses)
        kpis["at_risk"] += int(status_value == ClientStatus.AT_RISK.value)
        kpis["renewal_due"] += int(status_value == ClientStatus.RENEWAL_DUE.value)
        kpis["outstanding_revenue"] += _amount(finance.get("outstanding"))
        kpis["mrr"] += _amount(finance.get("monthly_value"))
        kpis["active_projects"] += sum(1 for project in related["projects"] if _status_value(project.status) not in {"completed", "closed", "archived"})
        health_scores.append(_amount(health.get("score")))
        insights["new_clients"] += int(status_value == ClientStatus.NEW.value)
        insights["churned"] += int(status_value == ClientStatus.CHURNED.value)
        insights["renewals"] += int(status_value == ClientStatus.RENEWAL_DUE.value)
        churn_reason = ((client.lifecycle_metadata or {}).get("churn") or {}).get("reason")
        if churn_reason:
            insights["churn_reasons"][churn_reason] = insights["churn_reasons"].get(churn_reason, 0) + 1
        insights["at_risk_or_critical"] += int(health.get("level") in {"at_risk", "critical"})
        insights["delayed_delivery"] += sum(1 for reason in health.get("reasons", []) if reason.get("type") in {"task_overdue", "deliverable_overdue"})
        insights["top_clients_by_value"].append(_client_card(client, health, finance))
        for reason in health.get("reasons", [])[:3]:
            attention.append({
                "client": _client_card(client, health, finance),
                "type": reason.get("type"),
                "message": reason.get("message"),
                "severity": reason.get("severity"),
                "url": _open_client_url(str(client.id), reason.get("tab") or "overview"),
            })
        next_action = (client.lifecycle_metadata or {}).get("client_next_action") or health.get("next_action")
        if next_action and next_action.get("status") != "completed":
            daily_actions.append({"client": _client_card(client, health, finance), **next_action, "url": _open_client_url(str(client.id), (next_action.get("related_entity") or {}).get("tab") or "overview")})

    kpis["overall_health"] = round(sum(health_scores) / len(health_scores), 1) if health_scores else 100
    insights["churn_rate"] = round((insights["churned"] / kpis["total_clients"]) * 100, 1) if kpis["total_clients"] else 0
    insights["top_clients_by_value"] = sorted(insights["top_clients_by_value"], key=lambda item: item["value"], reverse=True)[:limit]
    return {
        "kpis": kpis,
        "needs_attention": sorted(attention, key=lambda item: item.get("severity") or 0, reverse=True)[:limit],
        "insights": insights,
        "daily_actions": daily_actions[:limit],
    }


def _automation_key(client_id: str, trigger: str, issue: str) -> str:
    return f"client:{client_id}:{trigger}:{issue}"


async def _automation_exists(company_id: str, key: str) -> bool:
    try:
        existing = await AutomationExecution.find_one({"company_id": company_id, "entity_type": "client", "entity_id": key, "status": "success"})
    except CollectionWasNotInitialized:
        existing = None
    return existing is not None


async def _record_automation(company_id: str, key: str, action: str) -> None:
    execution = AutomationExecution(rule_id="client_phase9_builtin", company_id=company_id, trigger_type="client_portfolio", triggered_by="system", entity_type="client", entity_id=key, status="success", actions_executed=[action])
    await execution.insert()


async def _create_client_task(client: Client, title: str, owner_id: Optional[str], key: str, priority: str = "high") -> Optional[Task]:
    company_id = str(client.company_id)
    if await _automation_exists(company_id, key):
        return None
    task = Task(
        title=title,
        description=f"Generated from Client automation for {client.name}.",
        company_id=company_id,
        created_by=owner_id or client.created_by,
        assigned_to=owner_id,
        status=TaskStatus.TODO,
        priority=TaskPriority.CRITICAL if priority == "critical" else TaskPriority.HIGH,
        due_date=utc_now() + timedelta(days=1),
        related_entity_type="client",
        related_entity_id=str(client.id),
        related_entity_url=_open_client_url(str(client.id)),
        source_type="client_automation",
    )
    await task.insert()
    notification = Notification(user_id=owner_id or client.created_by, company_id=company_id, type=NotificationType.SYSTEM, title=title, message=f"{client.name}: {title}", related_id=str(client.id), related_type="client", action_url=_open_client_url(str(client.id)), priority=priority, metadata={"automation_key": key})
    await notification.insert()
    await _record_automation(company_id, key, "create_task_notify_owner")
    return task


async def run_client_automation(current_user: User, *, limit: int = 50) -> Dict[str, Any]:
    query = _company_query(current_user)
    clients = await _safe_list(Client, query, sort="-updated_at", limit=limit)
    created: List[Dict[str, Any]] = []
    for client in clients:
        owner_id = client.account_owner_id or client.assigned_to or client.sales_owner_id or client.created_by
        related = await _client_related(client)
        finance = await load_client_finance(client, related["invoices"], related["services"])
        health = (client.lifecycle_metadata or {}).get("client_health") or {}
        renewal = (client.lifecycle_metadata or {}).get("renewal") or {}
        if finance.get("overdue", 0) > 0:
            key = _automation_key(str(client.id), "invoice_overdue", "payment")
            task = await _create_client_task(client, "Follow up overdue payment", owner_id, key, "high")
            if task:
                created.append({"client_id": str(client.id), "trigger": "invoice_overdue", "task_id": str(task.id)})
        if health.get("level") in {"at_risk", "critical"}:
            key = _automation_key(str(client.id), "health_escalation", health.get("reason_keys", ["risk"])[0])
            task = await _create_client_task(client, "Review client escalation", owner_id, key, "critical")
            if task:
                created.append({"client_id": str(client.id), "trigger": "health_escalation", "task_id": str(task.id)})
        end_date = renewal.get("contract_end_date") or renewal.get("renewal_date")
        if isinstance(end_date, datetime) and 0 <= (end_date.date() - utc_now().date()).days <= 30:
            key = _automation_key(str(client.id), "renewal_approaching", end_date.date().isoformat())
            task = await _create_client_task(client, "Start renewal discussion", owner_id, key, "high")
            if task:
                created.append({"client_id": str(client.id), "trigger": "renewal_approaching", "task_id": str(task.id)})
        metadata = client.lifecycle_metadata or {}
        for reason in (health.get("reasons") or []):
            if reason.get("type") in {"approval_delay", "communication_inactive"}:
                key = _automation_key(str(client.id), reason["type"], reason.get("related_id") or "client")
                task = await _create_client_task(client, reason.get("message") or "Follow up client", owner_id, key, "high")
                if task:
                    created.append({"client_id": str(client.id), "trigger": reason["type"], "task_id": str(task.id)})
        client.lifecycle_metadata = metadata
    return {"created": created, "created_count": len(created)}


async def list_client_saved_views(current_user: User) -> Dict[str, Any]:
    query = {"owner_id": str(current_user.id), **_company_query(current_user)}
    views = await _safe_list(ClientSavedView, query, sort="-updated_at")
    return {"defaults": DEFAULT_SAVED_VIEWS, "views": [{"id": str(v.id), "name": v.name, "filters": v.filters, "is_default": v.is_default} for v in views]}
