"""
Redis cache helpers for high-frequency read paths.
"""

import json
import logging
from typing import Any, Optional

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# Unified prefix for all dashboard related keys
DASHBOARD_KEY_PREFIX = "dashboard:data"


async def cache_get(key: str) -> Optional[Any]:
    redis = await get_redis()
    if not redis:
        return None
    try:
        value = await redis.get(key)
        return json.loads(value) if value else None
    except Exception as exc:
        logger.warning(f"Cache get error [{key}]: {exc}")
        return None


async def cache_set(key: str, value: Any, ttl: int = 300) -> bool:
    redis = await get_redis()
    if not redis:
        return False
    try:
        await redis.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as exc:
        logger.warning(f"Cache set error [{key}]: {exc}")
        return False


async def cache_delete(key: str) -> None:
    redis = await get_redis()
    if not redis:
        return
    try:
        await redis.delete(key)
    except Exception as exc:
        logger.warning(f"Cache delete error [{key}]: {exc}")


async def cache_delete_pattern(pattern: str) -> None:
    """Non‑blocking, cluster‑safe deletion of keys matching a pattern.
    Uses SCAN to iterate and UNLINK for async deletion.
    """
    redis = await get_redis()
    if not redis:
        return
    try:
        cursor = 0
        keys_to_delete = []
        while True:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            keys_to_delete.extend(keys)
            if cursor == 0:
                break
        if keys_to_delete:
            await redis.unlink(*keys_to_delete)
    except Exception as exc:
        logger.warning(f"Cache delete pattern error [{pattern}]: {exc}")


def user_hierarchy_key(user_id: str) -> str:
    return f"hierarchy:subordinates:{user_id}"


def project_list_key(company_id: str) -> str:
    return f"projects:list:{company_id}"


def dashboard_cache_key(user_id: str, role: str, company_id: Optional[str]) -> str:
    """Cache key for the /stats endpoint."""
    return f"{DASHBOARD_KEY_PREFIX}:{company_id or 'platform'}:{role}:{user_id}:stats"


def dashboard_metrics_cache_key(user_id: str, role: str, company_id: Optional[str]) -> str:
    """Cache key for the /metrics endpoint."""
    return f"{DASHBOARD_KEY_PREFIX}:{company_id or 'platform'}:{role}:{user_id}:metrics"


def company_dashboard_pattern(company_id: str) -> str:
    """Matches ALL dashboard keys for a company – both :stats and :metrics."""
    return f"{DASHBOARD_KEY_PREFIX}:{company_id}:*"
