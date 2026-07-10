import pytest

from app.core import redis_client


class DummyRedis:
    def __init__(self, should_fail=False):
        self.should_fail = should_fail
        self.pings = 0

    async def ping(self):
        self.pings += 1
        if self.should_fail:
            raise RuntimeError("redis down")
        return True


@pytest.mark.asyncio
async def test_get_redis_health_returns_true_when_redis_available(monkeypatch):
    dummy = DummyRedis()
    monkeypatch.setattr(redis_client.settings, "DISABLE_REDIS", False)
    monkeypatch.setattr(redis_client, "_last_health_check", 0.0)
    monkeypatch.setattr(redis_client, "_last_health_status", False)
    monkeypatch.setattr(redis_client, "get_redis", lambda: dummy)

    assert await redis_client.get_redis_health(force_refresh=True) is True
    assert dummy.pings == 1


@pytest.mark.asyncio
async def test_get_redis_health_returns_false_when_redis_unavailable(monkeypatch):
    dummy = DummyRedis(should_fail=True)
    monkeypatch.setattr(redis_client.settings, "DISABLE_REDIS", False)
    monkeypatch.setattr(redis_client, "_last_health_check", 0.0)
    monkeypatch.setattr(redis_client, "_last_health_status", True)
    monkeypatch.setattr(redis_client, "get_redis", lambda: dummy)

    assert await redis_client.get_redis_health(force_refresh=True) is False


@pytest.mark.asyncio
async def test_get_redis_health_uses_cached_result(monkeypatch):
    dummy = DummyRedis()
    monkeypatch.setattr(redis_client.settings, "DISABLE_REDIS", False)
    monkeypatch.setattr(redis_client, "_last_health_check", 9999999999.0)
    monkeypatch.setattr(redis_client, "_last_health_status", True)
    monkeypatch.setattr(redis_client, "get_redis", lambda: dummy)

    assert await redis_client.get_redis_health(force_refresh=False) is True
    assert dummy.pings == 0
