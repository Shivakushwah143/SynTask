"""
Attendance & Employee Monitoring Endpoints (Phase 1) — Fixed
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi import status as http_status
from datetime import datetime, timedelta
import asyncio
import csv
import io
import json
import logging
from typing import List, Optional, Dict, Set

from app.models.user import User, UserRole, UserStatus, Lead, Manager
from app.attendance_domain.models import (
    Attendance, AttendanceStatus, AttendanceSession, BreakLog,
    MonitoringSession, CameraSession, ScreenShareSession
)
from app.models.timeline import TimelineEventType, TimelineModule
from app.api.dependencies import (
    get_current_user, get_current_company_admin_or_lead, get_current_company_admin
)
from app.core.security import decode_token_with_blacklist_check
from app.services.timeline_service import create_timeline_event
from app.core.clock import utc_now

logger = logging.getLogger(__name__)
router = APIRouter()

# Standard working hours threshold (seconds)
STANDARD_WORK_SECONDS = 8 * 3600  # 28800 seconds = 8 hours
LATE_CLOCK_IN_HOUR_UTC = 9        # 9:00 AM UTC


def compute_work_type(total_seconds: float) -> dict:
    """Compute work type and overtime from total working seconds."""
    if total_seconds >= STANDARD_WORK_SECONDS + 60:  # >8h with 1min grace
        overtime = total_seconds - STANDARD_WORK_SECONDS
        return {
            "work_type": "Overtime",
            "regular_seconds": float(STANDARD_WORK_SECONDS),
            "overtime_seconds": overtime,
        }
    elif total_seconds >= STANDARD_WORK_SECONDS - 60:  # ~8h with 1min grace
        return {
            "work_type": "Full Time",
            "regular_seconds": total_seconds,
            "overtime_seconds": 0.0,
        }
    else:
        return {
            "work_type": "Under Time",
            "regular_seconds": total_seconds,
            "overtime_seconds": 0.0,
        }


async def finalize_active_session(attendance: Attendance, now_utc: datetime) -> float:
    """Close all open AttendanceSessions and return elapsed seconds."""
    active_sessions = await AttendanceSession.find(
        AttendanceSession.attendance_id == str(attendance.id),
        AttendanceSession.end_time == None
    ).to_list()
    elapsed = 0.0
    for active_session in active_sessions:
        active_session.end_time = now_utc
        session_elapsed = max(0.0, (now_utc - active_session.start_time).total_seconds())
        active_session.duration = session_elapsed
        elapsed += session_elapsed
        await active_session.save()
    return elapsed


async def finalize_active_break(attendance: Attendance, now_utc: datetime) -> float:
    """Close all open BreakLogs and return elapsed seconds."""
    active_breaks = await BreakLog.find(
        BreakLog.attendance_id == str(attendance.id),
        BreakLog.end_time == None
    ).to_list()
    elapsed = 0.0
    for active_break in active_breaks:
        active_break.end_time = now_utc
        break_elapsed = max(0.0, (now_utc - active_break.start_time).total_seconds())
        active_break.duration = break_elapsed
        elapsed += break_elapsed
        await active_break.save()
    return elapsed


def normalize_camera_status(value: Optional[str]) -> str:
    if value in {"Connected", "Granted"}:
        return "Connected"
    if value == "Disabled":
        return "Disabled"
    return "Denied"


def normalize_screen_status(value: Optional[str]) -> str:
    if value in {"Sharing", "Granted"}:
        return "Sharing"
    if value == "Stopped":
        return "Stopped"
    return "Denied"


async def get_active_attendance(attendance: Attendance) -> tuple[float, float, dict]:
    now_utc = utc_now()
    working_seconds = attendance.total_working_hours
    break_seconds = attendance.break_duration

    if attendance.status == AttendanceStatus.WORKING:
        active_sessions = await AttendanceSession.find(
            AttendanceSession.attendance_id == str(attendance.id),
            AttendanceSession.end_time == None
        ).to_list()
        working_seconds += sum(
            max(0.0, (now_utc - session.start_time).total_seconds())
            for session in active_sessions
        )
    elif attendance.status == AttendanceStatus.ON_BREAK:
        active_breaks = await BreakLog.find(
            BreakLog.attendance_id == str(attendance.id),
            BreakLog.end_time == None
        ).to_list()
        break_seconds += sum(
            max(0.0, (now_utc - active_break.start_time).total_seconds())
            for active_break in active_breaks
        )

    return working_seconds, break_seconds, compute_work_type(working_seconds)


async def close_monitoring_sessions(attendance: Attendance, now_utc: datetime) -> None:
    monitoring_sessions = await MonitoringSession.find(
        MonitoringSession.attendance_id == str(attendance.id),
        MonitoringSession.end_time == None
    ).to_list()
    for monitoring_session in monitoring_sessions:
        monitoring_session.end_time = now_utc
        monitoring_session.status = "Stopped"
        await monitoring_session.save()

        camera_sessions = await CameraSession.find(
            CameraSession.monitoring_session_id == str(monitoring_session.id),
            CameraSession.end_time == None
        ).to_list()
        for camera_session in camera_sessions:
            camera_session.end_time = now_utc
            camera_session.status = "Disabled"
            await camera_session.save()

        screen_sessions = await ScreenShareSession.find(
            ScreenShareSession.monitoring_session_id == str(monitoring_session.id),
            ScreenShareSession.end_time == None
        ).to_list()
        for screen_session in screen_sessions:
            screen_session.end_time = now_utc
            screen_session.status = "Stopped"
            await screen_session.save()


async def user_can_monitor(monitor: User, employee: User) -> bool:
    if monitor.role == UserRole.SUPER_ADMIN:
        return employee.role != UserRole.SUPER_ADMIN
    if monitor.role == UserRole.ADMIN:
        return employee.company_id == monitor.company_id and employee.role != UserRole.ADMIN
    if employee.company_id != monitor.company_id:
        return False
    if monitor.role in [UserRole.MANAGER, UserRole.LEAD]:
        monitor_id = str(monitor.id)
        if employee.reports_to == monitor_id or monitor_id in (employee.ancestors or []):
            return True
        if monitor.role == UserRole.LEAD and getattr(employee, "lead_id", None) == monitor_id:
            return True
        if monitor.role == UserRole.MANAGER and employee.role == UserRole.EMPLOYEE and getattr(employee, "lead_id", None):
            lead = await User.get(employee.lead_id)
            if lead and lead.company_id == monitor.company_id:
                return lead.reports_to == monitor_id or monitor_id in (lead.ancestors or [])
    return False


async def get_monitorable_users(current_user: User) -> List[User]:
    company_id = current_user.company_id
    if current_user.role == UserRole.SUPER_ADMIN:
        return await User.find(User.role != UserRole.SUPER_ADMIN).to_list()
    if current_user.role == UserRole.ADMIN:
        return await User.find(User.company_id == company_id, User.role != UserRole.ADMIN).to_list()
    if current_user.role not in [UserRole.MANAGER, UserRole.LEAD]:
        return []

    candidates = await User.find(
        User.company_id == company_id,
        User.status == UserStatus.ACTIVE,
        User.role != UserRole.ADMIN
    ).to_list()
    visible = []
    for candidate in candidates:
        if str(candidate.id) != str(current_user.id) and await user_can_monitor(current_user, candidate):
            visible.append(candidate)
    return visible


async def build_status_message(user: User, attendance: Attendance, message_type: str = "status_changed") -> dict:
    working_seconds, break_seconds, wt = await get_active_attendance(attendance)
    return {
        "type": message_type,
        "employee_id": str(user.id),
        "employee_name": user.full_name(),
        "status": attendance.status.value,
        "camera_status": attendance.camera_permission_status,
        "screen_share_status": attendance.screen_sharing_status,
        "total_working_seconds": working_seconds,
        "break_seconds": break_seconds,
        "work_type": wt["work_type"],
        "overtime_seconds": wt["overtime_seconds"],
        "timestamp": utc_now().isoformat()
    }


# -----------------------------------------------------------------------------
# WebSocket Connection Manager
# -----------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        # Maps user_id -> list of active WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Maps user_id -> User model objects for quick lookup
        self.connection_users: Dict[str, User] = {}
        # Maps employee_id -> set of WebSocket connections of managers watching them
        self.stream_subscribers: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user: User):
        await websocket.accept()
        user_id = str(user.id)
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        self.connection_users[user_id] = user
        logger.info(f"WebSocket connected for user {user.email} (Role: {user.role})")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                if user_id in self.connection_users:
                    del self.connection_users[user_id]

        # Clean up subscriptions where this socket was subscribing
        for emp_id in list(self.stream_subscribers.keys()):
            if websocket in self.stream_subscribers[emp_id]:
                self.stream_subscribers[emp_id].remove(websocket)
                if not self.stream_subscribers[emp_id]:
                    del self.stream_subscribers[emp_id]

        logger.info(f"WebSocket disconnected for user_id {user_id}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception:
            pass

    async def broadcast_monitoring_update(self, employee: User, message: dict):
        """Broadcast monitoring state only to users allowed to monitor this employee."""
        for user_id, websockets in list(self.active_connections.items()):
            user = self.connection_users.get(user_id)
            if user and await user_can_monitor(user, employee):
                for ws in list(websockets):
                    await self.send_personal_message(message, ws)

    async def forward_frame_to_subscribers(self, employee_id: str, frame_type: str, frame_data: str):
        """Forwards screen or camera base64 frames ONLY to managers actively watching this employee"""
        subscribers = self.stream_subscribers.get(employee_id, set())
        if subscribers:
            message = {
                "type": f"{frame_type}_update",
                "employee_id": employee_id,
                "data": frame_data,
                "timestamp": utc_now().isoformat()
            }
            dead = set()
            for ws in list(subscribers):
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.add(ws)
            subscribers -= dead

    def subscribe_manager(self, manager_ws: WebSocket, employee_id: str):
        if employee_id not in self.stream_subscribers:
            self.stream_subscribers[employee_id] = set()
        self.stream_subscribers[employee_id].add(manager_ws)
        logger.info(f"Manager socket subscribed to employee {employee_id} stream")

    def unsubscribe_manager(self, manager_ws: WebSocket, employee_id: str):
        if employee_id in self.stream_subscribers:
            if manager_ws in self.stream_subscribers[employee_id]:
                self.stream_subscribers[employee_id].remove(manager_ws)
                if not self.stream_subscribers[employee_id]:
                    del self.stream_subscribers[employee_id]
        logger.info(f"Manager socket unsubscribed from employee {employee_id} stream")


manager = ConnectionManager()


async def delayed_logout_check(user_id: str, user: User, company_id: str):
    """Wait for a 10s grace period and mark employee Offline if they have not reconnected"""
    await asyncio.sleep(10)
    # Check if there are active connections now
    if user_id in manager.active_connections:
        logger.info(f"User {user.email} reconnected within grace period. Disconnect ignored.")
        return

    logger.info(f"User {user.email} did not reconnect within grace period. Finalizing shift.")
    today_str = utc_now().strftime("%Y-%m-%d")
    attendance = await Attendance.find_one(
        Attendance.employee_id == user_id,
        Attendance.date == today_str
    )
    if attendance and attendance.status in [AttendanceStatus.WORKING, AttendanceStatus.ON_BREAK]:
        now_utc = utc_now()

        if attendance.status == AttendanceStatus.WORKING:
            elapsed = await finalize_active_session(attendance, now_utc)
            attendance.total_working_hours += elapsed
        elif attendance.status == AttendanceStatus.ON_BREAK:
            elapsed_break = await finalize_active_break(attendance, now_utc)
            attendance.break_duration += elapsed_break

        # Close MonitoringSession
        monitoring_session = await MonitoringSession.find_one(
            MonitoringSession.attendance_id == str(attendance.id),
            MonitoringSession.end_time == None
        )
        if monitoring_session:
            monitoring_session.end_time = now_utc
            monitoring_session.status = "Stopped"
            await monitoring_session.save()

        wt = compute_work_type(attendance.total_working_hours)
        attendance.work_type = wt["work_type"]
        attendance.overtime_seconds = wt["overtime_seconds"]
        attendance.status = AttendanceStatus.OFFLINE
        attendance.logout_time = now_utc
        attendance.monitoring_end_time = now_utc
        attendance.camera_permission_status = "Denied"
        attendance.screen_sharing_status = "Denied"
        attendance.updated_at = now_utc
        await attendance.save()

        await create_timeline_event(
            user_id=user_id,
            company_id=company_id,
            event_type=TimelineEventType.ATTENDANCE_CHECK_OUT,
            title="Attendance Check-Out",
            description="Stopped work session",
            related_module=TimelineModule.ATTENDANCE,
            related_record_id=str(attendance.id),
            actor_id=user_id,
            timestamp=attendance.logout_time or now_utc,
            metadata={
                "date": today_str,
                "total_working_seconds": attendance.total_working_hours,
                "work_type": attendance.work_type,
                "source": "disconnect_timeout",
            },
            idempotency_key=f"attendance:{attendance.id}:check_out",
        )

        broadcast_msg = {
            "type": "status_changed",
            "employee_id": user_id,
            "employee_name": user.full_name(),
            "status": AttendanceStatus.OFFLINE.value,
            "timestamp": now_utc.isoformat()
        }
        await manager.broadcast_to_company_managers(company_id, broadcast_msg)


# -----------------------------------------------------------------------------
# WebSocket Handler Endpoint
# -----------------------------------------------------------------------------
@router.websocket("/ws")
async def attendance_websocket(websocket: WebSocket, token: str = Query(...)):
    user: Optional[User] = None
    user_id_str: str = ""

    # 1. Authenticate WS Connection
    try:
        payload = await decode_token_with_blacklist_check(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION)
            return

        user = await User.get(user_id)
        if not user or user.status != UserStatus.ACTIVE:
            await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION)
            return

        user_id_str = str(user.id)
        await manager.connect(websocket, user)
    except Exception as e:
        logger.error(f"WebSocket auth failed: {str(e)}")
        try:
            await websocket.close(code=http_status.WS_1008_POLICY_VIOLATION)
        except Exception:
            pass
        return

    # 2. Main WS Message Loop
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = message.get("type")
            if not msg_type:
                continue

            # HEARTBEAT
            if msg_type == "heartbeat":
                await manager.send_personal_message({"type": "heartbeat_ack"}, websocket)
                continue

            # SUBSCRIBE / UNSUBSCRIBE (Managers watching an employee)
            elif msg_type == "subscribe_employee":
                target_emp_id = message.get("employee_id")
                if target_emp_id:
                    target_employee = await User.get(target_emp_id)
                    if target_employee and await user_can_monitor(user, target_employee):
                        manager.subscribe_manager(websocket, target_emp_id)
                    else:
                        await manager.send_personal_message({
                            "type": "subscription_denied",
                            "employee_id": target_emp_id,
                            "detail": "You are not allowed to monitor this employee"
                        }, websocket)
                continue

            elif msg_type == "unsubscribe_employee":
                target_emp_id = message.get("employee_id")
                if target_emp_id:
                    manager.unsubscribe_manager(websocket, target_emp_id)
                continue

            # FRAME snap uploads (Camera / Screen sharing frames)
            elif msg_type == "camera_frame":
                frame_data = message.get("data")
                if frame_data:
                    await manager.forward_frame_to_subscribers(user_id_str, "camera", frame_data)
                continue

            elif msg_type == "screen_frame":
                frame_data = message.get("data")
                if frame_data:
                    await manager.forward_frame_to_subscribers(user_id_str, "screen", frame_data)
                continue

            elif msg_type == "media_status":
                today_str = utc_now().strftime("%Y-%m-%d")
                attendance = await Attendance.find_one(
                    Attendance.employee_id == user_id_str,
                    Attendance.date == today_str
                )
                if attendance and attendance.status == AttendanceStatus.WORKING:
                    now_utc = utc_now()
                    if "camera_status" in message:
                        attendance.camera_permission_status = normalize_camera_status(message.get("camera_status"))
                    if "screen_share_status" in message:
                        attendance.screen_sharing_status = normalize_screen_status(message.get("screen_share_status"))
                    attendance.updated_at = now_utc
                    await attendance.save()
                    await manager.broadcast_monitoring_update(user, await build_status_message(user, attendance))
                continue

            # WORKFLOW EVENTS (Start work, pause, resume, stop)
            today_str = utc_now().strftime("%Y-%m-%d")

            if msg_type == "start_work":
                camera_perm = normalize_camera_status(message.get("camera_permission", "Denied"))
                screen_perm = normalize_screen_status(message.get("screen_share_permission", "Denied"))
                now_utc = utc_now()
                should_record_check_in = False

                # Check for existing record
                attendance = await Attendance.find_one(
                    Attendance.employee_id == user_id_str,
                    Attendance.date == today_str
                )

                if not attendance:
                    # Determine late status
                    is_late = now_utc.hour >= LATE_CLOCK_IN_HOUR_UTC

                    attendance = Attendance(
                        employee_id=user_id_str,
                        company_id=user.company_id,
                        date=today_str,
                        login_time=now_utc,
                        status=AttendanceStatus.WORKING,
                        is_late=is_late,
                        monitoring_start_time=now_utc,
                        camera_permission_status=camera_perm,
                        screen_sharing_status=screen_perm
                    )
                    should_record_check_in = True
                else:
                    previous_status = attendance.status
                    if previous_status == AttendanceStatus.WORKING:
                        attendance.total_working_hours += await finalize_active_session(attendance, now_utc)
                    elif previous_status == AttendanceStatus.ON_BREAK:
                        attendance.break_duration += await finalize_active_break(attendance, now_utc)
                    await close_monitoring_sessions(attendance, now_utc)
                    attendance.status = AttendanceStatus.WORKING
                    attendance.camera_permission_status = camera_perm
                    attendance.screen_sharing_status = screen_perm
                    attendance.monitoring_start_time = attendance.monitoring_start_time or now_utc
                    attendance.monitoring_end_time = None
                    attendance.logout_time = None
                    attendance.updated_at = now_utc
                    if not attendance.login_time:
                        attendance.login_time = now_utc
                        attendance.is_late = now_utc.hour >= LATE_CLOCK_IN_HOUR_UTC
                        should_record_check_in = True

                await attendance.save()

                if should_record_check_in:
                    await create_timeline_event(
                        user_id=user_id_str,
                        company_id=user.company_id,
                        event_type=TimelineEventType.ATTENDANCE_CHECK_IN,
                        title="Attendance Check-In",
                        description="Started work session",
                        related_module=TimelineModule.ATTENDANCE,
                        related_record_id=str(attendance.id),
                        actor_id=user_id_str,
                        timestamp=attendance.login_time or now_utc,
                        metadata={"date": today_str, "is_late": attendance.is_late},
                        idempotency_key=f"attendance:{attendance.id}:check_in",
                    )

                # Start AttendanceSession
                session = AttendanceSession(
                    attendance_id=str(attendance.id),
                    employee_id=user_id_str,
                    company_id=user.company_id,
                    start_time=now_utc
                )
                await session.insert()

                # Start MonitoringSession
                monitoring_session = MonitoringSession(
                    attendance_id=str(attendance.id),
                    employee_id=user_id_str,
                    company_id=user.company_id,
                    start_time=now_utc,
                    status="Active"
                )
                await monitoring_session.insert()

                # Log Camera / Screen Share status
                if camera_perm == "Connected":
                    cam_session = CameraSession(
                        monitoring_session_id=str(monitoring_session.id),
                        employee_id=user_id_str,
                        start_time=now_utc,
                        status="Connected"
                    )
                    await cam_session.insert()

                if screen_perm == "Sharing":
                    screen_session = ScreenShareSession(
                        monitoring_session_id=str(monitoring_session.id),
                        employee_id=user_id_str,
                        start_time=now_utc,
                        status="Sharing"
                    )
                    await screen_session.insert()

                # Broadcast status change to managers
                await manager.broadcast_monitoring_update(user, await build_status_message(user, attendance))

                # Acknowledge client with seeding data
                working_seconds, break_seconds, wt = await get_active_attendance(attendance)
                await manager.send_personal_message({
                    "type": "start_work_ack",
                    "status": "Working",
                    "attendance_id": str(attendance.id),
                    "login_time": attendance.login_time.isoformat() if attendance.login_time else None,
                    "is_late": attendance.is_late,
                    "total_working_seconds": working_seconds,
                    "break_seconds": break_seconds,
                    "work_type": wt["work_type"],
                    "overtime_seconds": wt["overtime_seconds"],
                }, websocket)

            elif msg_type == "pause_work":
                attendance = await Attendance.find_one(
                    Attendance.employee_id == user_id_str,
                    Attendance.date == today_str
                )
                if attendance and attendance.status == AttendanceStatus.WORKING:
                    now_utc = utc_now()

                    # End active AttendanceSession and accumulate time
                    elapsed = await finalize_active_session(attendance, now_utc)
                    attendance.total_working_hours += elapsed

                    attendance.status = AttendanceStatus.ON_BREAK
                    attendance.updated_at = now_utc
                    await attendance.save()

                    # Start BreakLog
                    break_log = BreakLog(
                        attendance_id=str(attendance.id),
                        employee_id=user_id_str,
                        company_id=user.company_id,
                        start_time=now_utc
                    )
                    await break_log.insert()

                    wt = compute_work_type(attendance.total_working_hours)
                    await manager.broadcast_monitoring_update(user, await build_status_message(user, attendance))

                    await manager.send_personal_message({
                        "type": "pause_work_ack",
                        "status": "On Break",
                        "total_working_seconds": attendance.total_working_hours,
                        "work_type": wt["work_type"],
                        "overtime_seconds": wt["overtime_seconds"],
                    }, websocket)

            elif msg_type == "resume_work":
                attendance = await Attendance.find_one(
                    Attendance.employee_id == user_id_str,
                    Attendance.date == today_str
                )
                if attendance and attendance.status == AttendanceStatus.ON_BREAK:
                    now_utc = utc_now()

                    # End active BreakLog
                    elapsed_break = await finalize_active_break(attendance, now_utc)
                    attendance.break_duration += elapsed_break

                    attendance.status = AttendanceStatus.WORKING
                    attendance.updated_at = now_utc
                    await attendance.save()

                    # Start new AttendanceSession
                    session = AttendanceSession(
                        attendance_id=str(attendance.id),
                        employee_id=user_id_str,
                        company_id=user.company_id,
                        start_time=now_utc
                    )
                    await session.insert()

                    await manager.broadcast_monitoring_update(user, await build_status_message(user, attendance))

                    await manager.send_personal_message({
                        "type": "resume_work_ack",
                        "status": "Working",
                        "break_seconds": attendance.break_duration,
                    }, websocket)

            elif msg_type == "stop_work":
                attendance = await Attendance.find_one(
                    Attendance.employee_id == user_id_str,
                    Attendance.date == today_str
                )
                if attendance and attendance.status in [AttendanceStatus.WORKING, AttendanceStatus.ON_BREAK]:
                    now_utc = utc_now()

                    if attendance.status == AttendanceStatus.WORKING:
                        elapsed = await finalize_active_session(attendance, now_utc)
                        attendance.total_working_hours += elapsed
                    elif attendance.status == AttendanceStatus.ON_BREAK:
                        elapsed_break = await finalize_active_break(attendance, now_utc)
                        attendance.break_duration += elapsed_break

                    await close_monitoring_sessions(attendance, now_utc)

                    # Compute and persist work type
                    wt = compute_work_type(attendance.total_working_hours)
                    attendance.work_type = wt["work_type"]
                    attendance.overtime_seconds = wt["overtime_seconds"]

                    attendance.status = AttendanceStatus.OFFLINE
                    attendance.logout_time = now_utc
                    attendance.monitoring_end_time = now_utc
                    attendance.camera_permission_status = "Denied"
                    attendance.screen_sharing_status = "Denied"
                    attendance.updated_at = now_utc
                    await attendance.save()

                    await create_timeline_event(
                        user_id=user_id_str,
                        company_id=user.company_id,
                        event_type=TimelineEventType.ATTENDANCE_CHECK_OUT,
                        title="Attendance Check-Out",
                        description="Stopped work session",
                        related_module=TimelineModule.ATTENDANCE,
                        related_record_id=str(attendance.id),
                        actor_id=user_id_str,
                        timestamp=attendance.logout_time or now_utc,
                        metadata={
                            "date": today_str,
                            "total_working_seconds": attendance.total_working_hours,
                            "work_type": attendance.work_type,
                        },
                        idempotency_key=f"attendance:{attendance.id}:check_out",
                    )

                    await manager.broadcast_monitoring_update(user, await build_status_message(user, attendance))

                    await manager.send_personal_message({
                        "type": "stop_work_ack",
                        "status": "Offline",
                        "total_working_seconds": attendance.total_working_hours,
                        "work_type": wt["work_type"],
                        "overtime_seconds": wt["overtime_seconds"],
                    }, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id_str)

        # Automatic logout on websocket disconnect (tab close/navigation)
        if user and user.role in [UserRole.EMPLOYEE, UserRole.MANAGER]:
            asyncio.create_task(delayed_logout_check(user_id_str, user, user.company_id))


# -----------------------------------------------------------------------------
# HTTP Endpoints - Today's Status
# -----------------------------------------------------------------------------
@router.get("/today")
async def get_today_attendance(current_user: User = Depends(get_current_user)):
    """Fetch current employee's attendance record for today"""
    today_str = utc_now().strftime("%Y-%m-%d")
    attendance = await Attendance.find_one(
        Attendance.employee_id == str(current_user.id),
        Attendance.date == today_str
    )

    if not attendance:
        return {
            "success": True,
            "data": {
                "status": "Offline",
                "total_working_hours": 0.0,
                "break_duration": 0.0,
                "overtime_seconds": 0.0,
                "work_type": "Under Time",
                "is_late": False,
                "camera_permission_status": "Denied",
                "screen_sharing_status": "Denied",
                "login_time": None,
                "logout_time": None,
            }
        }

    total_seconds, break_seconds, wt = await get_active_attendance(attendance)

    return {
        "success": True,
        "data": {
            "id": str(attendance.id),
            "status": attendance.status.value,
            "is_late": attendance.is_late,
            "login_time": attendance.login_time.isoformat() if attendance.login_time else None,
            "logout_time": attendance.logout_time.isoformat() if attendance.logout_time else None,
            "total_working_hours": total_seconds,
            "break_duration": break_seconds,
            "overtime_seconds": wt["overtime_seconds"],
            "work_type": wt["work_type"],
            "regular_seconds": wt["regular_seconds"],
            "camera_permission_status": attendance.camera_permission_status,
            "screen_sharing_status": attendance.screen_sharing_status,
        }
    }


