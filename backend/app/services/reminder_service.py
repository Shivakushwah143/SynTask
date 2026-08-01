from __future__ import annotations

import asyncio
import logging
from time import monotonic
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import Enum
from typing import Any, Callable, Optional

from app.models.content_calendar import ContentCalendarItem, ContentItemStatus
from app.models.notification import Notification, NotificationType
from app.models.task import Task, TaskStatus
from app.models.user import User, UserStatus
from app.core.clock import utc_now

logger = logging.getLogger(__name__)

REMINDER_SCHEDULER_INTERVAL_SECONDS = 60 * 60
# The /reminder-toasts endpoint is polled frequently by the frontend. Its
# "login catch-up" triggers a full reminder scan, which is expensive and floods
# logs with duplicate-skip lines. This cooldown ensures the scan runs at most
# once per window; the hourly background scheduler still provides the canonical
# generation path.
REMINDER_CATCHUP_COOLDOWN_SECONDS = 15 * 60


class ReminderPriority(str, Enum):
    INFO = "info"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass(frozen=True, slots=True)
class ReminderRule:
    days: int
    priority: ReminderPriority
    task_type: NotificationType
    content_type: NotificationType
    toast: bool = False


REMINDER_RULES = {
    3: ReminderRule(3, ReminderPriority.MEDIUM, NotificationType.TASK_DUE_3_DAYS, NotificationType.CONTENT_DUE_3_DAYS),
    2: ReminderRule(2, ReminderPriority.MEDIUM, NotificationType.TASK_DUE_2_DAYS, NotificationType.CONTENT_DUE_2_DAYS),
    1: ReminderRule(1, ReminderPriority.HIGH, NotificationType.TASK_DUE_TOMORROW, NotificationType.CONTENT_DUE_TOMORROW, True),
    0: ReminderRule(0, ReminderPriority.CRITICAL, NotificationType.TASK_DUE_TODAY, NotificationType.CONTENT_DUE_TODAY, True),
}


REMINDER_COLORS = {
    "assigned": {"label": "Assigned", "color": "#3B82F6", "tone": "assigned"},
    "upcoming": {"label": "Due within 3 days", "color": "#EAB308", "tone": "upcoming"},
    "tomorrow": {"label": "Due tomorrow", "color": "#F97316", "tone": "tomorrow"},
    "today": {"label": "Due today", "color": "#EF4444", "tone": "today"},
    "overdue": {"label": "Overdue", "color": "#7F1D1D", "tone": "overdue"},
}


def _enum_value(value: Any) -> str:
    return getattr(value, "value", value) or ""


def _as_date(value: datetime | date) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value


def calculate_remaining_days(due_date: datetime | date, now: Optional[datetime] = None) -> int:
    today = (now or utc_now()).date()
    return (_as_date(due_date) - today).days


def calendar_due_tone(due_date: datetime | date | None, today: Optional[date] = None) -> dict[str, str]:
    if not due_date:
        return REMINDER_COLORS["assigned"]
    remaining_days = (_as_date(due_date) - (today or utc_now().date())).days
    if remaining_days < 0:
        return REMINDER_COLORS["overdue"]
    if remaining_days == 0:
        return REMINDER_COLORS["today"]
    if remaining_days == 1:
        return REMINDER_COLORS["tomorrow"]
    if remaining_days <= 3:
        return REMINDER_COLORS["upcoming"]
    return REMINDER_COLORS["assigned"]


def build_pending_toast_query(user_id: str, company_id: str, today_start: datetime) -> dict[str, Any]:
    return {
        "company_id": company_id,
        "user_id": user_id,
        "created_at": {"$gte": today_start},
        "metadata.show_toast": True,
    }


