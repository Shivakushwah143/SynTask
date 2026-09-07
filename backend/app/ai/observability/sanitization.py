"""
Sanitization — privacy-safe text/attribute handling for AI observability.

Hard rules:
- Never log API keys, credentials, auth tokens or DB URIs.
- Never store full sensitive HR/payroll/tool responses in spans.
- Sanitize/truncate query and error text.
"""
from __future__ import annotations

import re
from typing import Any

_MAX_QUERY_CHARS = 400
_MAX_ERROR_CHARS = 500
_MAX_ATTR_STR_CHARS = 200

# Secret-like patterns redacted everywhere.
_SECRET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?i)\b(bearer\s+)[a-z0-9._~+/=-]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(api[_-]?key|apikey|secret|token|password|authorization)\s*[:=]\s*[^\s,;\"']+"), r"\1=[REDACTED]"),
    (re.compile(r"(?i)(mongodb(?:\+srv)?://)[^@\s]+@"), r"\1[REDACTED]@"),
    (re.compile(r"(?i)(sk-[a-z0-9]{4})[a-z0-9_-]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(groq|openai)_[a-z0-9_]*key=([^\s&]+)"), r"\1=[REDACTED]"),
]

# Top-level attribute keys dropped before persistence. Dropping is exact-match
# (plus a small suffix/prefix set) so metric keys such as ``prompt_tokens`` /
# ``total_tokens`` are preserved while secret-holding keys are never stored.
_DROP_ATTR_KEYS = {
    "password", "token", "secret", "authorization", "api_key", "apikey",
    "access_token", "refresh_token", "id_token", "auth_token", "api_token",
    "user_token", "private_key", "client_secret", "mongo_url", "mongodb_url",
    "redis_url", "database_url", "db_uri", "key", "x_api_key",
}
_DROP_KEY_SUFFIXES = ("_password", "_secret", "_apikey", "_api_key", "_authorization", "_private_key")
_DROP_KEY_PREFIXES = ("password_", "secret_", "authorization_")

_SENSITIVE_VALUE_TERMS = (
    "salary", "payroll", "payslip", "candidate", "resume", "interview", "offer",
    "employee", "client_document", "invoice", "finance", "bank", "aadhaar", "pan",
    "address", "phone", "email", "ssn", "password", "token",
)


def redact_text(text: str) -> str:
    """Replace secret-like substrings with [REDACTED]."""
    if not text:
        return text
    out = text
    for pattern, repl in _SECRET_PATTERNS:
        out = pattern.sub(repl, out)
    return out


def sanitize_query_excerpt(text: str, max_chars: int = _MAX_QUERY_CHARS) -> str:
    """Return a truncated, redacted, single-line excerpt of a user query."""
    if not text:
        return ""
    cleaned = redact_text(text).strip().replace("\n", " ").replace("\r", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if len(cleaned) > max_chars:
        cleaned = cleaned[: max_chars - 3] + "..."
    return cleaned


def sanitize_error_message(text: str, max_chars: int = _MAX_ERROR_CHARS) -> str:
    """Return a truncated, redacted error message safe for persistence."""
    if not text:
        return ""
    cleaned = redact_text(str(text)).strip()
    if len(cleaned) > max_chars:
        cleaned = cleaned[: max_chars - 3] + "..."
    return cleaned


def error_type_for(error: BaseException | str | None) -> str | None:
    """Short stable error classifier for traces/spans."""
    if error is None:
        return None
    if isinstance(error, str):
        text = error
        if not text:
            return None
        # Prefixes used across the agent runtime are preserved as-is.
        for prefix in (
            "MAX_STEPS_EXCEEDED", "GROQ_API_KEY_MISSING", "PROVIDER_ERROR",
            "GROQ_400", "TOOL_ERROR", "STREAM_ERROR", "TENANT_REQUIRED",
            "EXECUTIVE_AGENT_DISABLED", "HR_AGENT_DISABLED", "WORKING_MEMORY_UNAVAILABLE",
        ):
            if text.startswith(prefix):
                return prefix
        return type(text).__name__
    name = type(error).__name__
    return name


def is_blocked_error_type(error_type: str | None) -> bool:
    """Map an error type to the trace-level BLOCKED status (provider/data/config unavailability)."""
    if not error_type:
        return False
    upper = error_type.upper()
    return any(
        marker in upper
        for marker in (
            "GROQ_API_KEY_MISSING", "PROVIDER", "429", "RATE_LIMIT", "TIMEOUT",
            "BLOCKED", "UNAVAILABLE", "DISABLED", "WORKING_MEMORY_UNAVAILABLE",
        )
    )


def sanitize_attrs(attrs: dict[str, Any] | None) -> dict[str, Any]:
    """Keep only safe scalar metadata from an attribute dict.

    Nested payloads, lists and sensitive values are never persisted. Keys that
    look sensitive are dropped, and long strings are truncated.
    """
    if not attrs:
        return {}
    safe: dict[str, Any] = {}
    for key, value in attrs.items():
        key_lower = str(key).lower()
        if (
            key_lower in _DROP_ATTR_KEYS
            or key_lower.endswith(_DROP_KEY_SUFFIXES)
            or key_lower.startswith(_DROP_KEY_PREFIXES)
        ):
            continue
        if value is None:
            continue
        if isinstance(value, bool) or isinstance(value, int) or isinstance(value, float):
            safe[str(key)] = value
        elif isinstance(value, str):
            safe_value = redact_text(value).strip()
            if not safe_value:
                continue
            if any(term in safe_value.lower() for term in _SENSITIVE_VALUE_TERMS):
                continue
            safe[str(key)] = safe_value[:_MAX_ATTR_STR_CHARS]
        # dicts / lists / objects are dropped entirely (may hold payloads).
    return safe
