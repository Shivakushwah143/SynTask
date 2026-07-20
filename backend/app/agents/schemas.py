from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class AgentRunCreateRequest(BaseModel):
    agent_id: str
    agent_version: str
    trigger_type: str = "manual"
    idempotency_key: str = Field(min_length=8, max_length=128)
    project_id: Optional[str] = None
    task_id: Optional[str] = None
    department_id: Optional[str] = None
    session_id: str
    conversation_id: str
    query: str
    input_payload: dict[str, Any] = Field(default_factory=dict)


class AgentRunResponse(BaseModel):
    run_id: str
    agent_id: str
    agent_version: str
    state: str
    state_revision: int
    context_package_id: str | None = None
    provider: str | None = None
    model: str | None = None
    sanitized_result: dict[str, Any] = Field(default_factory=dict)
    proposed_action_ids: list[str] = Field(default_factory=list)
    token_usage: dict[str, Any] = Field(default_factory=dict)
    estimated_cost: float = 0.0
    error_category: str | None = None


class GenericAgentOutput(BaseModel):
    summary: str = ""
    facts: list[dict[str, Any]] = Field(default_factory=list)
    proposed_actions: list[dict[str, Any]] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)
    confidence: float = 0.0
