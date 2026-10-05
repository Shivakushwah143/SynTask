import asyncio
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.models.notification import Notification, NotificationType
from app.models.task import TaskStatus
from app.models.content_calendar import ContentItemStatus
from app.services.reminder_service import (
    ReminderPriority,
    ReminderService,
    build_pending_toast_query,
    calculate_remaining_days,
    calendar_due_tone,
)


def task(**kwargs):
    data = {
        "id": "task-1",
        "company_id": "company-1",
        "title": "Project Report",
        "assigned_to": "employee-1",
        "status": TaskStatus.IN_PROGRESS,
        "due_date": datetime(2026, 7, 21, 17, 0, 0),
    }
    data.update(kwargs)
    return SimpleNamespace(**data)


def content(**kwargs):
    data = {
        "id": "content-1",
        "company_id": "company-1",
        "title": "Launch Reel",
        "assignee_id": "employee-1",
        "status": ContentItemStatus.EDITING,
        "due_date": datetime(2026, 7, 21, 17, 0, 0),
    }
    data.update(kwargs)
    return SimpleNamespace(**data)


class FakeNotificationRepository:
    def __init__(self):
        self.created = []
        self.existing_keys = set()

    async def find_one(self, query):
        key = query.get("metadata.reminder_key")
        return SimpleNamespace(id="existing") if key in self.existing_keys else None

    async def insert(self, notification):
        self.created.append(notification)
        self.existing_keys.add(notification.metadata["reminder_key"])
        return notification


def test_remaining_days_uses_calendar_days_not_hours():
    now = datetime(2026, 7, 18, 23, 0, 0)
    due = datetime(2026, 7, 19, 1, 0, 0)

    assert calculate_remaining_days(due, now) == 1


def test_calendar_due_tone_matches_requested_colors():
    today = date(2026, 7, 18)

    assert calendar_due_tone(None, today) == {"label": "Assigned", "color": "#3B82F6", "tone": "assigned"}
    assert calendar_due_tone(datetime(2026, 7, 21), today)["tone"] == "upcoming"
    assert calendar_due_tone(datetime(2026, 7, 19), today)["tone"] == "tomorrow"
    assert calendar_due_tone(datetime(2026, 7, 18), today)["tone"] == "today"
    assert calendar_due_tone(datetime(2026, 7, 17), today)["tone"] == "overdue"


def test_reminder_key_unique_index_ignores_legacy_notifications_without_key():
    indexes = [
        index
        for index in Notification.Settings.indexes
        if getattr(index, "document", {}).get("unique")
        and dict(getattr(index, "document", {}).get("key", {})).get("metadata.reminder_key") == 1
    ]

    assert len(indexes) == 1
    assert indexes[0].document["partialFilterExpression"] == {"metadata.reminder_key": {"$type": "string"}}
    assert "sparse" not in indexes[0].document


def test_pending_toast_query_returns_due_reminders_even_after_old_auto_ack_or_read():
    today_start = datetime(2026, 7, 18)

    query = build_pending_toast_query("user-1", "company-1", today_start)

    assert query["company_id"] == "company-1"
    assert query["user_id"] == "user-1"
    assert query["created_at"] == {"$gte": today_start}
    assert query["metadata.show_toast"] is True
    assert "is_read" not in query
    assert "metadata.toast_acknowledged" not in query


@pytest.mark.asyncio
async def test_task_due_tomorrow_creates_high_priority_toast_notification():
    repo = FakeNotificationRepository()
    service = ReminderService(notification_repository=repo, now=lambda: datetime(2026, 7, 18, 9, 0, 0))

    created = await service.generate_task_reminder(task(due_date=datetime(2026, 7, 19, 17, 0, 0)))

    assert created is not None
    assert created.type == NotificationType.TASK_DUE_TOMORROW
    assert created.priority == ReminderPriority.HIGH
    assert created.metadata["show_toast"] is True
    assert created.metadata["reminder_key"] == "task:task-1:employee-1:task_due_tomorrow:2026-07-18"
    assert created.message == "Task Project Report is due tomorrow."


