"""
Capability policy metadata — deterministic security classification for every
AI-callable business capability.

Risk levels:
    READ            — standard read, company-scoped
    SENSITIVE_READ  — salary, payroll, PII, confidential data
    WRITE           — create/update operations
    HIGH_RISK_WRITE — delete, separation, bulk mutations

Sensitive data classes:
    PAYROLL, SALARY, EMPLOYEE_PII, CANDIDATE_PII, FINANCE,
    CLIENT_CONFIDENTIAL, CREDENTIALS
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RiskLevel(str, Enum):
    READ = "READ"
    SENSITIVE_READ = "SENSITIVE_READ"
    WRITE = "WRITE"
    HIGH_RISK_WRITE = "HIGH_RISK_WRITE"


class SensitiveDataClass(str, Enum):
    PAYROLL = "PAYROLL"
    SALARY = "SALARY"
    EMPLOYEE_PII = "EMPLOYEE_PII"
    CANDIDATE_PII = "CANDIDATE_PII"
    FINANCE = "FINANCE"
    CLIENT_CONFIDENTIAL = "CLIENT_CONFIDENTIAL"
    CREDENTIALS = "CREDENTIALS"


@dataclass(frozen=True)
class CapabilityPolicy:
    """Deterministic policy metadata for an AI-callable capability.

    Every AI-executable tool MUST have a CapabilityPolicy.
    Missing policy = DENY (fail closed).
    """
    tool_id: str
    agent_ids: tuple[str, ...]
    domain: str

    # Access requirements
    required_modules: tuple[str, ...] = ()
    required_capabilities: tuple[str, ...] = ()

    # Risk classification
    risk_level: RiskLevel = RiskLevel.READ
    sensitive_data_classes: tuple[SensitiveDataClass, ...] = ()

    # Governance
    tenant_scoped: bool = True
    approval_required: bool = False
    write_allowed: bool = False

    # Metadata
    policy_version: str = "1.0.0"

    def snapshot_hash(self) -> str:
        """Deterministic hash for audit trail."""
        raw = json.dumps({
            "tool_id": self.tool_id,
            "risk_level": self.risk_level.value,
            "required_capabilities": sorted(self.required_capabilities),
            "required_modules": sorted(self.required_modules),
            "policy_version": self.policy_version,
        }, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode()).hexdigest()[:16]


class CapabilityPolicyRegistry:
    """Central registry of all AI-callable capability policies.

    Policies are statically defined — not dynamically inferred from prompts.
    Unknown/unclassified tools MUST fail closed (deny).
    """

    def __init__(self) -> None:
        self._policies: dict[str, CapabilityPolicy] = {}

    def register(self, policy: CapabilityPolicy) -> None:
        self._policies[policy.tool_id] = policy

    def get(self, tool_id: str) -> CapabilityPolicy | None:
        return self._policies.get(tool_id)

    def has_policy(self, tool_id: str) -> bool:
        return tool_id in self._policies

    def all_tool_ids(self) -> list[str]:
        return list(self._policies.keys())

    def get_by_agent(self, agent_id: str) -> list[CapabilityPolicy]:
        return [p for p in self._policies.values() if agent_id in p.agent_ids]

    def policy_version_hash(self) -> str:
        """Hash of all policies for audit trail."""
        items = sorted(
            (p.tool_id, p.snapshot_hash()) for p in self._policies.values()
        )
        raw = json.dumps(items, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Global registry singleton
# ---------------------------------------------------------------------------
policy_registry = CapabilityPolicyRegistry()
