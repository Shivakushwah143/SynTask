from datetime import date, datetime, time
from types import SimpleNamespace

import pytest

from app.models.task import TaskStatus
from app.services import task_carry_forward_service as service


TODAY = datetime(2026, 9, 14, 9, 30)


def _task(due=None, status=TaskStatus.TODO, carry_due=None, days=0, count=0):
    task = SimpleNamespace(
        id="task-1",
        company_id="company-a",
        created_by="creator",
        assigned_to="employee",
        title="Ship the report",
        status=status,
        due_date=due,
        carry_forward_due_date=carry_due,
        carry_forward_days=days,
        carry_forward_count=count,
        carry_forward_last_at=None,
        updated_at=None,
        project_id="PROJ-001",
    )
    task.saves = 0

    async def _save():
        task.saves += 1

    task.save = _save
    return task


def _due(day):
    return datetime(day.year, day.month, day.day, 18, 30)


@pytest.fixture
def recorded_events(monkeypatch):
    events = []

    async def _record(**kwargs):
        events.append(kwargs)

    monkeypatch.setattr(service, "create_timeline_event", _record)
    return events


def test_future_and_today_deadlines_are_not_carried():
    assert service.carry_forward_state(_task(_due(date(2026, 9, 20))), TODAY) is None
    assert service.carry_forward_state(_task(_due(date(2026, 9, 14))), TODAY) is None


def test_state_describes_the_step_for_a_passed_deadline():
    step = service.carry_forward_state(_task(_due(date(2026, 8, 2))), TODAY)

    assert step["original_due_date"] == date(2026, 8, 2)
    assert step["previous_effective_due_date"] == date(2026, 8, 2)
    assert step["effective_due_date"] == date(2026, 9, 14)
    assert step["days"] == 43
    assert step["total_days_late"] == 43


def test_carrying_twice_in_one_day_is_idempotent():
    """Both the daily job and the lazy read path must apply at most one step."""
    task = _task(_due(date(2026, 8, 2)), carry_due=datetime(2026, 9, 14, 0, 0), days=43, count=1)

    assert service.carry_forward_state(task, TODAY) is None


@pytest.mark.asyncio
async def test_carry_forward_moves_only_the_effective_deadline(recorded_events):
    task = _task(_due(date(2026, 8, 2)))

    step = await service.carry_forward_task(task, TODAY)

    assert task.due_date == _due(date(2026, 8, 2)), "the original commitment is never rewritten"
    assert task.carry_forward_due_date == datetime.combine(date(2026, 9, 14), time.min)
    assert task.carry_forward_days == 43
    assert task.carry_forward_count == 1
    assert task.carry_forward_last_at == TODAY
    assert task.saves == 1
    assert step["carry_forward_days"] == 43
    assert len(recorded_events) == 1
    assert recorded_events[0]["event_type"].value == "task_carried_forward"
    assert recorded_events[0]["metadata"]["original_due_date"] == "2026-08-02"


@pytest.mark.asyncio
async def test_carry_forward_days_and_count_keep_increasing(recorded_events):
    """Each further day moved raises the carried value, as required."""
    task = _task(_due(date(2026, 8, 2)))

    await service.carry_forward_task(task, TODAY)
    assert (task.carry_forward_days, task.carry_forward_count) == (43, 1)

    next_day = datetime(2026, 9, 15, 9, 30)
    await service.carry_forward_task(task, next_day)
    assert (task.carry_forward_days, task.carry_forward_count) == (44, 2)
    assert task.carry_forward_due_date == datetime.combine(date(2026, 9, 15), time.min)

    following_day = datetime(2026, 9, 16, 9, 30)
    await service.carry_forward_task(task, following_day)
    assert (task.carry_forward_days, task.carry_forward_count) == (45, 3)
    assert task.saves == 3


@pytest.mark.asyncio
async def test_closed_tasks_are_never_carried(recorded_events):
    completed = _task(_due(date(2026, 8, 2)), status=TaskStatus.COMPLETED)
    cancelled = _task(_due(date(2026, 8, 2)), status=TaskStatus.CANCELLED)

    assert await service.carry_forward_task(completed, TODAY) is None
    assert await service.carry_forward_task(cancelled, TODAY) is None
    assert completed.saves == 0 and cancelled.saves == 0
    assert recorded_events == []


@pytest.mark.asyncio
async def test_task_without_a_deadline_is_never_carried(recorded_events):
    task = _task(None)

    assert await service.carry_forward_task(task, TODAY) is None
    assert task.saves == 0
    assert recorded_events == []


@pytest.mark.asyncio
async def test_timeline_event_is_keyed_per_carried_day(recorded_events):
    task = _task(_due(date(2026, 8, 2)))

    await service.carry_forward_task(task, TODAY)
    await service.carry_forward_task(task, datetime(2026, 9, 15, 9, 30))

    assert [event["idempotency_key"] for event in recorded_events] == [
        "task:task-1:carried_forward:2026-09-14",
        "task:task-1:carried_forward:2026-09-15",
    ]


@pytest.mark.asyncio
async def test_batch_helper_counts_only_applied_steps(recorded_events):
    tasks = [
        _task(_due(date(2026, 8, 2))),
        _task(_due(date(2026, 10, 1))),
        _task(_due(date(2026, 8, 9)), status=TaskStatus.COMPLETED),
    ]

    applied = await service.carry_forward_tasks(tasks, TODAY)

    assert applied == 1
    assert tasks[0].carry_forward_count == 1
    assert tasks[1].carry_forward_count == 0
    assert tasks[2].carry_forward_count == 0
