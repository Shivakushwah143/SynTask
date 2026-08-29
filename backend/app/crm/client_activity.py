from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from beanie.exceptions import CollectionWasNotInitialized

from app.core.clock import utc_now
from app.crm.client_identity import load_contacts_for_client, resolve_crm_company_for_client
from app.models.client import Client
from app.models.client_deliverable import ClientDeliverable
from app.models.client_service import ClientService
from app.models.crm_activity import CRMActivity
from app.models.invoice import Invoice
from app.models.meeting import Meeting
from app.models.project import Project
from app.models.task import Task


CLIENT_COMMUNICATION_TYPES = {"email", "call", "meeting", "follow_up"}


def _when(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.min


def _event(kind: str, action: str, timestamp: Any, related_type: str, related_id: str, context: Optional[Dict[str, Any]] = None, actor: Optional[str] = None) -> Dict[str, Any]:
    return {
        "kind": kind,
        "action": action,
        "timestamp": timestamp,
        "related_type": related_type,
        "related_id": related_id,
        "context": context or {},
        "actor": actor,
    }


async def client_relationship_scope(client: Client, projects: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    try:
        contacts = await load_contacts_for_client(client)
    except CollectionWasNotInitialized:
        contacts = []
    try:
        company_resolution = await resolve_crm_company_for_client(client)
        crm_company_id = str(company_resolution.crm_company.id) if company_resolution.crm_company else client.crm_company_id
    except CollectionWasNotInitialized:
        crm_company_id = client.crm_company_id
    project_ids = set()
    for project in projects or []:
        for key in ("id", "project_id"):
            if project.get(key):
                project_ids.add(str(project[key]))
    for project_id in client.project_ids or []:
        project_ids.add(str(project_id))
    return {
        "crm_company_id": crm_company_id,
        "contact_ids": [str(contact.id) for contact in contacts],
        "project_ids": list(project_ids),
    }


async def load_client_communications(client: Client, projects: Optional[List[Dict[str, Any]]] = None, *, limit: int = 25) -> Dict[str, Any]:
    scope = await client_relationship_scope(client, projects)
    matchers = [{"entity_type": "client", "entity_id": str(client.id)}, {"metadata.client_id": str(client.id)}]
    if scope["crm_company_id"]:
        matchers.append({"entity_type": "company", "entity_id": scope["crm_company_id"]})
    if scope["contact_ids"]:
        matchers.append({"entity_type": "contact", "entity_id": {"$in": scope["contact_ids"]}})
    if scope["project_ids"]:
        matchers.append({"metadata.project_id": {"$in": scope["project_ids"]}})
    try:
        activities = await CRMActivity.find(
            {
                "company_id": str(client.company_id),
                "deleted": False,
                "activity_type": {"$in": list(CLIENT_COMMUNICATION_TYPES | {"note"})},
                "$or": matchers,
            }
        ).sort("-created_at").limit(limit).to_list()
    except CollectionWasNotInitialized:
        activities = []
    communication = []
    internal_notes = []
    for activity in activities:
        payload = {
            "id": str(activity.id),
            "type": activity.activity_type,
            "channel": activity.activity_type,
            "contact": activity.metadata.get("contact_name") if activity.metadata else None,
            "sender": activity.created_by_name or activity.owner_name or activity.created_by,
            "receiver": activity.metadata.get("recipient") if activity.metadata else None,
            "timestamp": activity.completed_at or activity.scheduled_at or activity.created_at,
            "preview": activity.description or activity.title,
            "related_project_id": (activity.metadata or {}).get("project_id"),
            "related_service_id": (activity.metadata or {}).get("service_id"),
            "source": "crm_activity",
        }
        if activity.activity_type == "note":
            internal_notes.append(payload)
        else:
            communication.append(payload)

    try:
        from app.integrations.meta.messaging_models import MetaConversation, MetaMessage

        if scope["contact_ids"]:
            conversations = await MetaConversation.find(
                {"company_id": str(client.company_id), "linked_contact_id": {"$in": scope["contact_ids"]}}
            ).to_list()
            conversation_ids = [str(item.id) for item in conversations]
            if conversation_ids:
                messages = await MetaMessage.find(
                    {"company_id": str(client.company_id), "conversation_id": {"$in": conversation_ids}}
                ).sort("-occurred_at").limit(limit).to_list()
                communication.extend(
                    {
                        "id": str(message.id),
                        "type": "message",
                        "channel": str(message.channel),
                        "contact": None,
                        "sender": message.sender_id,
                        "receiver": message.recipient_id,
                        "timestamp": message.occurred_at or message.created_at,
                        "preview": message.text,
                        "related_project_id": None,
                        "related_service_id": None,
                        "source": "meta_inbox",
                    }
                    for message in messages
                )
    except (CollectionWasNotInitialized, ImportError):
        pass

    communication.sort(key=lambda item: _when(item.get("timestamp")), reverse=True)
    internal_notes.sort(key=lambda item: _when(item.get("timestamp")), reverse=True)
    return {"communication": communication[:limit], "internal_notes": internal_notes[:limit]}


async def build_client_activity(
    client: Client,
    *,
    projects: List[Dict[str, Any]],
    tasks: List[Any],
    meetings: List[Dict[str, Any]],
    services: List[ClientService],
    deliverables: List[Dict[str, Any]],
    invoices: List[Invoice],
    communication: List[Dict[str, Any]],
    files: List[Dict[str, Any]],
    category: str = "all",
    skip: int = 0,
    limit: int = 25,
) -> Dict[str, Any]:
    events: List[Dict[str, Any]] = [
        _event("work", "Client created", client.created_at, "client", str(client.id), {"name": client.name}, client.created_by)
    ]
    lifecycle_reason = getattr(client, "lifecycle_reason", None)
    if lifecycle_reason or client.status:
        events.append(_event("work", "Lifecycle state updated", client.updated_at, "client", str(client.id), {"status": getattr(client.status, "value", client.status), "reason": lifecycle_reason}, client.assigned_to))
    metadata = client.lifecycle_metadata or {}
    for entry in metadata.get("renewal_history") or []:
        action = "Client renewed" if entry.get("action") == "renewed" else "Renewal updated"
        events.append(_event("finance", action, entry.get("at"), "renewal", str(client.id), entry.get("snapshot") or {}, entry.get("actor")))
    for entry in metadata.get("churn_history") or []:
        events.append(_event("finance", "Client churned", entry.get("at"), "churn", str(client.id), entry.get("snapshot") or {}, entry.get("actor")))
    for entry in metadata.get("archive_history") or []:
        events.append(_event("finance", "Client archived", entry.get("at"), "archive", str(client.id), entry.get("snapshot") or {}, entry.get("actor")))
    for service in services:
        events.append(_event("work", "Service updated", service.updated_at, "service", str(service.id), {"name": service.name, "status": getattr(service.status, "value", service.status)}, service.service_owner_id))
    for project in projects:
        events.append(_event("work", "Project updated", project.get("updated_at"), "project", project.get("id"), {"name": project.get("name"), "status": project.get("status")}, project.get("assigned_to")))
    for task in tasks:
        if isinstance(task, dict):
            task_id = task.get("id")
            task_status = task.get("status")
            task_title = task.get("title")
            task_project_id = task.get("project_id")
            task_actor = task.get("assigned_to")
            task_time = task.get("completed_at") or task.get("updated_at")
        else:
            task_id = str(task.id)
            task_status = getattr(getattr(task, "status", None), "value", getattr(task, "status", None))
            task_title = task.title
            task_project_id = task.project_id
            task_actor = task.assigned_to
            task_time = getattr(task, "completed_at", None) or getattr(task, "updated_at", None)
        if task_status == "completed":
            events.append(_event("work", "Task completed", task_time, "task", task_id, {"title": task_title, "project_id": task_project_id}, task_actor))
        else:
            events.append(_event("work", "Task updated", task_time, "task", task_id, {"title": task_title, "status": task_status}, task_actor))
    for deliverable in deliverables:
        action = "Deliverable updated"
        if deliverable.get("approval_status") == "approved":
            action = "Deliverable approved"
        elif deliverable.get("approval_status") == "revision_requested":
            action = "Deliverable revision requested"
        elif deliverable.get("status") == "client_review":
            action = "Deliverable submitted for client review"
        events.append(_event("work", action, deliverable.get("updated_at"), "deliverable", deliverable.get("id"), {"title": deliverable.get("title"), "status": deliverable.get("status"), "approval_status": deliverable.get("approval_status")}, deliverable.get("owner_id")))
    for meeting in meetings:
        action = "Meeting completed" if meeting.get("status") == "completed" else "Meeting scheduled"
        events.append(_event("meetings", action, meeting.get("updated_at") or meeting.get("meeting_date"), "meeting", meeting.get("id"), {"title": meeting.get("title"), "status": meeting.get("status")}, meeting.get("host_id")))
    for item in communication:
        events.append(_event("communication", "Communication recorded", item.get("timestamp"), "communication", item.get("id"), {"channel": item.get("channel"), "preview": item.get("preview")}, item.get("sender")))
    for file_item in files:
        events.append(_event("files", "File/document added", file_item.get("uploaded_at") or file_item.get("created_at"), "file", file_item.get("id") or file_item.get("url") or file_item.get("name"), {"name": file_item.get("name"), "category": file_item.get("category")}, file_item.get("uploaded_by")))
    for invoice in invoices:
        status_value = getattr(getattr(invoice, "status", None), "value", getattr(invoice, "status", None))
        action = "Invoice/payment updated"
        if status_value == "paid" or float(getattr(invoice, "total_received", 0) or 0) > 0:
            action = "Payment received"
        if status_value not in {"paid", "cancelled"} and getattr(invoice, "due_date", None) and invoice.due_date < utc_now() and float(getattr(invoice, "outstanding_amount", 0) or 0) > 0:
            action = "Invoice overdue"
        events.append(_event("finance", action, getattr(invoice, "updated_at", None), "invoice", str(invoice.id), {"invoice_number": invoice.invoice_number, "status": status_value, "outstanding_amount": getattr(invoice, "outstanding_amount", 0), "total_received": getattr(invoice, "total_received", 0)}, None))

    if category != "all":
        events = [event for event in events if event["kind"] == category]
    events.sort(key=lambda event: _when(event.get("timestamp")), reverse=True)
    return {"items": events[skip:skip + limit], "total": len(events), "skip": skip, "limit": limit, "has_more": skip + limit < len(events)}
