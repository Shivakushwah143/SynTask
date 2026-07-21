from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.agents.email_draft import EMAIL_DRAFT_AGENT_ID, EMAIL_DRAFT_AGENT_VERSION, EmailDraftAgentRequest
from app.agents.orchestrator import AgentOrchestrator
from app.agents.project_agent import PROJECT_AGENT_ID, PROJECT_AGENT_VERSION, ProjectAgentRequest
from app.agents.registry import AgentRegistry
from app.agents.schemas import AgentRunCreateRequest, AgentRunResponse
from app.api.dependencies import get_current_user, get_project_by_id
from app.core.config import settings
from app.models.client import Client
from app.models.company import Company
from app.models.meeting import Meeting
from app.models.sales_contact import SalesContact
from app.models.sales_prospect import SalesProspect
from app.models.task import Task
from app.models.user import User
from app.rag.permissions import resolve_rag_scope

router = APIRouter()
orchestrator = AgentOrchestrator()
registry = AgentRegistry()


def _require_agent_platform_enabled() -> None:
    if not settings.AGENT_PLATFORM_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Agent Platform is disabled")


def _require_project_agent_enabled() -> None:
    _require_agent_platform_enabled()
    if not settings.PROJECT_AGENT_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Project Agent is disabled")


def _require_email_draft_agent_enabled() -> None:
    _require_agent_platform_enabled()
    if not settings.EMAIL_DRAFT_AGENT_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email Draft Agent is disabled")


@router.get("/definitions")
async def list_agent_definitions(skip: int = 0, limit: int = 50, current_user: User = Depends(get_current_user)):
    _require_agent_platform_enabled()
    return {"definitions": await registry.list_definitions(skip=skip, limit=min(limit, 100))}


@router.get("/definitions/{agent_id}/versions")
async def list_agent_definition_versions(agent_id: str, current_user: User = Depends(get_current_user)):
    _require_agent_platform_enabled()
    return {"versions": await registry.versions(agent_id=agent_id)}


@router.post("/runs", response_model=AgentRunResponse)
async def create_agent_run(payload: AgentRunCreateRequest, current_user: User = Depends(get_current_user)):
    _require_agent_platform_enabled()
    return await orchestrator.create_run(current_user=current_user, payload=payload)


@router.post("/project/runs", response_model=AgentRunResponse)
async def create_project_agent_run(payload: ProjectAgentRequest, current_user: User = Depends(get_current_user)):
    _require_project_agent_enabled()
    scope = await resolve_rag_scope(current_user=current_user, project_id=payload.project_id)
    project_id = scope.project_id or payload.project_id
    await _validate_project_agent_record_scope(current_user=current_user, project_id=project_id, payload=payload)
    return await orchestrator.create_run(
        current_user=current_user,
        payload=AgentRunCreateRequest(
            agent_id=PROJECT_AGENT_ID,
            agent_version=PROJECT_AGENT_VERSION,
            trigger_type="manual",
            idempotency_key=payload.idempotency_key,
            project_id=project_id,
            department_id=scope.department_id,
            session_id=payload.session_id or f"project-agent:{project_id}",
            conversation_id=payload.conversation_id or payload.idempotency_key,
            query=payload.user_request,
            input_payload=payload.model_dump(mode="json"),
        ),
    )


