from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.agents.orchestrator import AgentOrchestrator
from app.agents.registry import AgentRegistry
from app.agents.schemas import AgentRunCreateRequest, AgentRunResponse
from app.api.dependencies import get_current_user
from app.core.config import settings
from app.models.user import User

router = APIRouter()
orchestrator = AgentOrchestrator()
registry = AgentRegistry()


def _require_agent_platform_enabled() -> None:
    if not settings.AGENT_PLATFORM_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Agent Platform is disabled")


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
