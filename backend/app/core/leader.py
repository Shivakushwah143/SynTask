"""
Single-leader guards for background scheduler loops.

Every API worker starts the same scheduler loops (deadline checker, reminder
scheduler, scheduled-job executor, IMAP sync, HR document expiry). Without a
guard, N workers run N copies of each loop — duplicate reminders, duplicate
deadline pings, duplicate scheduled-job executions. Each loop cycle is gated
behind a short Redis lease so exactly one worker executes it; the lease TTL is
shorter than the loop interval so the winning worker can always re-acquire on
its next cycle, and a crashed leader is automatically released after the TTL.
"""
import logging
from typing import Optional

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)


def leader_key(name: str) -> str:
    return f"leader:{name}"


async def try_acquire_leader(name: str, ttl_seconds: int) -> bool:
    """Atomically acquire the ``name`` lease; True if THIS worker won."""
    redis = await get_redis()
    if not redis:
        # No Redis reachable — assume a single instance / dev mode and let the
        # local loop run (the previous behavior).
        return True
    try:
        return bool(await redis.set(leader_key(name), "1", nx=True, ex=ttl_seconds))
    except Exception as exc:
        logger.warning("Leader lease acquire failed for %s (running locally): %s", name, exc)
        return True
