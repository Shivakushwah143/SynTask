import asyncio
from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException, status
from app.core.clock import parse_to_utc, utc_now
from app.models.user import User

from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.services.automation_service import trigger_automation


class TaskService:
    @staticmethod
    async def resolve_project(project_identifier: Optional[str], company_id: str) -> tuple[Optional[str], Optional[str]]:
        if not project_identifier:
            return None, None

        project = await Project.find_one(Project.project_id == project_identifier, Project.company_id == company_id)
        if not project:
            try:
                ObjectId(project_identifier)
                candidate = await Project.get(project_identifier)
                if candidate and candidate.company_id == company_id:
                    project = candidate
            except Exception:
                project = None
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project.project_id or str(project.id), str(project.id)

    @staticmethod
    async def update_status(task: Task, new_status: TaskStatus, user_id: Optional[str] = None) -> Task:
        old_status = task.status.value if hasattr(task.status, "value") else str(task.status)
        task.status = new_status
        status_value = new_status.value if hasattr(new_status, "value") else str(new_status)
        if status_value.lower() in {"completed", "complete", "done"}:
            task.completed_at = utc_now()
        else:
            task.completed_at = None
        task.updated_at = utc_now()
        await task.save()
        from app.services.task_health_service import sync_task_health
        await sync_task_health(task)

        if old_status != status_value:
            asyncio.create_task(
                trigger_automation(
                    trigger_type="status_changed",
                    entity_type="task",
                    entity_id=str(task.id),
                    company_id=task.company_id,
                    changed_fields={"status": {"from": old_status, "to": status_value}},
                    user_id=user_id,
                )
            )
        return task

    @staticmethod
    async def update_execution(task: Task, payload: dict[str, Any]) -> Task:
        if "progress_percentage" in payload and payload["progress_percentage"] is not None:
            progress = float(payload["progress_percentage"])
            if progress < 0 or progress > 100:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Progress must be between 0 and 100")
            task.progress_percentage = progress
        if "expected_completion_time" in payload:
            task.expected_completion_time = payload["expected_completion_time"]
        if "checklist" in payload and payload["checklist"] is not None:
            checklist = payload["checklist"]
            if not isinstance(checklist, list):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checklist must be a list")
            task.checklist = checklist
        if "dependencies" in payload and payload["dependencies"] is not None:
            dependencies = payload["dependencies"]
            if not isinstance(dependencies, list):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dependencies must be a list")
            task.dependencies = [str(item) for item in dependencies if str(item).strip()]
        if "time_log_hours" in payload and payload["time_log_hours"] is not None:
            hours = float(payload["time_log_hours"])
            entry = {
                "hours": hours,
                "note": payload.get("time_log_note"),
                "logged_at": utc_now(),
            }
            task.time_logs = list(task.time_logs or []) + [entry]
            task.actual_hours = float(task.actual_hours or 0) + hours
        task.updated_at = utc_now()
        await task.save()
        return task

    @staticmethod
    def workload_snapshot(tasks: list[Task]) -> dict[str, Any]:
        total = len(tasks)
        by_status: dict[str, int] = {}
        by_priority: dict[str, int] = {}
        assigned: dict[str, int] = {}
        overdue = 0
        for task in tasks:
            status_key = task.status.value if getattr(task, "status", None) else "unknown"
            priority_key = task.priority.value if getattr(task, "priority", None) else "unknown"
            by_status[status_key] = by_status.get(status_key, 0) + 1
            by_priority[priority_key] = by_priority.get(priority_key, 0) + 1
            if task.assigned_to:
                assigned[str(task.assigned_to)] = assigned.get(str(task.assigned_to), 0) + 1
            if task.due_date and task.status != TaskStatus.COMPLETED and task.due_date < utc_now():
                overdue += 1
        return {
            "total": total,
            "by_status": by_status,
            "by_priority": by_priority,
            "by_assignee": assigned,
            "overdue": overdue,
        }

    @staticmethod
    async def create_task_core(
        *,
        title: str,
        description: Optional[str] = None,
        assigned_to: Optional[str] = None,
        priority: str = "medium",
        due_date: Optional[str] = None,
        tags: Optional[str] = None,
        parent_task_id: Optional[str] = None,
        project_id: Optional[str] = None,
        epic_id: Optional[str] = None,
        sprint_id: Optional[str] = None,
        department_id: Optional[str] = None,
        story_points: Optional[int] = None,
        estimated_hours: Optional[float] = None,
        task_type: str = "standard",
        measurement_type: Optional[str] = None,
        custom_measurement_label: Optional[str] = None,
        target_quantity: Optional[int] = None,
        target_unit: Optional[str] = None,
        current_user: User,
        background_tasks = None
    ) -> dict:
        from fastapi import HTTPException, status
        from app.models.task import Task, TaskPriority, TaskStatus, TaskType
        from app.models.user import User, UserRole
        from app.models.timeline import TimelineEventType, TimelineModule
        from app.services.timeline_service import create_timeline_event
        from app.services.task_health_service import sync_task_health
        from app.api.v1.endpoints.tasks import (
            _resolve_department,
            _assert_can_assign_task,
            _can_access_project_for_task,
            _send_task_side_effects,
        )

        if not current_user.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User must belong to a company"
            )
        if current_user.role not in {UserRole.ADMIN, UserRole.MANAGER, UserRole.LEAD, UserRole.SUPER_ADMIN}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to create tasks",
            )

        try:
            task_priority = TaskPriority(priority.lower())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority. Must be one of: {[p.value for p in TaskPriority]}"
            )

        parsed_due_date = None
        if due_date:
            try:
                parsed_due_date = parse_to_utc(due_date)
            except:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid due date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)"
                )

        parsed_tags = []
        if tags:
            try:
                parsed_tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
            except:
                parsed_tags = []

        project_id = project_id.strip() if project_id and project_id.strip() else None
        original_project_id_from_request = project_id
        epic_id = epic_id.strip() if epic_id and epic_id.strip() else None
        sprint_id = sprint_id.strip() if sprint_id and sprint_id.strip() else None
        parent_task_id = parent_task_id.strip() if parent_task_id and parent_task_id.strip() else None
        assigned_to = assigned_to.strip() if assigned_to and assigned_to.strip() else None

        assignee = None
        if assigned_to:
            assignee = await User.get(assigned_to)
            if not assignee:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Assigned user not found"
                )
            if assignee.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Assigned user must be from the same company"
                )
            await _assert_can_assign_task(current_user, assignee)

        project = None
        if project_id:
            from app.api.dependencies import get_project_by_id
            import logging
            logger = logging.getLogger(__name__)

            project, user_project_id = await get_project_by_id(project_id, current_user.company_id)

            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Project not found with id: {project_id}"
                )

            if project.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to this project"
                )
            if not await _can_access_project_for_task(current_user, project):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You cannot create tasks in this project",
                )

            def looks_like_objectid(s):
                return s and len(s) == 24 and all(c in "0123456789abcdef" for c in s.lower())

            if original_project_id_from_request and not looks_like_objectid(original_project_id_from_request):
                project_id = original_project_id_from_request
            elif user_project_id:
                project_id = user_project_id
            else:
                project_id = str(project.id)

        if epic_id:
            from app.models.project import Epic
            epic = await Epic.get(epic_id)
            if not epic or epic.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Epic not found"
                )

        if sprint_id:
            from app.models.project import Sprint
            sprint = await Sprint.get(sprint_id)
            if not sprint or sprint.company_id != current_user.company_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Sprint not found"
                )

        department_doc = await _resolve_department(current_user.company_id, department_id)

        task = Task(
            title=title,
            description=description,
            company_id=current_user.company_id,
            created_by=str(current_user.id),
            assigned_to=assigned_to,
            assigned_by=str(current_user.id) if assignee else None,
            department_id=department_id if department_doc else None,
            department=department_doc.name if department_doc else None,
            priority=task_priority,
            due_date=parsed_due_date,
            tags=parsed_tags,
            parent_task_id=parent_task_id,
            project_id=project_id,
            epic_id=epic_id,
            sprint_id=sprint_id,
            story_points=story_points,
            estimated_hours=estimated_hours,
            task_type=TaskType(task_type) if task_type else TaskType.STANDARD,
            measurement_type=measurement_type,
            custom_measurement_label=custom_measurement_label,
            target_quantity=target_quantity,
            target_unit=target_unit,
        )

        await task.insert()
        await sync_task_health(task)

        if task.assigned_to:
            await create_timeline_event(
                user_id=task.assigned_to,
                company_id=task.company_id,
                event_type=TimelineEventType.TASK_ASSIGNED,
                title="Task Assigned",
                description=task.title,
                related_module=TimelineModule.TASK,
                related_record_id=str(task.id),
                actor_id=str(current_user.id),
                metadata={"task_title": task.title, "project_id": task.project_id, "priority": task.priority.value},
                idempotency_key=f"task:{task.id}:assigned:{task.assigned_to}",
            )

        if background_tasks:
            background_tasks.add_task(
                _send_task_side_effects, task, current_user, assignee, project
            )
        else:
            await _send_task_side_effects(task, current_user, assignee, project)

        return {
            "id": str(task.id),
            "title": task.title,
            "status": task.status.value,
            "priority": task.priority.value,
            "assigned_to": task.assigned_to,
            "created_by": task.created_by,
            "project_id": str(task.project_id) if task.project_id else None,
            "department_id": task.department_id,
            "department": task.department,
            "due_date": task.due_date,
            "health_status": getattr(task.health_status, "value", task.health_status),
            "extension_count": getattr(task, "extension_count", 0),
            "created_at": task.created_at,
            "message": "Task created successfully",
            "task_id": str(task.id)
        }

