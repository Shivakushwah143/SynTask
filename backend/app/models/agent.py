from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from beanie import Document, Indexed
from pydantic import Field, model_validator
from pymongo import ASCENDING, DESCENDING, IndexModel


class AgentRunState(str, Enum):
    CREATED = "CREATED"
    QUEUED = "QUEUED"
    GATHERING_CONTEXT = "GATHERING_CONTEXT"
    BLOCKED_MISSING_DATA = "BLOCKED_MISSING_DATA"
    PROCESSING = "PROCESSING"
    VALIDATING = "VALIDATING"
    REPAIRING = "REPAIRING"
    PROPOSED = "PROPOSED"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    APPROVED = "APPROVED"
    EXECUTING = "EXECUTING"
    EXECUTED = "EXECUTED"
    REJECTED = "REJECTED"


TERMINAL_AGENT_RUN_STATES = {
    AgentRunState.COMPLETED,
    AgentRunState.FAILED,
    AgentRunState.CANCELLED,
    AgentRunState.EXPIRED,
}


class AgentDefinition(Document):
    agent_id: Indexed(str)
    version: Indexed(str)
    name: str
    description: str = ""
    department: Optional[str] = None
    objective: str
    allowed_trigger_types: list[str] = Field(default_factory=list)
    allowed_roles: list[str] = Field(default_factory=list)
    required_scopes: list[str] = Field(default_factory=list)
    required_structured_domains: list[str] = Field(default_factory=list)
    retrieval_profile_id: str
    retrieval_profile_version: str
    allowed_tool_ids: list[str] = Field(default_factory=list)
    forbidden_tool_ids: list[str] = Field(default_factory=list)
    input_schema_version: str
    output_schema_version: str
    prompt_id: str
    prompt_version: str
    provider_policy_id: str
    provider_policy: dict[str, Any] = Field(default_factory=dict)
    memory_policy: dict[str, Any] = Field(default_factory=dict)
    personalization_policy: dict[str, Any] = Field(default_factory=dict)
    approval_policy: dict[str, Any] = Field(default_factory=dict)
    budget_policy: dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: int = 30
    maximum_retries: int = 0
    evaluation_set_version: str
    enabled: bool = False
    published: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    retired_at: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_definition(self):
        overlap = set(self.allowed_tool_ids).intersection(self.forbidden_tool_ids)
        if overlap:
            raise ValueError("Tool cannot be both allowed and forbidden")
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if self.maximum_retries < 0:
            raise ValueError("maximum_retries cannot be negative")
        return self

    class Settings:
        name = "agent_definitions"
        indexes = [
            "agent_id",
            "version",
            "enabled",
            "published",
            IndexModel([("agent_id", ASCENDING), ("version", ASCENDING)], unique=True),
        ]


class SpecialistDefinition(Document):
    specialist_id: Indexed(str)
    version: Indexed(str)
    supported_agent_ids: list[str] = Field(default_factory=list)
    supported_task_categories: list[str] = Field(default_factory=list)
    department_types: list[str] = Field(default_factory=list)
    project_types: list[str] = Field(default_factory=list)
    applicable_industries: list[str] = Field(default_factory=list)
    objective: str
    required_context: list[str] = Field(default_factory=list)
    retrieval_profile: dict[str, Any] = Field(default_factory=dict)
    allowed_tools: list[str] = Field(default_factory=list)
    forbidden_actions: list[str] = Field(default_factory=list)
    input_schema_version: str
    output_schema_version: str
    prompt_version: str
    provider_policy: dict[str, Any] = Field(default_factory=dict)
    evidence_requirements: dict[str, Any] = Field(default_factory=dict)
    evaluation_set_version: str
    maximum_fan_out: int = 1
    budget: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = False
    evaluated: bool = False
    published: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    retired_at: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_specialist(self):
        if self.maximum_fan_out < 1:
            raise ValueError("maximum_fan_out must be at least 1")
        return self

    class Settings:
        name = "specialist_definitions"
        indexes = [
            "specialist_id",
            "version",
            "enabled",
            "evaluated",
            IndexModel([("specialist_id", ASCENDING), ("version", ASCENDING)], unique=True),
        ]


class AgentRun(Document):
    run_id: Indexed(str)
    tenant_id: Indexed(str)
    requesting_user_id: Indexed(str)
    service_identity_id: Optional[str] = None
    agent_id: Indexed(str)
    agent_version: str
    trigger_type: str
    project_id: Optional[Indexed(str)] = None
    task_id: Optional[str] = None
    department_id: Optional[str] = None
    context_package_id: Optional[str] = None
    retrieval_profile_version: str
    prompt_version: str
    provider: Optional[str] = None
    model: Optional[str] = None
    output_schema_version: str
    state: AgentRunState = AgentRunState.CREATED
    state_revision: int = 0
    idempotency_key: Indexed(str)
    repair_attempts: int = 0
    started_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    completed_at: Optional[datetime] = None
    error_category: Optional[str] = None
    sanitized_result: dict[str, Any] = Field(default_factory=dict)
    proposed_action_ids: list[str] = Field(default_factory=list)
    token_usage: dict[str, Any] = Field(default_factory=dict)
    estimated_cost: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "agent_runs"
        indexes = [
            "run_id",
            "tenant_id",
            "requesting_user_id",
            "agent_id",
            "project_id",
            "state",
            "idempotency_key",
            IndexModel([("tenant_id", ASCENDING), ("run_id", ASCENDING)], unique=True),
            IndexModel([("tenant_id", ASCENDING), ("requesting_user_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("project_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("agent_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("state", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("requesting_user_id", ASCENDING), ("agent_id", ASCENDING), ("idempotency_key", ASCENDING)], unique=True),
        ]


class AgentRunEvent(Document):
    event_id: Indexed(str)
    run_id: Indexed(str)
    tenant_id: Indexed(str)
    previous_state: Optional[str] = None
    new_state: Optional[str] = None
    event_type: Indexed(str)
    actor_type: str
    actor_id: str
    reason: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "agent_run_events"
        indexes = [
            "event_id",
            "run_id",
            "tenant_id",
            "event_type",
            IndexModel([("tenant_id", ASCENDING), ("run_id", ASCENDING), ("occurred_at", ASCENDING)]),
        ]


class ActionProposal(Document):
    proposal_id: Indexed(str)
    run_id: Indexed(str)
    tenant_id: Indexed(str)
    action_type: str
    target_record_type: Optional[str] = None
    target_record_id: Optional[str] = None
    proposed_changes: dict[str, Any] = Field(default_factory=dict)
    reason: str
    evidence_references: list[dict[str, Any]] = Field(default_factory=list)
    risk_level: str = "low"
    required_approver_roles: list[str] = Field(default_factory=list)
    status: Indexed(str) = "proposed"
    expires_at: datetime
    idempotency_key: Indexed(str)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "agent_action_proposals"
        indexes = [
            "proposal_id",
            "run_id",
            "tenant_id",
            "status",
            "idempotency_key",
            IndexModel([("tenant_id", ASCENDING), ("run_id", ASCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("idempotency_key", ASCENDING)], unique=True),
        ]
