from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status

from app.ai.tools import ToolContext, ToolRegistry
from app.models.user import User
from app.schemas.ai import (
    AILeadIntelligenceResponse,
    AISalesAgentCRM,
    AISalesAgentCommunication,
    AISalesAgentFollowUp,
    AISalesAgentMeeting,
    AISalesAgentRequest,
    AISalesAgentResponse,
)


def _safe_str(value: Any) -> str:
    return str(value or "").strip()


def _render_email(lead_context: dict[str, Any], intelligence: AILeadIntelligenceResponse) -> AISalesAgentCommunication:
    lead = lead_context.get("lead") or {}
    company = lead_context.get("company") or {}
    contact = lead_context.get("contact") or {}
    email_address = _safe_str(lead.get("email") or contact.get("email"))
    if not email_address:
        return AISalesAgentCommunication(subject=None, html=None, text=None)

    first_name = _safe_str(contact.get("first_name") or lead.get("first_name") or lead.get("prospect_name") or "there")
    company_name = _safe_str(company.get("name") or lead.get("company_name") or "your team")
    subject = f"Quick next step for {company_name}"
    meeting_hint = "book a 30-minute discovery call" if intelligence.priority == "high" else "connect briefly"
    text = (
        f"Hi {first_name},\n\n"
        f"I reviewed your CRM context for {company_name}. "
        f"The best next step is to {meeting_hint} and keep the conversation focused on the current priority: "
        f"{intelligence.recommended_next_action.lower()}.\n\n"
        f"Suggested stage: {intelligence.recommended_pipeline_stage}.\n"
        f"If this looks right, I can help prepare the next outreach step.\n\n"
        f"Best,\nSynTask Sales"
    )
    html = (
        f"<p>Hi {first_name},</p>"
        f"<p>I reviewed your CRM context for <strong>{company_name}</strong>. "
        f"The best next step is to {meeting_hint} and keep the conversation focused on the current priority: "
        f"{intelligence.recommended_next_action.lower()}.</p>"
        f"<p>Suggested stage: <strong>{intelligence.recommended_pipeline_stage}</strong>.</p>"
        f"<p>If this looks right, I can help prepare the next outreach step.</p>"
        f"<p>Best,<br/>SynTask Sales</p>"
    )
    return AISalesAgentCommunication(subject=subject, html=html, text=text)


def _render_whatsapp(lead_context: dict[str, Any], intelligence: AILeadIntelligenceResponse) -> dict[str, Any]:
    lead = lead_context.get("lead") or {}
    contact = lead_context.get("contact") or {}
    phone_number = _safe_str(lead.get("phone") or contact.get("phone"))
    if not phone_number:
        return {"message": None}
    first_name = _safe_str(contact.get("first_name") or lead.get("prospect_name") or "there")
    company_name = _safe_str((lead_context.get("company") or {}).get("name") or lead.get("company_name") or "")
    message = (
        f"Hi {first_name}, just checking in on {company_name or 'your project'}. "
        f"Next step: {intelligence.recommended_next_action.lower()}."
    )
    return {"message": message}


def _meeting_recommended(intelligence: AILeadIntelligenceResponse) -> AISalesAgentMeeting:
    urgent = intelligence.priority == "high" or intelligence.urgency in {"immediate", "high"}
    return AISalesAgentMeeting(
        recommended=urgent,
        duration_minutes=30 if urgent else 20,
        reason="High priority opportunity requires a live conversation." if urgent else "A lighter touch is sufficient for this lead.",
    )


