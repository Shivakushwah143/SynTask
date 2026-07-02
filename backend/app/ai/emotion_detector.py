from __future__ import annotations

from datetime import datetime
from typing import Any

from app.ai.emotion_templates import EmotionTemplates
from app.models.ai_user_state import AIEmotionalState, AIUserState, AIWorkloadMetrics
from app.models.task import TaskStatus
from app.models.user import User


class EmotionDetector:
    STRESS_KEYWORDS = {
        "stressed",
        "stress",
        "overwhelmed",
        "frustrated",
        "urgent",
        "deadline",
        "behind",
        "help",
        "too much",
        "exhausted",
        "burned out",
        "burnout",
    }
    PRODUCTIVE_KEYWORDS = {
        "done",
        "completed",
        "progress",
        "productive",
        "focused",
        "clear",
        "on track",
        "good",
        "great",
        "moving",
    }

    @staticmethod
    def _clamp(value: float) -> float:
        return max(0.0, min(1.0, round(value, 3)))

    @staticmethod
    def _extract_tasks(context: dict[str, Any]) -> list[dict[str, Any]]:
        tasks = list(context.get("recent_tasks") or [])
        if tasks:
            return tasks
        memory = context.get("memory") or {}
        return list(memory.get("active_projects") or [])

    @classmethod
    def _build_workload_metrics(cls, context: dict[str, Any]) -> AIWorkloadMetrics:
        tasks = cls._extract_tasks(context)
        total_tasks = len(tasks)
        overdue_count = sum(1 for task in tasks if task.get("overdue") or task.get("is_overdue"))
        completed_today = sum(1 for task in tasks if task.get("status") == TaskStatus.COMPLETED.value and task.get("completed_at"))
        return AIWorkloadMetrics(
            total_tasks=total_tasks,
            overdue_count=overdue_count,
            completed_today=completed_today,
        )

    @classmethod
    def _infer_mood(
        cls,
        message: str,
        workload_metrics: AIWorkloadMetrics,
    ) -> tuple[str, float, float, float]:
        text = message.lower()
        stress_score = 0.18
        productivity_score = 0.28
        burnout_score = 0.14

        if any(keyword in text for keyword in cls.STRESS_KEYWORDS):
            stress_score += 0.28
            burnout_score += 0.2
        if any(keyword in text for keyword in cls.PRODUCTIVE_KEYWORDS):
            productivity_score += 0.25

        stress_score += min(0.35, workload_metrics.overdue_count * 0.12)
        stress_score += min(0.18, workload_metrics.total_tasks * 0.02)
        productivity_score += min(0.25, workload_metrics.completed_today * 0.08)

        workload_pressure = 0.0
        if workload_metrics.total_tasks:
            workload_pressure = min(1.0, workload_metrics.overdue_count / max(1, workload_metrics.total_tasks))
            burnout_score += workload_pressure * 0.28
            productivity_score += min(0.15, workload_metrics.completed_today / max(1, workload_metrics.total_tasks) * 0.2)

        if burnout_score >= 0.75 or stress_score >= 0.75:
            mood = "burnout_risk"
        elif stress_score >= 0.68:
            mood = "stressed"
        elif workload_pressure >= 0.45:
            mood = "overwhelmed"
        elif productivity_score >= 0.7:
            mood = "productive"
        elif productivity_score >= 0.55:
            mood = "focused"
        else:
            mood = "neutral"

        return mood, cls._clamp(stress_score), cls._clamp(productivity_score), cls._clamp(burnout_score)

    async def detect_and_store(
        self,
        current_user: User,
        *,
        message: str,
        context: dict[str, Any],
    ) -> AIUserState:
        workload_metrics = self._build_workload_metrics(context)
        mood, stress_level, productivity_level, burnout_risk = self._infer_mood(message, workload_metrics)
        emotional_state = AIEmotionalState(
            stress_level=stress_level,
            productivity_level=productivity_level,
            burnout_risk=burnout_risk,
            mood=mood,
        )
        now = datetime.utcnow()

        user_state = await AIUserState.find_one(
            AIUserState.user_id == str(current_user.id),
        )
        if user_state:
            user_state.company_id = current_user.company_id
            user_state.last_updated = now
            user_state.emotional_state = emotional_state
            user_state.workload_metrics = workload_metrics
            await user_state.save()
            return user_state

        user_state = AIUserState(
            user_id=str(current_user.id),
            company_id=current_user.company_id,
            last_updated=now,
            emotional_state=emotional_state,
            workload_metrics=workload_metrics,
        )
        await user_state.insert()
        return user_state

    @staticmethod
    def to_context_payload(user_state: AIUserState) -> dict[str, Any]:
        return {
            "user_id": user_state.user_id,
            "company_id": user_state.company_id,
            "last_updated": user_state.last_updated,
            "emotional_state": user_state.emotional_state.model_dump(),
            "workload_metrics": user_state.workload_metrics.model_dump(),
            "tone_guidance": EmotionTemplates.build_tone_guidance(user_state.emotional_state.model_dump()),
        }
