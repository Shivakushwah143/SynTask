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
from app.models.agent import AgentRun, AgentRunState
from app.models.user import UserRole
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


def test_task_performance_provider_context_injects_immutable_verified_metrics():
    definition = task_performance_agent_definition()
    payload = type(
        "Payload",
        (),
        {
            "input_payload": {
                "metric_keys": ["task_completion_rate", "eod_completion_rate"],
                "date_range": {"start": "2026-07-01T00:00:00Z", "end": "2026-07-21T00:00:00Z"},
                "preferences": {"timezone": "UTC"},
                "scope": {"user_id": "employee-1"},
            }
        },
    )()
    user = type("User", (), {"id": "manager-1", "company_id": "tenant-1"})()

    context = AgentOrchestrator()._provider_context(definition=definition, context={"items": []}, payload=payload, current_user=user)

    immutable = context["task_performance"]
    assert immutable["immutable"] is True
    assert [metric["key"] for metric in immutable["metrics"]] == ["task_completion_rate", "eod_completion_rate"]
    assert immutable["metrics"][0]["period"]["start"] == "2026-07-01T00:00:00Z"
    assert immutable["metrics"][0]["timezone"] == "UTC"
    assert immutable["metrics"][1]["status"] == "unavailable"


def test_task_performance_provider_output_cannot_change_or_omit_canonical_metrics():
    definition = task_performance_agent_definition()
    orchestrator = AgentOrchestrator()
    metric = {
        "key": "task_completion_rate",
        "version": "v1",
        "status": "unavailable",
        "formula": "completed eligible assigned tasks / total eligible assigned tasks",
        "value": None,
        "numerator": None,
        "denominator": None,
        "sample_size": 0,
        "excluded_record_count": 0,
        "missing_fields": [],
        "conflicts": [],
        "warnings": ["No eligible records"],
        "confidence": 0.0,
        "source_record_references": [],
        "unit": None,
        "freshness": {"as_of": "2026-07-21T00:00:00+00:00", "stale": False},
        "period": {"start": "2026-07-01T00:00:00Z", "end": "2026-07-21T00:00:00Z"},
        "timezone": "UTC",
    }
    parsed = {
        "agent_run_id": "run-1",
        "scope": {"type": "team", "id": "team-1", "label": "Team"},
        "period": {"start": "2026-07-01T00:00:00Z", "end": "2026-07-21T00:00:00Z", "timezone": "UTC"},
        "summary": "Verified metrics unavailable because no eligible records exist.",
        "metrics": [metric],
        "data_quality": {"missing_data": ["No eligible records"]},
    }

    validated = orchestrator._validate_provider_output(
        definition=definition,
        parsed=parsed,
        immutable_context={"metrics": [metric]},
    )
    assert validated["metrics"][0]["value"] is None

    changed = {**parsed, "metrics": [{**metric, "value": 0.5}]}
    with pytest.raises(ValueError, match="changed immutable metric"):
        orchestrator._validate_provider_output(definition=definition, parsed=changed, immutable_context={"metrics": [metric]})

    omitted = {**parsed, "metrics": []}
    with pytest.raises(ValueError, match="omitted or added immutable metrics"):
        orchestrator._validate_provider_output(definition=definition, parsed=omitted, immutable_context={"metrics": [metric]})

    metric_2 = {**metric, "key": "eod_completion_rate", "formula": "submitted EOD reports / expected workdays"}
    reordered = {**parsed, "metrics": [metric_2, metric]}
    with pytest.raises(ValueError, match="changed immutable metric order"):
        orchestrator._validate_provider_output(
            definition=definition,
            parsed=reordered,
            immutable_context={"metrics": [metric, metric_2]},
        )


