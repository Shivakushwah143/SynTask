"""Release identity for SynTask deployments (Topic 10).

Deploy-time environment variables describe exactly which release is running so
operators can correlate a deployment with logs, metrics and traces.  All values
are bounded, non-secret identifiers (commit SHA, version, branch, build time).

Environment variables (set by ``scripts/deployment/deploy.sh`` / GitHub
Actions; never committed):

``SYNTASK_RELEASE_COMMIT``    git SHA of the deployed revision
``SYNTASK_RELEASE_VERSION``   human version/tag (falls back to ``settings.VERSION``)
``SYNTASK_RELEASE_BRANCH``    branch/tag name
``SYNTASK_RELEASE_BUILT_AT``  ISO-8601 build timestamp
"""

from __future__ import annotations

import os
from typing import Optional

UNKNOWN = "unknown"

# Maximum length kept for any single release field (defensive bound).
_MAX_FIELD_LEN = 128


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned[:_MAX_FIELD_LEN]


def _first_env(*names: str) -> Optional[str]:
    for name in names:
        value = _clean(os.getenv(name))
        if value:
            return value
    return None


def release_commit() -> str:
    return _first_env("SYNTASK_RELEASE_COMMIT", "GIT_SHA", "GIT_COMMIT") or UNKNOWN


def release_version() -> str:
    explicit = _first_env("SYNTASK_RELEASE_VERSION")
    if explicit:
        return explicit
    try:
        from app.core.config import settings

        return _clean(settings.VERSION) or UNKNOWN
    except Exception:  # pragma: no cover - defensive
        return UNKNOWN


def release_branch() -> str:
    return _first_env("SYNTASK_RELEASE_BRANCH", "GIT_BRANCH") or UNKNOWN


def release_built_at() -> str:
    return _first_env("SYNTASK_RELEASE_BUILT_AT", "BUILD_TIMESTAMP") or UNKNOWN


def short_commit() -> str:
    commit = release_commit()
    return commit if commit == UNKNOWN else commit[:12]


def release_info() -> dict[str, str]:
    """Return the full release identity for the running process."""
    try:
        from app.core.config import settings

        environment = str(settings.ENVIRONMENT)
    except Exception:  # pragma: no cover - defensive
        environment = os.getenv("ENVIRONMENT", "development")

    return {
        "service": "syntask",
        "version": release_version(),
        "commit": release_commit(),
        "commit_short": short_commit(),
        "branch": release_branch(),
        "built_at": release_built_at(),
        "environment": environment,
    }


def release_log_fields() -> dict[str, str]:
    """Structured fields for the release/deployment startup log line.

    ``event=deployment`` makes release startup lines easy to filter in Loki and
    to use as a deployment marker.
    """
    info = release_info()
    return {
        "event": "deployment",
        "release_version": info["version"],
        "release_commit": info["commit"],
        "release_branch": info["branch"],
        "release_built_at": info["built_at"],
    }
