"""
Central deterministic governance decision engine.

Every AI-originated business capability MUST pass through this gate.
No AI path may bypass deterministic authorization.

Decision outcomes:
    ALLOW           — execute the tool
    DENY            — block execution
    REQUIRE_APPROVAL — needs human approval before execution
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app.ai.security.context import AISecurityContext
from app.ai.security.policy import (
    CapabilityPolicy,
    RiskLevel,
    policy_registry,
)

logger = logging.getLogger(__name__)


class GovernanceDecision(str, Enum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"


# Reason codes for machine-readable audit trail
class DenialReason(str, Enum):
    MISSING_SECURITY_CONTEXT = "MISSING_SECURITY_CONTEXT"
    UNKNOWN_CAPABILITY = "UNKNOWN_CAPABILITY"
    UNCLASSIFIED_CAPABILITY = "UNCLASSIFIED_CAPABILITY"
    MODULE_NOT_ALLOWED = "MODULE_NOT_ALLOWED"
    MISSING_CAPABILITY = "MISSING_CAPABILITY"
    RESOURCE_NOT_ACCESSIBLE = "RESOURCE_NOT_ACCESSIBLE"
    CROSS_TENANT_RESOURCE = "CROSS_TENANT_RESOURCE"
    INVALID_ARGUMENTS = "INVALID_ARGUMENTS"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    AGENT_NOT_AUTHORIZED = "AGENT_NOT_AUTHORIZED"
    WRITE_NOT_SUPPORTED = "WRITE_NOT_SUPPORTED"
    PROTECTED_ARGUMENT_OVERRIDE = "PROTECTED_ARGUMENT_OVERRIDE"


@dataclass(frozen=True)
class AuthorizationResult:
    """Structured result of a governance authorization check."""
    decision: GovernanceDecision
    reason: DenialReason | None = None
    tool_id: str = ""
    policy_version: str = ""
    details: str = ""

    @property
    def allowed(self) -> bool:
        return self.decision == GovernanceDecision.ALLOW


def authorize_capability(
    context: AISecurityContext | None,
    capability_name: str,
    agent_id: str,
    arguments: dict[str, Any] | None = None,
) -> AuthorizationResult:
    """Central deterministic authorization for any AI capability.

    Checks (in order):
        1. Security context exists
        2. Capability has governance policy (fail closed if not)
        3. Capability is AI-callable (agent match)
        4. Required modules are enabled
        5. Required capabilities/permissions exist
        6. Write actions are properly gated
        7. Approval requirements are met

    Returns AuthorizationResult with decision and safe reason code.
    """
    # 1. Security context must exist
    if context is None:
        return AuthorizationResult(
            decision=GovernanceDecision.DENY,
            reason=DenialReason.MISSING_SECURITY_CONTEXT,
            tool_id=capability_name,
            details="No trusted security context available",
        )

    # 2. Policy metadata must exist (fail closed)
    policy = policy_registry.get(capability_name)
    if policy is None:
        return AuthorizationResult(
            decision=GovernanceDecision.DENY,
            reason=DenialReason.UNCLASSIFIED_CAPABILITY,
            tool_id=capability_name,
            details=f"No governance policy registered for '{capability_name}'",
        )

    # 3. Agent must be authorized to use this capability
    if agent_id not in policy.agent_ids:
        return AuthorizationResult(
            decision=GovernanceDecision.DENY,
            reason=DenialReason.AGENT_NOT_AUTHORIZED,
            tool_id=capability_name,
            details=f"Agent '{agent_id}' not authorized for '{capability_name}'",
        )

    # 4. Required modules must be enabled
    if policy.required_modules:
        if not context.has_any_module(list(policy.required_modules)):
            return AuthorizationResult(
                decision=GovernanceDecision.DENY,
                reason=DenialReason.MODULE_NOT_ALLOWED,
                tool_id=capability_name,
                details=f"Required modules {sorted(policy.required_modules)} not enabled",
            )

    # 5. Required capabilities must exist (admins wildcard-pass)
    if policy.required_capabilities and not context.is_admin:
        if not context.has_any_capability(list(policy.required_capabilities)):
            return AuthorizationResult(
                decision=GovernanceDecision.DENY,
                reason=DenialReason.MISSING_CAPABILITY,
                tool_id=capability_name,
                details=f"Required capabilities {sorted(policy.required_capabilities)} not found",
            )

    # 6. Write actions — V1 deny unsupported writes
    if policy.risk_level in (RiskLevel.WRITE, RiskLevel.HIGH_RISK_WRITE):
        if not policy.write_allowed:
            return AuthorizationResult(
                decision=GovernanceDecision.DENY,
                reason=DenialReason.WRITE_NOT_SUPPORTED,
                tool_id=capability_name,
                details=f"Write actions not supported for '{capability_name}' in V1",
            )

    # 7. Approval requirements
    if policy.approval_required:
        return AuthorizationResult(
            decision=GovernanceDecision.REQUIRE_APPROVAL,
            tool_id=capability_name,
            policy_version=policy.policy_version,
        )

    return AuthorizationResult(
        decision=GovernanceDecision.ALLOW,
        tool_id=capability_name,
        policy_version=policy.policy_version,
    )


def authorize_tool_execution(
    context: AISecurityContext | None,
    tool_name: str,
    agent_id: str,
    arguments: dict[str, Any] | None = None,
    company_id_from_args: str | None = None,
) -> AuthorizationResult:
    """Execution-time authorization for a specific tool invocation.

    This is the ACTUAL security boundary — called before every tool execution.
    Performs all governance checks plus protected argument enforcement.
    """
    # Basic capability authorization
    result = authorize_capability(context, tool_name, agent_id, arguments)
    if not result.allowed:
        return result

    # Protected argument enforcement: company_id from args must match context
    if company_id_from_args and context:
        if company_id_from_args != context.company_id:
            return AuthorizationResult(
                decision=GovernanceDecision.DENY,
                reason=DenialReason.CROSS_TENANT_RESOURCE,
                tool_id=tool_name,
                details="Tool argument company_id does not match trusted context",
            )

    return result


def filter_authorized_tools(
    context: AISecurityContext | None,
    tool_schemas: list[dict[str, Any]],
    agent_id: str,
) -> list[dict[str, Any]]:
    """Filter tool schemas to only those the user is authorized to use.

    Used BEFORE sending schemas to the LLM (reduces exposure + token cost).
    Applied BEFORE the capability selector (defense in depth).
    """
    if context is None:
        logger.warning("No security context — returning empty tool set")
        return []

    authorized: list[dict[str, Any]] = []
    for schema in tool_schemas:
        tool_name = schema.get("function", {}).get("name", "")
        if not tool_name:
            continue

        result = authorize_capability(context, tool_name, agent_id)
        if result.allowed:
            authorized.append(schema)
        else:
            logger.debug(
                "Tool '%s' filtered out: %s (%s)",
                tool_name,
                result.reason.value if result.reason else "unknown",
                result.details,
            )

    return authorized
