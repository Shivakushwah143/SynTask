"""
Work Overview Service — Phase 3

Centralized role-aware aggregation for the Work Overview experience.
Provides My Work (employee) and Team Work (manager) views.

All calculations are server-side against the full authorized dataset.
Derived operational views — never persisted as independent truth.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from app.core.clock import utc_now
from app.models.project import Project, ProjectStatus
from app.models.task import Task, TaskHealthStatus, TaskPriority, TaskStatus
from app.models.task import TaskExtensionRequest, TaskExtensionStatus
from app.models.user import User, UserRole, UserStatus
from app.services.project_health_service import calculate_project_health
from app.services.task_health_service import sync_task_health, visible_employees
from app.services.task_workflow import effective_review_required, normalize_status, status_value


# ── Workload Pressure Thresholds ────────────────────────────────────────────
# These are WORKLOAD PRESSURE thresholds, not performance/utilization metrics.

OVERLOADED_THRESHOLDS = {"overdue_gte": 3, "due_today_gte": 5, "active_gte": 10}
HIGH_THRESHOLDS = {"overdue_gte": 1, "due_today_gte": 3, "active_gte": 7}


def classify_workload_pressure(overdue: int, due_today: int, active: int) -> str:
    """Classify workload pressure based on task counts."""
    if overdue >= OVERLOADED_THRESHOLDS["overdue_gte"] or due_today >= OVERLOADED_THRESHOLDS["due_today_gte"] or active >= OVERLOADED_THRESHOLDS["active_gte"]:
        return "overloaded"
    if overdue >= HIGH_THRESHOLDS["overdue_gte"] or due_today >= HIGH_THRESHOLDS["due_today_gte"] or active >= HIGH_THRESHOLDS["active_gte"]:
        return "high"
    return "normal"


# ── Date Classification Helpers ─────────────────────────────────────────────

def _today_range(now: Optional[datetime] = None, timezone_name: Optional[str] = None) -> tuple[datetime, datetime]:
    """Return local business-day bounds represented as naive UTC instants."""
    now = now or utc_now()
    if timezone_name:
        utc_aware = now.replace(tzinfo=ZoneInfo("UTC")) if now.tzinfo is None else now
        local_now = utc_aware.astimezone(ZoneInfo(timezone_name))
        local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        return (
            local_start.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
            (local_start + timedelta(days=1)).astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
        )
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return today_start, today_start + timedelta(days=1)


def _next_7_days_end(now: Optional[datetime] = None, timezone_name: Optional[str] = None) -> datetime:
    """Return start of day +7 from now."""
    now = now or utc_now()
    _, tomorrow = _today_range(now, timezone_name)
    return tomorrow + timedelta(days=7)


def _is_overdue(task: Task, now: Optional[datetime] = None) -> bool:
    now = now or utc_now()
    status = task.status.value if hasattr(task.status, "value") else str(task.status)
    return bool(task.due_date and status not in {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value} and task.due_date < now)


def _is_due_today(task: Task, now: Optional[datetime] = None, timezone_name: Optional[str] = None) -> bool:
    now = now or utc_now()
    today_start, tomorrow_start = _today_range(now, timezone_name)
    status = task.status.value if hasattr(task.status, "value") else str(task.status)
    return bool(task.due_date and status not in {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value}
                and today_start <= task.due_date < tomorrow_start)


def _is_upcoming(task: Task, now: Optional[datetime] = None, timezone_name: Optional[str] = None) -> bool:
    now = now or utc_now()
    _, tomorrow_start = _today_range(now, timezone_name)
    end = _next_7_days_end(now, timezone_name)
    status = task.status.value if hasattr(task.status, "value") else str(task.status)
    return bool(task.due_date and status not in {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value}
                and tomorrow_start <= task.due_date <= end)


def _is_critical(task: Task) -> bool:
    priority = task.priority.value if hasattr(task.priority, "value") else str(task.priority)
    return priority == TaskPriority.CRITICAL.value


def _is_high_priority(task: Task) -> bool:
    priority = task.priority.value if hasattr(task.priority, "value") else str(task.priority)
    return priority in {TaskPriority.CRITICAL.value, TaskPriority.HIGH.value}


# ── Task Summary Card Serializer ────────────────────────────────────────────

def _task_summary(task: Task) -> Dict[str, Any]:
    status = task.status.value if hasattr(task.status, "value") else str(task.status)
    priority = task.priority.value if hasattr(task.priority, "value") else str(task.priority)
    return {
        "id": str(task.id),
        "title": task.title,
        "status": status,
        "priority": priority,
        "assigned_to": task.assigned_to,
        "reviewer_id": getattr(task, "reviewer_id", None),
        "review_required": effective_review_required(task),
        "project_id": task.project_id,
        "project_object_id": task.project_object_id,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "is_blocked": False,  # populated separately if needed
        "health_status": task.health_status.value if hasattr(task.health_status, "value") else str(task.health_status),
        "source_type": getattr(task, "source_type", None),
        "review_round": getattr(task, "review_round", 0),
        "submitted_for_review_at": task.submitted_for_review_at.isoformat() if getattr(task, "submitted_for_review_at", None) else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


# ── Bulk Data Fetching (avoid N+1) ─────────────────────────────────────────

async def _fetch_company_tasks(company_id: str, query_filter: Optional[Dict] = None) -> List[Task]:
    base_query = {"company_id": company_id}
    if query_filter:
        base_query.update(query_filter)
    return await Task.find(base_query).to_list()


async def _fetch_user_tasks(company_id: str, user_ids: List[str]) -> List[Task]:
    if not user_ids:
        return []
    return await Task.find({
        "company_id": company_id,
        "assigned_to": {"$in": user_ids},
    }).to_list()


async def _batch_resolve_users(company_id: str, user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    unique_ids = list(set(user_ids))
    if not unique_ids:
        return {}
    users = await User.find({
        "company_id": company_id,
        "_id": {"$in": [uid for uid in unique_ids if uid]},
    }).to_list()
    return {str(u.id): {"id": str(u.id), "name": f"{u.first_name} {u.last_name}".strip(), "email": u.email} for u in users}


async def _batch_resolve_projects(company_id: str, project_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    unique_ids = list(set(pid for pid in project_ids if pid))
    if not unique_ids:
        return {}
    projects = await Project.find({
        "company_id": company_id,
        "$or": [{"project_id": {"$in": unique_ids}}, {"_id": {"$in": unique_ids}}],
    }).to_list()
    result = {}
    for p in projects:
        for key in [str(p.id), str(p.project_id or "")]:
            if key:
                result[key] = {"id": str(p.id), "name": p.name, "project_id": str(p.project_id or p.id)}
    return result


# ── Blocker Resolution ──────────────────────────────────────────────────────

async def _resolve_blockers(tasks: List[Task]) -> Dict[str, List[Dict[str, Any]]]:
    """Compute blocking_dependencies for all tasks in batch.

    Instead of one Task.get() per dependency (N+1), collect all unique dependency
    IDs, fetch them in a single query, then resolve blockers from the in-memory map.
    """
    result: Dict[str, List[Dict[str, Any]]] = {}
    if not tasks:
        return result

    # Collect all unique dependency IDs across all tasks
    all_dep_ids: set[str] = set()
    for task in tasks:
        for dep_id in getattr(task, "dependencies", None) or []:
            dep_str = str(dep_id)
            if dep_str:
                all_dep_ids.add(dep_str)

    if not all_dep_ids:
        for task in tasks:
            result[str(task.id)] = []
        return result

    # Batch-fetch all dependency tasks in a single query
    dep_tasks = await Task.find({"_id": {"$in": list(all_dep_ids)}}).to_list()
    dep_map: Dict[str, Task] = {str(t.id): t for t in dep_tasks}

    for task in tasks:
        task_id = str(task.id)
        blockers: List[Dict[str, Any]] = []
        for dep_id in getattr(task, "dependencies", None) or []:
            dep_str = str(dep_id)
            dep = dep_map.get(dep_str)
            if not dep or str(dep.company_id) != str(task.company_id):
                continue
            if normalize_status(dep.status) != TaskStatus.COMPLETED:
                blockers.append({"id": str(dep.id), "title": dep.title, "status": status_value(dep.status)})
        result[task_id] = blockers

    return result


async def shared_work_metrics(tasks: List[Task], now: Optional[datetime] = None, timezone_name: Optional[str] = None) -> Dict[str, Any]:
    """Authoritative task metrics shared by Work Overview and dashboards."""
    now = now or utc_now()
    blockers = await _resolve_blockers(tasks)
    statuses = {str(getattr(task.status, "value", task.status)) for task in tasks}
    return {
        "active": sum(1 for task in tasks if str(getattr(task.status, "value", task.status)) not in {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value}),
        "overdue": sum(1 for task in tasks if _is_overdue(task, now)),
        "blocked": sum(1 for task in tasks if blockers.get(str(task.id))),
        "awaiting_review": sum(1 for task in tasks if str(getattr(task.status, "value", task.status)) == TaskStatus.IN_REVIEW.value),
        "due_today": sum(1 for task in tasks if _is_due_today(task, now, timezone_name)),
        "blocker_map": blockers,
        "statuses": statuses,
    }


# ── Next Action Engine ──────────────────────────────────────────────────────

# Eligible statuses for employee execution
_EXECUTABLE_STATUSES = {
    TaskStatus.ASSIGNED.value,
    TaskStatus.IN_PROGRESS.value,
    TaskStatus.REVISION_REQUIRED.value,
    # Legacy compatibility: todo with assignee
    TaskStatus.TODO.value,
}

# Statuses that should never be Next Action
_EXCLUDED_STATUSES = {
    TaskStatus.COMPLETED.value,
    TaskStatus.CANCELLED.value,
    TaskStatus.IN_REVIEW.value,
    TaskStatus.APPROVED.value,
}

# Priority numeric ordering (higher = more urgent)
_PRIORITY_ORDER = {
    TaskPriority.CRITICAL.value: 4,
    TaskPriority.HIGH.value: 3,
    TaskPriority.MEDIUM.value: 2,
    TaskPriority.LOW.value: 1,
}

# Status urgency ordering (lower = more urgent)
_STATUS_URGENCY = {
    TaskStatus.REVISION_REQUIRED.value: 0,
    TaskStatus.IN_PROGRESS.value: 1,
    TaskStatus.ASSIGNED.value: 2,
    TaskStatus.TODO.value: 3,  # legacy with assignee
}


def _compute_task_urgency(task: Task, now: Optional[datetime] = None, timezone_name: Optional[str] = None) -> tuple:
    """
    Compute a deterministic urgency tuple for sorting.
    Lower tuple = higher urgency = should be Next Action.

    Category order: overdue > critical > due_today > high_priority > upcoming > remaining
    Tie-breakers: status_urgency > due_date > priority > created_at > stable_id
    """
    now = now or utc_now()
    status_val = task.status.value if hasattr(task.status, "value") else str(task.status)
    priority_val = task.priority.value if hasattr(task.priority, "value") else str(task.priority)

    overdue = _is_overdue(task, now)
    due_today = _is_due_today(task, now, timezone_name)
    critical = _is_critical(task)
    high = _is_high_priority(task)
    is_revision = status_val == TaskStatus.REVISION_REQUIRED.value

    # Category (lower = more urgent)
    # revision_required is boosted to sit between critical and due_today
    # because spec says "revision_required before normal execution"
    if overdue:
        category = 0
    elif critical:
        category = 1
    elif is_revision:
        category = 2
    elif due_today:
        category = 3
    elif high:
        category = 4
    else:
        category = 5

    # Status urgency within category
    status_urgency = _STATUS_URGENCY.get(status_val, 5)

    # Due date (earlier = more urgent; far future = high number)
    if task.due_date:
        due_ts = task.due_date.timestamp()
    else:
        due_ts = 9999999999.0  # no due date is least urgent

    # Priority
    pri_order = _PRIORITY_ORDER.get(priority_val, 0)

    # Created_at for oldest-first tiebreaker
    created_ts = task.created_at.timestamp() if task.created_at else 0.0

    return (category, status_urgency, due_ts, -pri_order, created_ts, str(task.id))


def _next_action_label(task: Task) -> tuple[str, str]:
    """Return (action, action_label) for a task."""
    status = task.status.value if hasattr(task.status, "value") else str(task.status)
    if status == TaskStatus.ASSIGNED.value or (status == TaskStatus.TODO.value and task.assigned_to):
        return "start_work", "Start Work"
    if status == TaskStatus.IN_PROGRESS.value:
        return "continue_work", "Continue Work"
    if status == TaskStatus.REVISION_REQUIRED.value:
        return "fix_revision", "Fix Revision"
    return "open_task", "Open Task"


def _next_action_reason(task: Task, now: Optional[datetime] = None, timezone_name: Optional[str] = None) -> str:
    now = now or utc_now()
    status = task.status.value if hasattr(task.status, "value") else str(task.status)
    if _is_overdue(task, now) and task.due_date:
        days = (now - task.due_date).days
        return f"Overdue by {days} {'day' if days == 1 else 'days'}"
    if _is_due_today(task, now, timezone_name):
        return "Due today"
    if _is_critical(task):
        return "Critical priority"
    if _is_high_priority(task):
        return "High priority"
    if status == TaskStatus.REVISION_REQUIRED.value:
        reason = getattr(task, "latest_revision_reason", None)
        return f"Revision needed{f': {reason}' if reason else ''}"
    if task.due_date:
        days = (task.due_date - now).days
        return f"Due in {days} {'day' if days == 1 else 'days'}"
    return "Actionable work"


def _compute_next_action(tasks: List[Task], blocker_map: Optional[Dict[str, List[Dict[str, Any]]]] = None, now: Optional[datetime] = None, timezone_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Deterministic next action engine.

    Algorithm:
    1. Filter to executable tasks (assigned, in_progress, revision_required, legacy todo+assignee)
    2. Exclude blocked tasks
    3. Sort by urgency tuple
    4. Return top result with action metadata
    """
    now = now or utc_now()
    blocker_map = blocker_map or {}

    executable = []
    for task in tasks:
        status = task.status.value if hasattr(task.status, "value") else str(task.status)
        # Must be in executable statuses
        if status not in _EXECUTABLE_STATUSES:
            continue
        # Must have an assignee
        if not task.assigned_to:
            continue
        # Legacy: todo without assignee skipped
        if status == TaskStatus.TODO.value and not task.assigned_to:
            continue
        # Exclude blocked tasks
        task_id = str(task.id)
        if blocker_map.get(task_id):
            continue
        executable.append(task)

    if not executable:
        return None

    executable.sort(key=lambda t: _compute_task_urgency(t, now, timezone_name))
    best = executable[0]
    action, action_label = _next_action_label(best)
    reason = _next_action_reason(best, now, timezone_name)

    return {
        "task_id": str(best.id),
        "title": best.title,
        "status": best.status.value if hasattr(best.status, "value") else str(best.status),
        "priority": best.priority.value if hasattr(best.priority, "value") else str(best.priority),
        "due_date": best.due_date.isoformat() if best.due_date else None,
        "project_id": best.project_id,
        "project_object_id": best.project_object_id,
        "action": action,
        "action_label": action_label,
        "reason": reason,
    }


