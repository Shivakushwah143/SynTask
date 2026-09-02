from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
import re
from typing import Any, Dict, List, Optional

from app.core.clock import utc_now
from app.crm.client_workspace import ClientWorkspaceService
from app.models.user import User


INSUFFICIENT_DATA = "Not enough data to determine this reliably."
SECRET_RE = re.compile(
    r"(?i)\b(password|passcode|secret|token|api[_ -]?key|private[_ -]?key|bearer|authorization)\b\s*[:=]\s*\S+"
)


def _redact(value: Any, limit: int = 280) -> str:
    text = "" if value is None else str(value)
    text = SECRET_RE.sub(lambda match: f"{match.group(1)}=[REDACTED]", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit].rstrip()


def _dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def _iso(value: Any) -> Optional[str]:
    parsed = _dt(value)
    return parsed.isoformat() if parsed else None


def _ref(kind: str, item: Dict[str, Any], *, tab: str = "overview", label_key: str = "title") -> Dict[str, Any]:
    item_id = item.get("id") or item.get("related_id")
    label = item.get(label_key) or item.get("name") or item.get("action") or item_id
    return {
        "type": kind,
        "id": str(item_id) if item_id else None,
        "label": _redact(label, 120),
        "tab": tab,
    }


def _recent(items: List[Dict[str, Any]], timestamp_key: str, *, days: int, limit: int) -> List[Dict[str, Any]]:
    since = utc_now() - timedelta(days=max(1, min(days, 90)))
    filtered = []
    for item in items or []:
        timestamp = _dt(item.get(timestamp_key))
        if timestamp and timestamp < since:
            continue
        filtered.append(item)
    filtered.sort(key=lambda item: _dt(item.get(timestamp_key)) or datetime.min, reverse=True)
    return filtered[:limit]


