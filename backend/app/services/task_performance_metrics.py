from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time
from enum import Enum
from typing import Any, Iterable, Optional

from app.models.leave import LeaveStatus
from app.models.task import TaskStatus


METRIC_DICTIONARY_VERSION = "task_performance_metrics.v1"


class MetricStatus(str, Enum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class MetricDefinition:
    key: str
    version: str
    formula: str
    required_fields: tuple[str, ...]
    availability: MetricStatus
    unavailable_reason: Optional[str] = None


@dataclass
class MetricResult:
    key: str
    version: str
    status: MetricStatus
    formula: str
    value: Optional[float] = None
    numerator: Optional[float] = None
    denominator: Optional[float] = None
    sample_size: int = 0
    excluded_record_count: int = 0
    missing_fields: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    confidence: float = 0.0
    source_record_references: list[dict[str, str]] = field(default_factory=list)
    unit: Optional[str] = None
    freshness: dict[str, Any] = field(default_factory=dict)
    period: dict[str, str] = field(default_factory=dict)
    timezone: str = "UTC"

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "version": self.version,
            "status": self.status.value,
            "formula": self.formula,
            "value": self.value,
            "numerator": self.numerator,
            "denominator": self.denominator,
            "sample_size": self.sample_size,
            "excluded_record_count": self.excluded_record_count,
            "missing_fields": self.missing_fields,
            "conflicts": self.conflicts,
            "warnings": self.warnings,
            "confidence": self.confidence,
            "source_record_references": self.source_record_references,
            "unit": self.unit,
            "freshness": self.freshness,
            "period": self.period,
            "timezone": self.timezone,
        }


METRIC_DEFINITIONS: dict[str, MetricDefinition] = {
    "task_completion_rate": MetricDefinition(
        key="task_completion_rate",
        version="v1",
        formula="completed eligible assigned tasks / total eligible assigned tasks",
        required_fields=("company_id", "assigned_to", "status"),
        availability=MetricStatus.AVAILABLE,
    ),
    "task_on_time_completion_rate": MetricDefinition(
        key="task_on_time_completion_rate",
        version="v1",
        formula="completed tasks with completed_at <= due_date / completed tasks with due dates",
        required_fields=("company_id", "assigned_to", "status", "due_date", "completed_at"),
        availability=MetricStatus.AVAILABLE,
    ),
    "task_overdue_rate": MetricDefinition(
        key="task_overdue_rate",
        version="v1",
        formula="open overdue tasks / open tasks with due dates",
        required_fields=("company_id", "assigned_to", "status", "due_date"),
        availability=MetricStatus.AVAILABLE,
    ),
    "blocked_task_rate": MetricDefinition(
        key="blocked_task_rate",
        version="v1",
        formula="blocked eligible tasks / eligible tasks",
        required_fields=("company_id", "assigned_to", "status", "dependencies", "health_status"),
        availability=MetricStatus.UNAVAILABLE,
        unavailable_reason="No canonical blocker state exists; EOD blockers are employee-reported context only.",
    ),
    "task_cycle_time": MetricDefinition(
        key="task_cycle_time",
        version="v1",
        formula="completed_at - start_date",
        required_fields=("company_id", "assigned_to", "status", "start_date", "completed_at"),
        availability=MetricStatus.AVAILABLE,
    ),
    "estimate_variance_hours": MetricDefinition(
        key="estimate_variance_hours",
        version="v1",
        formula="actual_hours - estimated_hours",
        required_fields=("company_id", "assigned_to", "estimated_hours", "actual_hours"),
        availability=MetricStatus.AVAILABLE,
    ),
    "estimate_variance_story_points": MetricDefinition(
        key="estimate_variance_story_points",
        version="v1",
        formula="unavailable",
        required_fields=("story_points", "actual_story_points"),
        availability=MetricStatus.UNAVAILABLE,
        unavailable_reason="No actual story-point field exists.",
    ),
    "workload_count": MetricDefinition(
        key="workload_count",
        version="v1",
        formula="count active assigned tasks per authorized user",
        required_fields=("company_id", "assigned_to", "status"),
        availability=MetricStatus.AVAILABLE,
    ),
    "workload_effort_hours": MetricDefinition(
        key="workload_effort_hours",
        version="v1",
        formula="sum estimated_hours for active assigned tasks per authorized user",
        required_fields=("company_id", "assigned_to", "status", "estimated_hours"),
        availability=MetricStatus.AVAILABLE,
    ),
    "workload_effort_story_points": MetricDefinition(
        key="workload_effort_story_points",
        version="v1",
        formula="sum story_points for active assigned tasks per authorized user",
        required_fields=("company_id", "assigned_to", "status", "story_points"),
        availability=MetricStatus.AVAILABLE,
    ),
    "eod_completion_rate": MetricDefinition(
        key="eod_completion_rate",
        version="v1",
        formula="submitted expected EODs / expected working days",
        required_fields=("employee_id", "report_date", "working_calendar"),
        availability=MetricStatus.UNAVAILABLE,
        unavailable_reason="Expected working-day and holiday configuration is not confirmed.",
    ),
    "task_eod_consistency": MetricDefinition(
        key="task_eod_consistency",
        version="v1",
        formula="compare EOD task references against canonical task status",
        required_fields=("EODReport.task_reference_ids", "Task.id", "Task.status"),
        availability=MetricStatus.AVAILABLE,
    ),
    "dependency_delay_rate": MetricDefinition(
        key="dependency_delay_rate",
        version="v1",
        formula="tasks delayed by incomplete dependencies / tasks with dependencies",
        required_fields=("dependencies", "dependency_status_history"),
        availability=MetricStatus.UNAVAILABLE,
        unavailable_reason="Dependency delay history is not confirmed.",
    ),
    "reopen_rework_rate": MetricDefinition(
        key="reopen_rework_rate",
        version="v1",
        formula="reopened or reworked tasks / completed tasks",
        required_fields=("status_transition_history",),
        availability=MetricStatus.UNAVAILABLE,
        unavailable_reason="Task status transition or reopen history is not confirmed.",
    ),
    "scope_change_impact": MetricDefinition(
        key="scope_change_impact",
        version="v1",
        formula="unavailable",
        required_fields=("scope_change_history",),
        availability=MetricStatus.UNAVAILABLE,
        unavailable_reason="Canonical scope-change history is not confirmed.",
    ),
}


