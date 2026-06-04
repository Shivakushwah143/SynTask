"""
Automation Models - Automation rules like Jira Automation
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from beanie import Document, Indexed
from pydantic import Field
from enum import Enum


class AutomationTriggerType(str, Enum):
    TASK_CREATED = "task_created"
    TASK_UPDATED = "task_updated"
    TASK_STATUS_CHANGED = "task_status_changed"
    TASK_ASSIGNED = "task_assigned"
    COMMENT_ADDED = "comment_added"
    DUE_DATE_APPROACHING = "due_date_approaching"
    DUE_DATE_PASSED = "due_date_passed"
    SCHEDULED = "scheduled"  # Cron-based
    WEBHOOK = "webhook"


class AutomationActionType(str, Enum):
    ASSIGN_TASK = "assign_task"
    CHANGE_STATUS = "change_status"
    SET_PRIORITY = "set_priority"
    ADD_COMMENT = "add_comment"
    CREATE_SUBTASK = "create_subtask"
    SEND_NOTIFICATION = "send_notification"
    SEND_EMAIL = "send_email"
    UPDATE_FIELD = "update_field"
    TRANSITION_WORKFLOW = "transition_workflow"
    CREATE_TASK = "create_task"


class AutomationRule(Document):
    """Automation Rule - Like Jira Automation"""
    name: str
    description: Optional[str] = None
    company_id: Optional[str] = None
    project_id: Optional[str] = None
    
    # Trigger
    trigger_type: AutomationTriggerType
    trigger_config: Dict[str, Any] = {}  # Trigger-specific configuration
    
    # Conditions (all must be true)
    conditions: List[Dict[str, Any]] = []
    
    # Actions (executed in order)
    actions: List[Dict[str, Any]] = []
    
    # Settings
    is_active: bool = True
    run_count: int = 0
    last_run_at: Optional[datetime] = None
    
    # Execution
    stop_on_error: bool = True
    continue_on_error: bool = False
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    
    class Settings:
        name = "automation_rules"
        indexes = [
            "company_id",
            "project_id",
            "trigger_type",
            "is_active",
        ]


class AutomationExecution(Document):
    """Automation Execution Log - Track automation runs"""
    rule_id: str
    company_id: str
    
    # Execution Details
    trigger_type: str
    triggered_by: Optional[str] = None  # User ID or system
    entity_id: Optional[str] = None  # Task ID, etc.
    entity_type: Optional[str] = None  # task, ticket, etc.
    
    # Result
    status: str = "pending"  # pending, success, failed, skipped
    error_message: Optional[str] = None
    
    # Actions Executed
    actions_executed: List[str] = []
    actions_failed: List[str] = []
    
    # Timestamps
    executed_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Settings:
        name = "automation_executions"
        indexes = [
            "rule_id",
            "company_id",
            "status",
            "executed_at",
        ]