# -----------------------------------------------------------------------------
# HTTP Endpoints - Timesheet Summary (Attendance-enriched)
# -----------------------------------------------------------------------------
@router.get("/timesheet-summary")
async def get_timesheet_summary(
    date_filter: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today"),
    current_user: User = Depends(get_current_user)
):
    """Returns today's attendance enriched for Timesheet page display."""
    if date_filter:
        try:
            target_date = datetime.strptime(date_filter, "%Y-%m-%d")
            today_str = date_filter
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        today_str = utc_now().strftime("%Y-%m-%d")

    attendance = await Attendance.find_one(
        Attendance.employee_id == str(current_user.id),
        Attendance.date == today_str
    )

    if not attendance:
        return {
            "success": True,
            "data": {
                "date": today_str,
                "status": "Absent",
                "is_late": False,
                "login_time": None,
                "logout_time": None,
                "total_working_seconds": 0.0,
                "regular_seconds": 0.0,
                "overtime_seconds": 0.0,
                "break_seconds": 0.0,
                "work_type": "Under Time",
                "standard_hours": STANDARD_WORK_SECONDS,
            }
        }

    total_seconds, break_seconds, wt = await get_active_attendance(attendance)

    return {
        "success": True,
        "data": {
            "date": today_str,
            "status": attendance.status.value,
            "is_late": attendance.is_late,
            "login_time": attendance.login_time.isoformat() if attendance.login_time else None,
            "logout_time": attendance.logout_time.isoformat() if attendance.logout_time else None,
            "total_working_seconds": total_seconds,
            "regular_seconds": wt["regular_seconds"],
            "overtime_seconds": wt["overtime_seconds"],
            "break_seconds": break_seconds,
            "work_type": wt["work_type"],
            "standard_hours": STANDARD_WORK_SECONDS,
        }
    }


