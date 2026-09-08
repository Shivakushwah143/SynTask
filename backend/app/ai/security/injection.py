"""
Lightweight prompt injection signal detection.

This is NOT authorization — it's defense-in-depth telemetry.
Deterministic authorization must remain intact regardless of injection detection.

Signals may:
    - record telemetry
    - reduce optional capabilities
    - increase scrutiny
But must never GRANT authority.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class InjectionSignal(str, Enum):
    NONE = "NONE"
    SUSPICIOUS = "SUSPICIOUS"
    HIGH_RISK = "HIGH_RISK"


@dataclass(frozen=True)
class InjectionAnalysis:
    signal: InjectionSignal
    matched_patterns: tuple[str, ...] = ()


# Patterns that indicate potential prompt injection attempts
_HIGH_RISK_PATTERNS = [
    (r"(?i)ignore\s+(all\s+)?rules", "instruction_override"),
    (r"(?i)ignore\s+(all\s+)?permissions", "permission_bypass"),
    (r"(?i)override\s+(all\s+)?security", "security_override"),
    (r"(?i)you\s+are\s+now\s+(a|an)\s+admin", "role_impersonation"),
    (r"(?i)i\s+am\s+(the\s+)?(ceo|admin|super\s*admin|root)", "role_impersonation"),
    (r"(?i)disregard\s+(all\s+)?previous", "instruction_override"),
    (r"(?i)act\s+as\s+if\s+you\s+have", "authority_elevation"),
    (r"(?i)pretend\s+you\s+are", "role_impersonation"),
    (r"(?i)show\s+me\s+(all\s+)?(password|secret|api.?key|token)", "secret_extraction"),
    (r"(?i)what\s+is\s+the\s+(system\s+)?prompt", "system_prompt_extraction"),
    (r"(?i)repeat\s+(your\s+)?(system|initial)\s+prompt", "system_prompt_extraction"),
    (r"(?i)developer\s+mode", "instruction_override"),
    (r"(?i)jailbreak", "instruction_override"),
]

_SUSPICIOUS_PATTERNS = [
    (r"(?i)show\s+me\s+.*salary", "sensitive_data_request"),
    (r"(?i)show\s+.*payroll", "sensitive_data_request"),
    (r"(?i)give\s+me\s+admin", "privilege_escalation"),
    (r"(?i)make\s+me\s+admin", "privilege_escalation"),
    (r"(?i)bypass\s+.*check", "check_bypass"),
    (r"(?i)skip\s+.*permission", "permission_bypass"),
]


def analyze_injection(text: str) -> InjectionAnalysis:
    """Analyze user text for prompt injection signals.

    Returns InjectionAnalysis with signal level and matched patterns.
    This is purely informational — it does NOT affect authorization decisions.
    """
    if not text:
        return InjectionAnalysis(signal=InjectionSignal.NONE)

    matched: list[str] = []

    # Check high-risk patterns
    for pattern, label in _HIGH_RISK_PATTERNS:
        if re.search(pattern, text):
            matched.append(label)

    if matched:
        return InjectionAnalysis(
            signal=InjectionSignal.HIGH_RISK,
            matched_patterns=tuple(matched),
        )

    # Check suspicious patterns
    for pattern, label in _SUSPICIOUS_PATTERNS:
        if re.search(pattern, text):
            matched.append(label)

    if matched:
        return InjectionAnalysis(
            signal=InjectionSignal.SUSPICIOUS,
            matched_patterns=tuple(matched),
        )

    return InjectionAnalysis(signal=InjectionSignal.NONE)
