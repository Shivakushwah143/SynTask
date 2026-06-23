from __future__ import annotations

import json
import math
import time
from datetime import date, datetime
from typing import Any, Optional

from app.ai.context_builder import ContextBuilder
from app.ai.logger import AILogger
from app.ai.prompt_manager import PromptManager
from app.ai.provider import AIProvider
from app.ai.providers.groq import GroqProvider
from app.ai.providers.openai import OpenAIProvider
from app.ai.response_parser import ResponseParser
from app.ai.role_engine import RoleEngine, RoleResolution
from app.ai.tool_executor import ToolExecutor
from app.core.config import settings
from app.models.task import TaskStatus
from app.models.user import User, UserRole
from app.schemas.ai import (
    AIDailyBlock,
    AILogListItem,
    AIChatLLMResponse,
    AIChatRequest,
    AIChatResponse,
    AIInsightTaskItem,
    AITaskPrioritizationLLMResponse,
    AITaskPrioritizationRequest,
    AITaskPrioritizationResponse,
)


class AIService:
    def __init__(
        self,
        provider: Optional[AIProvider] = None,
        prompt_manager: Optional[PromptManager] = None,
        role_engine: Optional[RoleEngine] = None,
        tool_executor: Optional[ToolExecutor] = None,
    ) -> None:
        self.prompt_manager = prompt_manager or PromptManager()
        self.role_engine = role_engine or RoleEngine()
        self.tool_executor = tool_executor or ToolExecutor()
        self.response_parser = ResponseParser()
        self.provider = provider or self._build_provider()

    def _build_provider(self) -> AIProvider:
        provider_name = settings.AI_PROVIDER.lower().strip()
        if provider_name == "openai":
            return OpenAIProvider()
        return GroqProvider()

    @staticmethod
    def _task_score(task: dict[str, Any], for_date: date) -> int:
        score = {
            "critical": 45,
            "high": 35,
            "medium": 25,
            "low": 15,
        }.get((task.get("priority") or "medium").lower(), 20)

        if task.get("overdue"):
            score += 35
        elif task.get("days_until_due") is not None:
            days = task["days_until_due"]
            if days <= 0:
                score += 30
            elif days <= 2:
                score += 24
            elif days <= 5:
                score += 16
            elif days <= 7:
                score += 8

        if task.get("status") == TaskStatus.IN_REVIEW.value:
            score += 8
        elif task.get("status") == TaskStatus.IN_PROGRESS.value:
            score += 5

        if task.get("estimated_hours") is not None and float(task["estimated_hours"]) <= 2:
            score += 4

        if task.get("department"):
            score += 2

        return max(0, min(100, int(score)))

    @staticmethod
    def _build_reason(task: dict[str, Any]) -> str:
        if task.get("overdue"):
            return "Task is overdue and should be handled first."
        if task.get("days_until_due") is not None:
            if task["days_until_due"] <= 1:
                return "Task is due imminently."
            if task["days_until_due"] <= 3:
                return "Task is due soon."
        if task.get("status") == TaskStatus.IN_REVIEW.value:
            return "Task is in review and may unblock downstream work."
        return "Task has the strongest urgency and impact signal."

    @staticmethod
    def _build_action(task: dict[str, Any]) -> str:
        if task.get("overdue"):
            return "Resolve the blocker or move this to the top of your list."
        if task.get("days_until_due") is not None and task["days_until_due"] <= 2:
            return "Start this before lunch and finish the most critical part today."
        return "Progress the next visible milestone and update status at completion."

    @staticmethod
    def _build_chat_message(context: dict[str, Any], message: str) -> str:
        first_name = context["generated_for"].get("first_name") or context["generated_for"].get("full_name") or "there"
        intent = context.get("intent", "general")
        task_count = context.get("task_count", 0)
        ticket_count = context.get("ticket_count", 0)

        greeting = f"Good morning, {first_name}." if any(word in message.lower() for word in ["morning", "hello", "hi", "hey"]) else f"{first_name},"
        if intent == "tasks" and task_count:
            return f"{greeting} You have {task_count} relevant tasks in context. I would start with the highest-priority items and then block time for the remaining work."
        if intent == "tickets" and ticket_count:
            return f"{greeting} You have {ticket_count} relevant tickets in context. I would review the oldest or highest-priority ones first and then reply with clear next steps."
        if intent == "team":
            return f"{greeting} Here is the team view from your verified context. Focus on workload balance, blockers, and who needs follow-up today."
        if intent == "reporting":
            return f"{greeting} Here is the operational summary from your verified context. Focus on trends, blockers, and any risks that need escalation."
        return f"{greeting} I reviewed your verified context and can help with the next best action based on your current work."

    @staticmethod
    def _build_chat_suggested_actions(context: dict[str, Any]) -> list[dict[str, Any]]:
        actions: list[dict[str, Any]] = []
        if context.get("task_count", 0):
            actions.append(
                {
                    "label": "Open task priorities",
                    "type": "navigate",
                    "payload": {"path": "/ai-prioritization"},
                }
            )
        if context.get("ticket_count", 0):
            actions.append(
                {
                    "label": "Review tickets",
                    "type": "navigate",
                    "payload": {"path": "/tickets"},
                }
            )
        if context.get("access_scope") in {"team", "company", "platform"}:
            actions.append(
                {
                    "label": "View reports",
                    "type": "navigate",
                    "payload": {"path": "/reports"},
                }
            )
        return actions[:3]

    def _build_chat_fallback_response(
        self,
        context: dict[str, Any],
        resolution: RoleResolution,
        request: AIChatRequest,
    ) -> AIChatResponse:
        message = self._build_chat_message(context, request.message)
        suggested_actions = self._build_chat_suggested_actions(context)
        return AIChatResponse(
            message=message,
            suggested_actions=suggested_actions,
            actions=[],
            source="fallback",
            provider=settings.AI_PROVIDER.lower().strip(),
            model=settings.AI_MODEL_OPENAI if settings.AI_PROVIDER.lower().strip() == "openai" else settings.AI_MODEL_GROQ,
            role=resolution.role_key,
            prompt_version=resolution.prompt_version,
            prompt_role_key=f"chat-{resolution.role_key}",
            fallback_chain=list(resolution.fallback_chain),
            fallback_used=resolution.fallback_used,
            generated_at=datetime.utcnow(),
            context=context,
        )

    def _build_fallback_response(
        self,
        context: dict[str, Any],
        resolution: RoleResolution,
    ) -> AITaskPrioritizationResponse:
        generated_for = context["generated_for"]
        tasks = list(context.get("tasks") or [])
        for_date = date.fromisoformat(context["window"]["for_date"])

        scored_tasks = []
        for task in tasks:
            scored_tasks.append(
                {
                    **task,
                    "score": self._task_score(task, for_date),
                    "reason": self._build_reason(task),
                    "recommended_action": self._build_action(task),
                }
            )

        scored_tasks.sort(
            key=lambda item: (
                -item["score"],
                item.get("days_until_due") is None,
                item.get("days_until_due") or math.inf,
            )
        )
        top_tasks = scored_tasks[: min(len(scored_tasks), 10)]

        breakdown = []
        time_slots = [
            "09:00 - 10:00",
            "10:00 - 11:30",
            "11:30 - 12:30",
            "14:00 - 15:30",
            "15:30 - 17:00",
        ]
        for index, task in enumerate(top_tasks[: len(time_slots)]):
            breakdown.append(
                AIDailyBlock(
                    time_block=time_slots[index],
                    focus=task["title"],
                    task_id=task["id"],
                    task_title=task["title"],
                    rationale=task["reason"],
                )
            )

        if not breakdown:
            breakdown.append(
                AIDailyBlock(
                    time_block="09:00 - 10:00",
                    focus="Review incoming work and plan the day",
                    task_id=None,
                    task_title=None,
                    rationale="No active tasks were found for the requested window.",
                )
            )

        summary = (
            f"Prioritized {len(top_tasks)} tasks for {generated_for['full_name']} "
            f"based on urgency, due dates, and task status."
        )
        risks = [task["title"] for task in top_tasks if task.get("overdue")]
        if not risks and top_tasks:
            risks = [f"Watch {top_tasks[0]['title']} for deadline pressure"]

        return AITaskPrioritizationResponse(
            summary=summary,
            top_priorities=[
                AIInsightTaskItem(
                    task_id=task["id"],
                    title=task["title"],
                    status=task["status"],
                    priority=task["priority"],
                    score=task["score"],
                    reason=task["reason"],
                    recommended_action=task["recommended_action"],
                    due_date=task.get("due_date"),
                    estimated_hours=task.get("estimated_hours"),
                    department=task.get("department"),
                )
                for task in top_tasks
            ],
            daily_breakdown=breakdown,
            risks=risks,
            actions=[],
            source="fallback",
            provider=settings.AI_PROVIDER.lower().strip(),
            model=settings.AI_MODEL_OPENAI if settings.AI_PROVIDER.lower().strip() == "openai" else settings.AI_MODEL_GROQ,
            role=resolution.role_key,
            prompt_version=resolution.prompt_version,
            fallback_chain=list(resolution.fallback_chain),
            fallback_used=resolution.fallback_used,
            generated_at=datetime.utcnow(),
            context=context,
        )

    async def generate_task_prioritization(
        self,
        current_user: User,
        request: AITaskPrioritizationRequest,
    ) -> AITaskPrioritizationResponse:
        target_user = current_user
        if request.target_user_id and request.target_user_id != str(current_user.id):
            target_user = await User.get(request.target_user_id)
            if not target_user:
                raise ValueError("Target user not found")
            if current_user.role not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN]:
                raise ValueError("Not allowed to generate prioritization for another user")
            if current_user.role != UserRole.SUPER_ADMIN and target_user.company_id != current_user.company_id:
                raise ValueError("Target user must belong to the same company")

        context = await ContextBuilder.build_task_prioritization_context(
            current_user=current_user,
            target_user=target_user,
            for_date=request.for_date,
            limit=request.limit,
            include_completed=request.include_completed,
        )

        persona_user = target_user or current_user
        resolution = self.role_engine.resolve(persona_user)
        prompt_schema = AITaskPrioritizationLLMResponse.model_json_schema()
        prompt_package = self.prompt_manager.render_role_prompt(
            resolution,
            feature_name="task_prioritization",
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
                },
            )
            model_name = result.model
            parsed = self.response_parser.parse_json_model(
                result.content,
                AITaskPrioritizationLLMResponse,
            )
            action_results = await self.tool_executor.execute_many(parsed.actions)
            executed_actions = [
                {
                    "tool": item.tool_name,
                    "success": item.success,
                    "result": item.result,
                }
                for item in action_results
            ]
            response_data = parsed.model_dump()
            response_data["actions"] = parsed.actions
            response = AITaskPrioritizationResponse(
                **response_data,
                source="llm",
                provider=provider_name,
                model=result.model,
                role=resolution.role_key,
                prompt_version=prompt_package.prompt_version,
                fallback_chain=list(prompt_package.fallback_chain),
                fallback_used=prompt_package.fallback_used,
                generated_at=datetime.utcnow(),
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
                    "executed_actions": executed_actions,
                },
            )

            await AILogger.log_interaction(
                feature="task_prioritization",
                role=resolution.role_key,
                provider=provider_name,
                status="success",
                company_id=current_user.company_id,
                user_id=str(current_user.id),
                target_user_id=str(target_user.id),
                model=result.model,
                prompt_version=prompt_package.prompt_version,
                prompt_role_key=prompt_package.prompt_role_key,
                prompt=prompt_package.user_prompt,
                context=context,
                raw_response=result.content,
                parsed_response=response.model_dump(),
                latency_ms=round((time.perf_counter() - started_at) * 1000, 2),
                prompt_tokens=result.prompt_tokens,
                completion_tokens=result.completion_tokens,
                total_tokens=result.total_tokens,
                response_size_bytes=len(result.content.encode("utf-8")),
                fallback_used=prompt_package.fallback_used,
                fallback_chain=list(prompt_package.fallback_chain),
                executed_actions=executed_actions,
            )
            return response
        except Exception as error:
            fallback = self._build_fallback_response(context, resolution)
            await AILogger.log_interaction(
                feature="task_prioritization",
                role=resolution.role_key,
                provider=provider_name,
                status="fallback",
                company_id=current_user.company_id,
                user_id=str(current_user.id),
                target_user_id=str(target_user.id),
                model=model_name,
                prompt_version=prompt_package.prompt_version,
                prompt_role_key=prompt_package.prompt_role_key,
                prompt=prompt_package.user_prompt,
                context=context,
                raw_response=None,
                parsed_response=fallback.model_dump(),
                latency_ms=round((time.perf_counter() - started_at) * 1000, 2),
                prompt_tokens=None,
                completion_tokens=None,
                total_tokens=None,
                response_size_bytes=len(fallback.model_dump_json().encode("utf-8")),
                fallback_used=True,
                fallback_chain=list(prompt_package.fallback_chain),
                executed_actions=[],
                error_message=str(error),
            )
            return fallback

    async def generate_chat_response(
        self,
        current_user: User,
        request: AIChatRequest,
    ) -> AIChatResponse:
        history = [item.model_dump() for item in request.history]
        context = await ContextBuilder.build_chat_context(
            current_user=current_user,
            message=request.message,
            history=history,
        )
        resolution = self.role_engine.resolve(current_user)
        prompt_schema = AIChatLLMResponse.model_json_schema()
        prompt_package = self.prompt_manager.render_chat_prompt(
            resolution,
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
            parsed = self.response_parser.parse_json_model(result.content, AIChatLLMResponse)
            action_results = await self.tool_executor.execute_many(parsed.actions)
            executed_actions = [
                {
                    "tool": item.tool_name,
                    "success": item.success,
                    "result": item.result,
                }
                for item in action_results
            ]
            response = AIChatResponse(
                message=parsed.message,
                suggested_actions=parsed.suggested_actions,
                actions=parsed.actions,
                source="llm",
                provider=provider_name,
                model=result.model,
                role=resolution.role_key,
                prompt_version=prompt_package.prompt_version,
                prompt_role_key=prompt_package.prompt_role_key,
                fallback_chain=list(prompt_package.fallback_chain),
                fallback_used=prompt_package.fallback_used,
                generated_at=datetime.utcnow(),
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
                    "executed_actions": executed_actions,
                },
            )

            await AILogger.log_interaction(
                feature="chat",
                role=resolution.role_key,
                provider=provider_name,
                status="success",
                company_id=current_user.company_id,
                user_id=str(current_user.id),
                target_user_id=None,
                model=result.model,
                prompt_version=prompt_package.prompt_version,
                prompt_role_key=prompt_package.prompt_role_key,
                prompt=prompt_package.user_prompt,
                context=context,
                raw_response=result.content,
                parsed_response=response.model_dump(),
                latency_ms=round((time.perf_counter() - started_at) * 1000, 2),
                prompt_tokens=result.prompt_tokens,
                completion_tokens=result.completion_tokens,
                total_tokens=result.total_tokens,
                response_size_bytes=len(result.content.encode("utf-8")),
                fallback_used=prompt_package.fallback_used,
                fallback_chain=list(prompt_package.fallback_chain),
                executed_actions=executed_actions,
            )
            return response
        except Exception as error:
            fallback = self._build_chat_fallback_response(context, resolution, request)
            await AILogger.log_interaction(
                feature="chat",
                role=resolution.role_key,
                provider=provider_name,
                status="fallback",
                company_id=current_user.company_id,
                user_id=str(current_user.id),
                target_user_id=None,
                model=model_name,
                prompt_version=prompt_package.prompt_version,
                prompt_role_key=prompt_package.prompt_role_key,
                prompt=prompt_package.user_prompt,
                context=context,
                raw_response=None,
                parsed_response=fallback.model_dump(),
                latency_ms=round((time.perf_counter() - started_at) * 1000, 2),
                prompt_tokens=None,
                completion_tokens=None,
                total_tokens=None,
                response_size_bytes=len(fallback.model_dump_json().encode("utf-8")),
                fallback_used=True,
                fallback_chain=list(prompt_package.fallback_chain),
                executed_actions=[],
                error_message=str(error),
            )
            return fallback

    async def list_logs(
        self,
        current_user: User,
        limit: int = 20,
    ) -> list[AILogListItem]:
        from app.models.ai_log import AIInteractionLog

        query: dict[str, Any] = {}
        if current_user.role != UserRole.SUPER_ADMIN:
            query["company_id"] = current_user.company_id
        if current_user.role == UserRole.EMPLOYEE:
            query["user_id"] = str(current_user.id)

        logs = await AIInteractionLog.find(query).sort("-created_at").limit(limit).to_list()
        return [
            AILogListItem(
                id=str(log.id),
                feature=log.feature,
                role=log.role,
                provider=log.provider,
                model=log.model,
                prompt_version=log.prompt_version,
                prompt_role_key=getattr(log, "prompt_role_key", None),
                status=log.status,
                company_id=log.company_id,
                user_id=log.user_id,
                target_user_id=log.target_user_id,
                latency_ms=log.latency_ms,
                fallback_used=log.fallback_used,
                fallback_chain=list(getattr(log, "fallback_chain", []) or []),
                error_message=log.error_message,
                created_at=log.created_at,
            )
            for log in logs
        ]