def _follow_up(lead_context: dict[str, Any], intelligence: AILeadIntelligenceResponse) -> AISalesAgentFollowUp:
    lead = lead_context.get("lead") or {}
    current_stage = _safe_str((lead_context.get("assignment_information") or {}).get("current_stage"))
    recommended_date = (datetime.now(timezone.utc) + timedelta(days=2 if intelligence.priority == "high" else 4)).date().isoformat()
    summary = (
        f"Follow up on {lead.get('prospect_name') or lead.get('id')} after {intelligence.recommended_pipeline_stage.lower()} "
        f"with a focus on {intelligence.recommended_next_action.lower()}."
    )
    if current_stage:
        summary += f" Current stage: {current_stage}."
    return AISalesAgentFollowUp(recommended_date=recommended_date, summary=summary)


def _crm_summary(intelligence: AILeadIntelligenceResponse) -> AISalesAgentCRM:
    return AISalesAgentCRM(
        next_stage=intelligence.recommended_pipeline_stage,
        activity_summary="Primary channel should be email. Secondary channel should only reinforce the next step.",
    )


async def _execute_tool(tool_registry: ToolRegistry, tool_name: str, payload: dict[str, Any], current_user: User) -> dict[str, Any]:
    result = await tool_registry.execute(
        tool_name,
        payload,
        ToolContext(current_user=current_user, tool_name=tool_name),
    )
    return result.data if result.success else {"error": result.error, "success": False}