class ReminderService:
    def __init__(
        self,
        *,
        notification_repository=Notification,
        notification_factory=None,
        now: Callable[[], datetime] = utc_now,
    ) -> None:
        self.notification_repository = notification_repository
        self.notification_factory = notification_factory or (Notification if notification_repository is Notification else self._plain_notification)
        self.now = now
        self._last_catchup_at = 0.0
        self._catchup_lock = asyncio.Lock()

    @staticmethod
    def _plain_notification(**data):
        from types import SimpleNamespace

        return SimpleNamespace(**data)

    def _rule_for(self, remaining_days: int, *, entity_type: str) -> tuple[NotificationType, ReminderPriority, str, bool] | None:
        rule = REMINDER_RULES.get(remaining_days)
        if rule:
            notification_type = rule.task_type if entity_type == "task" else rule.content_type
            reminder_name = notification_type.value
            return notification_type, rule.priority, reminder_name, rule.toast
        if remaining_days < 0:
            notification_type = NotificationType.TASK_OVERDUE if entity_type == "task" else NotificationType.CONTENT_OVERDUE
            return notification_type, ReminderPriority.CRITICAL, notification_type.value, False
        return None

    @staticmethod
    def _is_task_complete(task: Task) -> bool:
        return _enum_value(getattr(task, "status", None)) in {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value, "done"}

    @staticmethod
    def _is_content_submitted(item: ContentCalendarItem) -> bool:
        return bool(getattr(item, "completed", False)) or _enum_value(getattr(item, "status", None)) == ContentItemStatus.PUBLISHED.value

    async def has_reminder_already_generated(self, reminder_key: str, company_id: str, user_id: str) -> bool:
        existing = await self.notification_repository.find_one(
            {
                "company_id": company_id,
                "user_id": user_id,
                "metadata.reminder_key": reminder_key,
            }
        )
        return existing is not None

    async def create_notification(
        self,
        *,
        company_id: str,
        user_id: str,
        notification_type: NotificationType,
        title: str,
        message: str,
        priority: ReminderPriority,
        related_id: str,
        related_type: str,
        action_url: str,
        due_date: datetime | date,
        remaining_days: int,
        reminder_key: str,
        show_toast: bool,
    ) -> Notification:
        notification = self.notification_factory(
            company_id=company_id,
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            priority=priority.value,
            related_id=related_id,
            related_type=related_type,
            action_url=action_url,
            scheduled_for=datetime.combine(_as_date(due_date), time.min),
            metadata={
                "reminder_key": reminder_key,
                "reminder_type": notification_type.value,
                "remaining_days": remaining_days,
                "due_date": due_date.isoformat() if hasattr(due_date, "isoformat") else str(due_date),
                "show_toast": show_toast,
                "toast_acknowledged": False,
            },
        )
        await self.notification_repository.insert(notification)
        logger.info("Generated reminder notification %s for %s %s user %s", notification_type.value, related_type, related_id, user_id)
        return notification

    async def generate_task_reminder(self, task: Task) -> Notification | None:
        if self._is_task_complete(task) or not getattr(task, "assigned_to", None) or not getattr(task, "due_date", None):
            return None
        now = self.now()
        remaining_days = calculate_remaining_days(task.due_date, now)
        rule = self._rule_for(remaining_days, entity_type="task")
        if not rule:
            return None
        notification_type, priority, reminder_name, show_toast = rule
        today_key = now.date().isoformat()
        reminder_key = f"task:{task.id}:{task.assigned_to}:{reminder_name}:{today_key}"
        if await self.has_reminder_already_generated(reminder_key, task.company_id, task.assigned_to):
            logger.debug("Skipped duplicate reminder %s", reminder_key)
            return None
        return await self.create_notification(
            company_id=task.company_id,
            user_id=task.assigned_to,
            notification_type=notification_type,
            title=self._task_title(notification_type),
            message=self._task_message(task.title, remaining_days),
            priority=priority,
            related_id=str(task.id),
            related_type="task",
            action_url=f"/tasks/{task.id}",
            due_date=task.due_date,
            remaining_days=remaining_days,
            reminder_key=reminder_key,
            show_toast=show_toast,
        )

    async def generate_content_reminder(self, item: ContentCalendarItem) -> Notification | None:
        assignee_id = getattr(item, "assignee_id", None)
        if self._is_content_submitted(item) or not assignee_id or not getattr(item, "due_date", None):
            return None
        now = self.now()
        remaining_days = calculate_remaining_days(item.due_date, now)
        rule = self._rule_for(remaining_days, entity_type="content")
        if not rule:
            return None
        notification_type, priority, reminder_name, show_toast = rule
        today_key = now.date().isoformat()
        reminder_key = f"content:{item.id}:{assignee_id}:{reminder_name}:{today_key}"
        if await self.has_reminder_already_generated(reminder_key, item.company_id, assignee_id):
            logger.debug("Skipped duplicate reminder %s", reminder_key)
            return None
        return await self.create_notification(
            company_id=item.company_id,
            user_id=assignee_id,
            notification_type=notification_type,
            title=self._content_title(notification_type),
            message=self._content_message(item.title, remaining_days),
            priority=priority,
            related_id=str(item.id),
            related_type="content",
            action_url="/content-calendar",
            due_date=item.due_date,
            remaining_days=remaining_days,
            reminder_key=reminder_key,
            show_toast=show_toast,
        )

    async def check_task_reminders(self) -> int:
        now = self.now()
        window_end = datetime.combine((now + timedelta(days=3)).date(), time.max)
        active_user_ids = await self._active_user_ids()
        if not active_user_ids:
            return 0
        tasks = await Task.find(
            {
                "due_date": {"$lte": window_end},
                "assigned_to": {"$in": active_user_ids},
                "status": {"$nin": [TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value]},
            }
        ).to_list()
        created = 0
        for task in tasks:
            try:
                if await self.generate_task_reminder(task):
                    created += 1
            except Exception as exc:
                logger.exception("Failed task reminder for %s: %s", getattr(task, "id", None), exc)
        return created

    async def check_content_reminders(self) -> int:
        now = self.now()
        window_end = datetime.combine((now + timedelta(days=3)).date(), time.max)
        active_user_ids = await self._active_user_ids()
        if not active_user_ids:
            return 0
        items = await ContentCalendarItem.find(
            {
                "due_date": {"$lte": window_end},
                "assignee_id": {"$in": active_user_ids},
                "status": {"$nin": [ContentItemStatus.PUBLISHED.value]},
                "completed": {"$ne": True},
            }
        ).to_list()
        created = 0
        for item in items:
            try:
                if await self.generate_content_reminder(item):
                    created += 1
            except Exception as exc:
                logger.exception("Failed content reminder for %s: %s", getattr(item, "id", None), exc)
        return created

    async def check_all_reminders(self) -> dict[str, int]:
        task_count = await self.check_task_reminders()
        content_count = await self.check_content_reminders()
        return {"task_notifications": task_count, "content_notifications": content_count, "total": task_count + content_count}

    async def run_catchup_if_due(self, *, cooldown_seconds: int = REMINDER_CATCHUP_COOLDOWN_SECONDS) -> bool:
        """Run the reminder generation catch-up at most once per cooldown window.

        Called from the frequently-polled /reminder-toasts endpoint. Without this
        guard every poll triggered a full scan over all tasks/content and flooded
        logs with duplicate-skip lines. The timestamp is updated before the scan
        so a transient failure cannot cause a re-flood on the next poll; the
        hourly background scheduler remains the canonical generation path.

        Note: the throttle is per-process. With multiple uvicorn workers each
        process runs the scan at most once per cooldown window — still a massive
        improvement over the previous per-poll behavior, and a safe fallback when
        Redis (which could hold a distributed lock) is unavailable.
        """
        if monotonic() - self._last_catchup_at < cooldown_seconds:
            return False
        async with self._catchup_lock:
            # Re-check with a fresh timestamp inside the lock in case a
            # concurrent request ran the scan while we were waiting.
            if monotonic() - self._last_catchup_at < cooldown_seconds:
                return False
            self._last_catchup_at = monotonic()
            await self.check_all_reminders()
            return True

    async def _active_user_ids(self) -> list[str]:
        users = await User.find({"status": UserStatus.ACTIVE.value}).to_list()
        return [str(user.id) for user in users]

    async def get_pending_toast_notifications(self, user_id: str, company_id: str) -> list[Notification]:
        today_start = datetime.combine(self.now().date(), time.min)
        return await Notification.find(build_pending_toast_query(user_id, company_id, today_start)).sort("-created_at").to_list()

    async def acknowledge_toasts(self, user_id: str, notification_ids: list[str]) -> int:
        now = self.now()
        updated = 0
        for notification_id in notification_ids:
            try:
                notification = await Notification.get(notification_id)
            except Exception:
                notification = None
            if not notification or str(notification.user_id) != str(user_id):
                continue
            notification.toast_shown_at = now
            notification.metadata = {**(notification.metadata or {}), "toast_acknowledged": True}
            await notification.save()
            updated += 1
        return updated

    @staticmethod
    def _task_title(notification_type: NotificationType) -> str:
        if notification_type == NotificationType.TASK_OVERDUE:
            return "Task overdue"
        if notification_type == NotificationType.TASK_DUE_TODAY:
            return "Task due today"
        return "Task reminder"

    @staticmethod
    def _content_title(notification_type: NotificationType) -> str:
        if notification_type == NotificationType.CONTENT_OVERDUE:
            return "Content overdue"
        if notification_type == NotificationType.CONTENT_DUE_TODAY:
            return "Content due today"
        return "Content reminder"

    @staticmethod
    def _task_message(title: str, remaining_days: int) -> str:
        if remaining_days == 3:
            return f"Task {title} is due in 3 days."
        if remaining_days == 2:
            return f"Task {title} is due in 2 days."
        if remaining_days == 1:
            return f"Task {title} is due tomorrow."
        if remaining_days == 0:
            return f"Task {title} is due today."
        days = abs(remaining_days)
        return f"Task {title} is overdue by {days} day{'s' if days != 1 else ''}."

    @staticmethod
    def _content_message(title: str, remaining_days: int) -> str:
        if remaining_days == 3:
            return f"Content {title} is due in 3 days."
        if remaining_days == 2:
            return f"Content {title} is due in 2 days."
        if remaining_days == 1:
            return f"Content {title} is due tomorrow."
        if remaining_days == 0:
            return f"Content {title} is due today."
        days = abs(remaining_days)
        return f"Content {title} is overdue by {days} day{'s' if days != 1 else ''}."


reminder_service = ReminderService()


async def run_reminder_scheduler() -> None:
    while True:
        try:
            active_users = await User.find({"status": UserStatus.ACTIVE.value}).count()
            logger.info("Reminder scheduler tick; active users=%s", active_users)
            # Single summary line per hourly run preserves observability without
            # the per-item log flood.
            result = await reminder_service.check_all_reminders()
            logger.info("Reminder scheduler run completed: %s", result)
            await asyncio.sleep(REMINDER_SCHEDULER_INTERVAL_SECONDS)
        except Exception as exc:
            logger.exception("Reminder scheduler failed and will retry: %s", exc)
            await asyncio.sleep(REMINDER_SCHEDULER_INTERVAL_SECONDS)
