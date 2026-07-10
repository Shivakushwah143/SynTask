from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from bson import ObjectId

from app.crm.company_timeline import CRMCompanyTimelineService
from app.models.client import Client
from app.models.invoice import Invoice
from app.models.meeting import Meeting
from app.models.project import Project
from app.models.sales_prospect import ProspectStatus, SalesProspect
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
        "budget": None,
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


class ClientWorkspaceService:
    @staticmethod
    async def load_workspace(current_user: User, client_id: str) -> Dict[str, Any]:
        client = await Client.get(client_id)
        if not client or client.deleted:
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
            summary["budget"] = (client.projects_budget or {}).get(project_key) or (client.projects_budget or {}).get(str(project.id))
            summary["start_date"] = (client.projects_start_date or {}).get(project_key) or (client.projects_start_date or {}).get(str(project.id)) or project.start_date
            summary["delivery_date"] = (client.projects_delivery_date or {}).get(project_key) or (client.projects_delivery_date or {}).get(str(project.id)) or project.delivery_date
            projects.append(summary)

        meetings = []
        if projects:
            project_object_ids = [item["id"] for item in projects]
            meetings_query: Dict[str, Any] = {"company_id": client.company_id}
            meetings_query["$or"] = [
                {"host_id": str(client.assigned_to)} if client.assigned_to else {"host_id": None},
                {"participant_ids": {"$in": [client.assigned_to]}} if client.assigned_to else {"participant_ids": {"$exists": True}},
            ]
            meeting_objects = await Meeting.find(meetings_query).sort("-updated_at").to_list()
            meetings = [_meeting_summary(meeting) for meeting in meeting_objects]

        invoices = await Invoice.find(
            {
                "company_id": client.company_id,
                "client_id": str(client.id),
            }
        ).sort("-updated_at").to_list()

        lead_candidates = await SalesProspect.find(
            {
                "company_id": client.company_id,
                "deleted": False,
                "$or": [
                    {"crm_company_id": str(client.id)},
                    {"company_name": {"$regex": f"^{client.name}$", "$options": "i"}},
                ],
            }
        ).sort("-updated_at").to_list()

        task_query: Dict[str, Any] = {"company_id": client.company_id}
        if projects:
            task_query["$or"] = [{"project_object_id": {"$in": [item["id"] for item in projects]}}, {"project_id": {"$in": [item["project_id"] for item in projects]}}]
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

        timeline = await CRMCompanyTimelineService.load_timeline(current_user, client)

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
                "assigned_to_name": _display_name(await User.get(client.assigned_to)) if client.assigned_to else None,
                "notes": client.notes,
                "tags": client.tags or [],
                "project_ids": client.project_ids or [],
                "documents": client.documents or [],
                "created_at": client.created_at,
                "updated_at": client.updated_at,
                "created_by": client.created_by,
            },
            "projects": projects,
            "meetings": meetings,
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
