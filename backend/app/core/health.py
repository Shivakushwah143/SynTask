"""
Production health check endpoints for Kubernetes / Docker probes.

GET /livez  – cheap liveness probe (process alive, no dependency checks)
GET /readyz – readiness probe (MongoDB + Redis required; Qdrant optional)
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import settings

router = APIRouter(tags=["Health"])

_start_time = time.monotonic()


@router.get("/livez")
async def liveness():
    """Liveness probe: proves the FastAPI process and event loop are alive.

    Must NOT depend on MongoDB, Redis, Qdrant, or any external service.
    """
    return {
        "status": "alive",
        "uptime_seconds": round(time.monotonic() - _start_time, 1),
    }


@router.get("/readyz")
async def readiness():
    """Readiness probe: checks dependencies required to serve traffic.

    * MongoDB – required (503 when unreachable)
    * Redis – required when enabled (503 when configured but unreachable)
    * Qdrant – optional; reported as ``degraded`` if RAG is enabled but
      Qdrant is unreachable, never causes 503
    """
    from app.core.database import get_database
    from app.core.redis_client import get_redis_health

    status = "ready"
    checks: dict[str, dict] = {}
    http_status = 200

    # --- MongoDB (required) ---
    try:
        db = get_database()
        await db.command("ping", maxTimeMS=2000)
        checks["mongodb"] = {"ok": True}
    except Exception as exc:
        checks["mongodb"] = {"ok": False, "error": str(exc)[:200]}
        status = "not_ready"
        http_status = 503

    # --- Redis (required when enabled) ---
    try:
        redis_ok = await get_redis_health(force_refresh=True)
        checks["redis"] = {"ok": redis_ok, "disabled": settings.DISABLE_REDIS}
        if not redis_ok and not settings.DISABLE_REDIS:
            status = "not_ready"
            http_status = 503
    except Exception as exc:
        checks["redis"] = {"ok": False, "error": str(exc)[:200], "disabled": settings.DISABLE_REDIS}
        if not settings.DISABLE_REDIS:
            status = "not_ready"
            http_status = 503

    # --- Qdrant (optional) ---
    if settings.RAG_ENABLED and settings.QDRANT_URL:
        try:
            from app.rag.qdrant_store import RAGQdrantStore
            store = RAGQdrantStore()
            # A lightweight check: try to get collection info
            from qdrant_client import AsyncQdrantClient
            client = AsyncQdrantClient(
                url=settings.QDRANT_URL,
                api_key=settings.QDRANT_API_KEY or None,
                timeout=3,
            )
            try:
                await client.get_collections()
                checks["qdrant"] = {"ok": True}
            except Exception as exc:
                checks["qdrant"] = {"ok": False, "error": str(exc)[:200]}
                # Qdrant is optional: degrade, don't block readiness
                if status == "ready":
                    status = "degraded"
            finally:
                await client.close()
        except Exception as exc:
            checks["qdrant"] = {"ok": False, "error": str(exc)[:200]}
            if status == "ready":
                status = "degraded"

    return JSONResponse(
        status_code=http_status,
        content={
            "status": status,
            "version": settings.VERSION,
            "environment": settings.ENVIRONMENT,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "checks": checks,
        },
    )
