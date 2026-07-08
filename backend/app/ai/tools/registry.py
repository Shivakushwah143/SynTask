from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.crm.timeline import publish_crm_timeline_event
from app.ai.tools.core import BaseTool, ToolContext, ToolHandler, ToolResult
from app.crm.context_builder import CRMContextBuilder
from app.crm.deals import CRMDealService
from app.crm.lead_engine import LeadEngine
from app.crm.pipeline import CRMPipelineService
from app.services.notification_service import notification_service
from app.models.crm_activity import CRMActivity, CRMActivityPriority, CRMActivityStatus, CRMActivityType
from app.models.meeting import Meeting, MeetingStatus
from app.models.notification import Notification, NotificationType
from app.models.sales_prospect import SalesProspect
from app.models.user import User, UserRole, UserStatus


def _display_name(user: Optional[User], fallback: str = "System") -> str:
    if not user:
        return fallback
    first_name = getattr(user, "first_name", "") or ""
    last_name = getattr(user, "last_name", "") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or getattr(user, "email", None) or str(getattr(user, "id", fallback))


def _priority_value(value: Optional[str]) -> CRMActivityPriority:
    normalized = str(value or "medium").strip().lower()
    try:
        return CRMActivityPriority(normalized)
    except Exception:
        return CRMActivityPriority.MEDIUM


def _now() -> datetime:
    return datetime.utcnow()


def _lead_or_404(current_user: User, lead_id: str) -> SalesProspect:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Lead lookup is implemented inside tool handlers")


class GetCRMContextTool(BaseTool):
    name = "getCRMContext"
    description = "Build a deterministic CRM context payload for a lead."
    required_roles = set()

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        if not lead_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id is required")
        depth = str(payload.get("depth") or "standard").strip().lower()
        data = await CRMContextBuilder.build_lead_context(context.current_user, lead_id, depth=depth)
        return ToolResult(tool_name=self.name, success=True, data=data, meta={"depth": depth})


class SearchCRMTool(BaseTool):
    name = "searchCRM"
    description = "Search CRM records using existing services."
    required_roles = set()

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        query = str(payload.get("query") or "").strip()
        if not query:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="query is required")
        limit = min(max(int(payload.get("limit") or 10), 1), 25)

        company_id = context.company_id
        if context.current_user.role != UserRole.SUPER_ADMIN and not company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company context required")

        lead_filter: Dict[str, Any] = {"deleted": False}
        if context.current_user.role != UserRole.SUPER_ADMIN:
            lead_filter["company_id"] = company_id
        lead_filter["$or"] = [
            {"prospect_name": {"$regex": query, "$options": "i"}},
            {"company_name": {"$regex": query, "$options": "i"}},
            {"phone": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}},
        ]
        leads = await SalesProspect.find(lead_filter).sort("-updated_at").limit(limit).to_list()
        return ToolResult(
            tool_name=self.name,
            success=True,
            data={
                "query": query,
                "leads": [
                    {
                        "id": str(lead.id),
                        "prospect_name": lead.prospect_name,
                        "company_name": lead.company_name,
                        "email": lead.email,
                        "phone": lead.phone,
                        "current_stage": lead.current_stage,
                        "status": lead.status.value,
                    }
                    for lead in leads
                ],
            },
        )


