from __future__ import annotations

from typing import Any, Optional

from app.models.ai_log import AIInteractionLog


class AILogger:
    @staticmethod
    async def log_interaction(
        *,
        feature: str,
        role: str,
        provider: str,
        status: str,
        company_id: Optional[str],
        user_id: Optional[str],
        target_user_id: Optional[str],
        model: Optional[str],
        prompt_version: Optional[str],
        prompt_role_key: Optional[str],
        prompt: Optional[str],
        context: dict[str, Any],
        raw_response: Optional[str],
        parsed_response: Optional[dict[str, Any]],
        latency_ms: Optional[float],
        prompt_tokens: Optional[int],
        completion_tokens: Optional[int],
        total_tokens: Optional[int],
        response_size_bytes: Optional[int],
        fallback_used: bool,
        fallback_chain: list[str],
        executed_actions: list[dict[str, Any]],
        error_message: Optional[str] = None,
    ) -> AIInteractionLog:
        entry = AIInteractionLog(
            feature=feature,
            role=role,
            provider=provider,
            status=status,
            company_id=company_id,
            user_id=user_id,
            target_user_id=target_user_id,
            model=model,
            prompt_version=prompt_version,
            prompt_role_key=prompt_role_key,
            prompt=prompt,
            context=context,
            raw_response=raw_response,
            parsed_response=parsed_response,
            error_message=error_message,
            fallback_chain=fallback_chain,
            executed_actions=executed_actions,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            response_size_bytes=response_size_bytes,
            fallback_used=fallback_used,
        )
        await entry.insert()
        return entry
