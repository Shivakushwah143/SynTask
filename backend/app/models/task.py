"""
Task Management Models
"""
from datetime import datetime
from typing import Optional, List
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Task(Document):
    """Task Model. project_id is the logical project identifier (Project.project_id string), not MongoDB ObjectId."""
    title: str
    description: Optional[str] = None
    company_id: Indexed(str)
    project_id: Optional[str] = None  # FK: Project.project_id (user-provided e.g. PROJ-001), not Project._id
    
    # Assignment
    created_by: str  # User ID
    assigned_to: Optional[str] = None  # User ID
    assigned_by: Optional[str] = None  # User ID
    
    # Task Details
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    
    # Dates
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
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
            "status",
            "priority",
            "project_id",
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
        ]

