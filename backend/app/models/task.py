"""
Task Management Models
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum
from pymongo import ASCENDING, DESCENDING, TEXT, IndexModel


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TaskStatus(str, Enum):
    TODO = "todo"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    REVISION_REQUIRED = "revision_required"
    APPROVED = "approved"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TaskHealthStatus(str, Enum):
    HEALTHY = "healthy"
    DUE_TODAY = "due_today"
    OVERDUE = "overdue"
    EXTENDED = "extended"
    COMPLETED = "completed"


class TaskExtensionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class TaskType(str, Enum):
    STANDARD = "standard"
    QUANTITATIVE = "quantitative"


class MeasurementType(str, Enum):
    POSTS = "posts"
    REELS = "reels"
    VIDEOS = "videos"
    THUMBNAILS = "thumbnails"
    DESIGNS = "designs"
    BANNERS = "banners"
    STORIES = "stories"
    OTHER = "other"


class Task(Document):
    """Task Model. project_id is the logical project identifier (Project.project_id string), not MongoDB ObjectId."""
    title: str
    description: Optional[str] = None
    company_id: Indexed(str)
    project_id: Optional[str] = None  # Logical Project.project_id (user-provided e.g. PROJ-001)
    project_object_id: Optional[str] = None  # MongoDB Project._id string for normalized lookups
    
    # Assignment
    created_by: str  # User ID
    assigned_to: Optional[str] = None  # User ID
    assigned_by: Optional[str] = None  # User ID
    assigned_at: Optional[datetime] = None
    department_id: Optional[str] = None  # Department document ID
    department: Optional[str] = None  # Legacy department name fallback
    
    # Task Details
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    progress_percentage: float = 0.0
    review_required: Optional[bool] = None
    reviewer_id: Optional[str] = None
    review_round: int = 0
    submitted_for_review_at: Optional[datetime] = None
    submitted_for_review_by: Optional[str] = None
    revision_requested_at: Optional[datetime] = None
    revision_requested_by: Optional[str] = None
    latest_revision_reason: Optional[str] = None
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    completed_by: Optional[str] = None
    status_changed_at: Optional[datetime] = None
    required_for_project_completion: bool = True

    # Production / Quantitative Tracking
    task_type: TaskType = TaskType.STANDARD
    measurement_type: Optional[str] = None  # MeasurementType enum value or custom string when "other"
    custom_measurement_label: Optional[str] = None  # User-typed label when measurement_type="other"
    target_quantity: Optional[int] = Field(None, ge=1)
    target_unit: Optional[str] = None  # e.g. "Posts", "Reels", "Videos", or custom
    completed_quantity: int = 0

    expected_completion_time: Optional[datetime] = None
    
    # Dates
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    health_status: TaskHealthStatus = TaskHealthStatus.HEALTHY
    health_updated_at: datetime = Field(default_factory=datetime.utcnow)
    extension_count: int = 0

    # Automatic carry forward of a passed deadline. `due_date` is never
    # rewritten: it stays the original commitment that task health, overdue
    # reporting, and at-risk analysis read. Only the effective deadline a task
    # is worked to moves, so lateness remains visible while the task always
    # shows a live deadline. `carry_forward_days` accumulates every day moved.
    carry_forward_due_date: Optional[datetime] = None
    carry_forward_days: int = 0
    carry_forward_count: int = 0
    carry_forward_last_at: Optional[datetime] = None
    
    # Attachments
    attachments: List[str] = []  # File URLs
    
    # Tags
    tags: List[str] = []
    
    # Parent-Child relationship (for subtasks)
    parent_task_id: Optional[str] = None
    
    # Agile/Scrum
    epic_id: Optional[str] = None  # Link to Epic
    sprint_id: Optional[str] = None  # Link to Sprint
    
    # Story Points (Agile estimation)
    story_points: Optional[int] = None
    
    # Tracking
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    time_logs: List[Dict[str, Any]] = Field(default_factory=list)
    checklist: List[Dict[str, Any]] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    
    # Generic relationship linkage (additive, nullable). Lets a task retain a
    # link back to the source record that generated it (e.g. a Sales follow-up
    # scheduled from a lead). Existing tasks are unaffected.
    related_entity_type: Optional[str] = None  # e.g. "sales_lead"
    related_entity_id: Optional[str] = None    # e.g. lead ObjectId string
    related_entity_stage: Optional[str] = None # e.g. current lead stage at schedule time
    related_entity_url: Optional[str] = None   # e.g. "/crm/leads/{lead_id}"
    source_type: Optional[str] = None          # e.g. "sales_follow_up"

    # Workflow
    workflow_id: Optional[str] = None  # Custom workflow
    
    # Issue Type (like Jira)
    issue_type_id: Optional[str] = None  # Link to IssueType
    
    # Component (like Jira)
    component_id: Optional[str] = None  # Link to Component
    
    # Versions (like Jira)
    fix_version_id: Optional[str] = None  # Version that will fix this
    affects_version_ids: List[str] = []  # Versions affected by this
    
    # Resolution (like Jira)
    resolution: Optional[str] = None  # Resolution when closed (Fixed, Won't Fix, Duplicate, etc.)
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "tasks"
        indexes = [
            "company_id",
            "created_by",
            "assigned_to",
            "reviewer_id",
            "status",
            "health_status",
            "priority",
            "progress_percentage",
            "project_id",
            "project_object_id",
            "due_date",
            "parent_task_id",
            "expected_completion_time",
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("health_status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("reviewer_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("project_object_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("due_date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("health_status", ASCENDING), ("due_date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING), ("updated_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING), ("due_date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("created_by", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("sprint_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("epic_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("parent_task_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("related_entity_type", ASCENDING), ("related_entity_id", ASCENDING)]),
            # Partial unique index: enforce uniqueness only for generated
            # template/recurring-work markers. Sales follow-ups may create
            # multiple real tasks for the same lead over time.
            IndexModel(
                [
                    ("company_id", ASCENDING),
                    ("source_type", ASCENDING),
                    ("related_entity_type", ASCENDING),
                    ("related_entity_id", ASCENDING),
                ],
                unique=True,
                name="tasks_template_and_schedule_source_marker",
                partialFilterExpression={
                    "source_type": {"$in": ["project_template", "scheduled_work"]},
                    "related_entity_id": {"$type": "string"},
                },
            ),
            IndexModel([("title", TEXT), ("description", TEXT)]),
        ]


class TaskComment(Document):
    """Task Comment Model"""
    task_id: Indexed(str)
    company_id: str
    user_id: str
    user_name: str
    content: str
    attachments: List[str] = []
    mentioned_users: List[str] = []  # User IDs mentioned with @
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_edited: bool = False
    
    class Settings:
        name = "task_comments"
        indexes = [
            "task_id",
            "user_id",
            "company_id",
            IndexModel([("task_id", ASCENDING), ("company_id", ASCENDING), ("created_at", ASCENDING)]),
        ]


class TaskExtensionRequest(Document):
    """Employee request to move a task deadline."""

    task_id: Indexed(str)
    company_id: Indexed(str)
    employee_id: Indexed(str)
    current_due_date: datetime
    requested_due_date: datetime
    reason: str
    status: TaskExtensionStatus = TaskExtensionStatus.PENDING
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_comment: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "task_extension_requests"
        indexes = [
            "task_id",
            "company_id",
            "employee_id",
            "status",
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("task_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("employee_id", ASCENDING), ("status", ASCENDING)]),
        ]