class QualifyLeadTool(BaseTool):
    name = "qualifyLead"
    description = "Score a lead and recommend a next action using existing CRM context."
    required_roles = set()

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        if not lead_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id is required")
        depth = str(payload.get("depth") or "standard").strip().lower()
        crm_context = await CRMContextBuilder.build_lead_context(context.current_user, lead_id, depth=depth)
        lead = crm_context["lead"]
        score = 0
        score += 20 if lead.get("email") else 0
        score += 10 if lead.get("phone") else 0
        score += 10 if crm_context.get("company") else 0
        score += 10 if crm_context.get("contact") else 0
        score += 15 if crm_context.get("recent_activities") else 0
        score += 15 if crm_context.get("deal") else 0
        score += 10 if crm_context.get("notes", {}).get("total", 0) else 0
        score += 10 if crm_context.get("files", {}).get("total", 0) else 0
        score = min(100, score)
        if score >= 80:
            priority = "high"
            stage = "Proposal Sent" if lead.get("current_stage") in {"Qualified", "Negotiation"} else "Qualified"
        elif score >= 50:
            priority = "medium"
            stage = "Discovery Scheduled"
        else:
            priority = "low"
            stage = "Contacted"
        result = {
            "lead_id": lead_id,
            "lead_score": score,
            "priority": priority,
            "recommended_stage": stage,
            "recommended_salesperson": lead.get("assigned_to_name") or lead.get("assigned_to"),
            "recommended_next_action": "Schedule discovery call" if score >= 50 else "Request more lead details",
            "reasoning": [
                "Built from CRM context",
                f"Lead has {crm_context.get('notes', {}).get('total', 0)} notes and {crm_context.get('files', {}).get('total', 0)} files",
                f"Current stage is {lead.get('current_stage')}",
            ],
            "context": crm_context,
        }
        return ToolResult(tool_name=self.name, success=True, data=result, meta={"depth": depth})


class AssignLeadTool(BaseTool):
    name = "assignLead"
    description = "Assign a lead to a specific sales user using the existing lead engine."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        assigned_to = str(payload.get("assigned_to") or "").strip()
        if not lead_id or not assigned_to:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id and assigned_to are required")
        result = await LeadEngine.update_lead(context.current_user, lead_id, {"assigned_to": assigned_to})
        return ToolResult(tool_name=self.name, success=True, data=result)


class AssignBestSalespersonTool(BaseTool):
    name = "assignBestSalesperson"
    description = "Recommend the best salesperson for a lead."
    required_roles = set()

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        if not lead_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id is required")
        crm_context = await CRMContextBuilder.build_lead_context(context.current_user, lead_id, depth="minimal")
        assigned_to = crm_context.get("assignment_information", {}).get("assigned_to")
        if not assigned_to:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No assignee found")
        return ToolResult(
            tool_name=self.name,
            success=True,
            data={
                "lead_id": lead_id,
                "assigned_to": assigned_to,
                "assigned_to_name": crm_context.get("assignment_information", {}).get("assigned_to_name"),
                "reasoning": ["Current assignment and lead context were used to recommend the active owner."],
            },
        )


class PreviewImportTool(BaseTool):
    name = "previewImport"
    description = "Preview a lead import file without writing data."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        file = payload.get("file")
        if not isinstance(file, UploadFile):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file is required")
        content = await file.read()
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file uploaded")
        preview = {
            "filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
            "strategy": str(payload.get("strategy") or "round-robin").strip().lower(),
            "target_user_id": payload.get("target_user_id"),
        }
        return ToolResult(tool_name=self.name, success=True, data=preview)


class ImportLeadsTool(BaseTool):
    name = "importLeads"
    description = "Import leads using the existing lead engine."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        file = payload.get("file")
        if not isinstance(file, UploadFile):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file is required")
        strategy = str(payload.get("strategy") or "round-robin").strip().lower()
        result = await LeadEngine.import_leads(
            context.current_user,
            file,
            strategy=strategy,
            target_user_id=payload.get("target_user_id"),
        )
        return ToolResult(tool_name=self.name, success=True, data=result)


class MovePipelineTool(BaseTool):
    name = "movePipeline"
    description = "Move a lead to a new pipeline stage."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        stage = str(payload.get("stage") or "").strip()
        if not lead_id or not stage:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id and stage are required")
        result = await LeadEngine.move_stage(context.current_user, lead_id, stage, reason=payload.get("reason"))
        return ToolResult(tool_name=self.name, success=True, data=result)


