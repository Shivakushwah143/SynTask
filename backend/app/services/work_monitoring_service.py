"""Read-only, tenant-scoped employee monitoring projection for Work Overview."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException, status

from bson import ObjectId
from beanie import PydanticObjectId

from app.core.clock import utc_now
from app.models.attendance import Attendance, AttendanceStatus, BreakLog
from app.models.department import Department
from app.models.employee_profile import EmployeeProfile
from app.models.eod import EODReport
from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.models.time_tracking import ActiveTimeSession, ActiveTimeSessionStatus, TimeLog
from app.models.timeline import TimelineEvent
from app.models.user import User, UserRole, UserStatus


COMPLETED_STATUSES = {TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value}
ACTIVE_TASK_STATUSES = {TaskStatus.IN_PROGRESS.value, TaskStatus.ASSIGNED.value, TaskStatus.TODO.value}


def _value(item: Any) -> str:
    return str(getattr(item, "value", item) or "")


def _document_ids(values: Iterable[Optional[str]]) -> list[PydanticObjectId]:
    """Convert API/user identity strings before comparing them to Mongo `_id`.

    Project references are human-readable codes (for example `ECP-001`), so only
    genuine ObjectId values are converted. Anything else is skipped instead of
    raising, letting callers keep `$or` lookups across both keys.
    """
    result = []
    for value in values:
        if value and ObjectId.is_valid(str(value)):
            result.append(PydanticObjectId(str(value)))
    return result


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _duration_hours(hours: Any, minutes: Any = None) -> int:
    return int((float(hours or 0) * 3600) + (int(minutes or 0) * 60))


def _parse_period(date_value: Optional[str], start_date: Optional[str], end_date: Optional[str]) -> tuple[date, date, str]:
    if date_value and (start_date or end_date):
        raise HTTPException(status_code=422, detail="Use either date or a date range")
    try:
        if date_value:
            selected = date.today() if date_value == "today" else date.fromisoformat(date_value)
            return selected, selected, "today" if selected == date.today() else "single_day"
        if bool(start_date) != bool(end_date):
            raise ValueError
        if start_date and end_date:
            start, end = date.fromisoformat(start_date), date.fromisoformat(end_date)
            if end < start:
                raise ValueError
            return start, end, "range"
    except ValueError:
        raise HTTPException(status_code=422, detail="Provide a valid date or start_date/end_date range")
    today = date.today()
    return today, today, "today"


async def get_monitoring_scope(current_user: User) -> Dict[str, Any]:
    """Central visibility boundary. User IDs are authorization identities."""
    company_id = str(getattr(current_user, "company_id", "") or "")
    if not company_id:
        # Platform users without an active company context cannot accidentally
        # aggregate across tenants.
        return {"company_id": None, "employee_ids": [], "type": "none", "global": False}

    role = current_user.role
    if role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        people = await User.find({"company_id": company_id, "status": UserStatus.ACTIVE.value}).to_list()
        scope_type, is_global = "company", True
    elif role in {UserRole.MANAGER, UserRole.LEAD}:
        people = await User.find({"company_id": company_id, "status": UserStatus.ACTIVE.value, "ancestors": str(current_user.id)}).to_list()
        scope_type, is_global = "descendants", False
    else:
        people = [current_user] if current_user.status == UserStatus.ACTIVE else []
        scope_type, is_global = "self", False
    return {
        "company_id": company_id,
        "employee_ids": [str(person.id) for person in people],
        "type": scope_type,
        "global": is_global,
    }


async def ensure_employee_in_monitoring_scope(current_user: User, employee_id: str) -> Dict[str, Any]:
    scope = await get_monitoring_scope(current_user)
    if employee_id not in scope["employee_ids"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Monitoring access denied")
    return scope


async def _load_context(company_id: str, employee_ids: list[str], start: date, end: date) -> Dict[str, Any]:
    if not employee_ids:
        return {"users": [], "profiles": [], "departments": [], "attendance": [], "breaks": [], "tasks": [], "timers": [], "logs": [], "eods": [], "projects": []}
    date_values = [(start + timedelta(days=offset)).isoformat() for offset in range((end - start).days + 1)]
    start_dt, end_dt = datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)
    employee_object_ids = _document_ids(employee_ids)
    users, profiles, attendance, tasks, timers, logs, eods = await __import__("asyncio").gather(
        User.find({"company_id": company_id, "_id": {"$in": employee_object_ids}, "status": UserStatus.ACTIVE.value}).to_list(),
        EmployeeProfile.find({"company_id": company_id, "user_id": {"$in": employee_ids}}).to_list(),
        Attendance.find({"company_id": company_id, "employee_id": {"$in": employee_ids}, "date": {"$in": date_values}}).to_list(),
        Task.find({"company_id": company_id, "assigned_to": {"$in": employee_ids}}).to_list(),
        ActiveTimeSession.find({"company_id": company_id, "user_id": {"$in": employee_ids}, "finalized": {"$ne": True}}).to_list(),
        TimeLog.find({"company_id": company_id, "user_id": {"$in": employee_ids}, "voided": {"$ne": True}, "date": {"$gte": start_dt, "$lt": end_dt}}).to_list(),
        EODReport.find({"company_id": company_id, "employee_id": {"$in": employee_ids}, "report_date": {"$gte": start, "$lte": end}}).to_list(),
    )
    attendance_ids = [str(record.id) for record in attendance]
    breaks = await BreakLog.find({"company_id": company_id, "attendance_id": {"$in": attendance_ids}}).to_list() if attendance_ids else []
    department_ids = {profile.department_id for profile in profiles if profile.department_id} | {user.department_id for user in users if user.department_id}
    project_ids = {str(task.project_id) for task in tasks if task.project_id} | {str(timer.project_id) for timer in timers if timer.project_id}
    departments, projects = await __import__("asyncio").gather(
        Department.find({"company_id": company_id, "_id": {"$in": _document_ids(department_ids)}, "deleted_at": None}).to_list() if department_ids else _empty(),
        Project.find({"company_id": company_id, "$or": [{"project_id": {"$in": list(project_ids)}}, {"_id": {"$in": _document_ids(project_ids)}}]}).to_list() if project_ids else _empty(),
    )
    return {"users": users, "profiles": profiles, "departments": departments, "attendance": attendance, "breaks": breaks, "tasks": tasks, "timers": timers, "logs": logs, "eods": eods, "projects": projects}


async def _empty() -> list[Any]:
    return []


def _attendance_status(record: Optional[Attendance]) -> str:
    if not record:
        return "not_checked_in"
    if record.leave_status:
        return "on_leave"
    raw = _value(record.status).lower().replace(" ", "_")
    return {"working": "working", "on_break": "on_break", "checked_out": "checked_out", "offline": "checked_out", "absent": "absent"}.get(raw, "unknown")


def _task_map(tasks: Iterable[Task]) -> Dict[str, Task]:
    return {str(task.id): task for task in tasks}


def _due_day(task: Task) -> Optional[date]:
    value = getattr(task, "due_date", None)
    if isinstance(value, datetime):
        return value.date()
    return value if isinstance(value, date) else None


def _period_tasks(tasks: Iterable[Task], start: date, end: date, today: Optional[date] = None) -> Dict[str, list[Task]]:
    """Split assigned tasks into the period window a supervisor is reviewing.

    A task belongs to the period when its due date falls inside [start, end],
    or when it is still open and overdue before the window opened. Overdue work
    is carried over so late tasks stay visible in every period instead of
    disappearing once a range starts after their due date.

    Overdue is anchored to today as well as the window start, so a future
    window never reports work that is merely due before it as already late.
    Tasks due between today and a future window, and open tasks without a due
    date, are outside the period and are counted separately rather than
    silently dropped.
    """
    reference = min(start, today or date.today())
    due_in_period: list[Task] = []
    carried_overdue: list[Task] = []
    undated_open: list[Task] = []
    for task in tasks:
        day = _due_day(task)
        open_task = _value(task.status) not in COMPLETED_STATUSES
        if day is None:
            if open_task:
                undated_open.append(task)
            continue
        if start <= day <= end:
            due_in_period.append(task)
        elif open_task and day < reference:
            carried_overdue.append(task)
    order = lambda task: _due_day(task) or date.max
    due_in_period.sort(key=order)
    carried_overdue.sort(key=order)
    return {"window": due_in_period, "overdue": carried_overdue, "undated_open": undated_open}


def _snapshot(user: User, context: Dict[str, Any], start: date, end: date) -> Dict[str, Any]:
    uid = str(user.id)
    profile = next((item for item in context["profiles"] if item.user_id == uid), None)
    departments = {str(item.id): item for item in context["departments"]}
    department_id = (profile.department_id if profile else None) or user.department_id
    department = departments.get(str(department_id)) if department_id else None
    records = [item for item in context["attendance"] if item.employee_id == uid]
    today_record = next((item for item in records if item.date == end.isoformat()), None)
    breaks = [item for item in context["breaks"] if str(item.attendance_id) == str(getattr(today_record, "id", ""))]
    user_tasks = [item for item in context["tasks"] if item.assigned_to == uid]
    timers = [item for item in context["timers"] if item.user_id == uid]
    logs = [item for item in context["logs"] if item.user_id == uid]
    eods = [item for item in context["eods"] if item.employee_id == uid]
    project_by_key = {str(item.id): item for item in context["projects"]}
    project_by_key.update({str(item.project_id): item for item in context["projects"] if item.project_id})
    timer = next((item for item in timers if _value(item.status) in {ActiveTimeSessionStatus.RUNNING.value, ActiveTimeSessionStatus.PAUSED.value}), None)
    current = _task_map(user_tasks).get(str(timer.task_id)) if timer else None
    if not current:
        current = next((item for item in sorted(user_tasks, key=lambda task: task.updated_at or task.created_at, reverse=True) if _value(item.status) == TaskStatus.IN_PROGRESS.value), None)
    if not current:
        current = next((item for item in sorted(user_tasks, key=lambda task: task.updated_at or task.created_at, reverse=True) if _value(item.status) in ACTIVE_TASK_STATUSES), None)
    # Task evidence is scoped to the selected period: overdue work is carried
    # over so it stays visible, and every task-derived count below describes
    # the same window as the attendance, time, and EOD evidence.
    period_tasks = _period_tasks(user_tasks, start, end)
    window_tasks = [*period_tasks["overdue"], *period_tasks["window"]]
    status_values = [_value(item.status) for item in window_tasks]
    open_tasks = [item for item in window_tasks if _value(item.status) not in COMPLETED_STATUSES]
    overdue = period_tasks["overdue"]
    blocked = [item for item in open_tasks if bool(item.dependencies)]
    review = [item for item in window_tasks if _value(item.status) == TaskStatus.IN_REVIEW.value]
    revisions = [item for item in window_tasks if _value(item.status) == TaskStatus.REVISION_REQUIRED.value]
    attendance_seconds = sum(int(item.total_working_hours or 0) for item in records)
    break_seconds = sum(int(item.break_duration or 0) for item in records)
    tracked_seconds = sum(_duration_hours(item.hours, item.minutes) for item in logs)
    active_seconds = int(getattr(timer, "accumulated_seconds", 0) or 0) if timer else 0
    attention = []
    if overdue: attention.append({"type": "overdue_work", "severity": "warning", "label": f"{len(overdue)} overdue task{'s' if len(overdue) != 1 else ''}", "count": len(overdue)})
    if blocked: attention.append({"type": "blocked_work", "severity": "critical", "label": f"{len(blocked)} blocked task{'s' if len(blocked) != 1 else ''}", "count": len(blocked)})
    if start == end and not eods and end < date.today(): attention.append({"type": "eod_missing", "severity": "warning", "label": "Daily update missing"})
    if start == end and _attendance_status(today_record) == "not_checked_in": attention.append({"type": "not_checked_in", "severity": "info", "label": "Not checked in"})
    current_project = project_by_key.get(str(getattr(current, "project_id", ""))) if current else None
    manager_id = (profile.reports_to if profile else None) or user.reports_to
    return {
        "user_id": uid, "employee_profile_id": str(profile.id) if profile else None,
        "identity": {"name": user.full_name().strip(), "employee_code": getattr(profile, "employee_number", None), "avatar_url": user.avatar, "designation": getattr(profile, "designation", None) or "Not configured"},
        "department": {"id": str(department.id), "name": department.name} if department else {"id": None, "name": "Unassigned Department"},
        "manager_id": manager_id,
        "attendance": {"status": _attendance_status(today_record), "check_in": _iso(getattr(today_record, "login_time", None)), "check_out": _iso(getattr(today_record, "logout_time", None)), "worked_seconds": attendance_seconds if records else None, "break_seconds": break_seconds if records else None, "is_late": bool(getattr(today_record, "is_late", False)), "source": getattr(today_record, "source", None)},
        "current_work": {"project_id": str(current_project.id) if current_project else getattr(current, "project_id", None), "project_name": current_project.name if current_project else None, "task_id": str(current.id) if current else None, "task_title": current.title if current else None, "status": _value(current.status) if current else None},
        "workload": {"assigned": len(window_tasks), "active": len(open_tasks), "in_progress": status_values.count(TaskStatus.IN_PROGRESS.value), "completed": status_values.count(TaskStatus.COMPLETED.value), "due_in_period": len(period_tasks["window"]), "overdue": len(overdue), "blocked": len(blocked), "in_review": len(review), "revision_required": len(revisions), "undated_open": len(period_tasks["undated_open"])},
        "daily_update": {"status": "submitted" if eods else "missing", "submitted_at": _iso(eods[-1].updated_at) if eods else None},
        "time_tracking": {"attendance_seconds": attendance_seconds if records else None, "tracked_work_seconds": tracked_seconds if logs else None, "break_seconds": break_seconds if records else None, "active_timer_seconds": active_seconds if timer else None},
        "attention": attention, "_records": records, "_breaks": breaks, "_tasks": user_tasks, "_window_tasks": window_tasks, "_logs": logs, "_eods": eods, "_current": current, "_timer": timer,
    }


def _matches(snapshot: Dict[str, Any], *, department_id: Optional[str], designation: Optional[str], employee_id: Optional[str], manager_id: Optional[str], attendance_status: Optional[str], work_status: Optional[str], task_health: Optional[str], project_id: Optional[str], search: Optional[str]) -> bool:
    if department_id and snapshot["department"]["id"] != department_id: return False
    if designation and snapshot["identity"]["designation"] != designation: return False
    if employee_id and snapshot["user_id"] != employee_id: return False
    if manager_id and snapshot["manager_id"] != manager_id: return False
    if attendance_status and snapshot["attendance"]["status"] != attendance_status: return False
    if work_status == "active" and not snapshot["current_work"]["task_id"]: return False
    if work_status == "no_active_work" and snapshot["current_work"]["task_id"]: return False
    if task_health and not any(item["type"] == f"{task_health}_work" for item in snapshot["attention"]): return False
    if project_id and snapshot["current_work"]["project_id"] != project_id: return False
    if search:
        haystack = " ".join(str(item or "") for item in [snapshot["identity"]["name"], snapshot["identity"]["employee_code"], snapshot["identity"]["designation"]]).lower()
        if search.lower() not in haystack: return False
    return True


def _public(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in snapshot.items() if not key.startswith("_")}


async def get_monitoring_overview(current_user: User, **filters: Any) -> Dict[str, Any]:
    start, end, mode = _parse_period(filters.get("date"), filters.get("start_date"), filters.get("end_date"))
    scope = await get_monitoring_scope(current_user)
    context = await _load_context(scope["company_id"], scope["employee_ids"], start, end) if scope["company_id"] else {}
    snapshots = [_snapshot(user, context, start, end) for user in context.get("users", [])]
    if filters.get("employee_id") and filters["employee_id"] not in scope["employee_ids"]:
        raise HTTPException(status_code=403, detail="Monitoring access denied")
    if filters.get("manager_id"):
        if filters["manager_id"] not in set(scope["employee_ids"]) | {str(current_user.id)}:
            raise HTTPException(status_code=403, detail="Monitoring access denied")
        managed_people = await User.find({"company_id": scope["company_id"], "status": UserStatus.ACTIVE.value, "ancestors": filters["manager_id"]}).to_list()
        managed_ids = {str(person.id) for person in managed_people} & set(scope["employee_ids"])
        snapshots = [item for item in snapshots if item["user_id"] in managed_ids]
    match_filters = {key: filters.get(key) for key in ("department_id", "designation", "employee_id", "attendance_status", "work_status", "task_health", "project_id", "search")}
    snapshots = [item for item in snapshots if _matches(item, manager_id=None, **match_filters)]
    snapshots.sort(key=lambda item: (item["department"]["name"].lower(), -len(item["attention"]), item["identity"]["name"].lower()))
    groups: Dict[str, list[Dict[str, Any]]] = defaultdict(list)
    for item in snapshots: groups[item["department"]["name"]].append(_public(item))
    all_items = [_public(item) for item in snapshots]
    summary = {"total_employees": len(all_items), "working": sum(item["attendance"]["status"] == "working" for item in all_items), "on_break": sum(item["attendance"]["status"] == "on_break" for item in all_items), "not_checked_in": sum(item["attendance"]["status"] == "not_checked_in" for item in all_items), "checked_out": sum(item["attendance"]["status"] == "checked_out" for item in all_items), "late": sum(item["attendance"]["is_late"] for item in all_items), "employees_with_overdue_work": sum(item["workload"]["overdue"] > 0 for item in all_items), "employees_with_blocked_work": sum(item["workload"]["blocked"] > 0 for item in all_items), "eod_missing": sum(item["daily_update"]["status"] == "missing" for item in all_items)}
    departments = []
    for name, employees in groups.items():
        departments.append({"department": {"id": employees[0]["department"]["id"], "name": name}, "summary": {"total_employees": len(employees), "working": sum(item["attendance"]["status"] == "working" for item in employees), "on_break": sum(item["attendance"]["status"] == "on_break" for item in employees), "not_working": sum(item["attendance"]["status"] not in {"working", "on_break"} for item in employees), "employees_with_overdue_work": sum(item["workload"]["overdue"] > 0 for item in employees), "employees_with_blocked_work": sum(item["workload"]["blocked"] > 0 for item in employees), "eod_missing": sum(item["daily_update"]["status"] == "missing" for item in employees)}, "employees": employees})
    return {"mode": mode, "period": {"start_date": start.isoformat(), "end_date": end.isoformat()}, "scope": {"type": scope["type"], "visible_employee_count": len(scope["employee_ids"])}, "applied_filters": {key: value for key, value in filters.items() if value}, "summary": summary, "departments": departments, "pagination": {"page": 1, "page_size": len(all_items), "total": len(all_items)}, "generated_at": utc_now().isoformat()}


async def get_monitoring_filters(current_user: User) -> Dict[str, Any]:
    scope = await get_monitoring_scope(current_user)
    if not scope["company_id"]:
        return {"departments": [], "designations": [], "employees": [], "managers": [], "projects": [], "attendance_statuses": [], "work_statuses": [], "task_health_options": []}
    users, profiles, departments, tasks = await __import__("asyncio").gather(
        User.find({"company_id": scope["company_id"], "_id": {"$in": _document_ids(scope["employee_ids"])}, "status": UserStatus.ACTIVE.value}).to_list(),
        EmployeeProfile.find({"company_id": scope["company_id"], "user_id": {"$in": scope["employee_ids"]}}).to_list(),
        Department.find({"company_id": scope["company_id"], "deleted_at": None}).to_list(),
        Task.find({"company_id": scope["company_id"], "assigned_to": {"$in": scope["employee_ids"]}}).to_list(),
    )
    profile_by_user = {item.user_id: item for item in profiles}
    authorized_department_ids = {str((profile_by_user.get(str(user.id)).department_id if profile_by_user.get(str(user.id)) else None) or user.department_id) for user in users if (profile_by_user.get(str(user.id)) and profile_by_user[str(user.id)].department_id) or user.department_id}
    visible_ids = set(scope["employee_ids"])
    manager_ids = {str(user.reports_to) for user in users if user.reports_to and str(user.reports_to) in visible_ids}
    current_user_id = str(current_user.id)
    if current_user_id not in visible_ids and current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        manager_ids.add(current_user_id)
    manager_users = await User.find({"company_id": scope["company_id"], "_id": {"$in": _document_ids(manager_ids)}}).to_list() if manager_ids else []
    project_ids = {str(task.project_id) for task in tasks if task.project_id}
    projects = await Project.find({"company_id": scope["company_id"], "$or": [{"project_id": {"$in": list(project_ids)}}, {"_id": {"$in": _document_ids(project_ids)}}]}).to_list() if project_ids else []
    return {
        "departments": [{"id": str(item.id), "name": item.name} for item in departments if str(item.id) in authorized_department_ids],
        "designations": sorted({item.designation for item in profiles if item.designation}),
        "employees": [{"id": str(item.id), "name": item.full_name().strip()} for item in users],
        "managers": [{"id": str(item.id), "name": item.full_name().strip()} for item in manager_users],
        "projects": [{"id": str(item.id), "name": item.name} for item in projects],
        "attendance_statuses": ["working", "on_break", "not_checked_in", "checked_out", "absent", "on_leave", "unknown"],
        "work_statuses": ["active", "no_active_work"],
        "task_health_options": ["overdue", "blocked"],
    }


def _task_detail(task: Task, projects: Dict[str, Project], logs: Iterable[TimeLog]) -> Dict[str, Any]:
    project = projects.get(str(task.project_id)) or projects.get(str(task.project_object_id))
    tracked = sum(_duration_hours(item.hours, item.minutes) for item in logs if item.task_id == str(task.id))
    return {"task_id": str(task.id), "title": task.title, "project_id": str(project.id) if project else task.project_id, "project_name": project.name if project else None, "status": _value(task.status), "priority": _value(task.priority), "progress_percentage": task.progress_percentage, "due_date": _iso(task.due_date), "tracked_seconds": tracked}


async def get_employee_monitoring_detail(current_user: User, employee_id: str, *, date_value: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
    scope = await ensure_employee_in_monitoring_scope(current_user, employee_id)
    start, end, mode = _parse_period(date_value, start_date, end_date)
    context = await _load_context(scope["company_id"], [employee_id], start, end)
    employee = next((item for item in context["users"] if str(item.id) == employee_id), None)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    snapshot = _snapshot(employee, context, start, end)
    projects = {str(item.id): item for item in context["projects"]}
    projects.update({str(item.project_id): item for item in context["projects"] if item.project_id})
    records, eods = snapshot["_records"], snapshot["_eods"]
    present_days = sum(_attendance_status(item) not in {"absent", "not_checked_in", "unknown"} for item in records)
    attendance: Dict[str, Any]
    if start == end:
        attendance = {**snapshot["attendance"], "mode": "single_day", "overtime_seconds": int(getattr(records[0], "overtime_seconds", 0) or 0) if records else None, "breaks": [{"start": _iso(item.start_time), "end": _iso(item.end_time), "duration_seconds": int(item.duration or 0)} for item in snapshot["_breaks"]]}
    else:
        attendance = {"mode": "range", "present_days": present_days, "absent_days": sum(_attendance_status(item) == "absent" for item in records), "leave_days": sum(_attendance_status(item) == "on_leave" for item in records), "total_work_seconds": sum(int(item.total_working_hours or 0) for item in records), "average_work_seconds": int(sum(int(item.total_working_hours or 0) for item in records) / len(records)) if records else None, "late_days": sum(bool(item.is_late) for item in records), "overtime_seconds": sum(int(item.overtime_seconds or 0) for item in records)}
    tasks = [_task_detail(item, projects, snapshot["_logs"]) for item in snapshot["_window_tasks"]]
    task_by_id = {str(item.id): item for item in snapshot["_tasks"]}
    current = _task_detail(snapshot["_current"], projects, snapshot["_logs"]) if snapshot["_current"] else None
    distribution: Dict[str, int] = defaultdict(int)
    for log in snapshot["_logs"]:
        task = task_by_id.get(log.task_id)
        distribution[task.title if task else "Unassigned work"] += _duration_hours(log.hours, log.minutes)
    daily = eods[-1] if eods else None
    return {"employee": {key: snapshot[key] for key in ("user_id", "employee_profile_id", "identity", "department")}, "period": {"mode": mode, "start_date": start.isoformat(), "end_date": end.isoformat()}, "attendance": attendance, "work": {"current": current, "summary": snapshot["workload"], "scope": {"mode": mode, "start_date": start.isoformat(), "end_date": end.isoformat(), "includes_overdue": True, "undated_open": snapshot["workload"]["undated_open"]}, "tasks": tasks}, "time_tracking": {**snapshot["time_tracking"], "distribution": [{"type": "task", "label": label, "duration_seconds": seconds} for label, seconds in distribution.items()]}, "daily_update": {"status": "submitted", "submitted_at": _iso(daily.updated_at), "worked_on": [daily.worked_on] if daily and daily.worked_on else [], "completed": daily.completed_task_ids if daily else [], "in_progress": daily.in_progress_task_ids if daily else [], "blockers": [daily.blockers] if daily and daily.blockers else [], "tomorrow_plan": [daily.tomorrow_plan] if daily and daily.tomorrow_plan else []} if daily else {"status": "missing"}, "attention": snapshot["attention"], "live_monitoring": {"available": bool(records), "camera_status": getattr(records[-1], "camera_permission_status", None) if records else None, "screen_status": getattr(records[-1], "screen_sharing_status", None) if records else None, "can_open_live_monitor": False}}


async def get_employee_monitoring_timeline(current_user: User, employee_id: str, *, date_value: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, event_type: Optional[str] = None, page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    scope = await ensure_employee_in_monitoring_scope(current_user, employee_id)
    start, end, _ = _parse_period(date_value, start_date, end_date)
    start_dt, end_dt = datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)
    query: Dict[str, Any] = {"company_id": scope["company_id"], "user_id": employee_id, "timestamp": {"$gte": start_dt, "$lt": end_dt}}
    if event_type:
        query["event_type"] = event_type
    total = await TimelineEvent.find(query).count()
    events = await TimelineEvent.find(query).sort("-timestamp").skip((max(page, 1) - 1) * min(max(page_size, 1), 100)).limit(min(max(page_size, 1), 100)).to_list()
    return {"events": [{"event_id": str(item.id), "timestamp": _iso(item.timestamp), "type": _value(item.event_type), "category": _value(item.related_module), "title": item.title, "description": item.description, "entity": {"type": _value(item.related_module), "id": item.related_record_id}, "metadata": item.metadata} for item in events], "pagination": {"page": max(page, 1), "page_size": min(max(page_size, 1), 100), "total": total}}
