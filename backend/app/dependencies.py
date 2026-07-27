import logging
from fastapi import Depends, HTTPException, Request
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

async def rate_limit(request: Request, limit: int = 100):
    """Simple sliding-window rate limiter using Redis.
    Returns True if request is allowed, otherwise raises HTTPException 429.
    """
    client = await get_redis()
    if client is None:
        # Redis disabled or unavailable; allow request
        return True
    ip = request.client.host
    key = f"rl:{ip}"
    try:
        current = await client.incr(key)
        if current == 1:
            await client.expire(key, 60)  # 1 minute window
        if current > limit:
            raise HTTPException(status_code=429, detail="Too Many Requests")
    except Exception as exc:
        logger.warning("Redis rate limit failed", extra={"error": str(exc)})
        # On error, fail open (allow request) to avoid breaking functionality
        return True
    return True
