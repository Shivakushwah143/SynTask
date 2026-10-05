from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.models.client import Client, ClientStatus
from app.models.client_deliverable import ClientApprovalStatus, ClientDeliverableStatus
from app.models.client_service import ClientService
from app.models.invoice import Invoice
from app.models.task import TaskStatus
from app.models.user import User


HEALTH_LEVELS = ("healthy", "attention_needed", "at_risk", "critical")
NEXT_ACTION_STATUSES = {"open", "completed"}
OPERATIONAL_CLIENT_STATUSES = {ClientStatus.ACTIVE, ClientStatus.AT_RISK, ClientStatus.ON_HOLD, ClientStatus.RENEWAL_DUE}


def _dt(value: Any) -> Optional[datetime]:
    return value if isinstance(value, datetime) else None


def _days_overdue(value: Any, now: datetime) -> int:
    date_value = _dt(value)
    if not date_value or date_value >= now:
        return 0
    return max((now.date() - date_value.date()).days, 1)


def _status_value(value: Any) -> str:
    return str(getattr(value, "value", value) or "").lower()


def _append_history(metadata: Dict[str, Any], key: str, snapshot: Dict[str, Any]) -> None:
    history_key = f"{key}_history"
    history = list(metadata.get(history_key) or [])
    previous = history[-1]["snapshot"] if history else metadata.get(key)
    if previous and previous.get("score") == snapshot.get("score") and previous.get("level") == snapshot.get("level") and previous.get("reason_keys") == snapshot.get("reason_keys"):
        return
    history.append({"at": snapshot["calculated_at"], "snapshot": snapshot})
    metadata[history_key] = history[-50:]


def _reason(reason_type: str, message: str, severity: int, source: str, tab: str, related_id: Optional[str] = None, count: int = 1) -> Dict[str, Any]:
    return {
        "type": reason_type,
        "message": message,
        "severity": severity,
        "source": source,
        "tab": tab,
        "related_id": related_id,
        "count": count,
    }


