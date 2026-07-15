"""
Ticket Escalation Logic
"""
from datetime import datetime, timedelta
from app.models.ticket import Ticket, TicketStatus, TicketPriority
from app.models.notification import Notification, NotificationType
from app.models.user import User
import logging

logger = logging.getLogger(__name__)


async def check_and_escalate_tickets():
    """Check for tickets that need escalation and escalate them"""
    # Get tickets that are open or in progress and older than escalation time
    now = datetime.now()
    
    # Escalation rules:
    # - Urgent: 2 hours
    # - High: 4 hours
    # - Medium: 8 hours
    # - Low: 24 hours
    
    escalation_rules = {
        "urgent": timedelta(hours=2),
        "high": timedelta(hours=4),
        "medium": timedelta(hours=8),
        "low": timedelta(hours=24),
    }
    
    for priority, time_limit in escalation_rules.items():
        cutoff_time = now - time_limit
        
        tickets = await Ticket.find({
            "status": {"$in": [TicketStatus.OPEN.value, TicketStatus.IN_PROGRESS.value]},
            "priority": priority,
            "created_at": {"$lt": cutoff_time},
            "escalated": False,  # Only escalate once
        }).to_list()
        
        for ticket in tickets:
            try:
                # Escalate: Change priority or notify admins
                if ticket.priority == TicketPriority.LOW:
                    ticket.priority = TicketPriority.MEDIUM
                elif ticket.priority == TicketPriority.MEDIUM:
                    ticket.priority = TicketPriority.HIGH
                elif ticket.priority == TicketPriority.HIGH:
                    ticket.priority = TicketPriority.URGENT
                
                ticket.escalated = True
                ticket.escalated_at = now
                await ticket.save()
                
                # Create notification for admins
                from app.models.user import CompanyAdmin
                admins = await CompanyAdmin.find({"company_id": ticket.company_id}).to_list()
                
                for admin in admins:
                    notification = Notification(
                        user_id=str(admin.id),
                        company_id=ticket.company_id,
                        type=NotificationType.TICKET_ESCALATED,
                        title=f"Ticket {ticket.ticket_number} Escalated",
                        message=f"Ticket '{ticket.title}' has been escalated due to no response.",
                        action_url=f"/tickets/{ticket.id}",
                    )
                    await notification.insert()
                
                logger.info(f"Escalated ticket {ticket.ticket_number}")
            except Exception as e:
                logger.error(f"Error escalating ticket {ticket.id}: {str(e)}")


