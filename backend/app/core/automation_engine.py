"""
Automation Engine - Execute automation rules like Jira Automation
"""
import logging
from datetime import datetime
from typing import Dict, Any, Optional

from app.models.automation import AutomationRule, AutomationExecution, AutomationTriggerType, AutomationActionType
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.user import User
from app.models.notification import Notification, NotificationType
from app.core.clock import utc_now

logger = logging.getLogger(__name__)


class AutomationEngine:
    """Engine to execute automation rules"""
    
    @staticmethod
    async def execute_rule(rule: AutomationRule, trigger_data: Dict[str, Any]) -> bool:
        """
        Execute an automation rule
        
        Args:
            rule: AutomationRule to execute
            trigger_data: Data from the trigger (e.g., task data)
        
        Returns:
            bool: True if successful, False otherwise
        """
        
        
        try:
            # Check conditions
            if not await AutomationEngine._check_conditions(rule.conditions, trigger_data):
                logger.info(f"Rule {rule.id} conditions not met, skipping")
                return False
            
            # Execute actions
            execution = AutomationExecution(
                rule_id=str(rule.id),
                company_id=rule.company_id,
                trigger_type=rule.trigger_type.value,
                entity_id=trigger_data.get("entity_id"),
                entity_type=trigger_data.get("entity_type"),
                status="pending",
            )
            await execution.insert()
            
            actions_executed = []
            actions_failed = []
            
            for action in rule.actions:
                try:
                    await AutomationEngine._execute_action(action, trigger_data)
                    actions_executed.append(action.get("type", "unknown"))
                except Exception as e:
                    logger.error(f"Failed to execute action {action}: {str(e)}")
                    actions_failed.append(action.get("type", "unknown"))
                    if rule.stop_on_error:
                        break
            
            # Update execution
            execution.status = "success" if not actions_failed else "failed"
            execution.actions_executed = actions_executed
            execution.actions_failed = actions_failed
            if actions_failed:
                execution.error_message = f"Failed actions: {', '.join(actions_failed)}"
            await execution.save()
            
            # Update rule statistics
            rule.run_count += 1
            rule.last_run_at = utc_now()
            await rule.save()
            
            return len(actions_failed) == 0
            
        except Exception as e:
            logger.error(f"Error executing rule {rule.id}: {str(e)}")
            return False
    
    @staticmethod
    async def _check_conditions(conditions: list, trigger_data: Dict[str, Any]) -> bool:
        """Check if all conditions are met"""
        if not conditions:
            return True
        
        for condition in conditions:
            condition_type = condition.get("type")
            
            if condition_type == "field_equals":
                field = condition.get("field")
                value = condition.get("value")
                if trigger_data.get(field) != value:
                    return False
            
            elif condition_type == "field_contains":
                field = condition.get("field")
                value = condition.get("value")
                field_value = trigger_data.get(field, "")
                if value not in str(field_value):
                    return False
            
            elif condition_type == "user_is":
                field = condition.get("field")
                user_id = condition.get("user_id")
                if trigger_data.get(field) != user_id:
                    return False
            
            elif condition_type == "priority_is":
                priority = condition.get("priority")
                if trigger_data.get("priority") != priority:
                    return False
            
            elif condition_type == "status_is":
                status = condition.get("status")
                if trigger_data.get("status") != status:
                    return False
        
        return True
    
    @staticmethod
    async def _execute_action(action: Dict[str, Any], trigger_data: Dict[str, Any]):
        """Execute a single action"""
        action_type = action.get("type")
        
        if action_type == AutomationActionType.ASSIGN_TASK.value:
            await AutomationEngine._assign_task(action, trigger_data)
        
        elif action_type == AutomationActionType.CHANGE_STATUS.value:
            await AutomationEngine._change_status(action, trigger_data)
        
        elif action_type == AutomationActionType.SET_PRIORITY.value:
            await AutomationEngine._set_priority(action, trigger_data)
        
        elif action_type == AutomationActionType.ADD_COMMENT.value:
            await AutomationEngine._add_comment(action, trigger_data)
        
        elif action_type == AutomationActionType.SEND_NOTIFICATION.value:
            await AutomationEngine._send_notification(action, trigger_data)
        
        elif action_type == AutomationActionType.UPDATE_FIELD.value:
            await AutomationEngine._update_field(action, trigger_data)
    
    @staticmethod
    async def _assign_task(action: Dict[str, Any], trigger_data: Dict[str, Any]):
        """Assign task to a user through the unified authoritative assign_task service."""
        task_id = trigger_data.get("entity_id")
        assignee_id = action.get("assignee_id")

        if not task_id or not assignee_id:
            return

        actor_id = trigger_data.get("user_id")
        actor = await User.get(actor_id) if actor_id else None
        if not actor:
            raise ValueError("Automation assignment requires the triggering user")

        from app.services.task_workflow import assign_task
        await assign_task(
            task_id=task_id,
            assignee_id=assignee_id,
            actor=actor,
        )
    
    @staticmethod
    async def _change_status(action: Dict[str, Any], trigger_data: Dict[str, Any]):
        """Change task status"""
        task_id = trigger_data.get("entity_id")
        new_status = action.get("status")
        
        if not task_id or not new_status:
            return
        
        task = await Task.get(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")
        actor_id = trigger_data.get("user_id")
        actor = await User.get(actor_id) if actor_id else None
        if not actor:
            raise ValueError("Automation status changes require the triggering user")
        if str(actor.company_id) != str(task.company_id):
            raise PermissionError("Automation actor cannot change a task outside its company")
        from app.services.task_workflow import action_for_status_transition, transition_task

        target = TaskStatus(new_status.lower())
        await transition_task(
            task=task,
            actor=actor,
            action=action_for_status_transition(task.status, target),
            target_status=target.value,
        )
    
    @staticmethod
    async def _set_priority(action: Dict[str, Any], trigger_data: Dict[str, Any]):
        """Set task priority"""
        task_id = trigger_data.get("entity_id")
        priority = action.get("priority")
        
        if not task_id or not priority:
            return
        
        task = await Task.get(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")
        task.priority = TaskPriority(priority.lower())
        task.updated_at = utc_now()
        await task.save()
    
    @staticmethod
    async def _add_comment(action: Dict[str, Any], trigger_data: Dict[str, Any]):
        """Add comment to task"""
        task_id = trigger_data.get("entity_id")
        comment = action.get("comment")
        
        if not task_id or not comment:
            return
        
        from app.models.task import TaskComment
        from app.models.user import User
        
        user_id = trigger_data.get("user_id", "system")
        user = await User.get(user_id) if user_id != "system" else None
        
        task_comment = TaskComment(
            task_id=task_id,
            company_id=trigger_data.get("company_id"),
            user_id=user_id,
            user_name=user.full_name() if user else "System",
            content=comment,
        )
        await task_comment.insert()
    
    @staticmethod
    async def _send_notification(action: Dict[str, Any], trigger_data: Dict[str, Any]):
        """Send notification"""
        user_id = action.get("user_id") or trigger_data.get("assigned_to")
        title = action.get("title", "Notification")
        message = action.get("message", "")
        
        if not user_id:
            return
        
        notification = Notification(
            user_id=user_id,
            company_id=trigger_data.get("company_id"),
            type=NotificationType.TASK_UPDATE,
            title=title,
            message=message,
            action_url=action.get("action_url"),
        )
        await notification.insert()
    
    @staticmethod
    async def _update_field(action: Dict[str, Any], trigger_data: Dict[str, Any]):
        """Update a field on the task"""
        task_id = trigger_data.get("entity_id")
        field = action.get("field")
        value = action.get("value")
        
        if not task_id or not field:
            return

        if field in {
            "status",
            "completed_at",
            "completed_by",
            "reviewer_id",
            "review_required",
            "approved_at",
            "approved_by",
            "submitted_for_review_at",
            "submitted_for_review_by",
            "revision_requested_at",
            "revision_requested_by",
            "latest_revision_reason",
            "status_changed_at",
        }:
            raise ValueError(f"Automation cannot directly mutate workflow field: {field}")
        
        task = await Task.get(task_id)
        if task and hasattr(task, field):
            setattr(task, field, value)
            task.updated_at = utc_now()
            await task.save()


# Global instance
automation_engine = AutomationEngine()



