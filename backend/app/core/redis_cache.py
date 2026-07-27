import json
from typing import Any, Optional

from app.core.config import settings
from app.core.redis_client import get_redis

async def cache_get(key: str) -> Optional[Any]:
    client = await get_redis()
    if not client:
        return None
    data = await client.get(key)
    return json.loads(data) if data else None

async def cache_set(key: str, value: Any, ttl: int) -> None:
    client = await get_redis()
    if not client:
        return
    await client.set(key, json.dumps(value), ex=ttl)
