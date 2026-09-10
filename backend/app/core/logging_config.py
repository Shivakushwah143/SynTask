"""
Centralized logging configuration for SynTask.

* Production  → structured JSON to stdout (service=syntask-backend)
* Development → human-readable colour-free format to stderr
* Celery worker → structured JSON to stdout (service=syntask-worker)

Usage::

    from app.core.logging_config import configure_logging
    configure_logging()          # call once at process start
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings

# ---------------------------------------------------------------------------
# Secret / credential redaction
# ---------------------------------------------------------------------------

# Patterns whose captured group should be masked in log output.
_SECRET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(password\s*[=:]\s*)(\S+)", re.IGNORECASE),
    re.compile(r"(token\s*[=:]\s*)(\S+)", re.IGNORECASE),
    re.compile(r"(api[_-]?key\s*[=:]\s*)(\S+)", re.IGNORECASE),
    re.compile(r"(secret\s*[=:]\s*)(\S+)", re.IGNORECASE),
    re.compile(r"(reset[_-]?link\s*[=:]\s*)(\S+)", re.IGNORECASE),
    re.compile(r"(credentials?\s*[=:]\s*)(\S+)", re.IGNORECASE),
    re.compile(r"(authorization\s*[=:]\s*)(\S+)", re.IGNORECASE),
    re.compile(r"(bearer\s+)(\S+)", re.IGNORECASE),
]

REDACTED = "[REDACTED]"


def redact_secrets(message: str) -> str:
    """Defensively mask common secret / credential patterns in a log string."""
    for pattern in _SECRET_PATTERNS:
        message = pattern.sub(rf"\g<1>{REDACTED}", message)
    return message


# ---------------------------------------------------------------------------
# Custom JSON formatter (stdlib only – no extra dependencies)
# ---------------------------------------------------------------------------

class _JSONFormatter(logging.Formatter):
    """Emit one JSON object per log line to *stdout*."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": getattr(record, "service", "syntask-backend"),
            "environment": settings.ENVIRONMENT,
            "logger": record.name,
            "message": redact_secrets(record.getMessage()),
        }
        # Attach common structured fields if present on the record.
        for key in (
            "request_id",
            "method",
            "route",
            "status_code",
            "duration_ms",
        ):
            val = getattr(record, key, None)
            if val is not None:
                log_entry[key] = val

        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str, ensure_ascii=False)


class _HumanFormatter(logging.Formatter):
    """Human-readable format for development."""

    _FMT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    _DATEFMT = "%Y-%m-%d %H:%M:%S"

    def __init__(self) -> None:
        super().__init__(fmt=self._FMT, datefmt=self._DATEFMT)

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        # getMessage() does msg % args; store the redacted result and
        # clear args so super().format() doesn't try to format a second time.
        record.msg = redact_secrets(record.getMessage())
        record.args = None
        return super().format(record)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def configure_logging(
    *,
    service: str = "syntask-backend",
    log_level: str | None = None,
) -> None:
    """Set up root logging for the current process.

    Called once at startup from ``main.py`` (API server) or from the
    Celery worker boot signal.
    """
    level = log_level or settings.LOG_LEVEL
    is_prod = settings.ENVIRONMENT == "production"

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove any existing handlers (e.g. basicConfig from old code paths).
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    if is_prod:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(_JSONFormatter())
    else:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(_HumanFormatter())

    root.addHandler(handler)

    # Quiet down noisy third-party loggers.
    for noisy in ("uvicorn.access", "uvicorn.error", "motor", "beanie"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logging.getLogger(__name__).info(
        "Logging configured: level=%s environment=%s service=%s",
        level,
        settings.ENVIRONMENT,
        service,
    )
