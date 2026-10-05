"""HR Operations Agent — AgentDefinition factory.

Follows the same registration pattern used by email_draft, task_performance,
and project_agent.  The definition is stored as an AgentDefinition document
in MongoDB and looked up by the AgentRegistry at runtime.
"""

from __future__ import annotations

from app.core.clock import aware_utc_now
from typing import List

from app.core.config import settings
from app.models.agent import AgentDefinition


HR_AGENT_ID = "hr_operations_agent"
HR_AGENT_VERSION = "v1"
HR_INPUT_SCHEMA_VERSION = "hr-operations-input-v1"
HR_OUTPUT_SCHEMA_VERSION = "hr-operations-output-v1"
HR_RETRIEVAL_PROFILE_ID = "hr_operations_policy"
HR_RETRIEVAL_PROFILE_VERSION = "hr-operations-policy-v1"
HR_PROMPT_ID = "hr_operations_agent"
HR_PROMPT_VERSION = "hr-operations-v1"
HR_PROVIDER_POLICY_ID = "hr-operations-read-only"
HR_EVALUATION_SET_VERSION = "hr-operations-eval-v1"

HR_FORBIDDEN_TOOL_IDS: List[str] = [
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


def hr_operations_agent_definition(created_by: str = "system") -> AgentDefinition:
    """Return an idempotent AgentDefinition for the HR Operations Agent."""
    now = aware_utc_now()
    return AgentDefinition.model_construct(
        agent_id=HR_AGENT_ID,
        version=HR_AGENT_VERSION,
        name="HR Operations Agent",
        description="Human-resources intelligence: employee profiles, attendance, leave, payroll, documents, onboarding, and recruitment.",
        department="human_resources",
        objective=(
            "Answer HR-specific questions about employees, attendance, leave, payroll, documents, "
            "onboarding, and recruitment using authoritative SynTask records without mutating "
            "business data or making employment decisions."
        ),
        allowed_trigger_types=["manual"],
        allowed_roles=["super_admin", "admin", "manager", "lead", "employee"],
        required_scopes=["tenant_id"],
        required_structured_domains=["user", "department", "employee_profile", "attendance", "leave", "hr_document"],
        retrieval_profile_id=HR_RETRIEVAL_PROFILE_ID,
        retrieval_profile_version=HR_RETRIEVAL_PROFILE_VERSION,
        allowed_tool_ids=[],
        forbidden_tool_ids=HR_FORBIDDEN_TOOL_IDS,
        input_schema_version=HR_INPUT_SCHEMA_VERSION,
        output_schema_version=HR_OUTPUT_SCHEMA_VERSION,
        prompt_id=HR_PROMPT_ID,
        prompt_version=HR_PROMPT_VERSION,
        provider_policy_id=HR_PROVIDER_POLICY_ID,
        memory_policy={
            "working_memory": "resolve_employee_references_only",
            "structured_memory": "authoritative_current_hr_facts",
            "rag": "approved_hr_policy_and_guidance_only",
        },
        provider_policy={
            "provider": "groq",
            "model": settings.HR_AGENT_MODEL or settings.AI_MODEL_GROQ,
            "fallback_provider": "openai",
            "read_only": True,
            "tool_calling": True,
        },
        personalization_policy={
            "allowed": ["language", "detail_level"],
            "forbidden": ["facts", "permissions", "employment_decisions"],
        },
        approval_policy={
            "read_only": True,
            "proposal_only": True,
            "mutations_allowed": False,
            "employment_decisions_allowed": False,
        },
        budget_policy={"max_repair_attempts": 1, "max_tokens_per_run": 4000},
        timeout_seconds=30,
        maximum_retries=0,
        evaluation_set_version=HR_EVALUATION_SET_VERSION,
        enabled=settings.AGENT_PLATFORM_ENABLED and settings.HR_AGENT_ENABLED,
        published=False,
        created_at=now,
        created_by=created_by,
        retired_at=None,
    )
