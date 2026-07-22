from __future__ import annotations

import time
from datetime import datetime
from uuid import uuid4
from typing import Optional

from app.ai.context_builder import ContextBuilder
from app.ai.emotion_detector import EmotionDetector
from app.ai.prompt_manager import PromptManager
from app.ai.provider import AIProvider
from app.ai.providers.groq import GroqProvider
from app.ai.providers.openai import OpenAIProvider
from app.ai.response_parser import ResponseParser
from app.ai.role_engine import RoleEngine
from app.core.config import settings
from app.core.clock import utc_now
from app.models.user import User
from app.schemas.ai import (
    TaskBreakdownLLMResponse,
    TaskBreakdownRequest,
    TaskBreakdownResponse,
    TaskBreakdownStep,
)


class TaskBreakdownAgent:
    def __init__(
        self,
        provider: Optional[AIProvider] = None,
        prompt_manager: Optional[PromptManager] = None,
        role_engine: Optional[RoleEngine] = None,
        emotion_detector: Optional[EmotionDetector] = None,
    ) -> None:
        self.prompt_manager = prompt_manager or PromptManager()
        self.role_engine = role_engine or RoleEngine()
        self.response_parser = ResponseParser()
        self.emotion_detector = emotion_detector or EmotionDetector()
        self.provider = provider or self._build_provider()

    def _build_provider(self) -> AIProvider:
        provider_name = settings.AI_PROVIDER.lower().strip()
        if provider_name == "openai":
            return OpenAIProvider()
        return GroqProvider()

    @staticmethod
    def _build_fallback_steps(task_title: str, task_description: str | None, max_steps: int) -> list[TaskBreakdownStep]:
        description = task_description or task_title
        base_steps = [
            ("Clarify scope", f"Define what success looks like for {description}.", 20),
            ("Inspect current state", "Review logs, current behavior, and the affected flow.", 30),
            ("Implement the fix", "Make the smallest safe change that resolves the core issue.", 60),
            ("Validate the change", "Run targeted tests and confirm the issue is resolved.", 30),
            ("Release and monitor", "Deploy to the next environment and watch for regressions.", 15),
        ]
        steps: list[TaskBreakdownStep] = []
        for title, step_description, minutes in base_steps[:max_steps]:
            steps.append(
                TaskBreakdownStep(
                    title=title,
                    description=step_description,
                    estimated_minutes=minutes,
                    dependencies=[],
                    status="pending",
                )
            )
        return steps

    async def generate(
        self,
        current_user: User,
        request: TaskBreakdownRequest,
    ) -> TaskBreakdownResponse:
        task_id = request.task_id or str(uuid4())
        context = await ContextBuilder.build_task_breakdown_agent_context(
            current_user=current_user,
            task_title=request.task_title,
            task_description=request.task_description,
            max_steps=request.max_steps,
        )
        resolution = self.role_engine.resolve(current_user)

        user_state = None
        try:
            user_state = await self.emotion_detector.detect_and_store(
                current_user,
                message=request.task_title if request.task_title else (request.task_description or ""),
                context=context,
            )
        except Exception:
            user_state = None

        if user_state:
            context["emotion"] = self.emotion_detector.to_context_payload(user_state)

        prompt_schema = TaskBreakdownLLMResponse.model_json_schema()
        prompt_package = self.prompt_manager.render_feature_prompt(
            resolution,
            feature_name="task_breakdown",
            context=context,
            output_schema=prompt_schema,
        )

        provider_name = settings.AI_PROVIDER.lower().strip()
        model_name = settings.AI_MODEL_OPENAI if provider_name == "openai" else settings.AI_MODEL_GROQ
        started_at = time.perf_counter()

        try:
            result = await self.provider.generate(
                prompt=prompt_package.user_prompt,
                context=context,
                options={
                    "system_prompt": prompt_package.system_prompt,
                    "max_tokens": settings.AI_MAX_TOKENS,
                    "temperature": settings.AI_TEMPERATURE,
                    "response_format": {"type": "json_object"},
                },
            )
            model_name = result.model
            parsed = self.response_parser.parse_json_model(result.content, TaskBreakdownLLMResponse)
            response = TaskBreakdownResponse(
                task_id=parsed.task_id or task_id,
                task_title=parsed.task_title or request.task_title,
                steps=parsed.steps,
                source="llm",
                provider=provider_name,
                model=result.model,
                role=resolution.role_key,
                prompt_version=prompt_package.prompt_version,
                fallback_chain=list(prompt_package.fallback_chain),
                fallback_used=prompt_package.fallback_used,
                generated_at=utc_now(),
                context={
                    **context,
                    "prompt_file": prompt_package.prompt_file,
                    "prompt_role_key": prompt_package.prompt_role_key,
                    "prompt_version": prompt_package.prompt_version,
                    "role_resolution": {
                        "role_key": prompt_package.role_key,
                        "prompt_role_key": prompt_package.prompt_role_key,
                        "fallback_chain": prompt_package.fallback_chain,
                        "fallback_used": prompt_package.fallback_used,
                        "fallback_reason": prompt_package.fallback_reason,
                    },
                },
            )
            return response
        except Exception as error:
            steps = self._build_fallback_steps(request.task_title, request.task_description, request.max_steps)
            return TaskBreakdownResponse(
                task_id=task_id,
                task_title=request.task_title,
                steps=steps,
                source="fallback",
                provider=provider_name,
                model=model_name,
                role=resolution.role_key,
                prompt_version=prompt_package.prompt_version,
                fallback_chain=list(prompt_package.fallback_chain),
                fallback_used=True,
                generated_at=utc_now(),
                context={
                    **context,
                    "error": str(error),
                    "prompt_file": prompt_package.prompt_file,
                    "prompt_role_key": prompt_package.prompt_role_key,
                },
            )
