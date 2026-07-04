"""
Attendance & Employee Monitoring Endpoints (Phase 1)
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi import status as http_status
from datetime import datetime, timedelta
import csv
import io
import json
import logging
from typing import List, Optional, Dict, Set

from app.models.user import User, UserRole, UserStatus, Lead, Manager
from app.models.attendance import (
    Attendance, AttendanceStatus, AttendanceSession, BreakLog,
    MonitoringSession, CameraSession, ScreenShareSession
)
from app.api.dependencies import (
    get_current_user, get_current_company_admin_or_lead, get_current_company_admin
)
from app.core.security import decode_token_with_blacklist_check

logger = logging.getLogger(__name__)
router = APIRouter()


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

    async def broadcast_to_company_managers(self, company_id: str, message: dict):
        """Broadcasts messages to leads, managers, and admins of the same company"""
        for user_id, websockets in self.active_connections.items():
            user = self.connection_users.get(user_id)
            if user and user.company_id == company_id:
                if user.role in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD]:
                    for ws in websockets:
                        await self.send_personal_message(message, ws)

    async def forward_frame_to_subscribers(self, employee_id: str, frame_type: str, frame_data: str):
        """Forwards screen or camera base64 frames ONLY to managers actively watching this employee"""
        subscribers = self.stream_subscribers.get(employee_id, set())
        if subscribers:
            message = {
                "type": f"{frame_type}_update",
                "employee_id": employee_id,
                "data": frame_data,
                "timestamp": datetime.utcnow().isoformat()
            }
            for ws in list(subscribers):
                try:
                    await ws.send_json(message)
                except Exception:
                    # Remove dead connections
                    subscribers.remove(ws)

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
            message = json.loads(data)
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
                    manager.subscribe_manager(websocket, target_emp_id)
                continue

            elif msg_type == "unsubscribe_employee":
                target_emp_id = message.get("employee_id")
                if target_emp_id:
                    manager.unsubscribe_manager(websocket, target_emp_id)
                continue

            # FRAME snap uploads (Camera / Screen sharing frames)
            elif msg_type == "camera_frame":
                frame_data = message.get("data")
                await manager.forward_frame_to_subscribers(user_id_str, "camera", frame_data)
                continue

            elif msg_type == "screen_frame":
                frame_data = message.get("data")
                await manager.forward_frame_to_subscribers(user_id_str, "screen", frame_data)
                continue

            # WORKFLOW EVENTS (Start work, pause, resume, stop)
            # Fetch or initialize today's Attendance record
            today_str = datetime.utcnow().strftime("%Y-%m-%d")
            
            if msg_type == "start_work":
                camera_perm = message.get("camera_permission", "Denied")
                screen_perm = message.get("screen_share_permission", "Denied")
                
                # Check for existing record
                attendance = await Attendance.find_one(
                    Attendance.employee_id == user_id_str,
                    Attendance.date == today_str
                )
                
                if not attendance:
                    # Late determination (standard threshold 9:00 AM UTC/local, default comparison at 09:00:00)
                    now_utc = datetime.utcnow()
                    status = AttendanceStatus.WORKING
                    if now_utc.hour >= 9:
                        status = AttendanceStatus.WORKING  # Marked as Working for session, but attendance overall could be Late
                    
                    attendance = Attendance(
                        employee_id=user_id_str,
                        company_id=user.company_id,
                        date=today_str,
                        login_time=now_utc,
                        status=status,
                        monitoring_start_time=now_utc,
                        camera_permission_status=camera_perm,
                        screen_sharing_status=screen_perm
                    )
                    # If clock in is after 9 AM local (using simple 9:00 AM UTC or simple offset check)
                    # Let's say if UTC hour is >= 9, we mark as late, but the active state is Working
                    # Let's check:
                    if now_utc.hour >= 9:
                        # Will record overall late, but active status is Working
                        pass
                else:
                    attendance.status = AttendanceStatus.WORKING
                    attendance.camera_permission_status = camera_perm
                    attendance.screen_sharing_status = screen_perm
                    attendance.updated_at = datetime.utcnow()
                    if not attendance.login_time:
                        attendance.login_time = datetime.utcnow()

                await attendance.save()

                # Start AttendanceSession
                session = AttendanceSession(
                    attendance_id=str(attendance.id),
                    employee_id=user_id_str,
                    company_id=user.company_id,
                    start_time=datetime.utcnow()
                )
                await session.insert()

                # Start MonitoringSession
                monitoring_session = MonitoringSession(
                    attendance_id=str(attendance.id),
                    employee_id=user_id_str,
                    company_id=user.company_id,
                    start_time=datetime.utcnow(),
                    status="Active"
                )
                await monitoring_session.insert()

                # Log Camera / Screen Share status
                if camera_perm == "Granted":
                    cam_session = CameraSession(
                        monitoring_session_id=str(monitoring_session.id),
                        employee_id=user_id_str,
                        start_time=datetime.utcnow(),
                        status="Connected"
                    )
                    await cam_session.insert()
                
                if screen_perm == "Granted":
                    screen_session = ScreenShareSession(
                        monitoring_session_id=str(monitoring_session.id),
                        employee_id=user_id_str,
                        start_time=datetime.utcnow(),
                        status="Sharing"
                    )
                    await screen_session.insert()

                # Broadcast Status Change
                broadcast_msg = {
                    "type": "status_changed",
                    "employee_id": user_id_str,
                    "employee_name": user.full_name(),
                    "status": AttendanceStatus.WORKING.value,
                    "camera_status": camera_perm,
                    "screen_share_status": screen_perm,
                    "timestamp": datetime.utcnow().isoformat()
                }
                await manager.broadcast_to_company_managers(user.company_id, broadcast_msg)
                
                # Acknowledge client
                await manager.send_personal_message({
                    "type": "start_work_ack",
                    "status": "Working",
                    "attendance_id": str(attendance.id)
                }, websocket)

            elif msg_type == "pause_work":
                # Employee goes on break
                attendance = await Attendance.find_one(
                    Attendance.employee_id == user_id_str,
                    Attendance.date == today_str
                )
                if attendance and attendance.status == AttendanceStatus.WORKING:
                    attendance.status = AttendanceStatus.ON_BREAK
                    attendance.updated_at = datetime.utcnow()
                    await attendance.save()

                    # End active AttendanceSession
                    active_session = await AttendanceSession.find_one(
                        AttendanceSession.attendance_id == str(attendance.id),
                        AttendanceSession.end_time == None
                    )
                    if active_session:
                        active_session.end_time = datetime.utcnow()
                        active_session.duration = (active_session.end_time - active_session.start_time).total_seconds()
                        await active_session.save()
                        # Increment working hours in Attendance model
                        attendance.total_working_hours += active_session.duration
                        await attendance.save()

                    # Start BreakLog
                    break_log = BreakLog(
                        attendance_id=str(attendance.id),
                        employee_id=user_id_str,
                        company_id=user.company_id,
                        start_time=datetime.utcnow()
                    )
                    await break_log.insert()

                    # Broadcast Status Change
                    broadcast_msg = {
                        "type": "status_changed",
                        "employee_id": user_id_str,
                        "employee_name": user.full_name(),
                        "status": AttendanceStatus.ON_BREAK.value,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    await manager.broadcast_to_company_managers(user.company_id, broadcast_msg)
                    
                    await manager.send_personal_message({
                        "type": "pause_work_ack",
                        "status": "On Break"
                    }, websocket)

            elif msg_type == "resume_work":
                # Employee resumes work from break
                attendance = await Attendance.find_one(
                    Attendance.employee_id == user_id_str,
                    Attendance.date == today_str
                )
                if attendance and attendance.status == AttendanceStatus.ON_BREAK:
                    attendance.status = AttendanceStatus.WORKING
                    attendance.updated_at = datetime.utcnow()
                    await attendance.save()

                    # End active BreakLog
                    active_break = await BreakLog.find_one(
                        BreakLog.attendance_id == str(attendance.id),
                        BreakLog.end_time == None
                    )
                    if active_break:
                        active_break.end_time = datetime.utcnow()
                        active_break.duration = (active_break.end_time - active_break.start_time).total_seconds()
                        await active_break.save()
                        # Increment break duration in Attendance model
                        attendance.break_duration += active_break.duration
                        await attendance.save()

                    # Start new AttendanceSession
                    session = AttendanceSession(
                        attendance_id=str(attendance.id),
                        employee_id=user_id_str,
                        company_id=user.company_id,
                        start_time=datetime.utcnow()
                    )
                    await session.insert()

                    # Broadcast Status Change
                    broadcast_msg = {
                        "type": "status_changed",
                        "employee_id": user_id_str,
                        "employee_name": user.full_name(),
                        "status": AttendanceStatus.WORKING.value,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    await manager.broadcast_to_company_managers(user.company_id, broadcast_msg)
                    
                    await manager.send_personal_message({
                        "type": "resume_work_ack",
                        "status": "Working"
                    }, websocket)

            elif msg_type == "stop_work":
                # Employee logs out / stops work
                attendance = await Attendance.find_one(
                    Attendance.employee_id == user_id_str,
                    Attendance.date == today_str
                )
                if attendance and attendance.status in [AttendanceStatus.WORKING, AttendanceStatus.ON_BREAK]:
                    now_utc = datetime.utcnow()
                    
                    # 1. End active session if any
                    if attendance.status == AttendanceStatus.WORKING:
                        active_session = await AttendanceSession.find_one(
                            AttendanceSession.attendance_id == str(attendance.id),
                            AttendanceSession.end_time == None
                        )
                        if active_session:
                            active_session.end_time = now_utc
                            active_session.duration = (now_utc - active_session.start_time).total_seconds()
                            await active_session.save()
                            attendance.total_working_hours += active_session.duration

                    # 2. End active break if any
                    elif attendance.status == AttendanceStatus.ON_BREAK:
                        active_break = await BreakLog.find_one(
                            BreakLog.attendance_id == str(attendance.id),
                            BreakLog.end_time == None
                        )
                        if active_break:
                            active_break.end_time = now_utc
                            active_break.duration = (now_utc - active_break.start_time).total_seconds()
                            await active_break.save()
                            attendance.break_duration += active_break.duration

                    # 3. Close active MonitoringSession
                    monitoring_session = await MonitoringSession.find_one(
                        MonitoringSession.attendance_id == str(attendance.id),
                        MonitoringSession.end_time == None
                    )
                    if monitoring_session:
                        monitoring_session.end_time = now_utc
                        monitoring_session.status = "Stopped"
                        await monitoring_session.save()

                    # 4. Finalize attendance status
                    attendance.status = AttendanceStatus.OFFLINE
                    attendance.logout_time = now_utc
                    attendance.monitoring_end_time = now_utc
                    attendance.camera_permission_status = "Denied"
                    attendance.screen_sharing_status = "Denied"
                    attendance.updated_at = now_utc
                    await attendance.save()

                    # Broadcast status Offline
                    broadcast_msg = {
                        "type": "status_changed",
                        "employee_id": user_id_str,
                        "employee_name": user.full_name(),
                        "status": AttendanceStatus.OFFLINE.value,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    await manager.broadcast_to_company_managers(user.company_id, broadcast_msg)

                    await manager.send_personal_message({
                        "type": "stop_work_ack",
                        "status": "Offline"
                    }, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id_str)
        # Automatic logout on websocket disconnect (tab close/navigation)
        if user and user.role == UserRole.EMPLOYEE:
            today_str = datetime.utcnow().strftime("%Y-%m-%d")
            attendance = await Attendance.find_one(
                Attendance.employee_id == user_id_str,
                Attendance.date == today_str
            )
            if attendance and attendance.status in [AttendanceStatus.WORKING, AttendanceStatus.ON_BREAK]:
                now_utc = datetime.utcnow()
                
                # End active sessions
                if attendance.status == AttendanceStatus.WORKING:
                    active_session = await AttendanceSession.find_one(
                        AttendanceSession.attendance_id == str(attendance.id),
                        AttendanceSession.end_time == None
                    )
                    if active_session:
                        active_session.end_time = now_utc
                        active_session.duration = (now_utc - active_session.start_time).total_seconds()
                        await active_session.save()
                        attendance.total_working_hours += active_session.duration
                
                elif attendance.status == AttendanceStatus.ON_BREAK:
                    active_break = await BreakLog.find_one(
                        BreakLog.attendance_id == str(attendance.id),
                        BreakLog.end_time == None
                    )
                    if active_break:
                        active_break.end_time = now_utc
                        active_break.duration = (now_utc - active_break.start_time).total_seconds()
                        await active_break.save()
                        attendance.break_duration += active_break.duration

                # Close active MonitoringSession
                monitoring_session = await MonitoringSession.find_one(
                    MonitoringSession.attendance_id == str(attendance.id),
                    MonitoringSession.end_time == None
                )
                if monitoring_session:
                    monitoring_session.end_time = now_utc
                    monitoring_session.status = "Stopped"
                    await monitoring_session.save()

                attendance.status = AttendanceStatus.OFFLINE
                attendance.logout_time = now_utc
                attendance.monitoring_end_time = now_utc
                attendance.camera_permission_status = "Denied"
                attendance.screen_sharing_status = "Denied"
                attendance.updated_at = now_utc
                await attendance.save()

                # Broadcast Status Change
                broadcast_msg = {
                    "type": "status_changed",
                    "employee_id": user_id_str,
                    "employee_name": user.full_name(),
                    "status": AttendanceStatus.OFFLINE.value,
                    "timestamp": now_utc.isoformat()
                }
                await manager.broadcast_to_company_managers(user.company_id, broadcast_msg)


# -----------------------------------------------------------------------------
# HTTP Endpoints - Today's Status
# -----------------------------------------------------------------------------
@router.get("/today")
async def get_today_attendance(current_user: User = Depends(get_current_user)):
    """Fetch current employee's attendance record for today"""
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
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
                "camera_permission_status": "Denied",
                "screen_sharing_status": "Denied"
            }
        }
    
    # Calculate live session elapsed time if currently working
    live_working_seconds = 0
    if attendance.status == AttendanceStatus.WORKING:
        active_session = await AttendanceSession.find_one(
            AttendanceSession.attendance_id == str(attendance.id),
            AttendanceSession.end_time == None
        )
        if active_session:
            live_working_seconds = (datetime.utcnow() - active_session.start_time).total_seconds()

    live_break_seconds = 0
    if attendance.status == AttendanceStatus.ON_BREAK:
        active_break = await BreakLog.find_one(
            BreakLog.attendance_id == str(attendance.id),
            BreakLog.end_time == None
        )
        if active_break:
            live_break_seconds = (datetime.utcnow() - active_break.start_time).total_seconds()

    return {
        "success": True,
        "data": {
            "id": str(attendance.id),
            "status": attendance.status.value,
            "login_time": attendance.login_time,
            "logout_time": attendance.logout_time,
            "total_working_hours": attendance.total_working_hours + live_working_seconds,
            "break_duration": attendance.break_duration + live_break_seconds,
            "camera_permission_status": attendance.camera_permission_status,
            "screen_sharing_status": attendance.screen_sharing_status
        }
    }


