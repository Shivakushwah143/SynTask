"""
AI Endpoints
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.ai.agents.lead_intelligence import LeadIntelligenceAgent
from app.ai.agents.sales_agent import SalesAgent
from app.ai.service import AIService
from app.api.dependencies import get_current_user
from app.models.user import User
from app.schemas.ai import (
    AILogListItem,
    AIDailyReportRequest,
    AIDailyReportResponse,
    AIChatRequest,
    AIChatResponse,
    AILeadIntelligenceRequest,
    AILeadIntelligenceResponse,
    AISalesAgentRequest,
    AISalesAgentResponse,
    AITaskBreakdownRequest,
    AITaskBreakdownResponse,
    AITaskPrioritizationRequest,
    AITaskPrioritizationResponse,
    TaskBreakdownRequest,
    TaskBreakdownResponse,
)

router = APIRouter()
ai_service = AIService()
lead_intelligence_agent = LeadIntelligenceAgent(tool_registry=ai_service.tool_registry)
sales_agent = SalesAgent(tool_registry=ai_service.tool_registry)


async def _require_company_context(current_user: User) -> User:
    if not current_user.company_id and current_user.role.value != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a company",
        )
    return current_user


@router.post("/task-prioritization", response_model=AITaskPrioritizationResponse)
async def generate_task_prioritization(
    payload: AITaskPrioritizationRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a daily task prioritization plan for the current employee."""
    current_user = await _require_company_context(current_user)
    try:
        return await ai_service.generate_task_prioritization(current_user, payload)
    except ValueError as error:
        message = str(error)
        if "not found" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from error
        if "not allowed" in message.lower() or "belongs to the same company" in message.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message) from error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from error


@router.post("/task-breakdown", response_model=AITaskBreakdownResponse)
async def generate_task_breakdown(
    payload: AITaskBreakdownRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a structured breakdown for a single task."""
    current_user = await _require_company_context(current_user)
    try:
        return await ai_service.generate_task_breakdown(current_user, payload)
    except ValueError as error:
        message = str(error)
        if "not found" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from error
        if "not allowed" in message.lower() or "belongs to the same company" in message.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message) from error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from error


@router.post("/breakdown", response_model=TaskBreakdownResponse)
async def generate_breakdown(
    payload: TaskBreakdownRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a task breakdown for a free-form task description."""
    current_user = await _require_company_context(current_user)
    try:
        return await ai_service.generate_breakdown(current_user, payload)
    except ValueError as error:
        message = str(error)
        if "not found" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from error
        if "not allowed" in message.lower() or "belongs to the same company" in message.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message) from error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from error


@router.post("/daily-report", response_model=AIDailyReportResponse)
async def generate_daily_report(
    payload: AIDailyReportRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a role-aware daily report for the current user."""
    current_user = await _require_company_context(current_user)
    try:
        return await ai_service.generate_daily_report(current_user, payload)
    except ValueError as error:
        message = str(error)
        if "not found" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from error
        if "not allowed" in message.lower() or "belongs to the same company" in message.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message) from error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from error


@router.post("/chat", response_model=AIChatResponse)
async def generate_chat_response(
    payload: AIChatRequest,
    conversation_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    """Generate a role-aware personal assistant response."""
    current_user = await _require_company_context(current_user)
    try:
        if conversation_id and payload.conversation_id != conversation_id:
            payload = payload.model_copy(update={"conversation_id": conversation_id})
        return await ai_service.generate_chat_response(current_user, payload)
    except ValueError as error:
        message = str(error)
        if "not found" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from error
        if "not allowed" in message.lower() or "belongs to the same company" in message.lower():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message) from error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from error


@router.get("/logs", response_model=list[AILogListItem])
async def list_ai_logs(
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """List recent AI interactions for the current company."""
    current_user = await _require_company_context(current_user)
    return await ai_service.list_logs(current_user, limit=limit)
