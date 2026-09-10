"""
Prometheus metrics for the eTimeOffice attendance sync integration.

* ``syntask_etimeoffice_sync_runs_total``  – counter labeled success/error
* ``syntask_etimeoffice_sync_duration_seconds``  – histogram of sync duration
* ``syntask_etimeoffice_last_successful_sync_timestamp``  – gauge of last success
"""

from __future__ import annotations

import time

from prometheus_client import Counter, Histogram, Gauge

SYNC_RUNS = Counter(
    "syntask_etimeoffice_sync_runs_total",
    "Total eTimeOffice sync runs",
    ["status"],  # "success" | "error"
)

SYNC_DURATION = Histogram(
    "syntask_etimeoffice_sync_duration_seconds",
    "Duration of eTimeOffice sync runs in seconds",
    buckets=(1.0, 2.5, 5.0, 10.0, 25.0, 60.0, 120.0, 300.0),
)

LAST_SUCCESSFUL_SYNC = Gauge(
    "syntask_etimeoffice_last_successful_sync_timestamp",
    "Unix timestamp of the last successful eTimeOffice sync",
)


def record_sync_start() -> float:
    """Return the start time for a sync run."""
    return time.perf_counter()


def record_sync_success(start_time: float) -> None:
    """Record a successful sync run."""
    duration = time.perf_counter() - start_time
    SYNC_RUNS.labels(status="success").inc()
    SYNC_DURATION.observe(duration)
    LAST_SUCCESSFUL_SYNC.set_to_current_time()


def record_sync_error(start_time: float) -> None:
    """Record a failed sync run."""
    duration = time.perf_counter() - start_time
    SYNC_RUNS.labels(status="error").inc()
    SYNC_DURATION.observe(duration)
