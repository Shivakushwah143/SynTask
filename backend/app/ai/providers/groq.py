from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import Any

import httpx

from app.ai.provider import AIProvider, AIProviderResult, ToolCall
from app.ai.providers.context_envelope import provider_context_message
from app.ai.providers.http_client import close_shared_clients, get_shared_client
from app.core.config import settings
from app.core.json_safe import to_json_safe

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LLM-span helpers (observability) — provider-neutral, trace-context aware
# ---------------------------------------------------------------------------


def _llm_span(model: str, *, streaming: bool = False, tool_schema_count: int = 0):
    """Open one LLM span on the current trace, if any (never raises)."""
    from app.ai.observability import tracer as ai_tracer

    ctx = ai_tracer.get_current_trace()
    if ctx is None or not ai_tracer.telemetry_enabled():
        return None
    ctx.llm_call_seq += 1
    attrs: dict[str, Any] = {"model": model, "streaming": streaming}
    if tool_schema_count:
        attrs["tool_schema_count"] = tool_schema_count
    return ai_tracer.start_span("LLM", f"groq_call_{ctx.llm_call_seq}", attrs=attrs)


def _end_llm_span(span, result=None, exc: Exception | None = None, extra: dict[str, Any] | None = None):
    """Close an LLM span with usage/error metadata (never raises)."""
    from app.ai.observability import tracer as ai_tracer

    if span is None:
        return
    if exc is not None:
        error_type, message = ai_tracer.classify_span_error(exc)
        if extra is None:
            extra = {}
        # Rate-limit/timeout error classes are surfaced on the span as counts
        # so provider metrics can aggregate 429/400/timeout/retry rates.
        if error_type == "RATE_LIMIT":
            extra["429_count"] = extra.get("429_count", 0) + 1
        elif error_type == "GROQ_400":
            extra["400_count"] = extra.get("400_count", 0) + 1
        elif error_type == "TIMEOUT":
            extra["timeout_count"] = extra.get("timeout_count", 0) + 1
        else:
            extra["provider_error_count"] = extra.get("provider_error_count", 0) + 1
        ai_tracer.end_span(span, status="FAILED", error_type=error_type, error_message=message, attrs=extra or None)
        return
    attrs: dict[str, Any] = {**(extra or {})}
    if result is not None:
        attrs.update(
            {
                "model": getattr(result, "model", None) or "",
                "prompt_tokens": getattr(result, "prompt_tokens", None) or 0,
                "completion_tokens": getattr(result, "completion_tokens", None) or 0,
                "total_tokens": getattr(result, "total_tokens", None) or 0,
                "tool_calls": len(getattr(result, "tool_calls", None) or []),
                "finish_reason": getattr(result, "finish_reason", None),
            }
        )
    ai_tracer.end_span(span, attrs=attrs)


def _telemetry_snapshot() -> dict[str, int]:
    """Snapshot of gateway error counters (to compute per-call deltas)."""
    return {
        "total_429": _telemetry["total_429"],
        "total_400": _telemetry["total_400"],
        "total_retries": _telemetry["total_retries"],
    }


def _telemetry_delta(start: dict[str, int]) -> dict[str, int]:
    return {
        "429_count": max(0, _telemetry["total_429"] - start.get("total_429", 0)),
        "400_count": max(0, _telemetry["total_400"] - start.get("total_400", 0)),
        "retry_count": max(0, _telemetry["total_retries"] - start.get("total_retries", 0)),
    }


class Groq400Error(Exception):
    """Structured 400 error from the Groq API.

    Carries the parsed error body so callers can distinguish invalid
    tool definitions, malformed JSON, content-policy violations, etc.
    """

    def __init__(
        self,
        *,
        status_code: int = 400,
        message: str = "Bad Request",
        error_type: str | None = None,
        code: str | None = None,
        failed_generation: str | None = None,
        raw_body: dict[str, Any] | None = None,
    ):
        self.status_code = status_code
        self.message = message
        self.error_type = error_type
        self.code = code
        self.failed_generation = failed_generation
        self.raw_body = raw_body or {}
        super().__init__(f"Groq 400: {message} (type={error_type}, code={code})")


