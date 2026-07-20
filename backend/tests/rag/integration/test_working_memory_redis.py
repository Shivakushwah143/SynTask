import os

import pytest
import redis.asyncio as aioredis

from app.core.config import settings
from app.rag.permissions import RAGScope
from app.rag.working_memory import ClientWorkingMemoryUpdate, WorkingMemoryService


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_REDIS_INTEGRATION") != "1",
    reason="Set RUN_REDIS_INTEGRATION=1 with a Redis service container available.",
)


@pytest.mark.asyncio
async def test_real_redis_working_memory_session_lifecycle():
    redis = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
    service = WorkingMemoryService(redis_client=redis)
    scope = RAGScope(company_id="redis-tenant", tenant_id="redis-tenant", user_id="redis-user", role="admin")

    session = await service.create_session(scope=scope, conversation_id="conv-real")
    updated = await service.update_client_state(
        scope=scope,
        session_id=session.session_id,
        update=ClientWorkingMemoryUpdate(conversation_id="conv-real", expected_version=session.version, message={"content": "hello"}),
    )
    loaded = await service.get_session(scope=scope, session_id=session.session_id, conversation_id="conv-real")

    assert loaded is not None
    assert updated.version == 2
    assert loaded.messages[0]["content"] == "hello"

    await service.delete_session(scope=scope, session_id=session.session_id, conversation_id="conv-real")
    assert await service.get_session(scope=scope, session_id=session.session_id, conversation_id="conv-real") is None
    await redis.close()
