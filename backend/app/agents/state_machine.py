from __future__ import annotations

from datetime import datetime

from app.core.clock import utc_now

from app.models.agent import AgentRun, AgentRunState, TERMINAL_AGENT_RUN_STATES


VALID_AGENT_RUN_TRANSITIONS: dict[AgentRunState, set[AgentRunState]] = {
    AgentRunState.CREATED: {AgentRunState.QUEUED, AgentRunState.CANCELLED, AgentRunState.EXPIRED},
    AgentRunState.QUEUED: {AgentRunState.GATHERING_CONTEXT, AgentRunState.CANCELLED, AgentRunState.EXPIRED},
    AgentRunState.GATHERING_CONTEXT: {AgentRunState.PROCESSING, AgentRunState.BLOCKED_MISSING_DATA, AgentRunState.CANCELLED, AgentRunState.EXPIRED},
    AgentRunState.BLOCKED_MISSING_DATA: {AgentRunState.QUEUED, AgentRunState.CANCELLED, AgentRunState.EXPIRED},
    AgentRunState.PROCESSING: {AgentRunState.VALIDATING, AgentRunState.FAILED, AgentRunState.CANCELLED, AgentRunState.EXPIRED},
    AgentRunState.VALIDATING: {AgentRunState.REPAIRING, AgentRunState.PROPOSED, AgentRunState.COMPLETED, AgentRunState.FAILED, AgentRunState.CANCELLED, AgentRunState.EXPIRED},
    AgentRunState.REPAIRING: {AgentRunState.VALIDATING, AgentRunState.FAILED, AgentRunState.CANCELLED, AgentRunState.EXPIRED},
    AgentRunState.PROPOSED: {AgentRunState.AWAITING_APPROVAL, AgentRunState.CANCELLED, AgentRunState.EXPIRED},
    AgentRunState.AWAITING_APPROVAL: {AgentRunState.CANCELLED, AgentRunState.EXPIRED},
    AgentRunState.COMPLETED: set(),
    AgentRunState.FAILED: set(),
    AgentRunState.CANCELLED: set(),
    AgentRunState.EXPIRED: set(),
    AgentRunState.APPROVED: set(),
    AgentRunState.EXECUTING: set(),
    AgentRunState.EXECUTED: set(),
    AgentRunState.REJECTED: set(),
}

FUTURE_ONLY_STATES = {
    AgentRunState.APPROVED,
    AgentRunState.EXECUTING,
    AgentRunState.EXECUTED,
    AgentRunState.REJECTED,
}


class AgentStateTransitionError(ValueError):
    pass


class AgentRunStateMachine:
    def validate_transition(self, current: AgentRunState, target: AgentRunState) -> None:
        if current in TERMINAL_AGENT_RUN_STATES:
            raise AgentStateTransitionError("Terminal states are immutable")
        if target in FUTURE_ONLY_STATES:
            raise AgentStateTransitionError("Future-only state cannot be entered in Milestone 6")
        if target not in VALID_AGENT_RUN_TRANSITIONS.get(current, set()):
            raise AgentStateTransitionError(f"Invalid transition {current.value}->{target.value}")

    def transition(self, run: AgentRun, target: AgentRunState, *, expected_revision: int | None = None) -> AgentRun:
        if expected_revision is not None and run.state_revision != expected_revision:
            raise AgentStateTransitionError("State revision conflict")
        self.validate_transition(run.state, target)
        run.state = target
        run.state_revision += 1
        run.updated_at = utc_now()
        if target in TERMINAL_AGENT_RUN_STATES:
            run.completed_at = utc_now()
        return run

    def validate_repair_allowed(self, run: AgentRun) -> None:
        if run.repair_attempts >= 1:
            raise AgentStateTransitionError("Only one schema repair cycle is permitted")