class ScheduleMeetingTool(BaseTool):
    name = "scheduleMeeting"
    description = "Schedule a CRM meeting for a lead."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        title = str(payload.get("title") or "").strip()
        meeting_date = payload.get("meeting_date")
        meeting_time = str(payload.get("meeting_time") or "").strip()
        if not lead_id or not title or not meeting_date or not meeting_time:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id, title, meeting_date and meeting_time are required")
        lead = await SalesProspect.get(lead_id)
        if not lead or lead.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if context.current_user.role != UserRole.SUPER_ADMIN and lead.company_id != context.current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        meeting = Meeting(
            title=title,
            description=payload.get("description"),
            company_id=str(lead.company_id),
            created_by=str(context.current_user.id),
            host_id=str(payload.get("host_id") or getattr(context.current_user, "id", "")),
            participant_ids=list(payload.get("participant_ids") or []),
            meeting_date=meeting_date,
            meeting_time=meeting_time,
            duration=int(payload.get("duration") or 30),
            status=MeetingStatus.SCHEDULED,
            created_at=_now(),
            updated_at=_now(),
        )
        await meeting.insert()
        await publish_crm_timeline_event(
            event_name="MeetingScheduled",
            aggregate_type="sales_prospect",
            aggregate_id=str(lead.id),
            company_id=str(lead.company_id),
            actor_id=str(context.current_user.id),
            payload={
                "lead_id": str(lead.id),
                "meeting_id": str(meeting.id),
                "title": meeting.title,
                "meeting_date": meeting.meeting_date.isoformat() if getattr(meeting, "meeting_date", None) else None,
                "meeting_time": meeting.meeting_time,
            },
            metadata={"surface": "crm", "workflow": "tool_layer"},
        )
        return ToolResult(tool_name=self.name, success=True, data={"meeting_id": str(meeting.id), "meeting": meeting.model_dump() if hasattr(meeting, "model_dump") else {"id": str(meeting.id)}})


class CreateFollowUpTool(BaseTool):
    name = "createFollowUp"
    description = "Create a follow-up activity for a lead."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        title = str(payload.get("title") or "Follow-up").strip()
        if not lead_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id is required")
        lead = await SalesProspect.get(lead_id)
        if not lead or lead.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        if context.current_user.role != UserRole.SUPER_ADMIN and lead.company_id != context.current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        activity = CRMActivity(
            company_id=str(lead.company_id),
            entity_type="lead",
            entity_id=str(lead.id),
            activity_type=CRMActivityType.FOLLOW_UP.value,
            title=title,
            description=payload.get("description"),
            status=CRMActivityStatus.SCHEDULED,
            priority=_priority_value(payload.get("priority")),
            owner_id=str(payload.get("owner_id") or getattr(context.current_user, "id", "")),
            owner_name=_display_name(context.current_user, str(context.current_user.id)),
            due_date=payload.get("due_date"),
            scheduled_at=payload.get("scheduled_at") or payload.get("due_date"),
            created_by=str(context.current_user.id),
            created_by_name=_display_name(context.current_user, str(context.current_user.id)),
            updated_by=str(context.current_user.id),
            updated_by_name=_display_name(context.current_user, str(context.current_user.id)),
            created_at=_now(),
            updated_at=_now(),
        )
        await activity.insert()
        return ToolResult(tool_name=self.name, success=True, data={"follow_up_id": str(activity.id), "activity": activity.model_dump() if hasattr(activity, "model_dump") else {"id": str(activity.id)}})


class CompleteFollowUpTool(BaseTool):
    name = "completeFollowUp"
    description = "Mark a follow-up activity complete."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        activity_id = str(payload.get("activity_id") or "").strip()
        if not activity_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="activity_id is required")
        activity = await CRMActivity.get(activity_id)
        if not activity or activity.deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
        if context.current_user.role != UserRole.SUPER_ADMIN and activity.company_id != context.current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        now = _now()
        activity.status = CRMActivityStatus.COMPLETED
        activity.completed_at = now
        activity.completed_by = str(context.current_user.id)
        activity.completed_by_name = _display_name(context.current_user, str(context.current_user.id))
        activity.updated_at = now
        await activity.save()
        return ToolResult(tool_name=self.name, success=True, data={"activity_id": str(activity.id), "status": activity.status.value})