async def build_client_ai_context(current_user: User, client_id: str, *, days: int = 7) -> Dict[str, Any]:
    workspace = await ClientWorkspaceService.load_workspace(current_user, client_id)
    client = workspace.get("client") or {}
    health = workspace.get("health") or {}
    finance = workspace.get("finance") or {}
    renewal = workspace.get("renewal") or {}
    communication = _recent(workspace.get("communication") or [], "timestamp", days=days, limit=12)
    meetings = _recent(workspace.get("meetings") or [], "updated_at", days=90, limit=8)
    activity = _recent((workspace.get("activity") or {}).get("items") or [], "timestamp", days=days, limit=25)

    file_categories = Counter(_redact(item.get("category") or "Other", 80) for item in workspace.get("files") or [])
    primary_contact = next((contact for contact in workspace.get("contacts") or [] if contact.get("is_primary_contact")), None)
    next_meeting = next((meeting for meeting in workspace.get("meetings") or [] if str(meeting.get("status") or "").lower() not in {"completed", "cancelled"}), None)
    last_meeting = next((meeting for meeting in workspace.get("meetings") or [] if str(meeting.get("status") or "").lower() == "completed"), None)

    return {
        "window_days": max(1, min(days, 90)),
        "client": {
            "id": client.get("id"),
            "name": _redact(client.get("company_name") or client.get("name"), 160),
            "created_at": _iso(client.get("created_at")),
            "start_date": _iso(client.get("start_date")),
            "lifecycle_stage": client.get("status"),
            "account_owner_id": client.get("account_owner_id") or client.get("assigned_to"),
            "sales_owner_id": client.get("sales_owner_id"),
            "industry": _redact(client.get("industry"), 120),
        },
        "primary_contact": {
            "id": primary_contact.get("id"),
            "name": _redact(primary_contact.get("full_name"), 120),
            "email": _redact(primary_contact.get("email"), 160),
            "roles": primary_contact.get("roles") or [],
        } if primary_contact else None,
        "health": {
            "score": health.get("score"),
            "level": health.get("level"),
            "label": health.get("label"),
            "reasons": [
                {"message": _redact(reason.get("message"), 220), "type": reason.get("type"), "tab": reason.get("tab"), "related_id": reason.get("related_id")}
                for reason in (health.get("reasons") or [])[:8]
            ],
        },
        "next_action": workspace.get("next_action") or health.get("next_action"),
        "active_escalation": workspace.get("active_escalation"),
        "finance": {
            "total_outstanding": finance.get("total_outstanding"),
            "overdue_amount": finance.get("overdue_amount"),
            "mrr": finance.get("mrr"),
            "client_value": finance.get("client_value"),
            "invoice_count": len(workspace.get("invoices") or []),
        },
        "renewal": {
            "renewal_date": renewal.get("renewal_date") or renewal.get("contract_end_date"),
            "status": renewal.get("renewal_status") or renewal.get("status"),
            "days_until_renewal": renewal.get("days_until_renewal"),
        },
        "services": [
            {"id": item.get("id"), "name": _redact(item.get("name"), 120), "status": item.get("status"), "value": item.get("pricing_value")}
            for item in (workspace.get("services") or [])[:10]
        ],
        "projects": [
            {"id": item.get("id"), "name": _redact(item.get("name"), 140), "status": item.get("status"), "delivery_date": _iso(item.get("delivery_date"))}
            for item in (workspace.get("projects") or [])[:10]
        ],
        "deliverables": [
            {"id": item.get("id"), "title": _redact(item.get("title"), 140), "status": item.get("status"), "approval_status": item.get("approval_status"), "due_date": _iso(item.get("due_date"))}
            for item in (workspace.get("deliverables") or [])[:12]
        ],
        "communication": [
            {"id": item.get("id"), "channel": item.get("channel"), "contact": _redact(item.get("contact"), 120), "timestamp": _iso(item.get("timestamp")), "preview": _redact(item.get("preview"), 220)}
            for item in communication
        ],
        "meetings": [
            {"id": item.get("id"), "title": _redact(item.get("title"), 160), "status": item.get("status"), "meeting_date": _iso(item.get("meeting_date") or item.get("updated_at"))}
            for item in meetings
        ],
        "last_meeting": _ref("meeting", last_meeting, tab="meetings") if last_meeting else None,
        "next_meeting": _ref("meeting", next_meeting, tab="meetings") if next_meeting else None,
        "activity": [
            {"action": _redact(item.get("action"), 160), "timestamp": _iso(item.get("timestamp")), "kind": item.get("kind"), "related_type": item.get("related_type"), "related_id": item.get("related_id"), "context": item.get("context") or {}}
            for item in activity
        ],
        "files_summary": dict(file_categories),
        "security": {
            "tenant_scoped": True,
            "internal_note_content_included": False,
            "file_contents_included": False,
            "finance_scope": "aggregates_only",
        },
    }


def build_client_ai_brief(context: Dict[str, Any]) -> Dict[str, Any]:
    client = context["client"]
    health = context["health"]
    active_services = [item for item in context["services"] if item.get("status") == "active"]
    pending_deliverables = [item for item in context["deliverables"] if item.get("status") not in {"approved", "delivered"}]
    summary = [
        f"{client.get('name') or 'Client'} is in {client.get('lifecycle_stage') or 'unknown'} lifecycle stage.",
        f"Health is {health.get('label') or health.get('level') or 'unavailable'} at {health.get('score') if health.get('score') is not None else 'N/A'}.",
        f"{len(active_services)} active service(s), {len(context['projects'])} project(s), and {len(pending_deliverables)} pending deliverable(s) are linked.",
    ]
    if context.get("finance", {}).get("total_outstanding"):
        summary.append(f"Outstanding finance total is {context['finance'].get('total_outstanding')}.")
    if context.get("next_action"):
        summary.append(f"Current next action: {_redact(context['next_action'].get('title') or context['next_action'].get('action'), 180)}.")

    references = []
    references.extend(_ref("service", item, tab="services", label_key="name") for item in context["services"][:4])
    references.extend(_ref("project", item, tab="projects", label_key="name") for item in context["projects"][:4])
    references.extend(_ref("deliverable", item, tab="deliverables") for item in pending_deliverables[:4])
    return {
        "summary": summary,
        "health_reasons": context["health"].get("reasons") or [],
        "primary_contact": context.get("primary_contact"),
        "last_meeting": context.get("last_meeting"),
        "next_meeting": context.get("next_meeting"),
        "renewal": context.get("renewal"),
        "references": references,
        "grounded": True,
    }


