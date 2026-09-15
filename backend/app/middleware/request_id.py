"""
X-Request-ID middleware for FastAPI.

* Accepts an incoming ``X-Request-ID`` header or generates a UUID.
* Attaches the ID to every log record for the request's lifetime.
* Returns the ``X-Request-ID`` header on every response.
* Logs one structured access line per request (method, route, status, duration).
* Skips noisy access logs for health / metrics endpoints.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger(__name__)


def _current_trace_id() -> str | None:
    """Return the active OTLP trace_id, or None when tracing is disabled."""
    try:
        from app.observability.tracing import current_trace_id

        return current_trace_id()
    except Exception:  # pragma: no cover - tracing is optional
        return None


# Paths that should not produce an access-log line.
_HEALTH_PATHS = frozenset({"/health", "/api/v1/health", "/api/v1/debug", "/debug", "/metrics"})


class _RequestIDFilter(logging.Filter):
    """Inject ``request_id`` into every log record so downstream formatters pick it up."""

    def __init__(self) -> None:
        super().__init__()
        self._context_var: str | None = None  # noqa: SLF001 – internal

    def set_request_id(self, request_id: str) -> None:
        self._context_var = request_id

    def clear_request_id(self) -> None:
        self._context_var = None

    def filter(self, record: logging.LogRecord) -> bool:
        if self._context_var:
            record.request_id = self._context_var  # type: ignore[attr-defined]
        return True


# Module-level singleton used by main.py to attach to the root logger.
request_id_filter = _RequestIDFilter()


class RequestIDMiddleware(BaseHTTPMiddleware):
    """ASGI middleware that stamps ``X-Request-ID`` on every request/response."""

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex

        # Make available to log records via the filter
        request_id_filter.set_request_id(rid)

        # Stash on request.state so handlers can access it if needed.
        request.state.request_id = rid

        start = time.perf_counter()
        status_code: int | None = None
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            # Re-raise so FastAPI's exception handler deals with it,
            # but still ensure the filter is cleaned up.
            raise
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)

            # Structured access log line. request_id and trace_id are both
            # attached; they serve different purposes and neither replaces the
            # other (request_id = support/audit id, trace_id = Tempo lookup).
            path = request.url.path
            if path not in _HEALTH_PATHS:
                log_extra = {
                    "method": request.method,
                    "route": path,
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                    "request_id": rid,
                }
                trace_id = _current_trace_id()
                if trace_id:
                    log_extra["trace_id"] = trace_id
                logger.info(
                    "%s %s completed in %.2fms [%s]",
                    request.method,
                    path,
                    duration_ms,
                    rid,
                    extra=log_extra,
                )

            # Clear filter context so it doesn't leak across async tasks
            request_id_filter.clear_request_id()

        # Always return the request ID to the caller
        response.headers["X-Request-ID"] = rid
        return response
