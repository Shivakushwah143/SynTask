"""
FastAPI request-boundary trace dependency.

Every AI chat endpoint opts in with ``_trace: dict = Depends(ai_request_trace)``.

Ownership of the trace lifecycle is split by transport:

- **Non-streaming** endpoints: the dependency closes the trace in its teardown
  (all spans have already been recorded synchronously before the response is
  returned).
- **Streaming** endpoints: the SSE generator's ``finally`` is the single owner
  that closes the trace (``STREAM_ABORTED`` on client disconnect). The
  dependency teardown is a safety net that only closes traces that are still
  open *after* the stream finished (e.g. endpoint raised before a generator was
  produced), so it never cuts a live stream short.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import Depends, Request

from app.ai.observability import tracer as ai_tracer
from app.api.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)


async def ai_request_trace(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Yield once with the request-scoped trace; finalize on request end."""
    if not ai_tracer.telemetry_enabled():
        yield {"trace_id": None, "ctx": None}
        return

    tenant_id = getattr(current_user, "company_id", None)
    if not tenant_id:
        yield {"trace_id": None, "ctx": None}
        return

    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    streaming = "stream" in (request.url.path or "")
    ctx = ai_tracer.start_trace(
        tenant_id=str(tenant_id),
        user_id=str(current_user.id),
        role=role,
        streaming=streaming,
    )
    if ctx is None:
        yield {"trace_id": None, "ctx": None}
        return

    request.state.ai_trace_ctx = ctx
    ai_tracer.start_span("REQUEST", "ai_request", attrs={"path": request.url.path})

    error: Optional[BaseException] = None
    try:
        yield {"trace_id": ctx.trace_id, "ctx": ctx}
    except BaseException as exc:  # endpoint raised -> close trace as failed
        error = exc
        raise
    finally:
        if error is not None:
            error_type, message = ai_tracer.classify_span_error(error)
            await ai_tracer.end_trace(
                ctx,
                status="BLOCKED",
                error_type=error_type,
                error_message=message,
            )
        elif ai_tracer.get_trace_by_id(ctx.trace_id) is not None:
            if streaming:
                # Streaming endpoint finished/aborted without closing its trace
                # (e.g. client disconnect) -> close as aborted.
                await ai_tracer.finish_trace_if_open(ctx.trace_id)
            else:
                # Non-streaming endpoint completed: all spans are recorded.
                await ai_tracer.end_trace(ctx)
