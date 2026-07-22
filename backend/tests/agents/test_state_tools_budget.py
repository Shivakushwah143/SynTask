from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.agents.budget import AgentBudgetController, BudgetExceeded
from app.agents.state_machine import AgentRunStateMachine, AgentStateTransitionError
from app.agents.tools import ToolDefinition, ToolRegistry
from app.models.agent import AgentRun, AgentRunState


def _run(state: AgentRunState = AgentRunState.CREATED) -> AgentRun:
    return AgentRun.model_construct(
        run_id="run-1",
        tenant_id="tenant-1",
        requesting_user_id="user-1",
        agent_id="agent-1",
        agent_version="1",
        trigger_type="manual",
        retrieval_profile_version="profile-1",
        prompt_version="prompt-1",
        output_schema_version="schema-1",
        state=state,
        idempotency_key="idem-1",
        expires_at=datetime.utcnow() + timedelta(minutes=30),
    )


def test_state_machine_valid_flow_and_revision():
    machine = AgentRunStateMachine()
    run = _run()

    machine.transition(run, AgentRunState.QUEUED, expected_revision=0)
    machine.transition(run, AgentRunState.GATHERING_CONTEXT, expected_revision=1)
    machine.transition(run, AgentRunState.PROCESSING, expected_revision=2)
    machine.transition(run, AgentRunState.VALIDATING, expected_revision=3)
    machine.transition(run, AgentRunState.COMPLETED, expected_revision=4)

    assert run.state == AgentRunState.COMPLETED
    assert run.state_revision == 5
    assert run.completed_at is not None


def test_state_machine_rejects_invalid_future_terminal_and_revision_conflict():
    machine = AgentRunStateMachine()
    with pytest.raises(AgentStateTransitionError):
        machine.transition(_run(), AgentRunState.PROCESSING)
    with pytest.raises(AgentStateTransitionError):
        machine.transition(_run(), AgentRunState.APPROVED)
    with pytest.raises(AgentStateTransitionError):
        machine.transition(_run(AgentRunState.COMPLETED), AgentRunState.CANCELLED)
    with pytest.raises(AgentStateTransitionError):
        machine.transition(_run(), AgentRunState.QUEUED, expected_revision=99)


def test_one_repair_maximum():
    run = _run(AgentRunState.VALIDATING)
    machine = AgentRunStateMachine()

    machine.validate_repair_allowed(run)
    run.repair_attempts = 1

    with pytest.raises(AgentStateTransitionError):
        machine.validate_repair_allowed(run)


def test_tool_registry_denies_by_default_and_blocks_unregistered():
    registry = ToolRegistry()

    assert registry.get_allowed(agent_id="agent-1", requested_tool_ids=["missing"]) == []
    with pytest.raises(ValueError):
        registry.assert_no_unregistered_tools(["missing"])

    registry.register(
        ToolDefinition(
            tool_id="test_read",
            version="1",
            description="read only",
            input_schema={},
            output_schema={},
            required_permissions=[],
            permitted_agent_ids=["agent-1"],
            risk_class="low",
            read_write="read",
            approval_required=False,
            idempotency_required=False,
            timeout_seconds=1,
            enabled=True,
        )
    )

    assert registry.get_allowed(agent_id="agent-1", requested_tool_ids=["test_read"])[0].tool_id == "test_read"


def test_tool_registry_rejects_unapproved_write_tool():
    with pytest.raises(ValueError):
        ToolRegistry().register(
            ToolDefinition(
                tool_id="write",
                version="1",
                description="bad",
                input_schema={},
                output_schema={},
                required_permissions=[],
                permitted_agent_ids=["agent-1"],
                risk_class="high",
                read_write="write",
                approval_required=False,
                idempotency_required=True,
                timeout_seconds=1,
                enabled=True,
            )
        )


def test_budget_precheck_and_reconciliation():
    controller = AgentBudgetController()

    reservation = controller.reserve(budget_policy={"max_tokens_per_run": 10, "max_cost_per_run": 1}, estimated_tokens=5, estimated_cost=0.1)
    assert controller.reconcile(reservation=reservation, actual_tokens=3, actual_cost=0.05)["released_tokens"] == 2

    with pytest.raises(BudgetExceeded):
        controller.reserve(budget_policy={"max_tokens_per_run": 1}, estimated_tokens=2, estimated_cost=0.0)
