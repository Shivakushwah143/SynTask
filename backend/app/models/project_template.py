"""
Project Templates — reusable blueprints that generate Projects + Tasks.

A template is NOT a project.  It stores defaults, task blueprints with
relative date offsets, checklist items, and inter-task dependency references
resolved at generation time.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from enum import Enum

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class TemplateTaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TemplateTaskChecklistItem(Document):
    """Checklist item inside a task template."""
    text: str
    required: bool = False
    order: int = 0

    class Settings:
        name = "template_task_checklist_items"


class TemplateTask(Document):
    """A task blueprint within a project template."""
    template_id: Indexed(str)               # owning ProjectTemplate id
    company_id: Indexed(str)

    # Internal reference ID used for dependency resolution within the template.
    # e.g. "requirements", "uiux", "frontend".  Not a DB ObjectId.
    ref_id: str

    title: str
    description: Optional[str] = None
    priority: TemplateTaskPriority = TemplateTaskPriority.MEDIUM

    # Relative date offsets from project start_date (in days).
    relative_start_day: int = 0
    relative_due_day: int = 3

    estimated_hours: Optional[float] = None

    review_required: bool = True

    # Assignee / reviewer placeholders — resolved at generation time.
    # Values are role identifiers or user IDs passed at generation.
    assignee_placeholder: Optional[str] = None
    reviewer_placeholder: Optional[str] = None

    # Dependency references — list of ref_ids of other template tasks.
    depends_on_refs: List[str] = Field(default_factory=list)

    tags: List[str] = Field(default_factory=list)
    required_for_project_completion: bool = True

    order: int = 0  # display / execution order within the template

    checklist: List[Dict[str, Any]] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "template_tasks"
        indexes = [
            "template_id",
            "company_id",
            "ref_id",
            IndexModel([("template_id", ASCENDING), ("ref_id", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("template_id", ASCENDING)]),
        ]


class ProjectTemplate(Document):
    """Reusable project blueprint."""
    company_id: Indexed(str)
    name: str
    description: Optional[str] = None

    # Optional project defaults
    project_type: Optional[str] = None       # e.g. "software", "marketing"
    default_priority: str = "medium"          # ProjectPriority value
    estimated_duration_days: Optional[int] = None
    estimated_hours: Optional[float] = None

    # Version tracking — changing a template does NOT mutate existing projects
    version: int = 1
    enabled: bool = True

    # Task count for quick display
    task_count: int = 0

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "project_templates"
        indexes = [
            "company_id",
            "name",
            "enabled",
            "project_type",
            IndexModel([("company_id", ASCENDING), ("name", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("enabled", ASCENDING)]),
            IndexModel([("company_id", ASCENDING), ("project_type", ASCENDING)]),
        ]
