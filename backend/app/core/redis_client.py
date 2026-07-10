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
import asyncio
import time
from typing import Optional

import redis.asyncio as aioredis
from asyncio import TimeoutError as AsyncTimeoutError

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Optional[aioredis.Redis] = None
_last_failed_attempt: float = 0.0
_last_health_check: float = 0.0
_last_health_status: bool = False
COOLDOWN_SECONDS = 30  # don't retry a dead Redis more than once per 30s


def _backoff_delay(attempt: int) -> float:
    return settings.REDIS_RETRY_BASE_DELAY_SECONDS * (2 ** max(attempt - 1, 0))


async def _ping_with_timeout(client: aioredis.Redis) -> bool:
    return await asyncio.wait_for(client.ping(), timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS)


async def get_redis_health(force_refresh: bool = False) -> bool:
    global _last_health_check, _last_health_status

    if settings.DISABLE_REDIS:
        _last_health_status = False
        _last_health_check = time.monotonic()
        return False

    now = time.monotonic()
    if not force_refresh and now - _last_health_check < settings.REDIS_HEALTH_CACHE_SECONDS:
        return _last_health_status

    client = await get_redis()
    if not client:
        _last_health_status = False
        _last_health_check = now
        return False

    try:
        _last_health_status = await _ping_with_timeout(client)
    except (AsyncTimeoutError, Exception) as exc:
        logger.warning("Redis health check failed", extra={"error": str(exc)})
        _last_health_status = False
    _last_health_check = now
    return _last_health_status


async def get_redis() -> Optional[aioredis.Redis]:
    global _redis_client, _last_failed_attempt

    if settings.DISABLE_REDIS:
        return None

    if _redis_client is not None:
        return _redis_client

    # If we just failed to connect, don't retry immediately on the very
    # next request - this is what was costing every API call ~4-5s.
    now = time.monotonic()
    if now - _last_failed_attempt < COOLDOWN_SECONDS:
        return None

    try:
        last_error: Exception | None = None
        for attempt in range(1, settings.REDIS_RETRY_ATTEMPTS + 1):
            try:
                candidate = aioredis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=settings.REDIS_CONNECT_TIMEOUT_SECONDS,
                    socket_timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS,
                )
                await _ping_with_timeout(candidate)
                _redis_client = candidate
                logger.info("Redis connected successfully")
                break
            except Exception as exc:
                last_error = exc
                if attempt >= settings.REDIS_RETRY_ATTEMPTS:
                    raise
                await asyncio.sleep(_backoff_delay(attempt))
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