class TaskPerformanceMetricService:
    def __init__(
        self,
        *,
        tenant_id: str,
        authorized_user_ids: Iterable[str],
        generated_at: Optional[datetime] = None,
    ) -> None:
        self.tenant_id = tenant_id
        self.authorized_user_ids = {str(user_id) for user_id in authorized_user_ids}
        self.generated_at = generated_at or datetime.now(UTC)

    def calculate(
        self,
        metric_keys: Iterable[str],
        *,
        tasks: Iterable[Any],
        eod_reports: Iterable[Any] = (),
        leave_requests: Iterable[Any] = (),
    ) -> dict[str, MetricResult]:
        task_list = [task for task in tasks if self._authorized_task(task)]
        eod_list = [report for report in eod_reports if self._same_tenant(report) and str(getattr(report, "employee_id", "")) in self.authorized_user_ids]
        leave_list = [leave for leave in leave_requests if self._same_tenant(leave) and str(getattr(leave, "employee_id", "")) in self.authorized_user_ids]
        return {
            key: self.calculate_one(key, tasks=task_list, eod_reports=eod_list, leave_requests=leave_list)
            for key in metric_keys
        }

    def calculate_one(
        self,
        key: str,
        *,
        tasks: list[Any],
        eod_reports: list[Any],
        leave_requests: list[Any],
    ) -> MetricResult:
        definition = METRIC_DEFINITIONS[key]
        if definition.availability == MetricStatus.UNAVAILABLE:
            return self._unavailable(definition)
        handler = getattr(self, f"_calculate_{key}")
        return handler(definition, tasks, eod_reports, leave_requests)

    def _calculate_task_completion_rate(self, definition: MetricDefinition, tasks: list[Any], *_: Any) -> MetricResult:
        eligible, excluded, missing = self._assigned_non_cancelled(tasks)
        completed = [task for task in eligible if self._status(task) == TaskStatus.COMPLETED.value]
        return self._ratio(definition, completed, eligible, excluded, missing)

    def _calculate_task_on_time_completion_rate(self, definition: MetricDefinition, tasks: list[Any], *_: Any) -> MetricResult:
        completed = [task for task in tasks if self._status(task) == TaskStatus.COMPLETED.value]
        eligible = []
        missing: list[str] = []
        excluded = 0
        for task in completed:
            if not getattr(task, "due_date", None):
                excluded += 1
                missing.append("due_date")
                continue
            if not getattr(task, "completed_at", None):
                excluded += 1
                missing.append("completed_at")
                continue
            eligible.append(task)
        on_time = [task for task in eligible if self._to_datetime(task.completed_at) <= self._to_datetime(task.due_date)]
        return self._ratio(definition, on_time, eligible, excluded, missing)

    def _calculate_task_overdue_rate(self, definition: MetricDefinition, tasks: list[Any], *_: Any) -> MetricResult:
        eligible = []
        missing: list[str] = []
        excluded = 0
        for task in tasks:
            if self._status(task) in {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value}:
                excluded += 1
                continue
            if not getattr(task, "due_date", None):
                excluded += 1
                missing.append("due_date")
                continue
            eligible.append(task)
        overdue = [task for task in eligible if self._to_datetime(task.due_date) < self.generated_at]
        return self._ratio(definition, overdue, eligible, excluded, missing)

    def _calculate_task_cycle_time(self, definition: MetricDefinition, tasks: list[Any], *_: Any) -> MetricResult:
        durations = []
        missing: list[str] = []
        excluded = 0
        for task in tasks:
            if self._status(task) != TaskStatus.COMPLETED.value:
                excluded += 1
                continue
            if not getattr(task, "start_date", None):
                excluded += 1
                missing.append("start_date")
                continue
            if not getattr(task, "completed_at", None):
                excluded += 1
                missing.append("completed_at")
                continue
            durations.append((self._to_datetime(task.completed_at) - self._to_datetime(task.start_date)).total_seconds() / 86400)
        result = self._value(definition, sum(durations) / len(durations) if durations else None, len(durations), excluded, missing)
        result.warnings.append("start_date may be planned date; first in-progress history not confirmed")
        return result

    def _calculate_estimate_variance_hours(self, definition: MetricDefinition, tasks: list[Any], *_: Any) -> MetricResult:
        values = []
        missing: list[str] = []
        excluded = 0
        for task in tasks:
            if self._status(task) == TaskStatus.CANCELLED.value:
                excluded += 1
                continue
            estimated = getattr(task, "estimated_hours", None)
            actual = getattr(task, "actual_hours", None)
            if estimated is None:
                excluded += 1
                missing.append("estimated_hours")
                continue
            if actual is None:
                excluded += 1
                missing.append("actual_hours")
                continue
            values.append(float(actual) - float(estimated))
        return self._value(definition, sum(values) / len(values) if values else None, len(values), excluded, missing)

    def _calculate_workload_count(self, definition: MetricDefinition, tasks: list[Any], *_: Any) -> MetricResult:
        active, excluded, missing = self._active_assigned(tasks)
        return self._value(definition, float(len(active)), len(active), excluded, missing, confidence=0.9 if active else 0.0)

    def _calculate_workload_effort_hours(self, definition: MetricDefinition, tasks: list[Any], *_: Any) -> MetricResult:
        active, excluded, missing = self._active_assigned(tasks)
        values = [float(task.estimated_hours) for task in active if getattr(task, "estimated_hours", None) is not None]
        missing.extend(["estimated_hours"] * (len(active) - len(values)))
        return self._value(definition, sum(values) if values else None, len(values), excluded + len(active) - len(values), missing)

    def _calculate_workload_effort_story_points(self, definition: MetricDefinition, tasks: list[Any], *_: Any) -> MetricResult:
        active, excluded, missing = self._active_assigned(tasks)
        values = [float(task.story_points) for task in active if getattr(task, "story_points", None) is not None]
        missing.extend(["story_points"] * (len(active) - len(values)))
        return self._value(definition, sum(values) if values else None, len(values), excluded + len(active) - len(values), missing)

    def _calculate_task_eod_consistency(
        self,
        definition: MetricDefinition,
        tasks: list[Any],
        eod_reports: list[Any],
        *_: Any,
    ) -> MetricResult:
        tasks_by_id = {self._id(task): task for task in tasks}
        matches = 0
        conflicts: list[str] = []
        missing: list[str] = []
        checked = 0
        for report in eod_reports:
            for task_id in getattr(report, "completed_task_ids", []) or []:
                checked += 1
                task = tasks_by_id.get(str(task_id))
                if not task:
                    missing.append("completed_task_ids")
                    continue
                if self._status(task) == TaskStatus.COMPLETED.value:
                    matches += 1
                else:
                    conflicts.append(str(task_id))
            for task_id in getattr(report, "in_progress_task_ids", []) or []:
                checked += 1
                task = tasks_by_id.get(str(task_id))
                if not task:
                    missing.append("in_progress_task_ids")
                    continue
                if self._status(task) == TaskStatus.IN_PROGRESS.value:
                    matches += 1
                else:
                    conflicts.append(str(task_id))
        result = self._ratio(definition, [object()] * matches, [object()] * checked, 0, missing)
        result.conflicts = conflicts
        result.warnings.append("EOD evidence is employee-reported and does not override canonical task status")
        return result

    def approved_leave_days(self, leave_requests: Iterable[Any]) -> set[tuple[str, date]]:
        days: set[tuple[str, date]] = set()
        for leave in leave_requests:
            if not self._same_tenant(leave) or self._value_of(getattr(leave, "status", None)) != LeaveStatus.APPROVED.value:
                continue
            if str(getattr(leave, "employee_id", "")) not in self.authorized_user_ids:
                continue
            start = self._to_datetime(leave.start_date).date()
            end = self._to_datetime(leave.end_date).date()
            current = start
            while current <= end:
                days.add((str(leave.employee_id), current))
                current = date.fromordinal(current.toordinal() + 1)
        return days

    def _assigned_non_cancelled(self, tasks: list[Any]) -> tuple[list[Any], int, list[str]]:
        eligible = []
        missing: list[str] = []
        excluded = 0
        for task in tasks:
            if self._status(task) == TaskStatus.CANCELLED.value:
                excluded += 1
                continue
            if not getattr(task, "assigned_to", None):
                excluded += 1
                missing.append("assigned_to")
                continue
            eligible.append(task)
        return eligible, excluded, missing

    def _active_assigned(self, tasks: list[Any]) -> tuple[list[Any], int, list[str]]:
        eligible, excluded, missing = self._assigned_non_cancelled(tasks)
        active = [task for task in eligible if self._status(task) != TaskStatus.COMPLETED.value]
        excluded += len(eligible) - len(active)
        return active, excluded, missing

    def _ratio(
        self,
        definition: MetricDefinition,
        numerator_records: list[Any],
        denominator_records: list[Any],
        excluded: int,
        missing: list[str],
    ) -> MetricResult:
        denominator = len(denominator_records)
        if denominator == 0:
            result = self._value(definition, None, 0, excluded, missing, confidence=0.0)
            result.status = MetricStatus.UNAVAILABLE
            result.warnings.append("No eligible denominator records")
            return result
        value = len(numerator_records) / denominator
        return MetricResult(
            key=definition.key,
            version=definition.version,
            status=MetricStatus.AVAILABLE,
            formula=definition.formula,
            value=value,
            numerator=float(len(numerator_records)),
            denominator=float(denominator),
            sample_size=denominator,
            excluded_record_count=excluded,
            missing_fields=sorted(set(missing)),
            confidence=self._confidence(denominator, missing),
            source_record_references=[self._reference(record) for record in denominator_records],
        )

    def _value(
        self,
        definition: MetricDefinition,
        value: Optional[float],
        sample_size: int,
        excluded: int,
        missing: list[str],
        *,
        confidence: Optional[float] = None,
    ) -> MetricResult:
        status = MetricStatus.AVAILABLE if value is not None else MetricStatus.UNAVAILABLE
        result = MetricResult(
            key=definition.key,
            version=definition.version,
            status=status,
            formula=definition.formula,
            value=value,
            sample_size=sample_size,
            excluded_record_count=excluded,
            missing_fields=sorted(set(missing)),
            confidence=confidence if confidence is not None else self._confidence(sample_size, missing),
        )
        if value is None:
            result.warnings.append("No eligible records")
        return result

    def _unavailable(self, definition: MetricDefinition) -> MetricResult:
        return MetricResult(
            key=definition.key,
            version=definition.version,
            status=MetricStatus.UNAVAILABLE,
            formula=definition.formula,
            warnings=[definition.unavailable_reason or "Metric unavailable"],
        )

    def _authorized_task(self, task: Any) -> bool:
        return self._same_tenant(task) and str(getattr(task, "assigned_to", "")) in self.authorized_user_ids

    def _same_tenant(self, record: Any) -> bool:
        return str(getattr(record, "company_id", "")) == self.tenant_id

    def _status(self, task: Any) -> str:
        return self._value_of(getattr(task, "status", ""))

    def _value_of(self, value: Any) -> str:
        return str(getattr(value, "value", value))

    def _to_datetime(self, value: datetime | date) -> datetime:
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=UTC)
        return datetime.combine(value, time.min, tzinfo=UTC)

    def _confidence(self, sample_size: int, missing: list[str]) -> float:
        if sample_size <= 0:
            return 0.0
        base = 0.9 if sample_size >= 5 else 0.7
        penalty = min(0.4, len(set(missing)) * 0.1)
        return max(0.1, round(base - penalty, 2))

    def _reference(self, record: Any) -> dict[str, str]:
        return {"source_type": record.__class__.__name__, "source_id": self._id(record)}

    def _id(self, record: Any) -> str:
        return str(getattr(record, "id", None) or getattr(record, "_id", "") or getattr(record, "task_id", ""))