class GenerateProposalTool(BaseTool):
    name = "generateProposal"
    description = "Create a proposal version on an existing deal."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        if not lead_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id is required")
        result = await CRMDealService.create_proposal(context.current_user, lead_id, payload)
        return ToolResult(tool_name=self.name, success=True, data=result)


class NotifySalesTool(BaseTool):
    name = "notifySales"
    description = "Create a sales notification."
    required_roles = set()

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        target_user_id = str(payload.get("user_id") or "").strip()
        message = str(payload.get("message") or "").strip()
        if not target_user_id or not message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id and message are required")
        notification = Notification(
            company_id=str(context.company_id or ""),
            user_id=target_user_id,
            type=NotificationType.MENTION,
            title=str(payload.get("title") or "Sales update"),
            message=message,
            related_id=str(payload.get("related_id") or ""),
            related_type=str(payload.get("related_type") or "lead"),
        )
        await notification.insert()
        await publish_crm_timeline_event(
            event_name="NotificationCreated",
            aggregate_type="crm_notification",
            aggregate_id=str(notification.id),
            company_id=str(context.company_id or ""),
            actor_id=str(getattr(context.current_user, "id", "")),
            payload={
                "notification_id": str(notification.id),
                "user_id": target_user_id,
                "title": notification.title,
                "message": notification.message,
                "related_id": notification.related_id,
                "related_type": notification.related_type,
            },
            metadata={"surface": "crm", "workflow": "notifications"},
        )
        return ToolResult(tool_name=self.name, success=True, data={"notification_id": str(notification.id)})


class NotifyUserTool(NotifySalesTool):
    name = "notifyUser"
    description = "Create a notification for any user."


class GetLeadIntelligenceTool(BaseTool):
    name = "getLeadIntelligence"
    description = "Return the structured Lead Intelligence assessment for a lead."
    required_roles = set()

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        if not lead_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id is required")
        depth = str(payload.get("depth") or "standard").strip().lower()
        from app.ai.agents.lead_intelligence import LeadIntelligenceAgent
        from app.schemas.ai import AILeadIntelligenceRequest

        support_registry = ToolRegistry()
        support_registry.register(GetCRMContextTool())
        support_registry.register(SearchCRMTool())
        agent = LeadIntelligenceAgent(tool_registry=support_registry)
        result = await agent.analyze(context.current_user, AILeadIntelligenceRequest(lead_id=lead_id, depth=depth, persist=False))
        return ToolResult(tool_name=self.name, success=True, data=result.model_dump())


class SendSalesEmailTool(BaseTool):
    name = "sendSalesEmail"
    description = "Send a sales email using the outbound notification service."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        recipient_email = str(payload.get("to_email") or payload.get("recipient_email") or "").strip()
        subject = str(payload.get("subject") or "").strip()
        html = str(payload.get("html") or "").strip()
        text = str(payload.get("text") or "").strip()
        lead_id = str(payload.get("lead_id") or "").strip()
        if not recipient_email or not subject or not html or not text or not lead_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_email, subject, html, text and lead_id are required")
        result = await notification_service.send_sales_email(
            company_id=str(context.company_id or ""),
            lead_id=lead_id,
            recipient_email=recipient_email,
            subject=subject,
            html=html,
            text=text,
            actor_id=str(getattr(context.current_user, "id", "")),
            actor_name=_display_name(context.current_user, str(getattr(context.current_user, "id", ""))),
            related_user_id=str(payload.get("user_id") or payload.get("target_user_id") or "") or None,
            lead_name=payload.get("lead_name"),
            template_variables=payload.get("template_variables") or {},
            attachments=payload.get("attachments") or [],
            idempotency_key=str(payload.get("idempotency_key") or "") or None,
        )
        return ToolResult(tool_name=self.name, success=result["delivery"]["success"], data=result)


