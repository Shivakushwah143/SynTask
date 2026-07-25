from __future__ import annotations

import json
from typing import Any

import httpx

from app.ai.provider import AIProvider, AIProviderResult
from app.ai.providers.context_envelope import provider_context_message
from app.core.config import settings


class OpenAIProvider(AIProvider):
    base_url = "https://api.openai.com/v1/chat/completions"

    async def generate(
        self,
        prompt: str,
        context: dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> AIProviderResult:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured")

        payload = {
            "model": (options or {}).get("model") or settings.AI_MODEL_OPENAI,
            "temperature": (options or {}).get("temperature", settings.AI_TEMPERATURE),
            "max_tokens": (options or {}).get("max_tokens", settings.AI_MAX_TOKENS),
            "messages": [
                {"role": "system", "content": (options or {}).get("system_prompt", "")},
                {"role": "system", "content": provider_context_message(context)},
                {"role": "user", "content": prompt},
            ],
        }
        response_format = (options or {}).get("response_format")
        if response_format:
            payload["response_format"] = response_format

        timeout = httpx.Timeout(settings.AI_TIMEOUT)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                self.base_url,
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                content=json.dumps(payload),
            )
            response.raise_for_status()
            data = response.json()

        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        usage = data.get("usage") or {}

        return AIProviderResult(
            content=message.get("content") or "",
            model=data.get("model") or payload["model"],
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
            raw_response=data,
        )
