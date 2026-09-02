from __future__ import annotations

import asyncio
import json
import logging
import random
from typing import Any

import httpx

from app.ai.provider import AIProvider, AIProviderResult, ToolCall
from app.ai.providers.context_envelope import provider_context_message
from app.core.config import settings
from app.core.json_safe import to_json_safe

logger = logging.getLogger(__name__)


class GroqProvider(AIProvider):
    base_url = "https://api.groq.com/openai/v1/chat/completions"

    async def generate(
        self,
        prompt: str,
        context: dict[str, Any],
        options: dict[str, Any] | None = None,
    ) -> AIProviderResult:
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")

        payload = {
            "model": (options or {}).get("model") or settings.AI_MODEL_GROQ,
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

        data = await self._post(payload)
        return self._parse_result(data, payload["model"])

    async def generate_with_tools(
        self,
        prompt: str,
        context: dict[str, Any],
        tools: list[dict[str, Any]],
        options: dict[str, Any] | None = None,
    ) -> AIProviderResult:
        """Generate a response with tool/function calling support.

        ``tools`` must be a list of OpenAI-compatible tool definitions, e.g.::

            [
                {
                    "type": "function",
                    "function": {
                        "name": "search_employees",
                        "description": "Search employees",
                        "parameters": { ... }
                    }
                }
            ]
        """
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")

        opts = options or {}
        messages = list(opts.get("messages") or [])
        if not messages:
            system_prompt = opts.get("system_prompt", "")
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            ctx_msg = provider_context_message(context)
            if ctx_msg:
                messages.append({"role": "system", "content": ctx_msg})
            messages.append({"role": "user", "content": prompt})

        payload = {
            "model": opts.get("model") or settings.HR_AGENT_MODEL or settings.AI_MODEL_GROQ,
            "temperature": opts.get("temperature", 0.1),
            "max_tokens": opts.get("max_tokens", 4096),
            "messages": messages,
            "tools": tools,
            "tool_choice": opts.get("tool_choice", "auto"),
        }

        data = await self._post(payload)
        return self._parse_result(data, payload["model"])

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    _MAX_RETRIES = 3
    _BASE_DELAY = 2.0  # seconds

    async def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        timeout = httpx.Timeout(settings.AI_TIMEOUT)
        last_exc: Exception | None = None

        for attempt in range(self._MAX_RETRIES):
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    self.base_url,
                    headers={
                        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    content=json.dumps(to_json_safe(payload)),
                )

                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    if retry_after and retry_after.isdigit():
                        delay = min(float(retry_after), 30)
                    else:
                        delay = min(
                            self._BASE_DELAY * (2 ** attempt)
                            + random.uniform(0, 1),
                            30,
                        )
                    logger.warning(
                        "Groq rate-limited (429) on attempt %d/%d — retrying in %.1fs",
                        attempt + 1,
                        self._MAX_RETRIES,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue

                response.raise_for_status()
                return response.json()

            # Only store the exception if we didn't get a 429 (we already logged it)
            last_exc = httpx.HTTPStatusError(
                f"HTTP {response.status_code}",
                request=response.request,
                response=response,
            )

        # All retries exhausted
        if last_exc:
            raise last_exc
        raise RuntimeError("Groq API request failed after retries")

    @staticmethod
    def _parse_result(data: dict[str, Any], default_model: str) -> AIProviderResult:
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        usage = data.get("usage") or {}

        # Parse tool calls from the message
        tool_calls: list[ToolCall] = []
        for raw_tc in message.get("tool_calls") or []:
            func = raw_tc.get("function") or {}
            raw_args = func.get("arguments") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            except (json.JSONDecodeError, TypeError):
                args = {"_raw": raw_args}
            tool_calls.append(
                ToolCall(
                    id=raw_tc.get("id") or "",
                    name=func.get("name") or "",
                    arguments=args,
                )
            )

        return AIProviderResult(
            content=message.get("content") or "",
            model=data.get("model") or default_model,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
            raw_response=data,
            tool_calls=tool_calls,
            finish_reason=choice.get("finish_reason"),
        )
