"""
JWT token blacklist using Redis.
Revoked tokens are stored with TTL matching their remaining expiry.
"""
import logging
from datetime import datetime, timezone

from jose import JWTError, jwt

from app.core.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

BLACKLIST_PREFIX = "token_blacklist:"


async def blacklist_token(token: str) -> bool:
    """Add a token to the blacklist. TTL equals remaining token lifetime."""
    redis = await get_redis()
    if not redis:
        logger.warning("Redis unavailable - token blacklist skipped")
        return False

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        exp = payload.get("exp")
        if not exp:
            return False

        ttl = int(exp - datetime.now(timezone.utc).timestamp())
        if ttl <= 0:
            return True

        await redis.setex(f"{BLACKLIST_PREFIX}{token}", ttl, "revoked")
        return True
    except JWTError:
        return False
    except Exception as e:
        logger.error(f"Token blacklist error: {e}")
        return False


async def is_token_blacklisted(token: str) -> bool:
    """Check if a token has been revoked."""
    redis = await get_redis()
    if not redis:
        return False

    try:
        return await redis.exists(f"{BLACKLIST_PREFIX}{token}") > 0
    except Exception as e:
        logger.error(f"Token blacklist check error: {e}")
        return False