# ── Telemetry counters (in-process; shared across the event loop) ─────────
_telemetry_lock = asyncio.Lock() if hasattr(asyncio, "Lock") else None
_telemetry: dict[str, Any] = {
    "total_calls": 0,
    "total_429": 0,
    "total_400": 0,
    "total_retries": 0,
    "total_tokens": 0,
    "last_429_at": None,
}


def get_groq_telemetry() -> dict[str, Any]:
    """Return a snapshot of Groq gateway telemetry."""
    return dict(_telemetry)


async def _share_rate_limit_state(delay: float) -> None:
    """Push rate-limit cooldown to Redis so other workers avoid the API."""
    try:
        from app.core.redis_client import get_redis
        redis = await get_redis()
        if redis:
            await redis.setex("groq:rate_limited_until", int(delay) + 1, str(time.monotonic() + delay))
    except Exception:
        pass  # best-effort


async def _check_rate_limit_cooldown() -> float | None:
    """If Redis reports an active rate-limit window, return the remaining delay."""
    try:
        from app.core.redis_client import get_redis
        redis = await get_redis()
        if redis:
            raw = await redis.get("groq:rate_limited_until")
            if raw:
                return max(0.0, float(raw) - time.monotonic())
    except Exception:
        pass
    return None


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

        span = _llm_span(payload["model"])
        _tele = _telemetry_snapshot()
        try:
            data = await self._post(payload)
            result = self._parse_result(data, payload["model"])
        except Exception as exc:
            _end_llm_span(span, exc=exc, extra=_telemetry_delta(_tele))
            raise
        _end_llm_span(span, result=result, extra=_telemetry_delta(_tele))
        return result

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

        span = _llm_span(payload["model"], tool_schema_count=len(payload.get("tools") or []))
        _tele = _telemetry_snapshot()
        try:
            data = await self._post(payload)
            result = self._parse_result(data, payload["model"])
        except Exception as exc:
            _end_llm_span(span, exc=exc, extra=_telemetry_delta(_tele))
            raise
        _end_llm_span(span, result=result, extra=_telemetry_delta(_tele))
        return result

    async def generate_with_tools_stream(
        self,
        prompt: str,
        context: dict[str, Any],
        tools: list[dict[str, Any]],
        options: dict[str, Any] | None = None,
    ) -> Any:
        """Stream a tool-calling completion (SSE) as an async generator.

        Records one ``LLM`` span per call when a trace is active; usage/token
        metadata is attached when the final ``complete`` event is emitted.
        """
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not configured")
        opts = options or {}
        model = opts.get("model") or settings.HR_AGENT_MODEL or settings.AI_MODEL_GROQ
        span = _llm_span(model, streaming=True, tool_schema_count=len(tools or []))
        _tele = _telemetry_snapshot()
        try:
            async for ev in self._generate_with_tools_stream_impl(
                prompt=prompt, context=context, tools=tools, options=options
            ):
                if span is not None and ev.get("type") == "complete":
                    usage = ev.get("usage") or {}
                    span.safe_attributes.update(
                        {
                            "model": ev.get("model") or model,
                            "prompt_tokens": usage.get("prompt_tokens") or 0,
                            "completion_tokens": usage.get("completion_tokens") or 0,
                            "total_tokens": usage.get("total_tokens") or 0,
                            "tool_calls": len((ev.get("message") or {}).get("tool_calls") or []),
                            "finish_reason": ev.get("finish_reason"),
                        }
                    )
                yield ev
        except Exception as exc:
            _end_llm_span(span, exc=exc, extra=_telemetry_delta(_tele))
            raise
        else:
            _end_llm_span(span, extra=_telemetry_delta(_tele))

    async def _generate_with_tools_stream_impl(
        self,
        prompt: str,
        context: dict[str, Any],
        tools: list[dict[str, Any]],
        options: dict[str, Any] | None = None,
    ) -> Any:
        """Stream a tool-calling completion (SSE) as an async generator.

        Yields dict events:
          {"type": "content", "text": <delta>}            — answer token delta
          {"type": "tool_call_delta", ...}                — internal accumulation only
          {"type": "complete", "message": {...}}         — final assembled message

        Tool-call argument deltas are accumulated internally into a single
        OpenAI-compatible ``message.tool_calls`` payload (same shape as
        ``_parse_result``) so callers never handle raw argument fragments.
        Retries on 429 and structured 400 handling mirror ``_post``.
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
            "stream": True,
        }

        timeout = httpx.Timeout(settings.AI_TIMEOUT)
        cooldown = await _check_rate_limit_cooldown()
        if cooldown and cooldown > 0:
            logger.info("Groq rate-limit cooldown active — waiting %.1fs", cooldown)
            await asyncio.sleep(cooldown)

        # Shared keep-alive client — avoids a fresh TCP+TLS handshake per call.
        client = get_shared_client(timeout=timeout)

        last_exc: Exception | None = None
        for attempt in range(self._MAX_RETRIES):
            _telemetry["total_calls"] += 1
            try:
                async with client.stream(
                    "POST",
                    self.base_url,
                    headers={
                        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    content=json.dumps(to_json_safe(payload)),
                ) as response:
                    if response.status_code == 429:
                        _telemetry["total_429"] += 1
                        _telemetry["last_429_at"] = time.time()
                        retry_after = response.headers.get("Retry-After")
                        delay = (
                            min(float(retry_after), 30)
                            if retry_after and retry_after.isdigit()
                            else min(self._BASE_DELAY * (2 ** attempt) + random.uniform(0, 1), 30)
                        )
                        logger.warning("Groq rate-limited (429) on attempt %d/%d — retrying in %.1fs", attempt + 1, self._MAX_RETRIES, delay)
                        await _share_rate_limit_state(delay)
                        _telemetry["total_retries"] += 1
                        await asyncio.sleep(delay)
                        last_exc = httpx.HTTPStatusError("429 Too Many Requests", request=response.request, response=response)
                        continue
                    if response.status_code == 400:
                        _telemetry["total_400"] += 1
                        body = self._parse_400_body(response)
                        raise Groq400Error(
                            status_code=400,
                            message=body.get("message", "Bad Request"),
                            error_type=body.get("type"),
                            code=body.get("code"),
                            failed_generation=body.get("failed_generation"),
                            raw_body=body,
                        )
                    if response.status_code >= 400:
                        response.raise_for_status()

                    # ── Accumulate streamed deltas ────────────────────────
                    content_parts: list[str] = []
                    tool_calls: dict[int, dict[str, Any]] = {}
                    finish_reason: str | None = None
                    model: str = payload["model"]
                    usage: dict[str, Any] = {}
                    delivered_content = False

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        raw = line[len("data:"):].strip()
                        if raw == "[DONE]":
                            break
                        try:
                            chunk = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        model = chunk.get("model") or model
                        if chunk.get("usage"):
                            usage = chunk["usage"]
                        choice = (chunk.get("choices") or [{}])[0]
                        delta = choice.get("delta") or {}

                        delta_content = delta.get("content")
                        if delta_content:
                            content_parts.append(delta_content)
                            delivered_content = True
                            yield {"type": "content", "text": delta_content}

                        for raw_tc in delta.get("tool_calls") or []:
                            idx = int(raw_tc.get("index", 0))
                            slot = tool_calls.setdefault(
                                idx,
                                {"id": "", "name": "", "arguments": ""},
                            )
                            if raw_tc.get("id"):
                                slot["id"] = raw_tc["id"]
                            func = raw_tc.get("function") or {}
                            if func.get("name"):
                                slot["name"] = func["name"]
                            if func.get("arguments"):
                                slot["arguments"] += func["arguments"]
                            yield {
                                "type": "tool_call_delta",
                                "index": idx,
                                "name": slot.get("name"),
                            }

                        if choice.get("finish_reason"):
                            finish_reason = choice["finish_reason"]

                    # Assemble OpenAI-compatible message
                    parsed_tool_calls: list[ToolCall] = []
                    for idx in sorted(tool_calls):
                        slot = tool_calls[idx]
                        raw_args = slot.get("arguments") or "{}"
                        try:
                            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                        except (json.JSONDecodeError, TypeError):
                            args = {"_raw": raw_args}
                        parsed_tool_calls.append(
                            ToolCall(id=slot.get("id") or "", name=slot.get("name") or "", arguments=args)
                        )

                    _telemetry["total_tokens"] += usage.get("total_tokens") or 0
                    yield {
                        "type": "complete",
                        "message": {
                            "content": "".join(content_parts),
                            "tool_calls": parsed_tool_calls,
                        },
                        "finish_reason": finish_reason,
                        "model": model,
                        "usage": usage,
                    }
                    return
            except Groq400Error:
                raise
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if response is not None and response.status_code == 429:
                    continue
                raise

        if last_exc:
            raise last_exc
        raise RuntimeError("Groq API request failed after retries")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    _MAX_RETRIES = 3
    _BASE_DELAY = 2.0  # seconds

    async def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        timeout = httpx.Timeout(settings.AI_TIMEOUT)
        last_exc: Exception | None = None

        # Check if another worker already hit a rate-limit window
        cooldown = await _check_rate_limit_cooldown()
        if cooldown and cooldown > 0:
            logger.info("Groq rate-limit cooldown active — waiting %.1fs", cooldown)
            await asyncio.sleep(cooldown)

        # Shared keep-alive client — avoids a fresh TCP+TLS handshake per call
        # (agent loops make 2-3 sequential calls per request).
        client = get_shared_client(timeout=timeout)

        for attempt in range(self._MAX_RETRIES):
            _telemetry["total_calls"] += 1
            response = await client.post(
                self.base_url,
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                content=json.dumps(to_json_safe(payload)),
            )

            if response.status_code == 429:
                _telemetry["total_429"] += 1
                _telemetry["last_429_at"] = time.time()
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
                await _share_rate_limit_state(delay)
                _telemetry["total_retries"] += 1
                await asyncio.sleep(delay)
                continue

            if response.status_code == 400:
                _telemetry["total_400"] += 1
                body = self._parse_400_body(response)
                logger.error(
                    "Groq 400 Bad Request: %s | model=%s | tool_count=%d",
                    body.get("message", "unknown"),
                    payload.get("model", "?"),
                    len(payload.get("tools") or []),
                )
                # 400 is not retryable — raise immediately
                raise Groq400Error(
                    status_code=400,
                    message=body.get("message", "Bad Request"),
                    error_type=body.get("type"),
                    code=body.get("code"),
                    failed_generation=body.get("failed_generation"),
                    raw_body=body,
                )

            response.raise_for_status()
            data = response.json()
            # Track tokens
            usage = data.get("usage") or {}
            _telemetry["total_tokens"] += usage.get("total_tokens") or 0
            return data

        # All retries exhausted
        if last_exc:
            raise last_exc
        raise RuntimeError("Groq API request failed after retries")

    @staticmethod
    def _parse_400_body(response: httpx.Response) -> dict[str, Any]:
        """Safely extract structured error details from a 400 response body."""
        try:
            body = response.json()
        except Exception:
            body = {"message": response.text[:500]}
        return {
            "message": body.get("error", {}).get("message") or body.get("message") or str(body),
            "type": body.get("error", {}).get("type"),
            "code": body.get("error", {}).get("code"),
            "failed_generation": body.get("error", {}).get("failed_generation"),
        }

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