def _field(item: Any, key: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(key, default)
    return getattr(item, key, default)


def _score_level(score: int) -> str:
    if score <= 39:
        return "critical"
    if score <= 59:
        return "at_risk"
    if score <= 79:
        return "attention_needed"
    return "healthy"


def _owner_for_client(client: Client, reasons: List[Dict[str, Any]]) -> Optional[str]:
    for reason in reasons:
        if reason.get("owner"):
            return reason["owner"]
    return client.account_owner_id or client.assigned_to or client.sales_owner_id


def _suggest_next_action(client: Client, reasons: List[Dict[str, Any]], now: datetime) -> Dict[str, Any]:
    if not reasons:
        return {
            "action": "Maintain regular client touchpoint",
            "owner_id": client.account_owner_id or client.assigned_to or client.sales_owner_id,
            "due_date": now + timedelta(days=7),
            "priority": "low",
            "status": "open",
            "related_entity": {"type": "client", "id": str(client.id), "tab": "overview"},
        }
    top = sorted(reasons, key=lambda item: item.get("severity", 0), reverse=True)[0]
    rules = {
        "invoice_overdue": "Follow up overdue payment",
        "deliverable_overdue": "Complete delayed deliverable",
        "approval_delay": "Follow up for approval",
        "task_overdue": "Complete delayed task",
        "communication_inactive": "Contact Primary Contact",
        "meeting_overdue": "Schedule Client review",
        "renewal_risk": "Start renewal discussion",
        "revision_volume": "Schedule Client review",
    }
    priority = "critical" if top["severity"] >= 30 else ("high" if top["severity"] >= 20 else "medium")
    due_days = 1 if priority in {"critical", "high"} else 3
    return {
        "action": rules.get(top["type"], "Review client risk"),
        "owner_id": _owner_for_client(client, reasons),
        "due_date": now + timedelta(days=due_days),
        "priority": priority,
        "status": "open",
        "related_entity": {"type": top["source"], "id": top.get("related_id") or str(client.id), "tab": top["tab"]},
    }


def _active_escalation(metadata: Dict[str, Any], issue_key: str) -> Optional[Dict[str, Any]]:
    escalation = metadata.get("client_health_escalation")
    if escalation and escalation.get("status") == "open" and escalation.get("issue_key") == issue_key:
        return escalation
    return None


def calculate_client_health(
    client: Client,
    *,
    projects: List[Dict[str, Any]],
    tasks: List[Any],
    meetings: List[Dict[str, Any]],
    deliverables: List[Dict[str, Any]],
    invoices: List[Invoice],
    communication: List[Dict[str, Any]],
    finance: Dict[str, Any],
    renewal: Optional[Dict[str, Any]] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    now = now or utc_now()
    reasons: List[Dict[str, Any]] = []

    overdue_tasks = [
        task for task in tasks
        if _status_value(_field(task, "status")) not in {"completed", "cancelled"}
        and _days_overdue(_field(task, "due_date"), now) > 0
    ]
    if overdue_tasks:
        max_days = max(_days_overdue(_field(task, "due_date"), now) for task in overdue_tasks)
        reasons.append(_reason("task_overdue", f"{len(overdue_tasks)} Tasks overdue", min(30, 8 + len(overdue_tasks) * 4 + max_days), "task", "tasks", str(_field(overdue_tasks[0], "id", "")), len(overdue_tasks)))

    overdue_deliverables = [
        item for item in deliverables
        if _status_value(item.get("status")) not in {ClientDeliverableStatus.APPROVED.value, ClientDeliverableStatus.DELIVERED.value}
        and _days_overdue(item.get("due_date"), now) > 0
    ]
    if overdue_deliverables:
        max_days = max(_days_overdue(item.get("due_date"), now) for item in overdue_deliverables)
        reasons.append(_reason("deliverable_overdue", f"{len(overdue_deliverables)} Deliverables overdue", min(35, 12 + len(overdue_deliverables) * 5 + max_days), "deliverable", "deliverables", overdue_deliverables[0].get("id"), len(overdue_deliverables)))

    delayed_approvals = [
        item for item in deliverables
        if _status_value(item.get("approval_status")) in {ClientApprovalStatus.SENT.value, ClientApprovalStatus.VIEWED.value}
        and _days_overdue(item.get("sent_at") or item.get("updated_at"), now - timedelta(days=3)) > 0
    ]
    if delayed_approvals:
        reasons.append(_reason("approval_delay", f"{len(delayed_approvals)} Client approvals waiting", min(25, 10 + len(delayed_approvals) * 4), "deliverable", "deliverables", delayed_approvals[0].get("id"), len(delayed_approvals)))

    overdue_amount = float((finance or {}).get("overdue") or 0)
    overdue_count = int((finance or {}).get("overdue_count") or 0)
    if overdue_amount > 0 or overdue_count > 0:
        oldest_days = 1
        for invoice in invoices:
            status_value = _status_value(getattr(invoice, "status", None))
            if status_value not in {"paid", "cancelled"} and float(getattr(invoice, "outstanding_amount", 0) or 0) > 0:
                oldest_days = max(oldest_days, _days_overdue(getattr(invoice, "due_date", None), now))
        reasons.append(_reason("invoice_overdue", f"Invoice payment overdue by {oldest_days} days", min(35, 15 + oldest_days + overdue_count * 3), "invoice", "finance", str(getattr(invoices[0], "id", "")) if invoices else None, overdue_count or 1))

    completed_meetings = [item for item in meetings if item.get("status") == "completed"]
    latest_meeting = max((_dt(item.get("meeting_date")) for item in completed_meetings if _dt(item.get("meeting_date"))), default=None)
    overdue_scheduled = [item for item in meetings if item.get("status") == "scheduled" and _days_overdue(item.get("meeting_date"), now) > 0]
    if overdue_scheduled:
        reasons.append(_reason("meeting_overdue", f"{len(overdue_scheduled)} scheduled Meetings are overdue", min(20, 8 + len(overdue_scheduled) * 4), "meeting", "meetings", overdue_scheduled[0].get("id"), len(overdue_scheduled)))
    elif not latest_meeting and _status_value(client.status) in {status.value for status in OPERATIONAL_CLIENT_STATUSES}:
        reasons.append(_reason("meeting_overdue", "No completed Client meeting recorded", 8, "meeting", "meetings", None, 1))

    latest_comm = max((_dt(item.get("timestamp")) for item in communication if _dt(item.get("timestamp"))), default=None)
    if _status_value(client.status) in {status.value for status in OPERATIONAL_CLIENT_STATUSES}:
        inactive_days = (now.date() - latest_comm.date()).days if latest_comm else 30
        if inactive_days >= 14:
            reasons.append(_reason("communication_inactive", f"No Client communication for {inactive_days} days", min(25, 8 + inactive_days // 2), "communication", "communication", None, 1))

    renewal_data = renewal or (client.lifecycle_metadata or {}).get("renewal") or {}
    contract_end = _dt(renewal_data.get("contract_end_date") or renewal_data.get("renewal_date"))
    renewal_status = str(renewal_data.get("status") or "")
    if contract_end and renewal_status not in {"renewed", "churned"}:
        days_until = (contract_end.date() - now.date()).days
        if days_until <= 30:
            label = "past due" if days_until < 0 else f"due in {days_until} days"
            reasons.append(_reason("renewal_risk", f"Renewal {label}", 25 if days_until < 0 else 15, "renewal", "finance", str(client.id), 1))

    revision_count = sum(int(item.get("revision_count") or 0) for item in deliverables)
    if revision_count >= 3:
        reasons.append(_reason("revision_volume", f"{revision_count} requested deliverable revisions", min(25, 8 + revision_count * 3), "deliverable", "deliverables", None, revision_count))

    total_penalty = min(70, sum(reason["severity"] for reason in reasons))
    score = max(0, 100 - total_penalty)
    level = _score_level(score)
    reason_keys = sorted(f"{item['type']}:{item.get('related_id') or item.get('count')}" for item in reasons)
    next_action = _suggest_next_action(client, reasons, now)
    issue_key = reason_keys[0] if reason_keys else "healthy"
    metadata = client.lifecycle_metadata or {}
    escalation = _active_escalation(metadata, issue_key)
    if level in {"at_risk", "critical"} and not escalation:
        escalation = {
            "issue_key": issue_key,
            "status": "open",
            "assigned_to": next_action.get("owner_id"),
            "created_at": now,
            "due_date": now + timedelta(days=1),
            "recommended_action": next_action.get("action"),
            "reason": reasons[0]["message"] if reasons else None,
        }
    return {
        "score": score,
        "level": level,
        "label": level.replace("_", " ").title(),
        "calculated_at": now,
        "reasons": sorted(reasons, key=lambda item: item["severity"], reverse=True),
        "reason_keys": reason_keys,
        "next_action": next_action,
        "active_escalation": escalation if escalation and escalation.get("status") == "open" else None,
        "signals": {
            "overdue_tasks": len(overdue_tasks),
            "overdue_deliverables": len(overdue_deliverables),
            "approval_delays": len(delayed_approvals),
            "overdue_invoices": overdue_count,
            "communication_inactive": any(item["type"] == "communication_inactive" for item in reasons),
            "revision_count": revision_count,
        },
    }


async def sync_client_health(client: Client, current_user: Optional[User], snapshot: Dict[str, Any]) -> Dict[str, Any]:
    metadata = dict(client.lifecycle_metadata or {})
    previous = metadata.get("client_health")
    _append_history(metadata, "client_health", snapshot)
    metadata["client_health"] = snapshot
    if snapshot.get("next_action"):
        existing = metadata.get("client_next_action") or {}
        if existing.get("status") != "open" or existing.get("action") != snapshot["next_action"].get("action"):
            metadata["client_next_action"] = {
                **snapshot["next_action"],
                "created_at": snapshot["calculated_at"],
                "updated_at": snapshot["calculated_at"],
            }
    if snapshot.get("active_escalation"):
        metadata["client_health_escalation"] = snapshot["active_escalation"]
    if previous and previous.get("level") != snapshot.get("level"):
        metadata.setdefault("client_health_level_history", []).append({
            "from": previous.get("level"),
            "to": snapshot.get("level"),
            "at": snapshot["calculated_at"],
            "actor_id": str(getattr(current_user, "id", "")) if current_user else None,
            "reasons": snapshot.get("reasons", []),
        })
    client.lifecycle_metadata = metadata
    client.updated_at = utc_now()
    await client.save()
    return metadata["client_health"]


async def complete_client_next_action(client: Client, current_user: User, status_value: str = "completed") -> Dict[str, Any]:
    if status_value not in NEXT_ACTION_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid next action status")
    metadata = dict(client.lifecycle_metadata or {})
    action = metadata.get("client_next_action")
    if not action:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No next action found")
    action["status"] = status_value
    action["completed_at"] = utc_now() if status_value == "completed" else None
    action["completed_by"] = str(current_user.id) if status_value == "completed" else None
    action["updated_at"] = utc_now()
    metadata["client_next_action"] = action
    if status_value == "completed":
        escalation = metadata.get("client_health_escalation")
        if escalation and escalation.get("status") == "open":
            escalation["status"] = "completed"
            escalation["completed_at"] = action["completed_at"]
            escalation["completed_by"] = str(current_user.id)
            metadata["client_health_escalation"] = escalation
    client.lifecycle_metadata = metadata
    client.updated_at = utc_now()
    await client.save()
    return action
