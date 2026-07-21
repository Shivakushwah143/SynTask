from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.agents.task_performance import (
    TASK_PERFORMANCE_AGENT_ID,
    TASK_PERFORMANCE_FORBIDDEN_TOOL_IDS,
    TASK_PERFORMANCE_INPUT_SCHEMA_VERSION,
    TASK_PERFORMANCE_OUTPUT_SCHEMA_VERSION,
    TaskPerformanceAgentOutput,
    TaskPerformanceAgentRequest,
    TaskPerformanceMetricOutput,
    task_performance_agent_definition,
)
from app.agents.orchestrator import AgentOrchestrator
from app.rag.retrieval_profiles import RetrievalProfileRegistry


def request_payload(**overrides):
    data = {
        "insight_type": "team_summary",
        "date_range": {
            "start": datetime(2026, 7, 1, tzinfo=UTC),
            "end": datetime(2026, 7, 21, tzinfo=UTC),
        },
        "metric_keys": ["task_completion_rate"],
        "idempotency_key": "idempotent-1",
    }
    data.update(overrides)
    return data


def test_task_performance_request_rejects_client_trust_and_unknown_metrics():
    with pytest.raises(ValidationError):
        TaskPerformanceAgentRequest(**request_payload(tenant_id="client-tenant"))
    with pytest.raises(ValidationError):
        TaskPerformanceAgentRequest(**request_payload(metric_keys=["invented_metric"]))
    with pytest.raises(ValidationError):
        TaskPerformanceAgentRequest(**request_payload(user_request="Rank employees and recommend firing"))


def test_task_performance_request_validates_date_range():
    with pytest.raises(ValidationError):
        TaskPerformanceAgentRequest(
            **request_payload(
                date_range={
                    "start": datetime(2026, 7, 21, tzinfo=UTC),
                    "end": datetime(2026, 7, 1, tzinfo=UTC),
                }
            )
        )


def test_task_performance_output_is_read_only_proposal_only_and_fair():
    metric = TaskPerformanceMetricOutput(
        key="task_completion_rate",
        version="v1",
        status="available",
        formula="completed eligible assigned tasks / total eligible assigned tasks",
        value=0.5,
        numerator=1,
        denominator=2,
        sample_size=2,
        excluded_record_count=0,
        confidence=0.7,
    )
    output = TaskPerformanceAgentOutput(
        agent_run_id="run-1",
        scope={"type": "team", "id": "team-1", "label": "Team"},
        period={"start": "2026-07-01T00:00:00Z", "end": "2026-07-21T00:00:00Z", "timezone": "UTC"},
        summary="Operational task completion summary.",
        metrics=[metric],
        recommendations=[
            {
                "id": "rec-1",
                "title": "Review blockers",
                "description": "Review recurring blockers in planning meeting.",
                "confidence": 0.6,
            }
        ],
    )

    assert output.agent.key == TASK_PERFORMANCE_AGENT_ID
    assert output.read_only is True
    assert output.recommendations[0].mutation_status == "proposal_only"

    with pytest.raises(ValidationError):
        TaskPerformanceAgentOutput(
            agent_run_id="run-1",
            scope={"type": "team", "id": "team-1", "label": "Team"},
            period={"start": "2026-07-01T00:00:00Z", "end": "2026-07-21T00:00:00Z", "timezone": "UTC"},
            summary="Fire the worst employee.",
        )


def test_task_performance_definition_is_manual_read_only_and_manager_scoped():
    definition = task_performance_agent_definition()

    assert definition.agent_id == TASK_PERFORMANCE_AGENT_ID
    assert definition.version == "v1"
    assert definition.allowed_trigger_types == ["manual"]
    assert "employee" not in definition.allowed_roles
    assert definition.allowed_tool_ids == []
    assert set(TASK_PERFORMANCE_FORBIDDEN_TOOL_IDS).issubset(set(definition.forbidden_tool_ids))
    assert definition.input_schema_version == TASK_PERFORMANCE_INPUT_SCHEMA_VERSION
    assert definition.output_schema_version == TASK_PERFORMANCE_OUTPUT_SCHEMA_VERSION
    assert definition.approval_policy["read_only"] is True
    assert definition.approval_policy["mutations_allowed"] is False
    assert definition.approval_policy["employment_decisions_allowed"] is False
    assert definition.enabled is False
    assert definition.published is False


def test_orchestrator_uses_task_performance_output_schema():
    definition = task_performance_agent_definition()

    assert AgentOrchestrator()._output_schema(definition) is TaskPerformanceAgentOutput


def test_task_performance_retrieval_profile_is_policy_only_and_fairness_scoped():
    definition = task_performance_agent_definition()
    profile = RetrievalProfileRegistry().get(definition.retrieval_profile_id)

    assert profile.profile_version == "task-performance-policy-v1"
    assert profile.scope_requirements == ["tenant_id"]
    assert "metric_definition" in profile.allowed_source_types
    assert "performance_policy" in profile.allowed_source_types
    assert "task" in profile.allowed_structured_domains
    assert "protected_hr" in profile.forbidden_source_types
    assert "payroll" in profile.forbidden_source_types
    assert "private_message" in profile.forbidden_source_types
    assert "deterministic_metrics_only" in profile.mandatory_policies
    assert "no_employment_decisions" in profile.mandatory_policies
    assert profile.requires_citations is True