# ── Dominant Attention Classification ───────────────────────────────────────

# Order: revision_required > overdue > critical > due_today > in_progress > upcoming
_ATTENTION_ORDER = [
    TaskStatus.REVISION_REQUIRED.value,
    "overdue",
    TaskPriority.CRITICAL.value,
    TaskStatus.TODO.value,
    TaskStatus.IN_PROGRESS.value,
    "upcoming",
]


def _classify_dominant(task: Task, now: Optional[datetime] = None, timezone_name: Optional[str] = None) -> str:
    """Assign a single dominant classification to a task."""
    now = now or utc_now()
    status = task.status.value if hasattr(task.status, "value") else str(task.status)

    if status == TaskStatus.REVISION_REQUIRED.value:
        return "revision_required"
    if _is_overdue(task, now):
        return "overdue"
    if _is_critical(task):
        return "critical"
    if _is_due_today(task, now, timezone_name):
        return "due_today"
    if status == TaskStatus.IN_PROGRESS.value:
        return "in_progress"
    if _is_upcoming(task, now, timezone_name):
        return "upcoming"
    return "other"


# ── Employee Work Overview ──────────────────────────────────────────────────

async def build_employee_work_overview(current_user: User, now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Build the complete employee Work Overview.

    Returns summary counts, next action, and categorized task lists.
    All calculations server-side against the full authorized dataset.
    """
    now = now or utc_now()
    company_id = current_user.company_id
    user_id = str(current_user.id)
    timezone_name = getattr(current_user, "timezone", None)

    # Fetch all tasks assigned to this user
    tasks = await _fetch_user_tasks(company_id, [user_id])

    # Also fetch tasks where user is the reviewer (for reviews_for_me)
    reviewer_tasks = await Task.find({
        "company_id": company_id,
        "reviewer_id": user_id,
        "status": TaskStatus.IN_REVIEW.value,
    }).to_list()

    # Sync health for all tasks
    for task in tasks:
        await sync_task_health(task, now)
    for task in reviewer_tasks:
        await sync_task_health(task, now)

    # Compute blockers for all user tasks
    shared_metrics = await shared_work_metrics(tasks, now, timezone_name)
    blocker_map = shared_metrics["blocker_map"]

    # Compute summary counts (overlapping dimensions for cards)
    overdue = shared_metrics["overdue"]
    critical = sum(1 for t in tasks if _is_critical(t))
    due_today = shared_metrics["due_today"]
    in_progress = sum(1 for t in tasks if (t.status.value if hasattr(t.status, "value") else str(t.status)) == TaskStatus.IN_PROGRESS.value)
    revision_required = sum(1 for t in tasks if (t.status.value if hasattr(t.status, "value") else str(t.status)) == TaskStatus.REVISION_REQUIRED.value)
    waiting_for_review = sum(1 for t in tasks if (t.status.value if hasattr(t.status, "value") else str(t.status)) == TaskStatus.IN_REVIEW.value)
    blocked = shared_metrics["blocked"]
    upcoming = sum(1 for t in tasks if _is_upcoming(t, now, timezone_name))

    # Dominant classification for attention lists (deduped)
    dominant_buckets: Dict[str, List[Task]] = defaultdict(list)
    for task in tasks:
        classification = _classify_dominant(task, now, timezone_name)
        dominant_buckets[classification].append(task)

    # Next Action
    next_action = _compute_next_action(tasks, blocker_map, now, timezone_name)

    # Build categorized lists (limited to 10 each)
    needs_attention = []
    for cat in ["revision_required", "overdue", "critical"]:
        for task in dominant_buckets.get(cat, [])[:10]:
            needs_attention.append(_task_summary(task))

    today_work = []
    for cat in ["due_today", "in_progress"]:
        for task in dominant_buckets.get(cat, [])[:10]:
            today_work.append(_task_summary(task))

    waiting_blocked = []
    # Waiting for review (assignee submitted, not yet reviewed)
    for task in tasks:
        status = task.status.value if hasattr(task.status, "value") else str(task.status)
        if status == TaskStatus.IN_REVIEW.value:
            waiting_blocked.append(_task_summary(task))
    # Blocked tasks
    for task in tasks:
        if blocker_map.get(str(task.id)):
            summary = _task_summary(task)
            summary["is_blocked"] = True
            summary["blocking_dependencies"] = blocker_map[str(task.id)]
            waiting_blocked.append(summary)

    upcoming_work = []
    for task in dominant_buckets.get("upcoming", [])[:10]:
        upcoming_work.append(_task_summary(task))

    # Reviews for me
    reviews_for_me = [_task_summary(t) for t in reviewer_tasks[:10]]

    return {
        "view": "my_work",
        "summary": {
            "overdue": overdue,
            "critical": critical,
            "due_today": due_today,
            "in_progress": in_progress,
            "revision_required": revision_required,
            "waiting_for_review": waiting_for_review,
            "blocked": blocked,
            "upcoming": upcoming,
            "reviews_for_me": len(reviewer_tasks),
        },
        "next_action": next_action,
        "needs_attention": needs_attention,
        "today": today_work,
        "waiting_for_review": waiting_blocked,
        "upcoming": upcoming_work,
        "reviews_for_me": reviews_for_me,
    }


# ── Manager / Admin Work Overview ───────────────────────────────────────────

async def build_manager_work_overview(current_user: User, now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Build the complete manager Work Overview.

    Returns team summary, management attention queue, review queue,
    workload table, blocked tasks, at-risk projects, and pending extensions.
    """
    now = now or utc_now()
    company_id = current_user.company_id
    role = current_user.role
    timezone_name = getattr(current_user, "timezone", None)

    # Determine visible user IDs (manager + subordinates)
    if role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        visible_employees_list = await visible_employees(current_user)
    elif role == UserRole.SUPER_ADMIN:
        visible_employees_list = await visible_employees(current_user)
    else:
        visible_employees_list = await visible_employees(current_user)

    visible_user_ids = [str(u.id) for u in visible_employees_list]
    user_map = {str(u.id): u for u in visible_employees_list}

    # Fetch all team tasks in bulk (single query)
    team_tasks = await _fetch_user_tasks(company_id, visible_user_ids)

    # Fetch team tasks where any visible user is reviewer
    team_review_tasks = await Task.find({
        "company_id": company_id,
        "reviewer_id": {"$in": visible_user_ids},
        "status": TaskStatus.IN_REVIEW.value,
    }).to_list()

    # Sync health
    for task in team_tasks + team_review_tasks:
        await sync_task_health(task, now)

    # Compute blockers for all team tasks
    shared_metrics = await shared_work_metrics(team_tasks, now, timezone_name)
    blocker_map = shared_metrics["blocker_map"]

    # ── Team Summary Counts ──
    active = shared_metrics["active"]
    overdue = shared_metrics["overdue"]
    critical = sum(1 for t in team_tasks if _is_critical(t))
    due_today = sum(1 for t in team_tasks if _is_due_today(t, now, timezone_name))
    blocked_count = shared_metrics["blocked"]
    awaiting_review = shared_metrics["awaiting_review"]
    revision_required = sum(1 for t in team_tasks if (t.status.value if hasattr(t.status, "value") else str(t.status)) == TaskStatus.REVISION_REQUIRED.value)

    # ── My Review Queue (tasks where current user is reviewer) ──
    my_reviews = [_task_summary(t) for t in team_review_tasks[:10]]

    # ── Team Workload ──
    tasks_by_user: Dict[str, List[Task]] = defaultdict(list)
    for task in team_tasks:
        if task.assigned_to:
            tasks_by_user[task.assigned_to].append(task)

    team_workload = []
    for uid in visible_user_ids:
        user_tasks = tasks_by_user.get(uid, [])
        user_info = user_map.get(uid)
        if not user_info:
            continue

        active_count = sum(1 for t in user_tasks if (t.status.value if hasattr(t.status, "value") else str(t.status)) not in {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value})
        in_prog = sum(1 for t in user_tasks if (t.status.value if hasattr(t.status, "value") else str(t.status)) == TaskStatus.IN_PROGRESS.value)
        user_overdue = sum(1 for t in user_tasks if _is_overdue(t, now))
        user_due_today = sum(1 for t in user_tasks if _is_due_today(t, now, timezone_name))
        user_blocked = sum(1 for t in user_tasks if blocker_map.get(str(t.id)))
        user_waiting_review = sum(1 for t in user_tasks if (t.status.value if hasattr(t.status, "value") else str(t.status)) == TaskStatus.IN_REVIEW.value)
        user_revision = sum(1 for t in user_tasks if (t.status.value if hasattr(t.status, "value") else str(t.status)) == TaskStatus.REVISION_REQUIRED.value)
        user_critical = sum(1 for t in user_tasks if _is_critical(t))

        workload_level = classify_workload_pressure(user_overdue, user_due_today, active_count)

        team_workload.append({
            "user_id": uid,
            "user_name": f"{user_info.first_name} {user_info.last_name}".strip(),
            "active": active_count,
            "in_progress": in_prog,
            "due_today": user_due_today,
            "overdue": user_overdue,
            "blocked": user_blocked,
            "waiting_for_review": user_waiting_review,
            "revision_required": user_revision,
            "critical": user_critical,
            "workload_level": workload_level,
        })

    team_workload.sort(key=lambda x: (-x["overdue"], -x["active"], x["user_name"].lower()))

    # ── Overdue Tasks (limited) ──
    overdue_tasks = [_task_summary(t) for t in sorted(team_tasks, key=lambda t: t.due_date or utc_now()) if _is_overdue(t, now)][:10]

    # ── Blocked Tasks (limited) ──
    blocked_tasks = []
    for task in team_tasks:
        if blocker_map.get(str(task.id)):
            summary = _task_summary(task)
            summary["is_blocked"] = True
            summary["blocking_dependencies"] = blocker_map[str(task.id)]
            blocked_tasks.append(summary)
    blocked_tasks = blocked_tasks[:10]

    # ── At-Risk Projects ──
    project_ids = list(set(t.project_id for t in team_tasks if t.project_id))
    project_object_ids = list(set(t.project_object_id for t in team_tasks if t.project_object_id))
    all_project_ids = list(set(project_ids + project_object_ids))

    at_risk_projects = []
    if all_project_ids:
        projects = await Project.find({
            "company_id": company_id,
            "$or": [{"project_id": {"$in": all_project_ids}}, {"_id": {"$in": all_project_ids}}],
        }).to_list()
        for project in projects:
            # Get tasks for this project
            project_tasks = [t for t in team_tasks if t.project_id == str(project.project_id or "") or t.project_object_id == str(project.id)]
            health = calculate_project_health(project, project_tasks, now)
            if health.level in {"at_risk", "needs_attention"}:
                at_risk_projects.append({
                    "id": str(project.id),
                    "name": project.name,
                    "project_id": str(project.project_id or project.id),
                    "health_level": health.level,
                    "completion_percentage": health.completion_percentage,
                    "overdue_task_count": health.overdue_task_count,
                    "total_open_tasks": health.total_open_tasks,
                    "reasons": health.reasons,
                })

    at_risk_projects = at_risk_projects[:10]

    # ── Pending Extensions ──
    pending_extensions = []
    if visible_user_ids:
        ext_query = {
            "company_id": company_id,
            "employee_id": {"$in": visible_user_ids},
            "status": TaskExtensionStatus.PENDING.value,
        }
        ext_requests = await TaskExtensionRequest.find(ext_query).sort("-created_at").to_list()
        for ext in ext_requests[:10]:
            employee = user_map.get(ext.employee_id)
            # Find the task
            task_obj = await Task.get(ext.task_id)
            pending_extensions.append({
                "id": str(ext.id),
                "employee_id": ext.employee_id,
                "employee_name": f"{employee.first_name} {employee.last_name}".strip() if employee else "Unknown",
                "task_id": ext.task_id,
                "task_title": task_obj.title if task_obj else "Unknown Task",
                "current_due_date": ext.current_due_date.isoformat() if ext.current_due_date else None,
                "requested_due_date": ext.requested_due_date.isoformat() if ext.requested_due_date else None,
                "reason": ext.reason,
            })

    # ── Management Attention Queue ──
    attention_items = []

    # Critical overdue tasks
    for task in team_tasks:
        if _is_overdue(task, now) and _is_critical(task):
            attention_items.append({
                "type": "critical_overdue_task",
                "severity": "high",
                "title": task.title,
                "reason": _next_action_reason(task, now),
                "task_id": str(task.id),
            })

    # At-risk projects
    for proj in at_risk_projects[:3]:
        attention_items.append({
            "type": "at_risk_project",
            "severity": "high",
            "title": proj["name"],
            "reason": "; ".join(proj["reasons"][:2]),
            "project_id": proj["id"],
        })

    # Overdue tasks (non-critical)
    for task in sorted(team_tasks, key=lambda t: t.due_date or utc_now()):
        if _is_overdue(task, now) and not _is_critical(task):
            attention_items.append({
                "type": "overdue_task",
                "severity": "medium",
                "title": task.title,
                "reason": _next_action_reason(task, now),
                "task_id": str(task.id),
            })

    # Blocked critical/high-priority tasks
    for task in team_tasks:
        if blocker_map.get(str(task.id)) and _is_high_priority(task):
            attention_items.append({
                "type": "blocked_task",
                "severity": "high",
                "title": task.title,
                "reason": f"Blocked by {len(blocker_map[str(task.id)])} incomplete {'dependency' if len(blocker_map[str(task.id)]) == 1 else 'dependencies'}",
                "task_id": str(task.id),
            })

    # Reviews waiting
    for task in team_review_tasks[:5]:
        attention_items.append({
            "type": "review_waiting",
            "severity": "medium",
            "title": task.title,
            "reason": f"Submitted for review (round {getattr(task, 'review_round', 1)})",
            "task_id": str(task.id),
        })

    # Extension approvals needed
    for ext in pending_extensions[:3]:
        attention_items.append({
            "type": "extension_request",
            "severity": "low",
            "title": f"Extension: {ext['task_title']}",
            "reason": ext["reason"][:80] if ext["reason"] else "Extension requested",
            "extension_id": ext["id"],
        })

    # Overloaded employees
    overloaded = [w for w in team_workload if w["workload_level"] == "overloaded"]
    for w in overloaded[:3]:
        attention_items.append({
            "type": "overloaded_employee",
            "severity": "medium",
            "title": w["user_name"],
            "reason": f"{w['active']} active tasks, {w['overdue']} overdue",
            "user_id": w["user_id"],
        })

    return {
        "view": "team_work",
        "summary": {
            "active": active,
            "overdue": overdue,
            "critical": critical,
            "due_today": due_today,
            "blocked": blocked_count,
            "awaiting_review": awaiting_review,
            "revision_required": revision_required,
            "at_risk_projects": len(at_risk_projects),
            "pending_extensions": len(pending_extensions),
        },
        "my_reviews": my_reviews,
        "management_attention": attention_items[:15],
        "team_workload": team_workload,
        "overdue_tasks": overdue_tasks,
        "blocked_tasks": blocked_tasks,
        "at_risk_projects": at_risk_projects,
        "pending_extensions": pending_extensions,
    }


# ── Company-wide Work Overview (Admin/Super Admin) ──────────────────────────

async def build_company_work_overview(current_user: User, now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Company-wide work overview for Admin/Super Admin.
    Delegates to manager overview with full company scope.
    """
    return await build_manager_work_overview(current_user, now)


# ── Dispatcher ──────────────────────────────────────────────────────────────

async def build_work_overview(current_user: User, now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Role-aware dispatcher. Backend determines scope based on authenticated user's role.
    """
    role = current_user.role
    if role == UserRole.EMPLOYEE:
        return await build_employee_work_overview(current_user, now)
    elif role in {UserRole.MANAGER, UserRole.LEAD, UserRole.ADMIN, UserRole.SUB_ADMIN, UserRole.SUPER_ADMIN}:
        return await build_manager_work_overview(current_user, now)
    else:
        return await build_employee_work_overview(current_user, now)