# -----------------------------------------------------------------------------
# HTTP Endpoints - Live Monitoring Panel
# -----------------------------------------------------------------------------
@router.get("/live")
async def get_live_monitoring(current_user: User = Depends(get_current_user)):
    """Fetch list of all employees and their live monitoring statuses"""
    company_id = current_user.company_id
    if not company_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="User does not belong to any company")

    users = await get_monitorable_users(current_user)
    if not users and current_user.role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD]:
        raise HTTPException(status_code=403, detail="Only Managers/Admins can access live monitoring dashboard")

    today_str = utc_now().strftime("%Y-%m-%d")
    live_dashboard = []

    for employee in users:
        attendance = await Attendance.find_one(
            Attendance.employee_id == str(employee.id),
            Attendance.date == today_str
        )

        status = "Offline"
        working_hours = 0.0
        break_duration = 0.0
        overtime_seconds = 0.0
        work_type = "Under Time"
        camera_status = "Denied"
        screen_status = "Denied"
        login_time = None
        is_late = False

        if attendance:
            status = attendance.status.value
            working_hours = attendance.total_working_hours
            break_duration = attendance.break_duration
            camera_status = attendance.camera_permission_status
            screen_status = attendance.screen_sharing_status
            login_time = attendance.login_time.isoformat() if attendance.login_time else None
            is_late = attendance.is_late

            working_hours, break_duration, wt = await get_active_attendance(attendance)
            work_type = wt["work_type"]
            overtime_seconds = wt["overtime_seconds"]

        live_dashboard.append({
            "employee_id": str(employee.id),
            "employee_name": employee.full_name(),
            "email": employee.email,
            "department": getattr(employee, "department", "General"),
            "role": employee.role.value,
            "status": status,
            "is_late": is_late,
            "login_time": login_time,
            "total_working_hours": working_hours,
            "break_duration": break_duration,
            "work_type": work_type,
            "overtime_seconds": overtime_seconds,
            "camera_permission_status": camera_status,
            "screen_sharing_status": screen_status,
        })

    return {"success": True, "data": live_dashboard}


