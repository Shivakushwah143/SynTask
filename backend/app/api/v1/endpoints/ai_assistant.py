from __future__ import annotations

from datetime import datetime

from app.core.clock import utc_now
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.agents.orchestrator import AgentOrchestrator
from app.agents.capability_packs import EXECUTIVE_AGENT_ID, HR_AGENT_ID, role_capability_pack
from app.agents.executive.service import ExecutiveAgentService
from app.agents.hr.service import HRAgentService
from app.agents.routing import DeterministicAgentRouter
from app.agents.schemas import AgentRunCreateRequest
from app.api.dependencies import get_current_user, get_project_by_id
from app.core.config import settings
from app.models.ai_conversation import AIConversation, AIConversationMessage
from app.models.ai_memory import UserMemory
from app.models.task import Task
from app.models.user import User
from app.rag.permissions import RAGScope
from app.rag.working_memory import ClientWorkingMemoryUpdate, WorkingMemoryService, WorkingMemoryUnavailable


router = APIRouter()
orchestrator = AgentOrchestrator()
working_memory_service = WorkingMemoryService()
agent_router = DeterministicAgentRouter()
executive_agent_service = ExecutiveAgentService()
hr_agent_service = HRAgentService()


class UnifiedWorkspaceContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page: str | None = Field(default=None, max_length=120)
    project_id: str | None = None
    task_id: str | None = None
    client_id: str | None = None
    lead_id: str | None = None
    selected_record_type: str | None = Field(default=None, max_length=80)
    selected_record_id: str | None = None
    filters: dict[str, Any] = Field(default_factory=dict)


class UnifiedPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    response_detail: str | None = Field(default=None, max_length=40)
    language: str | None = Field(default=None, max_length=40)


class UnifiedAssistantChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=6000)
    conversation_id: str | None = None
    session_id: str | None = None
    idempotency_key: str = Field(min_length=8, max_length=128)
    workspace: UnifiedWorkspaceContext = Field(default_factory=UnifiedWorkspaceContext)
    preferences: UnifiedPreferences = Field(default_factory=UnifiedPreferences)


class UnifiedAssistantChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: str
    session_id: str
    message_id: str
    run_id: str | None
    state: str
    agent: dict[str, Any]
    answer: dict[str, Any]
    citations: list[dict[str, Any]] = Field(default_factory=list)
    proposed_actions: list[dict[str, Any]] = Field(default_factory=list)
    memory: dict[str, Any]
    usage: dict[str, Any]


class PersonalMemoryPreferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    memory_id: str | None = None
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=1000)
    preference_key: str = Field(min_length=1, max_length=80)


class PersonalMemorySettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


PROHIBITED_MEMORY_TERMS = (
    "password",
    "api key",
    "secret",
    "token",
    "salary",
    "payroll",
    "disciplinary",
    "fire",
    "promotion",
    "loyalty",
    "personality",
    "mental health",
    "protected characteristic",
)


def _require_unified_ai_enabled() -> None:
    if not settings.AGENT_PLATFORM_ENABLED:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unified AI workspace is disabled")


