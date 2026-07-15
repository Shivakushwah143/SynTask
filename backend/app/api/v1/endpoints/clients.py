"""
Client Management Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, UploadFile, File
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
import logging
from pathlib import Path
import uuid

logger = logging.getLogger(__name__)

from app.crm.models import Client, ClientStatus
from app.models.user import User, UserRole
from app.models.project import Project
from app.crm.client_workspace import ClientWorkspaceService
from app.api.dependencies import (
    get_current_user,
    get_current_company_admin_or_lead,
    get_current_company_admin,
    check_company_access,
)

from app.core.config import settings
from app.api.deps import Pagination50, PaginationParams

router = APIRouter()

# Get upload directory
BACKEND_DIR = Path(__file__).parent.parent.parent.parent
UPLOAD_DIR = BACKEND_DIR / settings.UPLOAD_DIR / "clients"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROJECT_UPLOAD_DIR = BACKEND_DIR / settings.UPLOAD_DIR / "projects"
PROJECT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


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
    industry: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Create a new client"""
    # Check if user has permission (Admin, Manager, Lead, or Super Admin)
    if current_user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN]:
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
        if assigned_user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Can only assign clients to Admins, Managers, or Leads"
            )
    
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
        industry=industry,
        assigned_to=assigned_to,
        notes=notes,
        tags=parsed_tags,
        created_by=str(current_user.id),
        status=ClientStatus.ACTIVE,
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
            query["status"] = ClientStatus(status_filter)
        except:
            pass
    
    if assigned_to:
        query["assigned_to"] = assigned_to
    
    # For super admin, also filter by assigned_to if provided
    if current_user.role == UserRole.SUPER_ADMIN and assigned_to:
        query["assigned_to"] = assigned_to
    
    clients = await Client.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
    total = await Client.find(query).count()
    
    # Fetch project details for each client
    client_list = []
    for client in clients:
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
            "project_ids": client.project_ids,
            "projects": projects,
            "total_projects": len(client.project_ids),
            "total_budget": sum(client.projects_budget.values()),
            "documents_count": len(client.documents),
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
        "project_ids": client.project_ids,
        "projects": projects,
        "projects_budget": client.projects_budget,
        "projects_start_date": {k: v.isoformat() if v else None for k, v in client.projects_start_date.items()},
        "projects_delivery_date": {k: v.isoformat() if v else None for k, v in client.projects_delivery_date.items()},
        "documents": client.documents,
        "notes": client.notes,
        "tags": client.tags,
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
    industry: Optional[str] = Form(None),
    status: Optional[str] = Form(None),
    assigned_to: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
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
    if industry is not None:
        client.industry = industry
    if status is not None:
        try:
            client.status = ClientStatus(status)
        except:
            pass
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
    
    client.updated_at = datetime.utcnow()
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
    
    client.updated_at = datetime.utcnow()
    await client.save()
    project.updated_at = datetime.utcnow()
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
    
    client.updated_at = datetime.utcnow()
    await client.save()

    try:
        project = await Project.get(project_id)
        if project and project.client_id == str(client.id):
            project.client_id = None
            project.updated_at = datetime.utcnow()
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
    
    # Validate file size
    file_content = await file.read()
    file_size = len(file_content)
    
    if file_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE / 1024 / 1024}MB"
        )
    
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = UPLOAD_DIR / unique_filename
    
    # Save file
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    # File URL
    file_url = f"/api/v1/files/clients/{unique_filename}"
    
    # Add document to client
    document_data = {
        "name": document_name or file.filename,
        "original_name": file.filename,
        "url": file_url,
        "type": file_ext[1:] if file_ext else "unknown",
        "size": file_size,
        "uploaded_at": datetime.utcnow().isoformat(),
        "uploaded_by": str(current_user.id),
    }
    
    client.documents.append(document_data)
    client.updated_at = datetime.utcnow()
    await client.save()

    # Also copy to associated projects so assigned leads/employees can see it
    for project_id in client.project_ids or []:
        try:
            project = await Project.get(project_id)
            if not project or project.company_id != client.company_id:
                continue
            
            # Save a copy in project uploads
            project_filename = f"{uuid.uuid4()}{file_ext}"
            project_file_path = PROJECT_UPLOAD_DIR / project_filename
            with open(project_file_path, "wb") as pf:
                pf.write(file_content)
            
            project_file = {
                "id": uuid.uuid4().hex,
                "name": document_data["name"],
                "original_name": document_data["original_name"],
                "url": f"/api/v1/files/projects/{project_filename}",
                "type": document_data["type"],
                "size": document_data["size"],
                "uploaded_at": datetime.utcnow().isoformat(),
                "uploaded_by": str(current_user.id),
                "uploaded_by_name": current_user.full_name(),
            }
            if not project.files:
                project.files = []
            project.files.append(project_file)
            project.updated_at = datetime.utcnow()
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
    
    # Try to delete file from disk
    try:
        filename = Path(document.get("url", "")).name
        file_path = UPLOAD_DIR / filename
        if file_path.exists():
            file_path.unlink()
    except:
        pass  # Don't fail if file deletion fails
    
    client.updated_at = datetime.utcnow()
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
    
    # Delete associated documents from disk
    for document in client.documents:
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
