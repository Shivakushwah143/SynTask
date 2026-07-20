"""Redaction helpers for persisted Meta errors."""

import re
from typing import Optional


MAX_ERROR_MESSAGE_LENGTH = 500
_JSON_SECRET = re.compile(
    r"""(?i)(["']?[a-z0-9_]*(?:token|secret|authorization)["']?"""
    r"""\s*:\s*["'])([^"']+)(["'])"""
)
_NAMED_SECRET = re.compile(
    r"(?i)(\b[a-z0-9_]*(?:token|secret|authorization)\b\s*[:=]\s*)"
    r"([^\s,&}]+)"
)
_BEARER_SECRET = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+")


def sanitize_error_message(
    message: Optional[object],
    *,
    known_secrets: tuple[str, ...] = (),
) -> Optional[str]:
    if message is None:
        return None

    sanitized = str(message)
    for secret in known_secrets:
        if secret:
            sanitized = sanitized.replace(secret, "[REDACTED]")
    sanitized = _JSON_SECRET.sub(
        lambda match: f"{match.group(1)}[REDACTED]{match.group(3)}",
        sanitized,
    )
    sanitized = _BEARER_SECRET.sub("Bearer [REDACTED]", sanitized)
    sanitized = _NAMED_SECRET.sub(
        lambda match: f"{match.group(1)}[REDACTED]",
        sanitized,
    )
    return sanitized[:MAX_ERROR_MESSAGE_LENGTH]