@router.post("/chat", response_model=UnifiedAssistantChatResponse)
async def unified_assistant_chat(payload: UnifiedAssistantChatRequest, current_user: User = Depends(get_current_user)):
    _require_unified_ai_enabled()
    if not getattr(current_user, "company_id", None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant scope required")

    scope = RAGScope(
        company_id=current_user.company_id,
        tenant_id=current_user.company_id,
        user_id=str(current_user.id),
        role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        department_id=getattr(current_user, "department_id", None),
        current_user=current_user,
    )
    conversation = await _get_or_create_conversation(current_user=current_user, conversation_id=payload.conversation_id)
    workspace = await _validate_workspace(current_user=current_user, workspace=payload.workspace)
    session = await _get_or_create_session(scope=scope, conversation_id=conversation.conversation_id, session_id=payload.session_id)
    await working_memory_service.update_client_state(
        scope=scope,
        session_id=session.session_id,
        update=ClientWorkingMemoryUpdate(
            conversation_id=conversation.conversation_id,
            message={"role": "user", "content": payload.message},
            current_page=workspace.get("page"),
            selected_record=workspace.get("selected_record"),
            current_filters=workspace.get("filters") or {},
            reference_bindings=workspace.get("reference_bindings") or {},
        ),
    )
    message = AIConversationMessage(role="user", content=payload.message)
    conversation.messages.append(message)
    conversation.updated_at = utc_now()
    await conversation.save()

    capability_pack = role_capability_pack(
        current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        modules=list(getattr(current_user, "modules", []) or []),
    )
    # Build conversation history for LLM intent context
    conversation_history = []
    for msg in (conversation.messages or [])[-8:]:
        if hasattr(msg, "role") and hasattr(msg, "content"):
            conversation_history.append({"role": msg.role, "content": msg.content})
    # Use hybrid routing: deterministic first, then LLM intent interpreter for ambiguous queries
    route = await agent_router.route_with_llm_intent(
        message=payload.message,
        workspace=workspace,
        capability_pack=capability_pack,
        conversation_history=conversation_history,
    )
    memory_state = await _personal_memory_state(current_user=current_user)
    merged_preferences = {
        **{item["preference_key"]: item["content"] for item in memory_state["memories"] if item.get("preference_key")},
        **payload.preferences.model_dump(mode="json"),
    }
    agent_payload = AgentRunCreateRequest(
        agent_id=route.agent_id,
        agent_version=route.agent_version,
        trigger_type="manual",
        idempotency_key=payload.idempotency_key,
        project_id=workspace.get("project_id"),
        task_id=workspace.get("task_id"),
        department_id=getattr(current_user, "department_id", None),
        session_id=session.session_id,
        conversation_id=conversation.conversation_id,
        query=payload.message,
        input_payload={
            "workspace": workspace,
            "preferences": merged_preferences,
            "personal_memory": memory_state,
            "unified_gateway": True,
            "personal_context": {
                "route": route.model_context(),
                "capability_pack": capability_pack.model_context(),
            },
        },
    )
    if route.agent_id in {EXECUTIVE_AGENT_ID, HR_AGENT_ID}:
        definition = await orchestrator.registry.get_definition(
            agent_id=agent_payload.agent_id,
            version=agent_payload.agent_version,
        )
        orchestrator._authorize_definition(current_user=current_user, definition=definition, payload=agent_payload)
        entity_context = {
            "workspace": workspace,
            "routing": route.model_context(),
        }
        service = executive_agent_service if route.agent_id == EXECUTIVE_AGENT_ID else hr_agent_service
        specialized = await service.chat(
            current_user=current_user,
            message=payload.message,
            conversation_id=conversation.conversation_id,
            session_id=session.session_id,
            entity_context=entity_context,
            conversation_history=conversation_history,
        )
        answer_text = specialized.get("answer") or ""
        return UnifiedAssistantChatResponse(
            conversation_id=conversation.conversation_id,
            session_id=session.session_id,
            message_id=message.id,
            run_id=None,
            state="COMPLETED" if specialized.get("success") else "FAILED",
            agent={"agent_id": route.agent_id, "version": route.agent_version, "routing_reason": route.routing_reason},
            answer={
                "summary": answer_text,
                "sections": [],
                "facts": [],
                "missing_data": [],
                "warnings": [specialized["error_detail"]] if specialized.get("error_detail") else [],
                "confidence": route.confidence,
            },
            citations=[],
            proposed_actions=[],
            memory={"saved": False, "candidate_ids": []},
            usage={
                **(specialized.get("usage") or {}),
                "tool_calls_summary": specialized.get("tool_calls_summary") or [],
            },
        )
    run = await orchestrator.create_run(current_user=current_user, payload=agent_payload)
    result = run.sanitized_result or {}
    answer = {
        "summary": result.get("summary") or result.get("project_summary") or "",
        "sections": result.get("sections") or [],
        "facts": result.get("facts") or [],
        "missing_data": result.get("missing_data") or [],
        "warnings": result.get("warnings") or [],
        "confidence": result.get("confidence") or 0.0,
    }
    return UnifiedAssistantChatResponse(
        conversation_id=conversation.conversation_id,
        session_id=session.session_id,
        message_id=message.id,
        run_id=run.run_id,
        state=run.state,
        agent={"agent_id": run.agent_id, "version": run.agent_version, "routing_reason": route.routing_reason},
        answer=answer,
        citations=result.get("citations") or result.get("evidence") or [],
        proposed_actions=result.get("proposed_actions") or [],
        memory={"saved": False, "candidate_ids": []},
        usage={"provider": run.provider, "model": run.model, "token_usage": run.token_usage, "estimated_cost": run.estimated_cost},
    )


@router.get("/memory")
async def list_personal_memory(current_user: User = Depends(get_current_user)):
    _require_unified_ai_enabled()
    return await _personal_memory_state(current_user=current_user)


@router.put("/memory/preferences")
async def upsert_personal_memory_preference(payload: PersonalMemoryPreferenceRequest, current_user: User = Depends(get_current_user)):
    _require_unified_ai_enabled()
    if _contains_prohibited_memory(payload.title, payload.content, payload.preference_key):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Personal AI memory cannot store secrets, protected HR, payroll, profiling, or employment-decision content")
    company_id = _company_id(current_user)
    if payload.memory_id:
        memory = await UserMemory.get(payload.memory_id)
        if not memory or memory.company_id != company_id or memory.user_id != str(current_user.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Personal AI memory not found")
    else:
        memory = await UserMemory.find_one(
            {
                "company_id": company_id,
                "user_id": str(current_user.id),
                "memory_type": "user_preference",
                "metadata.preference_key": payload.preference_key,
            }
        )
    now = utc_now()
    if memory:
        memory.title = payload.title
        memory.content = payload.content
        memory.updated_by = str(current_user.id)
        memory.updated_at = now
        memory.last_seen_at = now
        memory.metadata = {**(memory.metadata or {}), "preference_key": payload.preference_key, "source_type": "user_provided", "external_model_allowed": True}
        await memory.save()
    else:
        memory = UserMemory(
            company_id=company_id,
            user_id=str(current_user.id),
            title=payload.title,
            content=payload.content,
            memory_type="user_preference",
            source="user_controlled_ai_settings",
            importance=3,
            tags=["ai_assistant", "preference"],
            metadata={"preference_key": payload.preference_key, "source_type": "user_provided", "external_model_allowed": True},
            created_by=str(current_user.id),
            updated_by=str(current_user.id),
        )
        await memory.insert()
    return {"memory": _memory_view(memory)}


@router.put("/memory/settings")
async def update_personal_memory_settings(payload: PersonalMemorySettingsRequest, current_user: User = Depends(get_current_user)):
    _require_unified_ai_enabled()
    setting = await _memory_setting(current_user=current_user)
    company_id = _company_id(current_user)
    now = utc_now()
    content = "enabled" if payload.enabled else "disabled"
    if setting:
        setting.content = content
        setting.updated_at = now
        setting.updated_by = str(current_user.id)
        setting.metadata = {**(setting.metadata or {}), "enabled": payload.enabled, "external_model_allowed": False}
        await setting.save()
    else:
        setting = UserMemory(
            company_id=company_id,
            user_id=str(current_user.id),
            title="Personal AI memory setting",
            content=content,
            memory_type="ai_memory_setting",
            source="user_controlled_ai_settings",
            importance=1,
            tags=["ai_assistant", "settings"],
            metadata={"enabled": payload.enabled, "external_model_allowed": False},
            created_by=str(current_user.id),
            updated_by=str(current_user.id),
        )
        await setting.insert()
    return {"enabled": payload.enabled}


@router.delete("/memory/{memory_id}")
async def delete_personal_memory(memory_id: str, current_user: User = Depends(get_current_user)):
    _require_unified_ai_enabled()
    memory = await UserMemory.get(memory_id)
    if not memory or memory.company_id != _company_id(current_user) or memory.user_id != str(current_user.id) or memory.memory_type == "ai_memory_setting":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Personal AI memory not found")
    await memory.delete()
    return {"deleted": True}


@router.delete("/memory")
async def clear_personal_memory(current_user: User = Depends(get_current_user)):
    _require_unified_ai_enabled()
    memories = await UserMemory.find({"company_id": _company_id(current_user), "user_id": str(current_user.id), "memory_type": {"$ne": "ai_memory_setting"}}).to_list()
    for memory in memories:
        await memory.delete()
    return {"deleted_count": len(memories)}


async def _get_or_create_conversation(*, current_user: User, conversation_id: str | None) -> AIConversation:
    if conversation_id:
        conversation = await AIConversation.find_one({"conversation_id": conversation_id})
        if not conversation or conversation.company_id != current_user.company_id or conversation.user_id != str(current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Conversation ownership denied")
        return conversation
    conversation = AIConversation(
        conversation_id=str(uuid4()),
        user_id=str(current_user.id),
        company_id=current_user.company_id,
        role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
    )
    await conversation.insert()
    return conversation


async def _get_or_create_session(*, scope: RAGScope, conversation_id: str, session_id: str | None):
    if session_id:
        try:
            existing = await working_memory_service.get_session(scope=scope, session_id=session_id, conversation_id=conversation_id)
        except WorkingMemoryUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Working Memory unavailable") from exc
        if existing:
            return existing
    try:
        return await working_memory_service.create_session(scope=scope, conversation_id=conversation_id)
    except WorkingMemoryUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Working Memory unavailable") from exc


async def _validate_workspace(*, current_user: User, workspace: UnifiedWorkspaceContext) -> dict[str, Any]:
    data = workspace.model_dump(mode="json")
    bindings: dict[str, Any] = {}
    selected_record = None
    if workspace.project_id:
        project, canonical_project_id = await get_project_by_id(workspace.project_id, current_user.company_id)
        if not project:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project scope denied")
        data["project_id"] = canonical_project_id or workspace.project_id
        bindings["project_id"] = data["project_id"]
    if workspace.task_id:
        task = await Task.get(workspace.task_id)
        if not task or task.company_id != current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task scope denied")
        if data.get("project_id") and task.project_id != data["project_id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task scope denied")
        bindings["task_id"] = workspace.task_id
    if workspace.selected_record_type and workspace.selected_record_id:
        selected_record = {"type": workspace.selected_record_type, "id": workspace.selected_record_id}
    data["selected_record"] = selected_record
    data["reference_bindings"] = bindings
    data.pop("selected_record_type", None)
    data.pop("selected_record_id", None)
    return data


def _company_id(current_user: User) -> str:
    company_id = getattr(current_user, "company_id", None)
    if not company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant scope required")
    return str(company_id)


async def _personal_memory_state(*, current_user: User) -> dict[str, Any]:
    company_id = _company_id(current_user)
    setting = await _memory_setting(current_user=current_user)
    enabled = True if not setting else bool((setting.metadata or {}).get("enabled", setting.content != "disabled"))
    memories = []
    if enabled:
        records = await UserMemory.find({"company_id": company_id, "user_id": str(current_user.id), "memory_type": "user_preference"}).sort("-updated_at").to_list()
        memories = [_memory_view(item) for item in records if (item.metadata or {}).get("external_model_allowed") is not False]
    return {
        "enabled": enabled,
        "memories": memories,
        "policy": {
            "conversation_memory": "short-lived server-owned Working Memory",
            "saved_personal_memory": "user-controlled professional preferences only",
            "prohibited": list(PROHIBITED_MEMORY_TERMS),
        },
    }


async def _memory_setting(*, current_user: User):
    return await UserMemory.find_one({"company_id": _company_id(current_user), "user_id": str(current_user.id), "memory_type": "ai_memory_setting"})


def _memory_view(memory: UserMemory) -> dict[str, Any]:
    metadata = memory.metadata or {}
    return {
        "memory_id": str(memory.id),
        "title": memory.title,
        "content": memory.content,
        "memory_type": memory.memory_type,
        "source": memory.source,
        "source_type": metadata.get("source_type") or "user_provided",
        "preference_key": metadata.get("preference_key"),
        "created_at": memory.created_at.isoformat(),
        "updated_at": memory.updated_at.isoformat(),
    }


def _contains_prohibited_memory(*values: str) -> bool:
    text = " ".join(values).lower()
    return any(term in text for term in PROHIBITED_MEMORY_TERMS)