def test_task_performance_output_keeps_eod_missing_data_hypotheses_and_proposals_separate():
    metric = {
        "key": "task_eod_consistency",
        "version": "v1",
        "status": "available",
        "formula": "compare EOD task references against canonical task status",
        "value": 0.5,
        "numerator": 1.0,
        "denominator": 2.0,
        "sample_size": 2,
        "excluded_record_count": 0,
        "missing_fields": ["completed_task_ids"],
        "conflicts": ["task-2"],
        "warnings": ["EOD evidence is employee-reported and does not override canonical task status"],
        "confidence": 0.7,
        "source_record_references": [{"source_type": "Task", "source_id": "task-1"}],
        "unit": None,
        "freshness": {"as_of": "2026-07-21T00:00:00+00:00", "stale": False},
        "period": {"start": "2026-07-01T00:00:00Z", "end": "2026-07-21T00:00:00Z"},
        "timezone": "UTC",
    }

    output = TaskPerformanceAgentOutput(
        agent_run_id="run-1",
        scope={"type": "team", "id": "team-1", "label": "Team"},
        period={"start": "2026-07-01T00:00:00Z", "end": "2026-07-21T00:00:00Z", "timezone": "UTC"},
        summary="Task and EOD consistency needs review.",
        metrics=[metric],
        employee_reported_context=["EOD says task-2 complete."],
        data_quality={"missing_data": ["completed_task_ids"], "conflicts": ["task-2"]},
        insights=[{"id": "hyp-1", "title": "Possible stale EOD", "description": "EOD may be stale.", "fact_or_hypothesis": "hypothesis", "confidence": 0.5}],
        recommendations=[{"id": "rec-1", "title": "Review conflict", "description": "Check task-2 with assignee.", "confidence": 0.6}],
    )

    assert output.employee_reported_context == ["EOD says task-2 complete."]
    assert output.data_quality.missing_data == ["completed_task_ids"]
    assert output.insights[0].fact_or_hypothesis == "hypothesis"
    assert output.recommendations[0].mutation_status == "proposal_only"


def test_task_performance_rejects_prohibited_hr_decisions_from_provider_output():
    with pytest.raises(ValidationError):
        TaskPerformanceAgentOutput(
            agent_run_id="run-1",
            scope={"type": "team", "id": "team-1", "label": "Team"},
            period={"start": "2026-07-01T00:00:00Z", "end": "2026-07-21T00:00:00Z", "timezone": "UTC"},
            summary="Recommend salary change.",
        )


@pytest.mark.asyncio
async def test_task_performance_provider_failure_is_safe_and_one_repair_maximum(monkeypatch):
    run = AgentRun.model_construct(
        run_id="run-1",
        tenant_id="tenant-1",
        requesting_user_id="manager-1",
        agent_id="task_performance_insights_agent",
        agent_version="v1",
        trigger_type="manual",
        retrieval_profile_version="task-performance-policy-v1",
        prompt_version="task-performance-insights-v1",
        output_schema_version="task-performance-output-v1",
        state=AgentRunState.VALIDATING,
        state_revision=0,
        idempotency_key="idempotent-1",
        repair_attempts=1,
        expires_at=datetime(2026, 7, 21, tzinfo=UTC),
        sanitized_result={},
        proposed_action_ids=[],
        token_usage={},
        estimated_cost=0.0,
    )
    transitions = []

    async def fake_advance(target_run, target, *, actor_id, reason):
        transitions.append(target)
        target_run.state = target
        target_run.state_revision += 1

    async def fake_save(self):
        return None

    monkeypatch.setattr(AgentRun, "save", fake_save)
    orchestrator = AgentOrchestrator()
    monkeypatch.setattr(orchestrator, "_advance", fake_advance)
    current_user = type("User", (), {"id": "manager-1", "role": UserRole.MANAGER})()

    await orchestrator._handle_repair_or_fail(run=run, current_user=current_user, reason="ValidationError")

    assert run.state == AgentRunState.FAILED
    assert run.error_category == "ValidationError"
    assert AgentRunState.REPAIRING not in transitions
