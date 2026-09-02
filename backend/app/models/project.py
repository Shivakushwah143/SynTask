"""
Project Management Models - Jira-like Projects
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum
from pymongo import ASCENDING, DESCENDING, TEXT, IndexModel


class ProjectType(str, Enum):
    SOFTWARE = "software"
    BUSINESS = "business"
    MARKETING = "marketing"
    OPERATIONS = "operations"
    OTHER = "other"


class ProjectStatus(str, Enum):
    ACTIVE = "active"
    CREATED = "created"
    KICKOFF = "kickoff"
    EXECUTION = "execution"
    REVIEW = "review"
    COMPLETED = "completed"
    REPORTING = "reporting"
    ARCHIVED = "archived"
    ON_HOLD = "on_hold"
    CANCELLED = "cancelled"


class ProjectPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Project(Document):
    """
    Project Model - Jira-like.
    Logical identifier: project_id (frontend-provided, e.g. PROJ-001).
    MongoDB _id is internal only; project-task linking uses project_id.
    """
    name: str
    key: Indexed(str)  # Short key (e.g., "PROJ", "DEV")
    project_id: Optional[Indexed(str)] = None  # Logical ID from frontend (e.g. PROJ-001). Required on create; unique per company. Tasks reference this, not _id.
    description: Optional[str] = None
    company_id: Indexed(str)
    client_id: Optional[str] = None  # Linked client workspace record, if any
    
    # Project Details
    type: str = ProjectType.SOFTWARE.value
    status: ProjectStatus = ProjectStatus.ACTIVE
    priority: ProjectPriority = ProjectPriority.MEDIUM
    lead_id: Optional[str] = None  # Project lead/manager
    
    # Assignment
    assigned_to: Optional[str] = None  # Assigned user (can be Lead or Employee)
    assigned_user_ids: List[str] = Field(default_factory=list)  # Managers/Leads assigned to project
    assigned_by: Optional[str] = None  # User who assigned the project
    assigned_at: Optional[datetime] = None
    assignment_history: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Team
    team_member_ids: List[str] = []  # User IDs in the project
    
    # Settings
    default_assignee: Optional[str] = None  # Auto-assign to this user
    notification_settings: Dict[str, Any] = {}
    
    # Dates
    start_date: Optional[datetime] = None
    delivery_date: Optional[datetime] = None  # Delivery/deadline date
    end_date: Optional[datetime] = None
    
    # Metadata
    avatar: Optional[str] = None
    category: Optional[str] = None
    files: List[Dict[str, Any]] = Field(default_factory=list)
    folders: List[Dict[str, Any]] = Field(default_factory=list)
    milestones: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Custom Board Columns (Kanban)
    board_columns: List[Dict[str, Any]] = Field(default_factory=lambda: [
        {"id": "todo", "label": "TO DO", "color": "bg-gray-100", "order": 0},
        {"id": "in_progress", "label": "IN PROGRESS", "color": "bg-blue-100", "order": 1},
        {"id": "in_review", "label": "IN REVIEW", "color": "bg-yellow-100", "order": 2},
        {"id": "completed", "label": "COMPLETED", "color": "bg-green-100", "order": 3},
    ])
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str  # User ID
    
    class Settings:
        name = "projects"
        indexes = [
            "company_id",
            "key",
            "project_id",  # Index for user-defined project_id
            "status",
            "priority",
            "lead_id",
            "created_by",
            "assigned_to",
            "assigned_user_ids",
            "delivery_date",
            "team_member_ids",
            IndexModel([("company_id", ASCENDING), ("key", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING)], unique=True, sparse=True),
            IndexModel([("company_id", ASCENDING), ("client_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("project_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("lead_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_user_ids", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("delivery_date", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("priority", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("company_id", ASCENDING), ("assigned_to", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("team_member_ids", ASCENDING)]),
            IndexModel([("name", TEXT), ("description", TEXT)]),
        ]


class ProjectTypeConfiguration(Document):
    """Company-scoped project type option. Project.type remains the project source value."""
    company_id: Indexed(str)
    value: Indexed(str)
    label: str
    is_default: bool = False
    active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "project_type_configurations"
        indexes = [
            "company_id",
            "value",
            IndexModel([("company_id", ASCENDING), ("value", ASCENDING)], unique=True),
            IndexModel([("company_id", ASCENDING), ("active", ASCENDING), ("label", ASCENDING)]),
        ]


class Epic(Document):
    """Epic Model - Large work items that contain multiple tasks"""
    name: str
    description: Optional[str] = None
    project_id: Indexed(str)
    company_id: Indexed(str)
    
    # Assignment
    created_by: str
    owner_id: Optional[str] = None  # Epic owner
    
    # Status
    status: str = "todo"  # todo, in_progress, done
    
    # Dates
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    
    # Progress
    progress_percentage: float = 0.0
    
    # Color (for UI)
    color: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "epics"
        indexes = [
            "project_id",
            "company_id",
            "owner_id",
        ]


class Sprint(Document):
    """Sprint Model - Time-boxed iterations for Agile development"""
    name: str
    project_id: Indexed(str)
    company_id: Indexed(str)
    
    # Sprint Details
    goal: Optional[str] = None
    start_date: datetime
    end_date: datetime
    
    # Status
    state: str = "future"  # future, active, closed
    
    # Team
    team_member_ids: List[str] = []
    
    # Progress
    completed_at: Optional[datetime] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    
    class Settings:
        name = "sprints"
        indexes = [
            "project_id",
            "company_id",
            "state",
            "start_date",
            "end_date",
        ]
