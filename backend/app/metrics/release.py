"""Release / deployment Prometheus metrics (Topic 10).

Bounded, low-cardinality metrics only:

* ``syntask_build_info{version,commit,branch,environment}``  — gauge, always 1.
  One series per release; lets Grafana show the currently deployed release.
* ``syntask_release_deployed_timestamp_seconds{version,commit,environment}``
  — gauge, Unix time this release process started (deployment marker).

Explicit user/tenant identifiers are never used as labels.
"""

from __future__ import annotations

import time
from typing import Optional

from prometheus_client import Gauge

BUILD_INFO = Gauge(
    "syntask_build_info",
    "SynTask release identity (always 1; labels identify the release)",
    ["version", "commit", "branch", "environment"],
)

RELEASE_DEPLOYED_TIMESTAMP = Gauge(
    "syntask_release_deployed_timestamp_seconds",
    "Unix timestamp when this release process started",
    ["version", "commit", "environment"],
)

_registered_for: Optional[str] = None


def register_release_metrics(start_epoch: Optional[float] = None) -> None:
    """Publish release identity metrics for this process (idempotent)."""
    global _registered_for

    from app.core.release import release_info

    info = release_info()
    # commit + version uniquely identify a release within an environment.
    signature = f"{info['environment']}:{info['version']}:{info['commit']}"
    if _registered_for == signature:
        return

    BUILD_INFO.labels(
        version=info["version"],
        commit=info["commit"],
        branch=info["branch"],
        environment=info["environment"],
    ).set(1)
    RELEASE_DEPLOYED_TIMESTAMP.labels(
        version=info["version"],
        commit=info["commit"],
        environment=info["environment"],
    ).set(start_epoch if start_epoch is not None else time.time())

    _registered_for = signature
