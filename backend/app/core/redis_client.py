"""
Redis Client - singleton for token blacklist and caching.

FIX: the original version re-attempted a fresh Redis connection (with a
5s connect timeout) on EVERY request whenever Redis was unreachable,
because `_redis_client` was reset to None on failure instead of being
cached. This file adds a short cooldown so a down/slow Redis is retried
at most once every COOLDOWN_SECONDS, instead of on every API call.

No behavior change when Redis is healthy - it still connects once and
reuses the same client, exactly like before.
"""
import logging
import time
from typing import Optional

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Optional[aioredis.Redis] = None
_last_failed_attempt: float = 0.0
COOLDOWN_SECONDS = 30  # don't retry a dead Redis more than once per 30s


async def get_redis() -> Optional[aioredis.Redis]:
    global _redis_client, _last_failed_attempt

    if _redis_client is not None:
        return _redis_client

    # If we just failed to connect, don't retry immediately on the very
    # next request - this is what was costing every API call ~4-5s.
    now = time.monotonic()
    if now - _last_failed_attempt < COOLDOWN_SECONDS:
        return None

    try:
        candidate = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,  # fail fast instead of hanging 5s
        )
        await candidate.ping()
        _redis_client = candidate
        logger.info("Redis connected successfully")
    except Exception as e:
        logger.warning(f"Redis unavailable: {e}. Token blacklist disabled for {COOLDOWN_SECONDS}s.")
        _redis_client = None
        _last_failed_attempt = now

    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None   