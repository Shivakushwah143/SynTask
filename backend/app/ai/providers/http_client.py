"""Shared HTTP client for AI providers.

Every Groq/OpenAI call used to construct a fresh ``httpx.AsyncClient``,
paying a new TCP connection + TLS handshake per request (agent loops make
2-3 sequential calls, each of which re-negotiated the connection).

An ``httpx.AsyncClient`` is bound to the event loop it was created on, so
this module keeps ONE client per running event loop (weakly keyed — a test
loop that finishes is garbage-collected with its client). Under a
long-running worker there is exactly one loop, so one keep-alive client is
reused for every AI request.
"""

from __future__ import annotations

import asyncio
import weakref
from typing import Any

import httpx

# event loop -> httpx.AsyncClient (WeakKeyDictionary: loop GC'd ⇒ client dropped)
_shared_clients: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, httpx.AsyncClient]" = (
    weakref.WeakKeyDictionary()
)

_DEFAULT_LIMITS = httpx.Limits(
    max_connections=50,
    max_keepalive_connections=20,
    keepalive_expiry=30.0,
)


def get_shared_client(*, timeout: httpx.Timeout | float | None = None) -> httpx.AsyncClient:
    """Return the event-loop-scoped shared ``httpx.AsyncClient``.

    ``timeout`` only applies when the client is first created for this loop;
    later calls with different timeouts reuse the existing client (all AI
    call sites use the same ``settings.AI_TIMEOUT``).
    """
    loop = asyncio.get_running_loop()
    client = _shared_clients.get(loop)
    if client is None or getattr(client, "is_closed", False):
        kwargs: dict[str, Any] = {"limits": _DEFAULT_LIMITS}
        if timeout is not None:
            kwargs["timeout"] = httpx.Timeout(timeout) if not isinstance(timeout, httpx.Timeout) else timeout
        client = httpx.AsyncClient(**kwargs)
        _shared_clients[loop] = client
    return client


async def close_shared_clients() -> None:
    """Best-effort close of all cached clients (shutdown hook)."""
    clients = list(_shared_clients.values())
    _shared_clients.clear()
    for client in clients:
        try:
            await client.aclose()
        except Exception:
            pass
