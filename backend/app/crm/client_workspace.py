from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import re
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from beanie.exceptions import CollectionWasNotInitialized
from bson import ObjectId

from app.crm.company_timeline import CRMCompanyTimelineService
from app.crm.client_identity import load_contacts_for_client, resolve_crm_company_for_client
from app.crm.client_deliverables import serialize_deliverable
from app.crm.client_onboarding import sync_client_onboarding
from app.crm.client_services import ensure_sales_handoff_service, serialize_client_service
from app.crm.models import Client
from app.models.client import ClientStatus
from app.models.client_deliverable import ClientDeliverable
from app.models.client_service import ClientService
from app.models.invoice import Invoice
from app.models.meeting import Meeting
from app.models.project import Project
from app.crm.models import ProspectStatus, SalesProspect
from app.models.task import Task
from app.models.user import User, UserRole


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


async def _company_or_403(current_user: User, client: Client) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if client.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def _project_summary(project: Project) -> Dict[str, Any]:
    return {
        "id": str(project.id),
        "project_id": project.project_id or str(project.id),
        "name": project.name,
        "key": project.key,
        "description": project.description,
        "status": project.status.value if getattr(project, "status", None) else None,
        "client_id": project.client_id,
        "lead_id": project.lead_id,
        "assigned_to": project.assigned_to,
        "category": project.category,
        "budget": getattr(project, "budget", None),
        "start_date": project.start_date,
        "delivery_date": project.delivery_date,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


def _meeting_summary(meeting: Meeting) -> Dict[str, Any]:
    return {
        "id": str(meeting.id),
        "title": meeting.title,
        "description": meeting.description,
        "status": meeting.status.value if getattr(meeting, "status", None) else None,
        "meeting_date": meeting.meeting_date,
        "meeting_time": meeting.meeting_time,
        "duration": meeting.duration,
        "host_id": meeting.host_id,
        "participant_ids": meeting.participant_ids or [],
        "created_at": meeting.created_at,
        "updated_at": meeting.updated_at,
    }


def _contact_summary(contact: Any) -> Dict[str, Any]:
    return {
        "id": str(contact.id),
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "full_name": contact.full_name(),
        "email": contact.email,
        "phone": contact.phone,
        "country_code": contact.country_code,
        "designation": contact.designation,
        "crm_company_id": contact.crm_company_id,
        "is_primary_contact": contact.is_primary_contact,
    }


class ClientWorkspaceService:
    @staticmethod
    async def load_workspace(current_user: User, client_id: str) -> Dict[str, Any]:
        client = await Client.get(client_id)
        if not client:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        await _company_or_403(current_user, client)

        projects = []
        project_ids = [pid for pid in (client.project_ids or []) if pid]
        project_query: Dict[str, Any] = {"company_id": client.company_id}
        project_filters = []
        if project_ids:
            object_ids = []
            for pid in project_ids:
                try:
                    object_ids.append(ObjectId(pid))
                except Exception:
                    continue
            if object_ids:
                project_filters.append({"_id": {"$in": object_ids}})
            project_filters.append({"project_id": {"$in": project_ids}})
        project_filters.append({"client_id": str(client.id)})
        project_query["$or"] = project_filters
        project_objects = await Project.find(project_query).sort("-updated_at").to_list()
        projects = []
        for project in project_objects:
            summary = _project_summary(project)
            project_key = str(project.project_id or project.id)
            summary["budget"] = (client.projects_budget or {}).get(project_key) or (client.projects_budget or {}).get(str(project.id)) or getattr(project, "budget", None)
            summary["start_date"] = (client.projects_start_date or {}).get(project_key) or (client.projects_start_date or {}).get(str(project.id)) or project.start_date
            summary["delivery_date"] = (client.projects_delivery_date or {}).get(project_key) or (client.projects_delivery_date or {}).get(str(project.id)) or project.delivery_date
            projects.append(summary)

        meeting_matchers: List[Dict[str, Any]] = [
            {"title": f"Kickoff - {client.name}"},
            {"description": {"$regex": str(client.id), "$options": "i"}},
        ]
        project_names = [item["name"] for item in projects if item.get("name")]
        if project_names:
            meeting_matchers.append({"description": {"$in": [f"Kickoff meeting for {name}" for name in project_names]}})
        meeting_objects = await Meeting.find(
            {"company_id": client.company_id, "$or": meeting_matchers}
        ).sort("-updated_at").to_list()
        meetings = [_meeting_summary(meeting) for meeting in meeting_objects]

        invoices = await Invoice.find(
            {
                "company_id": client.company_id,
                "client_id": str(client.id),
            }
        ).sort("-updated_at").to_list()

        company_resolution = await resolve_crm_company_for_client(client)
        crm_company = company_resolution.crm_company
        contacts = await load_contacts_for_client(client)
        client_account_name = client.company_name or client.name
        escaped_account_name = re.escape(client_account_name)
        lead_matchers: List[Dict[str, Any]] = [
            {"client_id": str(client.id)},
            {"company_name": {"$regex": f"^{escaped_account_name}$", "$options": "i"}},
        ]
        if crm_company:
            lead_matchers.insert(1, {"crm_company_id": str(crm_company.id)})

        lead_candidates = await SalesProspect.find(
            {
                "company_id": client.company_id,
                "deleted": False,
                "$or": lead_matchers,
            }
        ).sort("-updated_at").to_list()

        task_query: Dict[str, Any] = {"company_id": client.company_id, "_id": {"$in": []}}
        if projects:
            task_query["$or"] = [{"project_object_id": {"$in": [item["id"] for item in projects]}}, {"project_id": {"$in": [item["project_id"] for item in projects]}}]
            task_query.pop("_id", None)
        tasks = await Task.find(task_query).sort("-updated_at").to_list()

        project_counts = {
            "active": sum(1 for project in projects if str(project.get("status") or "").lower() not in {"completed", "closed", "archived"}),
            "completed": sum(1 for project in projects if str(project.get("status") or "").lower() in {"completed", "closed", "archived"}),
        }
        lead_counts = {
            "active": sum(1 for lead in lead_candidates if lead.status == ProspectStatus.ACTIVE),
            "won": sum(1 for lead in lead_candidates if lead.status == ProspectStatus.WON),
            "lost": sum(1 for lead in lead_candidates if lead.status == ProspectStatus.LOST),
        }
        task_counts = defaultdict(int)
        for task in tasks:
            task_counts[str(task.status.value if getattr(task, "status", None) else "unknown")] += 1

        if crm_company:
            timeline = await CRMCompanyTimelineService.load_timeline(current_user, crm_company)
        else:
            timeline = {
                "client_id": str(client.id),
                "client_name": client.name,
                "items": [],
                "grouped_by_day": [],
                "summary": {"total": 0, "sales": 0, "contacts": 0, "files": 0, "comments": 0, "system": 0, "last_activity_at": None},
            }

        source_lead = None
        source_lead_id = getattr(client, "source_lead_id", None)
        if source_lead_id:
            try:
                source_lead = await SalesProspect.get(source_lead_id)
            except Exception:
                source_lead = None
        if not source_lead and lead_candidates:
            source_lead = next((l for l in lead_candidates if str(l.id) == getattr(client, "source_lead_id", None)), None)
        await ensure_sales_handoff_service(client, current_user)
        try:
            services = await ClientService.find(
                {"company_id": str(client.company_id), "client_id": str(client.id)}
            ).sort("-updated_at").to_list()
        except CollectionWasNotInitialized:
            services = []
        try:
            deliverable_objects = await ClientDeliverable.find(
                {"company_id": str(client.company_id), "client_id": str(client.id)}
            ).sort("-updated_at").to_list()
        except CollectionWasNotInitialized:
            deliverable_objects = []
        deliverables = []
        project_name_map = {item["id"]: item["name"] for item in projects}
        project_name_map.update({item["project_id"]: item["name"] for item in projects if item.get("project_id")})
        service_name_map = {str(service.id): service.name for service in services}
        for deliverable in deliverable_objects:
            summary = serialize_deliverable(deliverable)
            summary["project_name"] = project_name_map.get(deliverable.project_id)
            summary["service_name"] = service_name_map.get(deliverable.service_id)
            deliverables.append(summary)

        def _lead_budget_val(lead_item: Optional[SalesProspect]) -> Optional[float]:
            if not lead_item:
                return None
            for val in (getattr(lead_item, "won_amount", None), getattr(lead_item, "budget", None), getattr(lead_item, "deal_value", None)):
                if val in (None, ""):
                    continue
                try:
                    amt = float(val)
                except (TypeError, ValueError):
                    continue
                if amt > 0:
                    return amt
            return None

        fallback_budget = _lead_budget_val(source_lead)
        source_budget_type = None
        if client.budget not in (None, "", 0):
            resolved_budget = client.budget
            source_budget_type = "client"
        elif fallback_budget:
            resolved_budget = fallback_budget
            source_budget_type = "sales_lead"
        else:
            resolved_budget = None
            for lead_item in lead_candidates:
                lead_amt = _lead_budget_val(lead_item)
                if lead_amt:
                    resolved_budget = lead_amt
                    source_budget_type = "sales_lead"
                    break
            if resolved_budget is None and projects:
                proj_sum = sum(float(p.get("budget") or 0) for p in projects if p.get("budget"))
                if proj_sum > 0:
                    resolved_budget = proj_sum
                    source_budget_type = "projects"

        onboarding = None
        if client.status == ClientStatus.ONBOARDING:
            onboarding = await sync_client_onboarding(client, current_user)

        return {
            "client": {
                "id": str(client.id),
                "name": client.name,
                "company_id": client.company_id,
                "email": client.email,
                "contact": client.contact,
                "alternate_contact": client.alternate_contact,
                "address": client.address,
                "city": client.city,
                "state": client.state,
                "country": client.country,
                "zip_code": client.zip_code,
                "company_name": client.company_name,
                "industry": client.industry,
                "status": client.status.value,
                "assigned_to": client.assigned_to,
                "crm_company_id": client.crm_company_id,
                "source_lead_id": client.source_lead_id,
                "account_owner_id": client.account_owner_id,
                "sales_owner_id": client.sales_owner_id,
                "assigned_to_name": _display_name(await User.get(client.assigned_to)) if client.assigned_to else None,
                "notes": client.notes,
                "lifecycle_metadata": client.lifecycle_metadata or {},
                "profile": (client.lifecycle_metadata or {}).get("profile") or {},
                "tags": client.tags or [],
                "project_ids": client.project_ids or [],
                "documents": client.documents or [],
                "client_type": client.client_type.value if client.client_type else None,
                "budget": resolved_budget,
                "source_budget": source_budget_type,
                "start_date": client.start_date or (getattr(source_lead, "converted_at", None) if source_lead else None) or (getattr(source_lead, "closed_date", None) if source_lead else None),
                "delivery_date": client.delivery_date,
                "created_at": client.created_at,
                "updated_at": client.updated_at,
                "created_by": client.created_by,
            },
            "projects": projects,
            "contacts": [
                {
                    **_contact_summary(contact),
                    "roles": ((client.lifecycle_metadata or {}).get("contact_roles") or {}).get(str(contact.id), []),
                }
                for contact in contacts
            ],
            "services": [serialize_client_service(service) for service in services],
            "deliverables": deliverables,
            "meetings": meetings,
            "onboarding": onboarding,
            "invoices": [
                {
                    "id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "invoice_type": invoice.invoice_type.value if getattr(invoice, "invoice_type", None) else None,
                    "status": invoice.status.value if getattr(invoice, "status", None) else None,
                    "invoice_date": invoice.invoice_date,
                    "due_date": invoice.due_date,
                    "total_amount": invoice.total_amount,
                    "outstanding_amount": invoice.outstanding_amount,
                    "currency": invoice.currency,
                    "project_id": invoice.project_id,
                    "created_at": invoice.created_at,
                    "updated_at": invoice.updated_at,
                }
                for invoice in invoices
            ],
            "tasks": [
                {
                    "id": str(task.id),
                    "title": task.title,
                    "status": task.status.value if getattr(task, "status", None) else None,
                    "priority": task.priority.value if getattr(task, "priority", None) else None,
                    "assigned_to": task.assigned_to,
                    "project_id": task.project_id,
                    "project_object_id": str(task.project_object_id) if getattr(task, "project_object_id", None) else None,
                    "due_date": task.due_date,
                    "created_at": task.created_at,
                    "updated_at": task.updated_at,
                }
                for task in tasks
            ],
            "leads": [
                {
                    "id": str(lead.id),
                    "prospect_name": lead.prospect_name,
                    "current_stage": lead.current_stage,
                    "status": lead.status.value if getattr(lead, "status", None) else None,
                    "assigned_to": lead.assigned_to,
                    "reason_for_lost": lead.reason_for_lost,
                    "won_amount": lead.won_amount,
                    "created_at": lead.created_at,
                    "updated_at": lead.updated_at,
                }
                for lead in lead_candidates
            ],
            "summary": {
                "projects": project_counts,
                "leads": lead_counts,
                "tasks": dict(task_counts),
                "documents": len(client.documents or []),
                "services": {
                    "total": len(services),
                    "active": sum(1 for service in services if getattr(service, "status", None) and service.status.value == "active"),
                    "planned": sum(1 for service in services if getattr(service, "status", None) and service.status.value == "planned"),
                    "paused": sum(1 for service in services if getattr(service, "status", None) and service.status.value == "paused"),
                    "ended": sum(1 for service in services if getattr(service, "status", None) and service.status.value == "ended"),
                    "active_value": sum(float(service.pricing_value or 0) for service in services if getattr(service, "status", None) and service.status.value == "active"),
                    "total_value": sum(float(service.pricing_value or 0) for service in services),
                },
                "deliverables": {
                    "total": len(deliverables),
                    "client_review": sum(1 for item in deliverables if item.get("status") == "client_review"),
                    "approved": sum(1 for item in deliverables if item.get("approval_status") == "approved"),
                    "revision_requested": sum(1 for item in deliverables if item.get("approval_status") == "revision_requested"),
                    "delivered": sum(1 for item in deliverables if item.get("status") == "delivered"),
                },
                "meetings": len(meetings),
                "invoices": {
                    "total": len(invoices),
                    "draft": sum(1 for invoice in invoices if invoice.status.value == "draft"),
                    "sent": sum(1 for invoice in invoices if invoice.status.value == "sent"),
                    "paid": sum(1 for invoice in invoices if invoice.status.value == "paid"),
                    "cancelled": sum(1 for invoice in invoices if invoice.status.value == "cancelled"),
                    "outstanding_amount": sum(float(invoice.outstanding_amount or 0) for invoice in invoices),
                },
            },
            "timeline": timeline,
        }
