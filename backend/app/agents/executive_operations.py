"""Executive Operations Agent — AgentDefinition factory.

Follows the same registration pattern used by email_draft, task_performance,
and project_agent.  The definition is stored as an AgentDefinition document
in MongoDB and looked up by the AgentRegistry at runtime.
"""

from __future__ import annotations

from app.core.clock import aware_utc_now
from typing import List

from app.core.config import settings
from app.models.agent import AgentDefinition


EXECUTIVE_AGENT_ID = "executive_operations_agent"
EXECUTIVE_AGENT_VERSION = "v1"
EXECUTIVE_INPUT_SCHEMA_VERSION = "executive-operations-input-v1"
EXECUTIVE_OUTPUT_SCHEMA_VERSION = "executive-operations-output-v1"
EXECUTIVE_RETRIEVAL_PROFILE_ID = "executive_operations_policy"
EXECUTIVE_RETRIEVAL_PROFILE_VERSION = "executive-operations-policy-v1"
EXECUTIVE_PROMPT_ID = "executive_operations_agent"
EXECUTIVE_PROMPT_VERSION = "executive-operations-v1"
EXECUTIVE_PROVIDER_POLICY_ID = "executive-operations-read-only"
EXECUTIVE_EVALUATION_SET_VERSION = "executive-operations-eval-v1"

EXECUTIVE_FORBIDDEN_TOOL_IDS: List[str] = [
    "create_task",
    "update_task",
    "delete_task",
    "assign_task",
    "change_task_status",
    "update_user",
    "rank_employees",
    "score_employee",
    "send_email",
    "send_connector_message",
    "schedule_agent_run",
]


def executive_operations_agent_definition(created_by: str = "system") -> AgentDefinition:
    """Return an idempotent AgentDefinition for the Executive Operations Agent."""
    now = aware_utc_now()
    return AgentDefinition.model_construct(
        agent_id=EXECUTIVE_AGENT_ID,
        version=EXECUTIVE_AGENT_VERSION,
        name="Executive Operations Agent",
        description="Company-wide intelligence: tasks, workload, projects, clients, sales, finance, cross-domain questions, and activity summaries.",
        department="operations",
        objective=(
            "Provide the CEO and executive team with cross-domain business intelligence "
            "by investigating tasks, projects, clients, sales, finance, HR, and meetings — "
            "connecting evidence across departments and explaining cause/effect without "
            "mutating business records."
        ),
        allowed_trigger_types=["manual"],
        allowed_roles=["super_admin", "admin", "manager", "lead"],
        required_scopes=["tenant_id"],
        required_structured_domains=["user", "task", "project", "client", "sales", "finance", "meeting", "department"],
        retrieval_profile_id=EXECUTIVE_RETRIEVAL_PROFILE_ID,
        retrieval_profile_version=EXECUTIVE_RETRIEVAL_PROFILE_VERSION,
        allowed_tool_ids=[],
        forbidden_tool_ids=EXECUTIVE_FORBIDDEN_TOOL_IDS,
        input_schema_version=EXECUTIVE_INPUT_SCHEMA_VERSION,
        output_schema_version=EXECUTIVE_OUTPUT_SCHEMA_VERSION,
        prompt_id=EXECUTIVE_PROMPT_ID,
        prompt_version=EXECUTIVE_PROMPT_VERSION,
        provider_policy_id=EXECUTIVE_PROVIDER_POLICY_ID,
        memory_policy={
            "working_memory": "resolve_current_references_only",
            "structured_memory": "authoritative_current_business_facts",
            "rag": "approved_executive_guidance_only",
        },
        provider_policy={
            "provider": "groq",
            "model": settings.EXECUTIVE_AGENT_MODEL or settings.AI_MODEL_GROQ,
            "fallback_provider": "openai",
            "read_only": True,
            "tool_calling": True,
        },
        personalization_policy={
            "allowed": ["language", "detail_level", "tone"],
            "forbidden": ["facts", "permissions", "employment_decisions"],
        },
        approval_policy={
            "read_only": True,
            "proposal_only": True,
            "mutations_allowed": False,
            "employment_decisions_allowed": False,
        },
        budget_policy={"max_repair_attempts": 1, "max_tokens_per_run": 5000},
        timeout_seconds=30,
        maximum_retries=0,
        evaluation_set_version=EXECUTIVE_EVALUATION_SET_VERSION,
        enabled=settings.AGENT_PLATFORM_ENABLED and settings.EXECUTIVE_AGENT_ENABLED,
        published=False,
        created_at=now,
        created_by=created_by,
        retired_at=None,
    )
