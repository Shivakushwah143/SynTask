import asyncio
from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException, status

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
        task.updated_at = datetime.utcnow()
        await task.save()

        new_status_value = new_status.value if hasattr(new_status, "value") else str(new_status)
        if old_status != new_status_value:
            asyncio.create_task(
                trigger_automation(
                    trigger_type="status_changed",
                    entity_type="task",
                    entity_id=str(task.id),
                    company_id=task.company_id,
                    changed_fields={"status": {"from": old_status, "to": new_status_value}},
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
                "logged_at": datetime.utcnow(),
            }
            task.time_logs = list(task.time_logs or []) + [entry]
            task.actual_hours = float(task.actual_hours or 0) + hours
        task.updated_at = datetime.utcnow()
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
            if task.due_date and task.status != TaskStatus.COMPLETED and task.due_date < datetime.utcnow():
                overdue += 1
        return {
            "total": total,
            "by_status": by_status,
            "by_priority": by_priority,
            "by_assignee": assigned,
            "overdue": overdue,
        }
