"""
Ticketing System Endpoints
"""
from fastapi import APIRouter, HTTPException, status, Depends, Form, Query
from typing import Optional, List
from datetime import datetime
from bson import ObjectId

from app.models.ticket import Ticket, TicketComment, TicketType, TicketPriority, TicketStatus
from app.models.user import User, UserRole
from app.api.dependencies import (
    get_current_user,
    get_current_company_admin_or_lead,
    check_company_access,
)
from app.core.cache import cache_delete_pattern

router = APIRouter()


async def generate_ticket_number(company_id: str) -> str:
    """Generate unique ticket number: TKT-YYYY-XXXX"""
    year = datetime.utcnow().year
    # Get count of tickets for this company this year
    prefix = f"TKT-{year}-"
    # Find the highest number for this year
    last_ticket = await Ticket.find_one(
        {"company_id": company_id, "ticket_number": {"$regex": f"^{prefix}"}},
        sort=[("ticket_number", -1)]
    )
    
    if last_ticket:
        try:
            last_num = int(last_ticket.ticket_number.split("-")[-1])
            new_num = last_num + 1
        except:
            new_num = 1
    else:
        new_num = 1
    
    return f"{prefix}{new_num:04d}"


@router.post("/")
async def create_ticket(
    title: str = Form(...),
    description: str = Form(...),
    type: str = Form("support"),
    priority: str = Form("medium"),
    assigned_to: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Create a new ticket (Employee and Lead can create)"""
    # Only Employee and Lead can create tickets
    if current_user.role not in [UserRole.EMPLOYEE, UserRole.LEAD]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Employees and Leads can create tickets"
        )
    
    if not current_user.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company"
        )
    
    # Validate ticket type
    try:
        ticket_type = TicketType(type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ticket type. Must be one of: {[t.value for t in TicketType]}"
        )
    
    # Validate priority
    try:
        ticket_priority = TicketPriority(priority)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid priority. Must be one of: {[p.value for p in TicketPriority]}"
        )
    
    # Validate assigned user if provided
    assigned_by = None
    assigned_at = None
    if assigned_to:
        assigned_user = await User.get(assigned_to)
        if not assigned_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned user not found"
            )
        if assigned_user.company_id != current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned user must be from the same company"
            )
        # All users (Employees, Leads, Admins) can assign tickets
        # Employees can assign to Leads and Admins only
        # Leads and Admins can assign to anyone in the company
        if current_user.role == UserRole.EMPLOYEE:
            # Employees can only assign to Leads and Admins
            if assigned_user.role not in [UserRole.LEAD, UserRole.ADMIN]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Employees can only assign tickets to Leads and Admins"
                )
        # Leads and Admins can assign to anyone in the company
        assigned_by = str(current_user.id)
        assigned_at = datetime.utcnow()
    
    # Generate ticket number
    ticket_number = await generate_ticket_number(current_user.company_id)
    
    # Create ticket
    ticket = Ticket(
        ticket_number=ticket_number,
        title=title,
        description=description,
        company_id=current_user.company_id,
        created_by=str(current_user.id),
        created_by_name=current_user.full_name(),
        created_by_email=current_user.email,
        type=ticket_type,
        priority=ticket_priority,
        status=TicketStatus.OPEN,
        assigned_to=assigned_to,
        assigned_by=assigned_by,
        assigned_at=assigned_at,
    )
    
    await ticket.save()
    await cache_delete_pattern(f"dashboard:stats:{current_user.company_id}:*")
    
    return {
        "id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "title": ticket.title,
        "description": ticket.description,
        "type": ticket.type.value,
        "priority": ticket.priority.value,
        "status": ticket.status.value,
        "created_by": ticket.created_by,
        "created_by_name": ticket.created_by_name,
        "assigned_to": ticket.assigned_to,
        "created_at": ticket.created_at,
    }


@router.get("/")
async def list_tickets(
    status_filter: Optional[str] = Query(None, alias="status_filter"),
    priority: Optional[str] = Query(None),
    type_filter: Optional[str] = Query(None, alias="type_filter"),
    assigned_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
):
    """List tickets with role-based visibility"""
    # Super Admin can see all tickets, others need company_id
    if current_user.role == UserRole.SUPER_ADMIN:
        query = {}
    else:
        if not current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must belong to a company"
            )
        query = {"company_id": current_user.company_id}
    
    # Role-based visibility with hierarchical RBAC:
    # - Employee: Only see tickets they created
    # - Lead: See tickets created by their employees + their own tickets
    # - Manager: See tickets created by all subordinates + their own tickets
    # - Admin: See all tickets in company
    if current_user.role == UserRole.EMPLOYEE:
        query["created_by"] = str(current_user.id)
    elif current_user.role == UserRole.LEAD:
        # Lead can see their own tickets + tickets from their employees
        employees = await User.find(
            User.reports_to == str(current_user.id),
            User.role == UserRole.EMPLOYEE
        ).to_list()
        employee_ids = [str(emp.id) for emp in employees]
        employee_ids.append(str(current_user.id))
        query["created_by"] = {"$in": employee_ids}
    elif current_user.role == UserRole.MANAGER:
        # Manager can see tickets from all subordinates
        subordinates = await current_user.get_all_subordinates()
        subordinate_ids = [str(sub.id) for sub in subordinates]
        subordinate_ids.append(str(current_user.id))
        query["created_by"] = {"$in": subordinate_ids}
    # Admin and Super Admin see all tickets (no additional filter)
    
    # Apply filters
    if status_filter:
        try:
            query["status"] = TicketStatus(status_filter)
        except ValueError:
            pass
    
    if priority:
        try:
            query["priority"] = TicketPriority(priority)
        except ValueError:
            pass
    
    if type_filter:
        try:
            query["type"] = TicketType(type_filter)
        except ValueError:
            pass
    
    if assigned_to:
        query["assigned_to"] = assigned_to
    
    # Get tickets
    tickets = await Ticket.find(query).skip(skip).limit(limit).sort("-created_at").to_list()
    total = await Ticket.find(query).count()
    
    return {
        "tickets": [
            {
                "id": str(ticket.id),
                "ticket_number": ticket.ticket_number,
                "title": ticket.title,
                "description": ticket.description,
                "type": ticket.type.value,
                "priority": ticket.priority.value,
                "status": ticket.status.value,
                "created_by": ticket.created_by,
                "created_by_name": ticket.created_by_name,
                "created_by_email": ticket.created_by_email,
                "assigned_to": ticket.assigned_to,
                "assigned_to_name": None,  # Will be filled if needed
                "created_at": ticket.created_at,
                "updated_at": ticket.updated_at,
            }
            for ticket in tickets
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get ticket details"""
    ticket = await Ticket.get(ticket_id)
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    check_company_access(current_user, ticket.company_id)
    
    # Check visibility based on role
    if current_user.role == UserRole.EMPLOYEE:
        if ticket.created_by != str(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view tickets you created"
            )
    elif current_user.role == UserRole.LEAD:
        # Lead can see their own tickets + tickets from their team
        if ticket.created_by != str(current_user.id):
            from app.models.user import Lead
            lead_record = await Lead.get(str(current_user.id))
            if lead_record and lead_record.managed_employee_ids:
                if ticket.created_by not in [str(uid) for uid in lead_record.managed_employee_ids]:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You can only view tickets from your team"
                    )
            else:
                if ticket.created_by != str(current_user.id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You can only view tickets you created"
                    )
    
    # Get assigned user name if assigned
    assigned_to_name = None
    if ticket.assigned_to:
        assigned_user = await User.get(ticket.assigned_to)
        if assigned_user:
            assigned_to_name = assigned_user.full_name()
    
    return {
        "id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "title": ticket.title,
        "description": ticket.description,
        "type": ticket.type.value,
        "priority": ticket.priority.value,
        "status": ticket.status.value,
        "created_by": ticket.created_by,
        "created_by_name": ticket.created_by_name,
        "created_by_email": ticket.created_by_email,
        "assigned_to": ticket.assigned_to,
        "assigned_to_name": assigned_to_name,
        "assigned_at": ticket.assigned_at,
        "resolution": ticket.resolution,
        "resolved_at": ticket.resolved_at,
        "resolved_by": ticket.resolved_by,
        "attachments": ticket.attachments,
        "tags": ticket.tags,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
    }