class SendWhatsAppMessageTool(BaseTool):
    name = "sendWhatsAppMessage"
    description = "Send a WhatsApp message using the outbound notification service."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        lead_id = str(payload.get("lead_id") or "").strip()
        to_number = str(payload.get("to_number") or payload.get("phone") or "").strip()
        message = str(payload.get("message") or "").strip()
        if not lead_id or not to_number or not message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id, to_number and message are required")
        result = await notification_service.send_whatsapp_message(
            company_id=str(context.company_id or ""),
            lead_id=lead_id,
            to_number=to_number,
            message=message,
            actor_id=str(getattr(context.current_user, "id", "")),
            related_user_id=str(payload.get("user_id") or payload.get("target_user_id") or "") or None,
            lead_name=payload.get("lead_name"),
            idempotency_key=str(payload.get("idempotency_key") or "") or None,
        )
        return ToolResult(tool_name=self.name, success=result["delivery"]["success"], data=result)


class UpdateCRMActivityTool(BaseTool):
    name = "updateCRMActivity"
    description = "Create or update a CRM activity record."
    required_roles = {UserRole.ADMIN.value, UserRole.MANAGER.value, UserRole.LEAD.value, UserRole.SUPER_ADMIN.value}

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        entity_type = str(payload.get("entity_type") or "lead").strip()
        entity_id = str(payload.get("entity_id") or payload.get("lead_id") or "").strip()
        activity_type = str(payload.get("activity_type") or CRMActivityType.EMAIL.value).strip()
        title = str(payload.get("title") or "Sales activity").strip()
        if not entity_id or not activity_type or not title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="entity_id, activity_type and title are required")
        activity = await notification_service.update_crm_activity(
            company_id=str(context.company_id or ""),
            entity_type=entity_type,
            entity_id=entity_id,
            activity_type=activity_type,
            title=title,
            description=payload.get("description"),
            owner_id=str(payload.get("owner_id") or getattr(context.current_user, "id", "")) or None,
            owner_name=payload.get("owner_name") or _display_name(context.current_user, str(getattr(context.current_user, "id", ""))),
            status=str(payload.get("status") or CRMActivityStatus.COMPLETED.value),
            priority=str(payload.get("priority") or CRMActivityPriority.MEDIUM.value),
            due_date=payload.get("due_date"),
            scheduled_at=payload.get("scheduled_at"),
            created_by=str(getattr(context.current_user, "id", "")),
            created_by_name=_display_name(context.current_user, str(getattr(context.current_user, "id", ""))),
            metadata=payload.get("metadata") or {},
            idempotency_key=str(payload.get("idempotency_key") or "") or None,
        )
        return ToolResult(tool_name=self.name, success=True, data={"activity_id": str(activity.id), "activity": activity.model_dump() if hasattr(activity, "model_dump") else {}})


class RecordTimelineEventTool(BaseTool):
    name = "recordTimelineEvent"
    description = "Publish a CRM timeline/domain event."
    required_roles = set()

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        event_name = str(payload.get("event_name") or "").strip()
        aggregate_type = str(payload.get("aggregate_type") or "sales_prospect").strip()
        aggregate_id = str(payload.get("aggregate_id") or payload.get("lead_id") or "").strip()
        company_id = str(payload.get("company_id") or context.company_id or "").strip()
        actor_id = str(payload.get("actor_id") or getattr(context.current_user, "id", "")).strip()
        if not event_name or not aggregate_id or not company_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="event_name, aggregate_id and company_id are required")
        event = await notification_service.record_timeline_event(
            event_name=event_name,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            company_id=company_id,
            actor_id=actor_id,
            payload=payload.get("payload") or {},
            project_id=payload.get("project_id"),
            metadata=payload.get("metadata") or {},
            correlation_id=str(payload.get("correlation_id") or "") or None,
            causation_id=str(payload.get("causation_id") or "") or None,
        )
        return ToolResult(tool_name=self.name, success=True, data=event.model_dump() if hasattr(event, "model_dump") else {"event_name": event_name})