@router.post("/email-draft/runs", response_model=AgentRunResponse)
async def create_email_draft_agent_run(payload: EmailDraftAgentRequest, current_user: User = Depends(get_current_user)):
    _require_email_draft_agent_enabled()
    if not getattr(current_user, "company_id", None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant scope required")
    await _validate_email_draft_context(current_user=current_user, payload=payload)
    context = payload.related_context
    project_id = context.project_id
    if project_id:
        scope = await resolve_rag_scope(current_user=current_user, project_id=project_id)
        project_id = scope.project_id or project_id
    return await orchestrator.create_run(
        current_user=current_user,
        payload=AgentRunCreateRequest(
            agent_id=EMAIL_DRAFT_AGENT_ID,
            agent_version=EMAIL_DRAFT_AGENT_VERSION,
            trigger_type="manual",
            idempotency_key=payload.idempotency_key,
            project_id=project_id,
            task_id=context.task_id,
            department_id=getattr(current_user, "department_id", None),
            session_id=payload.session_id or "email-draft-agent",
            conversation_id=payload.conversation_id or payload.idempotency_key,
            query=payload.purpose,
            input_payload=payload.model_dump(mode="json"),
        ),
    )


@router.get("/runs/{run_id}", response_model=AgentRunResponse)
async def get_agent_run(run_id: str, current_user: User = Depends(get_current_user)):
    _require_agent_platform_enabled()
    run = await orchestrator.get_run(current_user=current_user, run_id=run_id)
    return orchestrator._response(run)


@router.post("/runs/{run_id}/cancel", response_model=AgentRunResponse)
async def cancel_agent_run(run_id: str, current_user: User = Depends(get_current_user)):
    _require_agent_platform_enabled()
    run = await orchestrator.cancel_run(current_user=current_user, run_id=run_id)
    return orchestrator._response(run)


@router.get("/runs/{run_id}/events")
async def list_agent_run_events(run_id: str, current_user: User = Depends(get_current_user)):
    _require_agent_platform_enabled()
    return {"events": await orchestrator.events(current_user=current_user, run_id=run_id)}


@router.get("/runs/{run_id}/proposals")
async def list_agent_run_proposals(run_id: str, current_user: User = Depends(get_current_user)):
    _require_agent_platform_enabled()
    return {"proposals": await orchestrator.proposals(current_user=current_user, run_id=run_id)}


async def _validate_project_agent_record_scope(*, current_user: User, project_id: str, payload: ProjectAgentRequest) -> None:
    project, canonical_project_id = await get_project_by_id(project_id, getattr(current_user, "company_id", None))
    if not project:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project scope denied")
    project_id = canonical_project_id or project_id

    milestone_ids = set(payload.selected_record_ids.milestone_ids)
    if milestone_ids:
        available_milestone_ids = {str(item.get("id") or item.get("milestone_id")) for item in (project.milestones or [])}
        if not milestone_ids.issubset(available_milestone_ids):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected record scope denied")

    for task_id in payload.selected_record_ids.task_ids:
        task = await Task.get(task_id)
        if not task:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected record scope denied")
        if task.company_id != current_user.company_id or task.project_id != project_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected record scope denied")


async def _validate_email_draft_context(*, current_user: User, payload: EmailDraftAgentRequest) -> None:
    company_id = getattr(current_user, "company_id", None)
    if not company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant scope required")

    context = payload.related_context
    if context.project_id:
        project, canonical_project_id = await get_project_by_id(context.project_id, company_id)
        if not project:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected context denied")
        context.project_id = canonical_project_id or context.project_id
    if context.task_id:
        task = await Task.get(context.task_id)
        if not task or task.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected context denied")
        if context.project_id and task.project_id != context.project_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected context denied")
    if context.client_id:
        client = await Client.get(context.client_id)
        if not client or client.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected context denied")
    if context.lead_id:
        lead = await SalesProspect.get(context.lead_id)
        if not lead or lead.company_id != company_id or lead.deleted:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected context denied")
    if context.meeting_id:
        meeting = await Meeting.get(context.meeting_id)
        if not meeting or meeting.company_id != company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected context denied")
    if context.company_record_id:
        company = await Company.get(context.company_record_id)
        if not company or str(company.id) != company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Selected context denied")

    recipient = payload.recipient
    if recipient.record_type and recipient.record_id:
        if recipient.record_type == "client":
            record = await Client.get(recipient.record_id)
            if not record or record.company_id != company_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recipient context denied")
        elif recipient.record_type == "lead":
            record = await SalesProspect.get(recipient.record_id)
            if not record or record.company_id != company_id or record.deleted:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recipient context denied")
        elif recipient.record_type == "user":
            record = await User.get(recipient.record_id)
            if not record or record.company_id != company_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recipient context denied")
        elif recipient.record_type == "contact":
            record = await SalesContact.get(recipient.record_id)
            if not record or record.company_id != company_id or record.deleted:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recipient context denied")
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recipient context denied")