@router.patch("/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: str,
    new_status: str = Form(...),
    resolution: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Update ticket status (Admin, Lead, and Employee can update their own tickets)"""
    ticket = await Ticket.get(ticket_id)
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    check_company_access(current_user, ticket.company_id)
    
    # Check permissions
    can_update = False
    
    if current_user.role == UserRole.ADMIN or current_user.role == UserRole.SUPER_ADMIN:
        can_update = True
    elif current_user.role == UserRole.LEAD:
        # Lead can update their own tickets or tickets from their team
        if ticket.created_by == str(current_user.id):
            can_update = True
        else:
            from app.models.user import Lead
            lead_record = await Lead.get(str(current_user.id))
            if lead_record and lead_record.managed_employee_ids:
                if ticket.created_by in [str(uid) for uid in lead_record.managed_employee_ids]:
                    can_update = True
    elif current_user.role == UserRole.EMPLOYEE:
        # Employee can update their own tickets
        if ticket.created_by == str(current_user.id):
            can_update = True
    
    if not can_update:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this ticket"
        )
    
    # Validate status
    try:
        status_enum = TicketStatus(new_status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {[s.value for s in TicketStatus]}"
        )
    
    # Update ticket
    ticket.status = status_enum
    ticket.updated_at = datetime.utcnow()
    
    # Handle resolution
    if status_enum in [TicketStatus.RESOLVED, TicketStatus.CLOSED]:
        ticket.resolution = resolution
        ticket.resolved_at = datetime.utcnow()
        ticket.resolved_by = str(current_user.id)
        if status_enum == TicketStatus.CLOSED:
            ticket.closed_at = datetime.utcnow()
    elif status_enum == TicketStatus.REOPENED:
        ticket.resolution = None
        ticket.resolved_at = None
        ticket.resolved_by = None
        ticket.closed_at = None
    
    await ticket.save()
    await cache_delete_pattern(f"dashboard:stats:{ticket.company_id}:*")
    
    return {
        "id": str(ticket.id),
        "status": ticket.status.value,
        "resolution": ticket.resolution,
        "resolved_at": ticket.resolved_at,
        "updated_at": ticket.updated_at,
    }


@router.post("/{ticket_id}/assign")
async def assign_ticket(
    ticket_id: str,
    assigned_to: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Assign ticket to a user (All users can assign: Employees to Leads/Admins, Leads/Admins to anyone)"""
    ticket = await Ticket.get(ticket_id)
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    check_company_access(current_user, ticket.company_id)
    
    # Validate assigned user if provided (allow empty string to unassign)
    if assigned_to and assigned_to.strip():
        assigned_user = await User.get(assigned_to)
        if not assigned_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned user not found"
            )
        if assigned_user.company_id != ticket.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned user must be from the same company"
            )
        
        # Role-based assignment restrictions
        if current_user.role == UserRole.EMPLOYEE:
            # Employees can only assign to Leads and Admins
            if assigned_user.role not in [UserRole.LEAD, UserRole.ADMIN]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Employees can only assign tickets to Leads and Admins"
                )
        # Leads and Admins can assign to anyone in the company (no restriction)
    else:
        # Unassign ticket
        assigned_to = None
    
    # Update ticket
    ticket.assigned_to = assigned_to
    ticket.assigned_by = str(current_user.id) if assigned_to else None
    ticket.assigned_at = datetime.utcnow() if assigned_to else None
    ticket.updated_at = datetime.utcnow()
    
    await ticket.save()
    await cache_delete_pattern(f"dashboard:stats:{ticket.company_id}:*")
    
    return {
        "id": str(ticket.id),
        "assigned_to": ticket.assigned_to,
        "assigned_by": ticket.assigned_by,
        "assigned_at": ticket.assigned_at,
    }


