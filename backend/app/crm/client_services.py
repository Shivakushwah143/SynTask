from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException, status
from beanie.exceptions import CollectionWasNotInitialized

from app.core.clock import utc_now
from app.crm.models import Client, SalesProspect
from app.models.client_service import ClientService, ClientServiceStatus
from app.models.project import Project
from app.models.user import User, UserRole


CONTACT_ROLE_OPTIONS = {
    "Primary Contact",
    "Decision Maker",
    "Finance Contact",
    "Project Contact",
    "Technical Contact",
    "Approver",
}


def serialize_client_service(service: ClientService) -> Dict[str, Any]:
    return {
        "id": str(service.id),
        "client_id": service.client_id,
        "company_id": service.company_id,
        "name": service.name,
        "service_type": service.service_type,
        "status": service.status.value if getattr(service, "status", None) else None,
        "pricing_value": service.pricing_value,
        "billing_cycle": service.billing_cycle,
        "start_date": service.start_date,
        "end_date": service.end_date,
        "service_owner_id": service.service_owner_id,
        "team_member_ids": service.team_member_ids or [],
        "linked_project_ids": service.linked_project_ids or [],
        "source_lead_id": service.source_lead_id,
        "source_category_id": service.source_category_id,
        "notes": service.notes,
        "created_at": service.created_at,
        "updated_at": service.updated_at,
    }


async def company_or_403(current_user: User, company_id: str) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if str(company_id) != str(current_user.company_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def load_client_for_user(client_id: str, current_user: User) -> Client:
    client = await Client.get(client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    await company_or_403(current_user, str(client.company_id))
    return client


async def load_client_service_for_user(client_id: str, service_id: str, current_user: User) -> tuple[Client, ClientService]:
    client = await load_client_for_user(client_id, current_user)
    service = await ClientService.get(service_id)
    if not service or service.client_id != str(client.id) or service.company_id != str(client.company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client service not found")
    return client, service


async def validate_same_tenant_user_ids(user_ids: Iterable[str], current_user: User, field_name: str) -> list[str]:
    valid_ids: list[str] = []
    for user_id in [str(item) for item in (user_ids or []) if item]:
        user = await User.get(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
        if current_user.role != UserRole.SUPER_ADMIN and str(user.company_id) != str(current_user.company_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
        valid_ids.append(str(user.id))
    return valid_ids


async def validate_project_for_client(client: Client, project_id: str) -> Project:
    try:
        project = await Project.get(project_id)
    except Exception:
        project = None
    if not project:
        project = await Project.find_one({"company_id": str(client.company_id), "project_id": project_id})
    if not project or str(project.company_id) != str(client.company_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project")
    if project.client_id and str(project.client_id) != str(client.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project belongs to another client")
    return project


def _service_name_from_lead(lead: SalesProspect) -> str:
    for value in (getattr(lead, "category_id", None), getattr(lead, "relationship_type", None), getattr(lead, "source", None)):
        text = str(value or "").strip()
        if text:
            return text
    return "Sold service"


def _service_value_from_lead(lead: SalesProspect) -> Optional[float]:
    for value in (getattr(lead, "won_amount", None), getattr(lead, "budget", None)):
        if value in (None, ""):
            continue
        try:
            amount = float(value)
        except (TypeError, ValueError):
            continue
        if amount > 0:
            return amount
    return None


async def ensure_sales_handoff_service(client: Client, actor: Optional[User] = None) -> Optional[ClientService]:
    source_lead_id = getattr(client, "source_lead_id", None)
    if not source_lead_id:
        return None
    try:
        lead = await SalesProspect.get(source_lead_id)
    except CollectionWasNotInitialized:
        return None
    if not lead or getattr(lead, "deleted", False) or str(lead.company_id) != str(client.company_id):
        return None

    try:
        existing = await ClientService.find_one(
            {
                "company_id": str(client.company_id),
                "client_id": str(client.id),
                "source_lead_id": str(lead.id),
            }
        )
    except CollectionWasNotInitialized:
        return None
    if existing:
        if getattr(lead, "project_id", None) and str(lead.project_id) not in (existing.linked_project_ids or []):
            existing.linked_project_ids = list(existing.linked_project_ids or []) + [str(lead.project_id)]
            existing.updated_at = utc_now()
            await existing.save()
        return existing

    now = utc_now()
    service = ClientService(
        client_id=str(client.id),
        company_id=str(client.company_id),
        name=_service_name_from_lead(lead),
        service_type=getattr(lead, "relationship_type", None) or getattr(lead, "category_id", None),
        status=ClientServiceStatus.PLANNED,
        pricing_value=_service_value_from_lead(lead),
        billing_cycle=getattr(lead, "payment_terms", None),
        start_date=getattr(client, "start_date", None) or getattr(lead, "converted_at", None) or getattr(lead, "closed_date", None),
        service_owner_id=getattr(client, "account_owner_id", None) or getattr(lead, "assigned_to", None),
        linked_project_ids=[str(lead.project_id)] if getattr(lead, "project_id", None) else [],
        source_lead_id=str(lead.id),
        source_category_id=getattr(lead, "category_id", None),
        notes="Carried from Sales Won handoff.",
        created_by=str(getattr(actor, "id", None) or getattr(client, "created_by", "") or "system"),
        created_at=now,
        updated_at=now,
    )
    await service.insert()
    return service


async def set_client_contact_roles(client: Client, contact_id: str, roles: list[str], current_user: User) -> Dict[str, Any]:
    normalized_roles = [role for role in roles if role in CONTACT_ROLE_OPTIONS]
    if len(normalized_roles) != len([role for role in roles if role]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid contact role")
    metadata = dict(client.lifecycle_metadata or {})
    contact_roles = dict(metadata.get("contact_roles") or {})
    if normalized_roles:
        contact_roles[contact_id] = normalized_roles
    else:
        contact_roles.pop(contact_id, None)
    metadata["contact_roles"] = contact_roles
    client.lifecycle_metadata = metadata
    client.updated_at = utc_now()
    await client.save()
    return {"contact_id": contact_id, "roles": normalized_roles}