# -----------------------------------------------------------------------------
# HTTP Endpoints - Live Monitoring Panel
# -----------------------------------------------------------------------------
@router.get("/live")
async def get_live_monitoring(current_user: User = Depends(get_current_user)):
    """Fetch list of all employees and their live monitoring statuses"""
    # Fetch subordinates/members based on role hierarchy
    company_id = current_user.company_id
    if not company_id and current_user.role != UserRole.SUPER_ADMIN:
         raise HTTPException(status_code=400, detail="User does not belong to any company")
    
    # Build list of active users to return
    if current_user.role == UserRole.SUPER_ADMIN:
        users = await User.find(User.role != UserRole.SUPER_ADMIN).to_list()
    elif current_user.role == UserRole.ADMIN:
        users = await User.find(User.company_id == company_id, User.role != UserRole.ADMIN).to_list()
    elif current_user.role == UserRole.MANAGER:
        subordinates = await current_user.get_all_subordinates()
        users = subordinates
    elif current_user.role == UserRole.LEAD:
        # Lead: only employees reporting directly to them
        users = await User.find(
            User.company_id == company_id,
            User.reports_to == str(current_user.id),
            User.role == UserRole.EMPLOYEE
        ).to_list()
    else:
        # Employee cannot view live dashboard
        raise HTTPException(status_code=403, detail="Only Managers/Admins can access live monitoring dashboard")

    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    live_dashboard = []

    for employee in users:
        # Fetch today's attendance record
        attendance = await Attendance.find_one(
            Attendance.employee_id == str(employee.id),
            Attendance.date == today_str
        )
        
        status = "Offline"
        working_hours = 0.0
        break_duration = 0.0
        camera_status = "Denied"
        screen_status = "Denied"
        
        if attendance:
            status = attendance.status.value
            working_hours = attendance.total_working_hours
            break_duration = attendance.break_duration
            camera_status = attendance.camera_permission_status
            screen_status = attendance.screen_sharing_status
            
            # Add elapsed time to cumulative counters if active
            if attendance.status == AttendanceStatus.WORKING:
                active_session = await AttendanceSession.find_one(
                    AttendanceSession.attendance_id == str(attendance.id),
                    AttendanceSession.end_time == None
                )
                if active_session:
                    working_hours += (datetime.utcnow() - active_session.start_time).total_seconds()
            
            elif attendance.status == AttendanceStatus.ON_BREAK:
                active_break = await BreakLog.find_one(
                    BreakLog.attendance_id == str(attendance.id),
                    BreakLog.end_time == None
                )
                if active_break:
                    break_duration += (datetime.utcnow() - active_break.start_time).total_seconds()

        live_dashboard.append({
            "employee_id": str(employee.id),
            "employee_name": employee.full_name(),
            "email": employee.email,
            "department": getattr(employee, "department", "General"),
            "role": employee.role.value,
            "status": status,
            "total_working_hours": working_hours,
            "break_duration": break_duration,
            "camera_permission_status": camera_status,
            "screen_sharing_status": screen_status
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
    
    # 1. Permission checks & filters
    query = {}
    if current_user.role != UserRole.SUPER_ADMIN:
        query["company_id"] = company_id
        
    if current_user.role == UserRole.EMPLOYEE:
        # Employees can only view their own history
        query["employee_id"] = str(current_user.id)
    elif employee_id:
        query["employee_id"] = employee_id

    # Filter dates
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}

    records = await Attendance.find(query).sort("-date").to_list()
    
    # Enrich records with user details
    enriched_records = []
    for r in records:
        emp = await User.get(r.employee_id)
        enriched_records.append({
            "id": str(r.id),
            "employee_id": r.employee_id,
            "employee_name": emp.full_name() if emp else "Unknown Employee",
            "email": emp.email if emp else "",
            "date": r.date,
            "login_time": r.login_time,
            "logout_time": r.logout_time,
            "total_working_hours": r.total_working_hours,
            "break_duration": r.break_duration,
            "status": r.status.value,
            "camera_permission_status": r.camera_permission_status,
            "screen_sharing_status": r.screen_sharing_status
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
    
    # Headers
    writer.writerow([
        "Date", "Employee Name", "Email", "Login Time", "Logout Time",
        "Working Hours (Hrs)", "Break Duration (Hrs)", "Final Status",
        "Camera Shared", "Screen Shared"
    ])
    
    for r in records:
        emp = await User.get(r.employee_id)
        name = emp.full_name() if emp else "Unknown"
        email = emp.email if emp else ""
        
        # Working duration float hours conversions
        working_hrs = round(r.total_working_hours / 3600.0, 2)
        break_hrs = round(r.break_duration / 3600.0, 2)
        
        writer.writerow([
            r.date,
            name,
            email,
            r.login_time.strftime("%Y-%m-%d %H:%M:%S") if r.login_time else "",
            r.logout_time.strftime("%Y-%m-%d %H:%M:%S") if r.logout_time else "",
            working_hrs,
            break_hrs,
            r.status.value,
            r.camera_permission_status,
            r.screen_sharing_status
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
        return {"success": True, "data": {}}

    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Base user query
    user_query = {}
    if current_user.role != UserRole.SUPER_ADMIN:
        user_query["company_id"] = company_id
        
    total_employees = await User.find(user_query, User.role == UserRole.EMPLOYEE).count()
    
    # Active monitoring counters
    working_now = 0
    on_break = 0
    offline = total_employees
    present_today = 0
    late_today = 0
    
    # Search today's attendance logs
    attendance_query = {"date": today_str}
    if current_user.role != UserRole.SUPER_ADMIN:
        attendance_query["company_id"] = company_id
        
    today_records = await Attendance.find(attendance_query).to_list()
    
    for record in today_records:
        present_today += 1
        
        # Check status
        if record.status == AttendanceStatus.WORKING:
            working_now += 1
            if offline > 0: offline -= 1
        elif record.status == AttendanceStatus.ON_BREAK:
            on_break += 1
            if offline > 0: offline -= 1
            
        # Check if clock-in is late (after 9 AM UTC/local)
        if record.login_time and record.login_time.hour >= 9:
            late_today += 1

    return {
        "success": True,
        "data": {
            "total_employees": total_employees,
            "present_today": present_today,
            "working_now": working_now,
            "on_break": on_break,
            "offline": max(0, total_employees - working_now - on_break),
            "late_today": late_today
        }
    }
