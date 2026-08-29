"""
Client Management Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, UploadFile, File, Query
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
import logging
import json
from pathlib import Path
import uuid
import re
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from app.crm.models import Client, ClientStatus, ClientType, SalesProspect
from app.crm.client_identity import load_contacts_for_client
from app.crm.client_lifecycle import client_lifecycle_rules, normalize_client_status, transition_client_status
from app.crm.client_onboarding import build_onboarding_document, merge_onboarding_data, sync_client_onboarding
from app.crm.client_services import (
    CONTACT_ROLE_OPTIONS,
    load_client_for_user,
    load_client_service_for_user,
    serialize_client_service,
    set_client_contact_roles,
    validate_project_for_client,
    validate_same_tenant_user_ids,
)
from app.models.client_onboarding import ClientOnboardingItem, ClientOnboardingItemStatus
from app.models.client_service import ClientService, ClientServiceStatus
from app.models.user import User, UserRole
from app.models.project import Project
from app.models.crm_company import CRMCompany
from app.models.sales_contact import SalesContact
from app.crm.client_workspace import ClientWorkspaceService
from app.api.dependencies import (
    get_current_user,
    get_current_company_admin_or_lead,
    get_current_company_admin,
    check_company_access,
)

from app.core.config import settings
from app.api.deps import Pagination50, PaginationParams
from app.core.clock import utc_now
from app.services.file_service import FileService
from app.services.cloudinary_storage import CloudinaryStorage

router = APIRouter()


class ClientProfilePayload(BaseModel):
    commercial_summary: Optional[str] = None
    relationship_information: Optional[str] = None


class ContactRolesPayload(BaseModel):
    roles: List[str] = []


class ClientServicePayload(BaseModel):
    name: Optional[str] = None
    service_type: Optional[str] = None
    status: Optional[str] = None
    pricing_value: Optional[float] = None
    billing_cycle: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    service_owner_id: Optional[str] = None
    team_member_ids: List[str] = []
    linked_project_ids: List[str] = []
    notes: Optional[str] = None


class ClientServiceProjectPayload(BaseModel):
    project_id: str

# Get upload directory
BACKEND_DIR = Path(__file__).resolve().parents[4]
UPLOAD_DIR = BACKEND_DIR / settings.UPLOAD_DIR / "clients"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/lifecycle/rules")
async def get_client_lifecycle_rules():
    """Return the backend-owned client lifecycle rules for the stage controls."""
    return {"rules": client_lifecycle_rules()}
PROJECT_UPLOAD_DIR = BACKEND_DIR / settings.UPLOAD_DIR / "projects"
PROJECT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def _validate_crm_company_id(crm_company_id: Optional[str], current_user: User) -> Optional[str]:
    if not crm_company_id:
        return None
    crm_company = await CRMCompany.get(crm_company_id)
    if not crm_company or crm_company.deleted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid CRM company")
    if current_user.role != UserRole.SUPER_ADMIN and crm_company.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid CRM company")
    return str(crm_company.id)


async def _validate_same_tenant_user_id(user_id: Optional[str], current_user: User, field_name: str) -> Optional[str]:
    if not user_id:
        return None
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    if current_user.role != UserRole.SUPER_ADMIN and user.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return str(user.id)


async def _validate_source_lead_id(source_lead_id: Optional[str], current_user: User) -> Optional[str]:
    if not source_lead_id:
        return None
    from app.crm.models import SalesProspect

    lead = await SalesProspect.get(source_lead_id)
    if not lead or lead.deleted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source lead")
    if current_user.role != UserRole.SUPER_ADMIN and lead.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source lead")
    return str(lead.id)


async def _load_client_source_lead(client: Client) -> Optional[SalesProspect]:
    company_id = str(getattr(client, "company_id", "") or "")
    source_lead_id = getattr(client, "source_lead_id", None)
    if source_lead_id:
        try:
            lead = await SalesProspect.get(source_lead_id)
        except Exception:
            lead = None
        if lead and not getattr(lead, "deleted", False) and str(getattr(lead, "company_id", "") or "") == company_id:
            return lead

    return await SalesProspect.find_one(
        {
            "company_id": company_id,
            "client_id": str(client.id),
            "deleted": {"$ne": True},
        }
    )


def _lead_budget_value(lead: Optional[SalesProspect]) -> Optional[float]:
    if not lead:
        return None
    for value in (getattr(lead, "won_amount", None), getattr(lead, "budget", None), getattr(lead, "deal_value", None)):
        if value in (None, ""):
            continue
        try:
            amount = float(value)
        except (TypeError, ValueError):
            continue
        if amount > 0:
            return amount
    return None


def _client_commercial_fields(client: Client, source_lead: Optional[SalesProspect] = None) -> dict:
    fallback_budget = _lead_budget_value(source_lead)
    budget = client.budget if client.budget not in (None, "", 0) else fallback_budget
    start_date = client.start_date or getattr(source_lead, "converted_at", None) or getattr(source_lead, "closed_date", None)
    return {
        "client_type": client.client_type.value if client.client_type else (ClientType.ONE_TIME.value if fallback_budget else None),
        "budget": budget,
        "start_date": start_date,
        "delivery_date": client.delivery_date,
        "source_budget": "client" if client.budget not in (None, "", 0) else ("sales_lead" if fallback_budget else None),
    }


@router.post("")
async def create_client(
    name: str = Form(...),
    email: Optional[str] = Form(None),
    contact: Optional[str] = Form(None),
    alternate_contact: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    zip_code: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    crm_company_id: Optional[str] = Form(None),
    source_lead_id: Optional[str] = Form(None),
    account_owner_id: Optional[str] = Form(None),
    sales_owner_id: Optional[str] = Form(None),
    industry: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    client_type: Optional[str] = Form(None),
    budget: Optional[float] = Form(None),
    start_date: Optional[str] = Form(None),
    delivery_date: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Create a new client"""
    # Check if user has permission (Admin, Sub Admin, Manager, Lead, or Super Admin)
    if current_user.role not in [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin, Manager, or Lead access required"
        )
    
    # Validate assigned user if provided
    assigned_user = None
    if assigned_to:
        assigned_user = await User.get(assigned_to)
        # For super admin, skip company check
        if current_user.role != UserRole.SUPER_ADMIN:
            if not assigned_user or assigned_user.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid assigned user"
                )
        if assigned_user.role not in [UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.MANAGER, UserRole.LEAD]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only assign clients to Admins, Managers, or Leads"
            )
    canonical_crm_company_id = await _validate_crm_company_id(crm_company_id, current_user)
    canonical_source_lead_id = await _validate_source_lead_id(source_lead_id, current_user)
    canonical_account_owner_id = await _validate_same_tenant_user_id(account_owner_id or assigned_to, current_user, "account owner")
    canonical_sales_owner_id = await _validate_same_tenant_user_id(sales_owner_id, current_user, "sales owner")
    
    # Parse tags
    parsed_tags = []
    if tags:
        try:
            parsed_tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
        except:
            pass
    
    # Determine company_id
    company_id = current_user.company_id if current_user.role != UserRole.SUPER_ADMIN else None
    
    # Create client
    # Parse client type
    parsed_client_type = None
    if client_type:
        try:
            parsed_client_type = ClientType(client_type)
        except:
            pass
    
    # Parse dates
    parsed_start_date = None
    if start_date:
        try:
            parsed_start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except:
            pass
    
    parsed_delivery_date = None
    if delivery_date:
        try:
            parsed_delivery_date = datetime.fromisoformat(delivery_date.replace('Z', '+00:00'))
        except:
            pass
    
    client = Client(
        name=name,
        company_id=company_id,
        email=email,
        contact=contact,
        alternate_contact=alternate_contact,
        address=address,
        city=city,
        state=state,
        country=country,
        zip_code=zip_code,
        company_name=company_name,
        crm_company_id=canonical_crm_company_id,
        source_lead_id=canonical_source_lead_id,
        account_owner_id=canonical_account_owner_id,
        sales_owner_id=canonical_sales_owner_id,
        industry=industry,
        assigned_to=assigned_to,
        notes=notes,
        tags=parsed_tags,
        created_by=str(current_user.id),
        status=ClientStatus.ACTIVE,
        client_type=parsed_client_type,
        budget=budget,
        start_date=parsed_start_date,
        delivery_date=parsed_delivery_date,
    )
    
    await client.insert()
    
    return {
        "message": "Client created successfully",
        "client": {
            "id": str(client.id),
            "name": client.name,
            "email": client.email,
            "contact": client.contact,
        }
    }


