from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ValidationError

from app.ai.provider import AIProvider, AIProviderResult
from app.ai.providers.groq import GroqProvider
from app.ai.providers.openai import OpenAIProvider
from app.core.config import settings


PROHIBITED_EXTERNAL_PATTERNS = ("password", "secret", "credential", "protected hr", "ssn", "payroll")


@dataclass
class ProviderPolicy:
    policy_version: str = "provider-router-v1"
    task_preferences: dict[str, list[str]] = field(
        default_factory=lambda: {
            "query_classification": ["groq", "openai"],
            "query_rewriting": ["groq", "openai"],
            "extraction": ["groq", "openai"],
            "summarization": ["groq", "openai"],
            "draft_generation": ["groq", "openai"],
            "complex_reasoning": ["openai", "groq"],
            "schema_repair": ["openai", "groq"],
            "evaluation": ["openai", "groq"],
        }
    )
    disabled_providers: set[str] = field(default_factory=set)
    timeout_seconds: float = 10.0
    retry_attempts: int = 1
    max_tokens_per_run: int = 4000


class ProviderRouterResult(BaseModel):
    run_id: str
    provider: str
    model: str
    content: str
    parsed: dict[str, Any] | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    estimated_cost: float = 0.0
    latency_ms: float
    policy_version: str
    fallback_used: bool = False


class ProviderRouter:
    def __init__(self, *, providers: dict[str, AIProvider] | None = None, policy: ProviderPolicy | None = None) -> None:
        self.providers = providers or {"openai": OpenAIProvider(), "groq": GroqProvider()}
        self.policy = policy or ProviderPolicy()
        self.failures: dict[str, int] = {}

    async def generate(
        self,
        *,
        task_type: str,
        prompt: str,
        context: dict[str, Any],
        output_schema: type[BaseModel] | None = None,
        tenant_policy: dict[str, Any] | None = None,
        risk_level: str = "normal",
        data_sensitivity: str = "internal",
    ) -> ProviderRouterResult:
        self._validate_data(prompt=prompt, context=context, data_sensitivity=data_sensitivity)
        candidates = self._candidates(task_type=task_type, tenant_policy=tenant_policy or {}, risk_level=risk_level)
        errors: list[str] = []
        for index, provider_name in enumerate(candidates):
            provider = self.providers[provider_name]
            attempts = max(1, self.policy.retry_attempts)
            for attempt in range(attempts):
                try:
                    start = time.perf_counter()
                    result = await asyncio.wait_for(
                        provider.generate(prompt, context, {"task_type": task_type, "attempt": attempt + 1}),
                        timeout=self.policy.timeout_seconds,
                    )
                    parsed = self._parse(result, output_schema)
                    latency = (time.perf_counter() - start) * 1000
                    self.failures[provider_name] = 0
                    return ProviderRouterResult(
                        run_id=str(uuid4()),
                        provider=provider_name,
                        model=result.model,
                        content=result.content,
                        parsed=parsed,
                        prompt_tokens=result.prompt_tokens,
                        completion_tokens=result.completion_tokens,
                        total_tokens=result.total_tokens,
                        estimated_cost=self._estimate_cost(provider_name, result),
                        latency_ms=latency,
                        policy_version=self.policy.policy_version,
                        fallback_used=index > 0,
                    )
                except Exception as exc:
                    self.failures[provider_name] = self.failures.get(provider_name, 0) + 1
                    errors.append(f"{provider_name}:{type(exc).__name__}")
                    continue
        raise RuntimeError("No eligible provider succeeded: " + ", ".join(errors))

    def _candidates(self, *, task_type: str, tenant_policy: dict[str, Any], risk_level: str) -> list[str]:
        allowed = tenant_policy.get("allowed_providers")
        preferred = list(self.policy.task_preferences.get(task_type, ["groq", "openai"]))
        if risk_level == "high" and "openai" in preferred:
            preferred = ["openai", *[item for item in preferred if item != "openai"]]
        candidates = [item for item in preferred if item in self.providers and item not in self.policy.disabled_providers]
        if allowed:
            candidates = [item for item in candidates if item in set(allowed)]
        if not candidates:
            raise RuntimeError("No eligible provider for task")
        return candidates

    def _validate_data(self, *, prompt: str, context: dict[str, Any], data_sensitivity: str) -> None:
        payload = f"{prompt} {context}".lower()
        if data_sensitivity in {"protected", "secret"} or any(pattern in payload for pattern in PROHIBITED_EXTERNAL_PATTERNS):
            raise ValueError("Sensitive data cannot be sent to an external provider")
        if len(prompt.split()) > self.policy.max_tokens_per_run:
            raise ValueError("Prompt exceeds provider router token budget")

    def _parse(self, result: AIProviderResult, output_schema: type[BaseModel] | None) -> dict[str, Any] | None:
        if output_schema is None:
            return None
        try:
            return output_schema.model_validate_json(result.content).model_dump()
        except ValidationError:
            raise

    def _estimate_cost(self, provider_name: str, result: AIProviderResult) -> float:
        tokens = result.total_tokens or 0
        rate = 0.000001 if provider_name == "groq" else 0.000005
        return round(tokens * rate, 6)