@dataclass(slots=True)
class SalesAgent:
    tool_registry: ToolRegistry

    async def analyze(self, current_user: User, request: AISalesAgentRequest) -> AISalesAgentResponse:
        lead_id = _safe_str(request.lead_id)
        if not lead_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lead_id is required")

        tool_context = ToolContext(
            current_user=current_user,
            tool_name="salesAgent",
            metadata={"depth": request.depth, "persist": request.persist},
        )

        context_result = await self.tool_registry.execute("getCRMContext", {"lead_id": lead_id, "depth": request.depth}, tool_context)
        if not context_result.success:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=context_result.error or "Unable to load CRM context")

        intelligence_result = await self.tool_registry.execute("getLeadIntelligence", {"lead_id": lead_id, "depth": request.depth}, tool_context)
        if not intelligence_result.success:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=intelligence_result.error or "Unable to load lead intelligence")

        lead_context = context_result.data
        intelligence = AILeadIntelligenceResponse.model_validate(intelligence_result.data)
        lead = lead_context.get("lead") or {}
        company = lead_context.get("company") or {}
        buying_intent = intelligence.buying_intent

        if intelligence.duplicate_risk:
            strategy = {"primary": "stop", "secondary": "notify_sales", "meeting_recommended": False}
            email = AISalesAgentCommunication(
                subject="Duplicate lead review required",
                html="<p>This lead appears to be a duplicate. Please review before outreach.</p>",
                text="This lead appears to be a duplicate. Please review before outreach.",
            )
            whatsapp = {"message": "Duplicate lead detected. Stop outreach and review before continuing."}
            meeting = AISalesAgentMeeting(recommended=False, duration_minutes=15, reason="Duplicate leads should not be contacted until merged.")
            follow_up = AISalesAgentFollowUp(recommended_date=None, summary="Do not continue outreach until the duplicate is reviewed.")
            crm = AISalesAgentCRM(
                next_stage=_safe_str((lead_context.get("assignment_information") or {}).get("current_stage")) or "review",
                activity_summary="Duplicate lead detected. Notify sales and stop outbound actions.",
            )
        else:
            has_email = bool(_safe_str(lead.get("email") or (lead_context.get("contact") or {}).get("email")))
            has_phone = bool(_safe_str(lead.get("phone") or (lead_context.get("contact") or {}).get("phone")))

            if not has_email and not has_phone:
                strategy = {"primary": "human_review", "secondary": "none", "meeting_recommended": False}
                email = AISalesAgentCommunication(subject=None, html=None, text=None)
                whatsapp = {"message": None}
                meeting = AISalesAgentMeeting(recommended=False, duration_minutes=15, reason="Missing both email and phone; human review required.")
                follow_up = AISalesAgentFollowUp(recommended_date=None, summary="Human review required because the lead is missing both email and phone.")
                crm = AISalesAgentCRM(
                    next_stage=_safe_str((lead_context.get("assignment_information") or {}).get("current_stage")) or "review",
                    activity_summary="Insufficient contact data; escalate to human review.",
                )
            elif buying_intent == "existing_customer":
                strategy = {"primary": "email", "secondary": "notify_account_manager", "meeting_recommended": False}
                email = _render_email(lead_context, intelligence)
                whatsapp = {"message": None}
                meeting = _meeting_recommended(intelligence)
                follow_up = _follow_up(lead_context, intelligence)
                crm = _crm_summary(intelligence)
            elif intelligence.priority == "high":
                strategy = {"primary": "email", "secondary": "whatsapp", "meeting_recommended": True}
                email = _render_email(lead_context, intelligence)
                whatsapp = _render_whatsapp(lead_context, intelligence)
                meeting = _meeting_recommended(intelligence)
                follow_up = _follow_up(lead_context, intelligence)
                crm = _crm_summary(intelligence)
            elif intelligence.priority == "medium":
                strategy = {"primary": "email", "secondary": "follow_up", "meeting_recommended": False}
                email = _render_email(lead_context, intelligence)
                whatsapp = {"message": None}
                meeting = _meeting_recommended(intelligence)
                follow_up = _follow_up(lead_context, intelligence)
                crm = _crm_summary(intelligence)
            else:
                strategy = {"primary": "email", "secondary": "none", "meeting_recommended": False}
                email = _render_email(lead_context, intelligence)
                whatsapp = {"message": None}
                meeting = _meeting_recommended(intelligence)
                follow_up = _follow_up(lead_context, intelligence)
                crm = _crm_summary(intelligence)

        delivery: dict[str, Any] = {"mode": request.execution_mode, "sent": False, "actions": []}
        if request.execution_mode == "auto" and not intelligence.duplicate_risk:
            lead_name = _safe_str(lead.get("prospect_name"))
            company_name = _safe_str(company.get("name"))
            lead_context_contact = lead_context.get("contact") or {}
            actor_id = str(getattr(current_user, "id", ""))
            company_id = str(getattr(current_user, "company_id", "") or "")

            if email.subject and email.text and _safe_str(lead.get("email") or lead_context_contact.get("email")):
                email_result = await _execute_tool(
                    self.tool_registry,
                    "sendSalesEmail",
                    {
                        "lead_id": lead_id,
                        "lead_name": lead_name,
                        "to_email": lead.get("email") or lead_context_contact.get("email"),
                        "subject": email.subject,
                        "html": email.html,
                        "text": email.text,
                        "user_id": intelligence.recommended_salesperson.get("id"),
                        "template_variables": {
                            "lead_name": lead_name,
                            "company_name": company_name,
                            "recommended_stage": intelligence.recommended_pipeline_stage,
                        },
                    },
                    current_user,
                )
                delivery["actions"].append({"tool": "sendSalesEmail", "result": email_result})

            if strategy.get("secondary") == "whatsapp" and whatsapp.get("message") and _safe_str(lead.get("phone") or lead_context_contact.get("phone")):
                whatsapp_result = await _execute_tool(
                    self.tool_registry,
                    "sendWhatsAppMessage",
                    {
                        "lead_id": lead_id,
                        "lead_name": lead_name,
                        "to_number": lead.get("phone") or lead_context_contact.get("phone"),
                        "message": whatsapp["message"],
                        "user_id": intelligence.recommended_salesperson.get("id"),
                    },
                    current_user,
                )
                delivery["actions"].append({"tool": "sendWhatsAppMessage", "result": whatsapp_result})

            if meeting.recommended:
                meeting_result = await _execute_tool(
                    self.tool_registry,
                    "scheduleMeeting",
                    {
                        "lead_id": lead_id,
                        "title": f"Discovery meeting - {lead_name or company_name or lead_id}",
                        "description": intelligence.recommended_next_action,
                        "meeting_date": (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat(),
                        "meeting_time": "10:00",
                        "duration": meeting.duration_minutes,
                    },
                    current_user,
                )
                delivery["actions"].append({"tool": "scheduleMeeting", "result": meeting_result})

            follow_up_result = await _execute_tool(
                self.tool_registry,
                "createFollowUp",
                {
                    "lead_id": lead_id,
                    "title": f"Follow-up - {lead_name or company_name or lead_id}",
                    "description": follow_up.summary,
                    "priority": intelligence.priority,
                    "due_date": follow_up.recommended_date,
                    "scheduled_at": follow_up.recommended_date,
                },
                current_user,
            )
            delivery["actions"].append({"tool": "createFollowUp", "result": follow_up_result})

            activity_result = await _execute_tool(
                self.tool_registry,
                "updateCRMActivity",
                {
                    "entity_type": "lead",
                    "entity_id": lead_id,
                    "lead_id": lead_id,
                    "activity_type": "email" if email.subject else "follow_up",
                    "title": "Sales agent outreach executed",
                    "description": intelligence.recommended_next_action,
                    "status": "completed",
                    "priority": intelligence.priority,
                    "owner_id": intelligence.recommended_salesperson.get("id"),
                    "owner_name": intelligence.recommended_salesperson.get("name"),
                    "metadata": {
                        "communication_strategy": strategy,
                        "lead_intelligence": intelligence.model_dump(),
                        "channels": {
                            "email": bool(email.subject),
                            "whatsapp": bool(whatsapp.get("message")),
                            "meeting": bool(meeting.recommended),
                        },
                        "delivery": delivery,
                    },
                },
                current_user,
            )
            delivery["actions"].append({"tool": "updateCRMActivity", "result": activity_result})

            timeline_result = await _execute_tool(
                self.tool_registry,
                "recordTimelineEvent",
                {
                    "event_name": "SalesAgentExecuted",
                    "aggregate_type": "sales_prospect",
                    "aggregate_id": lead_id,
                    "company_id": company_id,
                    "actor_id": actor_id,
                    "payload": {
                        "lead_id": lead_id,
                        "communication_strategy": strategy,
                        "lead_score": intelligence.lead_score,
                        "priority": intelligence.priority,
                        "delivery": delivery,
                    },
                    "metadata": {"surface": "crm", "workflow": "sales_agent"},
                },
                current_user,
            )
            delivery["actions"].append({"tool": "recordTimelineEvent", "result": timeline_result})

            audit_result = await _execute_tool(
                self.tool_registry,
                "recordAuditEvent",
                {
                    "feature": "sales_agent",
                    "status": "success",
                    "payload": {
                        "lead_id": lead_id,
                        "execution_mode": request.execution_mode,
                        "communication_strategy": strategy,
                    },
                    "parsed_response": {
                        "communication_strategy": strategy,
                        "execution_mode": request.execution_mode,
                    },
                    "executed_actions": delivery["actions"],
                },
                current_user,
            )
            delivery["actions"].append({"tool": "recordAuditEvent", "result": audit_result})
            delivery["sent"] = True

        return AISalesAgentResponse(
            communication_strategy=strategy,
            email=email,
            whatsapp=whatsapp,
            meeting=meeting,
            follow_up=follow_up,
            crm=crm,
            lead_intelligence=intelligence,
            source="tool_layer",
            provider="deterministic",
            model="sales-agent-v1",
            generated_at=datetime.now(timezone.utc),
            execution_mode=request.execution_mode,
            execution_status="sent" if delivery["sent"] else "generated",
            delivery=delivery,
            context={
                "lead_id": lead_id,
                "lead_name": _safe_str(lead.get("prospect_name")),
                "company_name": _safe_str(company.get("name")),
                "buying_intent": buying_intent,
                "priority": intelligence.priority,
                "urgency": intelligence.urgency,
            },
        )