@router.get("")
async def list_clients(
    status_filter: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = Query(None),
    client_type: Optional[str] = Query(None),
    pagination: PaginationParams = Pagination50,
    current_user: User = Depends(get_current_user),
):
    """List all clients for the current user's company"""
    skip, limit = pagination.skip, pagination.limit
    # Super admins and admins with no company can see all clients
    if current_user.role == UserRole.SUPER_ADMIN:
        query = {}
    elif current_user.role == UserRole.ADMIN and not current_user.company_id:
        query = {}
    else:
        query = {"company_id": current_user.company_id}
    
    if status_filter:
        try:
            query["status"] = normalize_client_status(status_filter)
        except HTTPException:
            raise
    
    if assigned_to:
        query["assigned_to"] = assigned_to

    if client_type:
        try:
            query["client_type"] = ClientType(client_type)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid client type")

    if search:
        escaped = re.escape(str(search).strip())
        if escaped:
            query["$or"] = [
                {"name": {"$regex": escaped, "$options": "i"}},
                {"company_name": {"$regex": escaped, "$options": "i"}},
                {"email": {"$regex": escaped, "$options": "i"}},
                {"contact": {"$regex": escaped, "$options": "i"}},
            ]
    
    # For super admin, also filter by assigned_to if provided
    if current_user.role == UserRole.SUPER_ADMIN and assigned_to:
        query["assigned_to"] = assigned_to
    
    clients = await Client.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
    total = await Client.find(query).count()
    
    # Fetch project details for each client
    client_list = []
    for client in clients:
        source_lead = await _load_client_source_lead(client)
        commercial = _client_commercial_fields(client, source_lead)
        projects = []
        if client.project_ids:
            project_objects = await Project.find({"_id": {"$in": [ObjectId(pid) for pid in client.project_ids]}}).to_list()
            for project in project_objects:
                projects.append({
                    "id": str(project.id),
                    "name": project.name,
                    "key": project.key,
                    "budget": client.projects_budget.get(str(project.id), 0),
                    "start_date": client.projects_start_date.get(str(project.id)),
                    "delivery_date": client.projects_delivery_date.get(str(project.id)),
                })
        
        client_list.append({
            "id": str(client.id),
            "name": client.name,
            "email": client.email,
            "contact": client.contact,
            "company_name": client.company_name,
            "status": client.status.value,
            "assigned_to": client.assigned_to,
            "crm_company_id": client.crm_company_id,
            "source_lead_id": client.source_lead_id,
            "account_owner_id": client.account_owner_id,
            "sales_owner_id": client.sales_owner_id,
            "project_ids": client.project_ids,
            "projects": projects,
            "total_projects": len(client.project_ids),
            "total_budget": sum(client.projects_budget.values()),
            "documents_count": len(client.documents),
            **commercial,
            "onboarding": await sync_client_onboarding(client, current_user) if client.status == ClientStatus.ONBOARDING else None,
            "created_at": client.created_at,
            "updated_at": client.updated_at,
        })
    
    return {
        "clients": client_list,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/{client_id}")
async def get_client(
    client_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get client details"""
    try:
        client = await Client.get(client_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    check_company_access(current_user, client.company_id)
    source_lead = await _load_client_source_lead(client)
    commercial = _client_commercial_fields(client, source_lead)
    
    # Fetch project details
    projects = []
    if client.project_ids:
        project_objects = await Project.find({"_id": {"$in": [ObjectId(pid) for pid in client.project_ids]}}).to_list()
        for project in project_objects:
            projects.append({
                "id": str(project.id),
                "name": project.name,
                "key": project.key,
                "description": project.description,
                "status": project.status.value,
                "budget": client.projects_budget.get(str(project.id), 0),
                "start_date": client.projects_start_date.get(str(project.id)),
                "delivery_date": client.projects_delivery_date.get(str(project.id)),
            })
    
    # Format assigned user
    assigned_user_name = None
    if client.assigned_to:
        assigned_user = await User.get(client.assigned_to)
        if assigned_user:
            assigned_user_name = assigned_user.full_name()
    
    return {
        "id": str(client.id),
        "name": client.name,
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
        "assigned_to_name": assigned_user_name,
        "crm_company_id": client.crm_company_id,
        "source_lead_id": client.source_lead_id,
        "account_owner_id": client.account_owner_id,
        "sales_owner_id": client.sales_owner_id,
        "project_ids": client.project_ids,
        "projects": projects,
        "contacts": [
            {
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
            for contact in await load_contacts_for_client(client)
        ],
        "projects_budget": client.projects_budget,
        "projects_start_date": {k: v.isoformat() if v else None for k, v in client.projects_start_date.items()},
        "projects_delivery_date": {k: v.isoformat() if v else None for k, v in client.projects_delivery_date.items()},
        "documents": client.documents,
        "notes": client.notes,
        "tags": client.tags,
        "lifecycle_reason": client.lifecycle_reason,
        "lifecycle_metadata": client.lifecycle_metadata,
        **commercial,
        "created_at": client.created_at,
        "updated_at": client.updated_at,
        "created_by": client.created_by,
    }


@router.get("/{client_id}/workspace")
async def get_client_workspace(
    client_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get client workspace with projects, meetings, tasks, leads, and timeline."""
    return await ClientWorkspaceService.load_workspace(current_user, client_id)


@router.post("/{client_id}/onboarding/document/generate")
async def generate_client_onboarding_document(
    client_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Generate a client-facing onboarding document from verified onboarding data."""
    client = await Client.get(client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    check_company_access(current_user, client.company_id)
    document = await build_onboarding_document(client, current_user, UPLOAD_DIR)
    return {"message": "Onboarding document generated", "document": document}


@router.patch("/{client_id}/onboarding/data")
async def update_client_onboarding_data(
    client_id: str,
    payload: dict,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update structured onboarding data without using legacy notes as completion evidence."""
    client = await Client.get(client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    check_company_access(current_user, client.company_id)
    allowed = {"commercial", "requirements", "assets", "access", "start_readiness"}
    patch = {key: value for key, value in (payload or {}).items() if key in allowed}
    if "start_readiness" in patch:
        ready = bool((patch.get("start_readiness") or {}).get("ready"))
        patch["start_readiness"] = {
            **(patch.get("start_readiness") or {}),
            "ready": ready,
            "confirmed_by": str(current_user.id) if ready else None,
            "confirmed_at": utc_now().isoformat() if ready else None,
        }
    merge_onboarding_data(client, patch)
    client.updated_at = utc_now()
    await client.save()
    return {"client_id": str(client.id), "onboarding": await sync_client_onboarding(client, current_user)}


@router.patch("/{client_id}/onboarding/primary-contact")
async def set_client_primary_contact(
    client_id: str,
    contact_id: str = Form(...),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Mark an existing CRM contact as the client primary contact."""
    client = await Client.get(client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    check_company_access(current_user, client.company_id)
    contacts = await load_contacts_for_client(client)
    selected = next((contact for contact in contacts if str(contact.id) == contact_id), None)
    if not selected:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contact must belong to the linked CRM company")
    for contact in contacts:
        if contact.is_primary_contact != (str(contact.id) == contact_id):
            contact.is_primary_contact = str(contact.id) == contact_id
            contact.updated_by = str(current_user.id)
            contact.updated_at = utc_now()
            await contact.save()
    return {"client_id": str(client.id), "primary_contact_id": contact_id, "onboarding": await sync_client_onboarding(client, current_user)}


@router.patch("/{client_id}/profile")
async def update_client_profile(
    client_id: str,
    payload: ClientProfilePayload,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update client profile notes that do not duplicate CRM Company fields."""
    client = await load_client_for_user(client_id, current_user)
    metadata = dict(client.lifecycle_metadata or {})
    profile = dict(metadata.get("profile") or {})
    for key, value in payload.dict(exclude_unset=True).items():
        profile[key] = value.strip() if isinstance(value, str) else value
    metadata["profile"] = profile
    client.lifecycle_metadata = metadata
    client.updated_at = utc_now()
    await client.save()
    return {"client_id": str(client.id), "profile": profile}


@router.patch("/{client_id}/contacts/{contact_id}/roles")
async def update_client_contact_roles(
    client_id: str,
    contact_id: str,
    payload: ContactRolesPayload,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Assign client relationship roles to an existing CRM contact."""
    client = await load_client_for_user(client_id, current_user)
    contacts = await load_contacts_for_client(client)
    selected = next((contact for contact in contacts if str(contact.id) == contact_id), None)
    if not selected:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contact must belong to the linked CRM company")
    result = await set_client_contact_roles(client, contact_id, payload.roles, current_user)
    return {"client_id": str(client.id), "allowed_roles": sorted(CONTACT_ROLE_OPTIONS), **result}


@router.get("/{client_id}/services")
async def list_client_services(
    client_id: str,
    current_user: User = Depends(get_current_user),
):
    """List services under a client account."""
    client = await load_client_for_user(client_id, current_user)
    services = await ClientService.find({"company_id": str(client.company_id), "client_id": str(client.id)}).sort("-updated_at").to_list()
    return {"services": [serialize_client_service(service) for service in services]}


@router.post("/{client_id}/services")
async def create_client_service(
    client_id: str,
    payload: ClientServicePayload,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Create a client service without duplicating project execution records."""
    client = await load_client_for_user(client_id, current_user)
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service name is required")
    owner_id = None
    if payload.service_owner_id:
        owner_id = (await validate_same_tenant_user_ids([payload.service_owner_id], current_user, "service owner"))[0]
    team_ids = await validate_same_tenant_user_ids(payload.team_member_ids, current_user, "team member")
    linked_project_ids: list[str] = []
    for project_id in payload.linked_project_ids or []:
        project = await validate_project_for_client(client, project_id)
        if not project.client_id:
            project.client_id = str(client.id)
            project.updated_at = utc_now()
            await project.save()
        linked_project_ids.append(str(project.id))
    now = utc_now()
    try:
        service_status = ClientServiceStatus(payload.status) if payload.status else ClientServiceStatus.PLANNED
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid service status") from exc

    service = ClientService(
        client_id=str(client.id),
        company_id=str(client.company_id),
        name=payload.name.strip(),
        service_type=(payload.service_type or "").strip() or None,
        status=service_status,
        pricing_value=payload.pricing_value,
        billing_cycle=(payload.billing_cycle or "").strip() or None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        service_owner_id=owner_id,
        team_member_ids=team_ids,
        linked_project_ids=list(dict.fromkeys(linked_project_ids)),
        notes=(payload.notes or "").strip() or None,
        created_by=str(current_user.id),
        created_at=now,
        updated_at=now,
    )
    await service.insert()
    return {"message": "Client service created", "service": serialize_client_service(service)}


@router.patch("/{client_id}/services/{service_id}")
async def update_client_service(
    client_id: str,
    service_id: str,
    payload: ClientServicePayload,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Edit a client service."""
    client, service = await load_client_service_for_user(client_id, service_id, current_user)
    data = payload.dict(exclude_unset=True)
    if "name" in data:
        if not (data["name"] or "").strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service name is required")
        service.name = data["name"].strip()
    if "service_type" in data:
        service.service_type = (data["service_type"] or "").strip() or None
    if "status" in data and data["status"]:
        try:
            service.status = ClientServiceStatus(data["status"])
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid service status") from exc
    if "pricing_value" in data:
        service.pricing_value = data["pricing_value"]
    if "billing_cycle" in data:
        service.billing_cycle = (data["billing_cycle"] or "").strip() or None
    if "start_date" in data:
        service.start_date = data["start_date"]
    if "end_date" in data:
        service.end_date = data["end_date"]
    if "service_owner_id" in data:
        service.service_owner_id = (await validate_same_tenant_user_ids([data["service_owner_id"]], current_user, "service owner"))[0] if data["service_owner_id"] else None
    if "team_member_ids" in data:
        service.team_member_ids = await validate_same_tenant_user_ids(data["team_member_ids"], current_user, "team member")
    if "linked_project_ids" in data:
        linked_project_ids = []
        for project_id in data["linked_project_ids"] or []:
            project = await validate_project_for_client(client, project_id)
            if not project.client_id:
                project.client_id = str(client.id)
                project.updated_at = utc_now()
                await project.save()
            linked_project_ids.append(str(project.id))
        service.linked_project_ids = list(dict.fromkeys(linked_project_ids))
    if "notes" in data:
        service.notes = (data["notes"] or "").strip() or None
    service.updated_at = utc_now()
    await service.save()
    return {"message": "Client service updated", "service": serialize_client_service(service)}


@router.post("/{client_id}/services/{service_id}/projects")
async def link_project_to_client_service(
    client_id: str,
    service_id: str,
    payload: ClientServiceProjectPayload,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Link an existing Project to a Client Service."""
    client, service = await load_client_service_for_user(client_id, service_id, current_user)
    project = await validate_project_for_client(client, payload.project_id)
    project_id = str(project.id)
    if project_id not in (service.linked_project_ids or []):
        service.linked_project_ids = list(service.linked_project_ids or []) + [project_id]
        service.updated_at = utc_now()
        await service.save()
    if not project.client_id:
        project.client_id = str(client.id)
        project.updated_at = utc_now()
        await project.save()
    return {"message": "Project linked to client service", "service": serialize_client_service(service)}


@router.post("/{client_id}/services/{service_id}/{action}")
async def change_client_service_status(
    client_id: str,
    service_id: str,
    action: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Activate, pause, or end a client service."""
    _, service = await load_client_service_for_user(client_id, service_id, current_user)
    transitions = {
        "activate": ClientServiceStatus.ACTIVE,
        "pause": ClientServiceStatus.PAUSED,
        "end": ClientServiceStatus.ENDED,
    }
    if action not in transitions:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown service action")
    service.status = transitions[action]
    if action == "activate" and not service.start_date:
        service.start_date = utc_now()
    if action == "end":
        service.end_date = utc_now()
    service.updated_at = utc_now()
    await service.save()
    return {"message": "Client service status updated", "service": serialize_client_service(service)}


@router.patch("/{client_id}/onboarding/items/{item_key}")
async def update_client_onboarding_item(
    client_id: str,
    item_key: str,
    item_status: Optional[str] = Form(None, alias="status"),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Record a genuinely manual onboarding layer update."""
    client = await Client.get(client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    check_company_access(current_user, client.company_id)

    item = await ClientOnboardingItem.find_one(
        {"company_id": client.company_id, "client_id": str(client.id), "key": item_key}
    )
    if not item:
        await sync_client_onboarding(client, current_user)
        item = await ClientOnboardingItem.find_one(
            {"company_id": client.company_id, "client_id": str(client.id), "key": item_key}
        )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboarding item not found")

    manual_only = {"agreement", "documents"}
    if item_key not in manual_only:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This onboarding item is derived from linked records or structured onboarding data.",
        )

    old_status = item.status.value
    old_notes = item.notes
    if item_status is not None:
        try:
            item.status = ClientOnboardingItemStatus(item_status)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid onboarding item status") from exc
        item.completion_percent = 100 if item.status in {
            ClientOnboardingItemStatus.COMPLETED,
            ClientOnboardingItemStatus.SIGNED_CONFIRMED,
            ClientOnboardingItemStatus.CONFIRMED,
            ClientOnboardingItemStatus.READY,
        } else max(item.completion_percent, 25)
    if notes is not None:
        item.notes = notes.strip() or None
    if old_status != item.status.value or old_notes != item.notes:
        item.audit_history.append({
            "actor_id": str(current_user.id),
            "from_status": old_status,
            "to_status": item.status.value,
            "timestamp": utc_now(),
            "notes_changed": old_notes != item.notes,
        })
    item.updated_at = utc_now()
    await item.save()
    return await sync_client_onboarding(client, current_user)


@router.put("/{client_id}")
async def update_client(
    client_id: str,
    name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    contact: Optional[str] = Form(None),
    alternate_contact: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    zip_code: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    crm_company_id: Optional[str] = Form(None),
    source_lead_id: Optional[str] = Form(None),
    account_owner_id: Optional[str] = Form(None),
    sales_owner_id: Optional[str] = Form(None),
    industry: Optional[str] = Form(None),
    client_status: Optional[str] = Form(None, alias="status"),
    lifecycle_reason: Optional[str] = Form(None),
    lifecycle_metadata: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    client_type: Optional[str] = Form(None),
    budget: Optional[float] = Form(None),
    start_date: Optional[str] = Form(None),
    delivery_date: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Update client details"""
    try:
        client = await Client.get(client_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    check_company_access(current_user, client.company_id)
    
    # Update fields
    if name is not None:
        client.name = name
    if email is not None:
        client.email = email
    if contact is not None:
        client.contact = contact
    if alternate_contact is not None:
        client.alternate_contact = alternate_contact
    if address is not None:
        client.address = address
    if city is not None:
        client.city = city
    if state is not None:
        client.state = state
    if country is not None:
        client.country = country
    if zip_code is not None:
        client.zip_code = zip_code
    if company_name is not None:
        client.company_name = company_name
    if crm_company_id is not None:
        client.crm_company_id = await _validate_crm_company_id(crm_company_id, current_user)
    if source_lead_id is not None:
        client.source_lead_id = await _validate_source_lead_id(source_lead_id, current_user)
    if account_owner_id is not None:
        client.account_owner_id = await _validate_same_tenant_user_id(account_owner_id, current_user, "account owner")
    if sales_owner_id is not None:
        client.sales_owner_id = await _validate_same_tenant_user_id(sales_owner_id, current_user, "sales owner")
    if industry is not None:
        client.industry = industry
    if client_status is not None:
        metadata = None
        if lifecycle_metadata:
            try:
                metadata = json.loads(lifecycle_metadata)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid lifecycle metadata")
        await transition_client_status(client, client_status, current_user, lifecycle_reason, metadata)
    if assigned_to is not None:
        if assigned_to:
            assigned_user = await User.get(assigned_to)
            if not assigned_user or assigned_user.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid assigned user"
                )
        client.assigned_to = assigned_to
    if notes is not None:
        client.notes = notes
    if tags is not None:
        try:
            client.tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
        except:
            pass
    if client_type is not None:
        try:
            client.client_type = ClientType(client_type)
        except:
            pass
    if budget is not None:
        client.budget = budget
    if start_date is not None:
        try:
            client.start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except:
            pass
    if delivery_date is not None:
        try:
            client.delivery_date = datetime.fromisoformat(delivery_date.replace('Z', '+00:00'))
        except:
            pass
    
    client.updated_at = utc_now()
    await client.save()
    
    return {
        "message": "Client updated successfully",
        "client_id": str(client.id),
    }


@router.post("/{client_id}/projects")
async def add_project_to_client(
    client_id: str,
    project_id: str = Form(...),
    budget: Optional[float] = Form(None),
    start_date: Optional[str] = Form(None),
    delivery_date: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Add a project to client"""
    try:
        client = await Client.get(client_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    check_company_access(current_user, client.company_id)
    
    # Validate project
    try:
        project = await Project.get(project_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    check_company_access(current_user, project.company_id)
    
    # Add project if not already added
    if project_id not in client.project_ids:
        client.project_ids.append(project_id)
    project.client_id = str(client.id)
    
    # Update project-specific data
    if budget is not None:
        client.projects_budget[project_id] = budget
    
    if start_date:
        try:
            start_date_obj = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            client.projects_start_date[project_id] = start_date_obj
        except:
            pass
    
    if delivery_date:
        try:
            delivery_date_obj = datetime.fromisoformat(delivery_date.replace('Z', '+00:00'))
            client.projects_delivery_date[project_id] = delivery_date_obj
        except:
            pass
    
    client.updated_at = utc_now()
    await client.save()
    project.updated_at = utc_now()
    await project.save()
    
    return {
        "message": "Project added to client successfully",
        "client_id": str(client.id),
        "project_id": project_id,
    }


@router.delete("/{client_id}/projects/{project_id}")
async def remove_project_from_client(
    client_id: str,
    project_id: str,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Remove a project from client"""
    try:
        client = await Client.get(client_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    check_company_access(current_user, client.company_id)
    
    # Remove project
    if project_id in client.project_ids:
        client.project_ids.remove(project_id)
    
    # Remove project-specific data
    if project_id in client.projects_budget:
        del client.projects_budget[project_id]
    if project_id in client.projects_start_date:
        del client.projects_start_date[project_id]
    if project_id in client.projects_delivery_date:
        del client.projects_delivery_date[project_id]
    
    client.updated_at = utc_now()
    await client.save()

    try:
        project = await Project.get(project_id)
        if project and project.client_id == str(client.id):
            project.client_id = None
            project.updated_at = utc_now()
            await project.save()
    except Exception:
        logger.debug("Unable to clear client_id on project %s", project_id)
    
    return {
        "message": "Project removed from client successfully",
        "client_id": str(client.id),
    }


@router.post("/{client_id}/documents")
async def upload_client_document(
    client_id: str,
    file: UploadFile = File(...),
    document_name: Optional[str] = Form(None),
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Upload a document for client"""
    try:
        client = await Client.get(client_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    check_company_access(current_user, client.company_id)
    
    stored = await FileService.store_uploaded_file(
        file,
        upload_dir=UPLOAD_DIR,
        url_prefix="/api/v1/files/clients",
        scope="clients",
        sensitive=True,
    )
    file_ext = stored["extension"]
    file_size = stored["size"]
    file_url = stored["file_url"]
    
    # Add document to client
    document_data = {
        "name": document_name or file.filename,
        "original_name": file.filename,
        "url": file_url,
        "public_id": stored.get("cloudinary_public_id"),
        "resource_type": stored.get("cloudinary_resource_type"),
        "delivery_type": stored.get("cloudinary_delivery_type"),
        "type": file_ext[1:] if file_ext else "unknown",
        "size": file_size,
        "uploaded_at": utc_now().isoformat(),
        "uploaded_by": str(current_user.id),
    }
    
    client.documents.append(document_data)
    client.updated_at = utc_now()
    await client.save()

    # Also copy to associated projects so assigned leads/employees can see it
    for project_id in client.project_ids or []:
        try:
            project = await Project.get(project_id)
            if not project or project.company_id != client.company_id:
                continue
            
            project_file = {
                "id": uuid.uuid4().hex,
                "name": document_data["name"],
                "original_name": document_data["original_name"],
                "url": document_data["url"],
                "public_id": document_data.get("public_id"),
                "resource_type": document_data.get("resource_type"),
                "delivery_type": document_data.get("delivery_type"),
                "type": document_data["type"],
                "size": document_data["size"],
                "uploaded_at": utc_now().isoformat(),
                "uploaded_by": str(current_user.id),
                "uploaded_by_name": current_user.full_name(),
            }
            if not project.files:
                project.files = []
            project.files.append(project_file)
            project.updated_at = utc_now()
            await project.save()
        except Exception as e:
            logger.error(f"Failed to copy client document to project {project_id}: {e}")
    
    return {
        "message": "Document uploaded successfully",
        "document": document_data,
    }


@router.delete("/{client_id}/documents/{document_index}")
async def delete_client_document(
    client_id: str,
    document_index: int,
    current_user: User = Depends(get_current_company_admin_or_lead),
):
    """Delete a client document"""
    try:
        client = await Client.get(client_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    check_company_access(current_user, client.company_id)
    
    if document_index < 0 or document_index >= len(client.documents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document index"
        )
    
    # Remove document
    document = client.documents.pop(document_index)
    
    if document.get("public_id"):
        CloudinaryStorage.delete(
            document.get("public_id"),
            document.get("resource_type") or "auto",
            document.get("delivery_type") or "authenticated",
        )

    # Try to delete legacy local file from disk
    try:
        filename = Path(document.get("url", "")).name
        file_path = UPLOAD_DIR / filename
        if file_path.exists():
            file_path.unlink()
    except:
        pass  # Don't fail if file deletion fails
    
    client.updated_at = utc_now()
    await client.save()
    
    return {
        "message": "Document deleted successfully",
        "document": document,
    }


@router.delete("/{client_id}")
async def delete_client(
    client_id: str,
    current_user: User = Depends(get_current_company_admin),
):
    """Delete a client (Company Admin only)"""
    try:
        client = await Client.get(client_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found"
        )
    
    check_company_access(current_user, client.company_id)
    
    # Delete associated documents from Cloudinary or legacy local disk
    for document in client.documents:
        if document.get("public_id"):
            CloudinaryStorage.delete(
                document.get("public_id"),
                document.get("resource_type") or "auto",
                document.get("delivery_type") or "authenticated",
            )
            continue
        try:
            filename = Path(document.get("url", "")).name
            file_path = UPLOAD_DIR / filename
            if file_path.exists():
                file_path.unlink()
        except:
            pass
    
    await client.delete()
    
    return {
        "message": "Client deleted successfully",
    }
