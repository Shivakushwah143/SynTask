"""
Workflow Models - Customizable workflows like Jira
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class WorkflowStatus(Document):
    """Workflow Status - Custom statuses for workflows"""
    name: str
    key: Indexed(str)  # Unique key (e.g., "todo", "in_progress")
    company_id: Optional[str] = None  # None for global, or company-specific
    project_id: Optional[str] = None  # None for global, or project-specific
    
    # Status Details
    description: Optional[str] = None
    color: str = "#0052CC"  # Status color
    icon: Optional[str] = None
    
    # Category
    category: str = "todo"  # todo, in_progress, done
    
    # Order
    order: int = 0
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "workflow_statuses"
        indexes = [
            "key",
            "company_id",
            "project_id",
        ]


class WorkflowTransition(Document):
    """Workflow Transition - Rules for status changes"""
    name: str
    from_status: str  # Source status key
    to_status: str  # Target status key
    company_id: Optional[str] = None
    project_id: Optional[str] = None
    
    # Conditions
    conditions: List[Dict[str, Any]] = []  # Conditions that must be met
    validators: List[Dict[str, Any]] = []  # Validators to run
    
    # Post-functions (actions after transition)
    post_functions: List[Dict[str, Any]] = []
    
    # UI
    screen: Optional[str] = None  # Screen to show during transition
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "workflow_transitions"
        indexes = [
            "company_id",
            "project_id",
            "from_status",
            "to_status",
        ]


class Workflow(Document):
    """Workflow Model - Complete workflow definition"""
    name: str
    description: Optional[str] = None
    company_id: Optional[str] = None
    project_id: Optional[str] = None
    
    # Statuses
    status_ids: List[str] = []  # WorkflowStatus IDs
    
    # Transitions
    transition_ids: List[str] = []  # WorkflowTransition IDs
    
    # Initial Status
    initial_status: str  # Status key
    
    # Active
    is_active: bool = True
    is_default: bool = False
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    
    class Settings:
        name = "workflows"
        indexes = [
            "company_id",
            "project_id",
            "is_active",
        ]


