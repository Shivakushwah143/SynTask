"""
End of Day report business logic.
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Dict, Optional

from fastapi import HTTPException, status

from app.attendance_domain.models import Attendance
from app.models.eod import EODReport
from app.models.leave import LeaveRequest, LeaveStatus
from app.models.task import Task, TaskStatus
from app.models.timeline import TimelineEventType, TimelineModule
from app.models.user import User, UserRole
from app.services.timeline_service import create_timeline_event
from app.core.clock import utc_now


def build_eod_date_bounds(report_date: date) -> tuple[datetime, datetime]:
    return datetime.combine(report_date, time.min), datetime.combine(report_date, time.max)


def assert_not_future_date(report_date: date) -> None:
    if report_date > date.today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Future date submissions are not allowed")


def assert_edit_window_open(report_date: date) -> None:
    if report_date < date.today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="EOD edit window has closed")


def is_approved_leave_day(leave: Any, report_date: date) -> bool:
    status_value = getattr(getattr(leave, "status", None), "value", getattr(leave, "status", None))
    if status_value != LeaveStatus.APPROVED.value:
        return False
    start = getattr(leave, "start_date").date()
    end = getattr(leave, "end_date").date()
    return start <= report_date <= end


async def assert_eod_view_access(current_user: User, employee: User) -> None:
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if current_user.company_id != employee.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if str(current_user.id) == str(employee.id):
        return
    if current_user.role == UserRole.ADMIN:
        return
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        if str(current_user.id) in (employee.ancestors or []) or employee.reports_to == str(current_user.id):
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


async def get_leave_for_day(employee_id: str, report_date: date) -> Optional[LeaveRequest]:
    start, end = build_eod_date_bounds(report_date)
    return await LeaveRequest.find_one(
        {
            "employee_id": employee_id,
            "status": LeaveStatus.APPROVED.value,
            "start_date": {"$lte": end},
            "end_date": {"$gte": start},
        }
    )


async def build_auto_summary(employee_id: str, company_id: str, report_date: date) -> Dict[str, Any]:
    start, end = build_eod_date_bounds(report_date)
    task_query = {"company_id": company_id, "assigned_to": employee_id}
    tasks = await Task.find(task_query).to_list()
    completed = [task for task in tasks if task.status == TaskStatus.COMPLETED and task.completed_at and start <= task.completed_at <= end]
    in_progress = [task for task in tasks if task.status == TaskStatus.IN_PROGRESS]
    assigned_today = [task for task in tasks if start <= task.created_at <= end]

    attendance = await Attendance.find_one(Attendance.employee_id == employee_id, Attendance.date == report_date.isoformat())
    total_working_seconds = float(getattr(attendance, "total_working_hours", 0.0) or 0.0)

    return {
        "completed_tasks": completed,
        "in_progress_tasks": in_progress,
        "assigned_today_tasks": assigned_today,
        "total_working_seconds": total_working_seconds,
    }


async def create_or_update_eod_report(
    *,
    employee: User,
    actor: User,
    report_date: date,
    worked_on: str,
    blockers: Optional[str],
    tomorrow_plan: Optional[str],
) -> tuple[EODReport, bool]:
    assert_not_future_date(report_date)
    if not employee.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee must belong to a company")

    leave = await get_leave_for_day(str(employee.id), report_date)
    if leave:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="EOD is not required while employee is on approved leave")

    summary = await build_auto_summary(str(employee.id), employee.company_id, report_date)
    report = await EODReport.find_one(EODReport.employee_id == str(employee.id), EODReport.report_date == report_date)
    created = report is None
    if not created:
        assert_edit_window_open(report_date)

    if created:
        report = EODReport(
            employee_id=str(employee.id),
            company_id=employee.company_id,
            report_date=report_date,
            worked_on=worked_on.strip(),
        )

    report.worked_on = worked_on.strip()
    report.blockers = blockers.strip() if blockers else ""
    report.tomorrow_plan = tomorrow_plan.strip() if tomorrow_plan else ""
    report.completed_task_ids = [str(task.id) for task in summary["completed_tasks"]]
    report.in_progress_task_ids = [str(task.id) for task in summary["in_progress_tasks"]]
    report.assigned_today_task_ids = [str(task.id) for task in summary["assigned_today_tasks"]]
    report.total_working_seconds = summary["total_working_seconds"]
    report.updated_at = utc_now()

    if created:
        await report.insert()
    else:
        await report.save()

    await create_timeline_event(
        user_id=report.employee_id,
        company_id=report.company_id,
        event_type=TimelineEventType.EOD_SUBMITTED if created else TimelineEventType.EOD_UPDATED,
        title="EOD Submitted" if created else "EOD Updated",
        description=report.worked_on[:160],
        related_module=TimelineModule.EOD,
        related_record_id=str(report.id),
        actor_id=str(actor.id),
        metadata={"report_date": report.report_date.isoformat()},
        idempotency_key=f"eod:{report.id}:{'submitted' if created else 'updated'}:{int(report.updated_at.timestamp()) if not created else 'initial'}",
    )
    return report, created


def serialize_eod_report(report: EODReport, employee: Optional[User] = None) -> Dict[str, Any]:
    return {
        "id": str(report.id),
        "employee_id": report.employee_id,
        "employee_name": employee.full_name() if employee else None,
        "company_id": report.company_id,
        "report_date": report.report_date.isoformat(),
        "status": "submitted",
        "worked_on": report.worked_on,
        "blockers": report.blockers or "",
        "tomorrow_plan": report.tomorrow_plan or "",
        "task_summary": {
            "completed_count": len(report.completed_task_ids or []),
            "in_progress_count": len(report.in_progress_task_ids or []),
            "assigned_today_count": len(report.assigned_today_task_ids or []),
            "completed_task_ids": report.completed_task_ids or [],
            "in_progress_task_ids": report.in_progress_task_ids or [],
            "assigned_today_task_ids": report.assigned_today_task_ids or [],
        },
        "total_working_seconds": report.total_working_seconds,
        "ai_metadata": report.ai_metadata or {},
        "created_at": report.created_at,
        "updated_at": report.updated_at,
    }

