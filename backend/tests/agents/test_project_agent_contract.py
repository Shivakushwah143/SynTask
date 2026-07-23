from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.agents.project_agent import (
    DEPARTMENT_SPECIALIST_EVALUATION_SET_VERSION,
    DEPARTMENT_SPECIALIST_OUTPUT_SCHEMA_VERSION,
    DEPARTMENT_SPECIALIST_ROUTING_RULE_VERSION,
    DEPARTMENT_SPECIALIST_VERSION,
    PROJECT_AGENT_FORBIDDEN_TOOL_IDS,
    PROJECT_AGENT_ID,
    PROJECT_AGENT_INPUT_SCHEMA_VERSION,
    PROJECT_AGENT_OUTPUT_SCHEMA_VERSION,
    DepartmentSpecialistOutput,
    DepartmentSpecialistSelector,
    ProjectAgentOperation,
    ProjectAgentOutput,
    ProjectAgentRequest,
    ProjectSpecialistId,
    ProjectSpecialistSelector,
    ProposedWorkItem,
    department_specialist_definitions,
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

    with pytest.raises(ValidationError):
        ProjectAgentRequest(
            project_id="project-1",
            operation=ProjectAgentOperation.PROJECT_SUMMARY,
            user_request="Summarize status",
            idempotency_key="idempotent-1",
            specialist_id="content_seo_task_specialist",
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


def test_department_specialist_pack_definitions_are_governed_profiles():
    specialists = department_specialist_definitions()
    pack_counts = {}

    assert len(specialists) == 14
    assert len({(item.specialist_id, item.version) for item in specialists}) == 14
    for specialist in specialists:
        assert specialist.version == DEPARTMENT_SPECIALIST_VERSION
        assert specialist.supported_agent_ids == [PROJECT_AGENT_ID]
        assert specialist.allowed_tools == []
        assert specialist.maximum_fan_out == 1
        assert specialist.input_schema_version == "department-specialist-input-v1"
        assert specialist.output_schema_version == DEPARTMENT_SPECIALIST_OUTPUT_SCHEMA_VERSION
        assert specialist.evaluation_set_version == DEPARTMENT_SPECIALIST_EVALUATION_SET_VERSION
        assert "run_command" in specialist.forbidden_actions
        assert "send_email" in specialist.forbidden_actions
        assert "change_budget" in specialist.forbidden_actions
        assert specialist.enabled is False
        assert specialist.evaluated is False
        assert specialist.published is False
        pack_id = specialist.provider_policy["policy_id"]
        assert pack_id == "project-agent-read-only"
        actual_pack = specialist.prompt_version.removesuffix("-v1")
        assert actual_pack == specialist.specialist_id
        pack_counts.setdefault(tuple(specialist.department_types), 0)
        pack_counts[tuple(specialist.department_types)] += 1

    assert sum(pack_counts.values()) == 14


def test_department_specialist_selection_is_authoritative_and_single_fan_out():
    specialists = [item.model_copy(update={"enabled": True, "evaluated": True, "published": True}) for item in department_specialist_definitions()]
    generic = [item.model_copy(update={"enabled": True, "evaluated": True, "published": True}) for item in project_specialist_definitions()]
    selector = DepartmentSpecialistSelector()

    marketing = selector.select(department_type="marketing", project_type="marketing", task_category="content", specialists=specialists, generic_specialists=generic)
    assert marketing.specialist_id == "content_seo_task_specialist"
    assert marketing.pack_id == "digital_marketing"
    assert marketing.routing_rule_version == DEPARTMENT_SPECIALIST_ROUTING_RULE_VERSION

    software = selector.select(department_type=None, project_type="software", task_category="backend", specialists=specialists, generic_specialists=generic)
    assert software.specialist_id == "software_implementation_specialist"
    assert software.pack_id == "software_technology"

    sales_in_software_project = selector.select(department_type="sales", project_type="software", task_category="proposal", specialists=specialists, generic_specialists=generic)
    assert sales_in_software_project.specialist_id == "proposal_follow_up_task_specialist"
    assert sales_in_software_project.pack_id == "sales"

    fallback = selector.select(department_type="marketing", project_type="marketing", task_category="unknown", specialists=specialists, generic_specialists=generic)
    assert len(fallback.selected) == 1
    assert fallback.selected[0].reason == "Generic fallback: no_department_specialist_match"

    disabled = selector.select(department_type="marketing", project_type="marketing", task_category="content", specialists=department_specialist_definitions(), generic_specialists=generic)
    assert disabled.selected[0].reason == "Generic fallback: department_specialist_disabled"


def test_department_specialist_output_is_proposal_only_and_requires_approval_for_actions():
    with pytest.raises(ValidationError):
        DepartmentSpecialistOutput(
            pack_id="digital_marketing",
            specialist_id="content_seo_task_specialist",
            selection_reason="Exact server-resolved category match: content",
            summary="Review complete.",
            confidence=0.7,
            proposed_actions=[ProposedWorkItem(title="Add content checklist")],
            approval_required=False,
        )

    output = DepartmentSpecialistOutput(
        pack_id="digital_marketing",
        specialist_id="content_seo_task_specialist",
        selection_reason="Exact server-resolved category match: content",
        summary="Review complete.",
        confidence=0.7,
        proposed_actions=[ProposedWorkItem(title="Add content checklist")],
        approval_required=True,
    )

    assert output.proposal_only is True
    assert output.proposed_actions[0].mutation_status == "proposal_only"


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