# -----------------------------------------------------------------------------
# HTTP Endpoints - Attendance History & Reports
# -----------------------------------------------------------------------------
@router.get("/history")
async def get_attendance_history(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """Fetch attendance record history logs"""
    company_id = current_user.company_id

    query = {}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = company_id

    if current_user.role == UserRole.EMPLOYEE:
        query["employee_id"] = str(current_user.id)
    elif employee_id:
        query["employee_id"] = employee_id

    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}

    records = await Attendance.find(query).sort("-date").to_list()

    enriched_records = []
    for r in records:
        emp = await User.get(r.employee_id)
        wt = compute_work_type(r.total_working_hours)
        enriched_records.append({
            "id": str(r.id),
            "employee_id": r.employee_id,
            "employee_name": emp.full_name() if emp else "Unknown Employee",
            "email": emp.email if emp else "",
            "date": r.date,
            "login_time": r.login_time.isoformat() if r.login_time else None,
            "logout_time": r.logout_time.isoformat() if r.logout_time else None,
            "total_working_hours": r.total_working_hours,
            "break_duration": r.break_duration,
            "overtime_seconds": r.overtime_seconds,
            "work_type": r.work_type or wt["work_type"],
            "is_late": r.is_late,
            "status": r.status.value,
            "camera_permission_status": r.camera_permission_status,
            "screen_sharing_status": r.screen_sharing_status,
        })

    return {"success": True, "data": enriched_records}


