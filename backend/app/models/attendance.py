"""
Attendance & Monitoring Models (Phase 4: HR/Payroll-Ready)
"""
from datetime import datetime, time
from typing import Any, Dict, List, Optional
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum
from pymongo import IndexModel, ASCENDING, DESCENDING


class AttendanceStatus(str, Enum):
    PRESENT = "Present"
    ABSENT = "Absent"
    LATE = "Late"
    WORKING = "Working"
    ON_BREAK = "On Break"
    OFFLINE = "Offline"
    CHECKED_OUT = "Checked Out"


class HRAttendanceStatus(str, Enum):
    """Normalized HR/payroll-ready attendance statuses."""
    PRESENT = "present"
    ABSENT = "absent"
    PAID_LEAVE = "paid_leave"
    UNPAID_LEAVE = "unpaid_leave"
    HALF_DAY = "half_day"
    HOLIDAY = "holiday"
    WEEK_OFF = "week_off"
    IN_PROGRESS = "in_progress"
    NO_RECORD = "no_record"


class CorrectionType(str, Enum):
    MISSING_CHECK_IN = "missing_check_in"
    MISSING_CHECK_OUT = "missing_check_out"
    CHANGE_CHECK_IN = "change_check_in"
    CHANGE_CHECK_OUT = "change_check_out"
    BREAK_CORRECTION = "break_correction"
    STATUS_CORRECTION = "status_correction"


class CorrectionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class Attendance(Document):
    """Attendance Model - Master record per employee per day"""
    employee_id: Indexed(str)
    company_id: Indexed(str)
    date: Indexed(str)  # YYYY-MM-DD format
    
    # Timing details
    login_time: Optional[datetime] = None
    logout_time: Optional[datetime] = None
    total_working_hours: float = 0.0  # Stored as cumulative seconds
    break_duration: float = 0.0       # Stored as cumulative seconds
    current_break_started_at: Optional[datetime] = None
    overtime_seconds: float = 0.0     # Seconds worked beyond 8 hours
    work_type: Optional[str] = None   # "Under Time", "Full Time", "Overtime"
    
    # Status
    status: AttendanceStatus = AttendanceStatus.OFFLINE
    is_late: bool = False             # True if clock-in was after 9:00 AM UTC
    # Phase 3 Leave integration: "paid_leave" | "unpaid_leave" | None when the
    # day is covered by an APPROVED leave so it is distinguishable from absence.
    leave_status: Optional[str] = None
    
    # Phase 4: Normalized HR status (computed by AttendanceStatusResolver)
    hr_status: Optional[str] = None  # HRAttendanceStatus value
    hr_status_updated_at: Optional[datetime] = None
    
    # Phase 4: Policy-aware computed fields
    expected_work_minutes: Optional[float] = None
    actual_work_minutes: Optional[float] = None
    overtime_minutes: float = 0.0
    is_late: bool = False  # True if clock-in was after policy start + grace
    is_early_departure: bool = False
    late_minutes: float = 0.0
    early_departure_minutes: float = 0.0
    
    # Phase 4: Holiday / Week-off flags (set by resolver)
    is_holiday: bool = False
    holiday_name: Optional[str] = None
    is_week_off: bool = False
    
    # Phase 4: Correction status
    correction_status: Optional[str] = None  # CorrectionStatus value if correction pending
    
    # Phase 4: Original values before correction (audit trail)
    correction_history: List[Dict[str, Any]] = Field(default_factory=list)
    
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
            IndexModel(
                [("company_id", ASCENDING), ("employee_id", ASCENDING), ("date", ASCENDING)],
                unique=True,
                name="uniq_company_employee_attendance_date",
            ),
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


# =============================================================================
# Phase 4 — Attendance Policy (company-scoped, replaces hard-coded rules)
# =============================================================================


class AttendancePolicy(Document):
    """Company-scoped attendance policy replacing hard-coded UTC rules.
    
    Supports timezone-aware business-day calculations, configurable work
    hours, grace periods, overtime, and work week.
    """
    company_id: Indexed(str)
    name: str = "Default Policy"
    timezone: str = "UTC"
    
    # Expected work schedule
    expected_start_time: str = "09:00"  # HH:MM in company timezone
    expected_end_time: str = "18:00"   # HH:MM in company timezone
    expected_work_minutes: float = 480.0  # 8 hours
    
    # Grace periods
    late_grace_minutes: float = 0.0
    early_departure_grace_minutes: float = 0.0
    
    # Half-day / full-day thresholds
    minimum_half_day_minutes: float = 240.0  # 4 hours
    minimum_full_day_minutes: float = 360.0  # 6 hours
    
    # Overtime
    overtime_enabled: bool = False
    overtime_after_minutes: float = 480.0  # overtime after this many minutes
    
    # Work week: list of working day abbreviations
    # e.g. ["Mon", "Tue", "Wed", "Thu", "Fri"]
    work_week: List[str] = Field(default_factory=lambda: ["Mon", "Tue", "Wed", "Thu", "Fri"])
    
    active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "attendance_policies"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("active", ASCENDING)],
                       name="attendance_policies_company_active"),
            IndexModel([("company_id", ASCENDING)], name="attendance_policies_company"),
        ]


# =============================================================================
# Phase 4 — Holiday (company-scoped)
# =============================================================================


class Holiday(Document):
    """Company-scoped holiday record."""
    company_id: Indexed(str)
    name: str
    date: datetime  # Date of the holiday (only date component matters)
    description: Optional[str] = None
    location: Optional[str] = None  # optional location scope
    active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "holidays"
        indexes = [
            IndexModel([("company_id", ASCENDING), ("date", ASCENDING)],
                       name="holidays_company_date"),
            IndexModel([("company_id", ASCENDING), ("active", ASCENDING)],
                       name="holidays_company_active"),
        ]


# =============================================================================
# Phase 4 — Attendance Correction Request
# =============================================================================


class AttendanceCorrectionRequest(Document):
    """Employee attendance correction / regularization request."""
    company_id: Indexed(str)
    employee_id: Indexed(str)
    attendance_date: str  # YYYY-MM-DD
    attendance_id: Optional[str] = None  # existing attendance record ID if any
    
    correction_type: CorrectionType
    
    # Snapshot of current values at request time
    current_check_in: Optional[datetime] = None
    current_check_out: Optional[datetime] = None
    current_work_minutes: Optional[float] = None
    current_status: Optional[str] = None
    
    # Requested new values
    requested_check_in: Optional[datetime] = None
    requested_check_out: Optional[datetime] = None
    requested_work_minutes: Optional[float] = None
    requested_status: Optional[str] = None
    
    reason: str
    attachment_url: Optional[str] = None
    
    status: CorrectionStatus = CorrectionStatus.PENDING
    
    requested_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_comment: Optional[str] = None
    
    # Original attendance values before correction (preserved on approval)
    original_values: Dict[str, Any] = Field(default_factory=dict)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "attendance_correction_requests"
        indexes = [
            "employee_id",
            "company_id",
            "status",
            "attendance_date",
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("attendance_date", DESCENDING)],
                       name="corrections_company_status_date"),
            IndexModel([("company_id", ASCENDING), ("employee_id", ASCENDING), ("status", ASCENDING)],
                       name="corrections_company_employee_status"),
        ]
