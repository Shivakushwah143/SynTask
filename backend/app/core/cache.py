"""
Redis cache helpers for high-frequency read paths.
"""
import json
import logging
from typing import Any, Optional

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)


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
    redis = await get_redis()
    if not redis:
        return
    try:
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)
    except Exception as exc:
        logger.warning(f"Cache delete pattern error [{pattern}]: {exc}")


def dashboard_cache_key(user_id: str, role: str, company_id: Optional[str]) -> str:
    return f"dashboard:stats:{company_id or 'platform'}:{role}:{user_id}"


def user_hierarchy_key(user_id: str) -> str:
    return f"hierarchy:subordinates:{user_id}"


def project_list_key(company_id: str) -> str:
    return f"projects:list:{company_id}"


def company_dashboard_pattern(company_id: str) -> str:
    return f"dashboard:stats:{company_id}:*"