@router.get("/reports/export")
async def export_attendance_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    employee_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_company_admin_or_lead)
):
    """Exports attendance logs as a CSV file download"""
    company_id = current_user.company_id
    query = {"company_id": company_id}

    if employee_id:
        query["employee_id"] = employee_id
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}

    records = await Attendance.find(query).sort("-date").to_list()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Date", "Employee Name", "Email", "Login Time", "Logout Time",
        "Working Hours (Hrs)", "Regular Hours (Hrs)", "Overtime (Hrs)",
        "Break Duration (Hrs)", "Work Type", "Late Clock-in",
        "Final Status", "Camera Shared", "Screen Shared"
    ])

    for r in records:
        emp = await User.get(r.employee_id)
        name = emp.full_name() if emp else "Unknown"
        email = emp.email if emp else ""

        working_hrs = round(r.total_working_hours / 3600.0, 2)
        regular_hrs = round(min(r.total_working_hours, STANDARD_WORK_SECONDS) / 3600.0, 2)
        overtime_hrs = round(r.overtime_seconds / 3600.0, 2)
        break_hrs = round(r.break_duration / 3600.0, 2)

        writer.writerow([
            r.date,
            name,
            email,
            r.login_time.strftime("%Y-%m-%d %H:%M:%S") if r.login_time else "",
            r.logout_time.strftime("%Y-%m-%d %H:%M:%S") if r.logout_time else "",
            working_hrs,
            regular_hrs,
            overtime_hrs,
            break_hrs,
            r.work_type or "Under Time",
            "Yes" if r.is_late else "No",
            r.status.value,
            r.camera_permission_status,
            r.screen_sharing_status,
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=attendance_report_{start_date}_to_{end_date}.csv"}
    )


# -----------------------------------------------------------------------------
# HTTP Endpoints - Company Dashboard Stats
# -----------------------------------------------------------------------------
@router.get("/dashboard-stats")
async def get_dashboard_statistics(current_user: User = Depends(get_current_user)):
    """Fetch aggregated counters for dashboard widgets"""
    company_id = current_user.company_id
    if not company_id and current_user.role != UserRole.SUPER_ADMIN:
        logger.info(
            "attendance.dashboard_stats.no_company user_id=%s role=%s",
            getattr(current_user, "id", None),
            getattr(current_user, "role", None),
        )
        return {
            "success": True,
            "data": {
                "total_employees": 0,
                "present_today": 0,
                "working_now": 0,
                "on_break": 0,
                "offline": 0,
                "late_today": 0,
            },
        }

    today_str = utc_now().strftime("%Y-%m-%d")

    user_query = {"role": UserRole.EMPLOYEE.value}
    if current_user.role != UserRole.SUPER_ADMIN:
        user_query["company_id"] = company_id

    logger.info(
        "attendance.dashboard_stats.start user_id=%s role=%s company_id=%s date=%s",
        getattr(current_user, "id", None),
        getattr(current_user, "role", None),
        company_id,
        today_str,
    )

    try:
        total_employees = await User.find(user_query).count()
    except Exception as exc:
        logger.exception(
            "attendance.dashboard_stats.user_count_failed user_id=%s company_id=%s query=%s",
            getattr(current_user, "id", None),
            company_id,
            user_query,
        )
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Attendance dashboard employee count is temporarily unavailable",
        ) from exc

    working_now = 0
    on_break = 0
    present_today = 0
    late_today = 0

    attendance_query = {"date": today_str}
    if current_user.role != UserRole.SUPER_ADMIN:
        attendance_query["company_id"] = company_id

    try:
        attendance_collection = Attendance.get_pymongo_collection()
        present_today = await attendance_collection.count_documents(attendance_query)
        working_now = await attendance_collection.count_documents({
            **attendance_query,
            "status": AttendanceStatus.WORKING.value,
        })
        on_break = await attendance_collection.count_documents({
            **attendance_query,
            "status": AttendanceStatus.ON_BREAK.value,
        })
        late_today = await attendance_collection.count_documents({
            **attendance_query,
            "is_late": True,
        })
    except Exception as exc:
        logger.exception(
            "attendance.dashboard_stats.attendance_query_failed user_id=%s company_id=%s query=%s",
            getattr(current_user, "id", None),
            company_id,
            attendance_query,
        )
        raise HTTPException(
            status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Attendance dashboard records are temporarily unavailable",
        ) from exc

    logger.info(
        "attendance.dashboard_stats.success user_id=%s company_id=%s total_employees=%s records=%s",
        getattr(current_user, "id", None),
        company_id,
        total_employees,
        present_today,
    )

    return {
        "success": True,
        "data": {
            "total_employees": total_employees,
            "present_today": present_today,
            "working_now": working_now,
            "on_break": on_break,
            "offline": max(0, total_employees - working_now - on_break),
            "late_today": late_today,
        }
    }

