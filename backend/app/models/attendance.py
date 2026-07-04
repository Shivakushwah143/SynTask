"""
Attendance & Monitoring Models
"""
from datetime import datetime
from typing import Optional
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class AttendanceStatus(str, Enum):
    PRESENT = "Present"
    ABSENT = "Absent"
    LATE = "Late"
    WORKING = "Working"
    ON_BREAK = "On Break"
    OFFLINE = "Offline"


class Attendance(Document):
    """Attendance Model - Master record per employee per day"""
    employee_id: Indexed(str)
    company_id: Indexed(str)
    date: Indexed(str)  # YYYY-MM-DD format
    
    # Timing details
    login_time: Optional[datetime] = None
    logout_time: Optional[datetime] = None
    total_working_hours: float = 0.0  # Stored as cumulative float hours (e.g. 8.5)
    break_duration: float = 0.0       # Stored as cumulative float hours (e.g. 0.75)
    
    # Status
    status: AttendanceStatus = AttendanceStatus.OFFLINE
    
    # Monitoring info
    monitoring_start_time: Optional[datetime] = None
    monitoring_end_time: Optional[datetime] = None
    camera_permission_status: str = "Denied"    # Granted / Denied
    screen_sharing_status: str = "Denied"       # Granted / Denied
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "attendance"
        indexes = [
            "employee_id",
            "company_id",
            "date",
            "status",
        ]


class AttendanceSession(Document):
    """AttendanceSession Model - Logs each continuous block of work"""
    attendance_id: Indexed(str)
    employee_id: Indexed(str)
    company_id: Indexed(str)
    
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: float = 0.0  # duration in seconds
    
    class Settings:
        name = "attendance_sessions"
        indexes = [
            "attendance_id",
            "employee_id",
            "company_id",
        ]


class BreakLog(Document):
    """BreakLog Model - Logs break periods"""
    attendance_id: Indexed(str)
    employee_id: Indexed(str)
    company_id: Indexed(str)
    
    start_time: datetime
    end_time: Optional[datetime] = None
    duration: float = 0.0  # duration in seconds
    reason: Optional[str] = None
    
    class Settings:
        name = "break_logs"
        indexes = [
            "attendance_id",
            "employee_id",
        ]


class MonitoringSession(Document):
    """MonitoringSession Model - Logs overall monitoring state"""
    attendance_id: Indexed(str)
    employee_id: Indexed(str)
    company_id: Indexed(str)
    
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str = "Active"  # Active, Paused, Stopped
    
    class Settings:
        name = "monitoring_sessions"
        indexes = [
            "attendance_id",
            "employee_id",
        ]


class CameraSession(Document):
    """CameraSession Model - Logs history of camera connection status"""
    monitoring_session_id: Indexed(str)
    employee_id: Indexed(str)
    
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str = "Connected"  # Connected, Disabled, Denied
    
    class Settings:
        name = "camera_sessions"
        indexes = [
            "monitoring_session_id",
            "employee_id",
        ]


class ScreenShareSession(Document):
    """ScreenShareSession Model - Logs history of screen share status"""
    monitoring_session_id: Indexed(str)
    employee_id: Indexed(str)
    
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str = "Sharing"  # Sharing, Stopped, Denied
    
    class Settings:
        name = "screenshare_sessions"
        indexes = [
            "monitoring_session_id",
            "employee_id",
        ]
