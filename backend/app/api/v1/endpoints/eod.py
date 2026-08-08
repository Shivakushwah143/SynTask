"""
End of Day reporting endpoints.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, status

from app.api.dependencies import get_current_user
from app.models.eod import EODReport
from app.models.user import User, UserRole, UserStatus
from app.services.eod_service import (
    assert_eod_view_access,
    assert_not_future_date,
    build_auto_summary,
    create_or_update_eod_report,
    get_leave_for_day,
    serialize_eod_report,
)

router = APIRouter()


@router.get("/today")
async def get_today_eod(current_user: User = Depends(get_current_user)):
    return await _employee_day_payload(current_user, date.today())


@router.get("/mine")
async def get_my_eod(
    report_date: Optional[date] = Query(None),
    current_user: User = Depends(get_current_user),
):
    return await _employee_day_payload(current_user, report_date or date.today())


@router.post("/")
async def submit_eod(
    report_date: Optional[date] = Form(None),
    worked_on: str = Form(...),
    blockers: Optional[str] = Form(""),
    tomorrow_plan: Optional[str] = Form(""),
    current_user: User = Depends(get_current_user),
):
    report, created = await create_or_update_eod_report(
        employee=current_user,
        actor=current_user,
        report_date=report_date or date.today(),
        worked_on=worked_on,
        blockers=blockers,
        tomorrow_plan=tomorrow_plan,
    )
    return {
        "message": "EOD submitted" if created else "EOD updated",
        "report": serialize_eod_report(report, current_user),
    }


@router.get("/")
async def list_eods(
    employee_id: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    team: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    visible = await _visible_employees(current_user)
    if employee_id:
        visible = [employee for employee in visible if str(employee.id) == employee_id]
    if team:
        team_text = team.lower()
        visible = [employee for employee in visible if team_text in (getattr(employee, "team_name", "") or getattr(employee, "department", "") or "").lower()]
    if search:
        search_text = search.lower()
        visible = [employee for employee in visible if search_text in employee.full_name().lower() or search_text in employee.email.lower()]

    employee_ids = [str(employee.id) for employee in visible]
    query = {"employee_id": {"$in": employee_ids}} if employee_ids else {"employee_id": "__none__"}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = current_user.company_id
    if start_date or end_date:
        query["report_date"] = {}
        if start_date:
            query["report_date"]["$gte"] = start_date
        if end_date:
            query["report_date"]["$lte"] = end_date

    reports = await EODReport.find(query).sort("-report_date", "-updated_at").skip(skip).limit(limit).to_list()
    total = await EODReport.find(query).count()
    employees = {str(employee.id): employee for employee in visible}
    return {
        "reports": [serialize_eod_report(report, employees.get(report.employee_id)) for report in reports],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/pending")
async def pending_eods(
    report_date: Optional[date] = Query(None),
    team: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    report_date = report_date or date.today()
    assert_not_future_date(report_date)
    visible = await _visible_employees(current_user)
    if team:
        team_text = team.lower()
        visible = [employee for employee in visible if team_text in (getattr(employee, "team_name", "") or getattr(employee, "department", "") or "").lower()]
    if search:
        search_text = search.lower()
        visible = [employee for employee in visible if search_text in employee.full_name().lower() or search_text in employee.email.lower()]

    pending = []
    for employee in visible:
        existing = await EODReport.find_one(EODReport.employee_id == str(employee.id), EODReport.report_date == report_date)
        if existing:
            continue
        leave = await get_leave_for_day(str(employee.id), report_date)
        pending.append({
            "employee_id": str(employee.id),
            "employee_name": employee.full_name(),
            "email": employee.email,
            "status": "leave" if leave else "pending",
            "report_date": report_date.isoformat(),
        })
    return {"pending": pending}


async def _employee_day_payload(employee: User, report_date: date) -> dict:
    await assert_eod_view_access(employee, employee)
    assert_not_future_date(report_date)
    leave = await get_leave_for_day(str(employee.id), report_date)
    report = await EODReport.find_one(EODReport.employee_id == str(employee.id), EODReport.report_date == report_date)
    summary = await build_auto_summary(str(employee.id), employee.company_id, report_date) if employee.company_id else {}
    return {
        "status": "leave" if leave else "submitted" if report else "not_submitted",
        "report": serialize_eod_report(report, employee) if report else None,
        "auto_summary": {
            "completed_tasks": [_task_payload(task) for task in summary.get("completed_tasks", [])],
            "in_progress_tasks": [_task_payload(task) for task in summary.get("in_progress_tasks", [])],
            "assigned_today_tasks": [_task_payload(task) for task in summary.get("assigned_today_tasks", [])],
            "total_working_seconds": summary.get("total_working_seconds", 0.0),
        },
        "leave": bool(leave),
    }


def _task_payload(task):
    return {"id": str(task.id), "title": task.title, "status": task.status.value, "priority": task.priority.value}


async def _visible_employees(current_user: User) -> list[User]:
    if current_user.role == UserRole.SUPER_ADMIN:
        return await User.find(User.role != UserRole.SUPER_ADMIN, User.status == UserStatus.ACTIVE).to_list()
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must belong to a company")
    if current_user.role == UserRole.EMPLOYEE:
        return [current_user]
    if current_user.role in {UserRole.ADMIN, UserRole.SUB_ADMIN}:
        return await User.find(User.company_id == current_user.company_id, User.status == UserStatus.ACTIVE).to_list()
    if current_user.role in {UserRole.MANAGER, UserRole.LEAD}:
        subordinates = await current_user.get_all_subordinates()
        return [current_user, *subordinates]
    return [current_user]
