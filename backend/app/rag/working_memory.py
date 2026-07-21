from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol
from uuid import uuid4

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.redis_client import get_redis
from app.rag.permissions import RAGScope


SAFE_ID_RE = re.compile(r"[^a-zA-Z0-9_-]")
FORBIDDEN_PATTERNS = (
    "api_key",
    "secret",
    "password",
    "credential",
    "card number",
    "payment",
    "ssn",
    "salary",
    "protected hr",
)


class Clock(Protocol):
    def now(self) -> datetime:
        ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class WorkingMemoryUnavailable(Exception):
    pass


class WorkingMemoryConflict(Exception):
    pass


class WorkingMemorySnapshot(BaseModel):
    session_id: str
    conversation_id: str
    company_id: str
    tenant_id: str
    user_id: str
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    version: int = 1
    status: str = "available"
    messages: list[dict[str, Any]] = Field(default_factory=list)
    current_project: dict[str, Any] | None = None
    current_lead: dict[str, Any] | None = None
    current_company: dict[str, Any] | None = None
    current_task: dict[str, Any] | None = None
    current_page: str | None = None
    selected_record: dict[str, Any] | None = None
    current_filters: dict[str, Any] = Field(default_factory=dict)
    recent_tool_outputs: list[dict[str, Any]] = Field(default_factory=list)
    current_workflow_step: str | None = None
    resolved_reference_bindings: dict[str, Any] = Field(default_factory=dict)
    clarification_state: dict[str, Any] = Field(default_factory=dict)

    def model_context(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "session_id": self.session_id,
            "conversation_id": self.conversation_id,
            "updated_at": self.updated_at.isoformat(),
            "messages": self.messages,
            "current_project": self.current_project,
            "current_lead": self.current_lead,
            "current_company": self.current_company,
            "current_task": self.current_task,
            "current_page": self.current_page,
            "selected_record": self.selected_record,
            "current_filters": self.current_filters,
            "recent_tool_outputs": self.recent_tool_outputs,
            "current_workflow_step": self.current_workflow_step,
            "clarification_state": self.clarification_state,
        }


class ClientWorkingMemoryUpdate(BaseModel):
    conversation_id: str
    expected_version: int | None = None
    message: dict[str, Any] | None = None
    current_page: str | None = None
    selected_record: dict[str, Any] | None = None
    current_filters: dict[str, Any] | None = None
    reference_bindings: dict[str, Any] | None = None
    clarification_state: dict[str, Any] | None = None


class ServerWorkingMemoryUpdate(BaseModel):
    conversation_id: str
    expected_version: int | None = None
    current_project: dict[str, Any] | None = None
    current_lead: dict[str, Any] | None = None
    current_company: dict[str, Any] | None = None
    current_task: dict[str, Any] | None = None
    tool_output: dict[str, Any] | None = None
    current_workflow_step: str | None = None
    reference_bindings: dict[str, Any] | None = None


def safe_scope_part(value: str) -> str:
    cleaned = SAFE_ID_RE.sub("_", str(value or ""))
    if not cleaned:
        raise ValueError("Scope value is required")
    return cleaned[:96]


def working_memory_key(scope: RAGScope, session_id: str) -> str:
    return "rag:wm:{tenant}:{user}:{session}".format(
        tenant=safe_scope_part(scope.tenant_id),
        user=safe_scope_part(scope.user_id),
        session=safe_scope_part(session_id),
    )