@router.get("/{ticket_id}/comments")
async def get_ticket_comments(
    ticket_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get comments for a ticket"""
    ticket = await Ticket.get(ticket_id)
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    check_company_access(current_user, ticket.company_id)
    
    # Check visibility (same as get_ticket)
    if current_user.role == UserRole.EMPLOYEE:
        if ticket.created_by != str(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view tickets you created"
            )
    elif current_user.role == UserRole.LEAD:
        if ticket.created_by != str(current_user.id):
            from app.models.user import Lead
            lead_record = await Lead.get(str(current_user.id))
            if lead_record and lead_record.managed_employee_ids:
                if ticket.created_by not in [str(uid) for uid in lead_record.managed_employee_ids]:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You can only view tickets from your team"
                    )
            else:
                if ticket.created_by != str(current_user.id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You can only view tickets you created"
                    )
    
    comments = await TicketComment.find({
        "ticket_id": ticket_id,
        "company_id": ticket.company_id
    }).sort("created_at").to_list()
    
    # Filter internal comments for employees
    if current_user.role == UserRole.EMPLOYEE:
        comments = [c for c in comments if not c.is_internal]
    
    return {
        "comments": [
            {
                "id": str(comment.id),
                "user_id": comment.user_id,
                "user_name": comment.user_name,
                "user_role": comment.user_role,
                "content": comment.content,
                "is_internal": comment.is_internal,
                "created_at": comment.created_at,
                "updated_at": comment.updated_at,
                "is_edited": comment.is_edited,
            }
            for comment in comments
        ]
    }


@router.put("/{ticket_id}")
async def update_ticket(
    ticket_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    type: Optional[str] = Form(None),
    priority: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """Update ticket details (Admin, Lead, and Employee can update their own tickets)"""
    ticket = await Ticket.get(ticket_id)
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    check_company_access(current_user, ticket.company_id)
    
    # Check permissions
    can_update = False
    
    if current_user.role == UserRole.ADMIN or current_user.role == UserRole.SUPER_ADMIN:
        can_update = True
    elif current_user.role == UserRole.LEAD:
        # Lead can update their own tickets or tickets from their team
        if ticket.created_by == str(current_user.id):
            can_update = True
        else:
            from app.models.user import Lead
            lead_record = await Lead.get(str(current_user.id))
            if lead_record and lead_record.managed_employee_ids:
                if ticket.created_by in [str(uid) for uid in lead_record.managed_employee_ids]:
                    can_update = True
    elif current_user.role == UserRole.EMPLOYEE:
        # Employee can update their own tickets
        if ticket.created_by == str(current_user.id):
            can_update = True
    
    if not can_update:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this ticket"
        )
    
    # Update fields if provided
    if title is not None:
        ticket.title = title
    if description is not None:
        ticket.description = description
    if type is not None:
        try:
            ticket.type = TicketType(type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid ticket type. Must be one of: {[t.value for t in TicketType]}"
            )
    if priority is not None:
        try:
            ticket.priority = TicketPriority(priority)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority. Must be one of: {[p.value for p in TicketPriority]}"
            )
    
    ticket.updated_at = datetime.utcnow()
    await ticket.save()
    
    return {
        "id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "title": ticket.title,
        "description": ticket.description,
        "type": ticket.type.value,
        "priority": ticket.priority.value,
        "status": ticket.status.value,
        "updated_at": ticket.updated_at,
    }


@router.delete("/{ticket_id}")
async def delete_ticket(
    ticket_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete ticket (Admin, Lead, and Employee can delete their own tickets)"""
    ticket = await Ticket.get(ticket_id)
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    check_company_access(current_user, ticket.company_id)
    
    # Check permissions
    can_delete = False
    
    if current_user.role == UserRole.ADMIN or current_user.role == UserRole.SUPER_ADMIN:
        can_delete = True
    elif current_user.role == UserRole.LEAD:
        # Lead can delete their own tickets or tickets from their team
        if ticket.created_by == str(current_user.id):
            can_delete = True
        else:
            from app.models.user import Lead
            lead_record = await Lead.get(str(current_user.id))
            if lead_record and lead_record.managed_employee_ids:
                if ticket.created_by in [str(uid) for uid in lead_record.managed_employee_ids]:
                    can_delete = True
    elif current_user.role == UserRole.EMPLOYEE:
        # Employee can delete their own tickets
        if ticket.created_by == str(current_user.id):
            can_delete = True
    
    if not can_delete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this ticket"
        )
    
    # Delete ticket
    await ticket.delete()
    await cache_delete_pattern(f"dashboard:stats:{ticket.company_id}:*")
    
    return {
        "message": "Ticket deleted successfully",
        "ticket_id": ticket_id,
    }