@pytest.mark.asyncio
async def test_task_due_today_creates_critical_popup_notification():
    repo = FakeNotificationRepository()
    service = ReminderService(notification_repository=repo, now=lambda: datetime(2026, 7, 18, 9, 0, 0))

    created = await service.generate_task_reminder(task(due_date=datetime(2026, 7, 18, 17, 0, 0)))

    assert created is not None
    assert created.type == NotificationType.TASK_DUE_TODAY
    assert created.priority == ReminderPriority.CRITICAL
    assert created.metadata["show_toast"] is True
    assert created.message == "Task Project Report is due today."


@pytest.mark.asyncio
async def test_overdue_task_reminder_deduplicates_per_day():
    repo = FakeNotificationRepository()
    service = ReminderService(notification_repository=repo, now=lambda: datetime(2026, 7, 18, 9, 0, 0))

    overdue = task(due_date=datetime(2026, 7, 16, 17, 0, 0))
    first = await service.generate_task_reminder(overdue)
    second = await service.generate_task_reminder(overdue)

    assert first is not None
    assert second is None
    assert len(repo.created) == 1
    assert first.type == NotificationType.TASK_OVERDUE
    assert first.metadata["show_toast"] is False
    assert "overdue by 2 days" in first.message


@pytest.mark.asyncio
async def test_completed_task_is_skipped():
    repo = FakeNotificationRepository()
    service = ReminderService(notification_repository=repo, now=lambda: datetime(2026, 7, 18, 9, 0, 0))

    created = await service.generate_task_reminder(task(status=TaskStatus.COMPLETED))

    assert created is None
    assert repo.created == []


@pytest.mark.asyncio
async def test_content_due_today_creates_critical_toast_notification():
    repo = FakeNotificationRepository()
    service = ReminderService(notification_repository=repo, now=lambda: datetime(2026, 7, 18, 9, 0, 0))

    created = await service.generate_content_reminder(content(due_date=datetime(2026, 7, 18, 17, 0, 0)))

    assert created is not None
    assert created.type == NotificationType.CONTENT_DUE_TODAY
    assert created.priority == ReminderPriority.CRITICAL
    assert created.metadata["show_toast"] is True
    # Notifications link to the canonical Content Item (same convention as the
    # content governance tests), not the legacy calendar page.
    assert created.action_url == "/content/content-1"


@pytest.mark.asyncio
async def test_submitted_content_is_skipped():
    repo = FakeNotificationRepository()
    service = ReminderService(notification_repository=repo, now=lambda: datetime(2026, 7, 18, 9, 0, 0))

    created = await service.generate_content_reminder(
        content(status=ContentItemStatus.PUBLISHED, due_date=datetime(2026, 7, 17, 17, 0, 0))
    )

    assert created is None
    assert repo.created == []


@pytest.mark.asyncio
async def test_catchup_is_throttled_to_one_run_per_cooldown():
    """The frequently-polled toast endpoint must not trigger a full reminder
    scan on every request — it runs at most once per cooldown window."""
    service = ReminderService(notification_repository=FakeNotificationRepository())
    runs = []

    async def fake_check_all():
        runs.append(1)
        return {"task_notifications": 0, "content_notifications": 0, "total": 0}

    service.check_all_reminders = fake_check_all

    # First call runs the scan.
    assert await service.run_catchup_if_due(cooldown_seconds=60) is True
    assert len(runs) == 1

    # Immediately after, a second call within the cooldown must be skipped.
    assert await service.run_catchup_if_due(cooldown_seconds=60) is False
    assert len(runs) == 1

    # Simulate the cooldown window elapsing: scan runs again.
    service._last_catchup_at = 0.0
    assert await service.run_catchup_if_due(cooldown_seconds=60) is True
    assert len(runs) == 2


@pytest.mark.asyncio
async def test_catchup_concurrent_requests_run_scan_only_once():
    """Even when many requests race past the first timestamp check, the lock
    guarantees the scan executes at most once."""
    service = ReminderService(notification_repository=FakeNotificationRepository())
    runs = []

    async def fake_check_all():
        await asyncio.sleep(0)
        runs.append(1)
        return {"task_notifications": 0, "content_notifications": 0, "total": 0}

    service.check_all_reminders = fake_check_all

    results = await asyncio.gather(
        service.run_catchup_if_due(cooldown_seconds=60),
        service.run_catchup_if_due(cooldown_seconds=60),
        service.run_catchup_if_due(cooldown_seconds=60),
    )

    assert sum(results) == 1  # exactly one caller wins the scan
    assert len(runs) == 1


