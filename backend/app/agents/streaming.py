"""
Shared streaming helpers for the Executive + HR Operations Agents.

Every streamed response is a sequence of SSE frames carrying a small,
user-safe JSON event contract:

    {"type": "status", "phase": "accepted"|"routing"|"tools"|"analyzing"|"answer",
     "message": "...", "done": int|None, "total": int|None}
    {"type": "token",  "text": "..."}
    {"type": "done",   "data": {<final non-stream response payload>}}
    {"type": "error",  "message": "...", "data": {<partial payload>}}
    {"type": "ping"}

Only user-friendly progress messages and answer text are ever serialized.
Internal tool names, prompts, record ids and sensitive values never appear
in these events.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator, AsyncIterable

# ---------------------------------------------------------------------------
# User-friendly status messages (never leak internal tool names / ids)
# ---------------------------------------------------------------------------

STATUS_UNDERSTANDING = "Understanding your question…"
STATUS_CHECKING_DATA = "Checking company data…"
STATUS_ANALYZING = "Analyzing results…"
STATUS_ANSWER = "Preparing your answer…"

DEFAULT_SSE_HEADERS: dict[str, str] = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def sse_frame(event: dict[str, Any]) -> str:
    """Encode one stream event as a single SSE ``data:`` frame."""
    payload = json.dumps(event, default=str, ensure_ascii=False)
    return f"data: {payload}\n\n"


def status_event(
    phase: str,
    message: str,
    *,
    done: int | None = None,
    total: int | None = None,
) -> dict[str, Any]:
    """Build a user-safe status event."""
    event: dict[str, Any] = {"type": "status", "phase": phase, "message": message}
    if done is not None:
        event["done"] = done
    if total is not None:
        event["total"] = total
    return event


def token_event(text: str) -> dict[str, Any]:
    """Build an answer token delta event."""
    return {"type": "token", "text": text}


def error_event(message: str, data: dict[str, Any]) -> dict[str, Any]:
    """Build an error event carrying a partial (non-stream-shaped) payload."""
    return {"type": "error", "message": message, "data": data}


async def with_heartbeat(
    source: AsyncIterable[dict[str, Any]],
    *,
    interval: float = 12.0,
) -> AsyncGenerator[dict[str, Any], None]:
    """Yield events from ``source``; if nothing arrives for ``interval``
    seconds, yield a ``{"type": "ping"}`` keep-alive so proxies and the
    browser do not time out a quiet stream (e.g. while Groq warms up).

    Cancellation of the consuming task propagates into ``source`` so
    unfinished provider/tool work is cancelled safely.
    """
    iterator = source.__aiter__()
    while True:
        try:
            event = await asyncio.wait_for(iterator.__anext__(), timeout=interval)
            yield event
        except asyncio.TimeoutError:
            yield {"type": "ping"}
        except StopAsyncIteration:
            return