def sanitize_text(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    lowered = text.lower()
    if any(pattern in lowered for pattern in FORBIDDEN_PATTERNS):
        return "[redacted]"
    return text[:limit]


def sanitize_mapping(value: dict[str, Any] | None, *, limit: int) -> dict[str, Any]:
    if not value:
        return {}
    sanitized: dict[str, Any] = {}
    for key in sorted(value.keys()):
        if key in {"company_id", "tenant_id", "user_id", "authorization", "citations", "business_facts"}:
            continue
        item = value[key]
        if isinstance(item, dict):
            sanitized[key] = sanitize_mapping(item, limit=limit)
        elif isinstance(item, list):
            sanitized[key] = [sanitize_text(entry, limit) for entry in item[: settings.RAG_WORKING_MEMORY_MAX_ENTITIES]]
        else:
            sanitized[key] = sanitize_text(item, limit)
    return sanitized


class WorkingMemoryService:
    def __init__(self, *, redis_client=None, clock: Clock | None = None) -> None:
        self.redis_client = redis_client
        self.clock = clock or SystemClock()

    async def _redis(self):
        redis = self.redis_client if self.redis_client is not None else await get_redis()
        if not redis:
            raise WorkingMemoryUnavailable("working_memory_unavailable")
        return redis

    async def create_session(self, *, scope: RAGScope, conversation_id: str) -> WorkingMemorySnapshot:
        self._validate_scope(scope)
        session_id = str(uuid4())
        now = self.clock.now()
        snapshot = WorkingMemorySnapshot(
            session_id=session_id,
            conversation_id=conversation_id,
            company_id=scope.company_id,
            tenant_id=scope.tenant_id,
            user_id=scope.user_id,
            created_at=now,
            updated_at=now,
            expires_at=now + timedelta(seconds=settings.RAG_WORKING_MEMORY_ABSOLUTE_TTL_SECONDS),
        )
        redis = await self._redis()
        try:
            await redis.setex(working_memory_key(scope, session_id), self._ttl_seconds(snapshot), snapshot.model_dump_json())
        except Exception as exc:
            raise WorkingMemoryUnavailable("working_memory_unavailable") from exc
        return snapshot

    async def get_session(
        self,
        *,
        scope: RAGScope,
        session_id: str,
        conversation_id: str,
        refresh_idle: bool = True,
    ) -> WorkingMemorySnapshot | None:
        self._validate_scope(scope)
        redis = await self._redis()
        key = working_memory_key(scope, session_id)
        try:
            payload = await redis.get(key)
        except Exception as exc:
            raise WorkingMemoryUnavailable("working_memory_unavailable") from exc
        if not payload:
            return None
        snapshot = WorkingMemorySnapshot.model_validate_json(payload)
        self._assert_owner(snapshot, scope, conversation_id)
        if snapshot.expires_at <= self.clock.now():
            try:
                await redis.delete(key)
            except Exception as exc:
                raise WorkingMemoryUnavailable("working_memory_unavailable") from exc
            return None
        if refresh_idle:
            try:
                await redis.expire(key, self._ttl_seconds(snapshot))
            except Exception as exc:
                raise WorkingMemoryUnavailable("working_memory_unavailable") from exc
        return snapshot

    async def update_client_state(self, *, scope: RAGScope, session_id: str, update: ClientWorkingMemoryUpdate) -> WorkingMemorySnapshot:
        snapshot = await self._load_for_update(scope=scope, session_id=session_id, conversation_id=update.conversation_id, expected_version=update.expected_version)
        if update.message:
            snapshot.messages.append(sanitize_mapping(update.message, limit=settings.RAG_WORKING_MEMORY_MESSAGE_CHARS))
        if update.current_page is not None:
            snapshot.current_page = sanitize_text(update.current_page, 120)
        if update.selected_record is not None:
            snapshot.selected_record = sanitize_mapping(update.selected_record, limit=240)
        if update.current_filters is not None:
            snapshot.current_filters = sanitize_mapping(update.current_filters, limit=120)
        if update.reference_bindings:
            snapshot.resolved_reference_bindings.update(sanitize_mapping(update.reference_bindings, limit=240))
        if update.clarification_state is not None:
            snapshot.clarification_state = sanitize_mapping(update.clarification_state, limit=240)
        return await self._save(scope, snapshot)

    async def update_server_state(self, *, scope: RAGScope, session_id: str, update: ServerWorkingMemoryUpdate) -> WorkingMemorySnapshot:
        snapshot = await self._load_for_update(scope=scope, session_id=session_id, conversation_id=update.conversation_id, expected_version=update.expected_version)
        for field_name in ("current_project", "current_lead", "current_company", "current_task"):
            value = getattr(update, field_name)
            if value is not None:
                setattr(snapshot, field_name, sanitize_mapping(value, limit=240))
        if update.tool_output:
            snapshot.recent_tool_outputs.append(sanitize_mapping(update.tool_output, limit=settings.RAG_WORKING_MEMORY_TOOL_OUTPUT_CHARS))
        if update.current_workflow_step is not None:
            snapshot.current_workflow_step = sanitize_text(update.current_workflow_step, 160)
        if update.reference_bindings:
            snapshot.resolved_reference_bindings.update(sanitize_mapping(update.reference_bindings, limit=240))
        return await self._save(scope, snapshot)

    async def delete_session(self, *, scope: RAGScope, session_id: str, conversation_id: str) -> None:
        existing = await self.get_session(scope=scope, session_id=session_id, conversation_id=conversation_id, refresh_idle=False)
        if existing:
            redis = await self._redis()
            try:
                await redis.delete(working_memory_key(scope, session_id))
            except Exception as exc:
                raise WorkingMemoryUnavailable("working_memory_unavailable") from exc

    async def _load_for_update(self, *, scope: RAGScope, session_id: str, conversation_id: str, expected_version: int | None) -> WorkingMemorySnapshot:
        snapshot = await self.get_session(scope=scope, session_id=session_id, conversation_id=conversation_id, refresh_idle=False)
        if not snapshot:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Working Memory session not found")
        if expected_version is not None and snapshot.version != expected_version:
            raise WorkingMemoryConflict("Working Memory version conflict")
        return snapshot

    async def _save(self, scope: RAGScope, snapshot: WorkingMemorySnapshot) -> WorkingMemorySnapshot:
        snapshot.messages = snapshot.messages[-settings.RAG_WORKING_MEMORY_MAX_MESSAGES :]
        snapshot.recent_tool_outputs = snapshot.recent_tool_outputs[-settings.RAG_WORKING_MEMORY_MAX_TOOL_OUTPUTS :]
        snapshot.resolved_reference_bindings = dict(list(snapshot.resolved_reference_bindings.items())[-settings.RAG_WORKING_MEMORY_MAX_ENTITIES :])
        snapshot.version += 1
        snapshot.updated_at = self.clock.now()
        redis = await self._redis()
        try:
            await redis.setex(working_memory_key(scope, snapshot.session_id), self._ttl_seconds(snapshot), snapshot.model_dump_json())
        except Exception as exc:
            raise WorkingMemoryUnavailable("working_memory_unavailable") from exc
        return snapshot

    def _ttl_seconds(self, snapshot: WorkingMemorySnapshot) -> int:
        remaining_absolute = int((snapshot.expires_at - self.clock.now()).total_seconds())
        return max(1, min(settings.RAG_WORKING_MEMORY_IDLE_TTL_SECONDS, remaining_absolute))

    def _validate_scope(self, scope: RAGScope) -> None:
        if not scope.company_id or not scope.tenant_id or not scope.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Authenticated tenant, company and user scope required")

    def _assert_owner(self, snapshot: WorkingMemorySnapshot, scope: RAGScope, conversation_id: str) -> None:
        if snapshot.company_id != scope.company_id or snapshot.tenant_id != scope.tenant_id or snapshot.user_id != scope.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Working Memory session ownership denied")
        if snapshot.conversation_id != conversation_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Working Memory conversation ownership denied")
