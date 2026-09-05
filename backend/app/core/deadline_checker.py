"""
Background task to check for approaching project deadlines and send notifications
"""
import asyncio
from datetime import datetime, timedelta
from app.models.project import Project
from app.models.notification import Notification, NotificationType
from app.models.user import User
import logging
from app.core.clock import utc_now

logger = logging.getLogger(__name__)


async def check_approaching_deadlines():
    """Check projects with deadlines approaching (2 days) and send notifications"""
    try:
        # Get all active projects with delivery dates
        now = utc_now()
        two_days_from_now = now + timedelta(days=2)
        
        # Find projects with delivery dates between now and 2 days from now
        projects = await Project.find({
            "status": "active",
            "delivery_date": {
                "$gte": now,
                "$lte": two_days_from_now
            }
        }).to_list()
        
        for project in projects:
            # Check if notification already sent (to avoid duplicates)
            # We'll check if a notification was sent in the last 24 hours
            yesterday = now - timedelta(days=1)
            existing_notification = await Notification.find_one({
                "company_id": project.company_id,
                "related_id": str(project.id),
                "related_type": "project",
                "type": NotificationType.DEADLINE_APPROACHING,
                "created_at": {"$gte": yesterday}
            })
            
            if existing_notification:
                continue  # Already notified recently
            
            # Calculate days remaining
            days_remaining = (project.delivery_date - now).days
            
            # Send notification to assigned user
            if project.assigned_to:
                notification = Notification(
                    company_id=project.company_id,
                    user_id=project.assigned_to,
                    type=NotificationType.DEADLINE_APPROACHING,
                    title="Project Deadline Approaching",
                    message=f"Project '{project.name}' deadline is in {days_remaining} day(s). Please complete it soon!",
                    related_id=str(project.id),
                    related_type="project",
                )
                await notification.insert()
                logger.info(f"Sent deadline notification for project {project.name} to user {project.assigned_to}")
            
            # Also notify project lead if different from assigned user
            if project.lead_id and project.lead_id != project.assigned_to:
                existing_lead_notification = await Notification.find_one({
                    "company_id": project.company_id,
                    "user_id": project.lead_id,
                    "related_id": str(project.id),
                    "related_type": "project",
                    "type": NotificationType.DEADLINE_APPROACHING,
                    "created_at": {"$gte": yesterday}
                })
                
                if not existing_lead_notification:
                    notification = Notification(
                        company_id=project.company_id,
                        user_id=project.lead_id,
                        type=NotificationType.DEADLINE_APPROACHING,
                        title="Project Deadline Approaching",
                        message=f"Project '{project.name}' deadline is in {days_remaining} day(s). Please ensure completion!",
                        related_id=str(project.id),
                        related_type="project",
                    )
                    await notification.insert()
                    logger.info(f"Sent deadline notification for project {project.name} to lead {project.lead_id}")
        
        logger.info(f"Checked {len(projects)} projects for approaching deadlines")
        
    except Exception as e:
        logger.error(f"Error checking approaching deadlines: {str(e)}", exc_info=True)


async def run_deadline_checker():
    """Run the deadline checker periodically.

    Leader-gated: with multiple API workers only the worker holding the Redis
    lease runs each cycle, so deadline notifications are not duplicated.
    """
    from app.core.leader import try_acquire_leader
    while True:
        if not await try_acquire_leader("deadline_checker", ttl_seconds=30 * 60):
            # Another worker owns this cycle — re-attempt next interval.
            await asyncio.sleep(30 * 60)
            continue
        try:
            await check_approaching_deadlines()
            # Check every 6 hours
            await asyncio.sleep(6 * 60 * 60)
        except Exception as e:
            logger.error(f"Error in deadline checker loop: {str(e)}")
            # Wait 1 hour before retrying on error
            await asyncio.sleep(60 * 60)