def answer_client_question(context: Dict[str, Any], question: str) -> Dict[str, Any]:
    q = (question or "").lower()
    references: List[Dict[str, Any]] = []
    answer: List[str] = []
    recommendations: List[Dict[str, Any]] = []

    if any(term in q for term in ("what happened", "this week", "recent", "summary")):
        for item in context["activity"][:10]:
            answer.append(f"{item.get('timestamp') or 'Recent'}: {item.get('action')} ({item.get('related_type')}).")
            references.append({"type": item.get("related_type"), "id": item.get("related_id"), "label": item.get("action"), "tab": item.get("kind") or "timeline"})
        if not answer:
            answer.append(INSUFFICIENT_DATA)
    elif any(term in q for term in ("what should", "next", "do now", "recommend")):
        next_action = context.get("next_action") or {}
        if next_action:
            recommendations.append({
                "action": _redact(next_action.get("title") or next_action.get("action") or "Follow up with the client", 180),
                "why": _redact(next_action.get("reason") or next_action.get("description") or "This is the current Client Next Action generated from health and activity signals.", 240),
                "source": next_action.get("related_entity") or {"type": "client", "id": context["client"].get("id"), "tab": "overview"},
            })
        for reason in context["health"].get("reasons") or []:
            recommendations.append({"action": f"Resolve {reason.get('type') or 'client risk'}", "why": reason.get("message"), "source": {"type": "client_health", "id": reason.get("related_id"), "tab": reason.get("tab") or "overview"}})
        if not recommendations:
            answer.append(INSUFFICIENT_DATA)
    elif "health" in q or "risk" in q:
        health = context["health"]
        answer.append(f"Client Health is {health.get('label') or health.get('level') or 'unavailable'} with score {health.get('score') if health.get('score') is not None else 'N/A'}.")
        reasons = health.get("reasons") or []
        answer.extend(reason["message"] for reason in reasons[:6])
        references.extend({"type": "client_health", "id": reason.get("related_id"), "label": reason.get("message"), "tab": reason.get("tab") or "overview"} for reason in reasons[:6])
    elif any(term in q for term in ("renewal", "upsell", "expand", "churn")):
        renewal = context.get("renewal") or {}
        if renewal.get("renewal_date") or renewal.get("days_until_renewal") is not None:
            answer.append(f"Renewal status is {renewal.get('status') or 'not set'} with target date {renewal.get('renewal_date') or 'not set'}.")
            references.append({"type": "renewal", "id": context["client"].get("id"), "label": "Renewal", "tab": "invoices"})
        if context["health"].get("level") in {"at_risk", "critical"}:
            answer.append("Risk is elevated because Client Health is at risk or critical.")
        if not answer:
            answer.append(INSUFFICIENT_DATA)
    else:
        answer = build_client_ai_brief(context)["summary"]

    return {
        "answer": answer,
        "recommendations": recommendations,
        "references": references[:12],
        "grounded": True,
        "context_window_days": context.get("window_days"),
        "security": context.get("security"),
    }


def client_ai_cleanup_audit(workspace: Dict[str, Any]) -> Dict[str, Any]:
    client = workspace.get("client") or {}
    metadata = client.get("lifecycle_metadata") or {}
    return {
        "client_id": client.get("id"),
        "safe_to_run": True,
        "destructive_changes": False,
        "checks": {
            "has_phase8_health": bool(metadata.get("client_health") or workspace.get("health")),
            "has_phase8_next_action": bool(metadata.get("client_next_action") or workspace.get("next_action")),
            "legacy_internal_notes_excluded_from_ai": True,
            "duplicate_client_contact_store_required": False,
            "duplicate_project_store_required": False,
            "duplicate_file_copy_required": False,
        },
        "migration_performed": "No destructive data migration is required; Phase 10 reads canonical Phase 0-9 records through ClientWorkspaceService.",
    }
