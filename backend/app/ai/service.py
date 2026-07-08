from __future__ import annotations

import json
import math
import time
from datetime import date, datetime
from typing import Any, Optional

from app.ai.context_builder import ContextBuilder
from app.ai.emotion_detector import EmotionDetector
from app.ai.emotion_templates import EmotionTemplates
from app.ai.agents.task_breakdown import TaskBreakdownAgent
from app.ai.logger import AILogger
from app.ai.memory import AIMemoryService
from app.ai.prompt_manager import PromptManager
from app.ai.provider import AIProvider
from app.ai.providers.groq import GroqProvider
from app.ai.providers.openai import OpenAIProvider
from app.ai.response_parser import ResponseParser
from app.ai.role_engine import RoleEngine, RoleResolution
from app.ai.tool_executor import ToolExecutor
from app.ai.tools import ToolRegistry, build_default_tool_registry
from app.core.config import settings
from app.models.task import TaskStatus
from app.models.user import User, UserRole
from app.schemas.ai import (
    AIDailyBlock,
    AIDailyReportItem,
    AIDailyReportLLMResponse,
    AIDailyReportRequest,
    AIDailyReportResponse,
    AIDailyReportSection,
    AILogListItem,
    AIChatLLMResponse,
    AIChatRequest,
    AIChatResponse,
    AIInsightTaskItem,
    AITaskBreakdownLLMResponse,
    AITaskBreakdownRequest,
    AITaskBreakdownResponse,
    AITaskBreakdownTaskItem,
    TaskBreakdownRequest,
    TaskBreakdownResponse,
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
        self.memory_service = AIMemoryService()
        self.emotion_detector = EmotionDetector()
        self.task_breakdown_agent = TaskBreakdownAgent(
            provider=provider,
            prompt_manager=self.prompt_manager,
            role_engine=self.role_engine,
            emotion_detector=self.emotion_detector,
        )
        self.provider = provider or self._build_provider()
        self.tool_registry: ToolRegistry = build_default_tool_registry()

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
        emotion = context.get("emotion") or {}
        state = emotion.get("emotional_state") or {}
        guidance = emotion.get("tone_guidance") or {}
        mood = EmotionTemplates.normalize_mood(state.get("mood"))

        greeting = f"Good morning, {first_name}." if any(word in message.lower() for word in ["morning", "hello", "hi", "hey"]) else f"{first_name},"
        if mood in {"burnout_risk", "stressed", "overwhelmed"}:
            if task_count:
                message_text = (
                    f"You have {task_count} relevant tasks in context. "
                    f"Let’s keep this small: start with the most urgent item and avoid adding extra scope."
                )
            elif ticket_count:
                message_text = (
                    f"You have {ticket_count} relevant tickets in context. "
                    f"Let’s keep the workload manageable by handling the oldest or most urgent one first."
                )
            else:
                message_text = "I’ll keep this focused on the smallest useful next step so you can make progress without overload."
            return EmotionTemplates.apply_tone(f"{greeting} {message_text}", state)

        if intent == "tasks" and task_count:
            message_text = f"You have {task_count} relevant tasks in context. I would start with the highest-priority items and then block time for the remaining work."
        elif intent == "tickets" and ticket_count:
            message_text = f"You have {ticket_count} relevant tickets in context. I would review the oldest or highest-priority ones first and then reply with clear next steps."
        elif intent == "team":
            message_text = "Here is the team view from your verified context. Focus on workload balance, blockers, and who needs follow-up today."
        elif intent == "reporting":
            message_text = "Here is the operational summary from your verified context. Focus on trends, blockers, and any risks that need escalation."
        elif mood in {"productive", "focused"}:
            message_text = guidance.get("prefix") or "You are in a good execution rhythm, so I would keep the next step sharp and direct."
        else:
            message_text = "I reviewed your verified context and can help with the next best action based on your current work."
        return EmotionTemplates.apply_tone(f"{greeting} {message_text}", state)

    @staticmethod
    def _build_chat_suggested_actions(context: dict[str, Any]) -> list[dict[str, Any]]:
        actions: list[dict[str, Any]] = []
        emotion = context.get("emotion") or {}
        state = emotion.get("emotional_state") or {}
        mood = EmotionTemplates.normalize_mood(state.get("mood"))

        if mood in {"burnout_risk", "stressed", "overwhelmed"}:
            if context.get("task_count", 0):
                actions.append(
                    {
                        "label": "Review smallest next step",
                        "type": "navigate",
                        "payload": {"path": "/ai-prioritization"},
                    }
                )
            actions.append(
                {
                    "label": "Take a short reset",
                    "type": "wellbeing",
                    "payload": {"minutes": 10},
                }
            )
            return actions[:2]

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
        if mood in {"productive", "focused"} and context.get("task_count", 0):
            actions.insert(
                0,
                {
                    "label": "Keep momentum going",
                    "type": "navigate",
                    "payload": {"path": "/ai-prioritization"},
                },
            )
        return actions[:3]

    @staticmethod
    def _estimate_task_breakdown_hours(task: dict[str, Any], subtask_count: int) -> float:
        estimated_hours = task.get("estimated_hours")
        if estimated_hours is not None:
            return max(1.0, float(estimated_hours))

        story_points = task.get("story_points")
        if story_points is not None:
            return max(1.0, float(story_points) * 1.5)

        priority = (task.get("priority") or "medium").lower()
        baseline = {
            "critical": 12.0,
            "high": 8.0,
            "medium": 6.0,
            "low": 4.0,
        }.get(priority, 6.0)
        return max(1.0, baseline + max(0, subtask_count - 4) * 0.5)

    @staticmethod
    def _build_task_breakdown_fallback_response(
        context: dict[str, Any],
        resolution: RoleResolution,
        request: AITaskBreakdownRequest,
    ) -> AITaskBreakdownResponse:
        task = context["task"]
        existing_subtasks = list(context.get("existing_subtasks") or [])
        subtask_count = min(max(len(existing_subtasks) or request.max_subtasks, 3), request.max_subtasks)
        total_hours = AIService._estimate_task_breakdown_hours(task, subtask_count)

        subtasks: list[dict[str, Any]] = []
        if existing_subtasks:
            for index, item in enumerate(existing_subtasks[:subtask_count], start=1):
                subtasks.append(
                    {
                        "order": index,
                        "title": item["title"],
                        "description": item.get("description") or f"Complete {item['title'].lower()} for {task['title']}.",
                        "estimated_hours": float(item.get("estimated_hours") or round(total_hours / subtask_count, 1)),
                        "dependencies": list(item.get("dependencies") or (context.get("existing_dependencies") or [])),
                        "milestone": item.get("milestone") or "Execution",
                    }
                )
        else:
            generic_steps = [
                ("Clarify scope and requirements", "Confirm the objective, expected output, and acceptance criteria."),
                ("Prepare execution plan", "Break the task into concrete deliverables and confirm dependencies."),
                ("Execute the core work", "Complete the main production or delivery work for the task."),
                ("Review and quality check", "Validate the work, fix issues, and verify the result."),
                ("Deliver and close out", "Share the final output and mark the task complete."),
            ]
            for index, (title, description) in enumerate(generic_steps[:subtask_count], start=1):
                subtasks.append(
                    {
                        "order": index,
                        "title": title,
                        "description": description,
                        "estimated_hours": round(total_hours / subtask_count, 1),
                        "dependencies": list(context.get("existing_dependencies") or []),
                        "milestone": "Planning" if index == 1 else "Execution" if index < subtask_count else "Delivery",
                    }
                )

        milestones = [
            {
                "title": "Scope confirmed",
                "description": "The task intent, success criteria, and dependencies are clear.",
                "due_in_days": None,
                "success_criteria": "No open questions remain before execution starts.",
            },
            {
                "title": "Core work completed",
                "description": "The main deliverable is finished and ready for review.",
                "due_in_days": None,
                "success_criteria": "The primary output is available for quality checks.",
            },
            {
                "title": "Delivery ready",
                "description": "The task has been reviewed and can be handed off or closed.",
                "due_in_days": 0 if task.get("status") == TaskStatus.IN_REVIEW.value else None,
                "success_criteria": "The work is ready to be marked complete.",
            },
        ]

        response_task = AITaskBreakdownTaskItem(
            task_id=task["task_id"],
            title=task["title"],
            description=task.get("description"),
            status=task["status"],
            priority=task["priority"],
            due_date=task.get("due_date"),
            estimated_hours=task.get("estimated_hours"),
            project_id=task.get("project_id"),
            project_name=task.get("project_name"),
            department=task.get("department"),
            assigned_to=task.get("assigned_to"),
        )

        dependencies = list(dict.fromkeys(context.get("existing_dependencies") or []))
        if not dependencies and task.get("assigned_to"):
            dependencies.append(f"Coordinate with assignee {task['assigned_to']}")
        if not dependencies:
            dependencies.append("Confirm scope with the task owner")

        return AITaskBreakdownResponse(
            summary=(
                f"Broken down {task['title']} into {len(subtasks)} actionable steps "
                f"for {context['team']['current_user_role']} execution."
            ),
            task=response_task,
            subtasks=subtasks,
            dependencies=dependencies,
            milestones=milestones,
            time_estimate_hours=round(total_hours, 1),
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

    @staticmethod
    def _daily_report_task_item(
        item: dict[str, Any],
        note: str | None = None,
    ) -> AIDailyReportItem:
        return AIDailyReportItem(
            item_type=item.get("item_type", "task"),
            title=item.get("title") or item.get("ticket_number") or "Untitled item",
            description=item.get("description"),
            item_id=item.get("item_id") or item.get("id"),
            status=item.get("status"),
            priority=item.get("priority"),
            due_date=item.get("due_date"),
            estimated_hours=item.get("estimated_hours"),
            assigned_to=item.get("assigned_to") or item.get("owner"),
            project_name=item.get("project_name"),
            note=note or item.get("note"),
        )

    @staticmethod
    def _daily_report_metric_item(title: str, description: str, note: str | None = None) -> AIDailyReportItem:
        return AIDailyReportItem(
            item_type="metric",
            title=title,
            description=description,
            note=note,
        )

    def _build_daily_report_fallback_response(
        self,
        context: dict[str, Any],
        resolution: RoleResolution,
        request: AIDailyReportRequest,
    ) -> AIDailyReportResponse:
        report_type = context.get("report_type") or resolution.role_key
        report_scope = context.get("report_scope", "self")
        tasks = list(context.get("tasks") or [])
        tickets = list(context.get("tickets") or [])
        completed_tasks = list(context.get("completed_tasks") or [])
        pending_tasks = list(context.get("pending_tasks") or [])
        blockers = list(context.get("blockers") or [])
        tomorrow_priorities = list(context.get("tomorrow_priorities") or [])
        open_tickets = list(context.get("open_tickets") or [])
        overdue_tickets = list(context.get("overdue_tickets") or [])
        project_summary = list(context.get("project_summary") or [])
        task_count_by_owner = dict(context.get("task_count_by_owner") or {})
        scope_summary = dict(context.get("scope_summary") or {})

        sections: list[AIDailyReportSection]
        if report_type == "lead":
            sections = [
                AIDailyReportSection(
                    title="Team Progress",
                    summary=f"{len(completed_tasks)} completed items and {len(pending_tasks)} pending items in the current team scope.",
                    items=[
                        *[self._daily_report_task_item(item, note="Completed item") for item in completed_tasks[: request.limit]],
                        *[self._daily_report_task_item(item, note="Active ticket") for item in open_tickets[: max(0, request.limit - len(completed_tasks))]],
                    ][: request.limit],
                ),
                AIDailyReportSection(
                    title="Team Blockers",
                    summary=f"{len(blockers) + len(overdue_tickets)} blockers and risks need follow-up.",
                    items=[
                        *[self._daily_report_task_item(item, note="Overdue or in-review work") for item in blockers[: request.limit]],
                        *[self._daily_report_task_item(item, note="Open ticket") for item in overdue_tickets[: max(0, request.limit - len(blockers))]],
                    ][: request.limit],
                ),
                AIDailyReportSection(
                    title="Team Priorities",
                    summary=f"{len(tomorrow_priorities)} near-term priorities are due soon.",
                    items=[self._daily_report_task_item(item, note="Prioritize next") for item in tomorrow_priorities[: request.limit]],
                ),
            ]
        elif report_type == "department":
            top_owner = max(task_count_by_owner.items(), key=lambda item: item[1])[0] if task_count_by_owner else "Unassigned"
            sections = [
                AIDailyReportSection(
                    title="Department Health",
                    summary=(
                        f"{scope_summary.get('completed_tasks', 0)} tasks completed, "
                        f"{scope_summary.get('pending_tasks', 0)} still pending, and "
                        f"{scope_summary.get('blockers', 0)} blockers in scope."
                    ),
                    items=[
                        self._daily_report_metric_item("Completion", f"{scope_summary.get('completed_tasks', 0)} completed tasks today"),
                        self._daily_report_metric_item("Pending work", f"{scope_summary.get('pending_tasks', 0)} tasks still open"),
                        self._daily_report_metric_item("Top workload owner", top_owner, note=f"{task_count_by_owner.get(top_owner, 0)} tasks in scope"),
                    ],
                ),
                AIDailyReportSection(
                    title="Delayed Work",
                    summary=f"{len(blockers)} delayed tasks and {len(overdue_tickets)} overdue tickets need attention.",
                    items=[
                        *[self._daily_report_task_item(item, note="Delayed task") for item in blockers[: request.limit]],
                        *[self._daily_report_task_item(item, note="Overdue ticket") for item in overdue_tickets[: max(0, request.limit - len(blockers))]],
                    ][: request.limit],
                ),
                AIDailyReportSection(
                    title="Resource Risks",
                    summary="Watch workload distribution and unresolved items across the department.",
                    items=[
                        self._daily_report_metric_item(owner or "Unassigned", f"{count} tasks assigned", note="Workload concentration")
                        for owner, count in sorted(task_count_by_owner.items(), key=lambda item: (-item[1], item[0]))[: request.limit]
                    ],
                ),
            ]
        elif report_type == "admin":
            sections = [
                AIDailyReportSection(
                    title="Company Progress",
                    summary=f"{len(completed_tasks)} tasks completed and {len(pending_tasks)} tasks remain in the company scope.",
                    items=[
                        self._daily_report_metric_item("Tasks completed", f"{len(completed_tasks)} completed"),
                        self._daily_report_metric_item("Tickets in play", f"{len(tickets)} tickets tracked"),
                        self._daily_report_metric_item("Open tickets", f"{len(open_tickets)} open or active tickets"),
                    ],
                ),
                AIDailyReportSection(
                    title="Critical Risks",
                    summary=f"{len(blockers) + len(overdue_tickets)} items need escalation or rapid follow-up.",
                    items=[
                        *[self._daily_report_task_item(item, note="Critical task risk") for item in blockers[: request.limit]],
                        *[self._daily_report_task_item(item, note="Critical ticket risk") for item in overdue_tickets[: max(0, request.limit - len(blockers))]],
                    ][: request.limit],
                ),
                AIDailyReportSection(
                    title="Project Health",
                    summary=f"{len(project_summary)} active project buckets were detected.",
                    items=[
                        self._daily_report_metric_item(
                            project["project_name"],
                            f"{project['completed_tasks']}/{project['total_tasks']} tasks complete",
                            note=f"{project['pending_tasks']} remaining",
                        )
                        for project in project_summary[: request.limit]
                    ],
                ),
            ]
        else:
            sections = [
                AIDailyReportSection(
                    title="Completed Tasks",
                    summary=f"{len(completed_tasks)} completed tasks were found in verified context.",
                    items=[self._daily_report_task_item(item, note="Completed today") for item in completed_tasks[: request.limit]],
                ),
                AIDailyReportSection(
                    title="Pending Tasks",
                    summary=f"{len(pending_tasks)} pending tasks remain in the personal scope.",
                    items=[self._daily_report_task_item(item, note="Still open") for item in pending_tasks[: request.limit]],
                ),
                AIDailyReportSection(
                    title="Blockers",
                    summary=f"{len(blockers) + len(overdue_tickets)} blockers and unresolved tickets were identified.",
                    items=[
                        *[self._daily_report_task_item(item, note="Task blocker") for item in blockers[: request.limit]],
                        *[self._daily_report_task_item(item, note="Ticket blocker") for item in overdue_tickets[: max(0, request.limit - len(blockers))]],
                    ][: request.limit],
                ),
                AIDailyReportSection(
                    title="Tomorrow Priorities",
                    summary=f"{len(tomorrow_priorities)} near-term priorities should be handled first tomorrow.",
                    items=[self._daily_report_task_item(item, note="Start early tomorrow") for item in tomorrow_priorities[: request.limit]],
                ),
            ]

        summary = (
            f"Generated a {report_type} daily report for {context['generated_for']['full_name']} "
            f"using {report_scope} scope and {len(tasks)} tasks / {len(tickets)} tickets."
        )

        return AIDailyReportResponse(
            report_type=report_type,
            summary=summary,
            sections=sections,
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

    def _build_chat_fallback_response(
        self,
        context: dict[str, Any],
        resolution: RoleResolution,
        request: AIChatRequest,
    ) -> AIChatResponse:
        message = self._build_chat_message(context, request.message)
        suggested_actions = self._build_chat_suggested_actions(context)
        return AIChatResponse(
            conversation_id=context.get("conversation", {}).get("conversation_id"),
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

    async def generate_task_breakdown(
        self,
        current_user: User,
        request: AITaskBreakdownRequest,
    ) -> AITaskBreakdownResponse:
        context = await ContextBuilder.build_task_breakdown_context(
            current_user=current_user,
            task_id=request.task_id,
            max_subtasks=request.max_subtasks,
        )

        resolution = self.role_engine.resolve(current_user)
        prompt_schema = AITaskBreakdownLLMResponse.model_json_schema()
        prompt_package = self.prompt_manager.render_role_prompt(
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
            parsed = self.response_parser.parse_json_model(result.content, AITaskBreakdownLLMResponse)
            action_results = await self.tool_executor.execute_many(parsed.actions)
            executed_actions = [
                {
                    "tool": item.tool_name,
                    "success": item.success,
                    "result": item.result,
                }
                for item in action_results
            ]
            response = AITaskBreakdownResponse(
                summary=parsed.summary,
                task=AITaskBreakdownTaskItem.model_validate(context["task"]),
                subtasks=parsed.subtasks,
                dependencies=parsed.dependencies,
                milestones=parsed.milestones,
                time_estimate_hours=parsed.time_estimate_hours,
                actions=parsed.actions,
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
                feature="task_breakdown",
                role=resolution.role_key,
                provider=provider_name,
                status="success",
                company_id=current_user.company_id,
                user_id=str(current_user.id),
                target_user_id=context["task"].get("assigned_to"),
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
            fallback = self._build_task_breakdown_fallback_response(context, resolution, request)
            await AILogger.log_interaction(
                feature="task_breakdown",
                role=resolution.role_key,
                provider=provider_name,
                status="fallback",
                company_id=current_user.company_id,
                user_id=str(current_user.id),
                target_user_id=context["task"].get("assigned_to"),
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

    async def generate_breakdown(
        self,
        current_user: User,
        request: TaskBreakdownRequest,
    ) -> TaskBreakdownResponse:
        return await self.task_breakdown_agent.generate(current_user, request)

    async def generate_daily_report(
        self,
        current_user: User,
        request: AIDailyReportRequest,
    ) -> AIDailyReportResponse:
        context = await ContextBuilder.build_daily_report_context(
            current_user=current_user,
            report_date=request.report_date,
            limit=request.limit,
        )

        resolution = self.role_engine.resolve(current_user)
        prompt_schema = AIDailyReportLLMResponse.model_json_schema()
        prompt_package = self.prompt_manager.render_role_prompt(
            resolution,
            feature_name="daily_report",
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
            parsed = self.response_parser.parse_json_model(result.content, AIDailyReportLLMResponse)
            action_results = await self.tool_executor.execute_many(parsed.actions)
            executed_actions = [
                {
                    "tool": item.tool_name,
                    "success": item.success,
                    "result": item.result,
                }
                for item in action_results
            ]
            response = AIDailyReportResponse(
                report_type=parsed.report_type,
                summary=parsed.summary,
                sections=parsed.sections,
                actions=parsed.actions,
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
                feature="daily_report",
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
            try:
                await self.memory_service.remember_report(
                    current_user,
                    report_type=response.report_type,
                    summary=response.summary,
                    context=context,
                )
            except Exception:
                pass
            return response
        except Exception as error:
            fallback = self._build_daily_report_fallback_response(context, resolution, request)
            await AILogger.log_interaction(
                feature="daily_report",
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
            try:
                await self.memory_service.remember_report(
                    current_user,
                    report_type=fallback.report_type,
                    summary=fallback.summary,
                    context=context,
                )
            except Exception:
                pass
            return fallback

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
        conversation = await self.memory_service.get_or_create_conversation(
            current_user,
            request.conversation_id,
        )
        request_history = [item.model_dump() for item in request.history]
        conversation_history = self.memory_service.get_conversation_history(conversation)
        history = conversation_history or request_history
        base_context = await ContextBuilder.build_chat_context(
            current_user=current_user,
            message=request.message,
            history=history,
            conversation_id=conversation.conversation_id,
            conversation_history=conversation_history,
            conversation_state=conversation.state.model_dump() if hasattr(conversation.state, "model_dump") else dict(conversation.state),
        )
        user_state = await self.emotion_detector.detect_and_store(
            current_user,
            message=request.message,
            context=base_context,
        )
        emotion_context = self.emotion_detector.to_context_payload(user_state)
        context = await ContextBuilder.build_chat_context(
            current_user=current_user,
            message=request.message,
            history=history,
            conversation_id=conversation.conversation_id,
            conversation_history=conversation_history,
            conversation_state=conversation.state.model_dump() if hasattr(conversation.state, "model_dump") else dict(conversation.state),
            emotional_state=emotion_context.get("emotional_state"),
            workload_metrics=emotion_context.get("workload_metrics"),
            tone_guidance=emotion_context.get("tone_guidance"),
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
                conversation_id=conversation.conversation_id,
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
            try:
                await self.memory_service.remember_chat(
                    current_user,
                    user_message=request.message,
                    assistant_message=response.message,
                    context=context,
                )
            except Exception:
                pass
            try:
                await self.memory_service.remember_conversation_turn(
                    conversation,
                    user_message=request.message,
                    assistant_message=response.message,
                    context={**context, "suggested_actions": [action.model_dump() for action in response.suggested_actions]},
                    assistant_tokens_used=result.total_tokens,
                )
            except Exception:
                pass
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
            try:
                await self.memory_service.remember_chat(
                    current_user,
                    user_message=request.message,
                    assistant_message=fallback.message,
                    context=context,
                )
            except Exception:
                pass
            try:
                await self.memory_service.remember_conversation_turn(
                    conversation,
                    user_message=request.message,
                    assistant_message=fallback.message,
                    context={**context, "suggested_actions": [action.model_dump() for action in fallback.suggested_actions]},
                    assistant_tokens_used=None,
                )
            except Exception:
                pass
            return fallback

    async def generate_marketing_chat_response(
        self,
        current_user: User,
        request: AIChatRequest,
    ) -> AIChatResponse:
        """
        Generate a marketing-focused chat response for digital marketing client support.
        This uses a specialized prompt and context for marketing-related queries.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        from app.ai.context_builder import ContextBuilder
        from app.ai.prompts.chat.digital_marketing_support import render_digital_marketing_prompt
        from app.ai.tools.marketing_tools import register_marketing_tools
        
        # Build marketing context
        context = await ContextBuilder.build_marketing_context(
            current_user=current_user,
            message=request.message,
            limit=10,
        )
        
        # Get role resolution
        resolution = self.role_engine.resolve(current_user)
        
        # Render marketing-specific prompt
        prompt_package = render_digital_marketing_prompt(
            resolution=resolution,
            context=context,
            message=request.message,
        )
        
        provider_name = settings.AI_PROVIDER.lower().strip()
        model_name = settings.AI_MODEL_OPENAI if provider_name == "openai" else settings.AI_MODEL_GROQ
        started_at = time.perf_counter()
        
        try:
            # Register marketing tools for this request
            from app.api.dependencies import get_current_user
            register_marketing_tools(self.tool_executor, get_current_user)
            
            # Build options - Groq doesn't support response_format, only OpenAI does
            generate_options = {
                "system_prompt": prompt_package.system_prompt,
                "max_tokens": settings.AI_MAX_TOKENS,
                "temperature": settings.AI_TEMPERATURE,
            }
            # Only add response_format for OpenAI, not Groq
            if provider_name != "groq":
                generate_options["response_format"] = {"type": "json_object"}
            
            result = await self.provider.generate(
                prompt=prompt_package.user_prompt,
                context=context,
                options=generate_options,
            )
            model_name = result.model
            
            # Parse response
            from app.schemas.ai import AIChatLLMResponse
            parsed = self.response_parser.parse_json_model(result.content, AIChatLLMResponse)
            
            # Execute any tools requested by the AI
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
                conversation_id=None,  # Marketing chat doesn't persist conversations
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
            
            # Log interaction
            await AILogger.log_interaction(
                feature="marketing_chat",
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
            # Log the actual error
            logger.error(f"Marketing chat error: {str(error)}", exc_info=True)
            
            # Provide more helpful error message based on error type
            error_str = str(error).lower()
            if "400" in error_str or "bad request" in error_str:
                fallback_message = (
                    f"Hello {current_user.first_name}, I'm your Digital Marketing Support Assistant. "
                    "I'm currently experiencing technical difficulties with the AI service. "
                    "This may be due to an invalid API key or configuration issue. "
                    "Please contact your administrator to verify the Groq API key in the backend .env file."
                )
            elif "401" in error_str or "unauthorized" in error_str or "api key" in error_str:
                fallback_message = (
                    f"Hello {current_user.first_name}, I'm your Digital Marketing Support Assistant. "
                    "The AI service authentication failed. Please contact your administrator to verify the API configuration."
                )
            elif "429" in error_str or "rate limit" in error_str:
                fallback_message = (
                    f"Hello {current_user.first_name}, I'm your Digital Marketing Support Assistant. "
                    "I'm currently experiencing high traffic. Please wait a moment and try again."
                )
            elif "timeout" in error_str or "timed out" in error_str:
                fallback_message = (
                    f"Hello {current_user.first_name}, I'm your Digital Marketing Support Assistant. "
                    "The request timed out. Please try again with a shorter question."
                )
            else:
                fallback_message = (
                    f"Hello {current_user.first_name}, I'm your Digital Marketing Support Assistant. "
                    "I can help you with campaign status, invoices, subscriptions, support tickets, and marketing services. "
                    f"However, I encountered an issue: {str(error)[:100]}. Please try again or contact support if the issue persists."
                )
            
            fallback = AIChatResponse(
                conversation_id=None,
                message=fallback_message,
                suggested_actions=[
                    {"label": "View Campaigns", "type": "navigate", "payload": {"path": "/projects"}},
                    {"label": "Create Support Ticket", "type": "navigate", "payload": {"path": "/tickets"}},
                    {"label": "View Invoices", "type": "navigate", "payload": {"path": "/invoices"}},
                ],
                actions=[],
                source="fallback",
                provider=provider_name,
                model=model_name,
                role=resolution.role_key,
                prompt_version=prompt_package.prompt_version if 'prompt_package' in dir() else "1.0",
                prompt_role_key="marketing_chat-fallback",
                fallback_chain=[],
                fallback_used=True,
                generated_at=datetime.utcnow(),
                context={},
            )
            
            await AILogger.log_interaction(
                feature="marketing_chat",
                role=resolution.role_key,
                provider=provider_name,
                status="fallback",
                company_id=current_user.company_id,
                user_id=str(current_user.id),
                target_user_id=None,
                model=model_name,
                prompt_version=prompt_package.prompt_version if 'prompt_package' in dir() else "1.0",
                prompt_role_key="marketing_chat-fallback",
                prompt=prompt_package.user_prompt if 'prompt_package' in dir() else "",
                context=context if 'context' in dir() else {},
                raw_response=None,
                parsed_response=fallback.model_dump(),
                latency_ms=round((time.perf_counter() - started_at) * 1000, 2),
                prompt_tokens=None,
                completion_tokens=None,
                total_tokens=None,
                response_size_bytes=len(fallback.model_dump_json().encode("utf-8")),
                fallback_used=True,
                fallback_chain=[],
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