class RecordAuditEventTool(BaseTool):
    name = "recordAuditEvent"
    description = "Record an audit log entry."
    required_roles = set()

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        feature = str(payload.get("feature") or "sales_agent").strip()
        status_value = str(payload.get("status") or "success").strip()
        parsed_response = payload.get("parsed_response") or {}
        log = await notification_service.record_audit_event(
            company_id=str(context.company_id or ""),
            user_id=str(getattr(context.current_user, "id", "")),
            feature=feature,
            status=status_value,
            payload=payload.get("payload") or {},
            parsed_response=parsed_response,
            error_message=payload.get("error_message"),
            target_user_id=str(payload.get("target_user_id") or "") or None,
            executed_actions=payload.get("executed_actions") or [],
            correlation_id=str(payload.get("correlation_id") or "") or None,
            idempotency_key=str(payload.get("idempotency_key") or "") or None,
        )
        return ToolResult(tool_name=self.name, success=True, data=log.model_dump() if hasattr(log, "model_dump") else {"feature": feature})


class NotifySalespersonTool(BaseTool):
    name = "notifySalesperson"
    description = "Create a sales notification record for a salesperson."
    required_roles = set()

    async def execute(self, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        user_id = str(payload.get("user_id") or payload.get("target_user_id") or "").strip()
        title = str(payload.get("title") or "Sales update").strip()
        message = str(payload.get("message") or "").strip()
        related_id = str(payload.get("related_id") or "").strip() or None
        related_type = str(payload.get("related_type") or "lead").strip() or None
        if not user_id or not message:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id and message are required")
        notification = await notification_service.notify_salesperson(
            company_id=str(context.company_id or ""),
            user_id=user_id,
            title=title,
            message=message,
            related_id=related_id,
            related_type=related_type,
            metadata=payload.get("metadata") or {},
            idempotency_key=str(payload.get("idempotency_key") or "") or None,
        )
        return ToolResult(tool_name=self.name, success=True, data={"notification_id": str(notification.id), "notification": notification.model_dump() if hasattr(notification, "model_dump") else {}})


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.name] = tool

    def get(self, tool_name: str) -> BaseTool:
        if tool_name not in self._tools:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tool '{tool_name}' is not registered")
        return self._tools[tool_name]

    def available_tools(self) -> list[str]:
        return sorted(self._tools.keys())

    async def execute(self, tool_name: str, payload: dict[str, Any], context: ToolContext) -> ToolResult:
        return await self.get(tool_name).run(payload, context)


def build_default_tool_registry() -> ToolRegistry:
    registry = ToolRegistry()
    for tool in [
        GetCRMContextTool(),
        SearchCRMTool(),
        GetLeadIntelligenceTool(),
        QualifyLeadTool(),
        AssignLeadTool(),
        AssignBestSalespersonTool(),
        PreviewImportTool(),
        ImportLeadsTool(),
        MovePipelineTool(),
        ScheduleMeetingTool(),
        CreateFollowUpTool(),
        CompleteFollowUpTool(),
        GenerateProposalTool(),
        SendSalesEmailTool(),
        SendWhatsAppMessageTool(),
        UpdateCRMActivityTool(),
        RecordTimelineEventTool(),
        RecordAuditEventTool(),
        NotifySalespersonTool(),
        NotifySalesTool(),
        NotifyUserTool(),
    ]:
        registry.register(tool)
    return registry


def register_default_tools(executor) -> ToolRegistry:
    return build_default_tool_registry()
