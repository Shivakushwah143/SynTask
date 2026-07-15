"""
Reports & Analytics Endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, Response
from datetime import datetime, timedelta
from typing import Optional
import csv
import io

from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus
from app.models.ticket import Ticket, TicketStatus
from app.models.company import Company
from app.api.dependencies import get_current_user, get_current_super_admin, get_current_company_admin

router = APIRouter()


@router.get("/tasks/export")
async def export_tasks_report(
    format: str = "csv",  # csv or pdf
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Export tasks report"""
    query = {"company_id": current_user.company_id}
    
    if status:
        query["status"] = status
    
    if start_date:
        query["created_at"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = datetime.fromisoformat(end_date)
        else:
            query["created_at"] = {"$lte": datetime.fromisoformat(end_date)}
    
    tasks = await Task.find(query).to_list()
    
    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            "Task ID", "Title", "Status", "Priority", "Assigned To",
            "Created By", "Due Date", "Created At"
        ])
        
        # Data
        for task in tasks:
            writer.writerow([
                str(task.id),
                task.title,
                task.status.value,
                task.priority.value,
                task.assigned_to or "Unassigned",
                task.created_by,
                task.due_date.isoformat() if task.due_date else "",
                task.created_at.isoformat()
            ])
        
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=tasks_report.csv"}
        )
    
    # PDF would require additional library like reportlab
    raise HTTPException(
        status_code=400,
        detail="PDF export not yet implemented. Use CSV format."
    )


@router.get("/tickets/export")
async def export_tickets_report(
    format: str = "csv",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Export tickets report"""
    query = {"company_id": current_user.company_id}
    
    if status:
        query["status"] = status
    
    tickets = await Ticket.find(query).to_list()
    
    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow([
            "Ticket Number", "Title", "Type", "Status", "Priority",
            "Created By", "Assigned To", "Created At", "Resolved At"
        ])
        
        for ticket in tickets:
            writer.writerow([
                ticket.ticket_number,
                ticket.title,
                ticket.type.value,
                ticket.status.value,
                ticket.priority.value,
                ticket.created_by_name,
                ticket.assigned_to or "Unassigned",
                ticket.created_at.isoformat(),
                ticket.resolved_at.isoformat() if ticket.resolved_at else ""
            ])
        
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=tickets_report.csv"}
        )
    
    raise HTTPException(
        status_code=400,
        detail="PDF export not yet implemented. Use CSV format."
    )


@router.get("/analytics/charts")
async def get_analytics_charts(
    period: str = "month",  # week, month, year
    current_user: User = Depends(get_current_company_admin)
):
    """Get analytics data for charts"""
    # Calculate date range
    end_date = datetime.now()
    if period == "week":
        start_date = end_date - timedelta(days=7)
    elif period == "month":
        start_date = end_date - timedelta(days=30)
    else:
        start_date = end_date - timedelta(days=365)
    
    # Super Admin sees all data, others see only their company
    if current_user.role == UserRole.SUPER_ADMIN:
        task_query = {}
        ticket_query = {}
    else:
        if not current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must belong to a company"
            )
        task_query = {"company_id": current_user.company_id}
        ticket_query = {"company_id": current_user.company_id}
    
    # Task statistics
    total_tasks = await Task.find(task_query).count()
    completed_tasks_query = {**task_query, "status": TaskStatus.COMPLETED, "completed_at": {"$gte": start_date}}
    completed_tasks = await Task.find(completed_tasks_query).count()
    
    # Task status breakdown
    task_status_data = {}
    for status in TaskStatus:
        status_query = {**task_query, "status": status}
        count = await Task.find(status_query).count()
        task_status_data[status.value] = count
    
    # Ticket statistics
    total_tickets = await Ticket.find(ticket_query).count()
    resolved_tickets_query = {**ticket_query, "status": TicketStatus.RESOLVED, "resolved_at": {"$gte": start_date}}
    resolved_tickets = await Ticket.find(resolved_tickets_query).count()
    
    # Ticket status breakdown
    ticket_status_data = {}
    for status in TicketStatus:
        status_query = {**ticket_query, "status": status}
        count = await Ticket.find(status_query).count()
        ticket_status_data[status.value] = count
    
    return {
        "tasks": {
            "total": total_tasks,
            "completed": completed_tasks,
            "completion_rate": (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0,
            "by_status": task_status_data
        },
        "tickets": {
            "total": total_tickets,
            "resolved": resolved_tickets,
            "resolution_rate": (resolved_tickets / total_tickets * 100) if total_tickets > 0 else 0,
            "by_status": ticket_status_data
        },
        "period": period
    }