@router.post("/{ticket_id}/comments")
async def add_ticket_comment(
    ticket_id: str,
    content: str = Form(...),
    is_internal: bool = Form(False),
    current_user: User = Depends(get_current_user),
):
    """Add comment to a ticket"""
    ticket = await Ticket.get(ticket_id)
    
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found"
        )
    
    check_company_access(current_user, ticket.company_id)
    
    # Check visibility (same as get_ticket)
    if current_user.role == UserRole.EMPLOYEE:
        if ticket.created_by != str(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only comment on tickets you created"
            )
        # Employees cannot create internal comments
        is_internal = False
    elif current_user.role == UserRole.LEAD:
        if ticket.created_by != str(current_user.id):
            from app.models.user import Lead
            lead_record = await Lead.get(str(current_user.id))
            if lead_record and lead_record.managed_employee_ids:
                if ticket.created_by not in [str(uid) for uid in lead_record.managed_employee_ids]:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You can only comment on tickets from your team"
                    )
            else:
                if ticket.created_by != str(current_user.id):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You can only comment on tickets you created"
                    )
    
    # Create comment
    comment = TicketComment(
        ticket_id=ticket_id,
        company_id=ticket.company_id,
        user_id=str(current_user.id),
        user_name=current_user.full_name(),
        user_role=current_user.role.value,
        content=content,
        is_internal=is_internal,
    )
    
    await comment.save()
    
    # Update ticket's updated_at
    ticket.updated_at = datetime.utcnow()
    await ticket.save()
    
    return {
        "id": str(comment.id),
        "user_id": comment.user_id,
        "user_name": comment.user_name,
        "user_role": comment.user_role,
        "content": comment.content,
        "is_internal": comment.is_internal,
        "created_at": comment.created_at,
    }
