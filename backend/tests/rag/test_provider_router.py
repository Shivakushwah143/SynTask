from __future__ import annotations

import pytest
from pydantic import BaseModel

from app.ai.provider import AIProvider, AIProviderResult
from app.ai.provider_router import ProviderPolicy, ProviderRouter


class RoutedAnswer(BaseModel):
    answer: str


class FakeProvider(AIProvider):
    def __init__(self, *, name: str, content: str, fail_times: int = 0) -> None:
        self.name = name
        self.content = content
        self.fail_times = fail_times
        self.calls = 0

    async def generate(self, prompt, context, options=None):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise TimeoutError(self.name)
        return AIProviderResult(content=self.content, model=f"{self.name}-model", total_tokens=10)


@pytest.mark.asyncio
async def test_provider_router_prefers_task_provider_and_parses_schema():
    router = ProviderRouter(
        providers={"groq": FakeProvider(name="groq", content='{"answer":"ok"}')},
        policy=ProviderPolicy(task_preferences={"query_rewriting": ["groq"]}),
    )

    result = await router.generate(task_type="query_rewriting", prompt="rewrite", context={}, output_schema=RoutedAnswer)

    assert result.provider == "groq"
    assert result.parsed == {"answer": "ok"}
    assert result.estimated_cost > 0


@pytest.mark.asyncio
async def test_provider_router_retries_then_falls_back():
    router = ProviderRouter(
        providers={
            "groq": FakeProvider(name="groq", content='{"answer":"late"}', fail_times=2),
            "openai": FakeProvider(name="openai", content='{"answer":"fallback"}'),
        },
        policy=ProviderPolicy(task_preferences={"complex_reasoning": ["groq", "openai"]}, retry_attempts=2),
    )

    result = await router.generate(task_type="complex_reasoning", prompt="reason", context={}, output_schema=RoutedAnswer)

    assert result.provider == "openai"
    assert result.fallback_used


@pytest.mark.asyncio
async def test_provider_router_blocks_sensitive_payloads():
    router = ProviderRouter(providers={"groq": FakeProvider(name="groq", content="{}")})

    with pytest.raises(ValueError):
        await router.generate(task_type="summarization", prompt="contains payroll ssn", context={}, data_sensitivity="internal")


def test_provider_router_respects_tenant_allowed_providers():
    router = ProviderRouter(
        providers={"groq": FakeProvider(name="groq", content="{}"), "openai": FakeProvider(name="openai", content="{}")},
        policy=ProviderPolicy(task_preferences={"evaluation": ["groq", "openai"]}),
    )

    assert router._candidates(task_type="evaluation", tenant_policy={"allowed_providers": ["openai"]}, risk_level="normal") == ["openai"]

