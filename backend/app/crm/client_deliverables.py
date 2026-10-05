from __future__ import annotations

from hashlib import sha256
from secrets import token_urlsafe
from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException, status

from app.core.clock import utc_now
from app.crm.client_identity import load_contacts_for_client
from app.crm.client_services import load_client_for_user, load_client_service_for_user, validate_project_for_client, validate_same_tenant_user_ids
from app.models.client import Client
from app.models.client_deliverable import ClientApprovalStatus, ClientDeliverable, ClientDeliverableStatus
from app.models.client_service import ClientService
from app.models.project import Project
from app.models.task import Task
from app.models.user import User


ALLOWED_DELIVERABLE_TRANSITIONS = {
    ClientDeliverableStatus.PLANNED: {ClientDeliverableStatus.IN_PRODUCTION},
    ClientDeliverableStatus.IN_PRODUCTION: {ClientDeliverableStatus.INTERNAL_REVIEW, ClientDeliverableStatus.CLIENT_REVIEW},
    ClientDeliverableStatus.INTERNAL_REVIEW: {ClientDeliverableStatus.CLIENT_REVIEW, ClientDeliverableStatus.REVISION_REQUIRED},
    ClientDeliverableStatus.CLIENT_REVIEW: {ClientDeliverableStatus.APPROVED, ClientDeliverableStatus.REVISION_REQUIRED},
    ClientDeliverableStatus.REVISION_REQUIRED: {ClientDeliverableStatus.IN_PRODUCTION, ClientDeliverableStatus.INTERNAL_REVIEW},
    ClientDeliverableStatus.APPROVED: {ClientDeliverableStatus.DELIVERED},
    ClientDeliverableStatus.DELIVERED: set(),
}


def serialize_deliverable(deliverable: ClientDeliverable) -> Dict[str, Any]:
    return {
        "id": str(deliverable.id),
        "client_id": deliverable.client_id,
        "service_id": deliverable.service_id,
        "project_id": deliverable.project_id,
        "company_id": deliverable.company_id,
        "title": deliverable.title,
        "description": deliverable.description,
        "owner_id": deliverable.owner_id,
        "due_date": deliverable.due_date,
        "status": deliverable.status.value if getattr(deliverable, "status", None) else None,
        "linked_files": deliverable.linked_files or [],
        "linked_task_ids": deliverable.linked_task_ids or [],
        "approval_status": deliverable.approval_status.value if getattr(deliverable, "approval_status", None) else None,
        "approver_contact_id": deliverable.approver_contact_id,
        "sent_at": deliverable.sent_at,
        "viewed_at": deliverable.viewed_at,
        "approved_at": deliverable.approved_at,
        "rejected_at": deliverable.rejected_at,
        "revision_note": deliverable.revision_note,
        "revision_count": deliverable.revision_count,
        "approval_history": deliverable.approval_history or [],
        "delivered_at": deliverable.delivered_at,
        "created_at": deliverable.created_at,
        "updated_at": deliverable.updated_at,
    }


async def validate_service_project(client: Client, service: ClientService, project_id: str) -> Project:
    project = await validate_project_for_client(client, project_id)
    if service.client_id != str(client.id) or service.company_id != str(client.company_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service does not belong to client")
    project_doc_id = str(project.id)
    if project_doc_id not in (service.linked_project_ids or []) and (project.project_id or "") not in (service.linked_project_ids or []):
        service.linked_project_ids = list(dict.fromkeys([*(service.linked_project_ids or []), project_doc_id]))
        service.updated_at = utc_now()
        await service.save()
    if not project.client_id:
        project.client_id = str(client.id)
        project.updated_at = utc_now()
        await project.save()
    return project


async def validate_task_ids(project: Project, task_ids: Iterable[str]) -> list[str]:
    valid: list[str] = []
    project_keys = {str(project.id), str(project.project_id or "")}
    for task_id in [str(item) for item in (task_ids or []) if item]:
        task = await Task.get(task_id)
        if not task or str(task.company_id) != str(project.company_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid task")
        if str(task.project_object_id or "") not in project_keys and str(task.project_id or "") not in project_keys:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task belongs to another project")
        valid.append(str(task.id))
    return list(dict.fromkeys(valid))


async def default_approver_contact_id(client: Client) -> Optional[str]:
    roles = (client.lifecycle_metadata or {}).get("contact_roles") or {}
    for contact_id, contact_roles in roles.items():
        if "Approver" in (contact_roles or []):
            return str(contact_id)
    primary = next((contact for contact in await load_contacts_for_client(client) if getattr(contact, "is_primary_contact", False)), None)
    return str(primary.id) if primary else None


async def load_deliverable_for_user(client_id: str, deliverable_id: str, current_user: User) -> tuple[Client, ClientDeliverable]:
    client = await load_client_for_user(client_id, current_user)
    deliverable = await ClientDeliverable.get(deliverable_id)
    if not deliverable or deliverable.client_id != str(client.id) or deliverable.company_id != str(client.company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliverable not found")
    return client, deliverable


async def create_public_review_token(deliverable: ClientDeliverable) -> str:
    token = token_urlsafe(32)
    deliverable.public_token_hash = sha256(token.encode("utf-8")).hexdigest()
    deliverable.public_token_created_at = utc_now()
    return token


async def load_deliverable_by_review_token(token: str) -> ClientDeliverable:
    token_hash = sha256(token.encode("utf-8")).hexdigest()
    deliverable = await ClientDeliverable.find_one({"public_token_hash": token_hash})
    if not deliverable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review link not found")
    return deliverable
