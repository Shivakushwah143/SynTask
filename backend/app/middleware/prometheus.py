"""
Prometheus RED (Rate, Errors, Duration) metrics middleware for FastAPI.

* Counter: syntask_http_requests_total  labels: method, normalized_route, status_code
* Histogram: syntask_http_request_duration_seconds  labels: method, normalized_route

Health/metrics endpoints are excluded from normal HTTP RED metrics.

Route normalization uses FastAPI's matched route template
(``request.scope["route"].path_format``) when available.  Unmatched
paths collapse to ``__unmatched__`` so raw user input never appears as
a label value.
"""

from __future__ import annotations

import time

from fastapi import Request, Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import PlainTextResponse

# ---------------------------------------------------------------------------
# Metric definitions
# ---------------------------------------------------------------------------

REQUEST_COUNT = Counter(
    "syntask_http_requests_total",
    "Total HTTP requests",
    ["method", "normalized_route", "status_code"],
)

REQUEST_DURATION = Histogram(
    "syntask_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "normalized_route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

# ---------------------------------------------------------------------------
# Excluded paths
# ---------------------------------------------------------------------------

# Health / metrics endpoints excluded from RED metrics
_EXCLUDED_PATHS = frozenset({
    "/metrics",
    "/health",
    "/api/v1/health",
    "/livez",
    "/readyz",
    "/api/v1/debug",
    "/debug",
})

# Also exclude OpenAPI/docs endpoints
_EXCLUDED_PREFIXES = ("/api/docs", "/api/redoc", "/api/openapi.json")


def _is_excluded(path: str) -> bool:
    if path in _EXCLUDED_PATHS:
        return True
    for prefix in _EXCLUDED_PREFIXES:
        if path.startswith(prefix):
            return True
    return False


def _resolve_route_label(request: Request) -> str:
    """Return a low-cardinality route label for the given request.

    Strategy (in priority order):
    1. FastAPI matched route template — e.g. ``/users/{user_id}``
    2. ``__unmatched__`` — no route matched (404, OPTIONS preflight, etc.)
    """
    # After call_next, Starlette has resolved the route and stored it on scope.
    route = request.scope.get("route")
    if route is not None:
        # FastAPI's APIRoute exposes path_format: /users/{user_id}
        path_format = getattr(route, "path_format", None)
        if path_format:
            return path_format
        # Fallback to the route's path attribute (Starlette Router sets this)
        route_path = getattr(route, "path", None)
        if route_path:
            return route_path

    return "__unmatched__"


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

class PrometheusMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that records RED metrics for every non-excluded request."""

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        path = request.url.path

        # Skip excluded paths before any processing
        if _is_excluded(path):
            return await call_next(request)

        method = request.method

        start = time.perf_counter()
        status_code: int = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            status_code = 500
            raise
        finally:
            duration = time.perf_counter() - start
            # Route template resolved AFTER call_next so routing has occurred
            normalized = _resolve_route_label(request)
            REQUEST_COUNT.labels(
                method=method,
                normalized_route=normalized,
                status_code=str(status_code),
            ).inc()
            REQUEST_DURATION.labels(
                method=method,
                normalized_route=normalized,
            ).observe(duration)

        return response


# ---------------------------------------------------------------------------
# Metrics endpoint view
# ---------------------------------------------------------------------------

def metrics_endpoint(request: Request) -> Response:
    """Return Prometheus-formatted metrics.

    Uses ``generate_latest()`` which works with both single-process and
    ``prometheus_client.multiprocess`` mode (when ``PROMETHEUS_MULTIPROC_DIR``
    is set).
    """
    from prometheus_client import multiprocess, CollectorRegistry
    import os

    if os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
        body = generate_latest(registry)
    else:
        body = generate_latest()
    return PlainTextResponse(content=body, media_type=CONTENT_TYPE_LATEST)
