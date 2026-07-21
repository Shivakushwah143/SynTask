from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.agents.project_agent import (
    PROJECT_AGENT_FORBIDDEN_TOOL_IDS,
    PROJECT_AGENT_ID,
    PROJECT_AGENT_INPUT_SCHEMA_VERSION,
    PROJECT_AGENT_OUTPUT_SCHEMA_VERSION,
    ProjectAgentOperation,
    ProjectAgentOutput,
    ProjectAgentRequest,
    ProjectSpecialistId,
    ProjectSpecialistSelector,
    ProposedWorkItem,
    project_agent_definition,
    project_specialist_definitions,
)


def test_project_agent_request_rejects_unknown_operation_and_client_trust_fields():
    with pytest.raises(ValidationError):
        ProjectAgentRequest(
            project_id="project-1",
            operation="invent_agent",
            user_request="Summarize status",
            idempotency_key="idempotent-1",
        )

    with pytest.raises(ValidationError):
        ProjectAgentRequest(
            project_id="project-1",
            operation=ProjectAgentOperation.PROJECT_SUMMARY,
            user_request="Summarize status",
            idempotency_key="idempotent-1",
            tenant_id="client-supplied-tenant",
        )

    with pytest.raises(ValidationError):
        ProjectAgentRequest(
            project_id="project-1",
            operation=ProjectAgentOperation.PROJECT_SUMMARY,
            user_request="Summarize status",
            idempotency_key="idempotent-1",
            roles=["admin"],
        )


def test_project_agent_output_is_read_only_and_requires_approval_for_proposals():
    now = datetime.now(UTC)
    with pytest.raises(ValidationError):
        ProjectAgentOutput(
            project_id="project-1",
            operation=ProjectAgentOperation.DECOMPOSE_SCOPE,
            context_timestamp=now,
            summary="Breakdown",
            proposed_work_items=[ProposedWorkItem(title="Draft launch checklist")],
            overall_confidence=0.7,
            expires_at=now + timedelta(minutes=30),
            approval_required=False,
        )

    output = ProjectAgentOutput(
        project_id="project-1",
        operation=ProjectAgentOperation.DECOMPOSE_SCOPE,
        context_timestamp=now,
        summary="Breakdown",
        proposed_work_items=[ProposedWorkItem(title="Draft launch checklist")],
        overall_confidence=0.7,
        expires_at=now + timedelta(minutes=30),
        approval_required=True,
    )

    assert output.read_only is True
    assert output.proposed_work_items[0].mutation_status == "proposal_only"


def test_project_agent_definition_is_manual_project_scoped_and_read_only():
    definition = project_agent_definition()

    assert definition.agent_id == PROJECT_AGENT_ID
    assert definition.version == "1.0.0"
    assert definition.allowed_trigger_types == ["manual"]
    assert definition.required_scopes == ["project_id"]
    assert definition.allowed_tool_ids == []
    assert set(PROJECT_AGENT_FORBIDDEN_TOOL_IDS).issubset(set(definition.forbidden_tool_ids))
    assert definition.input_schema_version == PROJECT_AGENT_INPUT_SCHEMA_VERSION
    assert definition.output_schema_version == PROJECT_AGENT_OUTPUT_SCHEMA_VERSION
    assert definition.approval_policy["read_only"] is True
    assert definition.approval_policy["mutations_allowed"] is False
    assert definition.enabled is False
    assert definition.published is False


def test_project_specialist_definitions_are_generic_profiles_not_autonomous_tools():
    specialists = project_specialist_definitions()

    assert len(specialists) == 5
    assert {specialist.specialist_id for specialist in specialists} == {item.value for item in ProjectSpecialistId}
    for specialist in specialists:
        assert specialist.supported_agent_ids == [PROJECT_AGENT_ID]
        assert specialist.allowed_tools == []
        assert "create_task" in specialist.forbidden_actions
        assert "call_connector" in specialist.forbidden_actions
        assert specialist.maximum_fan_out == 1
        assert specialist.enabled is False
        assert specialist.evaluated is False
        assert specialist.published is False


def test_specialist_selection_is_deterministic_and_exact_operation_based():
    specialists = [
        specialist.model_copy(update={"enabled": True, "evaluated": True, "published": True})
        for specialist in project_specialist_definitions()
    ]
    selector = ProjectSpecialistSelector()

    assert [
        item.specialist_id
        for item in selector.select(ProjectAgentOperation.PROJECT_SUMMARY, specialists).selected
    ] == [
        ProjectSpecialistId.EXECUTION_GUIDANCE.value,
        ProjectSpecialistId.RISK_DEPENDENCY.value,
    ]
    assert [
        item.specialist_id
        for item in selector.select(ProjectAgentOperation.DECOMPOSE_SCOPE, specialists).selected
    ] == [ProjectSpecialistId.TASK_DECOMPOSITION.value]
    assert [
        item.specialist_id
        for item in selector.select(ProjectAgentOperation.IDENTIFY_RISKS, specialists).selected
    ] == [ProjectSpecialistId.RISK_DEPENDENCY.value]
    assert [
        item.specialist_id
        for item in selector.select(ProjectAgentOperation.EXECUTION_GUIDANCE, specialists).selected
    ] == [ProjectSpecialistId.EXECUTION_GUIDANCE.value]
    assert [
        item.specialist_id
        for item in selector.select(ProjectAgentOperation.REVIEW_PLAN, specialists).selected
    ] == [
        ProjectSpecialistId.QUALITY_REVIEW.value,
        ProjectSpecialistId.RISK_DEPENDENCY.value,
    ]
    assert [
        item.specialist_id
        for item in selector.select(ProjectAgentOperation.ESTIMATE_WORK, specialists).selected
    ] == [ProjectSpecialistId.ESTIMATE_CAPACITY.value]
    assert [
        item.specialist_id
        for item in selector.select(ProjectAgentOperation.COMPREHENSIVE_PROJECT_REVIEW, specialists).selected
    ] == [
        ProjectSpecialistId.TASK_DECOMPOSITION.value,
        ProjectSpecialistId.RISK_DEPENDENCY.value,
        ProjectSpecialistId.EXECUTION_GUIDANCE.value,
        ProjectSpecialistId.QUALITY_REVIEW.value,
        ProjectSpecialistId.ESTIMATE_CAPACITY.value,
    ]


def test_specialist_selection_blocks_disabled_or_unevaluated_profiles():
    selector = ProjectSpecialistSelector()
    disabled_specialists = project_specialist_definitions()

    disabled_result = selector.select(ProjectAgentOperation.DECOMPOSE_SCOPE, disabled_specialists)

    assert disabled_result.selected == []
    assert disabled_result.unavailable_reason == "no_matching_enabled_specialist"

    unevaluated_specialists = [
        specialist.model_copy(update={"enabled": True, "evaluated": False})
        for specialist in project_specialist_definitions()
    ]

    unevaluated_result = selector.select(ProjectAgentOperation.DECOMPOSE_SCOPE, unevaluated_specialists)

    assert unevaluated_result.selected == []
    assert unevaluated_result.unavailable_reason == "no_matching_evaluated_specialist"


def test_specialist_selection_rejects_unknown_direct_operation():
    with pytest.raises(ValueError, match="Unsupported Project Agent operation"):
        ProjectSpecialistSelector().select("invent_agent", project_specialist_definitions())
