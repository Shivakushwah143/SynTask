from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from app.timeline.publisher import publish_crm_timeline_event
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.notification import Notification, NotificationType
from app.crm.models import ProspectStatus, SalesProspect
from app.models.user import User, UserRole
from app.core.clock import utc_now


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    full_name = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


async def handle_lost_workflow(current_user: User, lead: SalesProspect, reason: Optional[str]) -> Dict[str, Any]:
    company_id = str(getattr(lead, "company_id", "") or "")
    now = utc_now()
    lead.status = ProspectStatus.LOST
    lead.reason_for_lost = reason.strip() if reason else None
    lead.closed_date = now
    lead.closed_by = str(getattr(current_user, "id", ""))
    lead.current_stage = "Lost"
    lead.stage_last_changed_at = now
    lead.stage_entered_at = now
    lead.days_in_stage = 0
    lead.updated_at = now
    await lead.save()

    reminder = CRMActivity(
        company_id=company_id,
        entity_type="lead",
        entity_id=str(lead.id),
        activity_type=CRMActivityType.REMINDER.value,
        title=f"Nurture lost lead - {lead.prospect_name}",
        description=reason.strip() if reason else f"Follow up with {lead.prospect_name} after loss.",
        status=CRMActivityStatus.SCHEDULED,
        priority=CRMActivityPriority.MEDIUM,
        owner_id=str(getattr(lead, "assigned_to", None) or getattr(current_user, "id", "")),
        owner_name=_display_name(current_user),
        due_date=now + timedelta(days=7),
        metadata={
            "lead_id": str(lead.id),
            "lead_name": lead.prospect_name,
            "status": lead.status.value,
            "reason_for_lost": lead.reason_for_lost,
            "workflow": "lost_lifecycle",
            "auto_created": True,
        },
        created_by=str(getattr(current_user, "id", "")),
        created_by_name=_display_name(current_user),
        updated_by=str(getattr(current_user, "id", "")),
        updated_by_name=_display_name(current_user),
        created_at=now,
        updated_at=now,
    )
    await reminder.insert()

    notification = Notification(
        user_id=str(getattr(lead, "assigned_to", None) or getattr(current_user, "id", "")),
        company_id=company_id,
        type=NotificationType.SYSTEM,
        title="Lost lead entered nurture",
        message=f"{lead.prospect_name} was moved to Lost and added to nurture.",
        related_id=str(lead.id),
        related_type="sales_prospect",
        action_url=f"/crm/leads/{lead.id}",
        metadata={
            "lead_id": str(lead.id),
            "reason_for_lost": lead.reason_for_lost,
            "workflow": "lost_lifecycle",
        },
    )
    await notification.insert()

    await publish_crm_timeline_event(
        event_name="LeadLost",
        aggregate_type="sales_prospect",
        aggregate_id=str(lead.id),
        company_id=company_id,
        actor_id=str(getattr(current_user, "id", "")),
        payload={
            "lead_id": str(lead.id),
            "lead_name": lead.prospect_name,
            "reason_for_lost": lead.reason_for_lost,
            "status": lead.status.value,
            "timestamp": now.isoformat(),
        },
        metadata={"surface": "crm", "workflow": "lost_lifecycle"},
    )

    return {
        "lead": lead,
        "reminder_id": str(reminder.id),
        "notification_id": str(notification.id),
        "message": "Lost lead moved to nurture",
    }

